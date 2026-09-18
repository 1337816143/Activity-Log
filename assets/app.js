import { allRecords, getFile, saveRecord, deleteRecord, prepareFile, metadata, blobToData, importBackup, isImage, uid } from './store.js';
import { PhotoDeck } from './deck.js';
import { icon, hydrate, esc, bytes, fileIcon, localDate, prefs, toast, download } from './ui.js';
import { demoRecords, demoFiles } from './demo.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const categories = ['部门工作','会议培训','志愿服务','文体活动','交流分享','其他'];
const categoryColors = [['#efe7f6','#987eaf'],['#e8edf7','#8495b5'],['#e7eee4','#8c9e7a'],['#f3e6e6','#b38b92'],['#f2ebdf','#b19a76'],['#ece8ee','#998ca4']];
const titles = {all:'活动总览',timeline:'时间线',media:'附件资料库',people:'人员与参与',starred:'星标活动'};
const state = {records:[],demo:false,view:'all',layout:'cards',selected:null,query:'',category:'',person:'',from:'',to:'',sort:'date-desc',page:1,ready:false};
let detailDeck, popupDeck, detailKey='', editing=null, staged=[], removed=[], processing=0, dirty=false, saving=false, previewItems=[], previewIndex=0, previewRecord=null, previewToken=0, zoomed=false, importBusy=false, exporting=false;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('activity-log-records-v1') : null;
class URLPool {
  constructor(){this.cache=new Map();this.generation=0;}
  async get(a,original=false){const key=a.id+(original?':original':':thumb');if(this.cache.has(key))return this.cache.get(key);const generation=this.generation;
    const promise=(async()=>{const f=demoFiles.get(a.id)||await getFile(a.id);if(!f?.blob)throw new Error('原附件不存在，请从完整备份恢复。');const url=URL.createObjectURL(original?f.blob:(f.thumbnail||f.blob));if(this.generation!==generation){URL.revokeObjectURL(url);throw new Error('已切换预览');}return url;})();
    this.cache.set(key,promise);promise.catch(()=>{if(this.cache.get(key)===promise)this.cache.delete(key);});return promise;}
  clear(){this.generation++;for(const p of this.cache.values())p.then(url=>URL.revokeObjectURL(url)).catch(()=>{});this.cache.clear();}
}
const detailURLs=new URLPool(),popupURLs=new URLPool(),gridURLs=new URLPool();
let stagedURLs=[];
function releaseStaged(){stagedURLs.forEach(u=>URL.revokeObjectURL(u));stagedURLs=[];}
const data = () => state.demo?demoRecords:state.records;
const currentRecord = () => data().find(r=>r.id===state.selected);
const totalFiles = rows => rows.reduce((sum,r)=>sum+r.attachments.length,0);
const safeError = e => {console.error(e);toast(e?.name==='QuotaExceededError'?'浏览器存储空间不足，保存未完成。请先备份并清理空间。':e?.message||'操作未完成，请重试。',true);};
function highlight(text){let s=esc(text);if(state.query){const q=esc(state.query).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');s=s.replace(new RegExp(q,'gi'),m=>`<mark>${m}</mark>`);}return s;}
function chip(category){const i=Math.max(0,categories.indexOf(category)),[bg,color]=categoryColors[i];return `<span class="category-chip" style="--chip-bg:${bg};--chip-color:${color}">${esc(category)}</span>`;}
function personDots(people){return `<span class="people-dots">${people.slice(0,4).map((p,i)=>`<span class="person-dot" style="--person-bg:${['#e7deef','#e4e9df','#e6e5f1','#eee5dd'][i]}" title="${esc(p)}">${esc(p.slice(-1))}</span>`).join('')}${people.length>4?`<span class="person-dot">+${people.length-4}</span>`:''}</span>`;}
function empty(title,body,action=''){return `<div class="empty-state"><div class="empty-orb">${icon('folder')}</div><h3>${title}</h3><p>${body}</p>${action}</div>`;}
function filtered(){const query=state.query.toLocaleLowerCase();return data().filter(r=>(!state.category||r.category===state.category)&&(!state.person||r.people.includes(state.person))&&(!state.from||r.date>=state.from)&&(!state.to||r.date<=state.to)&&(state.view!=='starred'||r.starred)&&(!query||[r.title,r.work,r.people.join(' '),r.category,r.location,r.notes,...r.attachments.map(a=>a.name)].join(' ').toLocaleLowerCase().includes(query))).sort((a,b)=>state.sort==='date-asc'?a.date.localeCompare(b.date)||a.time.localeCompare(b.time):state.sort==='name'?a.title.localeCompare(b.title,'zh-CN'):state.sort==='updated'?b.updatedAt.localeCompare(a.updatedAt):b.date.localeCompare(a.date)||b.time.localeCompare(a.time));}
function stats(){const rows=data(),month=localDate().slice(0,7),values=[['活动记录',rows.length,'项','layers'],['本月活动',rows.filter(r=>r.date.startsWith(month)).length,'项','calendar'],['参与人员',new Set(rows.flatMap(r=>r.people)).size,'人','users'],['附件归档',totalFiles(rows),'份','folder']];$('#stats').innerHTML=values.map(([title,value,unit,ic],i)=>`<div class="stat"><span class="stat-title">${title}${state.demo?' · 示例':''}</span><span class="stat-value">${String(value).padStart(2,'0')}<small>${unit}</small></span><span class="stat-icon" style="--stat-bg:${['#e9e1f478','#e2e7f378','#e2e9dc78','#f0e7da78'][i]};--stat-color:${['#a18aba','#929dba','#95a083','#b29c7c'][i]}">${icon(ic)}</span></div>`).join('');$('#nav-count').textContent=rows.length;}
function options(){const cats=[...new Set([...categories,...data().map(r=>r.category)])];$('#category-filter').innerHTML='<option value="">所有类型</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');$('#category-filter').value=state.category;const people=[...new Set(data().flatMap(r=>r.people))].sort((a,b)=>a.localeCompare(b,'zh-CN'));$('#person-filter').innerHTML='<option value="">所有人员</option>'+people.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');$('#person-filter').value=state.person;}
function render(){
 stats();$('#view-title').textContent=titles[state.view];$('#section-title').textContent={all:'所有活动',timeline:'按时间，回看每一次投入',media:'附件资料库',people:'一起参与的人',starred:'值得再看一遍'}[state.view];
 $('#demo-banner').hidden=!state.demo;$('#mode-badge').textContent=state.demo?'演示模式 · 虚构示例':'本机保存 · 未云同步';$('#demo-toggle').textContent=state.demo?'我的资料库':'查看示例';
 $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));$('#layout-switch').hidden=['media','people'].includes(state.view);
 const rows=filtered();if(!rows.some(r=>r.id===state.selected))state.selected=rows[0]?.id||null;
 $('#filter-dot').hidden=!(state.person||state.from||state.to||state.category);renderRecords(rows);renderDetail();
}
function recordHTML(r){return `<article class="record-card ${r.id===state.selected?'selected':''}" data-record="${esc(r.id)}" tabindex="0" role="button" aria-label="查看活动：${esc(r.title)}" aria-pressed="${r.id===state.selected}"><div class="record-head">${chip(r.category)}<span class="record-date">${esc(r.date.replaceAll('-','.'))}</span><button class="record-star ${r.starred?'on':''}" data-star="${esc(r.id)}" aria-label="${r.starred?'取消星标':'设为星标'}：${esc(r.title)}" title="${r.starred?'取消星标':'设为星标'}">${icon('star')}</button></div><h3 class="record-title">${highlight(r.title)}</h3><p class="record-work">${highlight(r.work)}</p><div class="record-foot">${personDots(r.people)}<span class="people-label">${esc(r.people.slice(0,2).join('、'))}${r.people.length>2?` 等 ${r.people.length} 人`:''}</span><span class="attachment-count">${icon('paperclip')}${r.attachments.length} 个附件</span>${icon('chevron')}</div></article>`;}
function paginate(total,size){const pages=Math.max(1,Math.ceil(total/size));state.page=Math.min(Math.max(state.page,1),pages);$('#pagination').innerHTML=pages>1?`<button data-page="${state.page-1}" ${state.page===1?'disabled':''}>上一页</button><span>第 ${state.page} / ${pages} 页</span><button data-page="${state.page+1}" ${state.page===pages?'disabled':''}>下一页</button>`:'';return [(state.page-1)*size,state.page*size];}
function renderRecords(rows){
 gridURLs.clear();const list=$('#records');$('#result-count').textContent=rows.length;
 if(!rows.length){$('#pagination').innerHTML='';list.innerHTML=empty(data().length?'没有找到匹配的记录':'从第一条记录开始',data().length?'换个关键词，或清除类型、人员与日期筛选。':'记录参与的工作、同行的人，上传想留住的现场片刻。',data().length?'<button class="secondary" data-clear>清除全部筛选</button>':`<button class="primary new-record">${icon('plus')}记录新活动</button>`);return;}
 if(state.view==='people'){
   const names=[...new Set(rows.flatMap(r=>r.people))].sort((a,b)=>rows.filter(r=>r.people.includes(b)).length-rows.filter(r=>r.people.includes(a)).length),[start,end]=paginate(names.length,30);$('#result-count').textContent=names.length;
   list.innerHTML=`<div class="people-grid">${names.slice(start,end).map(p=>`<button class="people-card" data-person="${esc(p)}"><span class="person-dot">${esc(p.slice(-1))}</span><div><b>${esc(p)}</b><small>参与 ${rows.filter(r=>r.people.includes(p)).length} 项活动</small></div>${icon('chevron')}</button>`).join('')}</div>`;return;
 }
 if(state.view==='media'){
   const attachments=rows.flatMap(r=>r.attachments.map(a=>({a,r}))),[start,end]=paginate(attachments.length,18);$('#result-count').textContent=attachments.length;
   if(!attachments.length){list.innerHTML=empty('还没有附件','选择活动，在右侧上传图片或文件。');return;}
   list.innerHTML=`<div class="media-grid">${attachments.slice(start,end).map(({a,r})=>`<button class="media-tile" data-media="${esc(a.id)}" data-parent="${esc(r.id)}"><span class="media-thumb">${isImage(a)?`<img data-thumb="${esc(a.id)}" alt="${esc(a.name)}" loading="lazy">`:icon(fileIcon(a))}</span><b title="${esc(a.name)}">${highlight(a.name)}</b><small>${esc(r.title)} · ${bytes(a.size)}</small></button>`).join('')}</div>`;
   for(const {a} of attachments.slice(start,end)){const el=$(`[data-thumb="${a.id}"]`);if(el)gridURLs.get(a).then(url=>{if(el.isConnected)el.src=url;}).catch(()=>{el.alt='图片暂不可用';});}return;
 }
 const [start,end]=paginate(rows.length,10),pageRows=rows.slice(start,end);
 if(state.layout==='table'){
   list.innerHTML=`<div class="table-scroll"><table class="records-table"><thead><tr><th>活动名称 / 具体工作</th><th>活动时间</th><th>人员</th><th>附件</th></tr></thead><tbody>${pageRows.map(r=>`<tr data-record="${esc(r.id)}" class="${r.id===state.selected?'selected':''}" tabindex="0" aria-label="查看活动：${esc(r.title)}"><td>${highlight(r.title)}<small>${highlight(r.work.slice(0,90))}${r.work.length>90?'…':''}</small></td><td>${esc(r.date)}<small>${esc(r.time)}</small></td><td>${esc(r.people.join('、'))}</td><td>${r.attachments.length}</td></tr>`).join('')}</tbody></table></div>`;
 }else if(state.view==='timeline'){
   let month='';list.innerHTML=pageRows.map(r=>{const next=r.date.slice(0,7);let head='';if(next!==month){month=next;head=`<div class="timeline-month">${esc(next.replace('-',' 年 '))} 月</div>`;}return head+`<div class="timeline-record">${recordHTML(r)}</div>`;}).join('');
 }else list.innerHTML=pageRows.map(recordHTML).join('');
}
function renderDetail(force=false){
 const r=currentRecord(),key=r?`${r.id}:${r.updatedAt}:${r.starred}:${state.demo}`:'none';if(!force&&key===detailKey)return;detailKey=key;detailDeck?.destroy();detailDeck=null;detailURLs.clear();const detail=$('#detail');
 if(!r){detail.innerHTML=empty('让每个片刻，都有归处','选择左侧活动，在这里查看具体工作和附件。');return;}
 const images=r.attachments.filter(isImage);
 detail.innerHTML=`<div class="detail-heading"><div>${icon('layers')}活动详情</div><small>${state.demo?'示例记录':'已保存在本机'}</small></div><h2 class="detail-title">${esc(r.title)}</h2><div class="detail-meta"><span>${icon('calendar')}${esc(r.date)}${r.time?' · '+esc(r.time):''}</span>${r.location?`<span>${icon('pin')}${esc(r.location)}</span>`:''}</div><div class="detail-subhead">参与具体工作</div><p class="detail-work">${esc(r.work)}</p><div class="detail-people">${r.people.map(p=>`<button class="person-pill" data-person="${esc(p)}">${icon('user')}${esc(p)}</button>`).join('')}</div>${r.notes?`<p class="detail-notes">${esc(r.notes)}</p>`:''}<div class="preview-label"><span>活动影像</span><span id="image-index">${images.length?`01 / ${String(images.length).padStart(2,'0')}`:'暂无图片'}</span></div>${images.length?`<div id="inline-deck"></div><div class="deck-controls"><button id="image-prev" aria-label="上一张图片">${icon('left')}</button><div class="deck-dots" id="image-dots"></div><button id="image-next" aria-label="下一张图片">${icon('chevron')}</button><button id="image-expand" aria-label="打开大图预览" title="打开大图预览">${icon('zoom')}</button></div><p class="deck-hint">滚轮 / 方向键切换 · 点击查看原图 · 拖动轻翻</p>`:'<div class="empty-mini">还没有现场照片<br>上传图片，让这一刻更完整。</div>'}<div class="preview-label"><span>全部附件</span><span>${r.attachments.length} FILES</span></div><div class="file-list">${r.attachments.map(a=>`<button class="file-row" data-file="${esc(a.id)}" title="预览 ${esc(a.name)}"><span class="file-icon">${icon(fileIcon(a))}</span><div><b>${esc(a.name)}</b><small>${bytes(a.size)} · ${esc(a.name.split('.').pop().toUpperCase().slice(0,8))}</small></div>${icon('chevron')}</button>`).join('')}</div><button class="upload-small" id="upload-attachments">${icon('plus')}添加附件 · 也可拖到此区域</button><div class="detail-actions"><button class="soft-btn" id="edit-record">${icon('edit')}编辑记录</button><button class="soft-btn" id="copy-record">${icon('copy')}复制文字</button><button class="soft-btn delete-btn" id="delete-record" aria-label="删除此活动" title="删除活动">${icon('trash')}</button></div>`;
 if(images.length){
  detailDeck=new PhotoDeck($('#inline-deck'),images,a=>detailURLs.get(a),{onOpen:(a,i)=>openPreview(r,a.id),onChange:i=>{
   $('#image-index').textContent=`${String(i+1).padStart(2,'0')} / ${String(images.length).padStart(2,'0')}`;$('#image-dots').innerHTML=images.length<=12?images.map((_,j)=>`<i class="${i===j?'active':''}"></i>`).join(''):`<small>${i+1} / ${images.length}</small>`;
   $('#image-prev').disabled=i===0;$('#image-next').disabled=i===images.length-1;
  }});
  $('#image-prev').onclick=()=>detailDeck.step(-1);$('#image-next').onclick=()=>detailDeck.step(1);$('#image-expand').onclick=()=>openPreview(r,images[detailDeck.index].id);
 }
 $('#upload-attachments').onclick=()=>{if(state.demo){toast('示例不支持修改，请先开始你的记录。');return;}$('#quick-files').click();};
 $('#edit-record').onclick=()=>state.demo?toast('示例仅供体验，点击「记录新活动」创建真实记录。'):openEditor(r);
 $('#delete-record').onclick=()=>removeRecord(r);
 $('#copy-record').onclick=async()=>{const text=`活动名称：${r.title}\n活动时间：${r.date} ${r.time}\n参与具体工作：${r.work}\n人员：${r.people.join('、')}\n活动地点：${r.location||'未填写'}${r.notes?'\n备注：'+r.notes:''}`;try{await navigator.clipboard.writeText(text);toast('活动文字已复制。');}catch{toast('浏览器限制了剪贴板，请选中文字手动复制。',true);}};
}
async function refresh(){state.records=await allRecords();options();render();}
function changed(){channel?.postMessage('changed');}
async function starRecord(id){if(state.demo){toast('星标功能可在你的真实记录中使用。');return;}const r=state.records.find(r=>r.id===id);if(!r)return;try{await saveRecord({...r,starred:!r.starred,updatedAt:new Date().toISOString()});await refresh();changed();}catch(e){safeError(e);}}
async function removeRecord(r){if(state.demo){toast('示例不会进入个人资料库，无需删除。');return;}if(!confirm(`删除「${r.title}」及其 ${r.attachments.length} 个附件？\n此操作不可撤销，请先确认已完成备份。`))return;try{await deleteRecord(r);await refresh();changed();toast('该活动及附件已删除。');}catch(e){safeError(e);}}
function clearFilters(){state.query='';state.category='';state.person='';state.from='';state.to='';state.page=1;$('#search').value='';$('#category-filter').value='';$('#person-filter').value='';$('#date-from').value='';$('#date-to').value='';render();}
function ownMode(){state.demo=false;prefs.set('mode','own');state.selected=null;clearFilters();options();}
function personFilter(name){state.person=name;state.view='all';state.page=1;options();$('#advanced-filters').hidden=false;render();$('#search').focus({preventScroll:true});}

