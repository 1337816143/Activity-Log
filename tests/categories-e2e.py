"""Category regression checks against the shared QA API only. Never mutate main."""
import json, os, re, sys, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/').rstrip('/')+'/'
URL=BASE+'?space=qa';API='https://cau-clst-activity-log.floot.app/_api/log?space=qa'
OUT=Path(os.environ.get('TEST_RESULTS','test-results'))/'categories';OUT.mkdir(parents=True,exist_ok=True)
NAMES=['招聘宣讲','线上宣传','经验分享','指导讲座','就业实践','专项活动','部门活动','其他']
TAG='CATEGORY-QA-'+uuid.uuid4().hex[:10];CUSTOM='校友访谈-'+TAG[-5:]
passed=[];errors=[];pages=[]
def ok(s):passed.append(s);print('PASS:',s,flush=True)
def setup(p):
 p.on('pageerror',lambda e:errors.append(str(e)));p.on('dialog',lambda d:d.accept());p.set_default_timeout(45000);pages.append(p)
def ready(p):expect(p.locator('#mode-badge')).to_contain_text('测试空间',timeout=90000)
def api(p,c=None):
 return p.evaluate("""async({url,c})=>{const r=await fetch(url+(c?'':'&action=state'),{credentials:'omit',...(c?{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({json:{requestId:crypto.randomUUID(),...c}})}:{})});return {http:r.status,value:(await r.json()).json};}""",{'url':API,'c':c})
