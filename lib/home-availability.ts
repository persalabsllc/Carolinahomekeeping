import {db} from './db';
import {canBook,getConfig} from './config';
import {getScheduling,getScheduleSnapshot} from './schedule-store';
import {buildAvailabilityHighlights,unavailableHighlights} from './availability-highlights';

export async function getHomeAvailability(){
  if(!process.env.DATABASE_URL)return unavailableHighlights();
  try{
    const [pricing,scheduling,snapshot]=await Promise.all([getConfig(),getScheduling(),getScheduleSnapshot(db())]);
    // Calendar openings are real even during prelaunch; the UI separately states
    // when online booking is not yet open. This never enables checkout.
    return buildAvailabilityHighlights(snapshot,scheduling,pricing.leadHours,canBook());
  }catch(error){
    console.error('Homepage availability unavailable:',error instanceof Error?error.name:'UnknownError');
    return unavailableHighlights();
  }
}
