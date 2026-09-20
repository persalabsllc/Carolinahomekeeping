import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PGlite} from '@electric-sql/pglite';
import {fromZonedTime} from 'date-fns-tz';
import {applyOwnerLaunchSchedule} from '../lib/owner-launch-schedule';
import {getScheduling,lockSchedule,reserveInterval,type ScheduleSql} from '../lib/schedule-store';
import {defaultScheduling,availableAppointments,localDay,nextDay,workingHours,appointmentInterval} from '../lib/scheduling';
import {occurrenceStart,hasSeriesCapacity} from '../lib/recurrence';
import {businessContact} from '../lib/business-contact';
import {ScheduleCalendar} from '../components/schedule-calendar';
import {SchedulingEditor} from '../components/scheduling-editor';
import {defaultConfig} from '../lib/pricing';

const eastern=(s:string)=>fromZonedTime(s,'America/New_York').toISOString();
const adapter=(database:{query:(q:string,params?:any[])=>Promise<any>})=>({unsafe:async(q:string,params:any[]=[]) => (await database.query(q,params)).rows}) as ScheduleSql;
async function database(){
 const db=new PGlite();
 for(const file of ['db/001_initial.sql','db/002_duration_scheduling.sql','db/004_subscriptions.sql'])await db.exec(readFileSync(file,'utf8'));
 return db;
}

test('all cleaning lengths offer only Thursdays and Sundays; recurring plans keep that weekday',()=>{
 const now=new Date(eastern('2026-09-20T08:00:00'));
 for(const minutes of [120,180,215,240]){
  const slots=availableAppointments(minutes,[],1,now,24);
  assert.ok(slots.length>0);
  assert.deepEqual([...new Set(slots.map(s=>new Date(localDay(s.starts_at)+'T12:00:00Z').getUTCDay()))].sort(),[0,4]);
 }
 for(const day of ['2026-09-24','2026-09-27'])for(const weeks of [1,2,4]){
  const anchorStart=eastern(day+'T09:00:00');
  for(let index=0;index<12;index++)assert.ok(workingHours(localDay(occurrenceStart(anchorStart,weeks,index))));
  const existing={id:'existing',planId:'existing',anchorStart,durationMinutes:120,weeks,kind:'booking' as const};
  assert.equal(hasSeriesCapacity({...existing,id:'new'}, {fixed:[],series:[existing],overrides:[]},1),false);
 }
});

test('published hours and Control Room calendar distinguish unavailable days from booked jobs',()=>{
 assert.deepEqual(businessContact.hours,[{days:'Thursday & Sunday',times:'8 AM–5 PM'},{days:'Other days',times:'Unavailable'}]);
 const calendar=renderToStaticMarkup(createElement(ScheduleCalendar,{occupancy:[],config:defaultScheduling,onBooking:()=>{}}));
 assert.equal((calendar.match(/class="calendar-closed">Unavailable/g)||[]).length,5);
 assert.equal((calendar.match(/class="calendar-event open"/g)||[]).length,2);
 assert.doesNotMatch(calendar,/class="calendar-event booking"|Closed Sunday|Booked full/);
 const editor=renderToStaticMarkup(createElement(SchedulingEditor,{config:defaultScheduling,pricing:defaultConfig,busy:false,onSave:async()=>true}));
 assert.match(editor,/Thursday and Sunday: 8 AM–5 PM Eastern/);
 assert.match(editor,/may finish by 6 PM/);
 assert.doesNotMatch(editor,/Sunday: closed|Monday–Friday/);
});

