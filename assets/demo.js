/** Fictional examples and original vector illustrations. Never inserted into the user's IndexedDB. */
const posters = [
 ['秋日，一起出发。','AUTUMN / TOGETHER','2026 · FIELD NOTES','#d3e0ce','#526b5d','#a6b99c'],
 ['让想法，在这里发生。','IDEAS IN BLOOM','MEET · LEARN · GROW','#e4d9ed','#806d95','#c4accf'],
 ['微小的行动，也有光。','SMALL ACTS / BIG HEARTS','VOLUNTEER JOURNAL','#e9ddc7','#8a785f','#cfbe9b'],
 ['此刻，恰好有你。','MOMENTS WE SHARE','COLLECTING THE LITTLE THINGS','#d7e2e7','#637d8a','#a7c1ce']
];
function poster(i){const [title,sub,foot,bg,ink,light]=posters[i%4];return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="840" viewBox="0 0 1200 840"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#f5f1e9"/></linearGradient><linearGradient id="hill" x2="1" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${ink}"/></linearGradient></defs><rect width="1200" height="840" fill="url(#sky)"/><path d="M0 0h1200v840H0z" fill="none" stroke="#ffffff" stroke-opacity=".2" stroke-width="30"/><circle cx="960" cy="215" r="86" fill="#fff6df" opacity=".9"/><path d="M0 600Q270 360 575 550T1200 475V840H0" fill="${light}" opacity=".65"/><path d="M0 745Q420 410 720 625T1200 560V840H0" fill="url(#hill)" opacity=".8"/><path d="M900 842Q720 630 795 595T680 553" fill="none" stroke="#f5edda" stroke-width="45" opacity=".75"/><path d="M1070 840V540m-34 55 34-78 34 78m-47-8 13-37 15 38" stroke="${ink}" fill="${ink}" stroke-width="5" opacity=".65"/><text x="83" y="100" font-family="Arial,sans-serif" letter-spacing="6" font-size="17" fill="${ink}">ACTIVITY LOG / VISUAL NOTES</text><text x="79" y="258" font-family="sans-serif" font-size="57" letter-spacing="5" fill="${ink}">${title}</text><text x="84" y="307" font-family="Arial,sans-serif" letter-spacing="6" font-size="16" fill="${ink}" opacity=".75">${sub}</text><path d="M84 353h60" stroke="${ink}" stroke-width="1" opacity=".5"/><text x="84" y="756" font-family="Arial,sans-serif" letter-spacing="4" font-size="13" fill="#fff" opacity=".9">${foot}</text><text x="1090" y="757" font-family="Arial,sans-serif" font-size="15" fill="#fff">0${i+1}</text><text x="85" y="805" font-family="sans-serif" font-size="12" fill="#fff" opacity=".65">示例插画 · 非真实活动照片</text></svg>`;}
const rows = [
 ['2026-09-16','秋日迎新 · 从相遇开始','负责活动方案策划、迎新物料准备与现场统筹；完成签到引导、照片整理及活动总结。',['林宁','陈禾','周予'],'部门工作','学生活动中心','把第一次见面的拘谨，变成一起做事的默契。',0,4],
 ['2026-09-12','新学期工作坊：把想法变成行动','整理培训资料，协助嘉宾对接与会务准备；记录小组讨论成果，收集活动反馈。',['林宁','许安'],'会议培训','综合楼 302','',1,2],
 ['2026-09-08','校园志愿行动 · 让温暖发生','参与志愿者排班与点位协调，负责物资清点、现场秩序维护和活动影像记录。',['陈禾','周予','沈言'],'志愿服务','校园公共空间','',2,3],
 ['2026-09-03','午后分享会：好方法，一起聊','汇总报名名单，设计讨论提纲；负责主持串场、计时提醒和分享内容整理。',['许安','沈言'],'交流分享','研讨室 B','',3,2],
 ['2026-08-28','夏末相聚 · 部门交流日','参与活动流程设计、场地布置及互动环节组织；整理成员建议与后续分工。',['林宁','陈禾','沈言'],'文体活动','多功能活动室','',0,1],
 ['2026-08-22','暑期工作复盘与资料归档','梳理阶段工作进度，核对活动记录与附件；协助完成资料分类、命名和归档。',['周予','许安'],'部门工作','线上会议','',1,0]
];
export const demoFiles = new Map();
export const demoRecords = rows.map((r,i)=>{
 const [date,title,work,people,category,location,notes,offset,count]=r,attachments=[];
 for(let j=0;j<count;j++){const id=`sample-${i}-${j}`;const blob=new Blob([poster((j+offset)%4)],{type:'image/svg+xml'});const f={id,name:`${['活动主视觉','现场片刻','活动回顾','合影留念'][j%4]} · 示意.svg`,type:'image/svg+xml',size:blob.size,blob,thumbnail:blob};demoFiles.set(id,f);attachments.push({id:f.id,name:f.name,type:f.type,size:f.size});}
 if(i===0){const blob=new Blob(['活动复盘提纲（虚构示例）\n\n1. 活动筹备与分工\n2. 现场流程与协作\n3. 活动反馈与改进建议\n\n这些文字仅用于功能演示，不是真实部门记录。'],{type:'text/plain'}),f={id:'sample-note',name:'活动复盘提纲 · 示例.txt',type:'text/plain',size:blob.size,blob};demoFiles.set(f.id,f);attachments.push({id:f.id,name:f.name,type:f.type,size:f.size});}
 return {id:`example-${i}`,title,date,time:i===0?'14:30':'',work,people,category,location,notes,attachments,starred:i===0||i===2,createdAt:date+'T08:00:00.000Z',updatedAt:date+'T08:00:00.000Z'};
});
