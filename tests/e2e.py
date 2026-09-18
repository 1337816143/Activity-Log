"""Real HTTP origin, real IndexedDB, ephemeral browser profiles only.
Install: pip install playwright; python -m playwright install --with-deps chromium
Run a static server, then: python tests/e2e.py [base-url]
"""
import hashlib, json, os, struct, sys, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
OUT=Path(os.environ.get('TEST_RESULTS','test-results'));OUT.mkdir(parents=True,exist_ok=True)
results=[]
def passed(name):
    results.append(name); print('PASS:', name, flush=True)
def png(rgb):
    w,h=640,420
    def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
    raw=b''.join(b'\x00'+bytes(rgb)*w for _ in range(h))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')

with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH')
    launch={'headless':True,'args':['--no-sandbox']}
    if executable:launch['executable_path']=executable
    browser=p.chromium.launch(**launch)
    context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
    page=context.new_page();errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    page.on('dialog',lambda d:d.accept())
    page.goto(BASE,wait_until='networkidle')
    expect(page.locator('.record-card')).to_have_count(6)
    page.screenshot(path=str(OUT/'desktop-demo.png'),full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    passed('Desktop renders six clearly labeled fictional examples; no horizontal overflow')
    deck=page.locator('#inline-deck');deck.focus();page.keyboard.press('ArrowRight')
    expect(deck).to_have_attribute('data-index','1')
    deck.dispatch_event('keydown',{'key':'2','code':'Numpad2'})
    expect(deck).to_have_attribute('data-index','2')
    page.keyboard.press('ArrowLeft');expect(deck).to_have_attribute('data-index','1')
    deck.hover();page.mouse.wheel(0,130);expect(deck).to_have_attribute('data-index','2')
    assert page.locator('.deck-card').count()<=6
    assert page.locator('.deck-card img').first.evaluate('(el)=>getComputedStyle(el).objectFit')=='contain'
    passed('Arrow keys, keypad, real mouse wheel, bounded card layers, uncropped image layout')
    page.locator('#image-expand').click();expect(page.locator('#preview')).to_be_visible()
    page.keyboard.press('ArrowLeft');expect(page.locator('#popup-deck')).to_have_attribute('data-index','1')
    page.screenshot(path=str(OUT/'image-deck.png'),full_page=True)
    page.keyboard.press('Escape');expect(page.locator('#preview')).not_to_be_visible()
    passed('Large-image modal keyboard navigation and Escape close')
    page.locator('#search').fill('志愿者');expect(page.locator('.record-card')).to_have_count(1)
    page.locator('#search').fill('');expect(page.locator('.record-card')).to_have_count(6)
    page.locator('#category-filter').select_option('会议培训');expect(page.locator('.record-card')).to_have_count(1)
    page.locator('#category-filter').select_option('')
    page.locator('[data-view="timeline"]').click();expect(page.locator('.timeline-month')).to_have_count(2)
    page.locator('[data-view="media"]').click();expect(page.locator('.media-tile')).to_have_count(13)
    page.locator('[data-view="people"]').click();expect(page.locator('.people-card')).to_have_count(5)
    page.locator('[data-view="all"]').click()
    page.locator('[data-layout="table"]').click();expect(page.locator('tbody tr')).to_have_count(6)
    page.locator('[data-layout="cards"]').click()
    passed('Search, categories, timeline, attachment library, people, cards/table work')
    page.locator('#start-own').click();expect(page.locator('.record-card')).to_have_count(0)
    page.locator('.new-record').first.click()
    page.locator('[name="title"]').fill('端到端测试活动 <b>原样文字</b>')
    page.locator('[name="date"]').fill('2026-09-18')
    page.locator('[name="work"]').fill('负责现场签到、活动策划与照片归档。')
    page.locator('[name="people"]').fill('测试甲、测试乙、测试甲')
    page.locator('[name="location"]').fill('测试会场')
    fixtures=[{'name':f'现场照片{i}.png','mimeType':'image/png','buffer':png(color)} for i,color in enumerate([(151,174,152),(177,154,192),(170,184,200)],1)]
    text='活动纪要\n<script>window.injected=true</script>\n保留原始文字'.encode()
    fixtures.append({'name':'活动纪要.txt','mimeType':'text/plain','buffer':text})
    fixtures.append({'name':'归档数据.bin','mimeType':'application/octet-stream','buffer':bytes(range(256))})
    page.locator('#editor-files').set_input_files(fixtures)
    expect(page.locator('.staged-file')).to_have_count(5)
    expect(page.locator('#save-record')).to_be_enabled()
    page.locator('#save-record').click();expect(page.locator('#editor')).not_to_be_visible()
    expect(page.locator('.record-card')).to_have_count(1)
    expect(page.locator('.detail-people button')).to_have_count(2)
    assert not page.locator('.record-title b').count()
    assert page.locator('#demo-banner').is_hidden()
    passed('Real record and five original attachments saved; deduplicated people; safe text rendering')
    page.reload(wait_until='networkidle');expect(page.locator('.record-card')).to_have_count(1)
    stored=page.evaluate("""async()=>{const s=await import('./assets/store.js');const rs=await s.allRecords();return Promise.all(rs[0].attachments.map(async a=>{const f=await s.getFile(a.id);const digest=await crypto.subtle.digest('SHA-256',await f.blob.arrayBuffer());return {name:a.name,hash:Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('')};}));}""")
    expected={f['name']:hashlib.sha256(f['buffer']).hexdigest() for f in fixtures}
    assert {f['name']:f['hash'] for f in stored}==expected
    passed('Reload preserves record and all original attachment bytes (SHA-256 verified)')
    page.locator('[data-file]').filter(has_text='活动纪要.txt').click()
    expect(page.locator('.text-preview')).to_contain_text('<script>window.injected=true</script>')
    assert page.evaluate('window.injected') is None
    page.locator('#close-preview').click()
    page.locator('[data-file]').filter(has_text='归档数据.bin').click()
    expect(page.locator('.unsupported-preview')).to_be_visible()
    page.locator('#close-preview').click()
    passed('Plain text safely previews; unsupported file honestly offers download')
    page.locator('.record-star').click();expect(page.locator('.record-star')).to_have_class('record-star on')
    page.locator('[data-view="starred"]').click();expect(page.locator('.record-card')).to_have_count(1)
    page.locator('[data-view="all"]').click()
    page.locator('#edit-record').click();page.locator('[name="work"]').fill('更新后的具体工作：场地协调、签到和摄影。')
    page.locator('#save-record').click();expect(page.locator('#editor')).not_to_be_visible()
    expect(page.locator('.detail-work')).to_contain_text('更新后的具体工作')
    page.locator('#search').fill('活动纪要');expect(page.locator('.record-card')).to_have_count(1)
    page.locator('#search').fill('根本不存在的关键词');expect(page.locator('.record-card')).to_have_count(0)
    page.locator('[data-clear]').click();expect(page.locator('.record-card')).to_have_count(1)
    passed('Edit, star and attachment-name search persist and filter accurately')
    page.locator('#backup-nav').click();expect(page.locator('#utility')).to_be_visible()
    with page.expect_download() as dl:
        page.locator('#export-all').click()
    backup=OUT/'fixture.activitylog';dl.value.save_as(backup)
    payload=json.loads(backup.read_text());assert len(payload['records'])==1 and len(payload['files'])==5
    assert payload['records'][0]['work'].startswith('更新后的')
    passed('Complete backup downloads metadata and all original files')
    other=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
    restore=other.new_page();restore.on('pageerror',lambda e:errors.append(str(e)));restore.on('dialog',lambda d:d.accept())
    restore.goto(BASE,wait_until='networkidle');restore.locator('#backup-nav').click()
    restore.locator('#import-file').set_input_files(str(backup))
    expect(restore.locator('#utility')).not_to_be_visible(timeout=15000)
    expect(restore.locator('.record-card')).to_have_count(1)
    count=restore.evaluate("async()=>{const s=await import('./assets/store.js');const r=(await s.allRecords())[0];const f=await s.getFile(r.attachments[4].id);return {n:r.attachments.length,bytes:Array.from(new Uint8Array(await f.blob.arrayBuffer()))};}")
    assert count['n']==5 and count['bytes']==list(range(256))
    passed('Full backup restores into an independent browser profile without losing binary bytes')
    bad=payload.copy();bad['files']=[];badpath=OUT/'broken.activitylog';badpath.write_text(json.dumps(bad))
    restore.locator('#backup-nav').click();restore.locator('#import-file').set_input_files(str(badpath))
    expect(restore.locator('.toast.error').last).to_be_visible()
    n=restore.evaluate("async()=>{const s=await import('./assets/store.js');return (await s.allRecords()).length;}")
    assert n==1;restore.locator('#close-utility').click()
    passed('Corrupt backup is rejected atomically without adding partial records')
    restore.locator('#delete-record').click();expect(restore.locator('.record-card')).to_have_count(0)
    n=restore.evaluate("async()=>{const r=indexedDB.open('activity-log-v1',1);return await new Promise((ok,no)=>{r.onsuccess=()=>{const tx=r.result.transaction('files');const q=tx.objectStore('files').count();q.onsuccess=()=>ok(q.result);};r.onerror=()=>no(r.error);});}")
    assert n==0
    passed('Delete removes the activity and its attachment blobs')
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
    m=mobile.new_page();m.on('pageerror',lambda e:errors.append(str(e)));m.goto(BASE,wait_until='networkidle')
    assert not m.evaluate('document.documentElement.scrollWidth>innerWidth')
    m.screenshot(path=str(OUT/'mobile-demo.png'),full_page=True)
    m.locator('.new-record').first.click();assert not m.evaluate('document.documentElement.scrollWidth>innerWidth')
    m.screenshot(path=str(OUT/'mobile-editor.png'),full_page=True)
    m.locator('#close-editor').click();m.locator('#theme-toggle').click()
    expect(m.locator('html')).to_have_attribute('data-theme','dark')
    m.screenshot(path=str(OUT/'dark-mobile.png'),full_page=True)
    passed('390px mobile layout, editor and dark mode have no horizontal overflow')
    reduced=browser.new_context(reduced_motion='reduce');rp=reduced.new_page();rp.goto(BASE,wait_until='networkidle')
    rp.locator('#inline-deck').focus();rp.keyboard.press('ArrowRight');expect(rp.locator('#inline-deck')).to_have_attribute('data-index','1')
    passed('Reduced-motion mode retains full keyboard interaction')
    assert not errors,errors
    external=[u for u in requests if not (u.startswith(BASE) or u.startswith('blob:') or u.startswith('data:'))]
    assert not external,external
    passed('No uncaught page errors; no external runtime dependencies or data uploads')
    report={'passed':len(results),'tests':results,'page_errors':errors,'unexpected_external_requests':external,'base':BASE}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
