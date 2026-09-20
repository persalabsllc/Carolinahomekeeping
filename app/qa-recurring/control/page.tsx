import {notFound} from 'next/navigation';
import {ControlRoom} from '@/components/control-room';
import {data} from '@/lib/qa-recurring-fixture';
import {defaultConfig} from '@/lib/pricing';
export const dynamic='force-dynamic';
export default function QAControl(){if(process.env.VERCEL_ENV!=='preview')notFound();return <><p>ISOLATED PREVIEW · Synthetic subscription · Changes disabled</p><ControlRoom user="qa@example.invalid" data={data} config={defaultConfig} readiness={{preview:false}}/></>;}
