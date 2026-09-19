import postgres from 'postgres';
let client:ReturnType<typeof postgres>|undefined;
export function db(){
 if(!process.env.DATABASE_URL)throw new Error('Database is not configured.');
 return client??=postgres(process.env.DATABASE_URL,{max:5,idle_timeout:20,connect_timeout:10,prepare:false,ssl:process.env.DATABASE_URL.includes('localhost')?false:'require'});
}
