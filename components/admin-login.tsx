'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export function AdminLogin({configured,emailEnabled}:{configured:boolean;emailEnabled:boolean}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
 const [method,setMethod]=useState<'password'|'email'>('password');
 const [sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const router=useRouter();
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{
   const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,...(method==='password'?{password}:sent?{code}:{})})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Please try again.');
   if(method==='password'||sent){setPassword('');setCode('');router.refresh()}else setSent(true);
  }catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{setBusy(false)}
 }
 return <section className="panel auth-shell"><p className="eyebrow">Carolina Homekeeping Co.</p><h1>Control Room</h1><p style={{marginBottom:25}}>Sign in to manage your bookings, calendar and customers.</p>{!configured?<p className="notice">Administrator sign-in is awaiting configuration. Public customer information is not accessible here.</p>:<form onSubmit={submit}><label className="field"><span>Email address</span><input type="email" required autoComplete="username" maxLength={254} value={email} disabled={sent} onChange={e=>setEmail(e.target.value)}/></label>{method==='password'?<label className="field"><span>Password</span><input type="password" required maxLength={128} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>:sent&&<><p className="notice">If this email has access, a six-digit code is on its way. The code expires in 10 minutes.</p><label className="field"><span>Sign-in code</span><input required value={code} onChange={e=>setCode(e.target.value)} pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code"/></label></>}{error&&<p className="error-message" role="alert">{error}</p>}<button className="button full" disabled={busy}>{busy?'Please wait…':method==='password'||sent?'Sign in':'Email me a code'}</button>{emailEnabled&&<button type="button" className="back-button" disabled={busy} onClick={()=>{setMethod(method==='password'?'email':'password');setSent(false);setCode('');setPassword('');setError('')}}>{method==='password'?'Use an email code instead':'Use my password'}</button>}{sent&&<button type="button" className="back-button" disabled={busy} onClick={()=>{setSent(false);setCode('')}}>Use another email or request a new code</button>}<p className="small-text" style={{marginTop:24}}>First time here? Open your private setup invitation to choose a password.</p></form>}</section>;
}
