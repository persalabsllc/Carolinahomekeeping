import {cookies} from 'next/headers';
import {buildAvailabilityHighlights,unavailableHighlights,HIGHLIGHT_DAYS} from '@/lib/availability-highlights';
import {defaultScheduling,dayBounds,localDay,nextDay,workingHours} from '@/lib/scheduling';
export const dynamic='force-dynamic';
export async function GET(){
const scenario=(await cookies()).get('qa-calendar')?.value;
if(scenario==='error')return Response.json(unavailableHighlights(),{status:503,headers:{'Cache-Control':'no-store'}});
const now=new Date();const snapshot={fixed:[] as any[],series:[],overrides:[]};
const first=buildAvailabilityHighlights(snapshot,defaultScheduling,24,true,now).slots[0];
if(scenario==='busy'&&first){const hours=workingHours(localDay(first.startsAt))!;snapshot.fixed.push({id:'qa-only',kind:'block',starts_at:hours.starts_at,ends_at:new Date(Date.parse(hours.starts_at)+4*3600000).toISOString()});}
if(scenario==='full')snapshot.fixed.push({id:'qa-only',kind:'block',starts_at:dayBounds(localDay(now)).starts_at,ends_at:dayBounds(nextDay(localDay(now),HIGHLIGHT_DAYS)).starts_at});
return Response.json(buildAvailabilityHighlights(snapshot,defaultScheduling,24,true,now),{headers:{'Cache-Control':'no-store'}});
}