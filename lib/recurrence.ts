import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
import {TIME_ZONE,localDay,nextDay,dayBounds,appointmentInterval,overlaps,hasCapacity,type Occupancy,type Interval} from './scheduling';
import type {Frequency} from './pricing';
export const intervalWeeks=(frequency:Frequency)=>({once:0,weekly:1,two_weeks:2,four_weeks:4})[frequency];
export type SeriesRule={id:string;anchorStart:string;durationMinutes:number;weeks:number;firstIndex?:number;endBefore?:string|null;kind:'booking'|'hold';label?:string;planId?:string};
export type ScheduleSnapshot={fixed:Occupancy[];series:SeriesRule[];overrides:{planId:string;index:number}[]};
export function occurrenceStart(anchorStart:string,weeks:number,index:number){
 const day=nextDay(localDay(anchorStart),weeks*7*index);
 return fromZonedTime(day+'T'+formatInTimeZone(new Date(anchorStart),TIME_ZONE,'HH:mm:ss'),TIME_ZONE).toISOString();
}
export function occurrenceIndex(anchorStart:string,weeks:number,date:string){
 return Math.round((Date.parse(localDay(date))-Date.parse(localDay(anchorStart)))/(weeks*7*86400000));
}
export function occurrences(rule:SeriesRule,from:string,through:string):(Interval&{index:number})[]{
 if(![1,2,4].includes(rule.weeks))return [];
 const first=Math.max(rule.firstIndex||0,Math.floor((Date.parse(localDay(from))-Date.parse(localDay(rule.anchorStart)))/(rule.weeks*7*86400000))-1);
 const result:(Interval&{index:number})[]=[];
 for(let index=first;;index++){
  const start=occurrenceStart(rule.anchorStart,rule.weeks,index);
  if(start>=through||(rule.endBefore&&start>=rule.endBefore))break;
  const interval=appointmentInterval(start,rule.durationMinutes);
  if(overlaps(interval,{starts_at:from,ends_at:through}))result.push({...interval,index});
 }
 return result;
}
export function occupancyForRange(snapshot:ScheduleSnapshot,from:string,through:string):Occupancy[]{
 const range={starts_at:from,ends_at:through},overridden=new Set(snapshot.overrides.map(o=>`${o.planId}:${o.index}`));
 return [...snapshot.fixed.filter(o=>overlaps(o,range)),...snapshot.series.flatMap(rule=>occurrences(rule,from,through).filter(o=>!rule.planId||!overridden.has(`${rule.planId}:${o.index}`)).map(o=>({id:`${rule.id}:${o.index}`,kind:rule.kind,label:rule.label||'Recurring cleaning',starts_at:o.starts_at,ends_at:o.ends_at})))];
}
// 1/2/4-week patterns repeat every 28 days. Check each series boundary plus finite
// bookings/blocks and exceptions; this protects the ongoing pattern beyond a UI horizon.
export function criticalRanges(snapshot:ScheduleSnapshot,from:string):Interval[]{
 const boundaries=[from,...snapshot.series.map(s=>s.anchorStart),...snapshot.overrides.flatMap(o=>{const s=snapshot.series.find(s=>s.planId===o.planId);return s?[occurrenceStart(s.anchorStart,s.weeks,o.index+1)]:[]})].filter(d=>d>=from);
 return [...boundaries.map(d=>({starts_at:d,ends_at:dayBounds(nextDay(localDay(d),29)).starts_at})),...snapshot.fixed.filter(o=>o.ends_at>from)];
}
function mergeRanges(ranges:Interval[]){
 const merged:Interval[]=[];
 for(const range of ranges.sort((a,b)=>a.starts_at.localeCompare(b.starts_at))){
  const last=merged.at(-1);
  if(last&&range.starts_at<=last.ends_at){if(range.ends_at>last.ends_at)last.ends_at=range.ends_at;}
  else merged.push({...range});
 }
 return merged;
}
// Project occupied intervals once for an availability response, rather than repeating
// date/time-zone work for every start option. The final 29 days cover all cadences.
export function seriesCapacityChecker(snapshot:ScheduleSnapshot,capacity:number,firstStart:string,lastStart=firstStart){
 const ranges=mergeRanges([...criticalRanges(snapshot,firstStart),{starts_at:firstStart,ends_at:dayBounds(nextDay(localDay(lastStart),29)).starts_at}]);
 const prepared=ranges.map(range=>({range,occupied:occupancyForRange(snapshot,range.starts_at,range.ends_at)}));
 return (proposed:SeriesRule)=>{
  for(const {range,occupied} of prepared){
   for(const interval of occurrences(proposed,range.starts_at,range.ends_at)){
    if(!hasCapacity(interval,occupied,capacity))return false;
   }
  }
  return true;
 };
}
export function hasSeriesCapacity(proposed:SeriesRule,snapshot:ScheduleSnapshot,capacity:number){
 return seriesCapacityChecker(snapshot,capacity,proposed.anchorStart)(proposed);
}
export function capacityFits(snapshot:ScheduleSnapshot,capacity:number,from:string){
 const withoutBlocks={...snapshot,fixed:snapshot.fixed.filter(o=>o.kind!=='block')};
 return mergeRanges(criticalRanges(withoutBlocks,from)).every(range=>{
  const occupied=occupancyForRange(withoutBlocks,range.starts_at,range.ends_at);
  return occupied.every(o=>occupied.filter(x=>x.starts_at<=o.starts_at&&x.ends_at>o.starts_at).length<=capacity);
 });
}
export function nextRenewal(anchorStart:string,weeks:number){return new Date(Date.parse(occurrenceStart(anchorStart,weeks,1))-86400000).toISOString();}
