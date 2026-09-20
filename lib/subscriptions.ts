import type Stripe from 'stripe';
import {db} from './db';
import {stripe} from './stripe';
import {fulfillSession} from './payments';
import {lockSchedule,getScheduleSnapshot} from './schedule-store';
import {hasSeriesCapacity} from './recurrence';
import {getScheduling} from './schedule-store';
import {applySubscriptionState,materializePlan,recordInvoice,planRule,type Plan,type RenewalInvoice} from './subscription-store';
import {managementLink} from './subscription-tokens';
import {escapeHtml} from './email';
import {money,frequencyNames,type Frequency} from './pricing';
import {localTime} from './scheduling';
export const stripeId=(value:string|{id:string}|null|undefined)=>typeof value==='string'?value:value?.id||null;
export function invoiceData(invoice:Stripe.Invoice,plan:Plan):RenewalInvoice{
 const line=invoice.lines.data.find(l=>l.parent?.type==='subscription_item_details'&&!l.parent.subscription_item_details?.proration);
 return {id:invoice.id,subscriptionId:stripeId(invoice.parent?.subscription_details?.subscription)||'',status:invoice.status||'',amountPaid:invoice.amount_paid,total:invoice.total,currency:invoice.currency,periodStart:line?.period.start||invoice.period_start,initial:invoice.id===plan.initial_invoice_id,paymentIntent:stripeId(invoice.payments?.data.find(p=>p.status==='paid')?.payment.payment_intent),failed:(invoice.status==='open'&&invoice.attempt_count>0)||invoice.status==='uncollectible'||invoice.status==='void'};
}
async function ensurePlan(subscriptionId:string){
 const sql=db();let [plan]=await sql`select * from recurring_plans where stripe_subscription_id=${subscriptionId}`;
 if(plan)return plan;
 const subscription=await stripe().subscriptions.retrieve(subscriptionId);
 if(subscription.metadata.app!=='carolina-homekeeping')return null;
 // Invoice/subscription events can arrive before checkout.session.completed.
 const sessions=await stripe().checkout.sessions.list({subscription:subscriptionId,limit:5});
 const session=sessions.data.find(s=>s.metadata?.app==='carolina-homekeeping'&&s.payment_status==='paid');
 if(!session)throw new Error('Subscription checkout has not completed; retry webhook.');
 await fulfillSession(session);
 [plan]=await sql`select * from recurring_plans where stripe_subscription_id=${subscriptionId}`;
 if(!plan)throw new Error('Subscription plan is not ready; retry webhook.');return plan;
}
export async function syncSubscription(subscriptionId:string){
 const found=await ensurePlan(subscriptionId);if(!found)return null;
 const sql=db();
 return sql.begin(async tx=>{
  await lockSchedule(tx);
  const [plan]=await tx`select * from recurring_plans where id=${found.id} for update`;
  // Fetch after acquiring the lock: an older webhook cannot undo a newer cancellation.
  const subscription=await stripe().subscriptions.retrieve(subscriptionId);
  const end=subscription.cancel_at||(subscription.cancel_at_period_end?subscription.items.data[0]?.current_period_end:null);
  const cancelAt=end?new Date(end*1000).toISOString():null;
  let status=String(subscription.status);
  const item=subscription.items.data[0];
  const mismatch=item&&(item.quantity!==1||item.price.unit_amount!==plan.amount||item.price.recurring?.interval!=='week'||item.price.recurring.interval_count!==plan.interval_weeks||item.price.currency!=='usd');
  let conflict=false;
  if(plan.cancel_at&&(!cancelAt||cancelAt>new Date(plan.cancel_at).toISOString())&&status!=='canceled'){
   const snapshot=await getScheduleSnapshot(tx),own=await tx`select id from bookings where recurring_plan_id=${plan.id}`;
   const ids=new Set(own.map(b=>String(b.id)));
   const other={fixed:snapshot.fixed.filter(o=>!ids.has(o.id)),series:snapshot.series.filter(s=>s.planId!==plan.id),overrides:snapshot.overrides.filter(o=>o.planId!==plan.id)};
   conflict=!hasSeriesCapacity({...planRule(plan),endBefore:cancelAt},other,(await getScheduling(tx)).teamCapacity);
  }
  if((mismatch||conflict||plan.status==='schedule_issue')&&status!=='canceled'){
   // Do not collect for a changed plan or a reactivated time we cannot fulfill.
   await stripe().subscriptions.update(subscriptionId,{pause_collection:{behavior:'void'}},{idempotencyKey:`ch-plan-pause-${plan.id}`});status='schedule_issue';
  }
  await applySubscriptionState(tx,plan,status,cancelAt);
  if(plan.cancel_at&&!cancelAt&&!conflict&&status!=='schedule_issue')await tx`update bookings set status='confirmed',updated_at=now() where recurring_plan_id=${plan.id} and status='cancelled' and payment_status='scheduled' and internal_notes like '%Subscription ended before renewal%'`;
  const updated={...plan,status,cancel_at:cancelAt};await materializePlan(tx,updated);
  if(status!==plan.status||String(cancelAt||'')!==String(plan.cancel_at?new Date(plan.cancel_at).toISOString():'')){
   const message=status==='canceled'?'Your subscription has been canceled. Future automatic charges have stopped. Any prepaid appointments remain subject to the appointment cancellation policy.':status==='schedule_issue'?'Your recurring plan needs scheduling attention. Automatic collection is paused while we resolve it. Please contact us.':cancelAt?'Your subscription is scheduled to end. No new visits will be reserved after its end date. Prepaid appointments remain booked.':'';
   if(message)await tx`insert into email_outbox(dedupe_key,recipient,subject,html) values(${`plan:${plan.id}:${status}:${cancelAt||'none'}`},${plan.details.contact.email},'Your Carolina Homekeeping subscription',${`<p>${message}</p><p><a href="${await managementLink(plan.id)}">Manage your plan</a></p>`}) on conflict(dedupe_key) do nothing`;
  }
  return updated;
 });
}
export async function handleSubscriptionInvoice(invoiceId:string){
 const invoice=await stripe().invoices.retrieve(invoiceId,{expand:['payments.data.payment.payment_intent']});
 const subscriptionId=stripeId(invoice.parent?.subscription_details?.subscription);if(!subscriptionId)return;
 const plan=await ensurePlan(subscriptionId);if(!plan)return;
 if(!['subscription_create','subscription_cycle'].includes(String(invoice.billing_reason)))return;
 const sql=db();await sql.begin(async tx=>{
  await lockSchedule(tx);const [current]=await tx`select * from recurring_plans where id=${plan.id} for update`;
  const result=await recordInvoice(tx,current,invoiceData(invoice,current));if(!result||result.index===0)return;
  const [slot]=await tx`select starts_at,ends_at from appointment_slots where id=${result.booking.slot_id}`;
  const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full'}).format(new Date(slot.starts_at));
  const manage=await managementLink(plan.id);
  const subject=result.paid?(result.cancelled||result.mismatch||result.late?'Your cleaning payment needs review':'Your next cleaning is paid and scheduled'):'Action needed: your cleaning payment';
  const body=result.paid?`<p>We received ${money(invoice.amount_paid)} for your cleaning on ${date}, ${localTime(slot.starts_at)} Eastern.</p>${result.cancelled||result.mismatch||result.late?'<p>Your booking needs our attention. Please contact us before the appointment.</p>':'<p>Your usual cleaning and selected extras are reserved. Your home is handled.</p>'}`:'<p>Your automatic payment did not complete. Your reserved cleaning needs payment before we can provide service. Please update your payment method. If the appointment time has passed, contact us to arrange a new time.</p>';
  await tx`insert into email_outbox(dedupe_key,recipient,subject,html) values(${`renewal:${invoice.id}:${result.paid?'paid':'failed'}`},${plan.details.contact.email},${subject},${`<h1>${escapeHtml(subject)}</h1>${body}<p>${escapeHtml(frequencyNames[plan.frequency as Frequency])} · ${result.booking.reference}</p><p><a href="${manage}">Manage your plan, update payment details or cancel</a></p>`}) on conflict(dedupe_key) do nothing`;
 });
}
export async function reconcileSubscriptions(){
 const plans=await db()`select stripe_subscription_id from recurring_plans where stripe_subscription_id is not null and status not in ('canceled','incomplete_expired') order by last_synced_at nulls first limit 5`;
 for(const plan of plans){try{await syncSubscription(plan.stripe_subscription_id);const invoices=await stripe().invoices.list({subscription:plan.stripe_subscription_id,limit:10});for(const invoice of invoices.data)if(invoice.status==='paid'||invoice.attempt_count>0)await handleSubscriptionInvoice(invoice.id);}catch{console.error('Subscription reconciliation requires retry.')}}
}
export async function cancelSubscription(planId:string){
 const [plan]=await db()`select * from recurring_plans where id=${planId}`;if(!plan?.stripe_subscription_id)throw new Error('No matching subscription.');
 const subscription=await stripe().subscriptions.retrieve(plan.stripe_subscription_id);
 if(subscription.status!=='canceled')await stripe().subscriptions.cancel(plan.stripe_subscription_id,{invoice_now:false,prorate:false},{idempotencyKey:`ch-cancel-${plan.id}`});
 return syncSubscription(plan.stripe_subscription_id);
}
export async function portalSession(planId:string){
 const sql=db();const [plan]=await sql`select * from recurring_plans where id=${planId}`;if(!plan?.stripe_customer_id)throw new Error('No matching subscription.');
 let [setting]=await sql`select value from settings where key='stripe_portal_configuration'`;
 if(!setting){
  const configuration=await stripe().billingPortal.configurations.create({business_profile:{headline:'Your home, handled.',privacy_policy_url:`${process.env.APP_URL}/policies/privacy`,terms_of_service_url:`${process.env.APP_URL}/policies/terms`},features:{payment_method_update:{enabled:true},invoice_history:{enabled:true},subscription_cancel:{enabled:true,mode:'immediately',proration_behavior:'none'},subscription_update:{enabled:false}}},{idempotencyKey:'ch-subscription-portal-v1'});
  await sql`insert into settings(key,value) values('stripe_portal_configuration',${sql.json(configuration.id)}) on conflict(key) do nothing`;
  [setting]=await sql`select value from settings where key='stripe_portal_configuration'`;
 }
 return stripe().billingPortal.sessions.create({customer:plan.stripe_customer_id,configuration:setting.value,return_url:await managementLink(plan.id)});
}
