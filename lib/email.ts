import {db} from './db';
export function escapeHtml(s:string){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export async function sendEmail(to:string,subject:string,html:string,key:string){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new Error('Email is not configured.');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,html,reply_to:process.env.SUPPORT_EMAIL||undefined}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error(`Email provider returned ${r.status}`);
}
export async function drainOutbox(){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return {sent:0};
 const sql=db();let sent=0;
 const items=await sql`update email_outbox set status='sending',locked_at=now(),attempts=attempts+1 where id in (select id from email_outbox where (status='pending' or (status='sending' and locked_at<now()-interval '5 minutes')) and attempts<10 order by created_at limit 15 for update skip locked) returning *`;
 for(const item of items){try{await sendEmail(item.recipient,item.subject,item.html,item.id);await sql`update email_outbox set status='sent',sent_at=now(),last_error=null where id=${item.id}`;sent++;}catch{await sql`update email_outbox set status='pending',last_error='Delivery failed; retry pending.' where id=${item.id}`;}}
 return {sent};
}
