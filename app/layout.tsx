import type { Metadata, Viewport } from 'next';
import { Header, Footer } from '@/components/shell';
import './globals.css';
const origin=process.env.APP_URL||'https://carolinahomekeeping.com';
export const metadata:Metadata={metadataBase:new URL(origin),title:{default:'Carolina Homekeeping Co. | Your Home, Handled.',template:'%s | Carolina Homekeeping Co.'},description:'Professional home cleaning in New Bern, Trent Woods, James City and River Bend. See your instant price, choose a time and book online.',openGraph:{title:'Your Home, Handled. | Carolina Homekeeping Co.',description:'See your price. Pick your time. Come home clean.',type:'website',locale:'en_US',siteName:'Carolina Homekeeping Co.'},robots:{index:true,follow:true}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#07364b'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Header/><main id="main">{children}</main><Footer/></body></html>;}
