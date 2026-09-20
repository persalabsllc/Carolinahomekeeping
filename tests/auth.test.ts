import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {hashPassword,verifyPassword,invitationHash} from '../lib/passwords';
import {invitationValid,preparePassword,claimInvitation,authenticatePassword,type AuthSql} from '../lib/password-store';

test('passwords use unique salted hashes and reject wrong/malformed credentials',async()=>{
 const password='Isolated test passphrase 456!';
 const first=await hashPassword(password),second=await hashPassword(password);
 assert.notEqual(first,second);assert.ok(!first.includes(password));
 assert.equal(await verifyPassword(password,first),true);
 assert.equal(await verifyPassword('wrong password',first),false);
 assert.equal(await verifyPassword(password,undefined),false);
 assert.equal(await verifyPassword(password,'scrypt-v1$bad$bad'),false);
 await assert.rejects(hashPassword('short'));
});
test('admin setup is allowlisted, expiring, transactional, single-use, and independent of email',async()=>{
 const database=new PGlite();
 const adapter=(q:{query:(s:string,p?:any[])=>Promise<any>})=>({unsafe:async(s:string,p:any[]=[])=> (await q.query(s,p)).rows}) as unknown as AuthSql;
 const email='owner@example.invalid',allowed=[email],token='a'.repeat(64),password='Only for isolated testing 789!';
 try{
  for(const f of ['db/001_initial.sql','db/003_admin_passwords.sql','db/003_admin_passwords.sql'])await database.exec(readFileSync(f,'utf8'));
  const sql=adapter(database);
  await database.query("insert into admin_invitations(token_hash,email,expires_at) values($1,$2,now()+interval '1 hour')",[invitationHash(token),email]);
  assert.equal(await invitationValid(sql,email,token,allowed),true);
  assert.equal(await invitationValid(sql,email,'b'.repeat(64),allowed),false);
  assert.equal(await invitationValid(sql,'outsider@example.invalid',token,allowed),false);
  assert.equal(await invitationValid(sql,email,token,[]),false);
  await database.query("update admin_invitations set expires_at=now()-interval '1 second'");
  await assert.rejects(preparePassword(sql,email,token,password,allowed));
  await database.query("update admin_invitations set expires_at=now()+interval '1 hour'");
  const encoded=await preparePassword(sql,email,token,password,allowed);
  const results=await Promise.allSettled([1,2].map(()=>database.transaction(tx=>claimInvitation(adapter(tx),email,token,encoded,allowed))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal(await invitationValid(sql,email,token,allowed),false);
  assert.equal(await authenticatePassword(sql,email,password,allowed),true);
  assert.equal(await authenticatePassword(sql,email,'incorrect',allowed),false);
  assert.equal(await authenticatePassword(sql,email,password,[]),false);
  assert.equal(await authenticatePassword(sql,'outsider@example.invalid',password,allowed),false);
  assert.equal((await database.query('select * from admin_credentials')).rows.length,1);
  assert.equal((await database.query('select * from audit_log')).rows.length,1);
 }finally{await database.close()}
});
