import Stripe from 'stripe';
let client:Stripe|undefined;
export function stripe(){if(!process.env.STRIPE_SECRET_KEY)throw new Error('Payment setup is not complete.');return client??=new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:15000});}
