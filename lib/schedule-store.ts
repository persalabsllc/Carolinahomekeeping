import {db} from './db';
import {intervalWeeks,occupancyForRange,hasSeriesCapacity,type ScheduleSnapshot} from './recurrence';
import type {Frequency} from './pricing';
import {defaultScheduling,schedulingSchema,SCHEDULE_LOCK,appointmentInterval,validAppointment,hasCapacity,type SchedulingConfig,type Occupancy} from './scheduling';
export type ScheduleSql = Pick<ReturnType<typeof db>, 'unsafe'>;
export async function getScheduling(sql?: ScheduleSql): Promise<SchedulingConfig> {
  if(!sql&&!process.env.DATABASE_URL)return defaultScheduling;
  const rows=await (sql||db()).unsafe("select value from settings where key='scheduling'");
  return rows.length?schedulingSchema.parse(rows[0].value):defaultScheduling;
}
export async function lockSchedule(sql: ScheduleSql) {await sql.unsafe('select pg_advisory_xact_lock($1)',[SCHEDULE_LOCK]);}
export async function getScheduleSnapshot(sql:ScheduleSql,excludeBooking?:string):Promise<ScheduleSnapshot>{
 const [fixed,plans,holds,overrides]=await Promise.all([
  sql.unsafe(`select b.id::text,b.id::text as booking_id,'booking' as kind,s.starts_at,s.ends_at,c.name as label from bookings b join appointment_slots s on s.id=b.slot_id join customers c on c.id=b.customer_id where b.status not in ('cancelled','refunded') and ($1::uuid is null or b.id<>$1::uuid)
   union all select h.id::text,null,'hold',s.starts_at,s.ends_at,'In checkout' from checkout_holds h join appointment_slots s on s.id=h.slot_id where h.status in ('creating','open')
   union all select id::text,null,'block',starts_at,ends_at,label from schedule_blocks where active=true`,[excludeBooking||null]),
  sql.unsafe("select r.id,r.anchor_start,r.duration_minutes,r.interval_weeks,r.cancel_at,c.name from recurring_plans r join customers c on c.id=r.customer_id where r.anchor_start is not null and r.status in ('trialing','active','past_due','unpaid','paused')"),
  sql.unsafe("select h.id,h.payload,h.quote,s.starts_at from checkout_holds h join appointment_slots s on s.id=h.slot_id where h.status in ('creating','open') and h.payload->>'frequency' in ('weekly','two_weeks','four_weeks') and h.payload->>'recurringAccepted'='true'"),
  sql.unsafe('select recurring_plan_id,recurrence_index from bookings where recurring_plan_id is not null and recurrence_index is not null'),
 ]);
 return {fixed:fixed.map(r=>({id:String(r.id),booking_id:r.booking_id?String(r.booking_id):undefined,kind:r.kind as Occupancy['kind'],label:String(r.label||''),starts_at:new Date(r.starts_at).toISOString(),ends_at:new Date(r.ends_at).toISOString()})),
  series:[...plans.map(r=>({id:String(r.id),planId:String(r.id),anchorStart:new Date(r.anchor_start).toISOString(),durationMinutes:Number(r.duration_minutes),weeks:Number(r.interval_weeks),endBefore:r.cancel_at?new Date(r.cancel_at).toISOString():null,kind:'booking' as const,label:String(r.name)+' · recurring'})),
   ...holds.map(h=>({id:String(h.id),anchorStart:new Date(h.starts_at).toISOString(),durationMinutes:Number(h.quote.durationMinutes),weeks:intervalWeeks(h.payload.frequency),firstIndex:1,kind:'hold' as const,label:'Recurring checkout'}))],
  overrides:overrides.map(o=>({planId:String(o.recurring_plan_id),index:Number(o.recurrence_index)}))};
}
export async function readOccupancy(sql:ScheduleSql,from:string,through:string,excludeBooking?:string):Promise<Occupancy[]>{
 return occupancyForRange(await getScheduleSnapshot(sql,excludeBooking),from,through);
}
// Caller must hold lockSchedule() for the entire transaction through the hold/booking insert.
export async function reserveInterval(sql: ScheduleSql, start: string, minutes: number, config: SchedulingConfig, noticeHours: number, excludeBooking?: string, frequency:Frequency='once') {
  const interval=appointmentInterval(start,minutes);
  if(!validAppointment(interval,new Date(),noticeHours))throw new Error('That cleaning does not fit our available hours. Please choose another start time.');
  const snapshot=await getScheduleSnapshot(sql,excludeBooking);
  const occupancy=occupancyForRange(snapshot,interval.starts_at,interval.ends_at);
  const weeks=intervalWeeks(frequency);
  if(weeks&&!hasSeriesCapacity({id:'proposed',anchorStart:interval.starts_at,durationMinutes:minutes,weeks,kind:'booking'},snapshot,config.teamCapacity))throw new Error('That recurring time conflicts with a future booking or blocked period. Please choose another time.');
  if(!hasCapacity(interval,occupancy,config.teamCapacity))throw new Error('That time was just reserved or blocked. Please choose another start time.');
  const rows=await sql.unsafe(`insert into appointment_slots(starts_at,ends_at,capacity,label) values($1,$2,1,'Reserved cleaning time') on conflict(starts_at,ends_at) do update set label=excluded.label returning *`,[interval.starts_at,interval.ends_at]);
  return rows[0];
}
