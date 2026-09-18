import {team} from './team-client.js?v=2.1.0';
import {draftStore,outbox,receipts} from './drafts.js?v=2.1.0';
import {localRecords,localFile,validateRecord,uid,metadata} from './store.js?v=2.1.0';
import {sha256} from './crypto.js?v=2.1.0';
import {esc,icon,toast,bytes,localDate,download} from './ui.js?v=2.1.0';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let hooks={},adminResolve=null,worker=null,excelFile=null,excelRows=[],excelSheets=[],excelPage=1,excelOptions={mapping:{}},importing=false;
const modal=id=>$('#'+id);
const readableTime=s=>s?new Date(s).toLocaleString('zh-CN',{hour12:false}):'尚未保存';
const error=e=>toast(e?.message||'操作未完成，请重试。',true);
function modalClose(el){if(el.id==='excel-modal'&&importing){toast('正在同步导入，请等待共享服务确认。');return;}el.close();}
export function askAdmin(reason='将活动移入回收站'){
 if(adminResolve)adminResolve(null);
 $('#admin-reason').textContent=reason;$('#admin-password').value='';$('#admin-modal').showModal();$('#admin-password').focus();
 return new Promise(resolve=>{adminResolve=resolve;});
}
function adminDone(value){$('#admin-modal').close();$('#admin-password').value='';const fn=adminResolve;adminResolve=null;fn?.(value);}
export function showTeam(){
 const b=team.manifest?.backup,body=$('#team-body');
 body.innerHTML=`<div class="info-box"><strong>免登录公共协作 · 打开即用</strong><br>无需 GitHub 账号、授权、团队密钥或登录。所有访客共用同一个资料库；新增和编辑直接保存，删除或移除正式附件仍需管理员密码。<br><b>拿到网址的人都能查看与修改。公开 GitHub 归档也会保留历史，请勿上传保密资料。</b></div><div class="team-connected"><span class="status-dot"></span>${team.connected?'共享服务已自动连接':'暂时未连接；本机草稿仍可使用'}</div><div class="team-button-row"><button class="secondary" id="sync-now">刷新共享数据</button><button class="secondary" id="check-pending">检查未确认保存</button></div><section class="help-section"><h3>GitHub 归档状态</h3><p>最近归档：${b?.backed_up_at?readableTime(b.backed_up_at):'尚无已确认归档'}<br>共享版本 ${esc(team.manifest?.version||'0')} / 已归档版本 ${esc(b?.revision||'0')}。定时归档目标约 5 分钟一次，GitHub 排队可能延迟，不等于即时备份。</p><p><a href="https://github.com/1337816143/Activity-Log/tree/team-data" target="_blank" rel="noopener">查看 GitHub 归档分支 ↗</a></p></section><section class="help-section"><h3>旧版本机记录迁移</h3><p>旧版本机资料不会自动公开上传。经你确认后才会复制到团队库；原本机副本保留。迁入后所有访客可见，并将进入公开 GitHub 归档。</p><button class="secondary" id="migrate-legacy">检查并迁入旧记录</button></section><div id="pending-list"></div>`;
 $('#team-modal').showModal();$('#sync-now').onclick=async()=>{try{await team.connect();await hooks.onRefresh?.();showTeam();toast('已读取团队最新资料。');}catch(e){error(e);}};
 $('#check-pending').onclick=async()=>{try{await team.checkPending();await pendingList();await hooks.onRefresh?.();}catch(e){error(e);}};
 $('#migrate-legacy').onclick=migrateLegacy;pendingList().catch(error);
}
async function pendingList(){const el=$('#pending-list');if(!el)return;const pending=await outbox.list(),recent=(await receipts.list()).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,5);el.innerHTML=`<section class="help-section"><h3>待确认请求 ${pending.length} 个</h3>${pending.map(p=>`<p><code>${esc(p.id.slice(0,8))}</code> · ${esc(p.action)} · ${readableTime(p.createdAt)}<br>共享保存结果尚未确认，本机草稿仍保留；请检查状态，不要重复提交。</p>`).join('')||'<p>当前没有待确认请求。</p>'}${recent.map(p=>`<p>${p.status==='success'?'✓':'!'} ${esc(p.message)} · ${readableTime(p.at)}</p>`).join('')}</section>`;}
async function migrateLegacy(){
 try{const rows=await localRecords();if(!rows.length){toast('本浏览器没有旧版本机记录。');return;}if(rows.length>500)throw new Error('旧记录超过 500 条，请先分批整理或导出备份。');if(!confirm(`将 ${rows.length} 条旧版本机记录及附件同步给团队？原本机副本不会删除。`))return;
 const m=await team.refresh(true),records=[],files=[];
 for(const r of rows){if(m.records[r.id])continue;records.push(r);for(const a of r.attachments){const f=await localFile(a.id);if(!f?.blob)throw new Error('旧记录缺少原附件，迁移已中止，未提交不完整资料。');files.push(f);}}
 if(!records.length){toast('这些本机记录已存在于团队库，无需重复迁移。');return;}
 const b=$('#migrate-legacy');b.disabled=true;try{await team.importRecords(records,files);await hooks.onRefresh?.();toast('旧记录与原附件已迁入 团队共享库。');}finally{b.disabled=false;}
 }catch(e){error(e);}
}
export async function showDrafts(){
 $('#drafts-modal').showModal();$('#drafts-body').innerHTML='<div class="loading-message">正在读取草稿…</div>';
 try{
  const locals=await draftStore.list();let cloud=[];if(team.connected)cloud=await team.listRecords({drafts:true});
  const localIds=new Set(locals.map(d=>d.id));const rows=[...locals.map(d=>({...d,scope:d.cloudRevision?'本机 · 曾同步':'本机暂存'})),...cloud.filter(d=>!localIds.has(d.id)).map(d=>({...d,scope:'团队共享草稿',remote:true}))].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
  $('#drafts-body').innerHTML=`<div class="info-box">输入停止约 0.6 秒后自动暂存到本浏览器；附件也会暂存。共享服务可用时，停止输入约 30 秒后自动尝试同步团队草稿，也可以手动“暂存到团队”。<br>未显示“共享保存已确认”的内容仍是本机草稿，不要清除网站数据。</div>${rows.length?rows.map(d=>`<div class="draft-row"><div><b>${esc(d.fields?.title||d.title||'未命名活动')}</b><small>${esc(d.scope)} · ${readableTime(d.updatedAt)} · ${(d.staged||d.attachments||[]).length} 个附件</small></div><button class="secondary" data-resume-draft="${esc(d.id)}">继续填写</button><button class="icon-btn danger" data-discard-draft="${esc(d.id)}" aria-label="丢弃草稿">${icon('trash')}</button></div>`).join(''):'<div class="empty-mini">还没有草稿。可以先填写部分信息，稍后继续。</div>'}`;
  $$('[data-resume-draft]').forEach(b=>b.onclick=async()=>{const d=rows.find(d=>d.id===b.dataset.resumeDraft);$('#drafts-modal').close();await hooks.onOpenDraft?.(d);});
  $$('[data-discard-draft]').forEach(b=>b.onclick=async()=>{const d=rows.find(d=>d.id===b.dataset.discardDraft);if(!confirm('丢弃这份尚未正式保存的草稿？不会删除已保存的活动。'))return;try{if(d.remote||d.cloudRevision){if(!team.connected)throw new Error('此草稿曾同步到团队，请等待共享服务恢复 再丢弃。');const c=await team.getRecord(d.id,true);if(c)await team.discardDraft(c);}await draftStore.remove(d.id);await showDrafts();}catch(e){error(e);}});
 }catch(e){$('#drafts-body').textContent=e.message;}
}
export async function showRecycle(knownPassword=null){
 if(!team.connected){toast('请先连接团队资料库。');showTeam();return;}
 $('#recycle-modal').showModal();$('#recycle-body').innerHTML='<div class="loading-message">正在读取回收站…</div>';
 try{const password=typeof knownPassword==='string'?knownPassword:await askAdmin('查看活动回收站');if(password===null){$('#recycle-modal').close();return;}const rows=await team.listRecords({deleted:true,password});$('#recycle-body').innerHTML=`<div class="info-box">删除只将记录移入回收站，不清除附件原文件和 修改历史与 GitHub 归档。恢复也需要管理员密码。</div>${rows.length?rows.map(r=>`<div class="draft-row"><div><b>${esc(r.title)}</b><small>${esc(r.date)} · ${r.attachments.length} 个附件</small></div><button class="secondary" data-restore-record="${esc(r.id)}">恢复</button></div>`).join(''):'<div class="empty-mini">回收站为空。</div>'}`;
 $$('[data-restore-record]').forEach(b=>b.onclick=async()=>{const r=rows.find(r=>r.id===b.dataset.restoreRecord),password=await askAdmin('恢复此活动及其附件');if(password===null)return;b.disabled=true;try{await team.restoreRecord(r,password);await showRecycle(password);await hooks.onRefresh?.();toast('活动已恢复到团队资料库。');}catch(e){error(e);b.disabled=false;}});
 }catch(e){$('#recycle-body').textContent=e.message;}
}
export function showExcel(){
 $('#excel-modal').showModal();if($('#excel-shell'))return;
 $('#excel-body').innerHTML=`<div id="excel-shell"><div class="info-box"><strong>智能识别 → 核对预览 → 确认导入</strong><br>支持 XLSX、XLS、CSV，多工作表、重复表头、合并单元格及纵向字段表。每一行保留“人员—具体工作”对应关系，不会把同名活动下的分工混在一起。无法确定的字段会标记，不自动猜。</div><div class="import-settings"><label>选择历史记录文件<input id="excel-file" type="file" accept=".xlsx,.xls,.csv"></label><label>缺省年份（仅补无年份日期）<input id="excel-year" type="number" min="1900" max="2200" placeholder="例如 2025；不自动填今年"></label><label class="checkbox-label"><input id="excel-hidden" type="checkbox">包含隐藏工作表</label><button class="secondary" id="excel-reparse">重新识别</button></div><details class="mapping-details"><summary>识别不准确？手动指定列与数据起始行</summary><p>适用于列名特殊、没有表头等情况。修改年份或映射后，重新识别会重置预览中的手动修订。</p><div class="mapping-fields"><label>工作表<select id="mapping-sheet"><option value="">先选择文件</option></select></label><label>首条数据行<input id="mapping-row" type="number" value="2" min="1" max="10000"></label>${[['title','活动名称'],['date','活动时间'],['work','具体工作'],['people','人员']].map(([key,label],i)=>`<label>${label}<select data-map="${key}">${Array.from({length:52},(_,n)=>`<option value="${n}" ${n===i?'selected':''}>${n<26?String.fromCharCode(65+n):'A'+String.fromCharCode(65+n-26)} 列</option>`).join('')}</select></label>`).join('')}<button class="secondary" id="apply-mapping">应用并重新识别</button></div></details><p id="excel-status" role="status">Excel 在本机后台线程解析，未确认前不会上传到共享服务或 GitHub。</p><div id="excel-diagnostics"></div><div class="import-review-actions"><button class="text-btn" id="excel-select-page">选中本页有效记录</button><button class="text-btn" id="excel-clear-selection">取消全部选择</button><button class="text-btn" id="excel-select-next">选择前 500 条未导入记录</button><button class="text-btn" id="excel-draft">把已选记录暂存为草稿</button></div><div id="excel-review"></div><div id="excel-pagination" class="pagination"></div><label class="checkbox-label review-confirm"><input id="excel-confirm" type="checkbox">我已核对活动、日期、人员与具体工作的对应关系，包括所有黄色提示。</label><div class="import-footer"><span id="excel-summary"></span><button class="primary" id="excel-import">确认导入团队</button></div></div>`;
 $('#excel-file').onchange=async e=>{excelFile=e.target.files[0];excelOptions.mapping={};await parseExcel();};$('#excel-reparse').onclick=parseExcel;
 $('#apply-mapping').onclick=()=>{const sheet=$('#mapping-sheet').value;if(!sheet)return;const columns={};$$('[data-map]').forEach(s=>columns[s.dataset.map]=+s.value);if(new Set(Object.values(columns)).size!==4){toast('四个字段不能映射到同一列。',true);return;}excelOptions.mapping[sheet]={startRow:+$('#mapping-row').value||1,columns};parseExcel();};
 $('#excel-select-page').onclick=()=>{excelRows.slice((excelPage-1)*80,excelPage*80).forEach(r=>r.include=validRow(r)&&!r.imported);renderReview();};
 $('#excel-clear-selection').onclick=()=>{excelRows.forEach(r=>r.include=false);renderReview();};
 $('#excel-select-next').onclick=()=>{let count=0;excelRows.forEach(r=>r.include=validRow(r)&&!r.imported&&count++<500);renderReview();};
 $('#excel-draft').onclick=saveImportDrafts;$('#excel-import').onclick=confirmExcelImport;
 $('#excel-pagination').onclick=e=>{const b=e.target.closest('[data-excel-page]');if(b){excelPage=+b.dataset.excelPage;renderReview();}};
 $('#excel-review').addEventListener('change',e=>{const el=e.target.closest('[data-row-index]');if(!el)return;const row=excelRows[+el.dataset.rowIndex];if(el.dataset.field==='include')row.include=el.checked;else{row[el.dataset.field]=el.value.trim();row.manual=true;}reviewSummary();});
}
async function parseExcel(){
 if(importing)return;if(!excelFile){toast('请先选择一个 Excel 或 CSV 文件。');return;}if(excelFile.size>20*1024*1024){error(new Error('Excel 文件超过 20 MB，请先拆分；不接受图片或扫描表。'));return;}
 worker?.terminate();$('#excel-status').textContent='正在后台读取表格结构与记录…';$('#excel-import').disabled=true;$('#excel-confirm').checked=false;
 excelOptions.year=$('#excel-year').value;excelOptions.includeHidden=$('#excel-hidden').checked;
 try{const buffer=await excelFile.arrayBuffer();const w=new Worker(new URL('./excel-worker.js?v=2.1.0',import.meta.url));worker=w;
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{w.terminate();reject(new Error('表格解析超过 30 秒，请清理大量空白格式或拆分文件。'));},30000);w.onmessage=e=>{clearTimeout(timer);w.terminate();if(e.data.ok)resolve(e.data);else reject(new Error(e.data.error));};w.onerror=()=>{clearTimeout(timer);w.terminate();reject(new Error('Excel 解析线程启动失败，请刷新后重试。'));};w.postMessage({buffer,options:excelOptions},[buffer]);});
 excelRows=result.records;excelSheets=result.sheets;excelPage=1;let selected=0;for(const r of excelRows){if(r.include){selected++;if(selected>500)r.include=false;}}
 const previous=$('#mapping-sheet').value;$('#mapping-sheet').innerHTML=excelSheets.map(s=>`<option value="${esc(s.name)}">${esc(s.name)}${s.hidden?'（隐藏）':''}</option>`).join('');if(excelSheets.some(s=>s.name===previous))$('#mapping-sheet').value=previous;
 $('#excel-status').textContent=`已识别 ${excelRows.length} 条分工记录 · ${excelSheets.length} 个工作表。黄色提示须核对；无年份日期先确认默认年份后重新识别。`;
 $('#excel-diagnostics').innerHTML=(result.unrecognized.length?`<p class="import-warning">以下工作表未识别到完整记录：${esc(result.unrecognized.join('、'))}。可手动指定列。</p>`:'')+(result.skipped.length?`<details><summary>跳过的说明、汇总或隐藏表（${result.skipped.length} 项）</summary>${result.skipped.slice(0,50).map(s=>`<p>${esc(s.sheet)}${s.row?' 第 '+s.row+' 行':''}：${esc(s.reason)}</p>`).join('')}</details>`:'');
 renderReview();
 }catch(e){$('#excel-status').textContent=e.message;error(e);}finally{$('#excel-import').disabled=false;}
}
const validRow=r=>!!(r.title?.trim()&&r.work?.trim()&&r.people?.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&Number.isFinite(Date.parse(r.date))&&new Date(r.date).toISOString().slice(0,10)===r.date);
function renderReview(){
 const first=(excelPage-1)*80;$('#excel-review').innerHTML=excelRows.length?`<div class="import-table-scroll"><table class="import-table"><thead><tr><th>选择</th><th>来源 / 提示</th><th>活动名称</th><th>活动日期</th><th>参与具体工作</th><th>人员</th></tr></thead><tbody>${excelRows.slice(first,first+80).map((r,i)=>`<tr class="${r.warnings.length?'has-warning':''} ${r.imported?'was-imported':''}"><td><input type="checkbox" data-row-index="${first+i}" data-field="include" ${r.include?'checked':''} ${r.imported?'disabled':''} aria-label="选择第 ${first+i+1} 条记录"></td><td><b>${esc(r.sheet)} · 第 ${r.row} 行</b><small>${r.imported?'已导入':esc(r.warnings.join('；')||'字段完整')}${r.originalDate?' / 原日期 '+esc(r.originalDate):''}</small></td><td><input data-row-index="${first+i}" data-field="title" value="${esc(r.title)}" maxlength="120" aria-label="第 ${first+i+1} 条活动名称"></td><td><input type="date" data-row-index="${first+i}" data-field="date" value="${esc(r.date)}" aria-label="第 ${first+i+1} 条日期"></td><td><textarea data-row-index="${first+i}" data-field="work" maxlength="10000" rows="2" aria-label="第 ${first+i+1} 条具体工作">${esc(r.work)}</textarea></td><td><input data-row-index="${first+i}" data-field="people" value="${esc(r.people)}" aria-label="第 ${first+i+1} 条人员"></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-mini">选择文件后在这里核对；图片不能代替 Excel 原文件。</div>';
 const pages=Math.ceil(excelRows.length/80);$('#excel-pagination').innerHTML=pages>1?`<button data-excel-page="${excelPage-1}" ${excelPage===1?'disabled':''}>上一页</button><span>${excelPage} / ${pages}</span><button data-excel-page="${excelPage+1}" ${excelPage===pages?'disabled':''}>下一页</button>`:'';reviewSummary();
}
function reviewSummary(){const selected=excelRows.filter(r=>r.include&&!r.imported);$('#excel-summary').textContent=`已选择 ${selected.length} 条 · 未通过字段校验 ${selected.filter(r=>!validRow(r)).length} 条 · 每次最多 500 条`;}
async function rowToRecord(r){
 const date=r.date,people=[...new Set(r.people.split(/[,，、;；\n]+/).map(x=>x.trim()).filter(Boolean))];
 const signature=JSON.stringify([r.title.trim(),date,r.work.trim(),[...people].sort()]);
 return validateRecord({id:uid(),title:r.title.trim(),date,time:'',work:r.work.trim(),people,category:r.category||'部门工作',location:r.location||'',notes:[r.notes,`导入来源：${excelFile?.name||'历史表格'} / ${r.sheet} / 第 ${r.row} 行；原日期：${r.originalDate||r.date}`].filter(Boolean).join('\n'),attachments:[],starred:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),importFingerprint:await sha256(signature)});
}
async function saveImportDrafts(){try{const selected=excelRows.filter(r=>r.include&&!r.imported);if(!selected.length||selected.length>500)throw new Error('请选中 1–500 条记录。');for(const r of selected){const id=uid(),fields={title:r.title,date:r.date,time:'',work:r.work,people:r.people,category:r.category,location:r.location,notes:r.notes};await draftStore.save({id,fields,staged:[],removed:[],editing:null,updatedAt:new Date().toISOString(),importSource:{file:excelFile?.name,sheet:r.sheet,row:r.row}});}toast(`已暂存 ${selected.length} 条本机草稿，可从草稿箱继续。`);}catch(e){error(e);}}
async function confirmExcelImport(){
 if(importing)return;
 const selected=excelRows.filter(r=>r.include&&!r.imported);if(!selected.length||selected.length>500){toast('请选中 1–500 条记录。',true);return;}if(selected.some(r=>!validRow(r))){toast('仍有日期或必填字段无效，请修正后再导入。',true);return;}if(!$('#excel-confirm').checked){toast('请先勾选“我已核对”，尤其确认年份与人员分工。',true);return;}
 if(!team.connected){toast('表格已保留在预览中，请等待共享服务恢复。');showTeam();return;}
 importing=true;$('#excel-import').disabled=true;$('#excel-status').textContent='正在保存已核对记录到共享库，请勿重复点击…';
 try{const records=[];for(const r of selected)records.push(await rowToRecord(r));const result=await team.importRecords(records);selected.forEach(r=>{r.imported=true;r.include=false;});$('#excel-status').textContent=`共享库已保存：新增 ${result.added??records.length} 条，重复跳过 ${result.skipped||0} 条。`;renderReview();await hooks.onRefresh?.();toast('历史 Excel 记录已同步到团队库。');}catch(e){error(e);$('#excel-status').textContent=e.message;}finally{importing=false;$('#excel-import').disabled=false;}
}
export function initializeTeamUI(callbacks){
 hooks=callbacks;
 const titles=[['team','共享与备份'],['drafts','草稿箱'],['recycle','活动回收站'],['excel','历史 Excel 智能导入']];
 for(const [id,title] of titles){const d=document.createElement('dialog');d.id=id+'-modal';d.className='modal utility-modal '+(id==='excel'?'excel-modal':'');d.setAttribute('aria-labelledby',id+'-title');d.innerHTML=`<div class="modal-head"><h2 id="${id}-title">${title}</h2><button class="icon-btn modal-close" aria-label="关闭${title}">${icon('x')}</button></div><div id="${id}-body" class="v2-modal-body"></div>`;document.body.append(d);$('.modal-close',d).onclick=()=>modalClose(d);d.addEventListener('cancel',e=>{e.preventDefault();modalClose(d);});}
 const d=document.createElement('dialog');d.id='admin-modal';d.className='modal utility-modal admin-modal';d.setAttribute('aria-labelledby','admin-title');d.innerHTML=`<form id="admin-form"><div class="modal-head"><h2 id="admin-title">管理员确认</h2><button type="button" class="icon-btn" id="admin-cancel-x" aria-label="取消管理员确认">${icon('x')}</button></div><div class="v2-modal-body"><div class="info-box"><b id="admin-reason"></b><br>密码由 服务端校验。删除将进入回收站；错误密码不会改动原资料。</div><label class="admin-field">管理员密码<input type="password" id="admin-password" required autocomplete="current-password" maxlength="256"></label><div class="team-button-row"><button type="button" class="secondary" id="admin-cancel">取消</button><button type="submit" class="primary">验证并继续</button></div></div></form>`;document.body.append(d);
 $('#admin-form').onsubmit=e=>{e.preventDefault();adminDone($('#admin-password').value);};$('#admin-cancel').onclick=$('#admin-cancel-x').onclick=()=>adminDone(null);d.addEventListener('cancel',e=>{e.preventDefault();adminDone(null);});
 $('#team-settings').onclick=showTeam;$('#drafts-open').onclick=()=>showDrafts().catch(error);$('#recycle-open').onclick=showRecycle;$('#excel-open').onclick=showExcel;
 team.addEventListener('status',e=>{const el=$('#sync-status');el.textContent=e.detail.text;el.dataset.kind=e.detail.kind;});
 team.addEventListener('connected',()=>{$('#team-settings').classList.add('is-connected');});team.addEventListener('disconnected',()=>{$('#team-settings').classList.remove('is-connected');$('#sync-status').textContent='未连接共享库 · 填写内容仍可暂存';});
 const updateCount=async()=>{const count=(await draftStore.list()).length;$('#draft-count').textContent=count;};window.addEventListener('working-data-change',()=>updateCount().catch(()=>{}));updateCount().catch(()=>{});
}
