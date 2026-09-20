import {getConfig} from '@/lib/config';
import {Suspense} from 'react';
import {Confirmation} from '@/components/confirmation';
export const metadata={title:'Your Booking',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function Confirmed(){const config=await getConfig();return <Suspense fallback={<p className="loading">Checking your booking…</p>}><Confirmation discounts={config.discounts}/></Suspense>;}
