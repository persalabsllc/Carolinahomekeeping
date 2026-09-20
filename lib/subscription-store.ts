import {randomBytes} from 'node:crypto';
import {occurrences,occurrenceStart,occurrenceIndex,type SeriesRule} from './recurrence';
import {localDay,nextDay,dayBounds,appointmentInterval} from './scheduling';
import type {ScheduleSql} from './schedule-store';
export type Plan=Record<string,any>;
export const activePlanStatuses=['trialing','active','past_due','unpaid','paused'];
export function planRule(plan:Plan):SeriesRule{return {id:String(plan.id),planId:String(plan.id),anchorStart:new Date(plan.anchor_start).toISOString(),durationMinutes:Number(plan.duration_minutes),weeks:Number(plan.interval_weeks),kind:'booking',endBefore:plan.cancel_at?new Date(plan.cancel_at).toISOString():null};}
export async function ensureOccurrence(sql:ScheduleSql,plan:Plan,index:number){
 const existing=await sql.unsafe('select * from bookings where recurring_plan_id=$1 and recurrence_index=$2',[plan.id,index]);if(existing[0])return existing[0];
 const interval=appointmentInterval(occurrenceStart(new Date(plan.anchor_start).toISOString(),plan.interval_weeks,index),plan.duration_minutes);
 const released=['canceled','incomplete_expired','schedule_issue'].includes(plan.status)||(plan.cancel_at&&interval.starts_at>=new Date(plan.cancel_at).toISOString());
 const [slot]=await sql.unsafe("insert into appointment_slots(starts_at,ends_at,capacity,label) values($1,$2,1,'Recurring cleaning') on conflict(starts_at,ends_at) do update set label=excluded.label returning id",[interval.starts_at,interval.ends_at]);
 const reference='CH-'+randomBytes(4).toString('hex').toUpperCase();
 const [booking]=await sql.unsafe(`insert into bookings(reference,customer_id,home_id,slot_id,recurring_plan_id,recurrence_index,service,frequency,amount,payment_status,status,quote,details)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled',$12,$10::jsonb,$11::jsonb) on conflict(recurring_plan_id,recurrence_index) where recurring_plan_id is not null do update set updated_at=bookings.updated_at returning *`,[reference,plan.customer_id,plan.home_id,slot.id,plan.id,index,plan.details.service,plan.frequency,plan.amount,JSON.stringify(plan.quote),JSON.stringify({...plan.details,scheduledStart:interval.starts_at}),released?'cancelled':'confirmed']);
 await sql.unsafe("insert into booking_events(booking_id,event,actor) values($1,'recurring_visit_reserved','subscription')",[booking.id]);
 return booking;
}
export async function materializePlan(sql:ScheduleSql,plan:Plan,now=new Date()){
 if(!activePlanStatuses.includes(plan.status)||!plan.anchor_start)return;
 const through=dayBounds(nextDay(localDay(now),120)).starts_at;
 const existing=await sql.unsafe('select recurrence_index from bookings where recurring_plan_id=$1',[plan.id]);
 const indices=new Set(existing.map(b=>Number(b.recurrence_index)));
 for(const occurrence of occurrences(planRule(plan),now.toISOString(),through))if(!indices.has(occurrence.index))await ensureOccurrence(sql,plan,occurrence.index);
}
// Must run under the shared schedule lock. Paid visits survive subscription cancellation.
export async function applySubscriptionState(sql:ScheduleSql,plan:Plan,status:string,cancelAt:string|null){
 await sql.unsafe('update recurring_plans set status=$2,cancel_at=$3,last_synced_at=now(),updated_at=now() where id=$1',[plan.id,status,cancelAt]);
 if(status==='canceled'||status==='incomplete_expired'||cancelAt){
  await sql.unsafe(`update bookings b set status='cancelled',updated_at=now(),internal_notes=concat_ws(E'\n',nullif(internal_notes,''),'Subscription ended before renewal; no new charge.') from appointment_slots s
   where b.slot_id=s.id and b.recurring_plan_id=$1 and b.payment_status in ('scheduled','failed','unpaid') and s.starts_at>now() and ($2::timestamptz is null or s.starts_at>=$2)`,[plan.id,status==='canceled'||status==='incomplete_expired'?null:cancelAt]);
 }
}
export type RenewalInvoice={id:string;subscriptionId:string;status:string;amountPaid:number;total:number;currency:string;periodStart:number;initial:boolean;paymentIntent:string|null;failed:boolean};
export async function recordInvoice(sql:ScheduleSql,plan:Plan,invoice:RenewalInvoice){
 if(invoice.subscriptionId!==plan.stripe_subscription_id)throw new Error('Subscription invoice mismatch.');
 const index=invoice.initial?0:occurrenceIndex(new Date(plan.anchor_start).toISOString(),plan.interval_weeks,new Date(invoice.periodStart*1000+86400000).toISOString());
 if(index<0||(!invoice.initial&&index<1))throw new Error('Subscription invoice period mismatch.');
 const [seen]=await sql.unsafe('select * from subscription_invoices where id=$1',[invoice.id]);
 if(seen?.status==='paid')return null;
 const booking=await ensureOccurrence(sql,plan,index);
 if(booking.stripe_invoice_id&&booking.stripe_invoice_id!==invoice.id)throw new Error('A different invoice is already linked to this visit.');
 const paid=invoice.status==='paid';
 const mismatch=invoice.currency!=='usd'||invoice.total!==(invoice.initial?booking.amount:plan.amount);
 const [slot]=await sql.unsafe('select starts_at from appointment_slots where id=$1',[booking.slot_id]);
 const late=paid&&!['paid','refunded','partially_refunded'].includes(booking.payment_status)&&new Date(slot.starts_at).getTime()<=Date.now();
 if(paid){
  await sql.unsafe(`update bookings set stripe_invoice_id=$2,stripe_payment_intent=$3,amount=$4,payment_status=case when payment_status in ('refunded','partially_refunded') then payment_status else 'paid' end,status=case when status='cancelled' then status when $5 then 'issue' when status='issue' and payment_status='failed' then 'confirmed' else status end,updated_at=now() where id=$1`,[booking.id,invoice.id,invoice.paymentIntent,invoice.amountPaid,mismatch||late]);
 }else if(invoice.failed){
  await sql.unsafe("update bookings set stripe_invoice_id=$2,payment_status='failed',status=case when status='cancelled' then status else 'issue' end,updated_at=now() where id=$1 and payment_status not in ('paid','refunded','partially_refunded')",[booking.id,invoice.id]);
 }else return null;
 await sql.unsafe('insert into subscription_invoices(id,plan_id,booking_id,status,amount_paid) values($1,$2,$3,$4,$5) on conflict(id) do update set status=excluded.status,amount_paid=excluded.amount_paid,updated_at=now()',[invoice.id,plan.id,booking.id,paid?'paid':'failed',invoice.amountPaid]);
 await sql.unsafe("insert into booking_events(booking_id,event,actor,details) values($1,$2,'stripe',$3::jsonb)",[booking.id,paid?'subscription_payment_confirmed':'subscription_payment_failed',JSON.stringify({invoiceId:invoice.id,index,mismatch})]);
 return {booking,index,paid,mismatch,late,cancelled:booking.status==='cancelled'};
}
