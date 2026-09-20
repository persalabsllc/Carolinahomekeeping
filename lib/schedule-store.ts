import {db} from './db';
import {defaultScheduling,schedulingSchema,SCHEDULE_LOCK,appointmentInterval,validAppointment,hasCapacity,type SchedulingConfig,type Occupancy} from './scheduling';
export type ScheduleSql = Pick<ReturnType<typeof db>, 'unsafe'>;
export async function getScheduling(sql?: ScheduleSql): Promise<SchedulingConfig> {
  if(!sql&&!process.env.DATABASE_URL)return defaultScheduling;
  const rows=await (sql||db()).unsafe("select value from settings where key='scheduling'");
  return rows.length?schedulingSchema.parse(rows[0].value):defaultScheduling;
}
export async function lockSchedule(sql: ScheduleSql) {await sql.unsafe('select pg_advisory_xact_lock($1)',[SCHEDULE_LOCK]);}
export async function readOccupancy(sql: ScheduleSql, from: string, through: string, excludeBooking?: string): Promise<Occupancy[]> {
  const rows=await sql.unsafe(`
    select b.id::text, b.id::text as booking_id, 'booking' as kind, s.starts_at, s.ends_at, c.name as label
    from bookings b join appointment_slots s on s.id=b.slot_id join customers c on c.id=b.customer_id
    where b.status not in ('cancelled','refunded') and s.starts_at<$2 and s.ends_at>$1 and ($3::uuid is null or b.id<>$3::uuid)
    union all
    select h.id::text, null, 'hold', s.starts_at, s.ends_at, 'In checkout'
    from checkout_holds h join appointment_slots s on s.id=h.slot_id
    where h.status in ('creating','open') and s.starts_at<$2 and s.ends_at>$1
    union all
    select x.id::text, null, 'block', x.starts_at, x.ends_at, x.label
    from schedule_blocks x where x.active=true and x.starts_at<$2 and x.ends_at>$1
    order by starts_at`,[from,through,excludeBooking||null]);
  return rows.map(r=>({id:String(r.id),booking_id:r.booking_id?String(r.booking_id):undefined,kind:r.kind as Occupancy['kind'],label:String(r.label||''),starts_at:new Date(r.starts_at).toISOString(),ends_at:new Date(r.ends_at).toISOString()}));
}
// Caller must hold lockSchedule() for the entire transaction through the hold/booking insert.
export async function reserveInterval(sql: ScheduleSql, start: string, minutes: number, config: SchedulingConfig, noticeHours: number, excludeBooking?: string) {
  const interval=appointmentInterval(start,minutes);
  if(!validAppointment(interval,new Date(),noticeHours))throw new Error('That cleaning does not fit our available hours. Please choose another start time.');
  const occupancy=await readOccupancy(sql,interval.starts_at,interval.ends_at,excludeBooking);
  if(!hasCapacity(interval,occupancy,config.teamCapacity))throw new Error('That time was just reserved or blocked. Please choose another start time.');
  const rows=await sql.unsafe(`insert into appointment_slots(starts_at,ends_at,capacity,label) values($1,$2,1,'Reserved cleaning time') on conflict(starts_at,ends_at) do update set label=excluded.label returning *`,[interval.starts_at,interval.ends_at]);
  return rows[0];
}
