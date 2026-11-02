// كلفة الفتح/الإغلاق على الخيط الرئيسي (CDP Performance.getMetrics): نصّ/تخطيط/أنماط/سكربت لكل دورة (لمحة→لوحة→إغلاق) + أزمنة الإطارات. أرقام نسبية (Chromium برمجي).
const { chromium } = require("playwright"); const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173"; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEDIA = { session: true, source: "Spotify.exe", source_name: "Spotify", title: "A long song title", artist: "Artist", album: "Album", duration: 240, position: 30, playing: false, can_prev: true, can_next: true, can_seek: true, kind: "gsmtc", degraded: false };
const metrics = async (cdp) => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
(async () => {
  const browser = await chromium.launch(); const out = {};
  const runs = +(process.env.RUNS || 5);
  for (const dpr of [1, 1.5]) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: dpr }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3 }, media: MEDIA, extra: { media_now: { info: MEDIA, cover: null } } }));
    await page.goto(`${BASE}/index.html`); await sleep(1000);
    const cdp = await ctx.newCDPSession(page); await cdp.send("Performance.enable");
    const acc = { open: [], panel: [], close: [] }; const ft = { open: [], panel: [], close: [] };
    const frames = (key, action, ms) => page.evaluate(() => { window.__ft = []; let last = performance.now(); const f = (t) => { window.__ft.push(t - last); last = t; if (window.__run) requestAnimationFrame(f); }; window.__run = true; requestAnimationFrame(f); }).then(action).then(() => sleep(ms)).then(() => page.evaluate(() => { window.__run = false; return window.__ft.slice(1); })).then((v) => ft[key].push(v));
    for (let n = 0; n < runs; n++) {
      for (const [key, act, ms] of [["open", () => page.hover(".island-body"), 1300], ["panel", () => page.click(".island-body"), 1500], ["close", () => page.mouse.move(5, 480), 1700]]) {
        const m0 = await metrics(cdp); await frames(key, act, ms); const m1 = await metrics(cdp);
        acc[key].push({ task: (m1.TaskDuration - m0.TaskDuration) * 1000, layout: (m1.LayoutDuration - m0.LayoutDuration) * 1000, style: (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000, script: (m1.ScriptDuration - m0.ScriptDuration) * 1000, layouts: m1.LayoutCount - m0.LayoutCount });
      }
    }
    const avg = (a, k) => +(a.reduce((s, x) => s + x[k], 0) / a.length).toFixed(1);
    out[dpr] = {};
    for (const key of ["open", "panel", "close"]) {
      const all = ft[key].flat(); const worst = Math.max(...all);
      out[dpr][key] = { taskMs: avg(acc[key], "task"), layoutMs: avg(acc[key], "layout"), styleMs: avg(acc[key], "style"), scriptMs: avg(acc[key], "script"), layoutCount: avg(acc[key], "layouts"), frameMeanMs: +(all.reduce((a, b) => a + b, 0) / all.length).toFixed(2), frameWorstMs: +worst.toFixed(1), framesOver20: all.filter((x) => x > 20).length, frames: all.length };
    }
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); require("fs").writeFileSync(process.argv[2] || "docs/q/cost.json", JSON.stringify(out, null, 2)); await browser.close();
})();
