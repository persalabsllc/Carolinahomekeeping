import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const layout=readFileSync(new URL('../app/layout.tsx',import.meta.url),'utf8');
const typography=readFileSync(new URL('../app/typography.css',import.meta.url),'utf8');

test('self-hosted body fonts declare real normal and italic variable weights',()=>{
  for(const style of ['normal','italic']){
    assert.ok(layout.includes(`dm-sans-latin-wght-${style}.woff2',weight:'100 1000',style:'${style}'`));
  }
  const sources=[...layout.matchAll(/path:'([^']+\.woff2)'/g)];
  assert.equal(sources.length,4);
  for(const [,path] of sources) assert.ok(existsSync(resolve('app',path)),`Missing font: ${path}`);
});

test('headings preserve the display face and provide a true Caslon italic',()=>{
  assert.ok(layout.includes("libre-caslon-display-latin-400-normal.woff2',weight:'400',style:'normal'"));
  assert.ok(layout.includes("libre-caslon-text-latin-400-italic.woff2',weight:'400',style:'italic'"));
});

test('native smoothing replaces forced grayscale without synthetic font styles or blur hacks',()=>{
  assert.ok(layout.indexOf("import './typography.css'")>layout.indexOf("import './coastal.css'"));
  assert.match(typography,/-webkit-font-smoothing:\s*auto/);
  assert.match(typography,/-moz-osx-font-smoothing:\s*auto/);
  assert.match(typography,/font-synthesis:\s*none/);
  assert.doesNotMatch(typography,/(?:text-shadow|text-stroke|filter|transform)\s*:/);
});
