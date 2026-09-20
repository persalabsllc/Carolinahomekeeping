import {formatInTimeZone} from 'date-fns-tz';
import {occupancyForRange,type ScheduleSnapshot} from './recurrence';
import {availableAppointments,dayBounds,estimateMinutes,localDay,nextDay,TIME_ZONE,type SchedulingConfig} from './scheduling';

export const HIGHLIGHT_DAYS = 14;
export const HIGHLIGHT_REFRESH_MS = 30_000;
export const HIGHLIGHT_MAX_AGE_MS = 65_000;
export type AvailabilityHighlight = {
  startsAt:string;
  endsAt:string;
  label:string;
  dateLabel:string;
  timeLabel:string;
};
export type AvailabilityHighlights = {
  status:'available'|'full'|'unavailable';
  slots:AvailabilityHighlight[];
  checkedAt:string;
  durationMinutes:number|null;
  bookingOpen:boolean;
};

export function unavailableHighlights(now=new Date()):AvailabilityHighlights {
  return {status:'unavailable',slots:[],checkedAt:now.toISOString(),durationMinutes:null,bookingOpen:false};
}

/** Public schedule summary only: never return customer names, notes or internal IDs. */
export function buildAvailabilityHighlights(snapshot:ScheduleSnapshot,scheduling:SchedulingConfig,noticeHours:number,bookingOpen:boolean,now=new Date()):AvailabilityHighlights {
  const day=localDay(now);
  const occupancy=occupancyForRange(snapshot,dayBounds(day).starts_at,dayBounds(nextDay(day,HIGHLIGHT_DAYS)).starts_at);
  const durationMinutes=estimateMinutes({service:'standard',addons:{}},scheduling);
  const candidates=availableAppointments(durationMinutes,occupancy,scheduling.teamCapacity,now,noticeHours,HIGHLIGHT_DAYS);
  const slots:AvailabilityHighlight[]=[];
  const windows=new Set<string>();
  for(const slot of candidates){
    const start=new Date(slot.starts_at);
    const period=Number(formatInTimeZone(start,TIME_ZONE,'H'))<12?'morning':'afternoon';
    const key=localDay(start)+':'+period;
    // Show different windows, and never advertise two overlapping visits.
    if(windows.has(key)||slots.some(s=>slot.starts_at<s.endsAt&&slot.ends_at>s.startsAt))continue;
    slots.push({startsAt:slot.starts_at,endsAt:slot.ends_at,label:formatInTimeZone(start,TIME_ZONE,'EEEE')+' '+period,dateLabel:formatInTimeZone(start,TIME_ZONE,'MMM d'),timeLabel:formatInTimeZone(start,TIME_ZONE,'h:mm a')});
    windows.add(key);
    if(slots.length===2)break;
  }
  return {status:slots.length?'available':'full',slots,checkedAt:now.toISOString(),durationMinutes,bookingOpen};
}
