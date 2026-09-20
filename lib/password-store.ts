import {db} from './db';
import {hashPassword,verifyPassword,invitationHash,passwordSchema} from './passwords';

export type AuthSql=Pick<ReturnType<typeof db>,'unsafe'>;
const invalidInvite=()=>new Error('Sign-in setup link is invalid, expired or already used.');
export async function invitationValid(sql:AuthSql,email:string,token:string,allowed:string[]){
 if(!allowed.includes(email)||!(/^[a-f0-9]{64}$/).test(token))return false;
 const rows=await sql.unsafe('select 1 from admin_invitations i where token_hash=$1 and email=$2 and used_at is null and expires_at>now() and not exists(select 1 from admin_credentials c where c.email=i.email)',[invitationHash(token),email]);
 return rows.length===1;
}
export async function preparePassword(sql:AuthSql,email:string,token:string,password:string,allowed:string[]){
 if(!await invitationValid(sql,email,token,allowed))throw invalidInvite();
 if(!passwordSchema.safeParse(password).success)throw new Error('Please choose a password with 12–128 characters.');
 return hashPassword(password);
}
// Caller wraps this in one transaction. The row lock plus unique email prevent replay/races.
export async function claimInvitation(sql:AuthSql,email:string,token:string,passwordHash:string,allowed:string[]){
 if(!allowed.includes(email))throw invalidInvite();
 const rows=await sql.unsafe('select token_hash from admin_invitations where token_hash=$1 and email=$2 and used_at is null and expires_at>now() for update',[invitationHash(token),email]);
 if(rows.length!==1)throw invalidInvite();
 const created=await sql.unsafe('insert into admin_credentials(email,password_hash) values($1,$2) on conflict(email) do nothing returning email',[email,passwordHash]);
 if(created.length!==1)throw invalidInvite();
 await sql.unsafe('update admin_invitations set used_at=now() where email=$1 and used_at is null',[email]);
 await sql.unsafe("insert into audit_log(actor,action) values($1,'admin_password_activated')",[email]);
}
export async function authenticatePassword(sql:AuthSql,email:string,password:string,allowed:string[]){
 const rows=await sql.unsafe('select password_hash from admin_credentials where email=$1',[email]);
 const valid=await verifyPassword(password,rows[0]?.password_hash);
 return valid&&allowed.includes(email);
}
