/** Archive only from the owner repository's main-branch workflow; no browser credentials. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(process.env.ARCHIVE_DIR||'archive-work');
const endpoint='https://cau-clst-activity-log.floot.app/_api/archive';
const repository='1337816143/Activity-Log';
if(process.env.GITHUB_REPOSITORY!==repository||!process.env.GITHUB_TOKEN)throw new Error('This script only runs in the authorized repository workflow.');
const tokenURL=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
tokenURL.searchParams.set('audience','activity-log-github-archive');
const identity=await fetch(tokenURL,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`}});
if(!identity.ok)throw new Error('Cannot obtain workflow identity');
const {value:oidc}=await identity.json();
async function call(params,command){const url=new URL(endpoint);for(const[k,v]of Object.entries(params||{}))url.searchParams.set(k,String(v));const r=await fetch(url,{method:command?'POST':'GET',headers:{Authorization:`Bearer ${oidc}`,...(command?{'Content-Type':'application/json'}:{})},...(command?{body:JSON.stringify({json:command})}:{}),signal:AbortSignal.timeout(180000)});const out=await r.json();if(!r.ok)throw new Error(`Archive service returned ${r.status}: ${out.json?.error||'unknown'}`);return out.json;}
await fs.mkdir(root,{recursive:true});
const env={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+process.env.GITHUB_TOKEN).toString('base64')};
function git(args,quiet=false){return execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:quiet?['ignore','pipe','pipe']:['ignore','pipe','inherit']}).trim();}
git(['init','-b','team-data']);git(['config','user.name','github-actions[bot]']);git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
try{git(['remote','add','origin',`https://github.com/${repository}.git`]);}catch{}
const remote=git(['ls-remote','--heads','origin','team-data'],true);
if(remote){git(['fetch','--depth=1','origin','team-data']);git(['checkout','-B','team-data','FETCH_HEAD']);}
const snapshot=await call({action:'snapshot'});let previous;
try{previous=JSON.parse(await fs.readFile(path.join(root,'data','manifest.json'),'utf8'));}catch{}
if(previous?.revision===snapshot.revision){const commit=git(['rev-parse','HEAD']);await call(null,{commit,revision:snapshot.revision});console.log(`Archive is current at revision ${snapshot.revision}.`);process.exit(0);}
const histories=[];let cursor='0';do{const page=await call({action:'history',cursor,until:snapshot.revision});histories.push(...page.rows);cursor=page.next;}while(cursor);
const latest=new Map();for(const event of histories)latest.set(event.record_id,event);
const files=[];cursor='';do{const page=await call({action:'files',cursor});files.push(...page.rows);cursor=page.next;}while(cursor);
await fs.mkdir(path.join(root,'attachments'),{recursive:true});
const metas=[];
for(const file of files){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(file.id)||!/^[a-f0-9]{64}$/.test(file.digest))throw new Error('Unsafe attachment identifier');const dest=path.join(root,'attachments',file.id+'.bin');let saved;try{saved=await fs.readFile(dest);}catch{}
 if(!saved||saved.length!==file.size||createHash('sha256').update(saved).digest('hex')!==file.digest){const r=await fetch(file.url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw new Error(`Cannot archive file ${file.id}`);saved=Buffer.from(await r.arrayBuffer());if(saved.length!==file.size||createHash('sha256').update(saved).digest('hex')!==file.digest)throw new Error(`Integrity mismatch for ${file.id}`);await fs.writeFile(dest,saved);}
 const {url,...meta}=file;metas.push({...meta,path:'attachments/'+file.id+'.bin'});
}
await fs.mkdir(path.join(root,'data'),{recursive:true});
await fs.rm(path.join(root,'history'),{recursive:true,force:true});await fs.mkdir(path.join(root,'history'),{recursive:true});
// Bound individual history files, preserving the complete append-only change record.
let part=1,buffer='';for(const event of histories){const line=JSON.stringify(event)+'\n';if(Buffer.byteLength(buffer)+Buffer.byteLength(line)>5*1024*1024&&buffer){await fs.writeFile(path.join(root,'history',String(part++).padStart(6,'0')+'.jsonl'),buffer);buffer='';}buffer+=line;}if(buffer)await fs.writeFile(path.join(root,'history',String(part).padStart(6,'0')+'.jsonl'),buffer);
const manifest={...snapshot,records:[...latest.values()].filter(r=>r.kind==='record'&&!r.deleted),drafts:[...latest.values()].filter(r=>r.kind==='draft'&&!r.deleted),trash:[...latest.values()].filter(r=>r.deleted),files:metas,historyCount:histories.length};
await fs.writeFile(path.join(root,'data','manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(root,'README.md'),'# 团队活动资料归档\n\n此分支由 GitHub Actions 从团队共享服务生成，包含正式记录、草稿、修改历史、回收站及附件原文件。\n\n这是公开仓库：归档资料及历史对公众可见。请勿上传保密资料。删除活动不会抹除历史备份。\n\n`data/manifest.json` 是当前快照，`history/` 是完整变更记录，`attachments/` 按文件 ID 保存原字节；名称、格式、大小与 SHA-256 校验值均在清单中。\n\n应用代码与维护文档见 main 分支。管理员密码校验值、数据库凭据、GitHub 令牌、临时文件签名链接均不在此归档中。\n');
git(['add','README.md','data','history','attachments']);
if(git(['status','--porcelain'])){git(['commit','-m',`archive: shared activity revision ${snapshot.revision}`]);git(['push','origin','HEAD:team-data']);}
const commit=git(['rev-parse','HEAD']);await call(null,{commit,revision:snapshot.revision});
console.log(`Archived ${manifest.records.length} records, ${manifest.drafts.length} drafts, ${metas.length} original/preview files and ${histories.length} revisions; commit ${commit}.`);
