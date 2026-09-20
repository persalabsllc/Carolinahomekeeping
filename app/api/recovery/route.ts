import {cookies} from 'next/headers';
import {db} from '@/lib/db';
import {recoveryOffer} from '@/lib/recovery';
import {checkOrigin,rateLimit,apiError,token,hash} from '@/lib/security';
import {quoteSchema} from '@/lib/pricing';
import {homeSchema} from '@/lib/validation';
export async function POST(req:Request){try{
 checkOrigin(req);await rateLimit(req,'recovery',15);const data=await req.json();
 if(typeof data.token!=='string'||data.token.length>2000)throw new Error('This offer link is invalid or expired.');
 const sql=db(),offer=await recoveryOffer(sql,data.token),newToken=token();
 const input=quoteSchema.parse(offer.payload.quoteInput),home=homeSchema.pick({address:true,city:true,state:true}).parse(offer.payload.home);
 await sql`update leads set token_hash=${hash(newToken)},updated_at=now() where id=${offer.lead_id}`;
 (await cookies()).set('ch_lead',newToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:60*60*24*30,path:'/'});
 return Response.json({input,home,contact:{name:offer.name,email:offer.email,phone:offer.phone},percent:offer.percent,expires:offer.expires_at},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
