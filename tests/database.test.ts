import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {defaultConfig} from '../lib/pricing';

test('Postgres migration, capacity accounting and booking uniqueness',async()=>{
 const db=new PGlite();
 try{
  const schema=readFileSync('db/001_initial.sql','utf8');await db.exec(schema);await db.exec(schema);
  await db.query('INSERT INTO settings(key,value) VALUES($1,$2)', ['pricing',JSON.stringify(defaultConfig)]);
  const count=await db.query<{count:number}>("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'");assert.ok(count.rows[0].count>=1);
  const lead=await db.query<{id:string}>("INSERT INTO leads(token_hash,type,name,email,phone,stage) VALUES('qa-hash','residential','Test Customer','qa@example.invalid','2525550100','payment') RETURNING id");
  const slot=await db.query<{id:string}>("INSERT INTO appointment_slots(starts_at,ends_at,capacity) VALUES(now()+interval '2 days',now()+interval '2 days 2 hours',1) RETURNING id");
  const hold=await db.query<{id:string}>("INSERT INTO checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote) VALUES($1,$2,'qa-hash','creating',now()+interval '35 minutes','{}','{\"total\":18900}') RETURNING id",[lead.rows[0].id,slot.rows[0].id]);
  await assert.rejects(db.query("INSERT INTO checkout_holds(lead_id,slot_id,token_hash,status,expires_at,payload,quote) VALUES($1,$2,'qa-hash','open',now()+interval '35 minutes','{}','{}')",[lead.rows[0].id,slot.rows[0].id]));
  const usage=await db.query<{used:number}>("SELECT (SELECT count(*) FROM bookings WHERE slot_id=$1 AND status NOT IN ('cancelled','refunded'))+(SELECT count(*) FROM checkout_holds WHERE slot_id=$1 AND status IN ('creating','open')) AS used",[slot.rows[0].id]);assert.equal(Number(usage.rows[0].used),1);
  // A wall-clock-expired hold still occupies capacity until Stripe is reconciled.
  await db.query("UPDATE checkout_holds SET expires_at=now()-interval '1 hour' WHERE id=$1",[hold.rows[0].id]);
  const held=await db.query<{count:number}>("SELECT count(*) AS count FROM checkout_holds WHERE slot_id=$1 AND status IN ('creating','open')",[slot.rows[0].id]);assert.equal(Number(held.rows[0].count),1);
  const c=await db.query<{id:string}>("INSERT INTO customers(name,email,phone) VALUES('Test Customer','qa@example.invalid','2525550100') RETURNING id");
  const h=await db.query<{id:string}>("INSERT INTO homes(customer_id,address,city,zip) VALUES($1,'TEST ONLY','New Bern','28562') RETURNING id",[c.rows[0].id]);
  const params=[c.rows[0].id,h.rows[0].id,slot.rows[0].id,hold.rows[0].id];
  await db.query("INSERT INTO bookings(reference,customer_id,home_id,slot_id,hold_id,service,frequency,amount,quote,details,stripe_session_id) VALUES('QA-ONE',$1,$2,$3,$4,'standard','once',18900,'{}','{}','cs_test_qa')",params);
  await assert.rejects(db.query("INSERT INTO bookings(reference,customer_id,home_id,slot_id,hold_id,service,frequency,amount,quote,details,stripe_session_id) VALUES('QA-TWO',$1,$2,$3,$4,'standard','once',18900,'{}','{}','cs_test_qa')",params));
  await db.query("UPDATE checkout_holds SET status='paid' WHERE id=$1",[hold.rows[0].id]);
  const booked=await db.query<{used:number}>("SELECT (SELECT count(*) FROM bookings WHERE slot_id=$1 AND status NOT IN ('cancelled','refunded'))+(SELECT count(*) FROM checkout_holds WHERE slot_id=$1 AND status IN ('creating','open')) AS used",[slot.rows[0].id]);assert.equal(Number(booked.rows[0].used),1);
  await db.query("INSERT INTO email_outbox(dedupe_key,recipient,subject,html) VALUES('qa-confirm','qa@example.invalid','Test','Test') ON CONFLICT(dedupe_key) DO NOTHING");
  await db.query("INSERT INTO email_outbox(dedupe_key,recipient,subject,html) VALUES('qa-confirm','qa@example.invalid','Test','Test') ON CONFLICT(dedupe_key) DO NOTHING");
  const emails=await db.query<{count:number}>('SELECT count(*) AS count FROM email_outbox');assert.equal(Number(emails.rows[0].count),1);
 }finally{await db.close();}
});
