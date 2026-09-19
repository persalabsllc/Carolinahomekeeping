import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function QA({searchParams}:{searchParams:Promise<{width?:string;path?:string}>}){
 if(process.env.VERCEL_ENV!=='preview')notFound();
 const p=await searchParams;const width=[375,390,768,1280].includes(Number(p.width))?Number(p.width):390;const path=['/','/book','/commercial','/services','/control-room'].includes(p.path||'')?p.path!:'/';
 return <div style={{background:'#e1e8e6',padding:20}}><p>Private responsive verification · {width}px · {path}</p><iframe title="Responsive site preview" src={path} style={{width,height:820,border:0,background:'white'}}/></div>;
}
