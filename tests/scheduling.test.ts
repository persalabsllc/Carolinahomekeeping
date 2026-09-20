import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fromZonedTime} from 'date-fns-tz';
import {defaultScheduling,estimateMinutes,workingHours,availableAppointments,appointmentInterval,validAppointment,hasCapacity,availableSegments,localDay,nextDay,type Occupancy} from '../lib/scheduling';
import {getScheduling,lockSchedule,readOccupancy,reserveInterval,type ScheduleSql} from '../lib/schedule-store';
const eastern=(s:string)=>fromZonedTime(s,'America/New_York').toISOString();
const now=new Date('2026-09-20T00:00:00Z');
const block=(start:string,minutes:number,kind:Occupancy['kind']='booking'):Occupancy=>({id:start,kind,...appointmentInterval(eastern(start),minutes)});

test('duration estimates include every paid add-on unit; ordinary bed making remains included',()=>{
 assert.equal(estimateMinutes({service:'standard',addons:{}},defaultScheduling),120);
 assert.equal(estimateMinutes({service:'deep',addons:{}},defaultScheduling),180);
 assert.equal(estimateMinutes({service:'move',addons:{}},defaultScheduling),240);
 assert.equal(estimateMinutes({service:'deep',addons:{oven:1,fridge:1}},defaultScheduling),240);
 assert.equal(estimateMinutes({service:'standard',addons:{laundry:2,linens:3}},defaultScheduling),270);
 const custom={...defaultScheduling,addonMinutes:{...defaultScheduling.addonMinutes,windows:15}};
 assert.equal(estimateMinutes({service:'standard',addons:{windows:4}},custom),180);
});
test('fixed Eastern hours, Sundays closed, DST changes preserve local hours',()=>{
 assert.deepEqual(workingHours('2026-09-21'),{starts_at:'2026-09-21T12:00:00.000Z',ends_at:'2026-09-21T21:00:00.000Z'});
 assert.equal(workingHours('2026-09-20'),null);
 assert.equal(workingHours('2026-09-26')?.ends_at,'2026-09-26T18:00:00.000Z');
 assert.equal(workingHours('2026-10-30')?.starts_at,'2026-10-30T12:00:00.000Z');
 assert.equal(workingHours('2026-11-02')?.starts_at,'2026-11-02T13:00:00.000Z');
 assert.equal(workingHours('2027-03-15')?.starts_at,'2027-03-15T12:00:00.000Z');
});
test('full cleaning must finish by closing and starts use a half-hour grid',()=>{
 const valid=(day:string,minutes:number)=>validAppointment(appointmentInterval(eastern(day),minutes),now,0);
 assert.ok(valid('2026-09-21T15:00:00',120));
 assert.equal(valid('2026-09-21T15:30:00',120),false);
 assert.ok(valid('2026-09-26T11:00:00',180));
 assert.equal(valid('2026-09-26T11:30:00',180),false);
 assert.equal(valid('2026-09-21T07:30:00',120),false);
 assert.equal(valid('2026-09-20T08:00:00',120),false);
 assert.equal(valid('2026-09-21T08:15:00',120),false);
 assert.equal(valid('2026-09-21T08:00:01',120),false);
});
test('a 9–1 booking blocks every overlapping start and permits an exact 1 PM start',()=>{
 const occupancy=[block('2026-09-21T09:00:00',240)];
 const options=availableAppointments(120,occupancy,1,now,24).filter(s=>localDay(s.starts_at)==='2026-09-21');
 assert.deepEqual(options.map(s=>s.starts_at),['13:00','13:30','14:00','14:30','15:00'].map(t=>eastern('2026-09-21T'+t+':00')));
 const segments=availableSegments('2026-09-21',occupancy,1);
 assert.deepEqual(segments.map(s=>[s.starts_at,s.ends_at]),[[eastern('2026-09-21T08:00:00'),eastern('2026-09-21T09:00:00')],[eastern('2026-09-21T13:00:00'),eastern('2026-09-21T17:00:00')]]);
});
test('capacity uses concurrent overlap, with holds and all-team blocks',()=>{
 const request=appointmentInterval(eastern('2026-09-21T08:00:00'),240);
 const separate=[block('2026-09-21T08:00:00',120),block('2026-09-21T10:00:00',120,'hold')];
 assert.equal(hasCapacity(request,separate,2),true);
 assert.equal(hasCapacity(request,separate,1),false);
 assert.equal(hasCapacity(request,[...separate,block('2026-09-21T09:00:00',120)],2),false);
 assert.equal(hasCapacity(request,[block('2026-09-21T09:00:00',30,'block')],20),false);
});
test('notice, horizon, Saturdays and oversized selections are enforced in generated choices',()=>{
 const options=availableAppointments(240,[],1,now,24);
 assert.ok(options.length>0);
 assert.ok(options.every(s=>validAppointment(s,now,24)));
 const saturday=options.filter(s=>localDay(s.starts_at)==='2026-09-26');
 assert.equal(saturday.at(-1)?.starts_at,eastern('2026-09-26T10:00:00'));
 assert.equal(availableAppointments(600,[],1,now,24).length,0);
 assert.ok(options.every(s=>localDay(s.starts_at)<nextDay(localDay(now),90)));
});
test('database reservations, holds, cancellation and rescheduling share the same interval rules',async()=>{
 const db=new PGlite();
 const adapter=(queryable:{query:(sql:string,params?:any[])=>Promise<any>})=>({unsafe:async(sql:string,params:any[]=[])=> (await queryable.query(sql,params)).rows}) as unknown as ScheduleSql;
 try{
  for(const file of ['db/001_initial.sql','db/002_duration_scheduling.sql','db/002_duration_scheduling.sql'])await db.exec(readFileSync(file,'utf8'));
  await db.query("insert into settings(key,value) values('scheduling',$1)",[JSON.stringify(defaultScheduling)]);
  assert.deepEqual(await getScheduling(adapter(db)),defaultScheduling);
  let day=nextDay(localDay(new Date()),2);while(new Date(day+'T12:00:00Z').getUTCDay()!==1)day=nextDay(day);
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
