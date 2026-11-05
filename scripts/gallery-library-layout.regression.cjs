const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const {bridge} = require('./mockBridge.cjs');
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const OUT='/tmp/my-island-gallery-library-shots';fs.mkdirSync(OUT,{recursive:true});
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
 for(const width of [1280,850]){
  const c=await browser.newContext({viewport:{width,height:1000}}),p=await c.newPage();await setup(p);await p.goto(BASE+'/settings.html');await p.locator('[data-nav="appearance"]').click();const g=p.getByTestId('theme-gallery');await g.waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
  const ids=await g.getByRole('radio').evaluateAll(es=>es.map(e=>e.dataset.pack));
  ok('all original factory themes restored '+width,['obsidian','aurora','ember','sakura-veil','evergreen-mist','ultraviolet','ivory','noir-gold','nebula-mesh','porcelain'].every(id=>ids.includes(id))&&ids.length>12);
  ok('saved themes still in stored order '+width,JSON.stringify(ids.slice(-2))===JSON.stringify(['u:z','u:a']));
  const geometry=await g.getByRole('radio').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));
  ok('compact square cards '+width,geometry.every(r=>Math.abs(r.w-r.h)<1&&r.w<=181));
  const columns=geometry.filter(r=>Math.abs(r.y-geometry[0].y)<1).length;ok('three or four columns '+width,columns===3||columns===4);console.log('GALLERY',width,'cards',ids.length,'columns',columns);
  await g.locator('[data-pack="aurora"]').click();await p.waitForFunction(()=>document.documentElement.dataset.pack==='aurora');ok('restored factory theme actually applies '+width,await p.evaluate(()=>window.__stored.themePack==='aurora'&&document.documentElement.dataset.pack==='aurora'));
  await p.reload();await p.locator('[data-nav="appearance"]').click();await g.waitFor();ok('restored selection survives reload '+width,await p.evaluate(()=>document.documentElement.dataset.pack==='aurora'));
  await g.screenshot({path:OUT+'/themes-'+width+'.png'});await c.close();
 }
 for(const [width,height] of [[720,260],[560,360],[420,220]])for(const empty of [true,false]){
  const c=await browser.newContext({viewport:{width:1000,height:700}}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await setup(p,{panelWidth:width,panelHeight:height,motionLevel:'off'});
  if(empty)await p.addInitScript(()=>{window.__files=[];window.__apps=[]});
  await openPanel(p);await p.getByTestId('dock-library').click();await p.getByTestId('library-page').waitFor();await p.waitForTimeout(300);
  ok('both library sections remain '+width+'/'+empty,await p.getByTestId('library-files').count()===1&&await p.getByTestId('library-apps').count()===1);
  ok('toolbars have no overlapping controls '+width+'/'+empty,await p.locator('.library-widget .shelf-toolbar,.library-widget .launcher-toolbar').evaluateAll(es=>es.every(el=>{const rs=[...el.children].map(e=>e.getBoundingClientRect());return rs.every((a,n)=>rs.every((b,m)=>n===m||a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1))})));
  ok('library fits above dock '+width+'/'+empty,await p.getByTestId('library-page').evaluate(el=>{const dock=document.querySelector('[data-testid="page-dock"]').getBoundingClientRect();return [...el.querySelectorAll('.shelf-toolbar,.launcher-toolbar,.library-empty')].every(e=>e.getBoundingClientRect().bottom<=dock.top+1)&&el.scrollWidth<=el.clientWidth+1}));
  ok('one full-width collection visible '+width,await p.getByTestId('library-apps').isVisible()&&!await p.getByTestId('library-files').isVisible());
  await p.getByTestId('library-select-files').click();
  ok('file collection uses full width '+width,await p.getByTestId('library-files').evaluate(e=>Math.abs(e.getBoundingClientRect().width-e.parentElement.getBoundingClientRect().width)<2));
  if(empty){ok('no clipped empty animation '+width,await p.locator('.library-empty canvas,.library-empty svg,.library-empty img').count()===0);ok('saved files empty message visible '+width,await p.getByText('لا ملفات أو نصوص في المكتبة',{exact:true}).isVisible());await p.getByTestId('library-select-apps').click();ok('saved apps empty message visible '+width,await p.getByText('لا تطبيقات محفوظة في المكتبة',{exact:true}).isVisible());}
  else {await p.locator('[title="C:/test/report.txt"]').click();await p.getByTestId('library-select-apps').click();await p.getByText('تطبيق محفوظ',{exact:true}).click();ok('file and app opening retained '+width,(await calls(p,'open_path')).some(([,a])=>a.path==='C:/test/report.txt')&&(await calls(p,'launcher_launch')).some(([,a])=>a.id===21));}
  ok('no page errors '+width+'/'+empty,errors.length===0);
  await p.locator('.island-body').screenshot({path:OUT+'/library-'+width+'-'+(empty?'empty':'filled')+'.png'});await c.close();
 }
 console.log('ALL PASSED ('+count+')');
}finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
