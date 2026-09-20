import type Stripe from 'stripe';
import {money,serviceNames,frequencyNames,type Quote} from './pricing';
import type {BookingInput} from './validation';
import {intervalWeeks,nextRenewal} from './recurrence';
export function checkoutParameters(hold:Record<string,any>,origin:string):Stripe.Checkout.SessionCreateParams{
 const input=hold.payload as BookingInput,quote=hold.quote as Quote,weeks=intervalWeeks(input.frequency);
 const metadata={app:'carolina-homekeeping',hold_id:String(hold.id)};
 const product={name:`Carolina Homekeeping — ${serviceNames[input.service]}`,description:`${frequencyNames[input.frequency]}. Includes selected extras${quote.tax?` and ${money(quote.tax)} tax`:''}.`};
 const line={price_data:{currency:'usd',unit_amount:quote.total,product_data:product},quantity:1};
 const common:Stripe.Checkout.SessionCreateParams={payment_method_types:['card'],customer_email:input.contact.email,expires_at:Math.floor(new Date(hold.expires_at).getTime()/1000),success_url:`${origin}/booking/confirmed?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/booking/cancelled`,client_reference_id:String(hold.id),metadata};
 if(!weeks)return {...common,mode:'payment',line_items:[line],payment_intent_data:{metadata},custom_text:{submit:{message:'Your cleaning is confirmed after successful payment. Cancellation and service policies accepted at booking apply.'}}};
 if(!input.recurringAccepted)throw new Error('Please accept automatic recurring billing before subscribing.');
 return {...common,mode:'subscription',payment_method_collection:'always',
  // Prepay the first visit now. Deferring the recurring line until the next renewal
  // avoids a duplicate charge or prorated partial cleaning between appointments.
  line_items:[{...line,price_data:{...line.price_data,product_data:{...product,name:product.name+' — first visit'}}},{...line,price_data:{...line.price_data,unit_amount:quote.regularTotal??quote.total,recurring:{interval:'week',interval_count:weeks}}}],
  subscription_data:{metadata,trial_end:Math.floor(Date.parse(nextRenewal(input.scheduledStart,weeks))/1000),trial_settings:{end_behavior:{missing_payment_method:'cancel'}}},
  custom_text:{submit:{message:`${money(quote.total)} for your first visit today, then ${money(quote.regularTotal??quote.total)} every ${weeks===1?'week':weeks+' weeks'}, starting the day before your second visit. Selected extras repeat. Renews automatically until canceled. Manage or cancel online using your confirmation link.`}},
 };
}
