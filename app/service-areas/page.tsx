import Link from 'next/link';
import {ArrowRight} from 'lucide-react';
import {PageIntro,CTA} from '@/components/ui';
import {areas} from '@/lib/content';
export const metadata={title:'Our New Bern Area Cleaning Services',description:'Explore Carolina Homekeeping in New Bern, Trent Woods, James City and River Bend. Check your ZIP for residential cleaning availability.'};
export default function Areas(){return <><PageIntro label="A little closer to home" title="Homekeeping in our corner of Carolina.">Launching in New Bern and nearby Craven County communities. Service is based on your ZIP and available appointment capacity.</PageIntro><section className="container content-section"><div className="area-grid">{areas.map(a=><article className="area-card" key={a.slug}><h2>{a.name}</h2><p>{a.description}</p><Link className="text-link" href={'/service-areas/'+a.slug}>Explore cleaning in {a.name} <ArrowRight size={17}/></Link></article>)}</div><div style={{marginTop:35}}><CTA/></div></section></>;}
