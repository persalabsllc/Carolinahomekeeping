'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="error-page"><h1>Let’s try that again.</h1><p>We couldn’t load this page. Please refresh or try again in a moment. If you’ve just paid, don’t pay again while your confirmation is being checked.</p><button className="button" onClick={reset}>Try again</button></div>;}
