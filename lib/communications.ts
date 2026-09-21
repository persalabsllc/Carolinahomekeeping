import {db} from './db';
import type {ScheduleSql} from './schedule-store';
import {communicationSchema,communicationDefaults,type CommunicationConfig} from './communication-config';
import {emailOrigin,emailToken} from './email-links';
import {emailTemplate,emailButton,escapeHtml,appointmentDetails,ownerBookingEmail,textFromHtml} from './email-templates';
import {calculateQuote,money,type PricingConfig} from './pricing';
import {normalizeEmailHeaders} from './email-headers';
export async function getCommunications(sql:ScheduleSql=db()):Promise<CommunicationConfig>{const [row]=await sql.unsafe("select value from settings where key='communications'");return communicationSchema.parse(row?.value||communicationDefaults);}
type EmailJob={key:string;to:string;subject:string;html:string;kind:string;bookingId?:string;leadId?:string;start?:string;expires?:string;headers?:Record<string,string>};
// Bind serialized JSON as text first: Postgres.js otherwise JSON-encodes the
// already serialized string a second time when the parameter is typed JSONB.
export async function enqueueEmail(sql:ScheduleSql,job:EmailJob){await sql.unsafe(`insert into email_outbox(dedupe_key,recipient,subject,html,plain_text,kind,booking_id,lead_id,scheduled_start,expires_at,headers)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text::jsonb) on conflict(dedupe_key) do nothing`,[job.key,job.to,job.subject,job.html,textFromHtml(job.html),job.kind,job.bookingId||null,job.leadId||null,job.start||null,job.expires||null,JSON.stringify(normalizeEmailHeaders(job.headers))]);}
async function unsubscribeUrl(sql:ScheduleSql,email:string,origin:string){const [p]=await sql.unsafe('insert into email_preferences(email) values($1) on conflict(email) do update set email=excluded.email returning id',[email]);return `${origin}/email/unsubscribe?token=${await emailToken('unsubscribe',p.id,'3650d')}`;}
const iso=(value:any)=>new Date(value).toISOString();
export function reminderDue(start:string,created:string,hours:number,now:Date){const due=Date.parse(start)-hours*3600000;return Date.parse(created)<=due&&now.getTime()>=due&&now.getTime()<due+30*60000;}
// Runs under one advisory transaction lock; unique event keys also protect retries.
export async function queueCommunications(sql:ScheduleSql,config:CommunicationConfig,pricing:PricingConfig,bookingOpen:boolean,now=new Date()){
 const origin=emailOrigin(),nowIso=now.toISOString();
 const bookings=await sql.unsafe(`select b.*,c.name,c.email,c.phone,h.address,h.city,h.zip,s.starts_at,s.ends_at
 from bookings b join customers c on c.id=b.customer_id join homes h on h.id=b.home_id join appointment_slots s on s.id=b.slot_id
 where b.status in ('confirmed','completed') and (b.payment_status in ('paid','partially_refunded') or b.kind='commercial')
 and (b.created_at >= $1 or b.completed_at >= $1 or s.starts_at >= $1) and (s.starts_at > $2::timestamptz-interval '14 days' or b.completed_at > $2::timestamptz-interval '7 days')
 order by s.starts_at limit 1000`,[config.enabledAt,nowIso]);
 for(const b of bookings){
  const start=iso(b.starts_at);
  if(config.ownerAlerts&&b.status==='confirmed')await enqueueEmail(sql,{key:`owner-booking:${b.id}`,to:config.ownerEmail,subject:`New booking — ${b.reference}`,html:ownerBookingEmail(b,origin),kind:'owner_booking',bookingId:b.id,start});
  if(b.kind==='commercial'&&b.status==='confirmed')await enqueueEmail(sql,{key:`commercial-confirmation:${b.id}`,to:b.email,subject:`Your cleaning is scheduled — ${b.reference}`,html:emailTemplate('Your cleaning is scheduled.',`<p>Hi ${escapeHtml(b.name)}, here are the details of your agreed commercial cleaning.</p>${appointmentDetails(b)}<p>Agreed price: ${money(b.amount)}. Payment arrangements remain as agreed with our team.</p>${emailButton(origin+'/contact','Contact our team')}`),kind:'confirmation',bookingId:b.id,start});
  if(config.reminders&&b.status==='confirmed')for(const hours of [12,1])if(reminderDue(start,iso(b.created_at),hours,now)){
   const due=Date.parse(start)-hours*3600000;
   await enqueueEmail(sql,{key:`reminder:${b.id}:${start}:${hours}`,to:b.email,subject:`Your cleaning is in ${hours===1?'1 hour':'12 hours'} — ${b.reference}`,html:emailTemplate('A little reminder. Your home is handled.',`<p>Hi ${escapeHtml(b.name)}, we’re scheduled to clean your home ${hours===1?'in about an hour':'in about 12 hours'}.</p>${appointmentDetails(b)}<p>Please secure pets and valuables and make sure we can access your home at the scheduled start time.</p>${emailButton(origin+'/contact','Contact us about your appointment')}`),kind:'reminder',bookingId:b.id,start,expires:new Date(due+30*60000).toISOString()});
  }
  if(config.followups&&b.status==='completed'&&b.completed_at&&Date.parse(iso(b.completed_at))+config.followupHours*3600000<=now.getTime()&&Date.parse(iso(b.completed_at))>now.getTime()-7*86400000){
   const [pref]=await sql.unsafe('select unsubscribed_at from email_preferences where email=$1',[b.email]);if(pref?.unsubscribed_at)continue;
   const [feedback]=await sql.unsafe('select booking_id from booking_feedback where booking_id=$1',[b.id]);if(feedback)continue;
   const url=origin+'/feedback#token='+await emailToken('feedback',b.id),unsub=await unsubscribeUrl(sql,b.email,origin);
   const review=config.reviewUrl&&config.postalAddress?emailButton(config.reviewUrl,'Leave an honest review'):'';
   const html=emailTemplate('How did we do?',`<p>Hi ${escapeHtml(b.name)}, thank you for trusting Carolina Homekeeping with your cleaning.</p><p>We’d love to hear what went well and where we could do better. Your honest feedback helps us care for your home.</p>${emailButton(url,'Share your feedback')}${review}<p>If an included area was missed, contact us within 24 hours of completion and we’ll arrange a return to correct that area.</p><p><a href="${origin}/contact">Contact our team</a></p>${config.postalAddress?'<p>'+escapeHtml(config.postalAddress)+'</p>':''}<p style="font-size:12px"><a href="${escapeHtml(unsub)}">Unsubscribe from feedback requests and offers</a>. Appointment emails will continue.</p>`);
   await enqueueEmail(sql,{key:`feedback:${b.id}`,to:b.email,subject:`How was your cleaning? — ${b.reference}`,html,kind:'feedback',bookingId:b.id,expires:new Date(Date.parse(iso(b.completed_at))+7*86400000).toISOString(),headers:{'List-Unsubscribe':`<${unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
  }
 }
 // Offers require a payable booking flow and a real business mailing address.
 if(!config.recovery||!config.postalAddress||!bookingOpen)return;
 const leads=await sql.unsafe(`select l.* from leads l where l.type='residential' and l.status='new'
 and l.stage in ('details','payment','checkout') and l.marketing_consent_at is not null and l.created_at >= $1
 and l.updated_at <= $2::timestamptz-($3 * interval '1 hour') and l.updated_at > $2::timestamptz-interval '7 days'
 and not exists(select 1 from recovery_offers o where o.email=l.email)
 and not exists(select 1 from email_preferences p where p.email=l.email and p.unsubscribed_at is not null)
 and not exists(select 1 from customers c join bookings b on b.customer_id=c.id where c.email=l.email)
 and not exists(select 1 from checkout_holds h join leads hl on hl.id=h.lead_id where hl.email=l.email and h.status in ('creating','open','paid'))
 order by l.updated_at limit 30`,[config.enabledAt,nowIso,config.recoveryHours]);
 for(const lead of leads){
  try{if(calculateQuote(lead.payload.quoteInput,pricing).review||!lead.payload.home)continue;}catch{continue;}
  const [offer]=await sql.unsafe(`insert into recovery_offers(lead_id,email,percent,expires_at) values($1,$2,$3,$4) on conflict(email) do nothing returning *`,[lead.id,lead.email,config.offerPercent,new Date(now.getTime()+config.offerDays*86400000).toISOString()]);if(!offer)continue;
  const link=origin+'/book#recovery='+await emailToken('recovery',offer.id,Math.floor(Date.parse(iso(offer.expires_at))/1000));
  const unsub=await unsubscribeUrl(sql,lead.email,origin);
  const html=emailTemplate('Your clean home is one booking away.',`<p>Hi ${escapeHtml(lead.name)}, we noticed you started booking a cleaning but didn’t finish.</p><p>Come back and take <strong>${offer.percent}% off your first visit</strong>, including your selected extras, on top of any recurring savings. Your discount is applied when you return using the link below.</p>${emailButton(link,'Finish my booking & save '+offer.percent+'%')}<p>Choose from the times available when you return. Your earlier appointment was not reserved.</p><p style="font-size:13px">One use for the original recipient’s first booking. Book within ${config.offerDays} days. Applies to the first visit only; future recurring visits use the regular recurring price shown before payment. Current prices and availability apply. No cash value.</p><p style="font-size:12px">A booking offer from Carolina Homekeeping Co.<br>${escapeHtml(config.postalAddress)}<br><a href="${escapeHtml(unsub)}">Unsubscribe from offers and feedback requests</a></p>`);
  await enqueueEmail(sql,{key:`recovery:${lead.email}`,to:lead.email,subject:`Your first cleaning, with ${offer.percent}% off`,html,kind:'recovery',leadId:lead.id,expires:iso(offer.expires_at),headers:{'List-Unsubscribe':`<${unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
 }
}
export async function processCommunications(){const {getConfig,canBook}=await import('./config');const pricing=await getConfig();await db().begin(async tx=>{await tx`select pg_advisory_xact_lock(72901645)`;await queueCommunications(tx,await getCommunications(tx),pricing,canBook());});}
export async function emailStillRelevant(sql:ScheduleSql,item:Record<string,any>,config:CommunicationConfig,now=new Date()){
 if(item.expires_at&&new Date(item.expires_at)<=now)return false;
 if(item.kind==='recovery'){
  if(!config.recovery||!config.postalAddress)return false;
  const [lead]=await sql.unsafe(`select l.* from leads l where id=$1 and status='new' and marketing_consent_at is not null and email=$2
   and updated_at <= $3::timestamptz-($4 * interval '1 hour')
   and not exists(select 1 from recovery_offers o where o.lead_id=l.id and (o.redeemed_at is not null or o.expires_at <= $3))
   and not exists(select 1 from customers c join bookings b on b.customer_id=c.id where c.email=l.email)
   and not exists(select 1 from checkout_holds h join leads hl on hl.id=h.lead_id where hl.email=l.email and h.status in ('creating','open','paid'))`,[item.lead_id,item.recipient,now.toISOString(),config.recoveryHours]);if(!lead)return false;
 }
 if(['feedback','recovery'].includes(item.kind)){const [p]=await sql.unsafe('select unsubscribed_at from email_preferences where email=$1',[item.recipient]);if(p?.unsubscribed_at)return false;}
 if(item.booking_id){
  const [b]=await sql.unsafe('select b.*,s.starts_at from bookings b join appointment_slots s on s.id=b.slot_id where b.id=$1',[item.booking_id]);if(!b)return false;
  if(item.kind==='feedback')return config.followups&&b.status==='completed';
  if(item.kind==='owner_booking'&&!config.ownerAlerts)return false;
  if(item.kind==='reminder'&&(!config.reminders||new Date(b.starts_at)<=now))return false;
  if(b.status!=='confirmed'||(!['paid','partially_refunded'].includes(b.payment_status)&&b.kind!=='commercial'))return false;
  if(item.scheduled_start&&iso(item.scheduled_start)!==iso(b.starts_at))return false;
 }
 return true;
}
