import test from 'node:test';
import assert from 'node:assert/strict';
import {fromZonedTime,formatInTimeZone} from 'date-fns-tz';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {intervalWeeks,occurrenceStart,occurrences,occupancyForRange,hasSeriesCapacity,seriesCapacityChecker,capacityFits,nextRenewal,type ScheduleSnapshot,type SeriesRule} from '../lib/recurrence';
import {appointmentInterval,localDay,nextDay} from '../lib/scheduling';
import {getScheduleSnapshot,readOccupancy,lockSchedule,reserveInterval,type ScheduleSql} from '../lib/schedule-store';
import {defaultScheduling} from '../lib/scheduling';
import {materializePlan,recordInvoice,applySubscriptionState,type RenewalInvoice} from '../lib/subscription-store';
import {checkoutParameters} from '../lib/checkout-session';
import {bookingSchema} from '../lib/validation';
import {calculateQuote,defaultConfig,type QuoteInput} from '../lib/pricing';
const eastern=(date:string)=>fromZonedTime(date,'America/New_York').toISOString();
const empty:ScheduleSnapshot={fixed:[],series:[],overrides:[]};
const rule=(anchor='2026-10-26T09:00:00',weeks=1):SeriesRule=>({id:'plan',planId:'plan',anchorStart:eastern(anchor),durationMinutes:120,weeks,kind:'booking'});
const fixed=(date:string,minutes=120)=>({id:date,kind:'booking' as const,...appointmentInterval(eastern(date),minutes)});
const quoteInput:QuoteInput={zip:'28562',sqft:1500,bedrooms:3,bathrooms:2,pets:'none',condition:'maintained',emptyHome:false,service:'standard',frequency:'weekly',addons:{oven:1}};
const input={...quoteInput,contact:{name:'Isolated QA',email:'qa@example.invalid',phone:'2525550100'},home:{address:'TEST ONLY 123',city:'New Bern',state:'NC',access:'',instructions:''},scheduledStart:eastern('2026-10-26T09:00:00'),policyAccepted:true,policyVersion:'2026-09-20',recurringAccepted:true};

test('weekly, biweekly and four-week recurrence preserves local weekday/time across both DST changes',()=>{
 for(const weeks of [1,2,4])for(const anchor of ['2026-10-26T09:00:00','2027-03-01T16:00:00']){
  const r=rule(anchor,weeks);
  for(let i=0;i<12;i++)assert.equal(formatInTimeZone(new Date(occurrenceStart(r.anchorStart,weeks,i)),'America/New_York','EEEE HH:mm'),'Monday '+anchor.slice(11,16));
 }
 assert.equal(occurrenceStart(eastern('2026-10-26T09:00:00'),1,1),eastern('2026-11-02T09:00:00'));
 assert.equal(localDay(occurrenceStart(eastern('2026-01-05T09:00:00'),4,1)),'2026-02-02');
 assert.equal(intervalWeeks('four_weeks'),4);
});
test('recurring availability checks future bookings, far-future blocks, alternating phases and team capacity',()=>{
 assert.equal(hasSeriesCapacity(rule(),{...empty,fixed:[fixed('2026-11-09T10:00:00')]},1),false);
 const far=occurrenceStart(rule().anchorStart,1,130);
 assert.equal(hasSeriesCapacity(rule(),{...empty,fixed:[{id:'future holiday',kind:'block',...appointmentInterval(far,60)}]},1),false);
 assert.equal(hasSeriesCapacity(rule('2026-10-26T09:00:00',2),{...empty,series:[rule('2026-11-02T09:00:00',2)]},1),true);
 assert.equal(hasSeriesCapacity(rule(),{...empty,series:[rule('2026-10-26T10:00:00',4)]},1),false);
 assert.equal(hasSeriesCapacity(rule(),{...empty,series:[rule('2026-10-26T10:00:00',4)]},2),true);
 const future=occurrenceStart(rule().anchorStart,1,15);
 const check=seriesCapacityChecker({...empty,series:[rule()]},1,rule().anchorStart,future);
 assert.equal(check({...rule(),anchorStart:future}),false);
 assert.equal(check(rule('2027-02-09T09:00:00')),true);
 assert.equal(capacityFits({...empty,series:[rule(),{...rule('2026-10-26T10:00:00'),id:'second',planId:'second'}]},1,rule().anchorStart),false);
});
test('materialized and rescheduled visits replace projected occurrences without double-counting',()=>{
 const start=rule().anchorStart,through=occurrenceStart(start,1,4);
 const snapshot={...empty,series:[rule()],fixed:[fixed('2026-10-27T09:00:00')],overrides:[{planId:'plan',index:0}]};
 const occupancy=occupancyForRange(snapshot,start,through);
 assert.equal(occupancy.length,4);assert.ok(!occupancy.some(o=>o.starts_at===start));
 // Four waived visits do not make an indefinitely conflicting recurring time safe.
 assert.equal(hasSeriesCapacity(rule(),{...empty,series:[rule()],overrides:[0,1,2,3].map(index=>({planId:'plan',index}))},1),false);
 const cancel=occurrenceStart(start,1,2);
 assert.equal(occurrences({...rule(),endBefore:cancel},start,through).length,2);
});
test('subscription checkout charges the first visit once, then repeats the complete agreed price',()=>{
 const quote=calculateQuote(quoteInput,defaultConfig);
 for(const frequency of ['weekly','two_weeks','four_weeks'] as const){
  const params=checkoutParameters({id:'isolated-hold',payload:{...input,frequency},quote,expires_at:'2026-10-20T12:00:00Z'},'https://example.invalid');
  assert.equal(params.mode,'subscription');assert.equal(params.line_items?.length,2);
  assert.equal(params.line_items![0].price_data?.unit_amount,quote.total);
  assert.equal(params.line_items![0].price_data?.recurring,undefined);
  assert.deepEqual(params.line_items![1].price_data?.recurring,{interval:'week',interval_count:intervalWeeks(frequency)});
  assert.equal(params.subscription_data?.trial_end,Date.parse(nextRenewal(input.scheduledStart,intervalWeeks(frequency)))/1000);
  assert.equal(params.payment_method_collection,'always');assert.equal(params.payment_intent_data,undefined);
 }
 const once=checkoutParameters({id:'one',payload:{...input,frequency:'once'},quote,expires_at:'2026-10-20T12:00:00Z'},'https://example.invalid');
 assert.equal(once.mode,'payment');assert.equal(once.line_items?.length,1);
 assert.equal(bookingSchema.safeParse({...input,recurringAccepted:false}).success,false);
 assert.equal(bookingSchema.safeParse(input).success,true);
});

