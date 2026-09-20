import {cookies} from 'next/headers';
import {db} from '@/lib/db';
import {leadSchema} from '@/lib/validation';
import {getConfig} from '@/lib/config';
import {calculateQuote} from '@/lib/pricing';
import {apiError,checkOrigin,rateLimit,token,hash} from '@/lib/security';
export async function POST(req:Request){try{
 checkOrigin(req);await rateLimit(req,'leads',30);
 const input=leadSchema.parse(await req.json());
 if(input.website)return Response.json({ok:true});
 const jar=await cookies();let rawToken=input.type==='residential'?(jar.get('ch_lead')?.value||token()):token();
 const quote=input.quote?calculateQuote(input.quote,await getConfig()):null;
 const payload={home:input.home,quoteInput:input.quote,company:input.company,businessType:input.businessType,squareFeet:input.squareFeet,frequency:input.frequency,preferredContact:input.preferredContact,notes:input.notes};
 const sql=db();
 if(input.type==='residential'){const [previous]=await sql`select status from leads where token_hash=${hash(rawToken)}`;if(previous?.status==='converted')rawToken=token();}
 await sql`insert into leads(token_hash,type,name,email,phone,address,service,quoted_amount,stage,payload,marketing_consent_at) values(${hash(rawToken)},${input.type},${input.contact.name},${input.contact.email},${input.contact.phone},${input.address},${input.quote?.service||null},${quote&&!quote.review?quote.total:null},${input.stage},${sql.json(payload)},${input.marketingConsent?new Date():null}) on conflict(token_hash) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,address=excluded.address,service=excluded.service,quoted_amount=excluded.quoted_amount,stage=excluded.stage,payload=excluded.payload,marketing_consent_at=case when excluded.marketing_consent_at is null then null else coalesce(leads.marketing_consent_at,excluded.marketing_consent_at) end,updated_at=now() where leads.status!='converted'`;
 if(input.type==='residential')jar.set('ch_lead',rawToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:60*60*24*30,path:'/'});
 return Response.json({ok:true});
 }catch(e){return apiError(e);}}
