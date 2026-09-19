import Stripe from 'stripe';
import {randomBytes} from 'node:crypto';
import {db} from './db';
import {money,serviceNames,frequencyNames,type Quote} from './pricing';
import type {BookingInput} from './validation';
import {escapeHtml} from './email';
let stripeClient:Stripe|undefined;
export function stripe(){if(!process.env.STRIPE_SECRET_KEY)throw new Error('Payment setup is not complete.');return stripeClient??=new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:15000});}
export async function createStripeSession(hold:Record<string,any>){
 const input=hold.payload as BookingInput;const quote=hold.quote as Quote;
 const origin=process.env.APP_URL;if(!origin)throw new Error('Payment setup is not complete.');
 // The original expiry must be reused with the idempotency key on retries.
 const session=await stripe().checkout.sessions.create({
  mode:'payment',payment_method_types:['card'],customer_email:input.contact.email,
  line_items:[{price_data:{currency:'usd',unit_amount:quote.total,product_data:{name:`Carolina Homekeeping — ${serviceNames[input.service]}`,description:`${frequencyNames[input.frequency]}. Includes selected extras${quote.tax?` and ${money(quote.tax)} tax`:''}.`}},quantity:1}],
  expires_at:Math.floor(new Date(hold.expires_at).getTime()/1000),
  success_url:`${origin}/booking/confirmed?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/booking/cancelled`,
  client_reference_id:hold.id,metadata:{app:'carolina-homekeeping',hold_id:hold.id},
  payment_intent_data:{metadata:{app:'carolina-homekeeping',hold_id:hold.id}},
  custom_text:{submit:{message:'Your cleaning is confirmed after successful payment. Cancellation and service policies accepted at booking apply.'}},
 },{idempotencyKey:`ch-checkout-${hold.id}`});
 await db()`update checkout_holds set stripe_session_id=${session.id},stripe_url=${session.url},status=case when status='creating' then 'open' else status end where id=${hold.id}`;
 return session;
}
export async function fulfillSession(session:Stripe.Checkout.Session){
 if(session.metadata?.app!=='carolina-homekeeping'||session.payment_status!=='paid'||!session.metadata.hold_id)return null;
 const sql=db();
 return sql.begin(async tx=>{
  const [hold]=await tx`select * from checkout_holds where id=${session.metadata!.hold_id} for update`;
  if(!hold)throw new Error('Unknown checkout hold.');
  if(session.amount_total!==hold.quote.total||session.currency!=='usd')throw new Error('Payment amount mismatch.');
  if(hold.stripe_session_id&&hold.stripe_session_id!==session.id)throw new Error('Payment session mismatch.');
  const [existing]=await tx`select * from bookings where hold_id=${hold.id}`;
  if(existing)return existing;
  const [slot]=await tx`select * from appointment_slots where id=${hold.slot_id} for update`;
  if(!slot)throw new Error('Appointment is missing.');
  const input=hold.payload as BookingInput;const quote=hold.quote as Quote;
  const [customer]=await tx`insert into customers(name,email,phone) values(${input.contact.name},${input.contact.email},${input.contact.phone}) on conflict(email) do update set name=excluded.name,phone=excluded.phone,updated_at=now() returning *`;
  const profile={sqft:input.sqft,bedrooms:input.bedrooms,bathrooms:input.bathrooms,pets:input.pets,access:input.home.access,instructions:input.home.instructions,photoConsent:input.photoConsent};
  const [home]=await tx`insert into homes(customer_id,address,city,zip,profile) values(${customer.id},${input.home.address},${input.home.city},${input.zip},${tx.json(profile)}) on conflict(customer_id,address,zip) do update set city=excluded.city,profile=excluded.profile returning *`;
  let planId=null;
  if(input.frequency!=='once'){
   const [plan]=await tx`insert into recurring_plans(customer_id,home_id,frequency,preferences) values(${customer.id},${home.id},${input.frequency},${tx.json({service:input.service,addons:input.addons})}) returning id`;planId=plan.id;
  }
  const reference='CH-'+randomBytes(4).toString('hex').toUpperCase();
  const [booking]=await tx`insert into bookings(reference,customer_id,home_id,slot_id,hold_id,recurring_plan_id,service,frequency,amount,quote,details,stripe_session_id,stripe_payment_intent) values(${reference},${customer.id},${home.id},${slot.id},${hold.id},${planId},${input.service},${input.frequency},${quote.total},${tx.json(quote)},${tx.json(input)},${session.id},${typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null}) returning *`;
  await tx`update checkout_holds set status='paid',stripe_session_id=${session.id} where id=${hold.id}`;
  await tx`update leads set status='converted',stage='paid',updated_at=now() where id=${hold.lead_id}`;
  await tx`insert into booking_events(booking_id,event,actor,details) values(${booking.id},'payment_confirmed','stripe',${tx.json({sessionId:session.id,amount:quote.total})})`;
  const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(slot.starts_at));
  const time=(d:Date)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(d));
  const html=`<div style="font-family:Arial,sans-serif;color:#07364b;max-width:620px;margin:auto;padding:30px"><h1>Your home is handled.</h1><p>Hi ${escapeHtml(input.contact.name)}, your cleaning is confirmed.</p><p><strong>${reference}</strong></p><p>${escapeHtml(serviceNames[input.service])}<br>${date}<br>Arrival: ${time(slot.starts_at)}–${time(slot.ends_at)} Eastern</p><p>${escapeHtml(input.home.address)}, ${escapeHtml(input.home.city)}, NC ${input.zip}</p><p><strong>Paid: ${money(quote.total)}</strong></p>${quote.addons.length?'<p>Extras: '+quote.addons.map(a=>`${a.quantity} × ${escapeHtml(a.name)}`).join(', ')+'</p>':''}${input.frequency!=='once'?'<p>You requested '+frequencyNames[input.frequency].toLowerCase()+'. We’ll coordinate future dates with you. Only this appointment has been charged.</p>':''}<p>Please secure pets and valuables, and make surfaces accessible. This is an arrival window, not the cleaning duration.</p><p>Need to change something? Reply to this email or <a href="${process.env.APP_URL}/contact">contact us</a>. Free cancellation more than 48 hours before arrival; 24–48 hours: 25% or a reschedule credit; less than 24 hours: 50%; no access: up to 100%.</p><p>If an included area was missed, contact us within 24 hours and we’ll arrange a return to correct it.</p><p><a href="${process.env.APP_URL}/policies/cancellation">Cancellation policy</a> · <a href="${process.env.APP_URL}/policies/service">Service policy</a></p><p>Carolina Homekeeping Co.<br>YOUR HOME, HANDLED.</p></div>`;
  await tx`insert into email_outbox(dedupe_key,recipient,subject,html) values(${`confirmation:${booking.id}`},${input.contact.email},${`Your cleaning is confirmed — ${reference}`},${html}) on conflict(dedupe_key) do nothing`;
  return booking;
 });
}
export async function reconcileHolds(){
 const sql=db();const holds=await sql`select * from checkout_holds where status in ('creating','open') and created_at<now()-interval '2 minutes' order by created_at limit 30`;
 for(const hold of holds){try{
  let session:Stripe.Checkout.Session;
  if(hold.stripe_session_id)session=await stripe().checkout.sessions.retrieve(hold.stripe_session_id);
  else { // Recover a network-ambiguous create with the same idempotency key.
   if(new Date(hold.expires_at).getTime()<Date.now()+30*60*1000){
    // List sessions by creation range to locate a completed create whose response was lost.
    const sessions=await stripe().checkout.sessions.list({created:{gte:Math.floor(new Date(hold.created_at).getTime()/1000)-5},limit:100});
    const recovered=sessions.data.find(s=>s.metadata?.hold_id===hold.id);
    if(!recovered){if(!sessions.has_more&&Date.now()>new Date(hold.expires_at).getTime()+60000)await sql`update checkout_holds set status='expired' where id=${hold.id} and status='creating'`;continue;}
    session=recovered;
    await sql`update checkout_holds set stripe_session_id=${session.id},stripe_url=${session.url} where id=${hold.id}`;
   } else session=await createStripeSession(hold);
  }
  if(session.payment_status==='paid')await fulfillSession(session);
  else if(session.status==='expired')await sql`update checkout_holds set status='expired' where id=${hold.id} and status in ('creating','open')`;
 }catch{console.error('Checkout reconciliation requires retry.');}}
}
