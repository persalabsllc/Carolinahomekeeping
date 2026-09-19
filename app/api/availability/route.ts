import {db} from '@/lib/db';
import {getConfig,canBook} from '@/lib/config';
export const dynamic='force-dynamic';
export async function GET(){
 if(!canBook())return Response.json({slots:[],open:false},{headers:{'Cache-Control':'no-store'}});
 try{const sql=db();const config=await getConfig();
 const slots=await sql`select s.id,s.starts_at,s.ends_at,s.label from appointment_slots s where s.blocked=false and s.starts_at>now()+${config.leadHours}*interval '1 hour' and s.starts_at<now()+interval '90 days' and s.capacity>(select count(*) from bookings b where b.slot_id=s.id and b.status not in ('cancelled','refunded'))+(select count(*) from checkout_holds h where h.slot_id=s.id and h.status in ('creating','open')) order by s.starts_at limit 100`;
 return Response.json({slots,open:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'We couldn’t load appointment times. Please try again.'},{status:503});}
}
