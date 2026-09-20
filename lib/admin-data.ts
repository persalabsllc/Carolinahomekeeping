import {db} from './db';
import {getScheduling,readOccupancy} from './schedule-store';
export async function getAdminData(){const sql=db();const [bookings,customers,leads,blocks,issues,scheduling,occupancy]=await Promise.all([
 sql`select b.*,c.name,c.email,c.phone,h.address,h.city,h.zip,s.starts_at,s.ends_at from bookings b join customers c on c.id=b.customer_id join homes h on h.id=b.home_id join appointment_slots s on s.id=b.slot_id order by s.starts_at desc limit 1000`,
 sql`select c.*,coalesce((select sum(b.amount-b.refunded_amount) from bookings b where b.customer_id=c.id and b.payment_status in ('paid','partially_refunded','refunded')),0) as lifetime_revenue,(select min(s.starts_at) from bookings b join appointment_slots s on s.id=b.slot_id where b.customer_id=c.id and s.starts_at>now() and b.status='confirmed') as next_cleaning,(select count(*) from bookings b where b.customer_id=c.id) as booking_count,(select frequency from recurring_plans r where r.customer_id=c.id and r.status!='inactive' order by r.created_at desc limit 1) as recurring_frequency,coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'address',h.address,'city',h.city,'zip',h.zip,'profile',h.profile)) from homes h where h.customer_id=c.id),'[]') as homes from customers c order by c.created_at desc limit 1000`,
 sql`select * from leads order by updated_at desc limit 1000`,
 sql`select * from schedule_blocks where ends_at>now()-interval '30 days' order by starts_at`,
 sql`select count(*) as pending_email,count(*) filter(where attempts>=3) as failed_email from email_outbox where status!='sent'`,
 getScheduling(sql),
 readOccupancy(sql,'1970-01-01T00:00:00Z','9999-01-01T00:00:00Z'),
 ]);return JSON.parse(JSON.stringify({bookings,customers,leads,blocks,scheduling,occupancy,issues:issues[0]}));}
