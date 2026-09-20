import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
// Declare the full variable range so browsers use real weights instead of
// treating the file as a single regular face and synthesizing heavier text.
const sans=localFont({
  src:[
    {path:'../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2',weight:'100 1000',style:'normal'},
    {path:'../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-italic.woff2',weight:'100 1000',style:'italic'},
  ],
  variable:'--font-sans',display:'swap',
});
// Keep the existing upright display face. Its Caslon Text companion supplies
// a drawn italic; Caslon Display ships only an upright face.
const serif=localFont({
  src:[
    {path:'../node_modules/@fontsource/libre-caslon-display/files/libre-caslon-display-latin-400-normal.woff2',weight:'400',style:'normal'},
    {path:'../node_modules/@fontsource/libre-caslon-text/files/libre-caslon-text-latin-400-italic.woff2',weight:'400',style:'italic'},
  ],
  variable:'--font-serif',display:'swap',
});
import { Header, Footer } from '@/components/shell';
import { MobileBookingCTA } from '@/components/mobile-booking-cta';
import './globals.css';
import './coastal.css';
import './typography.css';
const origin=process.env.APP_URL||'https://carolinahomekeeping.com';
export const metadata:Metadata={metadataBase:new URL(origin),title:{default:'Carolina Homekeeping Co. | Your Home, Handled.',template:'%s | Carolina Homekeeping Co.'},description:'Professional home cleaning in New Bern, Trent Woods, James City and River Bend. See your instant price, choose a time and book online.',openGraph:{title:'Your Home, Handled. | Carolina Homekeeping Co.',description:'See your price. Pick your time. Come home clean.',type:'website',locale:'en_US',siteName:'Carolina Homekeeping Co.'},robots:{index:true,follow:true}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#07364b'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={`${sans.variable} ${serif.variable}`}><body><Header/><main id="main">{children}</main><Footer/><MobileBookingCTA/></body></html>;}