def find_record(p,title):return next(r for r in api(p)['value']['records'] if r['title']==title)
with sync_playwright() as pw:
 launch={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('CHROMIUM_PATH'):launch['executable_path']=os.environ['CHROMIUM_PATH']
 browser=pw.chromium.launch(**launch);ctx=browser.new_context(viewport={'width':1440,'height':1050});p=ctx.new_page();setup(p)
 try:
  p.goto(URL,wait_until='domcontentloaded');ready(p);p.locator('.new-record').first.click()
  assert p.locator('[name="category"] option').all_text_contents()==NAMES
  expect(p.locator('[name="category"]')).to_have_value('部门活动');expect(p.locator('#category-custom-field')).not_to_be_visible()
  for name in NAMES[:-1]:
   p.locator('[name="category"]').select_option(name);expect(p.locator('#category-custom-field')).not_to_be_visible()
  p.locator('[name="category"]').select_option('其他');expect(p.locator('#category-custom-field')).to_be_visible()
  p.locator('[name="categoryCustom"]').fill(CUSTOM)
  expect(p.locator('[name="categoryCustom"]')).to_have_attribute('maxlength','50')
  p.locator('[name="title"]').fill(TAG+' custom')
  p.locator('#save-draft').click();expect(p.locator('#form-status')).to_contain_text('已暂存于本机')
  p.screenshot(path=str(OUT/'custom-category-classic.png'),full_page=True)
  p.reload(wait_until='domcontentloaded');ready(p);p.locator('#drafts-open').click()
  p.locator('.draft-row').filter(has_text=TAG+' custom').locator('[data-resume-draft]').click()
  expect(p.locator('[name="category"]')).to_have_value('其他');expect(p.locator('[name="categoryCustom"]')).to_have_value(CUSTOM)
  ok('Eight choices in the requested order; custom field and local draft survive abrupt reload')
  p.locator('#save-cloud-draft').click();expect(p.locator('#form-status')).to_contain_text('草稿已在共享库保存',timeout=120000)
  p.locator('#close-editor').click();expect(p.locator('#editor')).not_to_be_visible()
  c2=browser.new_context(viewport={'width':1440,'height':1050});c2.add_init_script("localStorage.setItem('activity-log:ui','workspace')")
  q=c2.new_page();setup(q);q.goto(URL,wait_until='domcontentloaded');ready(q);q.locator('#drafts-open').click()
  q.locator('.draft-row').filter(has_text=TAG+' custom').locator('[data-resume-draft]').click()
  expect(q.locator('[name="category"]')).to_have_value('其他');expect(q.locator('[name="categoryCustom"]')).to_have_value(CUSTOM)
  q.locator('[name="date"]').fill('2026-09-19');q.locator('[name="work"]').fill('分类回归测试，仅测试空间');q.locator('[name="people"]').fill('测试人员')
  q.locator('#save-record').click();expect(q.locator('#editor')).not_to_be_visible(timeout=120000)
  rec=find_record(q,TAG+' custom');assert rec['category']==CUSTOM
  q.locator('#search').fill(TAG+' custom');expect(q.locator('.record-card')).to_have_count(1);expect(q.locator('.category-chip')).to_have_text(CUSTOM)
  q.locator('#category-filter').select_option(CUSTOM);expect(q.locator('.record-card')).to_have_count(1)
  q.locator('#ui-toggle').click();expect(q.locator('.category-chip')).to_have_text(CUSTOM)
  q.locator('#edit-record').click();expect(q.locator('[name="categoryCustom"]')).to_have_value(CUSTOM)
  q.locator('[name="category"]').select_option('就业实践');q.locator('#save-record').click();expect(q.locator('#editor')).not_to_be_visible(timeout=120000)
  assert find_record(q,TAG+' custom')['category']=='就业实践'
  ok('Team draft restored in an independent browser; custom type saves, filters, switches UI and can be changed to a preset')
  rows=[]
  for i,name in enumerate(NAMES[:-1]+['会议培训']):
   rows.append({'id':str(uuid.uuid4()),'title':TAG+' preset '+str(i),'date':'2026-09-19','work':'类型展示测试','people':['测试人员'],'category':name,'attachments':[]})
  res=api(q,{'action':'import','records':rows});assert res['http']==200,res
  q.reload(wait_until='domcontentloaded');ready(q);q.locator('#search').fill(TAG+' preset');expect(q.locator('.record-card')).to_have_count(8)
  assert set(q.locator('.category-chip').all_text_contents())==set(NAMES[:-1]+['会议培训'])
  q.locator('#category-filter').select_option('会议培训');expect(q.locator('.record-card')).to_have_count(1);q.locator('#edit-record').click()
  expect(q.locator('[name="category"]')).to_have_value('其他');expect(q.locator('[name="categoryCustom"]')).to_have_value('会议培训')
  assert q.locator('[name="category"] option').all_text_contents()==NAMES
  q.locator('[name="notes"]').fill('只改备注，不重分类');q.locator('#save-record').click();expect(q.locator('#editor')).not_to_be_visible(timeout=120000)
  assert find_record(q,TAG+' preset 7')['category']=='会议培训'
  ok('All seven preset chips render and legacy categories survive edit/save without being erased or reclassified')
  q.locator('#search').fill(TAG+' custom');expect(q.locator('.record-card')).to_have_count(1);q.locator('#edit-record').click()
  q.locator('[name="category"]').select_option('其他');q.locator('[name="categoryCustom"]').fill('  ');q.locator('#save-record').click();expect(q.locator('#editor')).not_to_be_visible(timeout=120000)
  assert find_record(q,TAG+' custom')['category']=='其他'
  q.locator('#edit-record').click();q.locator('[name="categoryCustom"]').fill('<b>校友 & 企业</b>');q.locator('#save-record').click();expect(q.locator('#editor')).not_to_be_visible(timeout=120000)
  q.locator('#search').fill(TAG+' custom');expect(q.locator('.record-card')).to_have_count(1);expect(q.locator('.category-chip')).to_have_text('<b>校友 & 企业</b>');assert q.locator('.category-chip b').count()==0
  ok('Empty custom name remains Other; HTML-like names are treated as literal text, not injected markup')
  q.locator('#excel-open').click()
  csv='\ufeff活动名称,活动时间,参与具体工作,人员,活动类型\n'+TAG+' import,2025-09-18,整理,测试人员,校友访谈\n'+TAG+' import2,2025-09-18,宣传,测试人员,\n'
  q.locator('#excel-file').set_input_files({'name':'categories.csv','mimeType':'text/csv','buffer':csv.encode()})
  expect(q.locator('.import-table tbody tr')).to_have_count(2)
  expect(q.locator('[data-field="category"]').nth(0)).to_have_value('校友访谈');expect(q.locator('[data-field="category"]').nth(1)).to_have_value('其他')
  q.locator('[data-field="category"]').nth(1).fill('指导讲座');q.locator('[data-field="category"]').nth(0).click()
  q.locator('#excel-confirm').check();q.locator('#excel-import').click();expect(q.locator('#excel-status')).to_contain_text('新增 2 条',timeout=120000)
  assert find_record(q,TAG+' import')['category']=='校友访谈';assert find_record(q,TAG+' import2')['category']=='指导讲座'
  q.locator('#excel-modal .modal-close').click();ok('Actual CSV worker preserves a named type, leaves missing types as Other and saves reviewed preset/custom labels')
  mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  m=mobile.new_page();setup(m);m.goto(URL,wait_until='domcontentloaded');ready(m);m.locator('.new-record').first.click()
  m.locator('[name="category"]').select_option('其他');m.locator('[name="categoryCustom"]').fill('类'*50)
  assert not m.evaluate('document.documentElement.scrollWidth>innerWidth')
  m.screenshot(path=str(OUT/'custom-category-mobile.png'),full_page=True)
  assert not errors,errors;ok('390px custom category form fits without horizontal overflow; no uncaught page exceptions')
 except Exception as e:
  try:pages[-1].screenshot(path=str(OUT/'failure.png'),full_page=True)
  except Exception:pass
  (OUT/'failure.json').write_text(json.dumps({'error':str(e),'passed':passed,'page_errors':errors},ensure_ascii=False,indent=2));raise
 finally:
  try:
   state=api(p)['value']
   for r in state['records']:
    if r.get('title','').startswith(TAG):api(p,{'action':'delete','id':r['id'],'baseRevision':r['_revision'],'password':'qa-only-activity-pass'})
   for d in state['drafts']:
    if d.get('title','').startswith(TAG):api(p,{'action':'discardDraft','id':d['id'],'baseRevision':d['_revision']})
  except Exception as e:print('QA cleanup pending:',str(e))
  browser.close()
 report={'passed':len(passed),'tests':passed,'url':URL,'namespace':'qa','production_writes':0,'page_errors':errors}
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
