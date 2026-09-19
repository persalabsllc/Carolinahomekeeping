import {isDeepStrictEqual} from 'node:util';
import {cookies} from 'next/headers';
import {db} from '@/lib/db';
import {bookingSchema} from '@/lib/validation';
import {getConfig,canBook} from '@/lib/config';
import {calculateQuote} from '@/lib/pricing';
import {checkOrigin,rateLimit,hash,apiError} from '@/lib/security';
import {stripe,createStripeSession} from '@/lib/payments';
export async function POST(req:Request){try{
 checkOrigin(req);if(!canBook())throw new Error('Online booking is not open yet. Please send us your details for scheduling.');
 await rateLimit(req,'checkout',12);const raw=await req.json();const input=bookingSchema.parse(raw);const config=await getConfig();const quote=calculateQuote(input,config);
 if(quote.review)throw new Error('Please request a personal review before booking this home.');
 if(quote.total!==raw.expectedTotal)return Response.json({error:'Your price has changed. Please reload to review the current price before paying.'},{status:409});
 const leadToken=(await cookies()).get('ch_lead')?.value;if(!leadToken)throw new Error('Please return to your contact details and continue again.');
 const sql=db();const [lead]=await sql`select * from leads where token_hash=${hash(leadToken)} and status!='converted'`;
 if(!lead)throw new Error('Please return to your contact details and continue again.');
 const [existing]=await sql`select * from checkout_holds where lead_id=${lead.id} and status in ('creating','open')`;
 if(existing){
  if(isDeepStrictEqual(existing.payload,input)&&existing.quote.total===quote.total){
   const session=existing.stripe_session_id?await stripe().checkout.sessions.retrieve(existing.stripe_session_id):await createStripeSession(existing);
   if(session.status==='open'&&session.url)return Response.json({url:session.url});
   if(session.payment_status==='paid')throw new Error('This booking has already been paid. Check your confirmation email.');
  }
  if(!existing.stripe_session_id)throw new Error('Payment is still being prepared. Please wait a moment and try again.');
  const session=await stripe().checkout.sessions.retrieve(existing.stripe_session_id);
  if(session.payment_status==='paid')throw new Error('This booking has already been paid. Check your confirmation email.');
  if(session.status==='open')await stripe().checkout.sessions.expire(session.id);
  await sql`update checkout_holds set status='expired' where id=${existing.id} and status in ('creating','open')`;
 }
 const hold=await sql.begin(async tx=>{
  // Serialize repeated checkout attempts, then reserve the appointment capacity atomically.
  const [lockedLead]=await tx`select id,status from leads where id=${lead.id} for update`;
  if(!lockedLead||lockedLead.status==='converted')throw new Error('This booking has already been paid. Check your confirmation email.');
  const [pending]=await tx`select id from checkout_holds where lead_id=${lead.id} and status in ('creating','open')`;
  if(pending)throw new Error('Payment is already being prepared. Please wait a moment and try again.');
  const [slot]=await tx`select * from appointment_slots where id=${input.slotId} for update`;
  if(!slot||slot.blocked||new Date(slot.starts_at).getTime()<Date.now()+config.leadHours*3600000)throw new Error('That appointment is no longer available. Please choose another time.');
  const [usage]=await tx`select (select count(*) from bookings where slot_id=${slot.id} and status not in ('cancelled','refunded'))+(select count(*) from checkout_holds where slot_id=${slot.id} and status in ('creating','open')) as used`;
  if(Number(usage.used)>=slot.capacity)throw new Error('That appointment was just reserved. Please choose another time.');
  const [h]=await tx`insert into checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote) values(${lead.id},${slot.id},${hash(leadToken)},'creating',now()+interval '35 minutes',${tx.json(input)},${tx.json(quote)}) returning *`;
  await tx`update leads set stage='checkout',quoted_amount=${quote.total},updated_at=now() where id=${lead.id}`;
  return h;
 });
 // A failure here retains capacity. Reconciliation resolves ambiguous provider responses safely.
 const session=await createStripeSession(hold);return Response.json({url:session.url});
 }catch(e){return apiError(e);}}
