// Task 5 only. Build + vite preview on 4175, then NODE_PATH=... node this file.
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');
const { bridge } = require('./mockBridge.cjs');
const { buildSync } = require('esbuild');
const BASE = process.env.BASE || 'http://127.0.0.1:4175';
const OUT = '/tmp/my-island-task5-shots'; mkdirSync(OUT, { recursive: true });
let checks = 0;
const ok = (name, value) => { assert.ok(value, name); checks++; console.log(`PASS ${name}`); };
const moduleObject = { exports: {} };
const bundle = buildSync({ stdin: { contents: 'export { PACKS } from "./src/themePacks";', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
new Function('module','exports',bundle.outputFiles[0].text)(moduleObject,moduleObject.exports);
const families = ['seed','gradient','craft','editorial','shape','time','art','custom'];
const expectedPacks = families.flatMap(f => moduleObject.exports.PACKS.filter(p => p.family === f).map(p => p.id));
async function main() {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
 async function open(pack,language='ar',extra={},width=1200,route='settings.html') {
  const ctx = await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  const page = await ctx.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const settings = { language,settingsVersion:4,themePack:pack,themePackLight:pack,themePackDark:pack,themeMode:pack==='ivory'?'light':'dark',themeMaterial:'glass',glassStyle:'crystal',glassTint:45,motionLevel:'off',eyesEnabled:false,updateAutoCheck:false,...extra };
  await page.addInitScript(bridge({settings}));
  await page.goto(`${BASE}/${route}`);await page.waitForFunction(id=>document.documentElement.dataset.pack===id,pack);await page.waitForTimeout(350);
  if(route==='settings.html') { await page.locator('[data-nav="appearance"]').click();await page.getByTestId('appearance-basic').waitFor(); }
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);
  return {ctx,page,errors};
 }
 const patch = async(page,key)=>page.evaluate(key=>window.__calls.filter(c=>c[0]==='settings_set' && key in (c[1]?.patch||{})).at(-1)?.[1].patch,key);
 const apply = async(page,p)=>{await page.evaluate(p=>window.__emit('settings:changed',p),p);await page.waitForTimeout(100);};
 try {
  for(const pack of ['noir-gold','ivory','nebula-mesh']) for(const language of ['ar','en']) {
   const {ctx,page,errors}=await open(pack,language);const label=`${pack}/${language}`;
   ok(`${label}: six basic groups in reference order`,JSON.stringify(await page.locator('[data-basic]').evaluateAll(es=>es.map(e=>e.dataset.basic)))===JSON.stringify(['mode','theme','accent','material','density','edges']));
   ok(`${label}: one flat gallery`,await page.locator('[data-testid="theme-gallery"] [role="radiogroup"]').count()===1 && await page.locator('.tp-fam-title').count()===0);
   ok(`${label}: every existing card preserved in family order`,JSON.stringify(await page.locator('button[data-pack]').evaluateAll(es=>es.map(e=>e.dataset.pack)))===JSON.stringify(expectedPacks));
   ok(`${label}: no pack assignment section`,await page.getByText(language==='ar'?'تعيين الحزمة':'Pack assignment',{exact:true}).count()===0);
   ok(`${label}: advanced settings hidden on first open`,await page.getByTestId('appearance-advanced').count()===0 && await page.getByTestId('theme-export').count()===0);
   ok(`${label}: exactly two material choices`,await page.locator('[data-basic="material"] [role="radio"]').count()===2);
   ok(`${label}: basic sections do not overlap`,await page.locator('[data-basic]').evaluateAll(es=>es.every((e,n)=>n===0||es[n-1].getBoundingClientRect().bottom<=e.getBoundingClientRect().top+1)));
   ok(`${label}: no horizontal overflow`,await page.evaluate(()=>document.querySelector('.st-main').scrollWidth<=document.querySelector('.st-main').clientWidth+1));
   await page.setViewportSize({width:1200,height:2200});await page.getByTestId('appearance-body').screenshot({path:`${OUT}/${pack}-${language}-basic.png`});await page.setViewportSize({width:1200,height:1000});
   for(const id of ['noir-gold','ivory','nebula-mesh']) {
    await page.locator(`button[data-pack="${id}"]`).click(); const p=await patch(page,'themePack');
    ok(`select ${id}: three keys, no color/seed override`,JSON.stringify(p)===JSON.stringify({themePack:id,themePackLight:id,themePackDark:id}));await apply(page,p);
    ok(`select ${id}: exactly one selected card`,await page.locator('button[data-pack][aria-checked="true"]').count()===1 && await page.locator(`button[data-pack="${id}"]`).getAttribute('aria-checked')==='true');
   }
   const modes=page.locator('[data-basic="mode"]');await modes.getByRole('radio',{name:language==='ar'?'فاتح':'Light',exact:true}).click();await apply(page,await patch(page,'themeMode'));
   ok('switching light keeps selected pack',await page.evaluate(()=>document.documentElement.dataset.pack==='nebula-mesh'&&document.documentElement.dataset.theme==='light'));
   await page.locator('[data-basic="material"]').getByRole('radio',{name:language==='ar'?'مصمت':'Solid',exact:true}).click();const solid=await patch(page,'themeMaterial');
   ok('solid changes only material',JSON.stringify(solid)==='{"themeMaterial":"solid"}');await apply(page,solid);
   ok('solid applies to root',await page.evaluate(()=>document.documentElement.dataset.material==='solid'));
   await page.locator('[data-basic="material"]').getByRole('radio',{name:language==='ar'?'مثلّج':'Frosted',exact:true}).click();const frost=await patch(page,'glassStyle');await apply(page,frost);
   ok('frosted applies expected settings',frost.glassStyle==='crystal'&&frost.themeMaterial==='glass'&&frost.glassTint===45);
   await page.getByTestId('appearance-advanced-toggle').click();await page.getByTestId('theme-export').waitFor();
   ok('advanced exposes customization, shelf, export and typography',await page.getByTestId('shelf-save').isVisible() && await page.getByRole('slider',{name:language==='ar'?'حجم الخط':'Font size',exact:true}).count()===1 && await page.getByTestId('theme-import').count()===1);
   const download=page.waitForEvent('download');await page.getByTestId('theme-export').click();ok('theme export downloads JSON',(await download).suggestedFilename()==='myisland-theme.json');
   await page.getByRole('radio',{name:language==='ar'?'خبير':'Expert',exact:true}).click();await apply(page,await patch(page,'themeDisclosure'));
   ok('expert tokens remain available',await page.getByLabel('--accent hex',{exact:true}).count()===1);
   await page.getByRole('textbox',{name:language==='ar'?'اسم الثيم':'Theme name',exact:true}).fill('Saved fixture');await page.getByTestId('shelf-save').click();
   const saved=await patch(page,'myThemes');const savedId=saved.myThemes.at(-1).id;
   ok('shelf saves and selects the same user pack in both modes',saved.themePack===savedId&&saved.themePackLight===savedId&&saved.themePackDark===savedId);await apply(page,saved);
   await page.getByTestId('theme-import-file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'myisland-theme',version:1,theme:{themePack:'ivory',themePackLight:'ivory',themePackDark:'ivory',glassStyle:'clear'}}))});
   await page.waitForFunction(()=>window.__calls.some(c=>c[0]==='settings_set'&&c[1]?.patch?.themePack==='ivory'&&c[1]?.patch?.glassStyle==='clear'));
   const imported=await patch(page,'glassStyle');ok('theme import retains legacy clear and pack keys',imported.glassStyle==='clear'&&imported.themePackLight==='ivory'&&imported.themePackDark==='ivory');await apply(page,imported);
   await page.getByTestId('reset-theme-all').click();await page.getByTestId('reset-theme-all').click();const reset=await patch(page,'themeTune');
   ok('global reset retains the saved shelf',reset.themeMaterial==='glass'&&reset.glassStyle==='crystal'&&JSON.stringify(reset.themeTune)==='{}'&&!('myThemes' in reset));
   await page.getByTestId('appearance-advanced-toggle').click();
   ok('advanced closes without deleting settings',await page.getByTestId('appearance-advanced').count()===0);
   ok('no page errors',errors.length===0);await ctx.close();
  }
  for(const pack of ['noir-gold','ivory','nebula-mesh']) {
   const a=await open(pack,'en',{glassStyle:'clear',glassTint:25,backgroundOpacity:.8,themeDisclosure:'expert'});
   const b=await open(pack,'en',{glassStyle:'crystal',glassTint:25,backgroundOpacity:.8});
   const vars=page=>page.evaluate(()=>({glass:document.documentElement.dataset.glass,alpha:getComputedStyle(document.documentElement).getPropertyValue('--glass-a')}));
   ok(`${pack}: stored clear renders identically to frosted`,JSON.stringify(await vars(a.page))===JSON.stringify(await vars(b.page)));
   ok('stored expert still starts with advanced options closed',await a.page.getByTestId('appearance-advanced').count()===0);
   ok('legacy clear is not silently rewritten or deleted',await a.page.evaluate(()=>!window.__calls.some(c=>c[0]==='settings_set'&&'glassStyle' in(c[1]?.patch||{}))));
   await a.ctx.close();await b.ctx.close();
  }
  for(const width of [760,980]) {
   const o=await open('ivory','ar',{},width);
   ok(`responsive ${width}: no horizontal overflow`,await o.page.evaluate(()=>document.querySelector('.st-main').scrollWidth<=document.querySelector('.st-main').clientWidth+1));
   await o.page.setViewportSize({width,height:3000});await o.page.getByTestId('appearance-body').screenshot({path:`${OUT}/ivory-${width}.png`});await o.ctx.close();
  }
 } finally {await browser.close();}
 console.log(`ALL PASSED (${checks})`);
}
main().catch(e=>{console.error(e);process.exit(1);});
