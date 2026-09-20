import {z} from 'zod';
import {db} from '@/lib/db';
import {allowedEmails,setAdminSession} from '@/lib/auth';
import {adminEmailSchema} from '@/lib/passwords';
import {preparePassword,claimInvitation,invitationValid} from '@/lib/password-store';
import {checkOrigin,rateLimit,limitKey,hash,apiError} from '@/lib/security';
export async function POST(req:Request){try{
 checkOrigin(req);
 if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error('Sign-in is not configured yet.');
 const input=z.object({email:adminEmailSchema,token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().max(128).optional()}).parse(await req.json());
 await rateLimit(req,'auth-setup',12);await limitKey(hash('auth-setup-email:'+input.email),12);
 const sql=db(),allowed=allowedEmails();
 // A read-only check lets the owner verify their invitation before choosing a password.
 if(input.password===undefined){
  if(!await invitationValid(sql,input.email,input.token,allowed))throw new Error('Sign-in setup link is invalid, expired or already used.');
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }
 const passwordHash=await preparePassword(sql,input.email,input.token,input.password,allowed);
 await sql.begin(async tx=>{await claimInvitation(tx,input.email,input.token,passwordHash,allowed)});
 await setAdminSession(input.email);
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
