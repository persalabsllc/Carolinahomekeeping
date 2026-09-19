import { defaultConfig, configSchema, type PricingConfig } from './pricing';
import { db } from './db';
export async function getConfig():Promise<PricingConfig>{
 if(!process.env.DATABASE_URL)return defaultConfig;
 const rows=await db()`select value from settings where key='pricing'`;
 return rows.length?configSchema.parse(rows[0].value):defaultConfig;
}
export function readiness(){return {
 database:!!process.env.DATABASE_URL,
 payments:!!process.env.STRIPE_SECRET_KEY&&!!process.env.STRIPE_WEBHOOK_SECRET,
 email:!!process.env.RESEND_API_KEY&&!!process.env.EMAIL_FROM,
 admin:!!process.env.SESSION_SECRET&&!!process.env.ADMIN_EMAILS,
 enabled:process.env.BOOKING_ENABLED==='true',
};}
export function canBook(){return Object.values(readiness()).every(Boolean);}
