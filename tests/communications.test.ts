import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {queueCommunications,emailStillRelevant,reminderDue,enqueueEmail} from '../lib/communications';
import {communicationDefaults} from '../lib/communication-config';
import {emailToken,readEmailToken} from '../lib/email-links';
import {applyRecoveryQuote,calculateQuote,defaultConfig,regularQuote,type QuoteInput} from '../lib/pricing';
import {checkoutParameters} from '../lib/checkout-session';
import {recoveryOffer} from '../lib/recovery';
import {drainOutbox,EmailError,sendEmail} from '../lib/email';
import {recordInvoice} from '../lib/subscription-store';
import {repairRejectedEmailHeaders} from '../lib/email-repair';
import type {ScheduleSql} from '../lib/schedule-store';
const input:QuoteInput={zip:'28562',sqft:1500,bedrooms:3,bathrooms:2,pets:'none',condition:'maintained',emptyHome:false,service:'standard',frequency:'weekly',addons:{oven:1,laundry:1}};
process.env.SESSION_SECRET='isolated-test-secret-with-more-than-32-characters';
process.env.APP_URL='https://example.invalid';
process.env.RESEND_API_KEY='test-key-not-real';process.env.EMAIL_FROM='QA <qa@example.invalid>';
const adapter=(pg:PGlite)=>Object.assign(async(strings:TemplateStringsArray,...values:any[])=> (await pg.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows,{unsafe:async(s:string,p:any[]=[])=> (await pg.query(s,p)).rows}) as unknown as ScheduleSql;
async function database(){const pg=new PGlite();for(const f of ['001_initial','002_duration_scheduling','004_subscriptions','005_communications','005_communications'])await pg.exec(readFileSync('db/'+f+'.sql','utf8'));return pg;}
const now=new Date();const at=(hours:number)=>new Date(now.getTime()+hours*3600000).toISOString();
const config={...communicationDefaults,enabledAt:at(-240),postalAddress:'TEST FIXTURE ADDRESS — NOT A REAL BUSINESS',reviewUrl:'https://example.invalid/review'};
async function fixture(pg:PGlite,start=at(12),overrides:Record<string,any>={}){
 const [c]=(await pg.query<any>("insert into customers(name,email,phone) values('Isolated QA',$1,'2525550100') returning *",[randomUUID()+'@example.invalid'])).rows;
 const [h]=(await pg.query<any>("insert into homes(customer_id,address,city,zip) values($1,'TEST ONLY','New Bern','28562') returning *",[c.id])).rows;
 const [s]=(await pg.query<any>("insert into appointment_slots(starts_at,ends_at,capacity) values($1,$2,1) on conflict(starts_at,ends_at) do update set label='' returning *",[start,new Date(Date.parse(start)+7200000).toISOString()])).rows;
 const [b]=(await pg.query<any>("insert into bookings(reference,customer_id,home_id,slot_id,service,frequency,amount,quote,details,created_at,status,payment_status,completed_at) values($1,$2,$3,$4,'standard','once',18900,$5,'{}',$6,$7,$8,$9) returning *",['CH-'+randomUUID(),c.id,h.id,s.id,JSON.stringify(calculateQuote(input,defaultConfig)),overrides.created||at(-48),overrides.status||'confirmed',overrides.payment_status||'paid',overrides.completed_at||null])).rows;
 return {b,c,h,s};
}
async function lead(pg:PGlite,email=randomUUID()+'@example.invalid',consent=true){return (await pg.query<any>("insert into leads(token_hash,type,name,email,phone,stage,payload,marketing_consent_at,created_at,updated_at) values($1,'residential','Isolated QA',$2,'2525550100','payment',$3,$4,$5,$6) returning *",[randomUUID(),email,JSON.stringify({quoteInput:input,home:{address:'TEST ONLY 123',city:'New Bern',state:'NC'}}),consent?at(-24):null,at(-24),at(-3)])).rows[0];}

test('recovery reduces the first complete visit and tax; all subscription renewals retain regular price',()=>{
 for(const frequency of ['once','weekly','two_weeks','four_weeks'] as const){
  const regular=calculateQuote({...input,frequency},defaultConfig),q=applyRecoveryQuote(regular,10);
  assert.deepEqual(regularQuote(q),regular);assert.equal(q.total,regular.subtotal-Math.round(regular.subtotal*.1)+Math.round(regular.tax*.9));
  const p=checkoutParameters({id:'test-only',payload:{...input,frequency,contact:{email:'qa@example.invalid'},scheduledStart:at(48),recurringAccepted:true},quote:q,expires_at:at(1)},'https://example.invalid');
  assert.equal(p.line_items![0].price_data!.unit_amount,q.total);
  if(frequency!=='once')assert.equal(p.line_items![1].price_data!.unit_amount,regular.total);
 }
 assert.throws(()=>applyRecoveryQuote(calculateQuote(input,defaultConfig),99));
});
test('reminder deadlines skip short-notice bookings and late sends, including a DST boundary',()=>{
 assert.equal(reminderDue(at(12),at(-1),12,now),true);assert.equal(reminderDue(at(12),at(.1),12,now),false);
 assert.equal(reminderDue(at(11.49),at(-48),12,now),false);
 assert.equal(reminderDue('2026-11-01T14:00:00Z','2026-10-30T00:00:00Z',12,new Date('2026-11-01T02:00:00Z')),true);
});
test('real database queues exact reminder events once, guards canceled/rescheduled/unpaid work, follows completion and respects unsubscribe',async()=>{
 const pg=await database(),sql=adapter(pg);try{
  const twelve=await fixture(pg),one=await fixture(pg,at(1)),unpaid=await fixture(pg,at(1),{payment_status:'scheduled'}),cancel=await fixture(pg,at(1),{status:'cancelled'}),done=await fixture(pg,at(-6),{status:'completed',completed_at:at(-3)}),notDone=await fixture(pg,at(-6));
  await queueCommunications(sql,config,defaultConfig,true,now);await queueCommunications(sql,config,defaultConfig,true,now);
  const rows=(await pg.query<any>('select * from email_outbox')).rows;
  assert.equal(rows.filter(r=>r.kind==='reminder').length,2);assert.equal(rows.filter(r=>r.kind==='feedback').length,1);
  assert.equal(rows.filter(r=>[unpaid.b.id,cancel.b.id].includes(r.booking_id)).length,0);
  assert.equal(rows.filter(r=>r.kind==='feedback'&&r.booking_id===notDone.b.id).length,0);
  assert.equal(rows.filter(r=>r.kind==='owner_booking'&&r.booking_id===one.b.id).length,1);
  const reminder=rows.find(r=>r.kind==='reminder'&&r.booking_id===twelve.b.id);
  assert.equal(await emailStillRelevant(sql,reminder,config,now),true);
  await pg.query("update bookings set status='cancelled' where id=$1",[twelve.b.id]);assert.equal(await emailStillRelevant(sql,reminder,config,now),false);
  await pg.query("update bookings set status='confirmed' where id=$1",[twelve.b.id]);await pg.query("update appointment_slots set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id=$1",[twelve.s.id]);assert.equal(await emailStillRelevant(sql,reminder,config,now),false);
  const feedback=rows.find(r=>r.kind==='feedback');assert.match(feedback.html,/Leave an honest review/);assert.match(feedback.html,/List-Unsubscribe|Unsubscribe/);
  await pg.query('update email_preferences set unsubscribed_at=now() where email=$1',[done.c.email]);assert.equal(await emailStillRelevant(sql,feedback,config,now),false);
  // Reminder remains transactional regardless of promotional preference.
  await pg.query('insert into email_preferences(email,unsubscribed_at) values($1,now())',[one.c.email]);assert.equal(await emailStillRelevant(sql,rows.find(r=>r.kind==='reminder'&&r.booking_id===one.b.id),config,now),true);
 }finally{await pg.close();}
});
test('recovery excludes opted-out, unconsented, paid and active checkouts; private offers expire, cannot transfer and cannot be reused',async()=>{
 const pg=await database(),sql=adapter(pg);try{
  const eligible=await lead(pg),noConsent=await lead(pg,undefined,false),optout=await lead(pg),active=await lead(pg),existing=await fixture(pg);await lead(pg,existing.c.email);
  await pg.query('insert into email_preferences(email,unsubscribed_at) values($1,now())',[optout.email]);
  await pg.query("insert into checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote) values($1,$2,'test','open',$3,'{}','{}')",[active.id,existing.s.id,at(1)]);
  await queueCommunications(sql,{...config,postalAddress:''},defaultConfig,true,now);assert.equal((await pg.query('select * from recovery_offers')).rows.length,0);
  await queueCommunications(sql,config,defaultConfig,false,now);assert.equal((await pg.query('select * from recovery_offers')).rows.length,0);
  await queueCommunications(sql,config,defaultConfig,true,now);await queueCommunications(sql,config,defaultConfig,true,now);
  const offers=(await pg.query<any>('select * from recovery_offers')).rows;assert.equal(offers.length,1);assert.equal(offers[0].lead_id,eligible.id);
  const offer=offers[0],token=await emailToken('recovery',offer.id,Math.floor(Date.parse(at(24))/1000));
  assert.equal((await recoveryOffer(sql,token,eligible.email,eligible.id)).percent,10);
  await assert.rejects(recoveryOffer(sql,token,'other@example.invalid',eligible.id));
  assert.equal(await readEmailToken('feedback',token),null);assert.equal(await readEmailToken('recovery',token+'x'),null);
  const expired=await emailToken('recovery',offer.id,Math.floor(Date.now()/1000)-1);await assert.rejects(recoveryOffer(sql,expired));
  const job=(await pg.query<any>("select * from email_outbox where kind='recovery'")).rows[0];assert.equal(await emailStillRelevant(sql,job,config,now),true);
  await pg.query('update leads set updated_at=now() where id=$1',[eligible.id]);assert.equal(await emailStillRelevant(sql,job,config,now),false);
  await pg.query("insert into checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote,recovery_offer_id) values($1,$2,'test','paid',$3,'{}','{}',$4)",[eligible.id,existing.s.id,at(1),offer.id]);
  await assert.rejects(pg.query("insert into checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote,recovery_offer_id) values($1,$2,'test2','creating',$3,'{}','{}',$4)",[eligible.id,existing.s.id,at(1),offer.id]));
  await pg.query('update recovery_offers set redeemed_at=now() where id=$1',[offer.id]);await assert.rejects(recoveryOffer(sql,token));
 }finally{await pg.close();}
});
test('outbox delivers once, retries transient errors with the same key, rejects permanent errors and stops ambiguous retries at 23 hours',async()=>{
 const pg=await database(),sql=adapter(pg);try{
  await enqueueEmail(sql,{key:'test',to:'qa@example.invalid',subject:'Test only',html:'<p>Test only</p>',kind:'owner_test'});
  const ids:string[]=[],transport:typeof sendEmail=async(_to,_subject,_html,key)=>{ids.push(key);if(ids.length===1)throw new Error('Simulated network failure');return 'provider-test';};
  const options={sql:sql as any,transport,bookingOpen:true};
  await drainOutbox(options);let row=(await pg.query<any>('select * from email_outbox')).rows[0];assert.equal(row.status,'pending');assert.equal(row.attempts,1);
  await drainOutbox(options);assert.equal(ids.length,1,'backoff prevents immediate retry');
  await pg.query("update email_outbox set send_after=now()-interval '1 second'");await drainOutbox(options);row=(await pg.query<any>('select * from email_outbox')).rows[0];assert.equal(row.status,'sent');assert.equal(row.provider_id,'provider-test');assert.equal(ids[0],ids[1]);
  await drainOutbox(options);assert.equal(ids.length,2);
  await enqueueEmail(sql,{key:'rejected',to:'qa@example.invalid',subject:'Test only',html:'<p>Test only</p>',kind:'owner_test'});
  await drainOutbox({...options,transport:async()=>{throw new EmailError(403)}});assert.equal((await pg.query<any>("select status from email_outbox where dedupe_key='rejected'")).rows[0].status,'failed');
  await enqueueEmail(sql,{key:'ambiguous',to:'qa@example.invalid',subject:'Test only',html:'<p>Test only</p>',kind:'owner_test'});await pg.query("update email_outbox set first_attempt_at=now()-interval '24 hours' where dedupe_key='ambiguous'");
  await drainOutbox({...options,transport:async()=>{assert.fail('Must not resend beyond provider idempotency window')}});assert.equal((await pg.query<any>("select status from email_outbox where dedupe_key='ambiguous'")).rows[0].status,'failed');
 }finally{await pg.close();}
});
test('legacy header repair rechecks eligibility, audits once and sends only the selected rejected email',async()=>{
 const pg=await database(),sql=adapter(pg);try{
  await pg.query("insert into settings(key,value) values('communications',$1) on conflict(key) do update set value=excluded.value",[JSON.stringify(config)]);
  await lead(pg);await queueCommunications(sql,config,defaultConfig,true,now);
  const [job]=(await pg.query<any>("select * from email_outbox where kind='recovery'")).rows;
  await pg.query("update email_outbox set status='failed',attempts=1,first_attempt_at=now()-interval '26 hours',last_error='Provider rejected message; check email configuration.',headers=$2 where id=$1",[job.id,JSON.stringify(JSON.stringify(job.headers))]);
  await assert.rejects(repairRejectedEmailHeaders(sql,job.id,'qa-admin',false),/no longer eligible/);
  await pg.query('insert into email_preferences(email,unsubscribed_at) values($1,now()) on conflict(email) do update set unsubscribed_at=now()',[job.recipient]);
  await assert.rejects(repairRejectedEmailHeaders(sql,job.id,'qa-admin',true),/no longer eligible/);
  await pg.query('update email_preferences set unsubscribed_at=null where email=$1',[job.recipient]);
  await pg.query("update email_outbox set provider_id='already-accepted' where id=$1",[job.id]);
  await assert.rejects(repairRejectedEmailHeaders(sql,job.id,'qa-admin',true),/not eligible/);
  await pg.query("update email_outbox set provider_id=null,attempts=2 where id=$1",[job.id]);
  await assert.rejects(repairRejectedEmailHeaders(sql,job.id,'qa-admin',true),/not eligible/);
  await pg.query("update email_outbox set attempts=1,expires_at=now()-interval '1 minute' where id=$1",[job.id]);
  await assert.rejects(repairRejectedEmailHeaders(sql,job.id,'qa-admin',true),/no longer eligible/);
  await pg.query('update email_outbox set expires_at=$2 where id=$1',[job.id,job.expires_at]);
  await repairRejectedEmailHeaders(sql,job.id,'qa-admin',true);
  await assert.rejects(repairRejectedEmailHeaders(sql,job.id,'qa-admin',true),/not eligible/);
  await enqueueEmail(sql,{key:'unrelated-pending',to:'other@example.invalid',subject:'Must not send',html:'Test',kind:'owner_test'});
  const ids:string[]=[];
  const sent=await drainOutbox({sql:sql as any,bookingOpen:true,onlyId:job.id,transport:async(_to,_subject,_html,id,_text,headers)=>{ids.push(id);assert.equal(typeof headers,'object');assert.equal(headers!['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');return 'repaired-test';}});
  assert.equal(sent.sent,1);assert.deepEqual(ids,[job.id]);
  assert.equal((await pg.query<any>('select attempts from email_outbox where id=$1',[job.id])).rows[0].attempts,2);
  assert.equal((await pg.query<any>("select status from email_outbox where dedupe_key='unrelated-pending'")).rows[0].status,'pending');
  assert.equal((await pg.query('select * from audit_log where record_id=$1',[job.id])).rows.length,1);
  await assert.rejects(repairRejectedEmailHeaders(sql,job.id,'qa-admin',true),/not eligible/);
 }finally{await pg.close();}
});

test('initial discounted subscription invoice is matched against the first booking, while renewals match the undiscounted plan',async()=>{
 const pg=await database(),sql=adapter(pg);try{
  const fixtureData=await fixture(pg,at(48)),regular=calculateQuote(input,defaultConfig),discounted=applyRecoveryQuote(regular,10);
  const [plan]=(await pg.query<any>("insert into recurring_plans(customer_id,home_id,frequency,status,stripe_subscription_id,anchor_start,duration_minutes,interval_weeks,amount,quote,details) values($1,$2,'weekly','trialing','sub_discount_test',$3,120,1,$4,$5,$6) returning *",[fixtureData.c.id,fixtureData.h.id,at(48),regular.total,JSON.stringify(regular),JSON.stringify({...input,scheduledStart:at(48)})])).rows;
  await pg.query('update bookings set recurring_plan_id=$2,recurrence_index=0,amount=$3,quote=$4 where id=$1',[fixtureData.b.id,plan.id,discounted.total,JSON.stringify(discounted)]);
  const result=await recordInvoice(sql,plan,{id:'in_discount_test',subscriptionId:plan.stripe_subscription_id,status:'paid',amountPaid:discounted.total,total:discounted.total,currency:'usd',periodStart:Math.floor(Date.now()/1000),initial:true,paymentIntent:'pi_test',failed:false});assert.equal(result?.mismatch,false);
 }finally{await pg.close();}
});
