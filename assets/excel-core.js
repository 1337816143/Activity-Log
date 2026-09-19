/* Heuristic structural parser. No formulas or macros are executed. Ambiguities remain visible for review. */
(function(root){
 const coreFields=['title','date','work','people'];
 const types=()=>root.ActivityCategories;
 const categoryField=c=>['活动类型','活动分类','类型','分类'].includes(norm(c));
 const value=c=>c&&typeof c==='object'&&!(c instanceof Date)?(c.w??c.v??''):c??'';
 const text=c=>String(value(c)).trim();
 const norm=s=>text(s).replace(/[\s：:（）()\[\]【】*_\-]/g,'').toLowerCase();
 const aliases={title:['活动名称','项目名称','活动主题','活动','项目','工作名称','工作事项','事项','名称'],date:['活动时间','活动日期','日期','时间','举办时间','举办日期'],work:['参与具体工作','具体工作','参与工作','工作内容','负责工作','承担工作','分工','职责','具体分工'],people:['人员','姓名','参与人员','负责人','负责人员','参与人','工作人员','成员']};
 const field=c=>Object.keys(aliases).find(k=>aliases[k].includes(norm(c)));
 function parseDate(cell,year=''){
  let raw=cell&&typeof cell==='object'&&!(cell instanceof Date)?cell.v:cell,s=text(cell),warning='',needsYear=false;
  if(cell instanceof Date&&!isNaN(cell))return {date:cell.toISOString().slice(0,10),warning,needsYear:false};
  if(typeof raw==='number'&&raw>10000&&raw<110000){const d=new Date(Date.UTC(1899,11,30)+Math.floor(raw)*86400000);return {date:d.toISOString().slice(0,10),warning:'按 Excel 日期序列值转换，请核对',needsYear:false};}
  s=s.replace(/年|月/g,'-').replace(/日/g,'').replace(/[./]/g,'-').replace(/\s.*$/,'');
  let parts=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/),y,m,d;
  if(parts){[,y,m,d]=parts;}
  else{parts=s.match(/^(\d{1,2})-(\d{1,2})$/);if(!parts)return {date:'',warning:'日期格式无法可靠识别，请填写完整日期',needsYear:false};[,m,d]=parts;y=String(year||'');if(!/^\d{4}$/.test(y)){needsYear=true;return {date:'',warning:'缺少年份，请设置缺省年份或逐条补全',needsYear};}
   warning='使用你指定的缺省年份';if(typeof raw==='number'&&/^-?\d+\.\d$/.test(text(cell))){return {date:'',warning:'数字小数可能丢失末尾的 0（如 9.2 / 9.20），请核对并手动确认日期',needsYear:false};}
  }
  const date=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  if(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||+y<1900||+y>2200)return {date:'',warning:'日期不合法，请核对',needsYear:false};
  return {date,warning,needsYear};
 }
 function analyze(sheets,options={}){
  const records=[],skipped=[],unrecognized=[];
  for(const sheet of sheets){if(sheet.hidden&&!options.includeHidden){skipped.push({sheet:sheet.name,reason:'隐藏工作表，默认不导入'});continue;}
   const before=records.length;let mapping=null,carry={title:'',date:null},vertical={};
   const manual=options.mapping?.[sheet.name];
   function add(vals,row,notes=[]){const title=text(vals.title),work=text(vals.work),people=text(vals.people),originalDate=text(vals.date);if(![title,work,people,originalDate].some(Boolean))return;
    const parsed=parseDate(vals.date,options.year);const warnings=[...notes,...(parsed.warning?[parsed.warning]:[])];for(const [name,v] of [['活动名称',title],['具体工作',work],['人员',people]])if(!v)warnings.push(name+'缺失');const cat=text(vals.category);if(cat&&!types()?.normalize(cat))warnings.push('活动类型不在新七项分类中，请选择；原类型：'+cat);records.push({sheet:sheet.name,row,title,work,people,date:parsed.date,originalDate,warnings,include:!!(title&&work&&people&&parsed.date&&(!cat||types()?.normalize(cat))),category:types()?.normalize(vals.category)||(text(vals.category)?'':(types()?.normalize(options.category)||'部门活动')),originalCategory:text(vals.category),location:'',notes:''});
   }
   function flushVertical(row){if(coreFields.filter(k=>vertical[k]!==undefined).length>=3)add(vertical,row,['纵向字段表，请核对字段与人员对应关系']);vertical={};}
   for(let ri=0;ri<sheet.rows.length;ri++){
    if(records.length>=10000)throw new Error('最多识别 10000 条记录，请拆分文件。');
    const row=sheet.rows[ri]||[];if(!row.some(c=>text(c))){carry={title:'',date:null};flushVertical(ri);continue;}
    if(manual){if(ri+1<manual.startRow)continue;const vals={};for(const [k,c]of Object.entries(manual.columns))vals[k]=row[c];if(Object.values(vals).filter(v=>field(v)).length>=3)continue;add(vals,ri+1,['使用手动指定列']);continue;}
    const found={};row.forEach((c,i)=>{const k=field(c);if(k&&found[k]===undefined)found[k]=i;});
    if(Object.keys(found).length>=3){flushVertical(ri);const ci=row.findIndex(categoryField);if(ci>=0)found.category=ci;mapping=found;carry={title:'',date:null};continue;}
    if(!mapping&&(field(row[0])||categoryField(row[0]))&&row.length>=2){const k=field(row[0])||'category';if(vertical[k])flushVertical(ri);vertical[k]=row[1];continue;}
    if(!mapping){skipped.push({sheet:sheet.name,row:ri+1,reason:'表头前的说明行或无法识别的内容'});continue;}
    const vals={};for(const k of [...coreFields,'category'])vals[k]=mapping[k]===undefined?'':row[mapping[k]];
    const first=text(vals.title);if(/^(合计|总计|备注|说明|小计)([：:]|$)/.test(first)){skipped.push({sheet:sheet.name,row:ri+1,reason:'汇总或说明行'});carry={title:'',date:null};continue;}
    if(!text(vals.work)&&!text(vals.people)){skipped.push({sheet:sheet.name,row:ri+1,reason:'没有人员或工作内容的行'});carry={title:'',date:null};continue;}
    const warnings=[];if(!first&&carry.title){vals.title=carry.title;warnings.push('活动名沿用同一连续分组');}
    if(!text(vals.date)&&carry.date&&(!first||first===carry.title)){vals.date=carry.date;warnings.push('日期沿用同一连续分组');}
    carry={title:text(vals.title),date:vals.date};add(vals,ri+1,warnings);
   }
   flushVertical(sheet.rows.length);if(records.length===before)unrecognized.push(sheet.name);
  }
  return {records,skipped,unrecognized,sheets:sheets.map(s=>({name:s.name,hidden:!!s.hidden}))};
 }
 root.ActivityExcel={analyze,parseDate};
})(globalThis);
