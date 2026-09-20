import {cookies} from 'next/headers';
import {randomInt,createHmac} from 'node:crypto';
import {z} from 'zod';
import {db} from '@/lib/db';
import {allowedEmails,setAdminSession} from '@/lib/auth';
import {adminEmailSchema} from '@/lib/passwords';
import {authenticatePassword} from '@/lib/password-store';
import {sendEmail} from '@/lib/email';
import {checkOrigin,rateLimit,limitKey,hash,apiError} from '@/lib/security';
const digest=(s:string)=>createHmac('sha256',process.env.SESSION_SECRET!).update(s).digest('hex');
export async function POST(req:Request){try{
 checkOrigin(req);if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error('Sign-in is not configured yet.');
 const input=z.object({email:adminEmailSchema,code:z.string().regex(/^\d{6}$/).optional(),password:z.string().min(1).max(128).optional()}).refine(i=>!(i.code&&i.password)).parse(await req.json());
 await rateLimit(req,'auth',12);await limitKey(hash('auth-email:'+input.email),12);
 const sql=db();
 if(input.password!==undefined){
  if(!await authenticatePassword(sql,input.email,input.password,allowedEmails()))return Response.json({error:'Sign-in failed. Check your email and password.'},{status:401});
  await setAdminSession(input.email);return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new Error('Sign-in by email is not available yet. Please use your password.');
 if(!input.code){
  if(allowedEmails().includes(input.email)){
   const code=String(randomInt(100000,1000000));
   await sql`update auth_codes set used=true where email=${input.email} and used=false`;
   const [row]=await sql`insert into auth_codes(email,code_hash,expires_at) values(${input.email},${digest(input.email+':'+code)},now()+interval '10 minutes') returning id`;
   await sendEmail(input.email,'Your Carolina Homekeeping Control Room code',`<p>Your sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you didn’t request this code, ignore this email.</p>`,row.id);
  }
  return Response.json({ok:true,message:'If this email has access, a sign-in code is on its way.'});
 }
 const valid=await sql.begin(async tx=>{
  const [row]=await tx`select * from auth_codes where email=${input.email} and used=false and expires_at>now() order by created_at desc limit 1 for update`;
  if(!row||row.attempts>=5||!allowedEmails().includes(input.email))return false;
  await tx`update auth_codes set attempts=attempts+1 where id=${row.id}`;
  if(row.code_hash!==digest(input.email+':'+input.code))return false;
  await tx`update auth_codes set used=true where id=${row.id}`;return true;
 });
 if(!valid)throw new Error('Invalid code or expired code. Request a new code and try again.');
 await setAdminSession(input.email);
 return Response.json({ok:true});
 }catch(e){return apiError(e);}}
export async function DELETE(req:Request){try{checkOrigin(req);(await cookies()).delete('ch_admin');return Response.json({ok:true});}catch(e){return apiError(e);}}
