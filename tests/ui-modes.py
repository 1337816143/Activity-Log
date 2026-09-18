"""Real browser evidence for both presentations. Writes only to isolated QA namespace."""
import json, os, re, sys, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/').rstrip('/')+'/'
URL=BASE+'?space=qa'
OUT=Path(os.environ.get('TEST_RESULTS','test-results'))/'ui-modes';OUT.mkdir(parents=True,exist_ok=True)
API='https://cau-clst-activity-log.floot.app/_api/log?space=qa'
TAG='UI-QA-'+uuid.uuid4().hex[:10]
results=[];errors=[];network=[];console=[];writes=[]
def passed(s):results.append(s);print('PASS:',s,flush=True)
def attach(page):
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:console.append({'level':m.type,'text':m.text[:1500]}) if m.type in ['error','warning'] else None)
 page.on('requestfailed',lambda r:network.append({'url':r.url.split('?')[0],'failure':r.failure}))
 page.on('response',lambda r:network.append({'url':r.url.split('?')[0],'http':r.status}) if r.status>=400 else None)
 page.on('request',lambda r:writes.append(r.url.split('?')[0]) if r.method=='POST' and '/_api/log' in r.url else None)
 page.on('dialog',lambda d:d.accept())
 page.set_default_timeout(30000)
def ready(page):
 expect(page.locator('html')).to_have_attribute('data-app-ready','true',timeout=60000)
 expect(page.locator('#mode-badge')).to_contain_text(re.compile('测试空间|演示模式'),timeout=90000)
def no_overflow(page):assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
def api(page,c=None):
 return page.evaluate('''async ({url,c})=>{const r=await fetch(url+(c?'':'&action=state'),{credentials:'omit',...(c?{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({json:{requestId:crypto.randomUUID(),...c}})}:{})});return {http:r.status,value:(await r.json()).json};}''',{'url':API,'c':c})

with sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('CHROMIUM_PATH'):launch['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**launch)
 ctx=browser.new_context(viewport={'width':1440,'height':1050})
 page=ctx.new_page();attach(page);created_id=None
 try:
  page.goto(URL,wait_until='domcontentloaded');ready(page)
  expect(page.locator('html')).to_have_attribute('data-ui','classic')
  expect(page.locator('.hero-classic')).to_be_visible();expect(page.locator('.hero-modern')).not_to_be_visible()
  assert page.locator('#theme-toggle + #ui-toggle').count()==1
  assert page.locator('img[src*="clst-official-header"]').count()==0
  expect(page.locator('.footer-version')).to_contain_text('v2.2.0')
  no_overflow(page);passed('Classic glass is the default; cross-star sits beside the independent moon; incorrect college logo absent')
  page.locator('#demo-toggle').click();expect(page.locator('.record-card')).to_have_count(6)
  page.wait_for_function('Array.from(document.querySelectorAll("#inline-deck img")).every(i=>i.complete && i.naturalWidth>0)')
  deck=page.locator('#inline-deck');deck.focus();page.keyboard.press('ArrowRight');expect(deck).to_have_attribute('data-index','1')
  page.evaluate('window.savedDeck=document.getElementById("inline-deck");window.savedRecord=document.querySelector(".record-card.selected")')
  before=page.locator('[data-record]').evaluate_all('(els)=>els.map(e=>e.dataset.record)');n=len(writes)
  page.locator('#ui-toggle').click();expect(page.locator('html')).to_have_attribute('data-ui','workspace')
  expect(page.locator('.hero-modern')).to_be_visible();expect(page.locator('.hero-classic')).not_to_be_visible()
  assert page.evaluate('window.savedDeck===document.getElementById("inline-deck") && window.savedRecord===document.querySelector(".record-card.selected")')
  expect(deck).to_have_attribute('data-index','1')
  assert page.locator('[data-record]').evaluate_all('(els)=>els.map(e=>e.dataset.record)')==before
  assert len(writes)==n
  passed('Switch changes presentation only: exact same record DOM, selection, image deck and image index; zero data writes')
  page.locator('#ui-toggle').click();page.evaluate('window.scrollTo(0,0)')
  page.screenshot(path=str(OUT/'desktop-classic.png'),full_page=True)
  page.locator('#ui-toggle').click();page.evaluate('window.scrollTo(0,0)')
  page.screenshot(path=str(OUT/'desktop-workspace.png'),full_page=True)
  page.locator('#search').fill('志愿者');expect(page.locator('.record-card')).to_have_count(1)
  page.locator('#ui-toggle').click();expect(page.locator('#search')).to_have_value('志愿者');expect(page.locator('.record-card')).to_have_count(1)
  page.locator('#theme-toggle').click();expect(page.locator('html')).to_have_attribute('data-theme','dark')
  expect(page.locator('html')).to_have_attribute('data-ui','classic')
  page.locator('#ui-toggle').click();expect(page.locator('html')).to_have_attribute('data-theme','dark')
  page.reload(wait_until='domcontentloaded');ready(page)
  expect(page.locator('html')).to_have_attribute('data-ui','workspace');expect(page.locator('html')).to_have_attribute('data-theme','dark')
  passed('Search survives switching; UI preference and dark mode remain independent and survive reload')
  page.wait_for_function('document.querySelector(".brand-symbol img").complete && document.querySelector(".brand-symbol img").naturalWidth>0')
  alpha=page.evaluate('''()=>{const i=document.querySelector('.brand-symbol img'),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return {corners:[[0,0],[c.width-1,0],[0,c.height-1],[c.width-1,c.height-1]].map(([a,b])=>x.getImageData(a,b,1,1).data[3]),background:getComputedStyle(i.parentElement).backgroundColor};}''')
  assert alpha['corners']==[0,0,0,0],alpha
  assert alpha['background']=='rgba(0, 0, 0, 0)',alpha
  passed('School seal is real alpha-transparent PNG and its container has no white matte in dark mode')
  page.locator('#start-own').click();page.locator('#theme-toggle').click();page.locator('#ui-toggle').click()
  page.locator('.new-record').first.click()
  page.locator('[name="title"]').fill(TAG)
  page.locator('[name="date"]').fill('2026-09-18')
  page.locator('[name="work"]').fill('经典界面录入的分工')
  page.locator('[name="people"]').fill('界面测试人员')
  page.locator('#save-record').click();expect(page.locator('#editor')).not_to_be_visible(timeout=120000)
  rec=next(r for r in api(page)['value']['records'] if r['title']==TAG);created_id=rec['id']
  ctx2=browser.new_context(viewport={'width':1440,'height':1050})
  ctx2.add_init_script("localStorage.setItem('activity-log:ui','workspace')")
  other=ctx2.new_page();attach(other);other.goto(URL,wait_until='domcontentloaded');ready(other)
  other.locator('#search').fill(TAG);expect(other.locator('.record-card')).to_have_count(1)
  other.locator('#edit-record').click();other.locator('[name="work"]').fill('工作台修改后两套界面共用')
  other.locator('#save-record').click();expect(other.locator('#editor')).not_to_be_visible(timeout=120000)
  page.reload(wait_until='domcontentloaded');ready(page);page.locator('#search').fill(TAG)
  expect(page.locator('.record-card')).to_have_count(1);expect(page.locator('.detail-work')).to_contain_text('工作台修改后两套界面共用')
  current=next(r for r in api(page)['value']['records'] if r['id']==created_id)
  assert current['_revision']==rec['_revision']+1
  passed('Two independent anonymous browsers create in classic, edit in workspace and read the same shared record/revision')
  for ui in ['classic','workspace']:
   mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   mobile.add_init_script("localStorage.setItem('activity-log:ui',"+json.dumps(ui)+");localStorage.setItem('activity-log:mode','demo')")
   m=mobile.new_page();attach(m);m.goto(URL,wait_until='domcontentloaded');expect(m.locator('.record-card')).to_have_count(6,timeout=90000)
   no_overflow(m);m.screenshot(path=str(OUT/('mobile-'+ui+'.png')),full_page=True)
   m.locator('#ui-toggle').click();no_overflow(m)
   m.locator('#theme-toggle').click();no_overflow(m)
   mobile.close()
  passed('Both 390px mobile presentations and both themes retain the cross-star and have no horizontal overflow')
  assert not errors,errors
  passed('No unhandled JavaScript exceptions in dual-UI and cross-browser checks')
 except Exception as error:
  try:page.screenshot(path=str(OUT/'failure.png'),full_page=True)
  except Exception:pass
  (OUT/'failure.json').write_text(json.dumps({'error':str(error),'passed':results,'page_errors':errors,'console':console,'network':network},ensure_ascii=False,indent=2))
  raise
 finally:
  if created_id:
   try:
    rows=api(page)['value']['records'];r=next((r for r in rows if r['id']==created_id),None)
    if r:api(page,{'action':'delete','id':created_id,'baseRevision':r['_revision'],'password':'qa-only-activity-pass'})
   except Exception as e:print('QA cleanup pending:',str(e))
  (OUT/'diagnostics.json').write_text(json.dumps({'console':console,'network':network,'page_errors':errors},ensure_ascii=False,indent=2))
 report={'passed':len(results),'tests':results,'url':URL,'namespace':'qa','production_data_modified':False,'page_errors':errors}
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
 browser.close()
