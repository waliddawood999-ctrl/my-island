// Approved 22:16 reference contract. Run against a production preview; native effects remain Windows acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { bridge } = require('./mockBridge.cjs');
const BASE = process.env.BASE || 'http://127.0.0.1:4178';
const OUT = process.env.ARTIFACT_DIR || '/tmp/my-island-reference-shots';
fs.mkdirSync(OUT,{recursive:true});
let checks=0;
const ok=(name,value)=>{assert.ok(value,name); console.log('PASS '+name);checks++;};
const media={session:true,kind:'gsmtc',degraded:false,source:'YouTube',source_name:'YouTube',title:'سورة الكهف',artist:'مشاري راشد العفاسي',album:'',duration:240,position:60,playing:true,can_seek:true,can_prev:true,can_next:true};
const cover='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#124b3b"/></svg>').toString('base64');
const clips=[{id:1,kind:'text',text:'ملاحظة الاختبار',pinned:false,created_at:1793820000000},{id:2,kind:'text',text:'https://example.com',pinned:true,created_at:1793820001000},{id:3,kind:'image',text:null,thumb:null,pinned:false,created_at:1793820002000,image_path:'C:/shots/test.png'}];
const geometries={};
async function main(){
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 try{
 for(const pack of ['noir-gold','ivory','nebula-mesh']){
  for(const state of ['idle','video','audio','wide','rest','hover','capture','clip','apps','work','preview']){
   const context=await browser.newContext({viewport:{width:1000,height:700}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(bridge({settings:{language:'ar',settingsVersion:4,themeMode:pack==='ivory'?'light':'dark',themePack:pack,themePackLight:pack,themePackDark:pack,themeMaterial:'solid',panelTabsStyle:'dock',panelWidth:state==='wide'?720:560,panelHeight:state==='wide'?260:360,pillWidth:280,pillHeight:44,peekWidth:460,peekHeight:148,eyesEnabled:false,motionLevel:'off',hoverDelayMs:0,showToday:true,showWeather:true,showBattery:true,showMeetings:false,updateAutoCheck:false,progressStyle:'wave'},media:state==='idle'?undefined:{...media,...(state==='audio'?{source:'Spotify.exe',source_name:'Spotify'}:{})},cover:state==='audio'?'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#124b3b"/></svg>').toString('base64'):cover,extra:{clip_list:clips,today_get:{city:{id:'riyadh',ar:'الرياض',en:'Riyadh'},prayers:[{id:'asr',at:Date.now()+42*60000}],next_day_at:Date.now()+86400000},weather_get:{enabled:true,offline:false,temp:26,feels:26,humidity:30,wind:5,code:0,is_day:true,units:'c',city:'الرياض',fetched_at:Date.now()}}}));
   await page.goto(BASE+'/index.html');await page.waitForFunction(id=>document.documentElement.dataset.pack===id,pack);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
   const body=page.locator('.island-body');let r=await body.boundingBox();
   if(state!=='rest'){
    await page.mouse.move(r.x+r.width/2,r.y+2);await page.waitForTimeout(350);
    if(state!=='hover'){r=await body.boundingBox();await page.mouse.click(r.x+r.width/2,r.y+2);await page.locator('.island-body[data-mode="panel"]').waitFor();}
   }
   if(['capture','clip','apps','work'].includes(state)){await page.getByTestId('dock-'+state).click();await page.waitForTimeout(400);}
   if(state==='preview'){await page.evaluate(()=>window.__emit('capture:saved',{path:'C:/shots/test.png',width:640,height:360}));await page.getByTestId('capture-preview').waitFor();await page.getByTestId('capture-preview').hover();}
   await page.waitForTimeout(400);
   ok(pack+'/'+state+': legacy progress preference displays line',await page.evaluate(()=>document.documentElement.dataset.pstyle==='line'));
   ok(pack+'/'+state+': visible content has no inherited blur',await page.locator(state==='rest'?'[data-testid="pill-layer"]':state==='hover'?'[data-testid="peek-layer"]':'[data-testid="panel-layer"]').evaluate(el=>{for(let p=el;p;p=p.parentElement){if(!/^none$|^blur\(0px\)$/.test(getComputedStyle(p).filter))return false;}return true;}));
   const geo=await body.evaluate(el=>{const b=el.getBoundingClientRect();return [el,...el.querySelectorAll('button,[data-testid="thumb"],[data-testid="player-panel"],[data-testid="home-tiles"],[data-testid="page-dock"],input')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,id:e.dataset.testid||e.getAttribute('aria-label')||'',x:Math.round((r.x-b.x)*10)/10,y:Math.round((r.y-b.y)*10)/10,w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10,r:s.borderRadius};});});
   if(!geometries[state])geometries[state]=geo;else ok(pack+'/'+state+': identical geometry and button positions',JSON.stringify(geometries[state])===JSON.stringify(geo));
   if(state==='video'){ok('Arabic video thumbnail at right',await page.getByTestId('player-panel').evaluate(el=>el.querySelector('[data-testid="thumb"]').getBoundingClientRect().x>el.querySelector('.home-player-info').getBoundingClientRect().x));ok('Arabic home dock at right',await page.getByTestId('dock-home').evaluate(el=>el.getBoundingClientRect().x>document.querySelector('[data-testid="dock-work"]').getBoundingClientRect().x));}
   if(state==='wide'){r=await body.boundingBox();ok('wide uses exact 720x260',r.width===720&&r.height===260);ok('wide layout present',await page.locator('[data-layout="wide"]').count()===1);}
   if(state==='rest'){ok('rest has no controls or seek',await page.getByTestId('pill-layer').getByTestId('player-controls').count()===0&&await page.getByTestId('pill-layer').getByTestId('seekbar').count()===0);}
   if(state==='clip'){
    await page.getByRole('button',{name:'رابط',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-testid^="clip-item-"]').length===1);ok('link filter excludes plain text',await page.locator('[data-testid^="clip-item-"]').count()===1);
    await page.getByRole('button',{name:'الكل',exact:true}).click();await page.getByTestId('clip-item-1').click();ok('selection uses outline',await page.getByTestId('clip-item-1').evaluate(e=>e.classList.contains('clip-selected')));
    await page.getByTestId('clip-item-1').getByRole('button',{name:'نسخ العنصر'}).click();ok('copy invokes text copy without paste',await page.evaluate(()=>window.__calls.some(([c])=>c==='clip_set_text')&&!window.__calls.some(([c])=>c==='clip_paste')));
   }
   await body.screenshot({path:OUT+'/'+pack+'-'+state+'.png'});ok(pack+'/'+state+': no page errors',errors.length===0);await context.close();
  }
 }
 // Screenshot timer, pause, native command routing, editing and failure fallback.
 const context=await browser.newContext({viewport:{width:1000,height:700}});const page=await context.newPage();
 await page.addInitScript(bridge({settings:{language:'ar',settingsVersion:4,themePack:'noir-gold',themePackDark:'noir-gold',panelTabsStyle:'dock',motionLevel:'off',panelWidth:560,panelHeight:360},extra:{shelf_add:[{id:7}]}}));
 await page.goto(BASE+'/index.html');await page.waitForTimeout(400);
 await page.evaluate(()=>window.__emit('capture:saved',{path:'C:/shots/test.png',width:640,height:360}));
 const preview=page.getByTestId('capture-preview');await preview.waitFor();await preview.hover();
 const left=await preview.getByRole('progressbar').getAttribute('aria-valuenow');await page.waitForTimeout(5200);
 ok('hover extends preview beyond five seconds',await preview.isVisible()&&Math.abs(Number(left)-Number(await preview.getByRole('progressbar').getAttribute('aria-valuenow')))<.15);
 await preview.getByRole('button',{name:'نسخ الملف',exact:true}).click();ok('native file copy routes through shelf',await page.evaluate(()=>window.__calls.some(([c,a])=>c==='shelf_copy'&&a.id===7)));
 await preview.getByRole('button',{name:'تحرير',exact:true}).click();await page.getByTestId('capture-canvas').waitFor();ok('editor stays inside island',await page.locator('.island-body canvas').count()===1&&!await page.evaluate(()=>window.__calls.some(([c])=>c==='editor_open')));
 await preview.getByRole('button',{name:'قص بالسحب'}).click();await preview.getByRole('button',{name:'رسم',exact:true}).click();await preview.getByRole('button',{name:'تراجع',exact:true}).click();
 await page.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=(cmd,args)=>cmd==='open_path'?Promise.reject('TEST_OPEN_FAILED'):original(cmd,args);});
 await preview.getByRole('button',{name:'فتح',exact:true}).click();ok('failed action shows fallback',await preview.getByRole('alert').innerText().then(s=>s.includes('TEST_OPEN_FAILED')&&s.includes('نسخ المسار')));
 await preview.getByRole('button',{name:'إغلاق',exact:true}).click();ok('close removes preview',await preview.count()===0);
 await page.evaluate(()=>window.__emit('capture:saved',{path:'C:/shots/second.png',width:640,height:360}));await preview.waitFor();await page.mouse.move(0,690);await page.waitForTimeout(5500);ok('unhovered preview expires after five seconds',await preview.count()===0);await context.close();
 // Settings cards: exactly three approved themes, one progress style, undo and live events.
 for(const pack of ['noir-gold','ivory','nebula-mesh']){
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();
  await page.addInitScript(bridge({settings:{language:'ar',settingsVersion:4,themeMode:pack==='ivory'?'light':'dark',themePack:pack,themePackLight:pack,themePackDark:pack,motionLevel:'off'}}));
  await page.addInitScript(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{const r=await original(cmd,args);if(cmd==='settings_set')window.__emit('settings:changed',args.patch);return r;};});
  await page.goto(BASE+'/settings.html');await page.locator('[data-nav="appearance"]').click();await page.getByTestId('appearance-body').waitFor();
  ok('only three approved gallery choices',JSON.stringify(await page.getByTestId('theme-gallery').getByRole('radio').evaluateAll(es=>es.map(e=>e.dataset.pack)))===JSON.stringify(['noir-gold','ivory','nebula-mesh']));
  ok('six appearance groups',await page.locator('[data-basic]').count()===6);ok('advanced closed',await page.getByTestId('appearance-advanced').count()===0);
  await page.getByTestId('theme-gallery').locator('[data-pack="ivory"]').click();await page.waitForTimeout(150);await page.getByRole('button',{name:'تراجع',exact:true}).click();await page.waitForTimeout(150);ok('undo restores previous theme',await page.evaluate(id=>document.documentElement.dataset.pack===id,pack));
  await page.screenshot({path:OUT+'/'+pack+'-settings.png',fullPage:true});await context.close();
 }
 console.log('ALL PASSED ('+checks+')');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