function openEditor(r=null){
 editing=r;staged=r?r.attachments.map(a=>({...a,existing:true})):[];removed=[];dirty=false;processing=0;saving=false;
 const form=$('#record-form');form.reset();for(const k of ['title','date','time','work','category','location','notes'])form.elements[k].value=r?.[k]??(k==='date'?localDate():k==='category'?'部门工作':'');form.elements.people.value=r?r.people.join('、'):'';
 $('#editor-title').textContent=r?'编辑活动记录':'记录新活动';$('#form-status').textContent=state.demo?'保存后进入你的个人资料库，不包含其他示例。':'带 * 的内容为必填项';$('#save-record').disabled=false;
 renderStaged();$('#editor').showModal();setTimeout(()=>form.elements.title.focus(),30);
}
function closeEditor(){if(processing||saving){toast('附件或记录正在保存，请在操作完成后关闭。');return;}if(dirty&&!confirm('有尚未保存的修改，确定放弃吗？'))return;$('#editor').close();releaseStaged();editing=null;staged=[];dirty=false;}
function renderStaged(){
 releaseStaged();$('#staged-count').textContent=`${staged.length} 个文件`;$('#staged-files').innerHTML=staged.map((a,i)=>{let img='';if(a.blob&&isImage(a)){const url=URL.createObjectURL(a.thumbnail||a.blob);stagedURLs.push(url);img=`<img src="${url}" alt="${esc(a.name)}">`;}return `<div class="staged-file">${img||`<span class="file-icon">${icon(fileIcon(a))}</span>`}<div><b>${esc(a.name)}</b><small>${bytes(a.size)}${a.existing?' · 已保存':''}</small></div><button type="button" class="icon-btn" data-remove-staged="${i}" aria-label="移除附件：${esc(a.name)}">${icon('x')}</button></div>`;}).join('');
}
async function stageFiles(files){
 if(saving)return;const list=[...files];if(!list.length)return;if(staged.length+list.length>100){toast('每条活动最多 100 个附件，请分批整理。',true);return;}
 if(list.reduce((s,f)=>s+f.size,0)>200*1024*1024){toast('一次添加的附件总量不能超过 200 MB，请分批添加。',true);return;}
 processing++;$('#save-record').disabled=true;$('#form-status').textContent='正在处理附件，原文件会完整保留…';
 try{for(const file of list){const attachment=await prepareFile(file);if(staged.length>=100)throw new Error('每条活动最多 100 个附件。');staged.push(attachment);dirty=true;renderStaged();}}
 catch(e){safeError(e);}finally{processing--;$('#save-record').disabled=processing>0;$('#form-status').textContent=processing?'正在处理附件…':`已准备 ${staged.length} 个附件，点击保存完成归档。`;$('#editor-files').value='';}
}
async function submitRecord(e){
 e.preventDefault();if(processing||saving)return;const f=$('#record-form');if(!f.reportValidity())return;
 const people=[...new Set(f.elements.people.value.split(/[,，、;；\n]+/).map(s=>s.trim()).filter(Boolean))];
 if(!f.elements.title.value.trim()||!f.elements.work.value.trim()||!people.length){toast('活动名称、具体工作和人员不能只包含空格。',true);return;}
 if(people.length>100||people.some(p=>p.length>100)){toast('最多支持 100 位人员，每个姓名不超过 100 字。',true);return;}
 if(editing){try{const latest=(await allRecords()).find(r=>r.id===editing.id);if(!latest||latest.updatedAt!==editing.updatedAt){toast('此记录已在其他标签页修改或删除。请复制未保存内容，关闭后重新打开最新记录。',true);return;}}catch(err){safeError(err);return;}}
 const now=new Date().toISOString(),record={id:editing?.id||uid(),title:f.elements.title.value.trim(),date:f.elements.date.value,time:f.elements.time.value,work:f.elements.work.value.trim(),people,category:f.elements.category.value,location:f.elements.location.value.trim(),notes:f.elements.notes.value.trim(),attachments:staged.map(metadata),starred:editing?.starred||false,createdAt:editing?.createdAt||now,updatedAt:now};
 saving=true;$('#save-record').disabled=true;$('#form-status').textContent='正在写入本机资料库…';
 try{await saveRecord(record,staged.filter(a=>!a.existing),removed);state.demo=false;prefs.set('mode','own');state.selected=record.id;state.view='all';state.query='';state.category='';state.person='';state.from='';state.to='';state.page=1;$('#search').value='';$('#date-from').value='';$('#date-to').value='';dirty=false;$('#editor').close();releaseStaged();await refresh();changed();toast('记录与附件已保存在本机。建议定期导出完整备份。');}
 catch(err){safeError(err);$('#form-status').textContent='保存未完成，请重试或备份后清理存储空间。';}
 finally{saving=false;$('#save-record').disabled=false;}
}
async function quickUpload(files){
 const r=currentRecord();if(!r||state.demo){toast('请先选择或创建一条真实活动记录。');return;}
 const list=[...files];if(!list.length)return;if(list.length+r.attachments.length>100){toast('每条活动最多 100 个附件。',true);return;}if(list.reduce((s,a)=>s+a.size,0)>200*1024*1024){toast('一次添加的附件不能超过 200 MB，请分批上传。',true);return;}
 try{toast('正在处理并保存附件…');const prepared=[];for(const file of list)prepared.push(await prepareFile(file));const latest=(await allRecords()).find(row=>row.id===r.id);if(!latest)throw new Error('活动已被删除，附件未保存。');if(latest.attachments.length+prepared.length>100)throw new Error('每条活动最多 100 个附件。');await saveRecord({...latest,attachments:[...latest.attachments,...prepared.map(metadata)],updatedAt:new Date().toISOString()},prepared);await refresh();changed();toast(`${prepared.length} 个附件已保存，原文件保持完整。`);}catch(e){safeError(e);}finally{$('#quick-files').value='';}
}

