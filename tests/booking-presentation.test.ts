import test from 'node:test';
import assert from 'node:assert/strict';
import {groupAddons} from '../lib/addon-groups';
import {defaultConfig} from '../lib/pricing';
import {bookingCalendar} from '../lib/booking-calendar';
import {appointmentDetails,ownerBookingEmail} from '../lib/email-templates';

test('grouping preserves configured extras and prices, and move cleaning excludes duplicate cabinets',()=>{
 const extra={...defaultConfig.addons[0],id:'future_extra',price:1234};
 const addons=[...defaultConfig.addons,extra];
 const groups=groupAddons(addons,'standard');
 assert.deepEqual(groups.map(g=>g.name),['Everyday Help','Kitchen Extras','Detail Extras']);
 assert.deepEqual(groups.flatMap(g=>g.addons),addons);
 assert.equal(groupAddons(addons,'move').flatMap(g=>g.addons).some(a=>a.id==='cabinets'),false);
 assert.equal(groupAddons(addons.map(a=>({...a,enabled:false})),'standard').length,0);
});
test('calendar export saves the confirmed start with no estimated duration, token or recurring rule',()=>{
 const ics=bookingCalendar({reference:'CH-1234',service:'standard',startsAt:'2026-11-02T13:00:00Z',address:'10 Example St, New Bern'},new Date('2026-10-01T12:00:00Z'));
 assert.ok(ics.includes('DTSTART:20261102T130000Z\r\n'));
 assert.ok(ics.includes('UID:CH-1234@carolinahomekeeping.com'));
 assert.ok(ics.includes('LOCATION:10 Example St\\, New Bern'));
 assert.doesNotMatch(ics,/DTEND|DURATION|RRULE|session_id|token/);
 assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
test('calendar fields escape injected lines and fold UTF-8 without splitting characters',()=>{
 const ics=bookingCalendar({reference:'CH-TEST',service:'deep',startsAt:'2026-09-25T12:00:00Z',address:'é'.repeat(90)+'\r\nBEGIN:VEVENT;evil,entry'});
 assert.equal(ics.match(/\r\nBEGIN:VEVENT\r\n/g)?.length,1);
 assert.ok(ics.replace(/\r\n /g,'').includes('\\nBEGIN:VEVENT\\;evil\\,entry'));
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 assert.ok(!ics.includes('�'));
});
test('customer appointment emails show start only; owner email retains internal finish time',()=>{
 const booking={reference:'CH-TEST',service:'standard',frequency:'once',starts_at:'2026-09-25T12:00:00Z',ends_at:'2026-09-25T14:00:00Z',address:'Example home',name:'QA',amount:18900,payment_status:'paid',email:'qa@example.com',phone:'2525550100',quote:{addons:[]}};
 const customer=appointmentDetails(booking);
 assert.ok(customer.includes('8:00 AM start'));
 assert.doesNotMatch(customer,/finish|10:00 AM/);
 assert.match(ownerBookingEmail(booking,'https://www.carolinahomekeeping.com'),/Estimated finish 10:00 AM/);
});
