import {getConfig,readiness} from '@/lib/config';
import {BookingFlow} from '@/components/booking-flow';
export const metadata={title:'Get My Instant Price',robots:{index:false,follow:true}};
export const dynamic='force-dynamic';
export default async function Book({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <BookingFlow config={await getConfig()} initial={await searchParams} leadReady={readiness().database}/>;}
