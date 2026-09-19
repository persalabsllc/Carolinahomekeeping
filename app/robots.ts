import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/control-room','/book','/booking/']},sitemap:`${process.env.APP_URL||'https://carolinahomekeeping.com'}/sitemap.xml`};}
