import {z} from 'zod';
import {fromZonedTime} from 'date-fns-tz';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {configSchema} from '@/lib/pricing';
import {checkOrigin,apiError} from '@/lib/security';
import {drainOutbox} from '@/lib/email';
import {reconcileHolds} from '@/lib/payments';
import {randomBytes} from 'node:crypto';
export async function POST(req:Request){try{
 checkOrigin(req);const actor=await requireAdmin();const input=await req.json();const sql=db();
 switch(input.action){
 case 'pricing':{const config=configSchema.parse(input.config);await sql`insert into settings(key,value) values('pricing',${sql.json(config)}) on conflict(key) do update set value=excluded.value,updated_at=now()`;break;}
 case 'slot_create':{
  const p=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),start:z.string().regex(/^\d{2}:\d{2}$/),end:z.string().regex(/^\d{2}:\d{2}$/),capacity:z.number().int().min(1).max(50),label:z.string().max(120)}).parse(input);
  const starts=fromZonedTime(`${p.date}T${p.start}:00`,'America/New_York');const ends=fromZonedTime(`${p.date}T${p.end}:00`,'America/New_York');
  if(!Number.isFinite(starts.getTime())||ends<=starts||starts<new Date())throw new Error('Please choose a valid future arrival window.');
  await sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(72901642)`;const overlap=await tx`select id from appointment_slots where starts_at<${ends} and ends_at>${starts}`;if(overlap.length)throw new Error('Please edit the existing window instead of creating overlapping capacity.');await tx`insert into appointment_slots(starts_at,ends_at,capacity,label) values(${starts},${ends},${p.capacity},${p.label})`;});break;
 }
 case 'slot_update':{const p=z.object({id:z.uuid(),blocked:z.boolean(),capacity:z.number().int().min(1).max(50)}).parse(input);await sql.begin(async tx=>{await tx`select id from appointment_slots where id=${p.id} for update`;const [r]=await tx`select (select count(*) from bookings where slot_id=${p.id} and status not in ('cancelled','refunded'))+(select count(*) from checkout_holds where slot_id=${p.id} and status in ('creating','open')) as used`;if(p.capacity<Number(r.used))throw new Error('Cannot reduce capacity below existing bookings and checkout holds.');await tx`update appointment_slots set blocked=${p.blocked},capacity=${p.capacity} where id=${p.id}`;});break;}
 case 'booking_update':{
  const p=z.object({id:z.uuid(),status:z.enum(['confirmed','completed','cancelled','issue']),notes:z.string().max(10000)}).parse(input);
  await sql.begin(async tx=>{const [b]=await tx`select * from bookings where id=${p.id} for update`;if(!b)throw new Error('No matching booking.');if(b.status==='cancelled'&&p.status!=='cancelled')throw new Error('Cannot reopen a cancelled booking; schedule a new appointment.');await tx`update bookings set status=${p.status},internal_notes=${p.notes},completed_at=case when ${p.status}='completed' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=${p.id}`;await tx`insert into booking_events(booking_id,event,actor,details) values(${p.id},'admin_updated',${actor},${tx.json({from:b.status,to:p.status})})`;});break;
 }
 case 'booking_reschedule':{
  const p=z.object({id:z.uuid(),slotId:z.uuid()}).parse(input);
  await sql.begin(async tx=>{const [b]=await tx`select * from bookings where id=${p.id} for update`;if(!b||b.status!=='confirmed')throw new Error('Cannot reschedule this booking in its current status.');const [s]=await tx`select * from appointment_slots where id=${p.slotId} for update`;if(!s||s.blocked||new Date(s.starts_at)<new Date())throw new Error('That appointment is not available.');if(b.slot_id!==p.slotId){const [r]=await tx`select (select count(*) from bookings where slot_id=${p.slotId} and status not in ('cancelled','refunded'))+(select count(*) from checkout_holds where slot_id=${p.slotId} and status in ('creating','open')) as used`;if(Number(r.used)>=s.capacity)throw new Error('That appointment is full.');await tx`update bookings set slot_id=${p.slotId},updated_at=now() where id=${p.id}`;await tx`insert into booking_events(booking_id,event,actor,details) values(${p.id},'rescheduled',${actor},${tx.json({from:b.slot_id,to:p.slotId})})`;}});break;
 }
 case 'lead_update':{const p=z.object({id:z.uuid(),status:z.enum(['new','contacted','qualified','closed','converted']),notes:z.string().max(10000)}).parse(input);await sql`update leads set status=${p.status},notes=${p.notes},updated_at=now() where id=${p.id}`;break;}
 case 'customer_update':{const p=z.object({id:z.uuid(),active:z.boolean(),notes:z.string().max(10000)}).parse(input);await sql`update customers set active=${p.active},notes=${p.notes},updated_at=now() where id=${p.id}`;break;}
 case 'commercial_job':{
  const p=z.object({leadId:z.uuid(),slotId:z.uuid(),amount:z.number().int().min(0).max(10000000),notes:z.string().max(5000)}).parse(input);
  await sql.begin(async tx=>{const [lead]=await tx`select * from leads where id=${p.leadId} and type='commercial' for update`;if(!lead)throw new Error('No matching commercial lead.');const [slot]=await tx`select * from appointment_slots where id=${p.slotId} for update`;if(!slot||slot.blocked||new Date(slot.starts_at)<new Date())throw new Error('That appointment is not available.');const [r]=await tx`select (select count(*) from bookings where slot_id=${p.slotId} and status not in ('cancelled','refunded'))+(select count(*) from checkout_holds where slot_id=${p.slotId} and status in ('creating','open')) as used`;if(Number(r.used)>=slot.capacity)throw new Error('That appointment is full.');const [c]=await tx`insert into customers(name,email,phone) values(${lead.name},${lead.email},${lead.phone}) on conflict(email) do update set updated_at=now() returning id`;const [h]=await tx`insert into homes(customer_id,address,city,zip,profile) values(${c.id},${lead.address},'','',${tx.json({company:lead.payload.company})}) on conflict(customer_id,address,zip) do update set profile=excluded.profile returning id`;const [b]=await tx`insert into bookings(reference,customer_id,home_id,slot_id,kind,service,frequency,amount,payment_status,status,quote,details,internal_notes) values(${'CH-'+randomBytes(4).toString('hex').toUpperCase()},${c.id},${h.id},${slot.id},'commercial','commercial','once',${p.amount},'unpaid','confirmed',${tx.json({total:p.amount,addons:[]})},${tx.json({leadId:lead.id,company:lead.payload.company})},${p.notes}) returning id`;await tx`update leads set status='converted',updated_at=now() where id=${lead.id}`;await tx`insert into booking_events(booking_id,event,actor) values(${b.id},'commercial_job_scheduled',${actor})`;});break;
 }
 case 'retry_delivery':{if(process.env.STRIPE_SECRET_KEY)await reconcileHolds();await drainOutbox();break;}
 default:throw new Error('Unknown action.');
 }
 await sql`insert into audit_log(actor,action,record_id) values(${actor},${String(input.action)},${input.id||input.leadId||null})`;
 return Response.json({ok:true});
 }catch(e){return apiError(e,e instanceof Error&&e.message==='Sign-in required.'?401:400);}}
