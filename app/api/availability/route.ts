import {db} from '@/lib/db';
import {getConfig,canBook} from '@/lib/config';
import {getScheduling,readOccupancy} from '@/lib/schedule-store';
import {availableAppointments,estimateMinutes,localDay,nextDay,dayBounds,BOOKING_HORIZON_DAYS} from '@/lib/scheduling';
import {calculateQuote,quoteSchema} from '@/lib/pricing';
import {checkOrigin,rateLimit,apiError} from '@/lib/security';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
  checkOrigin(req);
  if(!canBook())return Response.json({slots:[],open:false},{headers:{'Cache-Control':'no-store'}});
  await rateLimit(req,'availability',60);
  const input=quoteSchema.parse(await req.json());
  const [pricing,scheduling]=await Promise.all([getConfig(),getScheduling()]);
  if(calculateQuote(input,pricing).review)throw new Error('This cleaning needs a personal plan before scheduling.');
  const now=new Date(),day=localDay(now),durationMinutes=estimateMinutes(input,scheduling);
  const occupancy=await readOccupancy(db(),dayBounds(day).starts_at,dayBounds(nextDay(day,BOOKING_HORIZON_DAYS)).starts_at);
  const slots=availableAppointments(durationMinutes,occupancy,scheduling.teamCapacity,now,pricing.leadHours);
  return Response.json({slots,open:true,durationMinutes},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
