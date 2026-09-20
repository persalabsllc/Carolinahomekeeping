import Link from 'next/link';
export const metadata={title:'Layout verification',robots:{index:false,follow:false}};
export default async function Preview({searchParams}:{searchParams:Promise<{width?:string;path?:string}>}){
const query=await searchParams;
const width=[360,390,768,1024].includes(Number(query.width))?Number(query.width):390;
const paths=['/','/services','/commercial','/contact','/book','/service-areas'];
const path=paths.includes(query.path||'')?query.path!:'/';
return <div className="design-preview"><style>{`body:has(.design-preview){background:#dce3e6}body:has(.design-preview)>.site-header,body:has(.design-preview)>.site-footer{display:none}.design-preview{padding:20px;display:grid;justify-items:center;gap:18px}.design-preview nav{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.design-preview a{border:1px solid #849a9f;border-radius:8px;padding:6px 12px;background:white}.design-preview iframe{height:844px;border:1px solid #a7b9bd;border-radius:14px;background:white;max-width:100%}`}</style><nav aria-label="Preview widths">{[360,390,768,1024].map(w=><Link key={w} href={'/design-preview?width='+w+'&path='+encodeURIComponent(path)}>{w}px</Link>)}</nav><nav aria-label="Preview pages">{paths.map(p=><Link key={p} href={'/design-preview?width='+width+'&path='+encodeURIComponent(p)}>{p==='/'?'Home':p.slice(1)}</Link>)}</nav><iframe title="Responsive website preview" src={path} style={{width}}/></div>;
}