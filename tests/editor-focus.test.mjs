import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('Editor focuses synchronously instead of stealing focus during fast input',()=>{
 const source=fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
 assert(!source.includes('setTimeout(()=>form.elements.title.focus(),30);'));
 assert(source.includes('form.elements.title.focus({preventScroll:true});'));
});
