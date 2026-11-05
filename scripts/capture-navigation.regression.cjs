const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');const {bridge}=require('./mockBridge.cjs');
const BASE=process.env.BASE||'http://127.0.0.1:4178',OUT='/tmp/my-island-fix-capture-shots';fs.mkdirSync(OUT,{recursive:true});
const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#ddd"/><path d="M0 0L640 360M640 0L0 360" stroke="#111" stroke-width="2"/><text x="240" y="180" font-size="24">Capture clarity</text></svg>').toString('base64');
const recent=Array.from({length:12},(_,n)=>({path:'C:/captures/shot'+n+'.png',width:640,height:360,thumb:image}));
let n=0;const ok=(label,result)=>{assert.ok(result,label);console.log('PASS '+label);n++;};
async function main(){const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});try{
for(const motionLevel of ['full','reduced','off']){
 const c=await b.newContext({viewport:{width:1000,height:700}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(bridge({settings:{language:'ar',settingsVersion:4,themeMode:'dark',themePack:'noir-gold',themePackDark:'noir-gold',panelTabsStyle:'dock',panelWidth:560,panelHeight:360,pillWidth:280,pillHeight:44,eyesEnabled:false,hoverDelayMs:0,motionLevel,showToday:false,showWeather:false,showBattery:false,showMeetings:true,updateAutoCheck:false},extra:{capture_recent:recent,editor_image:{path:recent[0].path,image},shelf_add:[{id:31}],meetings_list:{items:[],error:null}}}));
 await p.addInitScript(recent=>{
   let shots=structuredClone(recent);const original=window.__TAURI_INTERNALS__.invoke;
   window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{
     const value=await original(cmd,args);
     if(cmd==='capture_recent')return structuredClone(shots);
     if(cmd==='capture_delete'){
       if(window.__failDelete)throw new Error('TEST_DELETE_FAILED');
       const existed=shots.some(s=>s.path===args.path);shots=shots.filter(s=>s.path!==args.path);window.__emit('capture:changed',args.path);return existed;
     }
     return value;
   };
 },recent);
 await p.goto(BASE+'/index.html');await p.waitForFunction(()=>window.__calls.some(([c])=>c==='report_island_rect'));await p.waitForTimeout(350);let r=await p.locator('.island-body').boundingBox();await p.mouse.move(r.x+r.width/2,r.y+2);await p.waitForTimeout(450);r=await p.locator('.island-body').boundingBox();await p.mouse.click(r.x+r.width/2,r.y+2);await p.locator('.island-body[data-mode="panel"]').waitFor();await p.waitForTimeout(500);
 const names=await p.getByTestId('page-dock').getByRole('tab').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
 ok(motionLevel+': exactly final four pages in original order',JSON.stringify(names)===JSON.stringify(['الرئيسية','الالتقاط','الحافظة','المكتبة']));
 ok(motionLevel+': removed Apps/Tools have no entry',await p.locator('[data-testid="dock-apps"],[data-testid="dock-work"],[data-testid="sub-tabs"]').count()===0);
 await p.getByTestId('dock-library').click();await p.getByTestId('library-page').waitFor();await p.waitForTimeout(500);
 // Wheel on the dock bypasses inner lists, then follow real wheel throttling.
 await p.getByTestId('page-dock').hover();await p.mouse.wheel(0,-100);await p.waitForTimeout(motionLevel==='full'?450:80);
 ok(motionLevel+': last wraps to first',await p.getByTestId('dock-home').getAttribute('aria-selected')==='true');
 console.log('WRAP_STYLE',motionLevel,await p.getByTestId('panel-layer').evaluate(el=>({opacity:getComputedStyle(el).opacity,filter:getComputedStyle(el).filter,mode:document.querySelector('.island-body').dataset.mode})));
 ok(motionLevel+': content still visible after forward wrap',await p.getByTestId('panel-layer').evaluate(el=>getComputedStyle(el).opacity==='1'&&/^none$|^blur\(0px\)$/.test(getComputedStyle(el).filter)));
 await p.waitForTimeout(300);await p.getByTestId('page-dock').hover();await p.mouse.wheel(0,100);await p.waitForTimeout(motionLevel==='full'?450:80);
 ok(motionLevel+': first wraps backwards to last',await p.getByTestId('dock-library').getAttribute('aria-selected')==='true');
 if(motionLevel!=='full')ok(motionLevel+': no spring or lingering translation on page swap',await p.getByTestId('library-page').evaluate(el=>{const m=el.parentElement;return getComputedStyle(m).opacity==='1'&&['none','matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(m).transform)}));
 await p.getByTestId('dock-capture').click();await p.getByTestId('capture-page').waitFor();await p.waitForTimeout(350);
 ok(motionLevel+': six capture tools retained',await p.getByTestId('capture-grid').getByRole('button').count()===6);
 ok(motionLevel+': twelve recent thumbnails available',await p.getByTestId('capture-recent').locator('.capture-recent-square').count()===12);
 ok(motionLevel+': thumbnails uniform and twelve fit viewport',await p.getByTestId('capture-recent').locator('.capture-recent-square').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return Math.abs(r.width-es[0].getBoundingClientRect().width)<.5&&Math.abs(r.height-es[0].getBoundingClientRect().height)<.5&&r.bottom<=e.closest('.capture-history-viewport').getBoundingClientRect().bottom+1})));
 ok(motionLevel+': no vertical gallery scroll',await p.locator('.capture-history-viewport').evaluate(el=>el.scrollHeight<=el.clientHeight+1));
 ok(motionLevel+': loading gallery never deletes a file',!await p.evaluate(()=>window.__calls.some(([c])=>c==='capture_delete')));
 await p.getByRole('button',{name:'حذف اللقطة '+recent[11].path,exact:true}).click();await p.waitForTimeout(150);
 ok(motionLevel+': selected capture removed, other captures retained',await p.getByTestId('capture-recent').locator('.capture-recent-square').count()===11&&await p.getByRole('button',{name:'فتح اللقطة '+recent[0].path,exact:true}).count()===1&&await p.evaluate(path=>window.__calls.some(([c,a])=>c==='capture_delete'&&a.path===path),recent[11].path));
 ok(motionLevel+': already missing capture is harmless',await p.evaluate(path=>window.__TAURI_INTERNALS__.invoke('capture_delete',{path}),recent[11].path)===false);
 await p.evaluate(()=>window.__failDelete=true);await p.getByRole('button',{name:'حذف اللقطة '+recent[10].path,exact:true}).click();await p.waitForTimeout(150);
 ok(motionLevel+': failed deletion preserves item and reports error',await p.getByRole('button',{name:'فتح اللقطة '+recent[10].path,exact:true}).count()===1&&await p.getByTestId('capture-page').innerText().then(t=>t.includes('TEST_DELETE_FAILED')));await p.evaluate(()=>window.__failDelete=false);

 await p.locator('.island-body').screenshot({path:OUT+'/capture-'+motionLevel+'.png'});
 await p.getByTestId('capture-note').click();await p.getByTestId('capture-quick-note').waitFor();ok(motionLevel+': quick note stays inside Capture without old Note page',await p.getByTestId('dock-capture').getAttribute('aria-selected')==='true'&&await p.getByRole('tab',{name:'ملاحظة',exact:true}).count()===0);
 await p.getByRole('button',{name:'العودة إلى الالتقاط'}).click();await p.getByTestId('capture-page').waitFor();
 await p.getByTestId('capture-recent').getByRole('button',{name:'فتح اللقطة '+recent[0].path,exact:true}).click();const v=p.getByTestId('capture-preview');await v.waitFor();await v.hover();await p.waitForTimeout(300);
 ok(motionLevel+': only preview inside island; navigation hidden',await p.getByTestId('page-dock').count()===0&&await p.getByTestId('capture-page').count()===0);
 ok(motionLevel+': zero screen dim and sharp uncropped image',await v.evaluate(el=>{const img=el.querySelector('img'),s=getComputedStyle(img),r=img.getBoundingClientRect(),p=el.getBoundingClientRect();return el.dataset.dim==='0'&&s.objectFit==='contain'&&s.filter==='none'&&s.opacity==='1'&&r.width>=p.width*.95&&r.height>=p.height*.55}));
 ok(motionLevel+': no ancestor blur on preview',await v.evaluate(el=>{for(let x=el;x;x=x.parentElement)if(!/^none$|^blur\(0px\)$/.test(getComputedStyle(x).filter))return false;return true}));
 await p.waitForTimeout(5200);if(!await v.isVisible()) console.log('PREVIEW_DIAGNOSTIC',await p.evaluate(()=>({mode:document.querySelector('.island-body')?.dataset.mode,count:document.querySelectorAll('[data-testid="capture-preview"]').length,hover:document.querySelector('[data-testid="capture-preview"]')?.matches(':hover'),remaining:document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')})));ok(motionLevel+': hover extends five second preview',await v.isVisible());
 const img=v.locator('img');r=await img.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+15,r.y+r.height/2);await p.mouse.up();await p.waitForTimeout(100);
 ok(motionLevel+': drag invokes native file OLE route',await p.evaluate(()=>window.__calls.some(([c,a])=>c==='shelf_drag'&&a.ids[0]===31)));
 await p.evaluate(()=>window.__emit('shelf:drag-end','cancel'));ok(motionLevel+': cancel gives copy/download fallback',await v.getByRole('status').innerText().then(s=>s.includes('ألغي السحب')));
 await v.getByRole('button',{name:'نسخ الملف',exact:true}).click();ok(motionLevel+': copy invokes native file clipboard route',await p.evaluate(()=>window.__calls.some(([c,a])=>c==='shelf_copy'&&a.id===31)));
 const download=p.waitForEvent('download');await v.getByRole('button',{name:'تنزيل',exact:true}).click();ok(motionLevel+': browser requests file download',(await download).suggestedFilename()==='shot0.png');
 await p.locator('.island-body').screenshot({path:OUT+'/preview-'+motionLevel+'.png'});
 await v.getByRole('button',{name:'إغلاق',exact:true}).click();await p.getByTestId('page-dock').waitFor();
 await p.evaluate(path=>window.__emit('capture:saved',{path,width:640,height:360}),recent[1].path);await v.waitFor();await p.mouse.move(0,690);await p.waitForTimeout(5500);ok(motionLevel+': preview expires after five unhovered seconds',await v.count()===0);
 await p.evaluate(()=>window.__emit('settings:changed',{moduleShelf:false,moduleLauncher:false}));await p.waitForFunction(()=>document.querySelectorAll('[data-testid="page-dock"] [role="tab"]').length===3);
 await p.getByTestId('dock-home').click();await p.waitForTimeout(350);await p.getByTestId('page-dock').hover();await p.mouse.wheel(0,100);await p.waitForTimeout(350);ok(motionLevel+': wrap uses live remaining page count',await p.getByTestId('dock-clip').getAttribute('aria-selected')==='true');
 ok(motionLevel+': no page errors',errors.length===0);await c.close();
}
console.log('ALL PASSED ('+n+')');}finally{await b.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
