import {CheckCircle2,Mail,House} from 'lucide-react';
export function BookingNextSteps(){return <section className="booking-next-steps" aria-labelledby="next-steps-title"><h3 id="next-steps-title">What happens next</h3><ul>
  <li><CheckCircle2 size={19} aria-hidden="true"/><span><strong>Your appointment is confirmed after payment.</strong> You’ll see your booking details right away.</span></li>
  <li><Mail size={19} aria-hidden="true"/><span><strong>We’ll email your confirmation.</strong> You’ll also receive reminders before your appointment.</span></li>
  <li><House size={19} aria-hidden="true"/><span><strong>We’ll take it from here.</strong> Have your home ready for access, secure pets, and leave out any fresh linens or laundry supplies you selected.</span></li>
  </ul><p>Need a hand? Reply to your confirmation email or contact us.</p></section>;}
