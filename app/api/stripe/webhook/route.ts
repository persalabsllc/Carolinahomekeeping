import {stripe,fulfillSession} from '@/lib/payments';
import {handleSubscriptionInvoice,syncSubscription} from '@/lib/subscriptions';
import {db} from '@/lib/db';
import {processCommunications} from '@/lib/communications';
import {drainOutbox} from '@/lib/email';
import {after} from 'next/server';
import type Stripe from 'stripe';
export const runtime='nodejs';
export async function POST(req:Request){
 if(!process.env.STRIPE_WEBHOOK_SECRET)return new Response('Not configured',{status:503});
 let event:Stripe.Event;
 try{event=stripe().webhooks.constructEvent(await req.text(),req.headers.get('stripe-signature')||'',process.env.STRIPE_WEBHOOK_SECRET);}catch{return new Response('Invalid signature',{status:400});}
 const sql=db();try{
  const [seen]=await sql`select id from stripe_events where id=${event.id}`;if(seen)return Response.json({received:true});
  if(event.type==='checkout.session.completed')await fulfillSession(event.data.object);
  if(['invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.voided','invoice.marked_uncollectible'].includes(event.type))await handleSubscriptionInvoice((event.data.object as {id:string}).id);
  if(['customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed'].includes(event.type))await syncSubscription((event.data.object as {id:string}).id);
  if(event.type==='checkout.session.expired'){
   const session=event.data.object;if(session.metadata?.app==='carolina-homekeeping')await sql`update checkout_holds set status='expired' where stripe_session_id=${session.id} and status in ('creating','open')`;
  }
  if(event.type==='charge.refunded'){
   const charge=event.data.object;const intent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
   if(intent)await sql`update bookings set refunded_amount=greatest(refunded_amount,${charge.amount_refunded}),payment_status=case when ${charge.amount_refunded}>=amount then 'refunded' else 'partially_refunded' end,updated_at=now() where stripe_payment_intent=${intent}`;
  }
  await sql`insert into stripe_events(id,type) values(${event.id},${event.type}) on conflict(id) do nothing`;
  after(async()=>{await processCommunications();await drainOutbox();});return Response.json({received:true});
 }catch{console.error('Stripe webhook processing failed.');return new Response('Retry required',{status:500});}
}
