import {readFileSync} from 'node:fs';
import {db} from '../lib/db';
import {defaultConfig} from '../lib/pricing';
import {defaultScheduling} from '../lib/scheduling';
const sql=db();
async function migrate(){
await sql.begin(async tx=>{
 await tx`select pg_advisory_xact_lock(72901641)`;
 await tx.unsafe(readFileSync('db/001_initial.sql','utf8'));
 await tx.unsafe(readFileSync('db/002_duration_scheduling.sql','utf8'));
 await tx`insert into settings(key,value) values('scheduling',${tx.json(defaultScheduling)}) on conflict(key) do nothing`;
 await tx`insert into settings(key,value) values('pricing',${tx.json(defaultConfig)}) on conflict(key) do nothing`;
});
console.log('Schema migrated; pricing and scheduling initialized; no customer records seeded.');
await sql.end();
}
migrate().catch(async()=>{console.error("Database migration failed.");await sql.end();process.exitCode=1;});
