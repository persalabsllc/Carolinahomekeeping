import {cookies} from 'next/headers';
import {db} from '@/lib/db';
import {hash} from '@/lib/security';
import {stripe,fulfillSession} from '@/lib/payments';
import {drainOutbox} from '@/lib/email';
import {after} from 'next/server';
export async function GET(req:Request){
 const id=new URL(req.url).searchParams.get('session_id');const leadToken=(await cookies()).get('ch_lead')?.value;
 if(!id||!/^cs_[a-zA-Z0-9_]+$/.test(id)||!leadToken)return Response.json({error:'Please check your confirmation email for booking details.'},{status:403});
 try{const sql=db();const [hold]=await sql`select id from checkout_holds where stripe_session_id=${id} and token_hash=${hash(leadToken)}`;if(!hold)return Response.json({error:'We couldn’t verify this booking in your browser. Please check your email.'},{status:403});
 const session=await stripe().checkout.sessions.retrieve(id);const booking=await fulfillSession(session);
 if(!booking)return Response.json({status:session.status==='expired'?'expired':'pending'},{headers:{'Cache-Control':'no-store'}});
 const [slot]=await sql`select starts_at,ends_at from appointment_slots where id=${booking.slot_id}`;
 const [email]=await sql`select status from email_outbox where dedupe_key=${'confirmation:'+booking.id}`;
 after(()=>drainOutbox());return Response.json({status:'confirmed',reference:booking.reference,service:booking.service,amount:booking.amount,slot,emailStatus:email?.status||'pending'},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'We’re still checking your payment. Please don’t pay again. Try refreshing in a moment.'},{status:503});}
}
