'use client';
import {useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {money,serviceNames,frequencyNames,type PricingConfig,type QuoteInput,type Quote} from '@/lib/pricing';
import {slotDate,slotTime} from '@/lib/appointment-display';
import type {AppointmentOption} from '@/lib/scheduling';

export function BookingSummary({config,input,quote,selectedSlot,revealed,compact=false}:{config:PricingConfig;input:QuoteInput;quote:Quote|null;selectedSlot?:AppointmentOption;revealed:boolean;compact?:boolean}){
  const [expanded,setExpanded]=useState(false);
  const summary=useRef<HTMLElement>(null);
  const priced=revealed&&quote&&!quote.review;
  function toggle(fromBar=false){
    setExpanded(!expanded);
    if(fromBar&&!expanded)requestAnimationFrame(()=>summary.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  if(compact&&!revealed)return null;
  return <><aside className={compact?'booking-summary compact-summary':'booking-summary'} id="price-summary" ref={summary} aria-label="Your cleaning summary">
    <div className="summary-desktop-title"><p className="eyebrow">Your home, handled.</p><h2>Your cleaning</h2></div>
    <button className="summary-toggle" type="button" onClick={()=>toggle()} aria-expanded={expanded} aria-controls="price-summary-details"><span>Your cleaning<small>{expanded?'Hide details':'View details'}</small></span>{compact&&priced&&<strong>{money(quote.total)}</strong>}<ChevronDown size={20} className={expanded?'rotated':''}/></button>
    <div className="summary-details" id="price-summary-details" data-expanded={expanded}>
      {!revealed?<p className="summary-empty">Tell us about your home to see your price. No calls or estimates to wait for.</p>:priced?<>
        <div className="summary-row"><span>{serviceNames[input.service]}</span><span>{money(quote.base)}</span></div>
        <p className="summary-size">{config.tiers.find(t=>input.sqft<=t.maxSqft)?.label}</p>
        {quote.roomAdjustment>0&&<div className="summary-row"><span>Room adjustments</span><span>{money(quote.roomAdjustment)}</span></div>}
        {quote.addons.map(a=><div className="summary-row" key={a.id}><span>{a.quantity} × {a.name}</span><span>{money(a.amount)}</span></div>)}
        {quote.discount>0&&<div className="summary-row discount"><span>Recurring savings ({quote.discountPercent}%)</span><span>−{money(quote.discount)}</span></div>}
        {!!quote.recoveryDiscount&&<div className="summary-row discount"><span>Welcome-back savings ({quote.recoveryPercent}%)</span><span>−{money(quote.recoveryDiscount)}</span></div>}
        {quote.tax>0&&<div className="summary-row"><span>Tax on selected extras</span><span>{money(quote.tax)}</span></div>}
        <div className="summary-total"><span>Total for this visit</span><strong aria-live="polite">{money(quote.total)}</strong></div>
        {!!quote.recoveryDiscount&&input.frequency!=='once'&&<p className="summary-appointment">Then {money(quote.regularTotal??quote.total)} {frequencyNames[input.frequency].toLowerCase()}.</p>}
        {selectedSlot&&<p className="summary-appointment">{slotDate(selectedSlot.starts_at)}<br/>{slotTime(selectedSlot.starts_at)} start · Eastern</p>}
      </>:<p className="summary-empty">{quote?.reason||'Please review your selections.'}</p>}
      <p className="summary-note">No hidden mandatory fees.<br/>Your full price is shown before payment.</p>
      <p className="summary-appointment">An included area missed? Let us know within 24 hours so we can make it right.</p>
    </div>
  </aside>{priced&&<div className="mobile-price"><span>This visit</span><button type="button" onClick={()=>toggle(true)} aria-expanded={expanded} aria-controls="price-summary-details" aria-label={`${expanded?'Hide':'View'} price details, ${money(quote.total)}`}><strong aria-live="polite">{money(quote.total)}</strong><ChevronDown size={17} className={expanded?'rotated':''}/></button></div>}</>;
}
