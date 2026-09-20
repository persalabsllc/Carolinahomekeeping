'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ArrowUpRight} from 'lucide-react';

/** Marketing pages only; booking keeps its own price bar and admin stays clear. */
export function MobileBookingCTA(){
  const path=usePathname();
  const residential=path==='/'||path==='/services'||path==='/service-areas'||path.startsWith('/service-areas/');
  if(!residential)return null;
  return <nav className="mobile-booking-cta" aria-label="Quick booking"><Link href="/book" className="button">Get my instant price <ArrowUpRight size={20} aria-hidden="true"/></Link></nav>;
}
