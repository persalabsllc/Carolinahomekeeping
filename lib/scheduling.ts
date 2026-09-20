import {z} from 'zod';
import {formatInTimeZone, fromZonedTime} from 'date-fns-tz';
import {defaultConfig, type QuoteInput, type Service} from './pricing';

export const TIME_ZONE = 'America/New_York';
export const START_INTERVAL = 30;
export const FINISH_GRACE_MINUTES = 60;
export const BOOKING_HORIZON_DAYS = 90;
export const SCHEDULE_LOCK = 72901642;
const minutes = z.number().int().min(15).max(540).multipleOf(15);
export const schedulingSchema = z.object({
  teamCapacity: z.number().int().min(1).max(20),
  serviceMinutes: z.object({standard: minutes, deep: minutes, move: minutes}),
  addonMinutes: z.record(z.string().regex(/^[a-z_]+$/), z.number().int().min(0).max(240).multipleOf(15)),
});
export type SchedulingConfig = z.infer<typeof schedulingSchema>;
export const defaultScheduling: SchedulingConfig = {
  teamCapacity: 1,
  serviceMinutes: {standard: 120, deep: 180, move: 240},
  addonMinutes: Object.fromEntries(defaultConfig.addons.map(a => [a.id, 30])),
};
export type Interval = {starts_at: string; ends_at: string};
export type Occupancy = Interval & {id: string; kind: 'booking'|'hold'|'block'; label?: string; booking_id?: string};
export type AppointmentOption = Interval & {id: string};
export const localDay = (date: string|Date) => formatInTimeZone(new Date(date), TIME_ZONE, 'yyyy-MM-dd');
export const localTime = (date: string|Date) => formatInTimeZone(new Date(date), TIME_ZONE, 'h:mm a');
export function nextDay(day: string, offset = 1) {
  const d = new Date(day+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10);
}
export function dayBounds(day: string): Interval {
  return {starts_at: fromZonedTime(day+'T00:00:00', TIME_ZONE).toISOString(), ends_at: fromZonedTime(nextDay(day)+'T00:00:00', TIME_ZONE).toISOString()};
}
export function workingHours(day: string): Interval|null {
  const weekday = new Date(day+'T12:00:00Z').getUTCDay();
  if(weekday===0) return null;
  return {starts_at: fromZonedTime(day+'T08:00:00', TIME_ZONE).toISOString(), ends_at: fromZonedTime(day+(weekday===6?'T14:00:00':'T17:00:00'), TIME_ZONE).toISOString()};
}
// Starts stay inside normal business hours; finishing may use the extra hour.
export function bookingHours(day: string): Interval|null {
  const hours=workingHours(day);
  return hours?{...hours,ends_at:new Date(Date.parse(hours.ends_at)+FINISH_GRACE_MINUTES*60000).toISOString()}:null;
}
export function estimateMinutes(input: Pick<QuoteInput,'service'|'addons'>, config: SchedulingConfig): number {
  return config.serviceMinutes[input.service]+Object.entries(input.addons).reduce((sum,[id,quantity]) => sum+(config.addonMinutes[id]??30)*quantity,0);
}
export function durationLabel(minutes: number) {
  const h=Math.floor(minutes/60), m=minutes%60;
  return [h?`${h} ${h===1?'hour':'hours'}`:'',m?`${m} minutes`:''].filter(Boolean).join(' ');
}
export const overlaps = (a: Interval,b: Interval) => Date.parse(a.starts_at)<Date.parse(b.ends_at)&&Date.parse(a.ends_at)>Date.parse(b.starts_at);

