/** One category model for forms, filters and import review; never reclassifies stored records. */
export const STANDARD_CATEGORIES = Object.freeze(['招聘宣讲','线上宣传','经验分享','指导讲座','就业实践','专项活动','部门活动']);
export const OTHER_CATEGORY = '其他';
export const CATEGORY_OPTIONS = Object.freeze([...STANDARD_CATEGORIES, OTHER_CATEGORY]);
export const DEFAULT_CATEGORY = '部门活动';
export const MAX_CATEGORY_LENGTH = 50;

export function categoryName(selection, custom = '') {
  const value = selection === OTHER_CATEGORY ? String(custom).trim() || OTHER_CATEGORY : String(selection || OTHER_CATEGORY).trim() || OTHER_CATEGORY;
  if (value.length > MAX_CATEGORY_LENGTH) throw new Error('活动类型名称不能超过 50 个字符。');
  return value;
}
export function categorySelection(value = DEFAULT_CATEGORY) {
  const name = String(value || OTHER_CATEGORY);
  return CATEGORY_OPTIONS.includes(name) ? {selection:name,custom:''} : {selection:OTHER_CATEGORY,custom:name};
}
export function updateCategoryVisibility(form) {
  const other = form.elements.category.value === OTHER_CATEGORY;
  form.querySelector('#category-custom-field').hidden = !other;
  form.elements.category.setAttribute('aria-expanded', String(other));
}
export function setCategoryField(form, value = DEFAULT_CATEGORY, draft = null) {
  // Always rebuild these eight choices, so editing legacy data never pollutes the menu.
  const field = form.elements.category;
  field.replaceChildren(...CATEGORY_OPTIONS.map(name => new Option(name, name)));
  let {selection,custom} = categorySelection(value);
  if (draft && CATEGORY_OPTIONS.includes(draft.categoryChoice) && typeof draft.categoryCustom === 'string') {
    selection = draft.categoryChoice; custom = draft.categoryCustom;
  }
  field.value = selection;
  form.elements.categoryCustom.value = custom;
  updateCategoryVisibility(form);
}
export function readCategoryField(form) {
  return categoryName(form.elements.category.value, form.elements.categoryCustom.value);
}
export function suggestCustomCategories(form, records) {
  const names = [...new Set(records.map(r => r.category).filter(name => typeof name === 'string' && name.trim() && !CATEGORY_OPTIONS.includes(name)))].sort((a,b) => a.localeCompare(b,'zh-CN'));
  form.querySelector('#category-custom-names').replaceChildren(...names.map(name => new Option(name,name)));
}
