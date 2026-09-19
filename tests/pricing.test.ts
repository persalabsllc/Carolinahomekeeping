import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateQuote,defaultConfig,configSchema,services,type QuoteInput} from '../lib/pricing';
const input:QuoteInput={zip:'28562',sqft:1500,bedrooms:3,bathrooms:2,pets:'none',condition:'maintained',emptyHome:true,service:'standard',frequency:'once',addons:{}};
const expected=[[12900,17900,24900],[15900,21900,28900],[18900,25900,32900],[21900,29900,37900],[25900,34900,43900],[29900,39900,49900]];
for(let tier=0;tier<6;tier++)for(let s=0;s<3;s++)test(`${services[s]} tier ${tier+1}: both boundaries`,()=>{
 const low=tier===0?100:defaultConfig.tiers[tier-1].maxSqft+1;const high=defaultConfig.tiers[tier].maxSqft;
 for(const sqft of [low,high])assert.equal(calculateQuote({...input,sqft,service:services[s]},defaultConfig).total,expected[tier][s]);
});
test('unsupported ZIP and large/unusual homes require review',()=>{
 for(const patch of [{zip:'90210'},{sqft:3500},{condition:'excessive' as const},{service:'move' as const,emptyHome:false}])assert.equal(calculateQuote({...input,...patch},defaultConfig).review,true);
});
test('deep clean required for buildup',()=>assert.equal(calculateQuote({...input,condition:'buildup'},defaultConfig).review,true));
test('recurring discounts apply only to cleaning, not extras',()=>{
 for(const [frequency,expected] of [['four_weeks',17955],['two_weeks',17010],['weekly',16065]] as const){const q=calculateQuote({...input,frequency,addons:{oven:1}},defaultConfig);assert.equal(q.total,expected+3500);}
});
test('add-on quantities and explicitly shown tax',()=>{
 const q=calculateQuote({...input,addons:{dishes:1,laundry:2,fold:1,put_away:1,linens:2,oven:1,fridge:1,cabinets:1,windows:3,pet_hair:1}},defaultConfig);
 assert.equal(q.addons.reduce((s,a)=>s+a.amount,0),29300);assert.equal(q.tax,540);assert.equal(q.total,48740);
});
test('pet hair follows home-size boundaries',()=>{
 for(const [sqft,price] of [[999,2000],[1499,2000],[1500,3000],[2999,3000],[3000,4000],[3499,4000]])assert.equal(calculateQuote({...input,sqft,addons:{pet_hair:1}},defaultConfig).addons[0].unitPrice,price);
});
test('invalid quantities, unknown addons and move duplicates cannot be billed',()=>{
 for(const addons of [{oven:-1},{oven:3},{unapproved:1}])assert.throws(()=>calculateQuote({...input,addons},defaultConfig));
 assert.throws(()=>calculateQuote({...input,service:'move',addons:{cabinets:1}},defaultConfig));
 assert.throws(()=>calculateQuote({...input,service:'move',frequency:'weekly'},defaultConfig));
});
test('configurable room adjustments include half bathrooms',()=>{
 const config={...defaultConfig,bedroomExtra:1000,bathroomExtra:2000};const q=calculateQuote({...input,bedrooms:4,bathrooms:2.5},config);assert.equal(q.roomAdjustment,2000);assert.equal(q.total,20900);
});
test('pricing configuration validates tier ordering and unique add-ons',()=>{
 assert.ok(configSchema.safeParse(defaultConfig).success);const c=structuredClone(defaultConfig);c.tiers[1].maxSqft=500;assert.equal(configSchema.safeParse(c).success,false);
});
