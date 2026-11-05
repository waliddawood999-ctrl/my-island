const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const {bridge} = require('./mockBridge.cjs');
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const OUT='/tmp/my-island-capture-compact-shots';fs.mkdirSync(OUT,{recursive:true});
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


async function main(){
 const manifest=fs.readFileSync('src-tauri/build.rs','utf8'),cap=JSON.parse(fs.readFileSync('src-tauri/capabilities/main.json','utf8'));
 for(const command of ['capture_recent','capture_delete'])ok('native ACL permits '+command,manifest.includes('"'+command+'"')&&cap.permissions.includes('allow-'+command.replaceAll('_','-')));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 try{for(const [width,height] of [[720,260],[560,360],[420,220]])for(const level of ['full','reduced']){
  const c=await browser.newContext({viewport:{width:1100,height:750}}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await setup(p,{panelWidth:width,panelHeight:height,motionLevel:level,themePack:'noir-gold',themePackDark:'noir-gold'});
  await p.addInitScript(()=>{
   const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#607080"/><text x="20" y="50" fill="white">My Island</text></svg>');
   window.__history=Array.from({length:24},(_,n)=>({path:'C:/captures/item'+n+(n%3===0?'.mp4':'.png'),kind:n%3===0?'video':'image',width:160,height:90,thumb:image}));
   window.__colors=['#72AACC','#DDAA55','#88CC99','#BBAADD'].map(hex=>({hex,r:120,g:140,b:160,h:220,s:30,l:50}));
   const original=window.__TAURI_INTERNALS__.invoke;
   window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{const r=await original(cmd,args);
    if(cmd==='capture_recent')return structuredClone(window.__history);
    if(cmd==='color_history')return structuredClone(window.__colors);
    if(cmd==='capture_delete'){window.__history=window.__history.filter(x=>x.path!==args.path);return true;}
    if(cmd==='color_delete'){window.__colors=window.__colors.filter(x=>x.hex!==args.hex);return structuredClone(window.__colors);}
    return r;
   };
  });
  await openPanel(p);await p.getByTestId('dock-capture').click();await p.getByTestId('capture-recent').waitFor();await p.waitForTimeout(400);
  const tag=width+'/'+level;
  ok('all images recordings colors rendered '+tag,await p.locator('.capture-recent-square').count()===28);
  ok('six tiles per row, twelve before scrolling '+tag,await p.locator('.capture-recent-square').evaluateAll(es=>{const parent=es[0].closest('.capture-history-viewport').getBoundingClientRect();return es.slice(0,12).every(e=>{const r=e.getBoundingClientRect();return Math.abs(r.width-(es[0].closest('.capture-history-viewport').clientWidth-30)/6)<1&&r.top>=parent.top-1&&r.bottom<=parent.bottom+1&&r.left>=parent.left-1&&r.right<=parent.right+1})}));
  ok('six columns fill available width '+tag,await p.locator('.capture-recent-square').evaluateAll(es=>{const rs=es.slice(0,12).map(e=>e.getBoundingClientRect()),v=es[0].closest('.capture-history-viewport').getBoundingClientRect();return rs.slice(0,6).every(r=>Math.abs(r.top-rs[0].top)<1)&&rs[6].top>rs[0].top&&Math.abs(rs[0].left-v.left)<1&&Math.abs(rs[5].right-v.left-es[0].closest('.capture-history-viewport').clientWidth)<1}));
  ok('tool frame centered near top '+tag,await p.getByTestId('capture-grid').evaluate(el=>{const r=el.getBoundingClientRect(),page=el.parentElement.getBoundingClientRect();return Math.abs((r.left+r.right-page.left-page.right)/2)<2&&r.top-page.top<2&&r.height<=65}));
  ok('all six actions inside frame '+tag,await p.getByTestId('capture-grid').getByRole('button').count()===6);
  const first=p.getByTestId('capture-grid').getByRole('button').first();await first.hover();await p.waitForTimeout(250);
  ok('hover motion respects preference '+tag,await first.evaluate((e,level)=>{const t=getComputedStyle(e).transform;return level==='full'?t!=='none'&&t!=='matrix(1, 0, 0, 1, 0, 0)':t==='none'||t==='matrix(1, 0, 0, 1, 0, 0)'},level));
  await p.mouse.move(0,740);await p.locator('.island-body').screenshot({path:OUT+'/capture-'+width+'-'+level+'.png'});
  await p.getByRole('button',{name:'فتح التسجيل C:/captures/item0.mp4',exact:true}).click();ok('video opens with native command '+tag,(await calls(p,'open_path')).some(([,a])=>a.path.endsWith('item0.mp4')));
  await p.getByRole('button',{name:'حذف اللقطة C:/captures/item0.mp4',exact:true}).click();ok('video deletes only selected file '+tag,await p.locator('.capture-recent-square').count()===27&&(await calls(p,'capture_delete')).at(-1)[1].path==='C:/captures/item0.mp4');
  await p.getByRole('button',{name:'نسخ #72AACC',exact:true}).click();ok('color copies '+tag,(await calls(p,'color_patch')).some(([,a])=>a.hex==='#72AACC'&&a.format==='hex'));
  await p.getByRole('button',{name:'حذف #72AACC',exact:true}).click();ok('color deletion retained '+tag,await p.locator('.capture-recent-square').count()===26);
  await p.evaluate(()=>window.__emit('settings:changed',{panelWidth:600,panelHeight:300}));await p.waitForTimeout(500);await p.locator('.capture-history-viewport').evaluate(e=>{e.scrollTop=0});
  ok('resize keeps twelve tiles visible '+tag,await p.locator('.capture-recent-square').evaluateAll(es=>{const r=es[0].closest('.capture-history-viewport').getBoundingClientRect();return es.slice(0,12).every(e=>e.getBoundingClientRect().bottom<=r.bottom+1)}));
  ok('no browser errors '+tag,errors.length===0);await c.close();
 }}finally{await browser.close()}
 console.log('ALL PASSED ('+count+')');
}
main().catch(e=>{console.error(e);process.exitCode=1});
