import {z} from 'zod';
import {db} from '@/lib/db';
import {managementPlan} from '@/lib/subscription-tokens';
import {cancelSubscription,portalSession,syncSubscription} from '@/lib/subscriptions';
import {checkOrigin,rateLimit,apiError} from '@/lib/security';
export async function POST(req:Request){try{
 checkOrigin(req);await rateLimit(req,'subscription-manage',30);
 const input=z.object({token:z.string().max(2000),action:z.enum(['view','portal','cancel'])}).parse(await req.json());
 const id=await managementPlan(input.token);if(!id)return Response.json({error:'This private link has expired. Use the link in your latest cleaning email or contact us.'},{status:403});
 const sql=db();let [plan]=await sql`select * from recurring_plans where id=${id}`;if(!plan)throw new Error('No matching subscription.');
 if(input.action==='portal'){const portal=await portalSession(id);return Response.json({url:portal.url},{headers:{'Cache-Control':'no-store'}});}
 if(input.action==='cancel')await cancelSubscription(id);else if(process.env.STRIPE_SECRET_KEY)await syncSubscription(plan.stripe_subscription_id);
 [plan]=await sql`select * from recurring_plans where id=${id}`;
 const visits=await sql`select b.reference,b.payment_status,b.status,s.starts_at,s.ends_at from bookings b join appointment_slots s on s.id=b.slot_id where b.recurring_plan_id=${id} and s.starts_at>now() and b.status!='cancelled' order by s.starts_at limit 8`;
 return Response.json({plan:{service:plan.details.service,frequency:plan.frequency,amount:plan.amount,status:plan.status,anchorStart:plan.anchor_start,cancelAt:plan.cancel_at},visits},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
