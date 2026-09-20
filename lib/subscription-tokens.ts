import {SignJWT,jwtVerify} from 'jose';
function key(){if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error('Sign-in is not configured.');return new TextEncoder().encode(process.env.SESSION_SECRET);}
export async function managementToken(planId:string){return new SignJWT({planId}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('90d').setAudience('carolina-subscription').setIssuer('carolina-homekeeping').sign(key());}
export async function managementPlan(token:string){try{const {payload}=await jwtVerify(token,key(),{algorithms:['HS256'],audience:'carolina-subscription',issuer:'carolina-homekeeping'});return typeof payload.planId==='string'?payload.planId:null}catch{return null}}
export async function managementLink(planId:string){return `${process.env.APP_URL}/booking/manage#token=${await managementToken(planId)}`;}
