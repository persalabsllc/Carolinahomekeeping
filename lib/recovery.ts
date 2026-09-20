import type {ScheduleSql} from './schedule-store';
import {readEmailToken} from './email-links';
export async function recoveryOffer(sql:ScheduleSql,token:string,email?:string,leadId?:string,now=new Date()){
 const id=await readEmailToken('recovery',token);if(!id)throw new Error('This offer link is invalid or expired. Please start a new booking.');
 const [offer]=await sql.unsafe(`select o.*,l.payload,l.name,l.phone,l.address,l.status as lead_status from recovery_offers o join leads l on l.id=o.lead_id where o.id=$1 and o.email=l.email`,[id]);
 if(!offer||offer.redeemed_at||new Date(offer.expires_at)<=now||offer.lead_status==='converted'||(email&&offer.email!==email)||(leadId&&offer.lead_id!==leadId))throw new Error('This offer is expired, already used, or belongs to another email address.');
 const [previous]=await sql.unsafe('select b.id from bookings b join customers c on c.id=b.customer_id where c.email=$1 limit 1',[offer.email]);
 if(previous)throw new Error('This offer is only available for your first booking.');
 return offer;
}
