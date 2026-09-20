import {db} from './db';
import {textFromHtml} from './email-templates';
import {emailStillRelevant,getCommunications} from './communications';
export {escapeHtml} from './email-templates';
export class EmailError extends Error{constructor(public status:number){super(`Email provider returned ${status}`);}}
export async function sendEmail(to:string,subject:string,html:string,key:string,text?:string,headers?:Record<string,string>){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new Error('Email is not configured.');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,html,text:text||textFromHtml(html),headers,reply_to:process.env.SUPPORT_EMAIL||undefined}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new EmailError(r.status);const result=await r.json();return String(result.id);
}
export async function drainOutbox(options:{sql?:ReturnType<typeof db>;transport?:typeof sendEmail;bookingOpen?:boolean}={}){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return {sent:0};
 const sql=options.sql||db(),config=await getCommunications(sql);let sent=0;
 // Resend retains idempotency keys for 24h. Never retry an ambiguous send past 23h.
 await sql`update email_outbox set status='failed',last_error='Retry window ended; inspect delivery status before retrying.' where status in ('pending','sending') and (attempts>=10 or first_attempt_at<now()-interval '23 hours')`;
 await sql`update email_outbox set status='suppressed',last_error='This timed message is no longer relevant.' where status='pending' and expires_at<=now()`;
 for(let n=0;n<8;n++){
  const [item]=await sql`update email_outbox set status='sending',locked_at=now(),first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1 where id in (select id from email_outbox where (status='pending' or (status='sending' and locked_at<now()-interval '5 minutes')) and send_after<=now() and attempts<10 order by case when kind='recovery' then 2 when kind='feedback' then 1 else 0 end,send_after limit 1 for update skip locked) returning *`;
  if(!item)break;
  try{
   const {canBook}=await import('./config');
   if((item.kind==='recovery'&&!(options.bookingOpen??canBook()))||!await emailStillRelevant(sql,item,config)){await sql`update email_outbox set status='suppressed',last_error='Message no longer matches booking, consent, or availability.' where id=${item.id}`;continue;}
   const id=await (options.transport||sendEmail)(item.recipient,item.subject,item.html,item.id,item.plain_text,item.headers);
   await sql`update email_outbox set status='sent',sent_at=now(),provider_id=${id},last_error=null where id=${item.id}`;sent++;
  }catch(error){
   const permanent=error instanceof EmailError&&[400,401,403,404,409,422].includes(error.status);
   await sql`update email_outbox set status=${permanent?'failed':'pending'},send_after=now()+${Math.min(120,5*2**Math.min(item.attempts-1,5))}*interval '1 minute',last_error=${permanent?'Provider rejected message; check email configuration.':'Delivery not confirmed; retry scheduled.'} where id=${item.id}`;
  }
 }
 return {sent};
}
