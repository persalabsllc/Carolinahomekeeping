import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  async headers() { return [{ source: '/(.*)', headers: [
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:process.env.VERCEL_ENV==='preview'?'SAMEORIGIN':'DENY'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  ]}]; }
};
export default config;
