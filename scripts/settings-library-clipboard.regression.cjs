const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const {bridge} = require('./mockBridge.cjs');
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const OUT='/tmp/my-island-fix-settings-shots';fs.mkdirSync(OUT,{recursive:true});
let count=0;const ok=(name,yes)=>{assert.ok(yes,name);console.log('PASS '+name);count++;};
const themes=[{id:'u:z',name:'Z محفوظ',base:'noir-gold'},{id:'u:a',name:'A محفوظ',base:'ivory'}];
const settings={language:'ar',settingsVersion:4,themeMode:'dark',themePack:'nebula-mesh',themePackLight:'nebula-mesh',themePackDark:'nebula-mesh',myThemes:themes,motionLevel:'full',themeAnim:true,islandAnimation:true,themeMaterial:'glass',glassStyle:'crystal',glassTint:45,panelTabsStyle:'dock',panelWidth:560,panelHeight:360,pillWidth:280,pillHeight:44,eyesEnabled:false,hoverDelayMs:0,showBattery:false,showWeather:false,showToday:false,showMeetings:false,updateAutoCheck:false};
const clips=Array.from({length:8},(_,n)=>({id:n+1,kind:n===2?'image':'text',text:n===1?'https://example.com':n===2?null:'عنصر '+(n+1),thumb:null,image_path:n===2?'C:/shots/test.png':null,pinned:n===0,width:n===2?640:null,height:n===2?360:null,source:'test',created_at:1793820000000+n*1000}));
const files=[{id:11,path:'C:/test/report.txt',name:'report.txt',kind:'file',size:100,missing:false,thumb:null,preview:null,created_at:1793820000000}];
const apps=[{id:21,path:'C:/test/app.exe',name:'تطبيق محفوظ',kind:'app',icon:null,missing:false}];
async function setup(page,extra={}){
 await page.addInitScript(bridge({settings:{...settings,...extra}}));
 await page.addInitScript(({initial,clips,files,apps})=>{
  window.__stored=JSON.parse(localStorage.getItem('fix-settings')||JSON.stringify(initial));window.__clips=clips;window.__files=files;window.__apps=apps;
  const original=window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{
   const result=await original(cmd,args);
   if(cmd==='settings_get')return window.__stored;
   if(cmd==='settings_set'){Object.assign(window.__stored,args.patch);localStorage.setItem('fix-settings',JSON.stringify(window.__stored));window.__emit('settings:changed',args.patch);return null;}
   if(cmd==='clip_list')return structuredClone(window.__clips);
   if(cmd==='clip_paste')return 'pasted';
   if(cmd==='clip_pin'){window.__clips.find(c=>c.id===args.id).pinned=args.pinned;return null;}
   if(cmd==='clip_delete'){window.__clips=window.__clips.filter(c=>c.id!==args.id);return null;}
   if(cmd==='clip_clear'){window.__clips=window.__clips.filter(c=>c.pinned);return null;}
   if(cmd==='shelf_list')return structuredClone(window.__files);
   if(cmd==='shelf_remove'){window.__files=window.__files.filter(c=>c.id!==args.id);window.__emit('shelf:changed',null);return null;}
   if(cmd==='launcher_list')return structuredClone(window.__apps);
   if(cmd==='launcher_remove'){window.__apps=window.__apps.filter(c=>c.id!==args.id);window.__emit('launcher:changed',null);return null;}
   if(cmd==='shelf_add')return [{id:11}];
   return result;
  };
 },{initial:{...settings,...extra},clips,files,apps});
}
const calls=async(page,command)=>page.evaluate(cmd=>window.__calls.filter(([c])=>c===cmd),command);
async function openPanel(page){await page.goto(BASE+'/index.html');await page.waitForFunction(()=>window.__calls.some(([c])=>c==='report_island_rect'));await page.waitForTimeout(300);const b=await page.locator('.island-body').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+2);await page.waitForTimeout(350);const p=await page.locator('.island-body').boundingBox();await page.mouse.click(p.x+p.width/2,p.y+2);await page.locator('.island-body[data-mode="panel"]').waitFor();await page.waitForTimeout(500);}
async function main(){const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});try{
 const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 await page.goto(BASE+'/settings.html');await page.locator('[data-nav="appearance"]').click();await page.getByTestId('theme-gallery').waitFor();
 ok('factory packs plus all saved themes in stored order',JSON.stringify(await page.getByTestId('theme-gallery').getByRole('radio').evaluateAll(es=>es.map(e=>e.dataset.pack)))===JSON.stringify(['noir-gold','ivory','nebula-mesh','u:z','u:a']));
 ok('gallery cards stacked as rows',await page.getByTestId('theme-gallery').getByRole('radio').evaluateAll(es=>es.every((e,n)=>n===0||e.getBoundingClientRect().top>=es[n-1].getBoundingClientRect().bottom)));
 await page.getByTestId('theme-gallery').locator('[data-pack="u:z"]').click();await page.waitForFunction(()=>document.documentElement.dataset.pack==='u:z');
 ok('saved theme writes three selection keys',await page.evaluate(()=>['themePack','themePackLight','themePackDark'].every(k=>window.__stored[k]==='u:z')));
 await page.reload();await page.locator('[data-nav="appearance"]').click();await page.getByTestId('theme-gallery').waitFor();ok('saved theme survives reload',await page.evaluate(()=>document.documentElement.dataset.pack==='u:z'));
 const material=page.locator('[data-basic="material"]');ok('material has exactly two choices',await material.getByRole('radio').count()===2);ok('legacy crystal displays clear selected',await material.getByRole('radio',{name:'شفاف',exact:true}).getAttribute('aria-checked')==='true');
 await material.getByRole('radio',{name:'معتم',exact:true}).click();await material.getByRole('radio',{name:'شفاف',exact:true}).click();
 ok('clear persists expected keys without erasing other settings',await page.evaluate(()=>window.__stored.themeMaterial==='glass'&&window.__stored.glassStyle==='clear'&&window.__stored.glassTint===25&&window.__stored.pillWidth===280&&window.__stored.myThemes.length===2));
 const edges=page.locator('[data-basic="edges"]');await edges.scrollIntoViewIfNeeded();
 ok('animation row sits below border and shadow row',await edges.evaluate(el=>el.querySelector('.tp-island-animation').getBoundingClientRect().top>=el.querySelector('.st-row').getBoundingClientRect().bottom-1));
 ok('border and shadow sliders do not overlap',await edges.getByRole('slider').evaluateAll(es=>{const [a,b]=es.map(e=>e.getBoundingClientRect());return a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1}));
 await edges.getByRole('switch',{name:'جزيرة متحركة',exact:true}).click();ok('basic animation writes independent key',await page.evaluate(()=>window.__stored.islandAnimation===false&&window.__stored.themeAnim===true));
 await page.getByTestId('appearance-advanced-toggle').click();await page.getByRole('switch',{name:'غسلة متحرّكة',exact:true}).click();ok('wash writes only themeAnim',await page.evaluate(()=>window.__stored.themeAnim===false&&window.__stored.islandAnimation===false));
 await edges.getByRole('switch',{name:'جزيرة متحركة',exact:true}).click();ok('island can run with wash off',await page.evaluate(()=>window.__stored.islandAnimation===true&&window.__stored.themeAnim===false));
 ok('no frosted choice or summary in expanded appearance',!await page.getByTestId('appearance-body').innerText().then(s=>/مثلّج|Frosted|crystal/.test(s)));
 await page.getByTestId('appearance-advanced-toggle').click();await edges.screenshot({path:OUT+'/borders-shadow.png'});
 await page.locator('[data-nav="modules"]').click();await page.getByTestId('progress-option-line').waitFor();ok('all six progress cards present',await page.locator('[data-testid^="progress-option-"]').count()===6);
 for(const style of ['line','shimmer','wave','liquid','dashes','ring']){await page.getByTestId('progress-option-'+style).click();await page.waitForFunction(s=>document.documentElement.dataset.pstyle===s,style);await page.reload();await page.locator('[data-nav="modules"]').click();await page.getByTestId('progress-option-'+style).waitFor();ok(style+' selection persists and displays after reload',await page.getByTestId('progress-option-'+style).getAttribute('aria-checked')==='true'&&await page.evaluate(s=>window.__stored.progressStyle===s&&document.documentElement.dataset.pstyle===s,style));}
 await page.screenshot({path:OUT+'/progress-cards.png',fullPage:true});
 // Independent motion behavior including full-motion wash and OS/Eco reductions.
 for(const [island,wash] of [[false,true],[true,false]]){await page.evaluate(([a,b])=>{Object.assign(window.__stored,{themePack:'nebula-mesh',themePackLight:'nebula-mesh',themePackDark:'nebula-mesh',islandAnimation:a,themeAnim:b});localStorage.setItem('fix-settings',JSON.stringify(window.__stored))},[island,wash]);await page.reload();await page.waitForTimeout(300);ok('wash independent of island '+island+'/'+wash,await page.evaluate(v=>(document.documentElement.dataset.washAnim==='on')===v,wash));}
 await page.evaluate(()=>{Object.assign(window.__stored,{islandAnimation:false,themeAnim:true});localStorage.setItem('fix-settings',JSON.stringify(window.__stored));});
 await openPanel(page);ok('island off disables geometry spring but leaves wash on',await page.locator('.island-body').evaluate(el=>JSON.parse(el.dataset.spring).duration===0&&document.documentElement.dataset.washAnim==='on'));
 await page.evaluate(()=>{Object.assign(window.__stored,{islandAnimation:true,themeAnim:false});window.__emit('settings:changed',{islandAnimation:true,themeAnim:false});});await page.waitForTimeout(150);ok('wash off leaves geometry spring active',await page.locator('.island-body').evaluate(el=>JSON.parse(el.dataset.spring).duration!==0&&!document.documentElement.dataset.washAnim));
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);ok('OS reduced motion disables wash',await page.evaluate(()=>!document.documentElement.dataset.washAnim));
 ok('settings has no browser errors',errors.length===0);await context.close();
 for(const [width,height] of [[560,360],[720,260]]){
  const c=await browser.newContext({viewport:{width:1000,height:700}}),p=await c.newPage();await setup(p,{panelWidth:width,panelHeight:height,motionLevel:'off'});await openPanel(p);await p.getByTestId('dock-library').click();await p.getByTestId('library-page').waitFor();
  ok('one library navigation '+width,await p.getByRole('tab',{name:'المكتبة',exact:true}).count()===1&&await p.getByTestId('dock-apps').count()===0);
  ok('no standalone shelf or launcher page '+width,await p.locator('[data-tab="shelf"],[data-tab="launcher"]').count()===0);
  ok('both library functions mounted '+width,await p.getByTestId('library-files').count()===1&&await p.getByTestId('library-apps').count()===1);
  const file=p.getByTestId('library-files').getByRole('button',{name:/report.txt/});
  // Shelf tiles use the file path as title; keep the original action handlers.
  const tile=p.locator('[title="C:/test/report.txt"]');await tile.click();ok('file open retained '+width,(await calls(p,'open_path')).some(([,a])=>a.path==='C:/test/report.txt'));
  await p.getByTestId('library-apps').getByText('تطبيق محفوظ',{exact:true}).click();ok('app launch retained '+width,(await calls(p,'launcher_launch')).some(([,a])=>a.id===21));
  await tile.scrollIntoViewIfNeeded();const r=await tile.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+12,r.y+r.height/2);await p.mouse.up();ok('native shelf drag retained '+width,(await calls(p,'shelf_drag')).some(([,a])=>a.ids.includes(11)));
  await p.locator('.island-body').screenshot({path:OUT+'/library-populated-'+width+'.png'});
  ok('both library areas fit without horizontal overflow '+width,await p.getByTestId('library-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&[...el.querySelectorAll('.library-part')].every(e=>e.scrollWidth<=e.clientWidth+1)));
  await tile.click({button:'right'});await p.getByRole('button',{name:'إزالة',exact:true}).click();await p.waitForTimeout(200);ok('file removal retained '+width,(await calls(p,'shelf_remove')).some(([,a])=>a.id===11));
  await p.locator('.island-body').screenshot({path:OUT+'/library-'+width+'.png'});
  await p.getByTestId('dock-clip').click();await p.getByTestId('clipboard-page').waitFor();await p.waitForTimeout(300);
  ok('clipboard no filter bar '+width,await p.getByRole('group',{name:'مرشحات الحافظة'}).count()===0);
  ok('all eight mixed entries retained '+width,await p.locator('[data-testid^="clip-item-"]').count()===8&&(await calls(p,'clip_clear')).length===0&&(await calls(p,'clip_delete')).length===0);
  ok('clear/search share first top row '+width,await p.getByTestId('clipboard-toolbar').evaluate(el=>{const b=el.querySelector('button').getBoundingClientRect(),s=el.querySelector('label').getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return Math.abs(b.y-s.y)<5&&el.getBoundingClientRect().y-p.y<1}));
  ok('list starts immediately after toolbar '+width,await p.getByTestId('clipboard-page').evaluate(el=>{const a=el.querySelector('[data-testid="clipboard-toolbar"]').getBoundingClientRect(),b=el.querySelector('[data-testid="clipboard-items"]').getBoundingClientRect();return b.top-a.bottom<=5}));
  ok('rows compact with no middle gap '+width,await p.locator('[data-testid^="clip-item-"]').evaluateAll(es=>es.every((el,n)=>n===0||el.getBoundingClientRect().top-es[n-1].getBoundingClientRect().bottom<5)));
  ok('compact text rows are at most 46px '+width,await p.getByTestId('clip-item-1').evaluate(el=>el.getBoundingClientRect().height<=46));
  ok('pinned status visible '+width,await p.getByTestId('clip-item-1').getByRole('button',{name:'إلغاء التثبيت'}).isVisible());
  await p.getByTestId('clip-item-2').click();ok('single click pastes '+width,(await calls(p,'clip_paste')).some(([,a])=>a.id===2));
  const before=(await calls(p,'clip_paste')).length;await p.getByTestId('clip-item-2').getByRole('button',{name:'نسخ العنصر'}).click();ok('copy does not also paste '+width,(await calls(p,'clip_set_text')).some(([,a])=>a.text==='https://example.com')&&(await calls(p,'clip_paste')).length===before);
  await p.getByTestId('clip-item-2').getByRole('button',{name:'تثبيت',exact:true}).click();await p.waitForTimeout(150);ok('pin action preserved '+width,(await calls(p,'clip_pin')).some(([,a])=>a.id===2&&a.pinned));
  await p.getByTestId('clip-item-4').getByRole('button',{name:'حذف',exact:true}).click();await p.waitForTimeout(200);ok('delete action preserved '+width,(await calls(p,'clip_delete')).some(([,a])=>a.id===4));
  await p.getByPlaceholder('ابحث في الحافظة…').fill('عنصر 5');await p.waitForTimeout(200);ok('inline search works '+width,await p.locator('[data-testid^="clip-item-"]').count()===1);await p.getByPlaceholder('ابحث في الحافظة…').fill('');await p.waitForTimeout(200);
  await p.locator('.island-body').screenshot({path:OUT+'/clipboard-'+width+'.png'});
  await p.getByTestId('clipboard-clear').click();ok('clear command only on explicit click '+width,(await calls(p,'clip_clear')).length>0);
  await c.close();
 }
 console.log('ALL PASSED ('+count+')');
 }finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