// Half-open intervals: one job may begin exactly when another finishes.
// Sweep each boundary, not the total number of jobs touching the interval.
export function availableSegments(day: string, occupancy: Occupancy[], capacity: number): (Interval & {remaining: number})[] {
  const hours=bookingHours(day); if(!hours) return [];
  const start=Date.parse(hours.starts_at), end=Date.parse(hours.ends_at);
  const relevant=occupancy.filter(o=>overlaps(o,hours));
  const points=[...new Set([start,end,...relevant.flatMap(o=>[Math.max(start,Date.parse(o.starts_at)),Math.min(end,Date.parse(o.ends_at))])])].sort((a,b)=>a-b);
  const segments:(Interval & {remaining:number})[]=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i], b=points[i+1];
    const active=relevant.filter(o=>Date.parse(o.starts_at)<b&&Date.parse(o.ends_at)>a);
    const remaining=active.some(o=>o.kind==='block')?0:Math.max(0,capacity-active.length);
    if(!remaining)continue;
    const last=segments.at(-1);
    if(last&&Date.parse(last.ends_at)===a&&last.remaining===remaining)last.ends_at=new Date(b).toISOString();
    else segments.push({starts_at:new Date(a).toISOString(),ends_at:new Date(b).toISOString(),remaining});
  }
  return segments;
}
export function hasCapacity(interval: Interval, occupancy: Occupancy[], capacity: number): boolean {
  const touching=occupancy.filter(o=>overlaps(o,interval));
  if(touching.some(o=>o.kind==='block'))return false;
  const points=[Date.parse(interval.starts_at),...touching.map(o=>Math.max(Date.parse(o.starts_at),Date.parse(interval.starts_at)))];
  return points.every(t=>touching.filter(o=>Date.parse(o.starts_at)<=t&&Date.parse(o.ends_at)>t).length<capacity);
}
export function appointmentInterval(start: string, durationMinutes: number): Interval {
  return {starts_at:new Date(start).toISOString(),ends_at:new Date(Date.parse(start)+durationMinutes*60000).toISOString()};
}
export function validAppointment(interval: Interval, now: Date, noticeHours: number): boolean {
  if(!Number.isFinite(Date.parse(interval.starts_at))||!Number.isFinite(Date.parse(interval.ends_at)))return false;
  const day=localDay(interval.starts_at), hours=workingHours(day), extended=bookingHours(day);
  const start=Date.parse(interval.starts_at), end=Date.parse(interval.ends_at);
  if(!hours||!extended||start<Date.parse(hours.starts_at)||start>=Date.parse(hours.ends_at)||end>Date.parse(extended.ends_at)||end<=start)return false;
  const minute=Number(formatInTimeZone(new Date(interval.starts_at),TIME_ZONE,'m'));
  if(minute%START_INTERVAL||new Date(interval.starts_at).getUTCSeconds()||new Date(interval.starts_at).getUTCMilliseconds())return false;
  return Date.parse(interval.starts_at)>=now.getTime()+noticeHours*3600000&&localDay(interval.starts_at)<nextDay(localDay(now),BOOKING_HORIZON_DAYS);
}
export function availableAppointments(durationMinutes: number, occupancy: Occupancy[], capacity: number, now: Date, noticeHours: number): AppointmentOption[] {
  const result:AppointmentOption[]=[];
  for(let i=0;i<BOOKING_HORIZON_DAYS;i++){
    const day=nextDay(localDay(now),i), hours=workingHours(day), extended=bookingHours(day);
    if(!hours||!extended)continue;
    for(let t=Date.parse(hours.starts_at);t<Date.parse(hours.ends_at)&&t+durationMinutes*60000<=Date.parse(extended.ends_at);t+=START_INTERVAL*60000){
      const interval=appointmentInterval(new Date(t).toISOString(),durationMinutes);
      if(validAppointment(interval,now,noticeHours)&&hasCapacity(interval,occupancy,capacity))result.push({...interval,id:interval.starts_at});
    }
  }
  return result;
}
export function serviceDuration(service: string, addons: QuoteInput['addons'], config: SchedulingConfig) {
  if(!(['standard','deep','move'] as string[]).includes(service))throw new Error('Choose the reserved duration for this commercial appointment.');
  return estimateMinutes({service:service as Service,addons},config);
}
