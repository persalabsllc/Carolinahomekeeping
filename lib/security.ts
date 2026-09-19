import {createHash,randomBytes} from 'node:crypto';
import {db} from './db';
export const token=()=>randomBytes(32).toString('hex');
export const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export function checkOrigin(req:Request){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw new Error('Please reload this page and try again.');}
export async function rateLimit(req:Request,scope:string,max=30){
 const ip=req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')?.split(',')[0]||'local';
 return limitKey(hash(scope+':'+ip),max);
}
export async function limitKey(key:string,max:number){
 const sql=db();const [r]=await sql`insert into rate_limits(key,count,reset_at) values(${key},1,now()+interval '15 minutes') on conflict(key) do update set count=case when rate_limits.reset_at<now() then 1 else rate_limits.count+1 end,reset_at=case when rate_limits.reset_at<now() then now()+interval '15 minutes' else rate_limits.reset_at end returning count`;
 if(r.count>max)throw new Error('Too many attempts. Please try again in 15 minutes.');
}
export function apiError(error:unknown,status=400){
 const safe=error instanceof Error?error.message:'Something went wrong. Please try again.';
 const publicMessage=/^Please |^Too many|^That appointment|^Your price|^Online booking|^Payment |^Move cleaning|^Empty cabinets|^No appointment|^Sign-in|^Invalid code|^This booking|^Cannot |^No matching/.test(safe)?safe:'We couldn’t complete that request. Please check your details and try again.';
 console.error('Request failed:',error instanceof Error?error.name:'UnknownError');
 return Response.json({error:publicMessage},{status});
}
