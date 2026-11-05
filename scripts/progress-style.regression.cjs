// Task 4: production UI + pure settings contract. Build, serve vite preview on 4173, then run with Playwright.
const assert = require('node:assert/strict');
const { mkdirSync, readFileSync, mkdtempSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');
const { bridge } = require('./mockBridge.cjs');
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = '/tmp/my-island-task4-shots'; mkdirSync(OUT, { recursive: true });
let checks = 0;
function ok(name, value) { assert.ok(value, name); checks++; console.log(`PASS ${name}`); }
const media = { session: true, kind: 'gsmtc', source: 'YouTube', source_name: 'YouTube', title: 'سورة الكهف', artist: 'مشاري راشد العفاسي', album: '', duration: 240, position: 60, playing: true, can_seek: true, can_prev: true, can_next: true };
const styles = ['line','shimmer','wave','liquid','dashes','ring'];
async function main() {
  if (!process.env.BASELINE) {
    const tmp = mkdtempSync('/tmp/progress-contract-');
    const build = require('esbuild').buildSync({ stdin: { contents: 'export * from "./src/settings"; export * from "./src/appearance";', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
    writeFileSync(`${tmp}/contract.cjs`, build.outputFiles[0].text); const a = require(`${tmp}/contract.cjs`);
    ok('defaults: line and both booleans true', a.DEFAULTS.progressStyle === 'line' && a.DEFAULTS.progressMotion === true && a.DEFAULTS.progressScrubTime === true);
    ok('exactly six allowed styles', JSON.stringify(a.PROGRESS_STYLES) === JSON.stringify(styles));
    for (const style of styles) ok(`import accepts ${style}`, a.parseImport(JSON.stringify({ app: 'myisland', settings: { progressStyle: style } }), {}).progressStyle === style);
    ok('import rejects invalid style and nonboolean switches', JSON.stringify(a.parseImport(JSON.stringify({ app: 'myisland', settings: { progressStyle: 'fake', progressMotion: 'line', progressScrubTime: 1 } }), {})) === '{}');
    ok('unknown style falls back to line', a.progressStyle('fake') === 'line');
    ok('reset includes new defaults', a.resetPatch(a.SECTION_KEYS.modules).progressStyle === 'line' && a.resetPatch(a.SECTION_KEYS.modules).progressMotion === true);
    const rust = readFileSync('src-tauri/src/state.rs','utf8');
    ok('native defaults match', rust.includes('"progressStyle": "line"') && rust.includes('"progressMotion": true') && rust.includes('"progressScrubTime": true'));
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
  async function open(pack, style, extra = {}, height = 360, route = 'index.html', mediaExtra = {}, onlyPeek = false) {
    const ctx = await browser.newContext({ viewport: { width: route === 'index.html' ? 800 : 1200, height: route === 'index.html' ? 500 : 1000 } });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const settings = { language: 'ar', settingsVersion: 4, panelTabsStyle: 'dock', panelWidth: height < 340 ? 720 : 560, panelHeight: height, eyesEnabled: false, hoverDelayMs: 0, motionLevel: 'off', themeMode: pack === 'ivory' ? 'light' : 'dark', themePack: pack, themePackLight: pack, themePackDark: pack, themeMaterial: 'solid', updateAutoCheck: false, showToday: false, showWeather: false, showBattery: false, ...(style ? { progressStyle: style } : {}), ...extra };
    await page.addInitScript(bridge({ settings, media: { ...media, ...mediaExtra }, eco: !!extra.ecoMode, cover: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#124b3b"/></svg>').toString('base64')}` }));
    await page.goto(`${BASE}/${route}`); await page.waitForFunction(id => document.documentElement.dataset.pack === id, pack);
    await page.waitForTimeout(650);
    if (route === 'index.html') {
      const pill = await page.locator('.island-body').boundingBox(); await page.mouse.move(pill.x + pill.width / 2, pill.y + 2); await page.waitForTimeout(350);
      if (!onlyPeek) { const peek = await page.locator('.island-body').boundingBox(); await page.mouse.click(peek.x + peek.width / 2, peek.y + 2); }
      await page.getByTestId(onlyPeek ? 'player-peek' : 'player-panel').waitFor();
    }
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700);
    return { ctx, page, errors };
  }
  try {
    // Baseline mode records the pre-feature line shape for comparison after implementation.
    if (process.env.BASELINE) {
      const { ctx, page } = await open('noir-gold');
      const baseline = await page.getByTestId('seekbar').evaluate(el => { const t = el.querySelector('.sk-track'); const k = el.querySelector('.sk-knob'); return { height: t.getBoundingClientRect().height, background: getComputedStyle(t).backgroundColor, knob: getComputedStyle(k).width, sliderHeight: el.querySelector('.sk').getBoundingClientRect().height }; });
      require('node:fs').writeFileSync('/tmp/my-island-task4-line-baseline.json', JSON.stringify(baseline));
      await ctx.close(); console.log('BASELINE RECORDED'); return;
    }
    if (!process.env.ONLY_PEEK) {
    for (const pack of ['noir-gold','ivory','nebula-mesh']) for (const style of styles) {
      const { ctx, page, errors } = await open(pack, style);
      ok(`${pack}/${style}: root style`, await page.evaluate(s => document.documentElement.dataset.pstyle === s, style));
      const panel = page.getByTestId('player-panel'); const slider = panel.getByRole('slider');
      ok(`${style}: seek and time row remain accessible`, await slider.isVisible() && await panel.getByTestId('times').isVisible());
      ok(`${style}: ring only when chosen`, await panel.locator('[data-testid="progress-ring"]').count() === Number(style === 'ring'));
      ok(`${style}: wave only when chosen`, await panel.locator('.sk-wave').count() === Number(style === 'wave'));
      const b = await slider.boundingBox(); await page.mouse.move(b.x + b.width * .2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width * .7, b.y + b.height / 2);
      ok(`${style}: preview stays in times row`, (await panel.getByTestId('time-target').innerText()).length > 0);
      ok(`${style}: no seek until release`, !await page.evaluate(() => window.__calls.some(c => c[0] === 'media_seek')));
      await page.mouse.up();
      ok(`${style}: one accurate seek on release`, await page.evaluate(() => { const c = window.__calls.filter(c => c[0] === 'media_seek'); return c.length === 1 && Math.abs(c[0][1].seconds - 168) < 2; }));
      await page.mouse.move(0,490); await page.evaluate(() => document.activeElement?.blur()); await page.locator('.island-body').screenshot({ path: `${OUT}/${pack}-${style}.png` });
      await slider.press('Home'); ok(`${style}: keyboard seek`, await page.evaluate(() => window.__calls.some(c => c[0] === 'media_seek' && c[1].seconds === 0)));
      ok(`${style}: no overlap with dock`, await panel.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('[data-testid="page-dock"]').getBoundingClientRect().top + 1));
      ok(`${style}: no page errors`, errors.length === 0);
      await ctx.close();
    }
    for (const [name, opts, expected] of [['full', { motionLevel: 'full' }, true], ['reduced', { motionLevel: 'reduced' }, false], ['off', { motionLevel: 'off' }, false], ['switch off', { motionLevel: 'full', progressMotion: false }, false], ['eco', { motionLevel: 'full', ecoMode: true }, false]]) {
      const o = await open('noir-gold','shimmer',opts);
      ok(`${name}: shimmer motion respects effective preference`, await o.page.locator('.sk-shimmer').count() === Number(expected));
      await o.ctx.close();
    }
    for (const value of [true,false]) {
      const o = await open('ivory','wave',{ progressScrubTime: value }); const slider = o.page.getByRole('slider'); const b = await slider.boundingBox();
      await o.page.mouse.move(b.x + b.width / 2,b.y + b.height / 2); await o.page.mouse.down();
      ok(`scrub time ${value}`, !!(await o.page.getByTestId('time-target').innerText()) === value);
      await o.page.mouse.up(); await o.ctx.close();
    }
    for (const style of styles) {
      const o = await open('nebula-mesh',style,{},270);
      ok(`wide/${style}: controls above dock`, await o.page.getByTestId('player-panel').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('[data-testid="page-dock"]').getBoundingClientRect().top));
      await o.ctx.close();
    }
    {
      const o = await open('noir-gold','shimmer',{},360,'index.html',{ buffered: 180, chapters: [40,120,180] });
      ok('shimmer renders provided buffer and chapters', await o.page.locator('.sk-buffer').count() === 1 && await o.page.locator('.sk-chapter').count() === 3);
      await o.ctx.close();
    }
    for (const pack of ['noir-gold','ivory','nebula-mesh']) {
      const o = await open(pack,'line',{},360,'settings.html'); await o.page.locator('[data-nav="modules"]').click();
      await o.page.getByTestId('progress-option-line').waitFor();
      ok(`${pack}: six radio cards`, await o.page.locator('.progress-style-grid [role="radio"]').count() === 6);
      const grid = await o.page.locator('.progress-style-grid').evaluate(el => ({ cols: getComputedStyle(el).gridTemplateColumns.split(' ').length, rows: getComputedStyle(el).gridTemplateRows.split(' ').length }));
      ok(`${pack}: 2 rows by 3 columns`, grid.cols === 3 && grid.rows === 2);
      for (const style of styles) {
        await o.page.getByTestId(`progress-option-${style}`).click();
        ok(`selection saves ${style}`, await o.page.evaluate(s => window.__calls.some(c => c[0] === 'settings_set' && c[1].patch.progressStyle === s),style));
        await o.page.evaluate(style => window.__emit('settings:changed',{progressStyle:style}),style);
        await o.page.waitForFunction(s => document.documentElement.dataset.pstyle === s,style);
        ok(`selection shows ${style}`, await o.page.getByTestId(`progress-option-${style}`).getAttribute('aria-checked') === 'true');
      }
      await o.page.getByRole('switch',{name:'حركة الشريط',exact:true}).click();
      ok('motion toggle saves false', await o.page.evaluate(() => window.__calls.some(c => c[0] === 'settings_set' && c[1].patch.progressMotion === false)));
      await o.page.getByRole('switch',{name:'الوقت أثناء السحب',exact:true}).click();
      ok('scrub toggle saves false', await o.page.evaluate(() => window.__calls.some(c => c[0] === 'settings_set' && c[1].patch.progressScrubTime === false)));
      await o.page.locator('.progress-style-grid').screenshot({path:`${OUT}/${pack}-settings.png`}); await o.ctx.close();
    }
    }
    for (const style of styles) {
      const o = await open('noir-gold',style,{},360,'index.html',{},true);
      ok(`peek/${style}: header, seek and controls do not overlap`, await o.page.getByTestId('player-peek').evaluate(el => { const a = el.querySelector('.pill-hover-header').getBoundingClientRect(), b = el.querySelector('[data-testid="seekbar"]').getBoundingClientRect(), c = el.querySelector('[data-testid="player-controls"]').getBoundingClientRect(), root = el.getBoundingClientRect(); return a.bottom <= b.top + 1 && b.bottom <= c.top + 1 && c.bottom <= root.bottom + 1; }));
      await o.page.locator('.island-body').screenshot({path:`${OUT}/peek-${style}.png`});
      await o.ctx.close();
    }
    const { ctx, page } = await open('noir-gold');
    const actual = await page.getByTestId('seekbar').evaluate(el => { const t = el.querySelector('.sk-track'); const k = el.querySelector('.sk-knob'); return { height: t.getBoundingClientRect().height, background: getComputedStyle(t).backgroundColor, knob: getComputedStyle(k).width, sliderHeight: el.querySelector('.sk').getBoundingClientRect().height }; });
    ok('default line matches pre-feature dimensions and colors', JSON.stringify(actual) === JSON.stringify({ height: 4, background: 'rgba(255, 255, 255, 0.16)', knob: '11px', sliderHeight: 20 }));
    await ctx.close();
  } finally { await browser.close(); }
  console.log(`ALL PASSED (${checks})`);
}
main().catch(e => { console.error(e); process.exit(1); });
