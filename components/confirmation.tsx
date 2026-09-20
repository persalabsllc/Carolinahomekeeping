'use client';
import {useSearchParams} from 'next/navigation';
import {useEffect,useState} from 'react';
import {Clock3} from 'lucide-react';
import {CTA} from './ui';
import {type PricingConfig,services,frequencies} from '@/lib/pricing';
import {BookingSuccess,type ConfirmedBooking} from './booking-success';
type Result=Partial<ConfirmedBooking>&{status?:string;error?:string};
export function Confirmation({discounts}:{discounts:PricingConfig['discounts']}){
  const id=useSearchParams().get('session_id');const [result,setResult]=useState<Result>({status:'loading'});
  useEffect(()=>{let cancelled=false;let attempts=0;let timer:ReturnType<typeof setTimeout>;
    setResult({status:'loading'});
    async function check(){try{const r=await fetch('/api/booking-status?session_id='+encodeURIComponent(id||''),{cache:'no-store'});const data=await r.json();if(cancelled)return;setResult(data);if((data.status==='pending'||r.status>=500)&&attempts++<5)timer=setTimeout(check,3000);}catch{if(!cancelled)setResult({error:'We couldn’t check your payment. Please refresh in a moment. Do not pay again.'});}}
    void check();return()=>{cancelled=true;clearTimeout(timer)};
  },[id]);
  const confirmed=result.status==='confirmed'&&result.reference&&services.includes(result.service!)&&frequencies.includes(result.frequency!)&&typeof result.amount==='number'&&result.slot?.starts_at;
  return <section className="container content-section">{confirmed?<BookingSuccess booking={result as ConfirmedBooking} discounts={discounts}/>:<div className="success-panel"><Clock3 size={40} aria-hidden="true"/><h1 className="confirmation-pending">{result.status==='expired'?'Checkout has expired.':result.error?'Let’s check your booking.':'Checking your payment.'}</h1><p>{result.error||(result.status==='expired'?'No booking was confirmed from this checkout. Please choose a new appointment.':'We’re verifying your payment. If this takes a moment, check your confirmation email or contact us. Please don’t pay again.')}</p><CTA href={result.status==='expired'?'/book':'/contact'}>{result.status==='expired'?'Get my instant price':'Contact us'}</CTA></div>}</section>;
}
