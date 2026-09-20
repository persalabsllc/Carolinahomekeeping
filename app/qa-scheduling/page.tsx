import {notFound} from 'next/navigation';
import {SchedulingPreview} from '@/components/scheduling-preview';
export const dynamic='force-dynamic';
export const metadata={title:'Private scheduling QA',robots:{index:false,follow:false}};
export default async function QA({searchParams}:{searchParams:Promise<{width?:string}>}){
 if(process.env.VERCEL_ENV!=='preview')notFound();
 const p=await searchParams;
 if(p.width)return <div style={{padding:20,background:'#e1e8e6'}}><p>Private phone verification — no customer data</p><iframe title="Scheduling phone preview" src="/qa-scheduling" style={{width:390,height:820,border:0}}/></div>;
 return <SchedulingPreview/>;
}
