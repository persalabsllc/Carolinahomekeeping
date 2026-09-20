import {notFound} from 'next/navigation';
export const metadata={title:'Isolated subscription QA',robots:{index:false,follow:false}};
export default async function QA({searchParams}:{searchParams:Promise<Record<string,string>>}){
 if(process.env.VERCEL_ENV!=='preview')notFound();
 const p=await searchParams,w=p.width==='390'?390:1200;
 const src=p.view==='control'?'/qa-recurring/control':p.view==='manage'?'/booking/manage#token=qa-only':'/book';
 return <main style={{padding:12,background:'#e9edf0'}}><p>ISOLATED PREVIEW · Synthetic appointments · No database writes or payments</p><iframe title="Subscription QA viewport" src={src} style={{width:w,maxWidth:'100%',height:1050,border:'1px solid #ccc',display:'block',margin:'15px auto'}}/></main>;
}