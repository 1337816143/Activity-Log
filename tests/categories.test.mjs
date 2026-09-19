import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../assets/categories.js';
import '../assets/excel-core.js';
const C=globalThis.ActivityCategories;
const types=['招聘宣讲','线上宣传','经验分享','指导讲座','就业实践','专项活动','部门活动'];
const analyze=(rows,options={})=>globalThis.ActivityExcel.analyze([{name:'历史记录',rows}],options).records;
test('Exactly seven activity types, in the requested order, immutable',()=>{
 assert.deepEqual(C.values,types);assert.equal(C.defaultValue,'部门活动');assert(Object.isFrozen(C.values));
 for(const c of types){assert(C.isValid(c));assert.equal(C.normalize(c),c);}
});
test('Only clear old label renames are normalized, not guessed classifications',()=>{
 assert.equal(C.normalize('部门工作'),'部门活动');assert.equal(C.normalize('交流分享'),'经验分享');
 for(const c of ['会议培训','志愿服务','其他','constructor','__proto__'])assert.equal(C.normalize(c),'');
});
test('Excel without type uses the selected default, preserving each work/person pair',()=>{
 const rows=[['活动名称','活动时间','参与具体工作','人员'],['示例招聘','9.18','会场整理','测试甲'],['示例招聘','9.18','新闻稿','测试乙']];
 const r=analyze(rows,{year:'2025',category:'招聘宣讲'});
 assert.equal(r.length,2);assert(r.every(x=>x.category==='招聘宣讲'&&x.date==='2025-09-18'&&x.include));
 assert.deepEqual(r.map(x=>[x.work,x.people]),[['会场整理','测试甲'],['新闻稿','测试乙']]);
});
test('Explicit category columns retain all seven types, including repeated/reordered headers',()=>{
 const rows=[];
 for(const c of types){rows.push(['人员','活动类型','具体工作','日期','活动名称'],['测试人',c,'分工','2025-09-18','类别测试']);}
 const r=analyze(rows,{category:'部门活动'});assert.deepEqual(r.map(x=>x.category),types);assert(r.every(x=>x.include));
});
test('Unknown Excel type is flagged and not selected for import; original text is kept',()=>{
 const r=analyze([['活动名称','日期','具体工作','人员','活动类型'],['旧活动','2025-09-18','原工作','原人员','不明确的旧类型']])[0];
 assert.equal(r.category,'');assert.equal(r.originalCategory,'不明确的旧类型');assert.equal(r.include,false);assert(r.warnings.some(w=>w.includes('活动类型')));
});
test('Vertical Excel form captures type after the four primary fields',()=>{
 const r=analyze([['活动名称','分享会'],['日期','2025-09-18'],['具体工作','主持'],['人员','测试甲'],['活动类型','经验分享']]);
 assert.equal(r.length,1);assert.equal(r[0].category,'经验分享');assert.equal(r[0].people,'测试甲');
});
test('HTML activity editor matches the dictionary and no legacy types leak into choices',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const select=html.match(/<select name="category"[^>]*>([\s\S]*?)<\/select>/)[1];
 assert.deepEqual([...select.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(m=>m[1]),types);
});
test('Built-in examples retain all six records and all thirteen attachments',async()=>{
 const {demoRecords}=await import('../assets/demo.js');assert.equal(demoRecords.length,6);assert.equal(demoRecords.reduce((n,r)=>n+r.attachments.length,0),13);assert(demoRecords.every(r=>C.isValid(r.category)));
});
test('Real SheetJS cell objects preserve explicit category values and selected fallback',()=>{
 const cell=value=>({v:value,w:String(value),t:'s'});
 const rows=[['活动名称','日期','具体工作','人员','活动类型'],
  ...types.map(c=>['类别测试','2025-09-18','原工作','测试人员',c]),
  ['未填类型','2025-09-18','实践分工','测试乙',''],
  ['旧分类','2025-09-18','不改原文','测试丙','待核实类型']].map(row=>row.map(cell));
 const r=analyze(rows,{category:'就业实践'});
 assert.deepEqual(r.slice(0,7).map(row=>row.category),types);assert(r.slice(0,8).every(row=>row.include));
 assert.equal(r[7].category,'就业实践');assert.equal(r[8].category,'');
 assert.equal(r[8].originalCategory,'待核实类型');assert.equal(r[8].include,false);
});
