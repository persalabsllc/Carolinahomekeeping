import {PageIntro} from '@/components/ui';
import {ContactForm} from '@/components/contact-form';
import {readiness} from '@/lib/config';
import {businessContact} from '@/lib/business-contact';
export const metadata={title:'Contact Carolina Homekeeping'};
export const dynamic='force-dynamic';
export default function Contact(){return <><PageIntro label="We’re here to help" title="A little help, right here.">Questions about a service, an upcoming appointment or something we missed? Send us a message. For an existing booking, include your booking reference.</PageIntro><div className="container content-section commercial-layout"><div className="contact-strip"><h2 style={{fontSize:'2.6rem'}}>Let’s get it handled.</h2><p>For a cancellation, reschedule or service concern, call us or use this form. We record the time you send your message.</p><p><a className="text-link" href={businessContact.phoneHref}>Call {businessContact.phone}</a></p>{process.env.SUPPORT_EMAIL&&<a className="text-link" href={'mailto:'+process.env.SUPPORT_EMAIL}>{process.env.SUPPORT_EMAIL}</a>}<p>Service area: New Bern, Trent Woods, James City, River Bend and selected nearby Craven County addresses.</p></div><div className="panel"><ContactForm type="contact" leadReady={readiness().database}/></div></div></>;}
