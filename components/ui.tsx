import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';
import type { ReactNode } from 'react';
export function CTA({children='Get my instant price',href='/book',light=false}:{children?:ReactNode;href?:string;light?:boolean}){return <Link href={href} className={`button ${light?'light':''}`}>{children}<ArrowUpRight size={19}/></Link>;}
export function Eyebrow({children}:{children:ReactNode}){return <p className="eyebrow">{children}</p>;}
export function CheckList({items}:{items:string[]}){return <ul className="check-list">{items.map(s=><li key={s}><Check size={17} aria-hidden="true"/><span>{s}</span></li>)}</ul>;}
export function PageIntro({label,title,children}:{label:string;title:string;children:ReactNode}){return <section className="page-intro container"><Eyebrow>{label}</Eyebrow><h1>{title}</h1><p className="lead">{children}</p></section>;}
