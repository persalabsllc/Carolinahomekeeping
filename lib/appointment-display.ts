export const slotDate=(date:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(date));
export const slotTime=(date:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(date));
