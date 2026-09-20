import {cookies} from 'next/headers';
import {SignJWT,jwtVerify} from 'jose';
export const allowedEmails=()=> (process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
function secret(){if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error('Sign-in is not configured.');return new TextEncoder().encode(process.env.SESSION_SECRET);}
export async function createSession(email:string){return new SignJWT({email}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').setAudience('carolina-control-room').setIssuer('carolina-homekeeping').sign(secret());}
export async function setAdminSession(email:string){(await cookies()).set('ch_admin',await createSession(email),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:28800,path:'/'});}
export async function adminUser(){const session=(await cookies()).get('ch_admin')?.value;if(!session)return null;try{const {payload}=await jwtVerify(session,secret(),{algorithms:['HS256'],audience:'carolina-control-room',issuer:'carolina-homekeeping'});return typeof payload.email==='string'&&allowedEmails().includes(payload.email)?payload.email:null;}catch{return null;}}
export async function requireAdmin(){const user=await adminUser();if(!user)throw new Error('Sign-in required.');return user;}
