// فحص انحدار تبويبات اللوحة الموسّعة (Playwright + جسر Tauri وهمي). تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/tabs.regression.cjs
// (يتطلب playwright مثبّتًا عمومًا؛ URL=... لتغيير العنوان). يغطي: كل تبويب بالتتابع، «تبويب آخر ثم الملاحظة»، توقف الإطارات
// (حركة الخروج لا تكتمل)، فشل تحميل حزمة الملاحظة، وعدم لمس فوكس النافذة عند فتح الملاحظة.
const { chromium } = require("playwright");
const SS = __dirname;
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${extra}`); };

const bridge = (cfg) => `
(() => {
  const cfg = ${JSON.stringify(cfg)};
  const listeners = {}; let nid = 1;
  window.__calls = []; window.__timers = 0; window.__raf = 0;
  const st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame;
  window.__count = false;
  window.__stk = []; window.setTimeout = (...a) => { if (window.__count) { window.__timers++; window.__stk.push(a[1] + ' ' + new Error().stack.split('\\n').slice(2,4).join(' | ')); } return st(...a); };
  window.setInterval = (...a) => { if (window.__count) window.__timers++; return si(...a); };
  window.__stall = false; window.__held = [];
  window.requestAnimationFrame = (f) => { if (window.__count) window.__raf++; if (window.__stall) { window.__held.push(f); return 0; } return raf(f); };
  window.__unstall = () => { window.__stall = false; window.__held.splice(0).forEach((f) => raf(f)); };
  window.__emit = (event, payload) => (listeners[event] || []).forEach((id) => window['_' + id] && window['_' + id]({ event, id, payload }));
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    transformCallback(cb) { const id = nid++; window['_' + id] = cb; return id; },
    unregisterCallback(id) { delete window['_' + id]; },
    convertFileSrc: (p) => p,
    invoke(cmd, args) {
      window.__calls.push([cmd, args]);
      if (cmd === 'plugin:event|listen') { (listeners[args.event] ||= []).push(args.handler); return Promise.resolve(args.handler); }
      if (cmd === 'plugin:event|unlisten') return Promise.resolve();
      if (cmd === 'settings_get') return Promise.resolve(cfg.settings);
      if (cmd === 'perf_status') return Promise.resolve({ eco: !!cfg.eco, reason: cfg.eco ? 'manual' : null, onBattery: null });
      if (cmd === 'media_now') return Promise.resolve({ info: cfg.media || { session: false, source: '', source_name: '', title: '', artist: '', album: '', duration: 0, position: 0, playing: false, can_prev: false, can_next: false, can_seek: false }, cover: null });
      if (cmd === 'record_status') return Promise.resolve({ recording: false, elapsed: 0 });
      if (['reminders_get','shelf_list','launcher_list','launcher_groups_get'].includes(cmd)) return Promise.resolve([]);
      if (cmd === 'launcher_hotkeys_get') return Promise.resolve({});
      if (cmd === 'attention_today') return Promise.resolve({ total: 0, apps: [], enabled: true, day: '2026-11-01' });
      if (cmd === 'downloads_list') return Promise.resolve({ active: [], recent: [] });
      if (cmd === 'island_backdrop') return cfg.backdrop === 'reject' ? Promise.reject('unsupported') : Promise.resolve(cfg.backdrop || 'none');
      if (cmd === 'clip_list' || cmd === 'color_history') return Promise.resolve([]);
      if (cmd === 'note_get') return Promise.resolve({ html: '<p>hello note</p>', folder: '' });
      if (cmd === 'note_folders_get') return Promise.resolve([]);
      if (cmd === 'battery_status') return Promise.resolve({ has_battery: true, percent: 80, ac: false, charging: false, remaining_min: 120, bt: [] });
      if (cmd === 'media_sources') return Promise.resolve([]);
      if (cmd === 'lyrics_get') return Promise.resolve({ synced: false, instrumental: false, lines: [], plain: 'la la', offline: false, found: true });
      if (cmd === 'monitors_list') return Promise.resolve([{ index: 0, name: 'm', width: 1920, height: 1080, primary: true }]);
      if (cmd === 'perf_ram') return Promise.resolve(cfg.ram || { total: 1, main: 1, webview: 0, webviewCount: 0, cpu: 0, active: false, metric: 'private' });
      if (cmd === 'editor_image') return Promise.resolve({ image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxgCAQqKtwwAAAAASUVORK5CYII=', path: 'C:/shots/a.png' });
      return Promise.resolve(null);
    },
  };
})();`;


const URL = process.env.URL || 'http://localhost:4173/index.html';
const MARK = { Home:'My time today', Clipboard:'Clipboard is empty', Shelf:null, Launcher:null, Note:'Reminders', Tools:'Area shot', Chat:null };
const view = (page) => page.evaluate(() => { const b=document.querySelector('.island-body'); return b ? b.textContent.replace(/\s+/g,' ') : ''; });
const sel = (page) => page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(t=>t.getAttribute('aria-selected')==='true')?.textContent);
const fresh = async (browser, extra={}) => {
  const ctx=await browser.newContext({viewport:{width:760,height:360}}); const page=await ctx.newPage();
  await page.addInitScript(bridge({settings:{language:'en',...extra}}));
  const errs=[]; page.on('pageerror',e=>errs.push((e.message||'').slice(0,100)));
  if (extra.__route) await page.route(extra.__route.re, extra.__route.fn);
  await page.goto(URL); await page.waitForTimeout(700);
  await page.mouse.move(380,10); await page.waitForTimeout(1400);
  return {ctx,page,errs};
};
// الصفحة الحالية تُظهر عرض تبويب X فقط: علامته موجودة وعلامات البقية غائبة
const shows = async (page, name) => { const v=await view(page); const mine=MARK[name]; const others=Object.entries(MARK).filter(([k,m])=>k!==name&&m).map(([,m])=>m); return (mine?v.includes(mine):true) && others.every(m=>!v.includes(m)); };
(async()=>{
 const browser=await chromium.launch();
 const names=['Home','Clipboard','Shelf','Launcher','Note','Tools','Chat'];
 // 1) كل تبويب بالتتابع يُظهر عرضه
 { const {ctx,page,errs}=await fresh(browser);
   const got=[]; for (const n of names) { await page.getByRole('tab',{name:n}).click(); await page.waitForTimeout(900); got.push([n, await sel(page)===n, await shows(page,n)]); }
   ok('sequential: every tab click selects it and shows ONLY its view', got.every(g=>g[1]&&g[2]), JSON.stringify(got.filter(g=>!(g[1]&&g[2]))));
   ok('sequential: no page errors', errs.length===0, JSON.stringify(errs)); await ctx.close(); }
 // 2) «تبويب آخر ثم الملاحظة» لكل تبويب آخر، وبسرعة أيضًا
 for (const wait of [900,60]) { const {ctx,page}=await fresh(browser); const bad=[];
   for (const n of names.filter(x=>x!=='Note')) { await page.getByRole('tab',{name:n}).click(); await page.waitForTimeout(wait===60?60:700); await page.getByRole('tab',{name:'Note'}).click(); await page.waitForTimeout(1300);
     if (!(await sel(page)==='Note' && await shows(page,'Note'))) bad.push(n); }
   ok('other tab → Note shows Note ('+(wait===60?'rapid 60ms gap':'settled')+')', bad.length===0, JSON.stringify(bad)); await ctx.close(); }
 // 3) توقف الإطارات (rAF لا يعمل: حركة الخروج لا تكتمل) — العرض يجب أن يتبدّل رغم ذلك
 { const {ctx,page}=await fresh(browser);
   await page.getByRole('tab',{name:'Clipboard'}).click(); await page.waitForTimeout(900);
   await page.evaluate(()=>{ window.__stall=true; });
   await page.getByRole('tab',{name:'Note'}).click(); await page.waitForTimeout(2200);
   const okv = (await sel(page))==='Note' && (await view(page)).includes('Reminders') && !(await view(page)).includes('Clipboard is empty');
   ok('frames stalled (exit animation cannot finish): Note view still appears, old view gone', okv, (await view(page)).slice(50,130));
   await ctx.close(); }
 // 4) فشل تحميل حزمة الملاحظة: الجزيرة لا تنهار، تُعرض رسالة، وبقية التبويبات تعمل، وإعادة المحاولة تنجح
 { let block=true;
   const {ctx,page,errs}=await fresh(browser,{__route:{re:/NoteTab/,fn:r=>block?r.abort():r.continue()}});
   await page.getByRole('tab',{name:'Clipboard'}).click(); await page.waitForTimeout(800);
   await page.getByRole('tab',{name:'Note'}).click(); await page.waitForTimeout(1500);
   const alive=await page.evaluate(()=>document.querySelector('#root').innerHTML.length>0);
   ok('Note chunk fails: island root survives (no blank/unmount)', alive);
   ok('Note chunk fails: an error message is shown in the panel', /failed to load|Retry/i.test(await view(page)), (await view(page)).slice(50,140));
   const tools=page.getByRole('tab',{name:'Tools'});
   if (await tools.count()) { await tools.click(); await page.waitForTimeout(900); }
   ok('other tabs still work after a failed Note', (await tools.count())>0 && await shows(page,'Tools') && await sel(page)==='Tools');
   await page.getByRole('tab',{name:'Note'}).click(); await page.waitForTimeout(900);
   block=false; const retry=page.getByRole('button',{name:/Retry/i}); if (await retry.count()) await retry.click();
   await page.waitForTimeout(1500); await page.mouse.move(0,300); await page.waitForTimeout(600); await page.mouse.move(380,10); await page.waitForTimeout(1500);
   await page.getByRole('tab',{name:'Note'}).click(); await page.waitForTimeout(1500);
   ok('Retry (page reload, since a failed dynamic import is cached) + network back ⇒ Note loads', (await view(page)).includes('Reminders'), (await view(page)).slice(50,130));
   await ctx.close(); }
 // 5) لا يجرّ تركيب الملاحظة سرقة فوكس: take_focus لا يُستدعى بلا نقر المستخدم داخل المحرّر
 { const {ctx,page}=await fresh(browser);
   await page.evaluate(()=>{window.__calls.length=0;});
   await page.getByRole('tab',{name:'Note'}).click(); await page.waitForTimeout(1500);
   const f=await page.evaluate(()=>window.__calls.filter(c=>c[0]==='take_focus'||c[0]==='release_focus').map(c=>c[0]));
   ok('mounting the Note tab does not touch window focus (no take_focus/release_focus)', f.length===0, JSON.stringify(f)); await ctx.close(); }
 await browser.close();
 console.log(fails?'FAILED '+fails:'ALL PASSED');
})()