/** Older outbox rows may contain a JSON string instead of a JSON object. */
export function normalizeEmailHeaders(input:unknown):Record<string,string>{
 let value=input??{};
 if(typeof value==='string'){
  try{value=JSON.parse(value);}catch{throw new Error('Email headers must be an object.');}
 }
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Email headers must be an object.');
 const entries=Object.entries(value);
 if(entries.some(([name,v])=>!name||!/^[A-Za-z0-9-]+$/.test(name)||typeof v!=='string'||/[\r\n]/.test(v)))throw new Error('Email headers contain an invalid name or value.');
 return Object.fromEntries(entries);
}
