/* One activity-type dictionary shared by the page and its Excel worker. */
(function(root){
 const values=Object.freeze(['招聘宣讲','线上宣传','经验分享','指导讲座','就业实践','专项活动','部门活动']);
 const defaultValue='部门活动';
 // Only unambiguous label renames are mapped; other historical types require review.
 const legacy=Object.freeze({'部门工作':'部门活动','交流分享':'经验分享'});
 const normalize=value=>{const s=String(value??'').trim();return values.includes(s)?s:(Object.hasOwn(legacy,s)?legacy[s]:'');};
 const isValid=value=>values.includes(value);
 function populate(select,value=defaultValue){
  const normalized=normalize(value);select.replaceChildren();
  if(!normalized){const placeholder=new Option(value?'请选择活动类型（原：'+String(value)+'）':'请选择活动类型','');placeholder.disabled=true;select.add(placeholder);}
  for(const item of values)select.add(new Option(item,item));
  select.value=normalized;select.required=true;
 }
 root.ActivityCategories=Object.freeze({values,defaultValue,normalize,isValid,populate});
})(globalThis);
