import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BookingFlow} from '../components/booking-flow';
import {BookingSummary} from '../components/booking-summary';
import {defaultConfig,calculateQuote,type QuoteInput} from '../lib/pricing';
import {defaultScheduling} from '../lib/scheduling';
import nextConfig from '../next.config';
import sitemap from '../app/sitemap';

const props={config:defaultConfig,scheduling:defaultScheduling,initial:{},leadReady:true};
test('ad flow opens on home qualification, without an early price or contact gate',()=>{
 const html=renderToStaticMarkup(createElement(BookingFlow,{...props,campaign:true}));
 assert.match(html,/Step 1 of 4/);
 for(const label of ['Your ZIP code','Approximate square footage','Bedrooms','Bathrooms','How’s your home looking?','Anything that needs special attention?','Get my instant price'])assert.ok(html.includes(label));
 assert.match(html,/Choose your home size/);
 assert.doesNotMatch(html,/Service address|Mobile number|Your name|This visit|price-summary|Step 1 of 8/);
});
test('ordinary booking retains its eight-step address-first flow',()=>{
 const html=renderToStaticMarkup(createElement(BookingFlow,props));
 assert.match(html,/Step 1 of 8/);
 assert.match(html,/Service address/);
 assert.match(html,/Continue/);
 assert.doesNotMatch(html,/Approximate square footage|Your name|campaign-booking/);
});
test('campaign summary remains collapsed with the exact shared-engine total and no duration',()=>{
 const input:QuoteInput={zip:'28562',sqft:1000,bedrooms:3,bathrooms:2,pets:'none',condition:'maintained',emptyHome:false,service:'standard',frequency:'weekly',addons:{dishes:1,laundry:1}};
 const quote=calculateQuote(input,defaultConfig);
 const html=renderToStaticMarkup(createElement(BookingSummary,{config:defaultConfig,input,quote,revealed:true,compact:true}));
 assert.match(html,/compact-summary/);assert.match(html,/aria-expanded="false"/);assert.match(html,/data-expanded="false"/);
 assert.match(html,/\$187\.18/);assert.match(html,/This visit/);assert.doesNotMatch(html,/duration|Estimated cleaning time/);
});
test('ad destination is noindexed at HTTP level and excluded from the sitemap',async()=>{
 const headers=await nextConfig.headers!();
 const landing=headers.find(rule=>rule.source==='/clean-home');
 assert.ok(landing?.headers.some(h=>h.key==='X-Robots-Tag'&&h.value.includes('noindex')));
 assert.equal(sitemap().some(page=>new URL(page.url).pathname==='/clean-home'),false);
});
