import {stripe,fulfillSession} from '@/lib/payments';
import {db} from '@/lib/db';
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
  if(event.type==='checkout.session.expired'){
   const session=event.data.object;if(session.metadata?.app==='carolina-homekeeping')await sql`update checkout_holds set status='expired' where stripe_session_id=${session.id} and status in ('creating','open')`;
  }
  if(event.type==='charge.refunded'){
   const charge=event.data.object;const intent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
   if(intent)await sql`update bookings set refunded_amount=greatest(refunded_amount,${charge.amount_refunded}),payment_status=case when ${charge.amount_refunded}>=amount then 'refunded' else 'partially_refunded' end,updated_at=now() where stripe_payment_intent=${intent}`;
  }
  await sql`insert into stripe_events(id,type) values(${event.id},${event.type}) on conflict(id) do nothing`;
  after(()=>drainOutbox());return Response.json({received:true});
 }catch{console.error('Stripe webhook processing failed.');return new Response('Retry required',{status:500});}
}
