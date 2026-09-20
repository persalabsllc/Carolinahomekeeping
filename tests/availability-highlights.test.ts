import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fromZonedTime} from 'date-fns-tz';
import {buildAvailabilityHighlights,HIGHLIGHT_DAYS,unavailableHighlights} from '../lib/availability-highlights';
import {defaultScheduling,appointmentInterval,dayBounds,localDay,nextDay,type Occupancy} from '../lib/scheduling';
import {type ScheduleSnapshot} from '../lib/recurrence';
import {getScheduleSnapshot,type ScheduleSql} from '../lib/schedule-store';

const eastern=(s:string)=>fromZonedTime(s,'America/New_York').toISOString();
const now=new Date(eastern('2026-09-23T08:00:00'));
const empty=():ScheduleSnapshot=>({fixed:[],series:[],overrides:[]});
const occupied=(start:string,minutes:number,kind:Occupancy['kind']='booking'):Occupancy=>({id:'private-id',label:'Private customer name',kind,...appointmentInterval(eastern(start),minutes)});
const highlights=(snapshot=empty(),notice=24)=>buildAvailabilityHighlights(snapshot,defaultScheduling,notice,true,now);

test('highlights show only two distinct real windows, labeled in Eastern time',()=>{
  const value=highlights();
  assert.equal(value.status,'available');
  assert.equal(value.slots.length,2);
  assert.deepEqual(value.slots.map(s=>s.label),['Thursday morning','Thursday afternoon']);
  assert.deepEqual(value.slots.map(s=>s.startsAt),[eastern('2026-09-24T08:00:00'),eastern('2026-09-24T12:00:00')]);
  assert.equal(value.slots[0].dateLabel,'Sep 24');
  assert.equal(value.slots[0].timeLabel,'8:00 AM');
  assert.equal(value.durationMinutes,120);
  assert.equal(value.checkedAt,now.toISOString());
  assert.equal(highlights(empty(),26).slots[0].timeLabel,'10:00 AM');
});

test('bookings, holds and blocks remove openings; released capacity restores them',()=>{
  const snapshot=empty();
  snapshot.fixed.push(occupied('2026-09-24T08:00:00',240));
  assert.equal(highlights(snapshot).slots[0].label,'Thursday afternoon');
  snapshot.fixed.push(occupied('2026-09-24T12:00:00',360,'hold'));
  assert.equal(highlights(snapshot).slots[0].label,'Friday morning');
  snapshot.fixed.push(occupied('2026-09-25T08:00:00',600,'block'));
  assert.equal(highlights(snapshot).slots[0].label,'Saturday morning');
  snapshot.fixed=[];
  assert.equal(highlights(snapshot).slots[0].label,'Thursday morning');
});

test('recurring appointments and team capacity use the booking calendar rules',()=>{
  const snapshot=empty();
  snapshot.series.push({id:'private-plan',planId:'plan',anchorStart:eastern('2026-09-17T08:00:00'),durationMinutes:600,weeks:1,kind:'booking',label:'Secret client'});
  const value=highlights(snapshot);
  assert.equal(value.slots[0].label,'Friday morning');
  assert.ok(!JSON.stringify(value).includes('Secret client'));
  assert.ok(!JSON.stringify(value).includes('private-plan'));
  const twoTeams=buildAvailabilityHighlights(snapshot,{...defaultScheduling,teamCapacity:2},24,true,now);
  assert.equal(twoTeams.slots[0].label,'Thursday morning');
  snapshot.overrides.push({planId:'plan',index:1});
  assert.equal(highlights(snapshot).slots[0].label,'Thursday morning');
});

test('longer configured cleans never advertise overlapping highlighted visits',()=>{
  const value=buildAvailabilityHighlights(empty(),{...defaultScheduling,serviceMinutes:{...defaultScheduling.serviceMinutes,standard:300}},24,true,now);
  assert.equal(value.durationMinutes,300);
  assert.equal(value.slots[1].timeLabel,'1:00 PM');
  assert.ok(value.slots[0].endsAt<=value.slots[1].startsAt);
});

test('Sunday closure, DST and the limited lookahead are respected',()=>{
  const beforeDST=new Date(eastern('2026-10-30T08:00:00'));
  const value=buildAvailabilityHighlights(empty(),defaultScheduling,48,true,beforeDST);
  assert.equal(value.slots[0].label,'Monday morning');
  assert.equal(value.slots[0].startsAt,'2026-11-02T13:00:00.000Z');
  const snapshot=empty();
  snapshot.fixed.push({id:'all-blocked',kind:'block',starts_at:dayBounds(localDay(now)).starts_at,ends_at:dayBounds(nextDay(localDay(now),HIGHLIGHT_DAYS)).starts_at});
  assert.deepEqual(highlights(snapshot).slots,[]);
  assert.equal(highlights(snapshot).status,'full');
  const prelaunch=buildAvailabilityHighlights(empty(),defaultScheduling,24,false,now);
  assert.equal(prelaunch.bookingOpen,false);
  assert.equal(prelaunch.slots.length,2);
  assert.equal(unavailableHighlights(now).status,'unavailable');
  assert.deepEqual(unavailableHighlights(now).slots,[]);
});

test('new calendar blocks are reflected on the next read and released blocks reopen immediately',async()=>{
  const database=new PGlite();
  const sql={unsafe:async(q:string,params:unknown[]=[])=> (await database.query(q,params)).rows} as unknown as ScheduleSql;
  try{
    for(const file of ['db/001_initial.sql','db/002_duration_scheduling.sql','db/004_subscriptions.sql'])await database.exec(readFileSync(file,'utf8'));
    const read=async()=>highlights(await getScheduleSnapshot(sql));
    assert.equal((await read()).slots[0].label,'Thursday morning');
    await database.query("insert into schedule_blocks(starts_at,ends_at,label) values($1,$2,'Internal time-off notes')",[eastern('2026-09-24T08:00:00'),eastern('2026-09-24T18:00:00')]);
    const blocked=await read();
    assert.equal(blocked.slots[0].label,'Friday morning');
    assert.ok(!JSON.stringify(blocked).includes('Internal time-off notes'));
    await database.query('update schedule_blocks set active=false');
    assert.equal((await read()).slots[0].label,'Thursday morning');
  }finally{await database.close();}
});
