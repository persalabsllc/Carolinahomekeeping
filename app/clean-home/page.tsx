import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowRight,Check,HeartHandshake,Phone,Shirt,Utensils,BedDouble} from 'lucide-react';
import {BookingFlow} from '@/components/booking-flow';
import {LiveAvailability} from '@/components/live-availability';
import {defaultConfig} from '@/lib/pricing';
import {defaultScheduling} from '@/lib/scheduling';
import {unavailableHighlights} from '@/lib/availability-highlights';
import {businessContact} from '@/lib/business-contact';
import {money} from '@/lib/pricing';
import './landing.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={
  title:'A clean home. One less thing.',
  description:'Leave the cleaning to Carolina Homekeeping Co. See your price, choose your extras and find a time for your home in the New Bern area.',
  robots:{index:false,follow:false,googleBot:{index:false,follow:false,noimageindex:true}},
  openGraph:{title:'You have enough on your plate. Leave the cleaning to us.',description:'Your home, handled. Professional homekeeping in the New Bern area.'},
};

export default async function CleanHome(){
  const [config,scheduling,availability]=[defaultConfig,defaultScheduling,unavailableHighlights()];
  const entry=config.tiers[0];
  return <div className="ad-landing">
    <header className="ad-header">
      <Image src="/logo.webp" alt="Carolina Homekeeping Co. — Your home, handled." width={200} height={100} priority/>
      <a href={businessContact.phoneHref} aria-label={`Call Carolina Homekeeping at ${businessContact.phone}`}><Phone size={16}/><span>{businessContact.phone}</span></a>
    </header>
    <div className="ad-grid">
      <section className="ad-story" aria-labelledby="ad-heading">
        <p className="eyebrow">New Bern & neighboring communities</p>
        <h1 id="ad-heading">You have enough<br/>on your plate.<br/><em>Leave the cleaning<br/>to us.</em></h1>
        <p className="ad-lead">The floors. The bathrooms. That never-ending list.<br className="ad-desktop-break"/> Let us handle the house. You take a little time back.</p>
        <a className="button light ad-main-cta" href="#your-clean">Get my instant price <ArrowRight size={19}/></a>
        <p className="ad-starting">Standard cleaning from <strong>{money(entry.standard)}</strong><span>One-time price · {entry.label} · extras optional</span></p>
        <ul className="ad-checks"><li><Check size={17}/>Your full price before you pay</li><li><Check size={17}/>Choose a real calendar opening</li><li><Check size={17}/>One clean or a regular helping hand</li></ul>
        <div className="ad-photo"><Image src="/coastal-home.webp" alt="A calm, sunlit coastal living room" fill sizes="(max-width: 800px) 100vw, 42vw"/><div><span>Less on your list.</span><strong>More room to breathe.</strong></div></div>
        <div className="ad-promise"><HeartHandshake size={26}/><div><h2>A clean you can feel good about.</h2><p>Something included was missed? Tell us within 24 hours and we’ll arrange a return to correct that area at no extra charge.</p></div></div>
      </section>
      <section id="your-clean" className="ad-form" aria-label="Get your instant cleaning price">
        <BookingFlow config={config} scheduling={scheduling} initial={{}} leadReady={true} campaign/>
      </section>
    </div>
    <section className="ad-benefits" aria-labelledby="ad-benefits-title"><div><p className="eyebrow">The chores don’t have to be yours.</p><h2 id="ad-benefits-title">A clean home.<br/>And a little extra help.</h2><p>Kitchen surfaces, bathrooms, dusting and floors are part of a Standard clean. Add the everyday help you want, right in your booking.</p></div><div className="ad-extra-cards">{[{id:'dishes',title:'Dishes, handled.',body:'Clear the sink and your head.',Icon:Utensils},{id:'laundry',title:'Laundry, handled.',body:'Wash, dry and fold. Off your list.',Icon:Shirt},{id:'linens',title:'Fresh sheets, handled.',body:'Leave the linen change to us.',Icon:BedDouble}].filter(item=>config.addons.some(a=>a.id===item.id&&a.enabled)).map(({id,title,body,Icon})=>{const addon=config.addons.find(a=>a.id===id)!;return <article key={id}><Icon size={25}/><h3>{title}</h3><p>{body}</p><span>{money(addon.price)} / {addon.unit}{addon.taxable?' + tax':''}</span></article>;})}</div></section>
    <LiveAvailability initial={availability} bookingHref="#your-clean"/>
    <section className="ad-faq" aria-labelledby="ad-faq-title"><h2 id="ad-faq-title">A few things you might be wondering.</h2><details><summary>Do I have to commit to recurring cleanings?</summary><p>No. Choose a one-time clean, or save {config.discounts.weekly}% weekly, {config.discounts.two_weeks}% every two weeks or {config.discounts.four_weeks}% every four weeks on your base cleaning. Recurring plans repeat your chosen cleaning and extras, reserve your same weekday and time, and bill automatically. You’ll see the terms before you subscribe.</p></details><details><summary>Do I need to call for an estimate?</summary><p>Normally maintained homes under 3,500 sq ft can get an instant price here. Larger homes, heavy buildup or unusual conditions need a personal review so we can agree on the right scope and price first.</p></details><details><summary>What if my plans change?</summary><p>Cancel or reschedule more than 48 hours before your cleaning at no charge. Fees apply closer to the appointment. <Link href="/policies/cancellation" target="_blank">Read the cancellation policy.</Link></p></details></section>
    <footer className="ad-footer"><p className="eyebrow">Your home, handled.</p><p>Send A Scout LLC d/b/a Carolina Homekeeping Co.</p><address>{businessContact.mailingStreet}, {businessContact.mailingCityStateZip}</address><p><a href={businessContact.phoneHref}>{businessContact.phone}</a><span aria-hidden="true"> · </span><a href={'mailto:'+businessContact.email}>{businessContact.email}</a></p><nav aria-label="Policies"><Link href="/policies/privacy" target="_blank">Privacy</Link><Link href="/policies/terms" target="_blank">Terms</Link><Link href="/policies/service" target="_blank">Service promise</Link></nav></footer>
    <nav className="ad-sticky" aria-label="Quick cleaning price"><a href="#your-clean" className="button">Get my instant price <ArrowRight size={18}/></a></nav>
  </div>;
}