async function openPreview(record,id){
 const a=record.attachments.find(a=>a.id===id);if(!a)return;previewRecord=record;previewItems=isImage(a)?record.attachments.filter(isImage):[a];previewIndex=previewItems.findIndex(a=>a.id===id);zoomed=false;$('#preview').showModal();await renderPreview();
}
async function renderPreview(){
 const token=++previewToken;popupDeck?.destroy();popupDeck=null;popupURLs.clear();const a=previewItems[previewIndex];if(!a)return;const body=$('#preview-body');$('#preview-title').textContent=a.name;$('#zoom-image').hidden=!isImage(a);$('#zoom-image').setAttribute('aria-label',zoomed?'还原图片':'放大图片');
 $('#preview-footer').innerHTML=`<span id="popup-meta">${bytes(a.size)} · 原文件保留</span><div>${previewItems.length>1?`<button class="soft-btn" id="popup-prev" aria-label="预览上一张">${icon('left')}</button><span id="popup-count">${previewIndex+1} / ${previewItems.length}</span><button class="soft-btn" id="popup-next" aria-label="预览下一张">${icon('chevron')}</button>`:''}<span>${isImage(a)?'滚轮 / 方向键切换 · Esc 关闭':''}</span></div>`;
 const updatePopup=i=>{previewIndex=i;const f=previewItems[i];$('#preview-title').textContent=f.name;$('#popup-meta').textContent=`${bytes(f.size)} · 原文件保留`;if($('#popup-count')){$('#popup-count').textContent=`${i+1} / ${previewItems.length}`;$('#popup-prev').disabled=i===0;$('#popup-next').disabled=i===previewItems.length-1;}};
 if(isImage(a)&&!zoomed){body.innerHTML='<div id="popup-deck"></div>';popupDeck=new PhotoDeck($('#popup-deck'),previewItems,a=>popupURLs.get(a,true),{initial:previewIndex,onChange:updatePopup,onOpen:()=>{zoomed=true;renderPreview();}});popupDeck.root.focus({preventScroll:true});}
 else {
  body.innerHTML='<div class="loading-message">正在读取原文件…</div>';
  try{
   const f=demoFiles.get(a.id)||await getFile(a.id);if(token!==previewToken)return;if(!f?.blob)throw new Error('附件原文件不存在。');
   const url=await popupURLs.get(a,true);if(token!==previewToken)return;
   if(isImage(a)){body.innerHTML=`<div class="full-image"><img alt="${esc(a.name)}" src="${url}"></div>`;$('.full-image').onclick=()=>{zoomed=false;renderPreview();};}
   else if(a.type==='application/pdf'||/\.pdf$/i.test(a.name)){body.innerHTML=`<iframe class="file-preview-frame" title="PDF 预览：${esc(a.name)}" src="${url}"></iframe>`;$('#popup-meta').textContent='PDF 预览依赖浏览器支持；空白时请下载原文件';}
   else if(/^video\//.test(a.type)){body.innerHTML=`<video class="video-preview" src="${url}" controls playsinline preload="metadata"></video>`;}
   else if(/^audio\//.test(a.type)){body.innerHTML=`<audio class="audio-preview" src="${url}" controls preload="metadata"></audio>`;}
   else if(/^text\/(plain|csv|markdown)$/.test(a.type)||/\.(txt|md|csv|json|log)$/i.test(a.name)){
    const text=await f.blob.slice(0,1024*1024).text();if(token!==previewToken)return;body.innerHTML='<pre class="text-preview"></pre>';$('.text-preview').textContent=text+(f.blob.size>1024*1024?'\n\n[仅预览前 1 MB，请下载查看完整内容]':'');
   }else body.innerHTML=`<div class="unsupported-preview"><span class="file-icon">${icon(fileIcon(a))}</span><h3>原文件已妥善归档</h3><p>此格式暂不支持浏览器内预览。请通过右上角下载按钮，使用本机软件打开。为保护隐私，不会把文件传给在线文档转换服务。</p><small>${esc(a.name)} · ${bytes(a.size)}</small></div>`;
  }catch(e){if(token===previewToken)body.innerHTML=empty('暂时无法预览',esc(e.message));}
 }
 if($('#popup-prev')){$('#popup-prev').onclick=()=>{if(popupDeck)popupDeck.step(-1);else if(previewIndex>0){previewIndex--;renderPreview();}};$('#popup-next').onclick=()=>{if(popupDeck)popupDeck.step(1);else if(previewIndex<previewItems.length-1){previewIndex++;renderPreview();}};updatePopup(previewIndex);}
}
function closePreview(){previewToken++;$('#preview').close();popupDeck?.destroy();popupDeck=null;popupURLs.clear();$$('video,audio',$('#preview-body')).forEach(m=>m.pause());$('#preview-body').innerHTML='';}
async function downloadPreview(){try{const a=previewItems[previewIndex],f=demoFiles.get(a.id)||await getFile(a.id);if(!f?.blob)throw new Error('找不到原附件。');download(f.blob,a.name);}catch(e){safeError(e);}}

async function showBackup(){
 $('#utility-title').textContent='数据与备份';const records=await allRecords(),count=totalFiles(records),size=records.flatMap(r=>r.attachments).reduce((s,a)=>s+a.size,0);
 $('#utility-body').innerHTML=`<div class="info-box"><strong>这是本机资料库，不是云端协作空间。</strong><br>记录和附件仅保存在当前设备、当前浏览器中。刷新或关闭网页后仍可读取；清除网站数据、更换浏览器或设备会导致无法读取原记录。请定期导出完整备份。</div><div class="backup-summary"><span>${records.length} 条真实活动</span><span>${count} 个附件</span><span>附件原始大小 ${bytes(size)}</span></div><div class="utility-option"><div><h3>导出完整备份</h3><p>包含所有真实活动和附件原文件；可在另一台设备导入。示例不计入备份。备份文件未加密，请妥善保管。</p></div><button class="secondary" id="export-all">${icon('download')}完整备份</button></div><div class="utility-option"><div><h3>导入完整备份</h3><p>将备份作为独立副本追加，不覆盖现有记录。重复导入会产生副本。一次导入文件最大 300 MB。</p></div><button class="secondary" id="import-all">${icon('upload')}导入备份</button></div><div class="utility-option"><div><h3>导出活动表格</h3><p>导出 UTF-8 CSV，可用 Excel 打开。只包含文字与附件名称，不包含附件文件；不能替代完整备份。</p></div><button class="secondary" id="export-csv">${icon('list')}导出表格</button></div><div class="utility-option"><div><h3>申请持久存储</h3><p>减少浏览器在空间不足时自动清理数据的风险。授权结果由浏览器决定；仍不能代替备份。</p></div><button class="secondary" id="persist-storage">${icon('lock')}申请保护</button></div><p id="storage-info" style="font-size:10px;color:var(--muted);line-height:1.8;margin-top:18px">附件不上传至服务器。此公开网站只托管应用代码。<br>跨设备共享、多人同时编辑及账号权限尚未接入后端。</p>`;
 $('#export-all').onclick=exportBackup;$('#import-all').onclick=()=>$('#import-file').click();$('#export-csv').onclick=exportCSV;$('#persist-storage').onclick=async()=>{try{const granted=await navigator.storage?.persist?.();toast(granted?'浏览器已授予持久存储；请仍定期备份。':'浏览器未授予持久存储，现有记录不受影响。请定期备份。');}catch(e){safeError(e);}};
 $('#utility').showModal();
}
async function exportBackup(){
 if(exporting)return;exporting=true;const button=$('#export-all');if(button)button.disabled=true;
 try{const records=await allRecords(),size=records.flatMap(r=>r.attachments).reduce((s,a)=>s+a.size,0);if(size>200*1024*1024)throw new Error('当前附件原始总量超过 200 MB，本版浏览器内完整备份达到安全上限。请先分别下载原附件，并导出 CSV；勿清理资料库。');toast('正在整理完整备份，包含所有附件原文件…');const files=[];for(const r of records)for(const a of r.attachments){const f=await getFile(a.id);if(!f?.blob)throw new Error(`缺失附件「${a.name}」，未生成不完整备份。`);files.push({id:a.id,data:await blobToData(f.blob)});}const payload={app:'Activity-Log',version:1,exportedAt:new Date().toISOString(),records,files};download(new Blob([JSON.stringify(payload)],{type:'application/json'}),`Activity-Log-完整备份-${localDate()}.activitylog`);prefs.set('backup-at',new Date().toISOString());toast(`已生成 ${records.length} 条活动、${files.length} 个附件的完整备份。`);}catch(e){safeError(e);}finally{exporting=false;if(button)button.disabled=false;}
}
async function handleImport(file){
 if(!file||importBusy)return;if(file.size>300*1024*1024){toast('备份文件超过 300 MB 安全读取限制。',true);return;}
 if(!confirm('导入会把备份中的活动和附件作为新副本追加，不覆盖现有资料。重复导入会产生重复记录。继续吗？'))return;
 importBusy=true;try{const payload=JSON.parse(await file.text());const count=await importBackup(payload);state.demo=false;prefs.set('mode','own');state.selected=null;await refresh();changed();$('#utility').close();toast(`成功导入 ${count} 条活动及其完整附件，未覆盖现有记录。`);}catch(e){safeError(e);}finally{importBusy=false;$('#import-file').value='';}
}
async function exportCSV(){try{const records=await allRecords();const safe=s=>{const value=String(s??'');return '"'+(/^[\s]*[=+@-]/.test(value)?"'":'')+value.replaceAll('"','""')+'"';};const rows=[['活动名称','活动时间','参与具体工作','人员','活动类型','活动地点','备注','附件数量','附件名称','星标'],...records.map(r=>[r.title,`${r.date} ${r.time}`.trim(),r.work,r.people.join('、'),r.category,r.location,r.notes,r.attachments.length,r.attachments.map(a=>a.name).join('；'),r.starred?'是':'否'])];download(new Blob(['\uFEFF'+rows.map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),`活动记录-${localDate()}.csv`);toast('活动表格已导出，不含附件原文件。');}catch(e){safeError(e);}}
function showHelp(){
 $('#utility-title').textContent='让记录，顺手一点';$('#utility-body').innerHTML=`<div class="info-box">一个安静的部门活动记录空间。<br>保存做过的工作、同行的人，以及值得回看的现场片刻。</div><section class="help-section"><h3>01 / 写下一条活动</h3><p>点击「记录新活动」，填写活动名称、活动时间、参与具体工作和人员。可补充地点、分类、备注，并在右侧多选或拖入附件。点击保存后才会写入资料库。</p></section><section class="help-section"><h3>02 / 一眼找到需要的内容</h3><p>搜索会查找活动名称、具体工作、人员、地点、备注及附件名称。支持类型、人员、日期组合筛选，卡片 / 表格切换，以及时间线、附件库、人员与星标视图。按 <kbd>/</kbd> 快速聚焦搜索。</p></section><section class="help-section"><h3>03 / 像翻卡片一样回看照片</h3><p>将鼠标移到图片上滚动，或选中图片区域后使用 <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>。数字小键盘 <kbd>8 / 2 / 4 / 6</kbd> 同样有效。也可上下或左右拖动、手机触摸滑动。顶层图片完整显示，后续卡片依次叠放；到首尾不循环。</p></section><section class="help-section"><h3>04 / 预览与原文件</h3><p>图片可直接查看、打开大图并切换，点击大图或放大按钮查看原始像素。支持浏览器 PDF、音视频，以及 TXT、Markdown、CSV、JSON 的文本预览。Word、Excel、PowerPoint、压缩包等可归档和下载，暂不内嵌解析。</p></section><section class="help-section"><h3>05 / 数据属于你的浏览器</h3><p>当前为本机版，没有账号登录、云端备份或多人自动同步。请不要在无痕模式保存重要记录。完整备份包含原始附件；CSV 仅含文字。任何人访问公开网址都不会自动看到你存入浏览器的资料，但同一浏览器使用者可以查看。</p></section><section class="help-section"><h3>06 / 容量与性能边界</h3><p>单个附件最多 50 MB，每条活动最多 100 个附件，一次添加最多 200 MB。完整备份支持附件原始总量不超过 200 MB，超过后需分别下载原文件。图片切换最多保留六层卡片；系统开启「减少动态效果」时自动弱化动画。流畅程度仍取决于设备与图片大小。</p></section>`;$('#utility').showModal();
}

hydrate();
if(prefs.get('theme')==='dark')document.documentElement.dataset.theme='dark';
$('#theme-toggle').innerHTML=icon(document.documentElement.dataset.theme==='dark'?'sun':'moon');
$('#theme-toggle').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';prefs.set('theme',dark?'dark':'light');$('#theme-toggle').innerHTML=icon(dark?'sun':'moon');$('#theme-toggle').setAttribute('aria-label',dark?'切换浅色模式':'切换深色模式');};
$('#nav').onclick=e=>{const b=e.target.closest('[data-view]');if(!b)return;state.view=b.dataset.view;state.page=1;render();};
$('#layout-switch').onclick=e=>{const b=e.target.closest('[data-layout]');if(!b)return;state.layout=b.dataset.layout;$$('[data-layout]').forEach(el=>el.classList.toggle('active',el===b));renderRecords(filtered());};
let searchTimer;$('#search').oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=e.target.value.trim();state.page=1;render();},110);};
$('#category-filter').onchange=e=>{state.category=e.target.value;state.page=1;render();};$('#sort').onchange=e=>{state.sort=e.target.value;state.page=1;render();};
$('#person-filter').onchange=e=>{state.person=e.target.value;state.page=1;render();};
for(const [id,key] of [['date-from','from'],['date-to','to']])$('#'+id).onchange=e=>{state[key]=e.target.value;if(state.from&&state.to&&state.from>state.to){toast('起始日期晚于结束日期，请调整筛选。',true);}state.page=1;render();};
$('#more-filters').onclick=()=>{$('#advanced-filters').hidden=!$('#advanced-filters').hidden;$('#more-filters').setAttribute('aria-expanded',String(!$('#advanced-filters').hidden));};$('#clear-filters').onclick=clearFilters;
$('#pagination').onclick=e=>{const b=e.target.closest('[data-page]');if(b){state.page=Number(b.dataset.page);renderRecords(filtered());$('#section-title').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}};
document.addEventListener('click',e=>{
 if(e.target.closest('.new-record')){if(!state.ready){toast('资料库尚未就绪，请检查浏览器存储权限。',true);return;}openEditor();return;}
 const star=e.target.closest('[data-star]');if(star){starRecord(star.dataset.star);return;}
 const person=e.target.closest('[data-person]');if(person){personFilter(person.dataset.person);return;}
 const media=e.target.closest('[data-media]');if(media){const r=data().find(r=>r.id===media.dataset.parent);state.selected=r.id;renderDetail();openPreview(r,media.dataset.media);return;}
 const row=e.target.closest('[data-record]');if(row){state.selected=row.dataset.record;$$('[data-record]').forEach(el=>{el.classList.toggle('selected',el.dataset.record===state.selected);if(el.getAttribute('role')==='button')el.setAttribute('aria-pressed',String(el.dataset.record===state.selected));});renderDetail();if(innerWidth<=790)$('#detail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}
 const file=e.target.closest('[data-file]');if(file){const r=currentRecord();if(r)openPreview(r,file.dataset.file);return;}
 if(e.target.closest('[data-clear]'))clearFilters();
});
document.addEventListener('keydown',e=>{
 const editingInput=e.target.closest('input,textarea,select,[contenteditable=true]');
 if(editingInput)return;
 const row=e.target.closest('[data-record]');if(row&&(e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();row.click();return;}
 if(e.key==='/'&&!$('dialog[open]')){e.preventDefault();$('#search').focus();return;}
 if($('#preview').open&&popupDeck&&!e.target.closest('.deck')&&!e.target.closest('button'))popupDeck.key(e);
});
$('#start-own').onclick=()=>{ownMode();toast('已进入你的资料库。示例不会混入真实记录。');};
$('#demo-toggle').onclick=()=>{state.demo=!state.demo;prefs.set('mode',state.demo?'demo':'own');state.selected=null;clearFilters();options();};
$('#backup-nav').onclick=()=>showBackup().catch(safeError);$('#help-nav').onclick=showHelp;$('#close-utility').onclick=()=>$('#utility').close();
$('#close-editor').onclick=closeEditor;$('#cancel-editor').onclick=closeEditor;$('#editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});$('#record-form').onsubmit=submitRecord;$('#record-form').addEventListener('input',()=>{dirty=true;});
$('#editor-files').onchange=e=>stageFiles(e.target.files);
$('#staged-files').onclick=e=>{const b=e.target.closest('[data-remove-staged]');if(!b||saving||processing)return;const i=Number(b.dataset.removeStaged),a=staged[i];if(a.existing)removed.push(a.id);staged.splice(i,1);dirty=true;renderStaged();};
const drop=$('#editor-dropzone');['dragenter','dragover'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragover');}));drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');stageFiles(e.dataTransfer.files);});
$('#detail').addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();$('#detail').classList.add('drag-over');}});$('#detail').addEventListener('dragleave',e=>{if(!$('#detail').contains(e.relatedTarget))$('#detail').classList.remove('drag-over');});$('#detail').addEventListener('drop',e=>{e.preventDefault();$('#detail').classList.remove('drag-over');quickUpload(e.dataTransfer.files);});
// Avoid navigating away if a file is dropped outside an upload zone.
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});window.addEventListener('drop',e=>{if(e.dataTransfer?.files.length)e.preventDefault();});
$('#quick-files').onchange=e=>quickUpload(e.target.files);$('#import-file').onchange=e=>handleImport(e.target.files[0]);
$('#close-preview').onclick=closePreview;$('#preview').addEventListener('cancel',e=>{e.preventDefault();closePreview();});$('#download-preview').onclick=downloadPreview;$('#zoom-image').onclick=()=>{zoomed=!zoomed;renderPreview();};
window.addEventListener('beforeunload',e=>{if(dirty&&$('#editor').open||saving||processing||exporting||importBusy){e.preventDefault();e.returnValue='';}});
channel?.addEventListener('message',()=>{refresh().catch(safeError);});
(async()=>{
 try{state.records=await allRecords();state.ready=true;state.demo=prefs.get('mode')==='demo'||(!state.records.length&&prefs.get('mode')!=='own');options();render();}
 catch(e){$('#records').innerHTML=empty('资料库暂时不可用','浏览器拒绝了本机存储。请检查站点存储权限，或在非无痕窗口中打开。');safeError(e);}
})();
