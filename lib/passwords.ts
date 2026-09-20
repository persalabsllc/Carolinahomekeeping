import {randomBytes,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {z} from 'zod';

export const passwordSchema=z.string().min(12).max(128);
export const adminEmailSchema=z.string().trim().toLowerCase().max(254).pipe(z.email());
export const invitationSchema=z.object({email:adminEmailSchema,tokenHash:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.iso.datetime()});
export const invitationHash=(token:string)=>createHash('sha256').update(token).digest('hex');
const prefix='scrypt-v1';
function derive(password:string,salt:Buffer):Promise<Buffer>{
 return new Promise((resolve,reject)=>scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024},(error,key)=>error?reject(error):resolve(key)));
}
export async function hashPassword(password:string){
 passwordSchema.parse(password);
 const salt=randomBytes(16),key=await derive(password,salt);
 return `${prefix}$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password:string,encoded?:string){
 const parts=encoded?.split('$');
 const valid=parts?.length===3&&parts[0]===prefix&&/^[a-f0-9]{32}$/.test(parts[1])&&/^[a-f0-9]{128}$/.test(parts[2]);
 // Unknown accounts still pay the same hashing cost and receive the same error.
 const salt=valid?Buffer.from(parts![1],'hex'):Buffer.alloc(16);
 const expected=valid?Buffer.from(parts![2],'hex'):Buffer.alloc(64);
 const actual=await derive(password,salt);
 return timingSafeEqual(actual,expected)&&!!valid;
}
