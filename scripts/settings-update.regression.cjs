// Settings acceptance: interaction, actual save acknowledgements/failures, imports and RTL.
const { chromium } = require('playwright');
const { bridge } = require('./mockBridge.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.SETTINGS_BROWSER_EXECUTABLE || undefined });
  let checks = 0;
  const ok = (name, value) => { assert(value, name); checks++; console.log('OK '+name); };
  const open = async (settings={}) => {
    const ctx = await browser.newContext({viewport:{width:980,height:700},acceptDownloads:true});
    const page=await ctx.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(bridge({settings:{language:'en',settingsVersion:4,...settings}}));
    await page.addInitScript(() => {
      const base=window.__TAURI_INTERNALS__.invoke;
      window.__saveDelay=40;window.__rejectSaves=false;window.__activeSaves=0;window.__maxSaves=0;
      window.__TAURI_INTERNALS__.invoke=async (cmd,args) => {
        if(cmd!=='settings_set')return base(cmd,args);
        window.__calls.push([cmd,args]);window.__activeSaves++;window.__maxSaves=Math.max(window.__maxSaves,window.__activeSaves);
        await new Promise(r=>setTimeout(r,window.__saveDelay));window.__activeSaves--;
        if(window.__rejectSaves)throw new Error('Simulated storage failure');
        window.__emit('settings:changed',args.patch);return null;
      };
    });
    for(let n=0;;n++){try { await page.goto(BASE+'/settings.html'); break; }catch(e){if(n>=10)throw e;await new Promise(r=>setTimeout(r,500));}}
    await page.getByRole('switch',{name:settings.language === 'ar' ? 'التشغيل مع ويندوز' : 'Start with Windows',exact:true}).waitFor();
    return {ctx,page,errors};
  };
  const nav=async(p,id)=>{await p.locator(`[data-nav="${id}"]`).click();await p.locator(`[data-group="${id}"]`).waitFor();};
  const patch=async p=>p.evaluate(()=>window.__calls.filter(c=>c[0]==='settings_set').at(-1)?.[1]?.patch);
  const saved=async p=>{await p.locator('[data-testid="save-status"][data-state="saved"]').waitFor();};
  try {
    const {ctx,page:p,errors}=await open({themePackDark:'carbon-fibre',themePackLight:'porcelain'});
    ok('seven coherent navigation groups',JSON.stringify(await p.locator('nav [data-nav]').evaluateAll(a=>a.map(e=>e.dataset.nav)))===JSON.stringify(['general','island','appearance','motion','modules','shortcuts','system']));
    await p.getByRole('switch',{name:'Start with Windows',exact:true}).click();await saved(p);ok('successful save acknowledged',(await patch(p)).autostart===true);
    await p.evaluate(()=>{window.__rejectSaves=true;});
    await p.getByRole('switch',{name:'Start with Windows',exact:true}).click();await p.locator('[data-state="error"]').waitFor();ok('failed save does not change switch',(await p.getByRole('switch',{name:'Start with Windows',exact:true}).getAttribute('aria-checked'))==='true');
    await p.evaluate(()=>{window.__saveDelay=350;});
    await p.getByTestId('import-file').setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'myisland',settings:{language:'en',motionSpeed:999,loaded:true}}))});
    await p.getByText('Importing…',{exact:true}).waitFor();await p.getByText('Save failed; try again',{exact:true}).first().waitFor();ok('import never reports success on save failure',await p.getByText(/Imported \d/).count()===0);
    await p.evaluate(()=>{window.__rejectSaves=false;window.__saveDelay=40;});
    await p.getByTestId('retry-save').click();await saved(p);ok('failed values can be retried explicitly',(await patch(p)).autostart===false);
    await p.getByTestId('import-file').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'myisland',settings:{clockScale:120,motionSpeed:999,loaded:true}}))});
    await p.getByText('Imported 1 valid settings',{exact:true}).waitFor();ok('invalid import keys excluded',JSON.stringify(await patch(p))===JSON.stringify({clockScale:120}));
    const dlPromise=p.waitForEvent('download');await p.getByTestId('export-btn').click();const dl=await dlPromise;const file=await dl.path();const ex=JSON.parse(fs.readFileSync(file,'utf8')).settings;ok('export excludes runtime state',!('loaded'in ex)&&!('fx'in ex)&&!('environment'in ex));
    await nav(p,'island');await p.getByRole('switch',{name:'Show clock',exact:true}).click();await saved(p);ok('clock children collapse without deleting saved placement',await p.getByTestId('clock-pad').isHidden() && !('clockX'in await patch(p)));
    ok('fine dimensions collapsed',await p.getByRole('slider',{name:'Pill width',exact:true}).isHidden());
    await p.getByText('Advanced dimensions',{exact:true}).click();ok('fine dimensions remain available',await p.getByRole('slider',{name:'Pill width',exact:true}).isVisible());
    await nav(p,'appearance');ok('surface module initially collapsed',await p.locator('#tpm-surfaces').count()===0);ok('no duplicate global pack dropdown',await p.getByRole('combobox',{name:'Pack',exact:true}).count()===0);ok('per-mode overrides advanced only',await p.getByRole('combobox',{name:'Dark-mode pack',exact:true}).count()===0);
    await p.locator('button[data-pack="ember"]').click();await saved(p);const th=await patch(p);ok('gallery applies to both modes',th.themePack==='ember'&&th.themePackDark===''&&th.themePackLight==='');
    await p.getByRole('radio',{name:'Advanced',exact:true}).click();await saved(p);await p.getByRole('combobox',{name:'Dark-mode pack',exact:true}).selectOption('carbon-fibre');await saved(p);await p.getByRole('combobox',{name:'Light-mode pack',exact:true}).selectOption('porcelain');await saved(p);
    await p.mouse.move(0,0);ok('split preview reflects independent mode assignments',await p.locator('.tp-split [data-pack-preview="carbon-fibre"]').count()===1 && await p.locator('.tp-split [data-pack-preview="porcelain"]').count()===1);
    await nav(p,'motion');await p.getByRole('radio',{name:'Off',exact:true}).click();await saved(p);ok('single motion choice stores consistent keys',(await patch(p)).motionLevel==='off'&&(await patch(p)).reduceMotion==='never');ok('inactive bounce control collapses',await p.getByRole('slider',{name:'Bounce',exact:true}).isHidden());
    await p.getByRole('radio',{name:'Off',exact:true}).focus();await p.keyboard.press('Home');await saved(p);ok('radio keyboard Home chooses system',(await patch(p)).reduceMotion==='system');
    await nav(p,'modules');await p.getByRole('radio',{name:'GIF',exact:true}).click();await saved(p);ok('GIF shows effective 20 FPS',await p.getByTestId('gif-fps').isVisible()&&await p.getByRole('radiogroup',{name:'Recording FPS',exact:true}).count()===0);
    const n0=await p.evaluate(()=>window.__calls.filter(c=>c[0]==='attention_clear').length);await p.getByTestId('clear-attention').click();ok('destructive clear first click does not delete',(await p.evaluate(()=>window.__calls.filter(c=>c[0]==='attention_clear').length))===n0);await p.getByTestId('clear-attention').click();ok('clear requires confirmation',(await p.evaluate(()=>window.__calls.filter(c=>c[0]==='attention_clear').length))===n0+1);
    await p.getByTestId('settings-search').fill('clock size');ok('search reaches disabled child settings',await p.getByRole('slider',{name:'Clock size',exact:true}).isVisible()&&await p.getByRole('slider',{name:'Clock size',exact:true}).isDisabled());await p.getByTestId('settings-search').fill('');
    ok('writes are serialised',await p.evaluate(()=>window.__maxSaves===1));ok('no page errors',errors.length===0);
    fs.mkdirSync('docs/screenshots',{recursive:true});await nav(p,'appearance');await p.screenshot({path:'docs/screenshots/settings-update-en.png'});await ctx.close();
    const {ctx:arCtx,page:ar,errors:arErrors}=await open({language:'ar'});await nav(ar,'appearance');ok('Arabic RTL',await ar.locator('.st-root').getAttribute('dir')==='rtl');ok('Arabic layout does not overflow',await ar.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth && document.querySelector('.st-main').scrollWidth<=document.querySelector('.st-main').clientWidth+1));await ar.screenshot({path:'docs/screenshots/settings-update-ar.png'});ok('no Arabic page errors',arErrors.length===0);await arCtx.close();
    console.log(`PASS ${checks} settings acceptance checks`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
