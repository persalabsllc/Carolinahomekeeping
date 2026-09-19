import type {MetadataRoute} from 'next';
import {areas} from '@/lib/content';
export default function sitemap():MetadataRoute.Sitemap{const root=process.env.APP_URL||'https://carolinahomekeeping.com';return ['','/services','/commercial','/contact','/service-areas',...areas.map(a=>'/service-areas/'+a.slug),...['terms','privacy','cancellation','service'].map(s=>'/policies/'+s)].map(path=>({url:root+path,changeFrequency:'monthly',priority:path===''?1:.7}));}
