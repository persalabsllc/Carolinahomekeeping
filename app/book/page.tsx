import {getConfig,readiness} from '@/lib/config';
import {BookingFlow} from '@/components/booking-flow';
import {getScheduling} from '@/lib/schedule-store';
export const metadata={title:'Get My Instant Price',robots:{index:false,follow:true}};
export const dynamic='force-dynamic';
export default async function Book({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <BookingFlow config={await getConfig()} scheduling={await getScheduling()} initial={await searchParams} leadReady={readiness().database}/>;}
