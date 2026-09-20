import {reconcileSubscriptions} from '@/lib/subscriptions';
export const maxDuration=120;
import {reconcileHolds} from '@/lib/payments';
import {processCommunications} from '@/lib/communications';
import {drainOutbox} from '@/lib/email';
import {db} from '@/lib/db';
export async function GET(req:Request){if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return new Response('Unauthorized',{status:401});if(!process.env.DATABASE_URL)return Response.json({skipped:true});if(process.env.STRIPE_SECRET_KEY){await reconcileHolds();await reconcileSubscriptions();}await processCommunications();const email=await drainOutbox();await db()`delete from rate_limits where reset_at<now()-interval '1 day'`;await db()`delete from auth_codes where expires_at<now()-interval '1 day'`;return Response.json({ok:true,email});}
