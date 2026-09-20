import {db} from '@/lib/db';
import {readEmailToken} from '@/lib/email-links';
import {emailTemplate,escapeHtml} from '@/lib/email-templates';
const page=(body:string,status=200)=>new Response(emailTemplate('Your email preferences.',body),{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
export async function GET(req:Request){const t=new URL(req.url).searchParams.get('token')||'',id=await readEmailToken('unsubscribe',t);if(!id)return page('<p>This link is invalid or expired. Please use the unsubscribe link in a recent email.</p>',400);return page(`<p>Stop receiving booking offers and feedback requests from Carolina Homekeeping Co. You’ll still receive necessary appointment and payment messages.</p><form method="post"><input type="hidden" name="token" value="${escapeHtml(t)}"><button style="padding:14px 22px;background:#07364b;color:white;border:0;border-radius:6px;font-size:16px" type="submit">Unsubscribe</button></form>`);}
export async function POST(req:Request){
 const url=new URL(req.url);let t=url.searchParams.get('token')||'';if(!t){try{t=String((await req.formData()).get('token')||'');}catch{}}
 const id=await readEmailToken('unsubscribe',t);if(!id)return page('<p>This link is invalid or expired.</p>',400);
 await db()`update email_preferences set unsubscribed_at=coalesce(unsubscribed_at,now()) where id=${id}`;
 return page('<p>You’re unsubscribed from booking offers and feedback requests. Necessary appointment and payment emails will continue.</p>');
}
