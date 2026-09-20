'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,CalendarDays} from 'lucide-react';
import {HIGHLIGHT_REFRESH_MS,HIGHLIGHT_MAX_AGE_MS,unavailableHighlights,type AvailabilityHighlights} from '@/lib/availability-highlights';

export function LiveAvailability({initial,bookingHref='/book'}:{initial:AvailabilityHighlights;bookingHref?:string}){
  const [value,setValue]=useState(initial);
  useEffect(()=>{
    let alive=true;
    let inFlight=false;
    let controller:AbortController|undefined;
    async function refresh(){
      if(document.visibilityState==='hidden'||inFlight)return;
      inFlight=true;
      controller=new AbortController();
      const timeout=setTimeout(()=>controller?.abort(),8_000);
      try{
        const response=await fetch('/api/availability/highlights',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Availability unavailable');
        const next:AvailabilityHighlights=await response.json();
        if(alive)setValue(next);
      }catch{
        // Remove obsolete claims if the calendar cannot be checked.
        if(alive)setValue(unavailableHighlights());
      }finally{clearTimeout(timeout);inFlight=false;}
    }
    const offline=()=>setValue(unavailableHighlights());
    if(initial.status==='unavailable'||Date.now()-Date.parse(initial.checkedAt)>=HIGHLIGHT_REFRESH_MS)void refresh();
    const interval=setInterval(refresh,HIGHLIGHT_REFRESH_MS);
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
    window.addEventListener('offline',offline);
    return ()=>{alive=false;controller?.abort();clearInterval(interval);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);window.removeEventListener('offline',offline);};
  },[]);
  useEffect(()=>{
    if(value.status==='unavailable')return;
    const remaining=Date.parse(value.checkedAt)+HIGHLIGHT_MAX_AGE_MS-Date.now();
    const expiry=setTimeout(()=>setValue(unavailableHighlights()),Math.max(0,remaining));
    return ()=>clearTimeout(expiry);
  },[value]);
  const available=value.status==='available'&&value.slots.length>0;
  return <section className="container availability-highlight" id="upcoming-openings" aria-labelledby="availability-heading" data-state={value.status}>
    <div className="availability-intro"><p className="eyebrow">A little room in your week</p><h2 id="availability-heading">{available?'Upcoming openings.':'Find your next clean.'}</h2><Link href={bookingHref} className="text-link">Get my instant price <ArrowUpRight size={17} aria-hidden="true"/></Link></div>
    <div className="availability-detail" aria-live="polite" aria-atomic="true">
      {available?<><p className="availability-live"><span aria-hidden="true"/>From our live calendar</p><div className="availability-options">{value.slots.map(slot=><div className="availability-option" key={slot.startsAt}><CalendarDays size={23} strokeWidth={1.4} aria-hidden="true"/><div><h3>{slot.label}</h3><p><time dateTime={slot.startsAt}>{slot.dateLabel} · {slot.timeLabel} start</time></p></div></div>)}</div><p className="availability-note">Standard-clean openings, Eastern time. Final options depend on your home, extras and frequency.</p>{!value.bookingOpen&&<p className="availability-note">See your price and send us your preferred appointment. We’ll confirm it with you before any payment.</p>}</>:<p className="availability-empty">{value.status==='full'?'Looking for a time? See your price and check the calendar for more dates.':'See your instant price, then check available times for your cleaning.'}</p>}
    </div>
  </section>;
}
