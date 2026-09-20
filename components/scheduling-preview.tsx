'use client';
import {useState} from 'react';
import {ScheduleCalendar} from './schedule-calendar';
import {AppointmentPicker} from './appointment-picker';
import {defaultScheduling,availableAppointments,estimateMinutes,localDay,nextDay,workingHours,appointmentInterval,durationLabel,type Occupancy} from '@/lib/scheduling';
import type {Service} from '@/lib/pricing';
export function SchedulingPreview(){
 const [service,setService]=useState<Service>('standard');const [extras,setExtras]=useState(0);const [selected,setSelected]=useState('');const [clicked,setClicked]=useState('');
 let day=nextDay(localDay(new Date()));while(new Date(day+'T12:00:00Z').getUTCDay()!==1)day=nextDay(day);
 const opening=workingHours(day)!;
 const at=(minutes:number)=>new Date(Date.parse(opening.starts_at)+minutes*60000).toISOString();
 const occupancy:Occupancy[]=[{id:'qa-booking',booking_id:'qa-booking',kind:'booking',label:'Sample deep clean',...appointmentInterval(at(60),240)},{id:'qa-hold',kind:'hold',...appointmentInterval(at(360),60)},{id:'qa-block',kind:'block',label:'Sample team time off',...appointmentInterval(at(24*60),60)}];
 const duration=estimateMinutes({service,addons:{linens:extras}},defaultScheduling);
 const slots=availableAppointments(duration,occupancy,1,new Date(),24);
 return <div className="container" style={{paddingBlock:30}}><h1 style={{fontSize:40}}>Private scheduling QA</h1><p>No customer data or reservations. Uses the production scheduling components and calculation.</p><div className="panel" style={{maxWidth:620,marginBlock:25}}><label className="field"><span>Cleaning type</span><select value={service} onChange={e=>{setService(e.target.value as Service);setSelected('')}}><option value="standard">Standard</option><option value="deep">Deep</option><option value="move">Move</option></select></label><label className="field"><span>Add-on units</span><input type="number" value={extras} min={0} max={8} onChange={e=>{setExtras(Number(e.target.value));setSelected('')}}/></label><p style={{marginBottom:20}}>Reserved time: {durationLabel(duration)}</p><AppointmentPicker slots={slots} value={selected} onChange={setSelected}/><p role="status">{selected?'Selected: '+selected:'Choose a time'}</p></div><ScheduleCalendar occupancy={occupancy} config={defaultScheduling} onBooking={setClicked}/><p>{clicked?'Selected sample booking':''}</p></div>;
}
