'use client';
import {useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {formatInTimeZone} from 'date-fns-tz';
import {localDay,localTime,nextDay,dayBounds,workingHours,availableSegments,overlaps,type Occupancy,type SchedulingConfig} from '@/lib/scheduling';
export function ScheduleCalendar({occupancy,config,onBooking}:{occupancy:Occupancy[];config:SchedulingConfig;onBooking:(id:string)=>void}) {
  const today=localDay(new Date());
  const [anchor,setAnchor]=useState(today);
  const [view,setView]=useState('week');
  const date=new Date(anchor+'T12:00:00Z');
  const first=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1,12)).toISOString().slice(0,10);
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0,12));
  const start=view==='month'?nextDay(first,-new Date(first+'T12:00:00Z').getUTCDay()):view==='week'?nextDay(anchor,-date.getUTCDay()):anchor;
  const end=view==='month'?nextDay(last.toISOString().slice(0,10),6-last.getUTCDay()):view==='week'?nextDay(start,6):anchor;
  const days:string[]=[];for(let d=start;d<=end;d=nextDay(d))days.push(d);
  const move=(n:number)=>setAnchor(view==='month'?new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+n,1,12)).toISOString().slice(0,10):nextDay(anchor,n*(view==='week'?7:1)));
  return <section className="admin-section">
    <div className="calendar-controls"><div className="actions-inline"><button className="button small outline" aria-label="Previous period" onClick={()=>move(-1)}><ChevronLeft size={17}/></button><button className="button small outline" onClick={()=>setAnchor(today)}>Today</button><button className="button small outline" aria-label="Next period" onClick={()=>move(1)}><ChevronRight size={17}/></button></div><h2>{formatInTimeZone(date,'UTC',view==='month'?'MMMM yyyy':'MMM d, yyyy')}</h2><select className="input" style={{width:120}} aria-label="Calendar view" value={view} onChange={e=>setView(e.target.value)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></div>
    <div className="calendar-legend"><span className="open">Open time</span><span className="booking">Booked</span><span className="hold">In checkout</span><span className="block">Blocked</span><span>Eastern time · {config.teamCapacity} {config.teamCapacity===1?'team':'teams'}</span></div>
    <div className="table-scroll"><div className={'schedule-calendar '+(view==='day'?'single-day':'')}>
      {view!=='day'&&['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div className="calendar-label" key={day}>{day}</div>)}
      {days.map(day=>{
        const hours=workingHours(day),bounds=dayBounds(day);
        const occupied=occupancy.filter(o=>overlaps(o,bounds));
        const free=availableSegments(day,occupancy,config.teamCapacity);
        const items=[...occupied.map(o=>({...o,remaining:0})),...free.map((o,i)=>({...o,id:'open-'+i,kind:'open' as const,label:'',booking_id:undefined}))].sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
        return <div className={'schedule-day '+(day.slice(0,7)!==anchor.slice(0,7)?'muted-day':'')} key={day} aria-label={day}>
          <button className={'calendar-date '+(day===today?'today':'')} onClick={()=>{setAnchor(day);setView('day')}}>{formatInTimeZone(new Date(day+'T12:00:00Z'),'UTC',view==='day'?'EEEE, MMMM d':'d')}</button>
          {!hours&&<p className="calendar-closed">Closed Sunday</p>}
          {items.map(o=><button key={o.kind+o.id} type="button" className={'calendar-event '+o.kind} disabled={o.kind!=='booking'} onClick={()=>o.booking_id&&onBooking(o.booking_id)}><strong>{localTime(o.starts_at)}–{localTime(o.ends_at)}</strong><span>{o.kind==='open'?`${o.remaining} ${o.remaining===1?'team':'teams'} available`:o.kind==='hold'?'Checkout reservation':o.label||'Blocked'}</span></button>)}
          {hours&&!items.length&&<p className="calendar-closed">No free time</p>}
        </div>;
      })}
    </div></div>
    <p className="small-text" style={{padding:18}}>Open time is shared with online scheduling. A customer only sees starts that fit their entire cleaning before closing. Checkout holds stay reserved until payment is confirmed or Stripe confirms expiry.</p>
  </section>;
}
