'use client';
import {useState} from 'react';
import {localDay,localTime,type AppointmentOption} from '@/lib/scheduling';
import {formatInTimeZone} from 'date-fns-tz';
export function AppointmentPicker({slots,value,onChange}:{slots:AppointmentOption[];value:string;onChange:(id:string)=>void}) {
  const [chosenDay,setChosenDay]=useState('');
  const days=[...new Set(slots.map(s=>localDay(s.starts_at)))];
  const selected=slots.find(s=>s.id===value);
  const activeDay=selected?localDay(selected.starts_at):days.includes(chosenDay)?chosenDay:days[0];
  return <>
    <label className="field"><span>Appointment date</span><select value={activeDay||''} onChange={e=>{setChosenDay(e.target.value);onChange('');}}>
      {days.map(day=><option key={day} value={day}>{formatInTimeZone(new Date(day+'T12:00:00Z'),'America/New_York','EEEE, MMMM d, yyyy')}</option>)}
    </select></label>
    <div className="slot-list">{slots.filter(s=>localDay(s.starts_at)===activeDay).map(s=><button className={'slot-choice '+(value===s.id?'selected':'')} aria-pressed={value===s.id} type="button" onClick={()=>onChange(s.id)} key={s.id}><strong>{localTime(s.starts_at)} start</strong></button>)}</div>
  </>;
}
