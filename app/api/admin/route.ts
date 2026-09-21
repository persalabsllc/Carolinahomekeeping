import {after} from 'next/server';
import {processCommunications,getCommunications,enqueueEmail} from '@/lib/communications';
import {communicationSchema} from '@/lib/communication-config';
import {emailTemplate} from '@/lib/email-templates';
import {capacityFits} from '@/lib/recurrence';
import {cancelSubscription,portalSession,reconcileSubscriptions} from '@/lib/subscriptions';
import {z} from 'zod';
import {fromZonedTime} from 'date-fns-tz';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {configSchema} from '@/lib/pricing';
import {checkOrigin,apiError} from '@/lib/security';
import {drainOutbox} from '@/lib/email';
import {repairRejectedEmailHeaders} from '@/lib/email-repair';
import {canBook} from '@/lib/config';
import {reconcileHolds} from '@/lib/payments';
import {randomBytes} from 'node:crypto';
import {getScheduling,lockSchedule,readOccupancy,reserveInterval,getScheduleSnapshot} from '@/lib/schedule-store';
import {schedulingSchema} from '@/lib/scheduling';
const localDateTime=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const eastern=(s:string)=>fromZonedTime(s+':00','America/New_York').toISOString();
export async function POST(req:Request){try{
 checkOrigin(req);const actor=await requireAdmin();const input=await req.json();const sql=db();
 switch(input.action){
 case 'repair_email_headers':{
  const p=z.object({id:z.uuid(),confirmedProvider422:z.literal(true)}).parse(input);
  await sql.begin(async tx=>{await repairRejectedEmailHeaders(tx,p.id,actor,canBook());});
  const email=await drainOutbox({onlyId:p.id});
  return Response.json({ok:true,email});
 }
 case 'communications':{const current=await getCommunications(sql);const config=communicationSchema.parse({...input.config,enabledAt:current.enabledAt});await sql`update settings set value=${sql.json(config)},updated_at=now() where key='communications'`;break;}
 case 'email_test':{const config=await getCommunications(sql);await enqueueEmail(sql,{key:'owner-test:'+randomBytes(16).toString('hex'),to:config.ownerEmail,subject:'Your Carolina Homekeeping emails are connected',html:emailTemplate('Your email connection is working.','<p>This test was requested from your Control Room. Booking alerts will arrive at this address when a new booking is confirmed.</p>'),kind:'owner_test'});break;}
 case 'pricing':{const config=configSchema.parse(input.config);await sql`insert into settings(key,value) values('pricing',${sql.json(config)}) on conflict(key) do update set value=excluded.value,updated_at=now()`;break;}
 case 'scheduling':{
  const config=schedulingSchema.parse(input.config);
  await sql.begin(async tx=>{
   await lockSchedule(tx);
   const snapshot=await getScheduleSnapshot(tx);
   if(!capacityFits(snapshot,config.teamCapacity,new Date().toISOString()))throw new Error('Capacity cannot be reduced below existing bookings and checkout holds.');
   await tx`insert into settings(key,value) values('scheduling',${tx.json(config)}) on conflict(key) do update set value=excluded.value,updated_at=now()`;
  });break;
 }
 case 'block_create':{
  const p=z.object({start:localDateTime,end:localDateTime,label:z.string().trim().min(1).max(120)}).parse(input);
  const starts=eastern(p.start),ends=eastern(p.end);
  if(ends<=starts||ends<new Date().toISOString())throw new Error('Choose a valid future period to block.');
  await sql.begin(async tx=>{
   await lockSchedule(tx);
   if((await readOccupancy(tx,starts,ends)).some(o=>o.kind!=='block'))throw new Error('This period overlaps a booking or checkout hold. Reschedule the booking or wait for checkout to expire first.');
   await tx`insert into schedule_blocks(starts_at,ends_at,label) values(${starts},${ends},${p.label})`;
  });break;
 }
 case 'block_update':{
  const p=z.object({id:z.uuid(),active:z.boolean()}).parse(input);
  await sql.begin(async tx=>{
   await lockSchedule(tx);const [block]=await tx`select * from schedule_blocks where id=${p.id}`;
   if(!block)throw new Error('This blocked period no longer exists.');
   if(p.active&&(await readOccupancy(tx,new Date(block.starts_at).toISOString(),new Date(block.ends_at).toISOString())).some(o=>o.kind!=='block'))throw new Error('This period overlaps a booking or checkout hold.');
   await tx`update schedule_blocks set active=${p.active} where id=${p.id}`;
  });break;
 }
 case 'booking_update':{
  const p=z.object({id:z.uuid(),status:z.enum(['confirmed','completed','cancelled','issue']),notes:z.string().max(10000)}).parse(input);
  await sql.begin(async tx=>{await lockSchedule(tx);const [b]=await tx`select * from bookings where id=${p.id} for update`;if(!b)throw new Error('No matching booking.');if(b.recurring_plan_id&&['scheduled','failed','unpaid'].includes(b.payment_status)&&['cancelled','completed'].includes(p.status))throw new Error('Please manage this subscription to stop future billing. Unpaid recurring visits cannot be canceled or completed individually.');if(b.status==='cancelled'&&p.status!=='cancelled')throw new Error('Cannot reopen a cancelled booking; schedule a new appointment.');await tx`update bookings set status=${p.status},internal_notes=${p.notes},completed_at=case when ${p.status}='completed' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=${p.id}`;await tx`insert into booking_events(booking_id,event,actor,details) values(${p.id},'admin_updated',${actor},${tx.json({from:b.status,to:p.status})})`;});break;
 }
 case 'booking_reschedule':{
  const p=z.object({id:z.uuid(),start:localDateTime}).parse(input);
  await sql.begin(async tx=>{
   await lockSchedule(tx);
   const [b]=await tx`select b.*,s.starts_at,s.ends_at from bookings b join appointment_slots s on s.id=b.slot_id where b.id=${p.id} for update of b`;
   if(b?.recurring_plan_id&&b.payment_status!=='paid')throw new Error('Please wait for payment before rescheduling a single recurring visit, or cancel the subscription from Subscriptions.');
   if(!b||b.status!=='confirmed')throw new Error('Cannot reschedule this booking in its current status.');
   const durationMinutes=(new Date(b.ends_at).getTime()-new Date(b.starts_at).getTime())/60000;
   const slot=await reserveInterval(tx,eastern(p.start),durationMinutes,await getScheduling(tx),0,b.id);
   await tx`update bookings set slot_id=${slot.id},updated_at=now() where id=${p.id}`;
   await tx`insert into booking_events(booking_id,event,actor,details) values(${p.id},'rescheduled',${actor},${tx.json({from:b.slot_id,to:slot.id,durationMinutes})})`;
  });break;
 }
 case 'lead_update':{const p=z.object({id:z.uuid(),status:z.enum(['new','contacted','qualified','closed','converted']),notes:z.string().max(10000)}).parse(input);await sql`update leads set status=${p.status},notes=${p.notes},updated_at=now() where id=${p.id}`;break;}
 case 'customer_update':{const p=z.object({id:z.uuid(),active:z.boolean(),notes:z.string().max(10000)}).parse(input);await sql`update customers set active=${p.active},notes=${p.notes},updated_at=now() where id=${p.id}`;break;}
 case 'commercial_job':{
  const p=z.object({leadId:z.uuid(),start:localDateTime,durationMinutes:z.number().int().min(30).max(540).multipleOf(15),amount:z.number().int().min(0).max(10000000),notes:z.string().max(5000)}).parse(input);
  await sql.begin(async tx=>{
   await lockSchedule(tx);
   const [lead]=await tx`select * from leads where id=${p.leadId} and type='commercial' for update`;
   if(!lead||lead.status==='converted')throw new Error('No unscheduled commercial lead matches this request.');
   const slot=await reserveInterval(tx,eastern(p.start),p.durationMinutes,await getScheduling(tx),0);
   const [c]=await tx`insert into customers(name,email,phone) values(${lead.name},${lead.email},${lead.phone}) on conflict(email) do update set updated_at=now() returning id`;
   const [h]=await tx`insert into homes(customer_id,address,city,zip,profile) values(${c.id},${lead.address},'','',${tx.json({company:lead.payload.company})}) on conflict(customer_id,address,zip) do update set profile=excluded.profile returning id`;
   const [b]=await tx`insert into bookings(reference,customer_id,home_id,slot_id,kind,service,frequency,amount,payment_status,status,quote,details,internal_notes) values(${'CH-'+randomBytes(4).toString('hex').toUpperCase()},${c.id},${h.id},${slot.id},'commercial','commercial','once',${p.amount},'unpaid','confirmed',${tx.json({total:p.amount,addons:[],durationMinutes:p.durationMinutes})},${tx.json({leadId:lead.id,company:lead.payload.company})},${p.notes}) returning id`;
   await tx`update leads set status='converted',updated_at=now() where id=${lead.id}`;
   await tx`insert into booking_events(booking_id,event,actor) values(${b.id},'commercial_job_scheduled',${actor})`;
  });break;
 }
 case 'subscription_cancel':{const id=z.uuid().parse(input.id);await cancelSubscription(id);break;}
 case 'subscription_portal':{const id=z.uuid().parse(input.id);const portal=await portalSession(id);await sql`insert into audit_log(actor,action,record_id) values(${actor},'subscription_portal',${id})`;return Response.json({url:portal.url});}
 case 'retry_delivery':{if(process.env.STRIPE_SECRET_KEY){await reconcileHolds();await reconcileSubscriptions();}await processCommunications();await drainOutbox();break;}
 default:throw new Error('Unknown action.');
 }
 await sql`insert into audit_log(actor,action,record_id) values(${actor},${String(input.action)},${input.id||input.leadId||null})`;
 if(input.action!=='retry_delivery')after(async()=>{await processCommunications();await drainOutbox();});
 return Response.json({ok:true});
 }catch(e){return apiError(e,e instanceof Error&&e.message==='Sign-in required.'?401:400);}}