test('one-time solo capacity migration preserves customized pricing, duration, and existing out-of-hours bookings',async()=>{
 const db=await database();
 try{
  const custom={...defaultScheduling,teamCapacity:2,serviceMinutes:{standard:150,deep:210,move:270},addonMinutes:{...defaultScheduling.addonMinutes,windows:4}};
  await db.query("insert into settings(key,value) values('scheduling',$1),('pricing',$2)",[JSON.stringify(custom),JSON.stringify(defaultConfig)]);
  const customer=await db.query<{id:string}>("insert into customers(name,email,phone) values('QA only','qa@example.invalid','2525550100') returning id");
  const home=await db.query<{id:string}>("insert into homes(customer_id,address,city,zip) values($1,'QA only','New Bern','28562') returning id",[customer.rows[0].id]);
  let day=nextDay(localDay(new Date()),7);while(new Date(day+'T12:00:00Z').getUTCDay()!==1)day=nextDay(day);
  const slot=await db.query<{id:string}>("insert into appointment_slots(starts_at,ends_at,capacity) values($1,$2,1) returning id",[eastern(day+'T09:00:00'),eastern(day+'T11:00:00')]);
  await db.query("insert into bookings(reference,customer_id,home_id,slot_id,service,frequency,amount,quote,details,internal_notes) values('QA-PRESERVED',$1,$2,$3,'standard','once',15900,'{}','{}','Keep this booking')",[customer.rows[0].id,home.rows[0].id,slot.rows[0].id]);
  const before=await db.query('select * from bookings');
  assert.equal(await db.transaction(tx=>applyOwnerLaunchSchedule(adapter(tx))),true);
  assert.deepEqual(await getScheduling(adapter(db)),{...custom,teamCapacity:1});
  assert.deepEqual((await db.query('select * from bookings')).rows,before.rows);
  assert.deepEqual((await db.query<{value:unknown}>("select value from settings where key='pricing'")).rows[0].value,defaultConfig);
  // A future owner change must not be undone on every deployment.
  await db.query("update settings set value=jsonb_set(value,'{teamCapacity}','2') where key='scheduling'");
  assert.equal(await db.transaction(tx=>applyOwnerLaunchSchedule(adapter(tx))),false);
  assert.equal((await getScheduling(adapter(db))).teamCapacity,2);
 }finally{await db.close();}
});

test('solo capacity migration refuses overlapping checkout holds without altering data',async()=>{
 const db=await database();
 try{
  await db.query("insert into settings(key,value) values('scheduling',$1)",[JSON.stringify({...defaultScheduling,teamCapacity:2})]);
  const leads=await db.query<{id:string}>("insert into leads(token_hash,type,email,stage) values('QA-A','residential','a@example.invalid','payment'),('QA-B','residential','b@example.invalid','payment') returning id");
  let day=nextDay(localDay(new Date()),7);while(!workingHours(day))day=nextDay(day);
  const visit=appointmentInterval(eastern(day+'T09:00:00'),120);
  const slot=await db.query<{id:string}>('insert into appointment_slots(starts_at,ends_at,capacity) values($1,$2,2) returning id',[visit.starts_at,visit.ends_at]);
  for(let i=0;i<2;i++)await db.query("insert into checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote) values($1,$2,$3,'open',now()+interval '35 minutes','{}','{}')",[leads.rows[i].id,slot.rows[0].id,'QA-HOLD-'+i]);
  await assert.rejects(db.transaction(tx=>applyOwnerLaunchSchedule(adapter(tx))),/overlapping reservations require review/);
  assert.equal((await getScheduling(adapter(db))).teamCapacity,2);
  assert.equal((await db.query('select * from checkout_holds')).rows.length,2);
  assert.equal((await db.query("select key from settings where key='owner_schedule_thursday_sunday_20260920'")).rows.length,0);
 }finally{await db.close();}
});

test('server reservations reject every closed weekday for one-time and recurring bookings',async()=>{
 const db=await database();
 try{
  const first=nextDay(localDay(new Date()),7);
  for(let i=0;i<7;i++){
   const day=nextDay(first,i);
   for(const frequency of ['once','weekly','two_weeks','four_weeks'] as const){
    const reserve=()=>db.transaction(async tx=>{const sql=adapter(tx);await lockSchedule(sql);return reserveInterval(sql,eastern(day+'T09:00:00'),120,defaultScheduling,0,undefined,frequency)});
    if(workingHours(day))assert.ok(await reserve());
    else await assert.rejects(reserve(),/does not fit our available hours/);
   }
  }
  assert.equal((await db.query('select * from appointment_slots')).rows.length,2);
  assert.equal((await db.query('select * from bookings')).rows.length,0);
 }finally{await db.close();}
});
