import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {enqueueEmail} from '../lib/communications';
import {normalizeEmailHeaders} from '../lib/email-headers';
import {sendEmail,EmailError} from '../lib/email';
import type {ScheduleSql} from '../lib/schedule-store';
const headers={'List-Unsubscribe':'<https://example.invalid/unsubscribe>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'};

test('normalizes legacy JSON headers without dropping unsubscribe metadata; rejects unsafe shapes',()=>{
 assert.deepEqual(normalizeEmailHeaders(headers),headers);
 assert.deepEqual(normalizeEmailHeaders(JSON.stringify(headers)),headers);
 assert.deepEqual(normalizeEmailHeaders(undefined),{});
 for(const value of ['broken','null','[]',JSON.stringify(JSON.stringify(headers)),[],42,{'Bad Name':'x'},{valid:1},{valid:'x\r\nInjected: bad'}])assert.throws(()=>normalizeEmailHeaders(value));
});

test('enqueue uses a text parameter so Postgres.js cannot double-encode JSONB headers',async()=>{
 const {types}=await import(pathToFileURL(process.cwd()+'/node_modules/postgres/src/types.js').href);
 // Reproduce the production driver defect, not just PGlite's text parameter behavior.
 assert.equal(typeof types.json.parse(types.json.serialize(JSON.stringify(headers))),'string');
 const pg=new PGlite();
 try{
  await pg.exec('create table email_outbox(dedupe_key text unique,recipient text,subject text,html text,plain_text text,kind text,booking_id text,lead_id text,scheduled_start text,expires_at text,headers jsonb)');
  const sql={unsafe:async(query:string,params:any[])=>{
   assert.match(query,/\$11::text::jsonb/);
   params[10]=types.string.serialize(params[10]);
   return (await pg.query(query,params)).rows;
  }} as unknown as ScheduleSql;
  for(const kind of ['recovery','feedback','confirmation','reminder','owner_booking']){
   await enqueueEmail(sql,{key:kind,to:'qa@example.invalid',subject:'Isolated test',html:'<p>Test</p>',kind,headers:['recovery','feedback'].includes(kind)?headers:undefined});
  }
  const rows=(await pg.query<{kind:string;headers:unknown}>('select kind,headers from email_outbox')).rows;
  for(const row of rows)assert.deepEqual(row.headers,['recovery','feedback'].includes(row.kind)?headers:{});
 }finally{await pg.close();}
});

test('actual sender emits object headers for new, default and legacy rows without real network sends',async()=>{
 const originalFetch=globalThis.fetch,oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.EMAIL_FROM;
 process.env.RESEND_API_KEY='not-a-real-key';process.env.EMAIL_FROM='QA <qa@example.invalid>';
 const bodies:any[]=[];
 globalThis.fetch=async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return Response.json({id:'isolated-provider-id'});};
 try{
  for(const value of [headers,JSON.stringify(headers),undefined])assert.equal(await sendEmail('qa@example.invalid','Test','<p>Test</p>','stable-key','Test',value as any),'isolated-provider-id');
  assert.deepEqual(bodies.map(b=>b.headers),[headers,headers,{}]);
  await assert.rejects(sendEmail('qa@example.invalid','Test','Test','stable-key','Test',[] as any),e=>e instanceof EmailError&&e.status===422);
  assert.equal(bodies.length,3,'invalid headers never reach the provider');
 }finally{globalThis.fetch=originalFetch;if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;if(oldFrom===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=oldFrom;}
});
