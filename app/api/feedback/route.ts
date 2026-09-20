import {z} from 'zod';
import {db} from '@/lib/db';
import {readEmailToken,emailOrigin} from '@/lib/email-links';
import {checkOrigin,rateLimit,apiError} from '@/lib/security';
import {enqueueEmail,getCommunications} from '@/lib/communications';
import {emailTemplate,emailButton,escapeHtml} from '@/lib/email-templates';
import {drainOutbox} from '@/lib/email';
import {after} from 'next/server';
const schema=z.object({token:z.string().max(2000),action:z.enum(['read','submit']),rating:z.number().int().min(1).max(5).optional(),message:z.string().trim().max(4000).default(''),contactRequested:z.boolean().default(false)});
export async function POST(req:Request){try{
 checkOrigin(req);await rateLimit(req,'feedback',30);const input=schema.parse(await req.json());const id=await readEmailToken('feedback',input.token);
 if(!id)throw new Error('This feedback link is invalid or expired. Please contact our team.');
 const sql=db(),[booking]=await sql`select b.reference,b.status,c.name from bookings b join customers c on c.id=b.customer_id where b.id=${id}`;
 if(!booking||booking.status!=='completed')throw new Error('This feedback link is not available. Please contact our team.');
 const config=await getCommunications(sql);
 if(input.action==='submit'){
  if(!input.rating)throw new Error('Please select a rating.');
  await sql.begin(async tx=>{
   await tx`insert into booking_feedback(booking_id,rating,message,contact_requested) values(${id},${input.rating!},${input.message},${input.contactRequested}) on conflict(booking_id) do update set rating=excluded.rating,message=excluded.message,contact_requested=excluded.contact_requested,updated_at=now()`;
   await enqueueEmail(tx,{key:`feedback-received:${id}`,to:config.ownerEmail,subject:`Customer feedback — ${booking.reference}`,html:emailTemplate('New customer feedback.',`<p>${escapeHtml(booking.name)} shared feedback for ${escapeHtml(booking.reference)}.</p><p>Rating: ${input.rating}/5. ${input.contactRequested?'They asked you to contact them.':''}</p><p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>${emailButton(emailOrigin()+'/control-room','View customer feedback')}`),kind:'owner_feedback'});
  });
  after(()=>drainOutbox());
 }
 const [feedback]=await sql`select rating,message,contact_requested from booking_feedback where booking_id=${id}`;
 return Response.json({reference:booking.reference,feedback:feedback||null,reviewUrl:config.reviewUrl},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
