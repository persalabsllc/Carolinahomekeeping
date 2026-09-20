import {capacityFits} from './recurrence';
import {getScheduling,getScheduleSnapshot,lockSchedule,type ScheduleSql} from './schedule-store';

const revision='owner_schedule_thursday_sunday_20260920';

/** One-time owner-authorized capacity change, within the migration transaction.
 * Never edits bookings, prices, durations or recurring plans. Future deliberate
 * admin capacity changes remain intact on subsequent deployments.
 */
export async function applyOwnerLaunchSchedule(sql:ScheduleSql,now=new Date()):Promise<boolean>{
  await lockSchedule(sql);
  // Repair this migration's JSON values if a driver encoded a serialized JSON
  // parameter a second time. Scope the repair to our recorded migration only.
  await sql.unsafe(`update settings set value=(value #>> '{}')::jsonb,updated_at=now()
    where key in ('scheduling',$1) and jsonb_typeof(value)='string'
    and exists(select 1 from settings where key=$1)`,[revision]);
  if((await sql.unsafe('select key from settings where key=$1',[revision])).length)return false;
  const config=await getScheduling(sql);
  if(!capacityFits(await getScheduleSnapshot(sql),1,now.toISOString())){
    throw new Error('Existing overlapping reservations require review before switching to one cleaner.');
  }
  await sql.unsafe(`insert into settings(key,value) values('scheduling',$1::text::jsonb)
    on conflict(key) do update set value=excluded.value,updated_at=now()`,[JSON.stringify({...config,teamCapacity:1})]);
  await sql.unsafe('insert into settings(key,value) values($1,$2::text::jsonb)',[revision,JSON.stringify({appliedAt:now.toISOString(),teamCapacity:1})]);
  return true;
}
