import {randomBytes,createHash} from 'node:crypto';
const [email,origin]=process.argv.slice(2);
if(!email||!origin||!/^https?:\/\//.test(origin))throw new Error('Usage: node scripts/create-admin-invite.mjs administrator@email.com https://your-origin');
const token=randomBytes(32).toString('hex');
const normalizedEmail=email.trim().toLowerCase();
const invitation={email:normalizedEmail,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+72*3600000).toISOString()};
// Store the hash-only environmentValue in ADMIN_SETUP_INVITE, production only.
// Deliver setupUrl privately. Never commit or log either output in CI.
console.log(JSON.stringify({environmentValue:JSON.stringify(invitation),setupUrl:origin.replace(/\/$/,'')+'/control-room/setup#'+new URLSearchParams({email:normalizedEmail,token}).toString()},null,2));
