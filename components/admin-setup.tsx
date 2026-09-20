'use client';
import {useEffect,useState,useRef} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
export function AdminSetup(){
 const router=useRouter();
 const initialized=useRef(false);
 const [invite,setInvite]=useState<{email:string;token:string}|null>(null);
 const [checked,setChecked]=useState(false),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(initialized.current)return;initialized.current=true;
  const params=new URLSearchParams(window.location.hash.slice(1));
  const email=params.get('email')||'',token=params.get('token')||'';
  // The fragment never reaches server logs; remove it from visible browser history.
  window.history.replaceState(null,'',window.location.pathname);
  if(!email||!token){setError('Open your private setup link to activate your account.');return}
  setInvite({email,token});
 },[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!invite)return;
  if(checked&&password!==confirm){setError('Your passwords do not match.');return}
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...invite,...(checked?{password}:{})})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Please try again.');
   if(checked){setPassword('');setConfirm('');router.replace('/control-room');router.refresh()}else setChecked(true);
  }catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{setBusy(false)}
 }
 return <section className="panel auth-shell"><p className="eyebrow">Carolina Homekeeping Co.</p><h1>Set up your access.</h1><p style={{marginBottom:24}}>Choose your private Control Room password. This invitation can be used once.</p>{invite&&<form onSubmit={submit}><label className="field"><span>Administrator email</span><input type="email" value={invite.email} readOnly autoComplete="username"/></label>{checked&&<><label className="field"><span>Create password</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><small>Use at least 12 characters. A memorable, unique passphrase works well.</small></label><label className="field"><span>Confirm password</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></>}{error&&<p className="error-message" role="alert">{error}</p>}<button className="button full" disabled={busy}>{busy?'Please wait…':checked?'Save password & open Control Room':'Continue to password setup'}</button></form>}{!invite&&error&&<p className="notice" role="alert">{error}</p>}<Link className="back-button" href="/control-room">Back to sign in</Link></section>;
}
