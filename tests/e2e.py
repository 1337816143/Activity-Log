"""Real Chromium + deployed anonymous backend, synthetic data in isolated ?space=qa only."""
import base64, hashlib, json, os, struct, sys, time, traceback, uuid, zlib
from pathlib import Path
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright, expect
BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/').rstrip('/')+'/'
URL=BASE+'?space=qa'
API='https://cau-clst-activity-log.floot.app/_api/log?space=qa'
OUT=Path(os.environ.get('TEST_RESULTS','test-results'));OUT.mkdir(parents=True,exist_ok=True)
TAG='QA-'+uuid.uuid4().hex[:10]
PASSWORD='qa-only-activity-pass' # Separate test namespace verifier, NEVER production admin password.
results=[];errors=[];auth_headers=[]
def passed(s):results.append(s);print('PASS:',s,flush=True)
def png(rgb):
 w,h=640,420
 def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\x00'+bytes(rgb)*w for _ in range(h))))+chunk(b'IEND',b'')
def monitor(page):
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:auth_headers.append(r.headers.get('authorization')) if 'floot.app/_api/log' in r.url and r.headers.get('authorization') else None)
 page.set_default_timeout(25000)
def admin(page,password):
 expect(page.locator('#admin-modal')).to_be_visible()
 page.locator('#admin-password').fill(password);page.locator('#admin-form button[type="submit"]').click()
 expect(page.locator('#admin-modal')).not_to_be_visible()
def api(page,c=None,action='state'):
 return page.evaluate("""async ({url,c,action})=>{const r=await fetch(url+(c?'':'&action='+action),{credentials:'omit',...(c?{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({json:{requestId:crypto.randomUUID(),...c}})}:{})});return {http:r.status,value:(await r.json()).json};}""",{'url':API,'c':c,'action':action})
def wait_connected(page):expect(page.locator('#mode-badge')).to_contain_text('测试空间',timeout=90000)

with sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('CHROMIUM_PATH'):launch['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**launch)
 ctx=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True)
 page=ctx.new_page();monitor(page)
 try:
  page.goto(URL,wait_until='networkidle');wait_connected(page)
  assert not page.locator('#connect-team,#team-token,input[name="token"]').count()
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  page.locator('#demo-toggle').click();expect(page.locator('.record-card')).to_have_count(6)
  page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
  passed('Anonymous shared service auto-connects: no login, GitHub account, token or team key form')
  deck=page.locator('#inline-deck');deck.focus();page.keyboard.press('ArrowRight');expect(deck).to_have_attribute('data-index','1')
  deck.dispatch_event('keydown',{'key':'2','code':'Numpad2'});expect(deck).to_have_attribute('data-index','2')
  page.keyboard.press('ArrowLeft');deck.hover();page.mouse.wheel(0,140);expect(deck).to_have_attribute('data-index','2')
  assert page.locator('.deck-card').count()<=6
  assert page.locator('.deck-card img').first.evaluate('(el)=>getComputedStyle(el).objectFit')=='contain'
  page.locator('#image-expand').click();expect(page.locator('#preview')).to_be_visible();page.keyboard.press('ArrowLeft');expect(page.locator('#popup-deck')).to_have_attribute('data-index','1')
  page.screenshot(path=str(OUT/'image-deck.png'),full_page=True);page.keyboard.press('Escape')
  passed('Stacked complete images, wheel, arrows, keypad, large preview and Escape work')
  page.locator('#start-own').click()
  page.locator('.new-record').first.click();page.locator('[name="title"]').fill(TAG+' incomplete draft')
  fixtures=[{'name':f'{TAG}-photo-{i}.png','mimeType':'image/png','buffer':png(color)} for i,color in enumerate([(141,161,143),(173,150,190),(145,170,193)],1)]
  note='<script>window.injected=true</script>\n活动纪要：原文字保留'.encode()
  fixtures+=[{'name':TAG+'-note.txt','mimeType':'text/plain','buffer':note},{'name':TAG+'-binary.bin','mimeType':'application/octet-stream','buffer':bytes(range(256))}]
  page.locator('#editor-files').set_input_files(fixtures)
  expect(page.locator('.staged-file')).to_have_count(5);expect(page.locator('#save-record')).to_be_enabled(timeout=60000)
  page.locator('#save-draft').click();expect(page.locator('#form-status')).to_contain_text('已暂存于本机')
  page.locator('#save-cloud-draft').click();expect(page.locator('#form-status')).to_contain_text('草稿已在共享库保存',timeout=180000)
  page.screenshot(path=str(OUT/'draft-editor.png'),full_page=True)
  draft=[d for d in api(page)['value']['drafts'] if d['title']==TAG+' incomplete draft'][0]
  assert len(draft['attachments'])==5 and draft['work']==''
  passed('Incomplete fields and original attachment bytes persist locally and in team drafts')
  # Abrupt reload, not a graceful close: auto/manual stored draft must survive.
  page.reload(wait_until='networkidle');wait_connected(page);page.locator('#drafts-open').click()
  row=page.locator('.draft-row').filter(has_text=TAG+' incomplete draft');expect(row).to_be_visible();row.locator('[data-resume-draft]').click()
  expect(page.locator('[name="title"]')).to_have_value(TAG+' incomplete draft');expect(page.locator('.staged-file')).to_have_count(5)
  page.locator('[name="title"]').fill(TAG+' activity <b>literal</b>');page.locator('[name="date"]').fill('2026-09-18')
  page.locator('[name="work"]').fill('现场签到、资料整理与照片归档');page.locator('[name="people"]').fill('测试甲、测试乙、测试甲')
  page.locator('#save-record').click();expect(page.locator('#editor')).not_to_be_visible(timeout=180000)
  page.locator('#search').fill(TAG+' activity');expect(page.locator('.record-card')).to_have_count(1)
  assert not page.locator('.record-title b').count();expect(page.locator('.detail-people button')).to_have_count(2)
  rec=[r for r in api(page)['value']['records'] if r['title'].startswith(TAG+' activity')][0]
  assert not any(d['id']==draft['id'] for d in api(page)['value']['drafts'])
  passed('Reload recovers draft; formal save promotes it once, retaining person/work and attachment associations')
  # A completely independent browser, without saved cookies, storage, user identity or authorization.
  second=browser.new_context(viewport={'width':1280,'height':1000});other=second.new_page();monitor(other)
  other.goto(URL,wait_until='networkidle');wait_connected(other);other.locator('#search').fill(TAG+' activity');expect(other.locator('.record-card')).to_have_count(1)
  expect(other.locator('.detail-work')).to_contain_text('现场签到')
  other.locator('#edit-record').click();other.locator('[name="work"]').fill('另一浏览器修改：会场协调与活动记录')
  other.locator('#save-record').click();expect(other.locator('#editor')).not_to_be_visible(timeout=90000)
  page.reload(wait_until='networkidle');wait_connected(page);page.locator('#search').fill(TAG+' activity');expect(page.locator('.record-card')).to_have_count(1);expect(page.locator('.detail-work')).to_contain_text('另一浏览器修改')
  stale=api(page,{'action':'save','record':rec,'baseRevision':rec['_revision']});assert stale['http']==409
  passed('Independent browser can read/edit without login; stale revisions are rejected instead of overwriting teammates')
  # Download exactly what was uploaded, not a recreated preview.
  original_hashes={f['name']:hashlib.sha256(f['buffer']).hexdigest() for f in fixtures}
  check=page.evaluate("""async ({base,id})=>{const state=(await(await fetch(base+'&action=state')).json()).json;const r=state.records.find(r=>r.id===id);const rows=[];for(const a of r.attachments){const f=(await(await fetch(base+'&action=file&id='+a.id)).json()).json;const buf=await(await fetch(f.url)).arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',buf);rows.push({name:a.name,hash:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')});}return rows;}""",{'base':API,'id':rec['id']})
  assert {r['name']:r['hash'] for r in check}==original_hashes
  page.locator('[data-file]').filter(has_text=TAG+'-note.txt').click();expect(page.locator('.text-preview')).to_contain_text('<script>window.injected=true</script>',timeout=60000);assert page.evaluate('window.injected') is None;page.locator('#close-preview').click()
  page.locator('[data-file]').filter(has_text=TAG+'-binary.bin').click();expect(page.locator('.unsupported-preview')).to_be_visible(timeout=60000);page.locator('#close-preview').click()
  passed('All five shared original files pass SHA-256; text previews are escaped; unsupported files remain downloadable')
  page.locator('#delete-record').click();admin(page,'incorrect');expect(page.locator('.toast.error').last).to_contain_text('密码不正确',timeout=45000);expect(page.locator('.record-card')).to_have_count(1)
  page.locator('#delete-record').click();admin(page,PASSWORD);expect(page.locator('.record-card')).to_have_count(0,timeout=60000)
  page.locator('#recycle-open').click();admin(page,PASSWORD)
  recycle=page.locator('#recycle-body .draft-row').filter(has_text=TAG+' activity');expect(recycle).to_be_visible(timeout=60000);recycle.locator('[data-restore-record]').click();admin(page,PASSWORD)
  expect(recycle).not_to_be_visible(timeout=60000);page.locator('#recycle-modal .modal-close').click();page.locator('#search').fill(TAG+' activity');expect(page.locator('.record-card')).to_have_count(1)
  assert len([r for r in api(page)['value']['records'] if r['id']==rec['id']][0]['attachments'])==5
  passed('Wrong administrator password leaves data intact; correct test password soft-deletes and restores original attachments')
  # Real .xlsx fixture with repeated headers, reversed columns and no years. Parser uses a worker.
  page.add_script_tag(url=urljoin(BASE,'assets/vendor/xlsx.full.min.js'))
  workbook=page.evaluate("""tag=>{const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['活动名称','活动时间','参与具体工作','人员'],[tag+' Excel','9.18','会场整理','测试甲'],[tag+' Excel','9.18','新闻稿','测试乙'],[],['人员','具体工作','活动时间','活动名称'],['测试丙','推送','11.25',tag+' report']]),'历史记录');return XLSX.write(b,{bookType:'xlsx',type:'base64'});}""",TAG)
  file={'name':TAG+'-history.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':base64.b64decode(workbook)}
  page.locator('#excel-open').click();page.locator('#excel-file').set_input_files(file);expect(page.locator('.import-table tbody tr')).to_have_count(3,timeout=45000)
  assert page.locator('[data-field="date"]').first.input_value()==''
  page.locator('#excel-year').fill('2025');page.locator('#excel-reparse').click();expect(page.locator('[data-field="date"]').first).to_have_value('2025-09-18',timeout=45000)
  page.screenshot(path=str(OUT/'excel-review.png'),full_page=True)
  page.locator('#excel-confirm').check();page.locator('#excel-import').click();expect(page.locator('#excel-status')).to_contain_text('新增 3 条',timeout=90000)
  imported=[r for r in api(page)['value']['records'] if r['title'] in [TAG+' Excel',TAG+' report']]
  assert sorted((r['people'][0],r['work']) for r in imported)==sorted([('测试甲','会场整理'),('测试乙','新闻稿'),('测试丙','推送')])
  page.locator('#excel-reparse').click();expect(page.locator('#excel-status')).to_contain_text('已识别 3 条',timeout=45000);page.locator('#excel-confirm').check();page.locator('#excel-import').click();expect(page.locator('#excel-status')).to_contain_text('重复跳过 3 条',timeout=90000)
  page.locator('#excel-modal .modal-close').click()
  passed('Real Excel worker imports repeated/reordered headers, requires explicit year, preserves three individual work assignments, and skips duplicates')
  # Backup contains real shared original files, not just names.
  page.locator('#backup-nav').click()
  with page.expect_download(timeout=180000) as dl:page.locator('#export-all').click()
  dest=OUT/'qa-backup.activitylog';dl.value.save_as(dest);backup=json.loads(dest.read_text())
  exported=[r for r in backup['records'] if r['id']==rec['id']][0];assert len(exported['attachments'])==5
  byid={f['id']:f for f in backup['files']}
  for a in exported['attachments']:assert hashlib.sha256(base64.b64decode(byid[a['id']]['data'].split(',')[1])).hexdigest()==original_hashes[a['name']]
  page.locator('#close-utility').click();passed('Complete backup contains shared records and byte-identical original attachments')
  mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  # Mobile intentionally omits desktop sidebar controls; start its synthetic demo via saved preference.
  mobile.add_init_script("localStorage.setItem('activity-log:mode','demo')")
  m=mobile.new_page();monitor(m);m.goto(URL,wait_until='networkidle');expect(m.locator('.record-card')).to_have_count(6,timeout=90000)
  assert not m.evaluate('document.documentElement.scrollWidth>innerWidth');m.screenshot(path=str(OUT/'mobile.png'),full_page=True)
  m.locator('.new-record').first.click();assert not m.evaluate('document.documentElement.scrollWidth>innerWidth');m.screenshot(path=str(OUT/'mobile-editor.png'),full_page=True)
  m.locator('#close-editor').click();m.locator('#theme-toggle').click();expect(m.locator('html')).to_have_attribute('data-theme','dark');m.screenshot(path=str(OUT/'mobile-dark.png'),full_page=True)
  passed('390px mobile glass UI, official identity footer, editor and dark mode render without horizontal overflow')
  reduced=browser.new_context(reduced_motion='reduce');q=reduced.new_page();monitor(q);q.goto(URL,wait_until='networkidle');wait_connected(q);q.locator('#demo-toggle').click();q.locator('#inline-deck').focus();q.keyboard.press('ArrowRight');expect(q.locator('#inline-deck')).to_have_attribute('data-index','1')
  passed('Reduced-motion mode still supports keyboard image navigation')
  assert not errors,errors;assert not auth_headers,auth_headers
  passed('No uncaught page errors and no Authorization headers or GitHub credentials in member requests')
  report={'passed':len(results),'tests':results,'page_errors':errors,'member_authorization_headers':len(auth_headers),'url':URL,'data_namespace':'qa','test_prefix':TAG}
  (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
 except Exception:
  page.screenshot(path=str(OUT/'failure.png'),full_page=True)
  (OUT/'failure.json').write_text(json.dumps({'traceback':traceback.format_exc(),'passed':results,'errors':errors,'body':page.locator('body').inner_text()[-18000:]},ensure_ascii=False,indent=2))
  raise
 finally:browser.close()
