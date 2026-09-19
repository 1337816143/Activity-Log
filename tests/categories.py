"""Verify fixed activity types using the real app and shared QA service only."""
import json, os, sys, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/').rstrip('/')+'/'
URL=BASE+'?space=qa'
API='https://cau-clst-activity-log.floot.app/_api/log?space=qa'
OUT=Path(os.environ.get('TEST_RESULTS','test-results'))/'categories';OUT.mkdir(parents=True,exist_ok=True)
TYPES=['招聘宣讲','线上宣传','经验分享','指导讲座','就业实践','专项活动','部门活动']
TAG='CATEGORY-QA-'+uuid.uuid4().hex[:10]
results=[];errors=[]
def passed(s):results.append(s);print('PASS:',s,flush=True)
def choices(page,selector):return page.locator(selector+' option').evaluate_all('(rows)=>rows.filter(r=>!r.disabled&&r.value).map(r=>r.value)')
def connected(page):expect(page.locator('#mode-badge')).to_contain_text('测试空间',timeout=90000)
def api(page,c=None):
 return page.evaluate('''async ({url,c})=>{const r=await fetch(url+(c?'':'&action=state'),{credentials:'omit',...(c?{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({json:{requestId:crypto.randomUUID(),...c}})}:{})});return {http:r.status,value:(await r.json()).json};}''',{'url':API,'c':c})
with sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('CHROMIUM_PATH'):launch['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**launch)
 context=browser.new_context(viewport={'width':1440,'height':1050})
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.set_default_timeout(45000)
 try:
  page.goto(URL,wait_until='domcontentloaded');connected(page)
  expect(page.locator('.footer-version')).to_contain_text('v2.2.1')
  for ui in ['classic','workspace']:
   if page.locator('html').get_attribute('data-ui')!=ui:page.locator('#ui-toggle').click()
   assert choices(page,'#category-filter')==TYPES
   page.locator('.new-record').first.click()
   assert choices(page,'select[name="category"]')==TYPES
   expect(page.locator('[name="category"]')).to_have_value('部门活动')
   page.locator('#close-editor').click()
  passed('Both interfaces have exactly the seven requested types in order, with the same editor and filter')
  for n,category in enumerate(TYPES):
   page.locator('.new-record').first.click()
   for name,value in [('title',TAG+'-'+str(n)),('date','2026-09-18'),('work','类别一致性测试'),('people','测试人员')]:page.locator('[name="'+name+'"]').fill(value)
   page.locator('[name="category"]').select_option(category)
   page.locator('#save-record').click();expect(page.locator('#editor')).not_to_be_visible(timeout=90000)
  page.reload(wait_until='domcontentloaded');connected(page);page.locator('#search').fill(TAG)
  expect(page.locator('.record-card')).to_have_count(7)
  for category in TYPES:
   page.locator('#category-filter').select_option(category);expect(page.locator('.record-card')).to_have_count(1)
   expect(page.locator('.category-chip')).to_have_text(category)
  rows=[r for r in api(page)['value']['records'] if r['title'].startswith(TAG+'-')]
  assert sorted(r['category'] for r in rows)==sorted(TYPES)
  passed('Each of seven types saves to the real shared service, survives reload and filters correctly')
  page.locator('#category-filter').select_option('部门活动');page.locator('#edit-record').click()
  assert choices(page,'select[name="category"]')==TYPES
  page.locator('[name="category"]').select_option('招聘宣讲');page.locator('#save-record').click();expect(page.locator('#editor')).not_to_be_visible(timeout=90000)
  after=[r for r in api(page)['value']['records'] if r['id']==next(r['id'] for r in rows if r['category']=='部门活动')][0]
  assert after['category']=='招聘宣讲' and after['work']=='类别一致性测试'
  passed('Editing the category keeps the same record and all its other content')
  page.locator('#excel-open').click()
  assert choices(page,'#excel-category')==TYPES
  page.locator('#excel-category').select_option('就业实践')
  csv=('活动名称,活动时间,参与具体工作,人员,活动类型\n'+TAG+' Excel A,2025-09-18,新闻稿,测试甲,线上宣传\n'+TAG+' Excel B,2025-09-19,实践分工,测试乙,\n').encode('utf-8-sig')
  page.locator('#excel-file').set_input_files({'name':'category-fixture.csv','mimeType':'text/csv','buffer':csv})
  expect(page.locator('.import-table tbody tr')).to_have_count(2)
  expect(page.locator('[data-field="category"]').nth(0)).to_have_value('线上宣传')
  expect(page.locator('[data-field="category"]').nth(1)).to_have_value('就业实践')
  assert choices(page,'select[data-field="category"][data-row-index="0"]')==TYPES
  page.locator('[data-field="category"]').nth(1).select_option('专项活动')
  page.screenshot(path=str(OUT/'excel-categories.png'),full_page=True)
  page.locator('#excel-confirm').check();page.locator('#excel-import').click()
  expect(page.locator('#excel-status')).to_contain_text('新增 2 条',timeout=90000)
  imported={r['title']:r for r in api(page)['value']['records'] if r['title'].startswith(TAG+' Excel')}
  assert imported[TAG+' Excel A']['category']=='线上宣传'
  assert imported[TAG+' Excel B']['category']=='专项活动'
  passed('Import preserves valid source types, fills absent types from selected default, and saves per-row corrections')
  page.locator('#excel-modal .modal-close').click()
  page.locator('#search').fill('');page.locator('#category-filter').select_option('');page.locator('#demo-toggle').click()
  expect(page.locator('.record-card')).to_have_count(6)
  assert choices(page,'#category-filter')==TYPES
  page.locator('#category-filter').select_option('经验分享');expect(page.locator('.record-card')).to_have_count(1)
  assert page.locator('.category-chip').inner_text()=='经验分享'
  page.locator('#category-filter').select_option('');page.screenshot(path=str(OUT/'seven-types.png'),full_page=True)
  passed('All six original examples remain, and their types use the new choices without adding obsolete filter options')
  assert not errors,errors
  passed('No uncaught browser exceptions during category operations')
 except Exception as e:
  try:page.screenshot(path=str(OUT/'failure.png'),full_page=True)
  except Exception:pass
  (OUT/'failure.json').write_text(json.dumps({'error':str(e),'passed':results,'page_errors':errors},ensure_ascii=False,indent=2))
  raise
 finally:
  try:
   for r in api(page)['value']['records']:
    if r['title'].startswith(TAG):
     result=api(page,{'action':'delete','id':r['id'],'baseRevision':r['_revision'],'password':'qa-only-activity-pass'})
     assert result['http']==200,result
  except Exception as e:print('Isolated QA cleanup pending:',str(e))
  browser.close()
 (OUT/'report.json').write_text(json.dumps({'passed':len(results),'tests':results,'url':URL,'data_namespace':'qa','production_records_modified':False,'page_errors':errors},ensure_ascii=False,indent=2))
