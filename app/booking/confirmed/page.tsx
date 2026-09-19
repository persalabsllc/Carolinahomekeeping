import {Suspense} from 'react';
import {Confirmation} from '@/components/confirmation';
export const metadata={title:'Your Booking',robots:{index:false,follow:false}};
export default function Confirmed(){return <Suspense fallback={<p className="loading">Checking your booking…</p>}><Confirmation/></Suspense>;}
