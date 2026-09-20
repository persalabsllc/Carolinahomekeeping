import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fromZonedTime} from 'date-fns-tz';
import {defaultScheduling,defaultAddonMinutes,schedulingSchema,estimateMinutes,workingHours,bookingHours,availableAppointments,appointmentInterval,validAppointment,hasCapacity,availableSegments,localDay,nextDay,type Occupancy} from '../lib/scheduling';
import {calculateQuote,defaultConfig,type QuoteInput} from '../lib/pricing';
import {hasSeriesCapacity} from '../lib/recurrence';
import {getScheduling,lockSchedule,readOccupancy,reserveInterval,type ScheduleSql} from '../lib/schedule-store';
const eastern=(s:string)=>fromZonedTime(s,'America/New_York').toISOString();
const now=new Date('2026-09-20T00:00:00Z');
const block=(start:string,minutes:number,kind:Occupancy['kind']='booking'):Occupancy=>({id:start,kind,...appointmentInterval(eastern(start),minutes)});

test('duration estimates include every paid add-on unit; ordinary bed making remains included',()=>{
 assert.equal(estimateMinutes({service:'standard',addons:{}},defaultScheduling),120);
 assert.equal(estimateMinutes({service:'deep',addons:{}},defaultScheduling),180);
 assert.equal(estimateMinutes({service:'move',addons:{}},defaultScheduling),240);
 assert.equal(estimateMinutes({service:'deep',addons:{oven:1,fridge:1}},defaultScheduling),230);
 assert.equal(estimateMinutes({service:'standard',addons:{laundry:2,linens:3}},defaultScheduling),190);
 const custom={...defaultScheduling,addonMinutes:{...defaultScheduling.addonMinutes,windows:15}};
 assert.equal(estimateMinutes({service:'standard',addons:{windows:4}},custom),180);
});
test('small add-ons use active minutes and round only the final visit',()=>{
 assert.ok(defaultConfig.addons.every(a=>Number.isInteger(defaultAddonMinutes[a.id])));
 assert.equal(estimateMinutes({service:'standard',addons:{dishes:1}},defaultScheduling),135);
 assert.equal(estimateMinutes({service:'standard',addons:{laundry:1}},defaultScheduling),140);
 assert.equal(estimateMinutes({service:'standard',addons:{windows:3}},defaultScheduling),130);
 assert.equal(estimateMinutes({service:'standard',addons:{windows:5}},defaultScheduling),135);
 assert.equal(estimateMinutes({service:'standard',addons:{windows:30}},defaultScheduling),210);
 assert.equal(estimateMinutes({service:'standard',addons:{windows:0}},defaultScheduling),120);
 const custom=schedulingSchema.parse({...defaultScheduling,addonMinutes:{windows:4,linens:0}});
 assert.equal(estimateMinutes({service:'standard',addons:{windows:3,linens:2,dishes:1}},custom),150);
 for(const invalid of [-1,3.5,241])assert.equal(schedulingSchema.safeParse({...defaultScheduling,addonMinutes:{windows:invalid}}).success,false);
});
const reportedQuote:QuoteInput={zip:'28562',sqft:1250,bedrooms:3,bathrooms:2,pets:'dog',condition:'maintained',emptyHome:false,service:'standard',frequency:'once',addons:{dishes:1,laundry:1,linens:1,fridge:1,windows:3,pet_hair:1}};
test('reported six-hour quote reserves 3h35 without changing the price',()=>{
 const legacy={...defaultScheduling,addonMinutes:Object.fromEntries(defaultConfig.addons.map(a=>[a.id,30]))};
 assert.equal(estimateMinutes(reportedQuote,legacy),360);
 assert.equal(calculateQuote(reportedQuote,defaultConfig).total,30203);
 const duration=estimateMinutes(reportedQuote,defaultScheduling);
 assert.equal(duration,215);
 const visit={id:'reported',kind:'booking' as const,...appointmentInterval(eastern('2026-09-24T08:00:00'),duration)};
 assert.equal(visit.ends_at,eastern('2026-09-24T11:35:00'));
 const slots=availableAppointments(120,[visit],1,now,0).filter(s=>localDay(s.starts_at)==='2026-09-24');
 assert.equal(slots[0].starts_at,eastern('2026-09-24T12:00:00'));
 assert.ok(!slots.some(s=>s.starts_at===eastern('2026-09-24T11:30:00')));
 assert.ok(validAppointment(appointmentInterval(eastern('2026-09-24T14:00:00'),duration),now,0));
 assert.equal(validAppointment(appointmentInterval(eastern('2026-09-24T14:30:00'),duration),now,0),false);
 const series={id:'recurring',anchorStart:visit.starts_at,durationMinutes:duration,weeks:1,kind:'booking' as const};
 const snapshot={fixed:[],series:[series],overrides:[]};
 assert.equal(hasSeriesCapacity({...series,id:'overlap',anchorStart:eastern('2026-10-01T11:30:00'),durationMinutes:120},snapshot,1),false);
 assert.equal(hasSeriesCapacity({...series,id:'after',anchorStart:eastern('2026-10-01T12:00:00'),durationMinutes:120},snapshot,1),true);
});
test('Thursday and Sunday hours stay local through both DST changes',()=>{
 for(const day of ['2026-09-24','2026-09-27']){
  assert.deepEqual(workingHours(day),{starts_at:eastern(day+'T08:00:00'),ends_at:eastern(day+'T17:00:00')});
  assert.equal(bookingHours(day)?.ends_at,eastern(day+'T18:00:00'));
 }
 for(const day of ['2026-09-21','2026-09-22','2026-09-23','2026-09-25','2026-09-26']){
  assert.equal(workingHours(day),null);
  assert.equal(bookingHours(day),null);
  assert.deepEqual(availableSegments(day,[],1),[]);
  assert.equal(validAppointment(appointmentInterval(eastern(day+'T08:00:00'),120),now,0),false);
 }
 assert.equal(workingHours('2026-10-29')?.starts_at,'2026-10-29T12:00:00.000Z');
 assert.equal(workingHours('2026-11-01')?.starts_at,'2026-11-01T13:00:00.000Z');
 assert.equal(bookingHours('2026-11-01')?.ends_at,eastern('2026-11-01T18:00:00'));
 assert.equal(workingHours('2027-03-14')?.starts_at,'2027-03-14T12:00:00.000Z');
});
test('finishes may use one extra hour, but starts remain inside normal hours',()=>{
 const valid=(day:string,minutes:number)=>validAppointment(appointmentInterval(eastern(day),minutes),now,0);
 assert.ok(valid('2026-09-24T15:00:00',120));
 assert.ok(valid('2026-09-24T15:30:00',120));
 assert.ok(valid('2026-09-24T16:00:00',120));
 assert.equal(valid('2026-09-24T16:30:00',120),false);
 assert.ok(valid('2026-09-24T16:30:00',90));
 assert.equal(valid('2026-09-24T17:00:00',30),false);
 assert.equal(valid('2026-09-24T17:30:00',30),false);
 assert.ok(valid('2026-09-27T14:00:00',180));
 assert.ok(valid('2026-09-27T14:30:00',180));
 assert.ok(valid('2026-09-27T15:00:00',180));
 assert.equal(valid('2026-09-27T15:30:00',180),false);
 assert.equal(valid('2026-09-27T17:00:00',30),false);
 assert.equal(valid('2026-09-24T07:30:00',120),false);
 assert.equal(valid('2026-09-26T08:00:00',120),false);
 assert.equal(valid('2026-09-24T08:15:00',120),false);
 assert.equal(valid('2026-09-24T08:00:01',120),false);
});
test('a 9–1 booking blocks every overlapping start and permits an exact 1 PM start',()=>{
 const occupancy=[block('2026-09-24T09:00:00',240)];
 const options=availableAppointments(120,occupancy,1,now,24).filter(s=>localDay(s.starts_at)==='2026-09-24');
 assert.deepEqual(options.map(s=>s.starts_at),['13:00','13:30','14:00','14:30','15:00','15:30','16:00'].map(t=>eastern('2026-09-24T'+t+':00')));
 const segments=availableSegments('2026-09-24',occupancy,1);
 assert.deepEqual(segments.map(s=>[s.starts_at,s.ends_at]),[[eastern('2026-09-24T08:00:00'),eastern('2026-09-24T09:00:00')],[eastern('2026-09-24T13:00:00'),eastern('2026-09-24T18:00:00')]]);
});
test('capacity uses concurrent overlap, with holds and all-team blocks',()=>{
 const request=appointmentInterval(eastern('2026-09-24T08:00:00'),240);
 const separate=[block('2026-09-24T08:00:00',120),block('2026-09-24T10:00:00',120,'hold')];
 assert.equal(hasCapacity(request,separate,2),true);
 assert.equal(hasCapacity(request,separate,1),false);
 assert.equal(hasCapacity(request,[...separate,block('2026-09-24T09:00:00',120)],2),false);
 assert.equal(hasCapacity(request,[block('2026-09-24T09:00:00',30,'block')],20),false);
});
test('notice, horizon, working days and oversized selections are enforced in generated choices',()=>{
 const options=availableAppointments(240,[],1,now,24);
 assert.ok(options.length>0);
 assert.ok(availableAppointments(600,[],1,now,24).some(s=>s.starts_at===eastern('2026-09-24T08:00:00')));
 assert.equal(availableAppointments(120,[block('2026-09-24T17:30:00',30,'block')],1,now,24).some(s=>s.starts_at===eastern('2026-09-24T16:00:00')),false);
 assert.ok(options.every(s=>validAppointment(s,now,24)));
 assert.ok(options.every(s=>[0,4].includes(new Date(localDay(s.starts_at)+'T12:00:00Z').getUTCDay())));
 const sunday=options.filter(s=>localDay(s.starts_at)==='2026-09-27');
 assert.equal(sunday.at(-1)?.starts_at,eastern('2026-09-27T14:00:00'));
 assert.equal(availableAppointments(615,[],1,now,24).length,0);
 assert.ok(options.every(s=>localDay(s.starts_at)<nextDay(localDay(now),90)));
});
test('database reservations, holds, cancellation and rescheduling share the same interval rules',async()=>{
 const db=new PGlite();
 const adapter=(queryable:{query:(sql:string,params?:any[])=>Promise<any>})=>({unsafe:async(sql:string,params:any[]=[])=> (await queryable.query(sql,params)).rows}) as unknown as ScheduleSql;
 try{
  for(const file of ['db/001_initial.sql','db/002_duration_scheduling.sql','db/004_subscriptions.sql','db/004_subscriptions.sql'])await db.exec(readFileSync(file,'utf8'));
  await db.query("insert into settings(key,value) values('scheduling',$1)",[JSON.stringify(defaultScheduling)]);
  assert.deepEqual(await getScheduling(adapter(db)),defaultScheduling);
  let day=nextDay(localDay(new Date()),2);while(new Date(day+'T12:00:00Z').getUTCDay()!==4)day=nextDay(day);
  const starts=[eastern(day+'T09:00:00'),eastern(day+'T10:00:00')];
  const leads=await db.query<{id:string}>("insert into leads(token_hash,type,email,stage) values('qa-1','residential','one@example.invalid','payment'),('qa-2','residential','two@example.invalid','payment') returning id");
  const results=await Promise.allSettled(starts.map((start,i)=>db.transaction(async tx=>{
    const sql=adapter(tx);await lockSchedule(sql);
    const slot=await reserveInterval(sql,start,180,defaultScheduling,0);
    await tx.query("insert into checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote) values($1,$2,$3,'creating',now()+interval '35 minutes','{}','{}')",[leads.rows[i].id,slot.id,'qa-'+i]);
  })));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  let occupied=await readOccupancy(adapter(db),eastern(day+'T08:00:00'),eastern(day+'T17:00:00'));
  assert.equal(occupied.length,1);assert.equal(occupied[0].kind,'hold');
  await db.query("update checkout_holds set expires_at=now()-interval '1 hour'");
  assert.equal((await readOccupancy(adapter(db),eastern(day+'T08:00:00'),eastern(day+'T17:00:00'))).length,1);
  const c=await db.query<{id:string}>("insert into customers(name,email,phone) values('QA','qa@example.invalid','2525550100') returning id");
  const h=await db.query<{id:string}>("insert into homes(customer_id,address,city,zip) values($1,'TEST ONLY','New Bern','28562') returning id",[c.rows[0].id]);
  const booking=await db.query<{id:string}>("insert into bookings(reference,customer_id,home_id,slot_id,hold_id,service,frequency,amount,quote,details) select 'QA-BOOKING',$1,$2,slot_id,id,'deep','once',25900,'{}','{}' from checkout_holds returning id",[c.rows[0].id,h.rows[0].id]);
  await db.query("update checkout_holds set status='paid'");
  occupied=await readOccupancy(adapter(db),eastern(day+'T08:00:00'),eastern(day+'T17:00:00'));
  assert.equal(occupied.length,1);assert.equal(occupied[0].kind,'booking');
  // Moving a job may overlap its own old time but never another reservation.
  await db.transaction(async tx=>{const sql=adapter(tx);await lockSchedule(sql);const slot=await reserveInterval(sql,eastern(day+'T10:00:00'),180,defaultScheduling,0,booking.rows[0].id);await tx.query('update bookings set slot_id=$1 where id=$2',[slot.id,booking.rows[0].id]);});
  assert.equal((await readOccupancy(adapter(db),eastern(day+'T08:00:00'),eastern(day+'T17:00:00')))[0].starts_at,eastern(day+'T10:00:00'));
  await db.query("update bookings set status='cancelled'");
  assert.equal((await readOccupancy(adapter(db),eastern(day+'T08:00:00'),eastern(day+'T17:00:00'))).length,0);
  await db.query("insert into schedule_blocks(starts_at,ends_at,label) values($1,$2,'QA time off')",[eastern(day+'T10:00:00'),eastern(day+'T12:00:00')]);
  await assert.rejects(db.transaction(async tx=>{const sql=adapter(tx);await lockSchedule(sql);await reserveInterval(sql,eastern(day+'T09:00:00'),120,defaultScheduling,0)}));
  await db.query('update schedule_blocks set active=false');
  assert.equal((await readOccupancy(adapter(db),eastern(day+'T08:00:00'),eastern(day+'T17:00:00'))).length,0);
 }finally{await db.close();}
});
