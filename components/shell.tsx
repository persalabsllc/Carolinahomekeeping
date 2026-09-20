'use client';
import Image from 'next/image';
import Link from 'next/link';
import {businessContact} from '@/lib/business-contact';
import { useState } from 'react';
import { Menu, X, ArrowUpRight } from 'lucide-react';

export function Header(){
 const [open,setOpen]=useState(false);
 return <><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><div className="header-inner"><Link href="/" aria-label="Carolina Homekeeping Co. home" className="brand"><Image src="/logo.webp" alt="Carolina Homekeeping Co. — Your home, handled." width={232} height={116} priority /></Link><nav aria-label="Main navigation" className={open?'main-nav open':'main-nav'}><Link onClick={()=>setOpen(false)} href="/services">Our services</Link><Link onClick={()=>setOpen(false)} href="/service-areas">Where we clean</Link><Link onClick={()=>setOpen(false)} href="/commercial">For businesses</Link><Link onClick={()=>setOpen(false)} href="/book" className="button small">Get my instant price <ArrowUpRight size={17}/></Link></nav><button type="button" className="menu-toggle" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div></header></>;
}
export function Footer(){return <footer className="site-footer"><div className="container footer-grid"><div><Link href="/" className="footer-brand">Carolina<br/><span>Homekeeping Co.</span></Link><p>Your home, handled.</p><p className="muted">Thoughtful homekeeping.<br/>A little more life in your day.</p></div><div><h3>Come home clean</h3><Link href="/book">Get my instant price</Link><Link href="/services">Residential services</Link><Link href="/commercial">Commercial cleaning</Link><Link href="/service-areas">Service areas</Link></div><div><h3>The helpful details</h3><Link href="/policies/service">Our service promise</Link><Link href="/policies/cancellation">Cancellation & rescheduling</Link><Link href="/contact">Contact us</Link><a href={businessContact.phoneHref}>{businessContact.phone}</a><Link href="/control-room">Control Room</Link></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Send A Scout LLC d/b/a Carolina Homekeeping Co.</span><div><Link href="/policies/privacy">Privacy</Link><Link href="/policies/terms">Terms</Link></div></div></footer>;}