test('recurring database bookings, payment recovery, invoice idempotency and cancellation share one calendar',async()=>{
 const database=new PGlite();
 const adapter=(q:{query:(s:string,p?:any[])=>Promise<any>})=>({unsafe:async(s:string,p:any[]=[])=> (await q.query(s,p)).rows}) as unknown as ScheduleSql;
 try{
  for(const f of ['db/001_initial.sql','db/002_duration_scheduling.sql','db/004_subscriptions.sql','db/004_subscriptions.sql'])await database.exec(readFileSync(f,'utf8'));
  const sql=adapter(database);
  let day=nextDay(localDay(new Date()),3);while(new Date(day+'T12:00:00Z').getUTCDay()!==1)day=nextDay(day);
  const anchor=eastern(day+'T09:00:00');
  const customer=await database.query<{id:string}>("insert into customers(name,email,phone) values('Isolated QA','qa@example.invalid','2525550100') returning id");
  const home=await database.query<{id:string}>("insert into homes(customer_id,address,city,zip) values($1,'TEST ONLY','New Bern','28562') returning id",[customer.rows[0].id]);
  const quote=calculateQuote(quoteInput,defaultConfig);
  const plans=await database.query<any>("insert into recurring_plans(customer_id,home_id,frequency,status,stripe_subscription_id,stripe_customer_id,initial_invoice_id,anchor_start,duration_minutes,interval_weeks,amount,quote,details) values($1,$2,'weekly','active','sub_test','cus_test','in_initial',$3,150,1,$4,$5,$6) returning *",[customer.rows[0].id,home.rows[0].id,anchor,quote.total,JSON.stringify(quote),JSON.stringify({...input,scheduledStart:anchor})]);
  const plan=plans.rows[0];
  await materializePlan(sql,plan);const first=await database.query<any>('select * from bookings where recurring_plan_id=$1 order by recurrence_index',[plan.id]);
  assert.ok(first.rows.length>=16);await materializePlan(sql,plan);
  assert.equal((await database.query('select * from bookings')).rows.length,first.rows.length);
  let snapshot=await getScheduleSnapshot(sql);
  assert.equal(occupancyForRange(snapshot,anchor,occurrenceStart(anchor,1,4)).length,4);
  await assert.rejects(database.transaction(async tx=>{await lockSchedule(adapter(tx));await reserveInterval(adapter(tx),occurrenceStart(anchor,1,3),120,defaultScheduling,0)}));
  // The indefinite reservation remains protected after the materialized 120-day window.
  assert.equal((await readOccupancy(sql,occurrenceStart(anchor,1,90),occurrenceStart(anchor,1,91))).length,1);
  const invoice=(index:number,status='paid'):RenewalInvoice=>({id:index===0?'in_initial':'in_'+index,subscriptionId:'sub_test',status,amountPaid:status==='paid'?quote.total:0,total:quote.total,currency:'usd',periodStart:Date.parse(nextRenewal(anchor,1))/1000+(index-1)*7*86400,initial:index===0,paymentIntent:'pi_'+index,failed:status!=='paid'});
  await recordInvoice(sql,plan,invoice(0));
  await recordInvoice(sql,plan,invoice(1,'open'));
  let [visit]= (await database.query<any>('select * from bookings where recurring_plan_id=$1 and recurrence_index=1',[plan.id])).rows;
  assert.equal(visit.payment_status,'failed');assert.equal(visit.status,'issue');
  await recordInvoice(sql,plan,invoice(1));
  [visit]=(await database.query<any>('select * from bookings where id=$1',[visit.id])).rows;
  assert.equal(visit.payment_status,'paid');assert.equal(visit.status,'confirmed');
  assert.equal(await recordInvoice(sql,plan,invoice(1)),null);
  assert.equal(await recordInvoice(sql,plan,invoice(1,'open')),null);
  assert.equal((await database.query('select * from subscription_invoices')).rows.length,2);
  await applySubscriptionState(sql,plan,'canceled',null);
  snapshot=await getScheduleSnapshot(sql);assert.equal(snapshot.series.length,0);
  const remaining=occupancyForRange(snapshot,anchor,occurrenceStart(anchor,1,4));
  assert.equal(remaining.length,2); // Two paid visits retained; all other future time released.
  assert.equal((await readOccupancy(sql,occurrenceStart(anchor,1,90),occurrenceStart(anchor,1,91))).length,0);
  // A delayed paid invoice cannot reopen an already released appointment.
  const canceledPlan={...plan,status:'canceled'};
  const delayed=await recordInvoice(sql,canceledPlan,invoice(90));
  assert.equal(delayed?.cancelled,true);
  assert.equal((await readOccupancy(sql,occurrenceStart(anchor,1,90),occurrenceStart(anchor,1,91))).length,0);
  // A missed visit paid late stays an issue instead of becoming a confirmed job.
  const past=new Date(Date.now()-86400000).toISOString();
  await database.query('update appointment_slots set starts_at=$2,ends_at=$3 where id=(select slot_id from bookings where recurring_plan_id=$1 and recurrence_index=2)',[plan.id,past,new Date(Date.parse(past)+7200000).toISOString()]);
  await database.query("update bookings set status='issue',payment_status='failed' where recurring_plan_id=$1 and recurrence_index=2",[plan.id]);
  assert.equal((await recordInvoice(sql,plan,invoice(2)))?.late,true);
  assert.equal((await database.query<any>('select status from bookings where recurring_plan_id=$1 and recurrence_index=2',[plan.id])).rows[0].status,'issue');

 }finally{await database.close()}
});

