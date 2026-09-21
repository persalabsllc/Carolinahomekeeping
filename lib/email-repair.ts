import type {ScheduleSql} from './schedule-store';
import {getCommunications,emailStillRelevant} from './communications';
import {normalizeEmailHeaders} from './email-headers';

/** Admin must first confirm Resend returned 422 for this specific attempt.
 * Caller holds a transaction; no send occurs here. This repairs only the known
 * legacy header defect, not bounced, ambiguous, retried or accepted messages. */
export async function repairRejectedEmailHeaders(sql:ScheduleSql,id:string,actor:string,bookingOpen:boolean){
 const [row]=await sql.unsafe('select * from email_outbox where id=$1 for update',[id]);
 if(!row||row.status!=='failed'||row.attempts!==1||row.provider_id||row.sent_at||typeof row.headers!=='string'||row.last_error!=='Provider rejected message; check email configuration.')throw new Error('This message is not eligible for the legacy header repair.');
 const headers=normalizeEmailHeaders(row.headers);
 if((row.kind==='recovery'&&!bookingOpen)||!await emailStillRelevant(sql,row,await getCommunications(sql)))throw new Error('This email is no longer eligible: check consent, expiry, booking status or active checkout.');
 // A confirmed 422 was not accepted. Preserve its original attempt in the
 // audit log and begin a fresh retry window without resetting total attempts.
 await sql.unsafe('insert into audit_log(actor,action,record_id) values($1,$2,$3)',[actor,'email_headers_repaired_after_confirmed_422; previous_first_attempt='+String(row.first_attempt_at),id]);
 await sql.unsafe("update email_outbox set headers=$2::text::jsonb,status='pending',send_after=now(),locked_at=null,first_attempt_at=null,last_error='Header format corrected after administrator confirmed provider rejection.' where id=$1",[id,JSON.stringify(headers)]);
}
