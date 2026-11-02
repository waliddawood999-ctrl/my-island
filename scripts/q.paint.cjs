// كلفة الرسم/التخطيط/التبلير لكل دورة فتح/إغلاق عبر تتبّع Chromium (Paint/UpdateLayoutTree/Layout/RasterTask/…): مقارنة قبل/بعد ARCH.
//   BASE=http://localhost:4173 NODE_PATH=$(npm root -g) node scripts/q.paint.cjs [out.json]
const { chromium } = require("playwright"); const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173"; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch(); const out = {}; const runs = +(process.env.RUNS || 4);
  for (const dpr of [1, 1.5]) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: dpr }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, theme: "aurora" } }));
    await page.goto(`${BASE}/index.html`); await sleep(1000);
    await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "gpu"] });
    for (let n = 0; n < runs; n++) { await page.hover(".island-body"); await sleep(1300); await page.click(".island-body"); await sleep(1500); await page.mouse.move(5, 480); await sleep(1700); }
    const buf = await browser.stopTracing(); const ev = JSON.parse(buf.toString()).traceEvents;
    const sum = {}; const add = (k, d) => { sum[k] = (sum[k] || 0) + d / 1000; };
    for (const e of ev) if (e.ph === "X" && e.dur && ["Paint", "PrePaint", "Layerize", "UpdateLayoutTree", "Layout", "RasterTask", "ImageDecodeTask", "Commit", "UpdateLayer", "CompositeLayers"].includes(e.name)) add(e.name, e.dur);
    out[dpr] = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, +(v / runs).toFixed(1)])); // ms لكل دورة (فتح+لوحة+إغلاق)
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); if (process.argv[2]) require("fs").writeFileSync(process.argv[2], JSON.stringify(out, null, 2)); await browser.close();
})();