test('a recurring checkout hold reserves future visits and prevents competing checkout atomically',async()=>{
 const database=new PGlite();const adapter=(q:{query:(s:string,p?:any[])=>Promise<any>})=>({unsafe:async(s:string,p:any[]=[])=> (await q.query(s,p)).rows}) as unknown as ScheduleSql;
 try{
  for(const f of ['db/001_initial.sql','db/002_duration_scheduling.sql','db/004_subscriptions.sql'])await database.exec(readFileSync(f,'utf8'));
  let day=nextDay(localDay(new Date()),3);while(new Date(day+'T12:00:00Z').getUTCDay()!==1)day=nextDay(day);
  const anchor=eastern(day+'T09:00:00');
  const leads=await database.query<{id:string}>("insert into leads(token_hash,type,email,stage) values('a','residential','a@example.invalid','payment'),('b','residential','b@example.invalid','payment') returning id");
  const attempts=await Promise.allSettled([0,1].map(i=>database.transaction(async tx=>{
   const sql=adapter(tx);await lockSchedule(sql);const start=occurrenceStart(anchor,1,i);
   const slot=await reserveInterval(sql,start,150,defaultScheduling,0,undefined,'weekly');
   await tx.query("insert into checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote) values($1,$2,$3,'creating',now()+interval '30 minutes',$4,$5)",[leads.rows[i].id,slot.id,String(i),JSON.stringify({...input,scheduledStart:start}),JSON.stringify({durationMinutes:150})]);
  })));
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  const snapshot=await getScheduleSnapshot(adapter(database));assert.equal(snapshot.series.length,1);
  assert.equal(occupancyForRange(snapshot,occurrenceStart(anchor,1,2),occurrenceStart(anchor,1,3)).length,1);
  await database.query("update checkout_holds set status='expired'");assert.equal((await getScheduleSnapshot(adapter(database))).series.length,0);
 }finally{await database.close()}
});
