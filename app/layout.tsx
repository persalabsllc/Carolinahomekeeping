import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
const sans=localFont({src:'../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2',variable:'--font-sans',display:'swap'});
const serif=localFont({src:'../node_modules/@fontsource/libre-caslon-display/files/libre-caslon-display-latin-400-normal.woff2',variable:'--font-serif',weight:'400',display:'swap'});
import { Header, Footer } from '@/components/shell';
import './globals.css';
import './coastal.css';
const origin=process.env.APP_URL||'https://carolinahomekeeping.com';
export const metadata:Metadata={metadataBase:new URL(origin),title:{default:'Carolina Homekeeping Co. | Your Home, Handled.',template:'%s | Carolina Homekeeping Co.'},description:'Professional home cleaning in New Bern, Trent Woods, James City and River Bend. See your instant price, choose a time and book online.',openGraph:{title:'Your Home, Handled. | Carolina Homekeeping Co.',description:'See your price. Pick your time. Come home clean.',type:'website',locale:'en_US',siteName:'Carolina Homekeeping Co.'},robots:{index:true,follow:true}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#07364b'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={`${sans.variable} ${serif.variable}`}><body><Header/><main id="main">{children}</main><Footer/></body></html>;}
