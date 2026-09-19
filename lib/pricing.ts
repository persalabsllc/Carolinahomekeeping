import { z } from 'zod';

export const services = ['standard', 'deep', 'move'] as const;
export type Service = typeof services[number];
export const serviceNames: Record<Service, string> = { standard: 'Standard clean', deep: 'Deep clean', move: 'Move-in / move-out' };
export const frequencies = ['once', 'four_weeks', 'two_weeks', 'weekly'] as const;
export type Frequency = typeof frequencies[number];
export const frequencyNames: Record<Frequency, string> = { once: 'One time', four_weeks: 'Every 4 weeks', two_weeks: 'Every 2 weeks', weekly: 'Every week' };
const cents = z.number().int().min(0).max(1000000);
export const configSchema = z.object({
  tiers: z.array(z.object({ maxSqft: z.number().int().positive(), label: z.string().min(1).max(60), standard: cents, deep: cents, move: cents })).length(6),
  addons: z.array(z.object({ id: z.string().regex(/^[a-z_]+$/), name: z.string().min(1).max(100), description: z.string().max(300), price: cents, unit: z.string().max(40), max: z.number().int().min(1).max(50), enabled: z.boolean(), taxable: z.boolean() })),
  discounts: z.object({ once: z.literal(0), four_weeks: z.number().min(0).max(50), two_weeks: z.number().min(0).max(50), weekly: z.number().min(0).max(50) }),
  zips: z.array(z.string().regex(/^\d{5}$/)).min(1).max(200),
  bedroomIncluded: z.number().int().min(0).max(20), bathroomIncluded: z.number().min(0).max(20),
  bedroomExtra: cents, bathroomExtra: cents,
  taxRate: z.number().min(0).max(15),
  leadHours: z.number().int().min(1).max(168),
}).superRefine((c,ctx)=>{
  c.tiers.forEach((t,i)=>{if(i && t.maxSqft<=c.tiers[i-1].maxSqft)ctx.addIssue({code:'custom',message:'Size tiers must increase.'});});
  if(c.tiers.at(-1)?.maxSqft!==3499)ctx.addIssue({code:'custom',message:'The largest instant-price tier must end at 3,499 sqft.'});
  if(new Set(c.addons.map(a=>a.id)).size!==c.addons.length)ctx.addIssue({code:'custom',message:'Add-on IDs must be unique.'});
});
export type PricingConfig = z.infer<typeof configSchema>;
export const defaultConfig: PricingConfig = {
  tiers: [
    { maxSqft:999,label:'Up to 999 sq ft',standard:12900,deep:17900,move:24900 },
    { maxSqft:1499,label:'1,000–1,499 sq ft',standard:15900,deep:21900,move:28900 },
    { maxSqft:1999,label:'1,500–1,999 sq ft',standard:18900,deep:25900,move:32900 },
    { maxSqft:2499,label:'2,000–2,499 sq ft',standard:21900,deep:29900,move:37900 },
    { maxSqft:2999,label:'2,500–2,999 sq ft',standard:25900,deep:34900,move:43900 },
    { maxSqft:3499,label:'3,000–3,499 sq ft',standard:29900,deep:39900,move:49900 },
  ],
  addons: [
    {id:'dishes',name:'Dishes / load dishwasher',description:'One normal household sinkful. Dishwasher must be working.',price:2000,unit:'visit',max:1,enabled:true,taxable:false},
    {id:'laundry',name:'Wash, dry & fold',description:'One standard machine load using your washer, dryer and detergent. Enough cycle time must be available.',price:3000,unit:'load',max:2,enabled:true,taxable:true},
    {id:'fold',name:'Fold clean laundry',description:'A standard basket of already-clean laundry.',price:2000,unit:'basket',max:4,enabled:true,taxable:true},
    {id:'put_away',name:'Put folded clothes away',description:'One basket, with drawers and locations identified.',price:1500,unit:'basket',max:4,enabled:true,taxable:false},
    {id:'linens',name:'Change bed linens',description:'Leave a fresh set out for each bed.',price:1200,unit:'bed',max:8,enabled:true,taxable:false},
    {id:'oven',name:'Inside oven',description:'An empty, cool oven. Does not include disassembly.',price:3500,unit:'oven',max:2,enabled:true,taxable:false},
    {id:'fridge',name:'Inside refrigerator',description:'Please empty contents before your appointment.',price:3500,unit:'refrigerator',max:2,enabled:true,taxable:false},
    {id:'cabinets',name:'Inside kitchen cabinets',description:'Up to 10 accessible, emptied cabinet sections. Included in move cleaning.',price:3000,unit:'set of 10',max:4,enabled:true,taxable:false},
    {id:'windows',name:'Interior windows',description:'Interior glass on one safely reachable standard window; no tracks, screens or ladder work.',price:800,unit:'window',max:30,enabled:true,taxable:false},
    {id:'pet_hair',name:'Extra pet-hair attention',description:'Additional vacuuming on accessible floors and upholstery. $20–$40 based on home size.',price:2000,unit:'home',max:1,enabled:true,taxable:false},
  ],
  discounts:{once:0,four_weeks:5,two_weeks:10,weekly:15},
  zips:['28560','28562'], bedroomIncluded:3,bathroomIncluded:2,bedroomExtra:0,bathroomExtra:0,taxRate:6.75,leadHours:24,
};
export const quoteSchema = z.object({
  zip:z.string().regex(/^\d{5}$/), sqft:z.number().int().min(100).max(50000), bedrooms:z.number().int().min(0).max(20), bathrooms:z.number().min(0.5).max(20).multipleOf(0.5),
  pets:z.enum(['none','dog','cat','multiple','other']), condition:z.enum(['maintained','buildup','excessive']), emptyHome:z.boolean(),
  service:z.enum(services), frequency:z.enum(frequencies), addons:z.record(z.string(),z.number().int().min(0).max(50)),
});
export type QuoteInput = z.infer<typeof quoteSchema>;
export type Quote = { review:boolean; reason?:string; base:number; roomAdjustment:number; addons:{id:string;name:string;quantity:number;unitPrice:number;amount:number;taxable:boolean}[]; discount:number;discountPercent:number;subtotal:number;tax:number;total:number };
export function calculateQuote(raw:unknown,config:PricingConfig):Quote {
  const input=quoteSchema.parse(raw);
  const zero={base:0,roomAdjustment:0,addons:[],discount:0,discountPercent:0,subtotal:0,tax:0,total:0};
  if(!config.zips.includes(input.zip))return {...zero,review:true,reason:'We’re not serving this ZIP yet. Leave your details and we’ll check your location.'};
  if(input.sqft>=3500)return {...zero,review:true,reason:'Homes of 3,500 sq ft or more need a personal plan. Send us your details and we’ll help.'};
  if(input.condition==='excessive')return {...zero,review:true,reason:'This home needs a little more planning. We’ll review the conditions with you before providing a price.'};
  if(input.service==='move'&&!input.emptyHome)return {...zero,review:true,reason:'Move cleaning is for an empty home. Choose deep cleaning for a furnished home, or ask us for a personal plan.'};
  if(input.condition==='buildup'&&input.service==='standard')return {...zero,review:true,reason:'For built-up grime, please choose a deep clean or move clean.'};
  const tier=config.tiers.find(t=>input.sqft<=t.maxSqft);
  if(!tier)throw new Error('No pricing tier is configured.');
  if(input.service==='move'&&input.frequency!=='once')throw new Error('Move cleaning is one time.');
  const base=tier[input.service];
  const roomAdjustment=Math.round(Math.max(0,input.bedrooms-config.bedroomIncluded)*config.bedroomExtra+Math.max(0,input.bathrooms-config.bathroomIncluded)*config.bathroomExtra);
  const addons=Object.entries(input.addons).filter(([,qty])=>qty>0).map(([id,quantity])=>{
    const addon=config.addons.find(a=>a.id===id&&a.enabled);
    if(!addon||quantity>addon.max)throw new Error('Please review your add-on selection.');
    if(id==='cabinets'&&input.service==='move')throw new Error('Empty cabinets are already included in move cleaning.');
    const unitPrice=id==='pet_hair'?addon.price+Math.floor(input.sqft/1500)*1000:addon.price;
    return {id,name:addon.name,quantity,unitPrice,amount:unitPrice*quantity,taxable:addon.taxable};
  });
  const discountPercent=config.discounts[input.frequency];
  const discount=Math.round((base+roomAdjustment)*discountPercent/100);
  const subtotal=base+roomAdjustment-discount+addons.reduce((s,a)=>s+a.amount,0);
  const tax=Math.round(addons.filter(a=>a.taxable).reduce((s,a)=>s+a.amount,0)*config.taxRate/100);
  return {review:false,base,roomAdjustment,addons,discount,discountPercent,subtotal,tax,total:subtotal+tax};
}
export const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100);
