import {SignJWT,jwtVerify} from 'jose';
import {z} from 'zod';
type Purpose='recovery'|'feedback'|'unsubscribe';
function secret(){if((process.env.SESSION_SECRET?.length||0)<32)throw new Error('Email links are not configured.');return new TextEncoder().encode(process.env.SESSION_SECRET);}
export function emailOrigin(){const url=new URL(process.env.APP_URL||'https://carolinahomekeeping.com');if(url.protocol!=='https:'&&url.hostname!=='localhost')throw new Error('Invalid email origin.');return url.origin;}
export async function emailToken(purpose:Purpose,id:string,expires:number|'90d'|'3650d'='90d'){
 return new SignJWT({id}).setProtectedHeader({alg:'HS256'}).setIssuer('carolina-homekeeping').setAudience('email-'+purpose).setIssuedAt().setExpirationTime(expires).sign(secret());
}
export async function readEmailToken(purpose:Purpose,token:string){try{const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256'],issuer:'carolina-homekeeping',audience:'email-'+purpose});return z.uuid().parse(payload.id);}catch{return null;}}
