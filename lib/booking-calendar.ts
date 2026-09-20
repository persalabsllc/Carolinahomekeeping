import {serviceNames,type Service} from './pricing';
const stamp=(value:string)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const escape=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line:string){
  const encoder=new TextEncoder();let output='',width=0;
  for(const character of line){const size=encoder.encode(character).length;if(width+size>75){output+='\r\n ';width=1;}output+=character;width+=size;}
  return output;
}
/** An arrival reminder, not a promised cleaning duration or recurring calendar rule. */
export function bookingCalendar(booking:{reference:string;service:Service;startsAt:string;address?:string},now=new Date()){
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Carolina Homekeeping Co.//Booking//EN','CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',`UID:${escape(booking.reference)}@carolinahomekeeping.com`,`DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(booking.startsAt)}`,`SUMMARY:${escape('Carolina Homekeeping — '+serviceNames[booking.service])}`,
    `DESCRIPTION:${escape('Scheduled cleaning start. Reference: '+booking.reference+'. For changes, contact hello@carolinahomekeeping.com or 252-515-4389.')}`,
    ...(booking.address?[`LOCATION:${escape(booking.address)}`]:[]),'STATUS:CONFIRMED','TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR','',
  ].map(fold).join('\r\n');
}
