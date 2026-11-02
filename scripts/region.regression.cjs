// تعليق/وميض التكبير والتصغير: (1) الجسم المرسوم لا ينمو قبل أن تغطيه منطقة النافذة (أمر report_island_rect يعود أولًا)،
// (2) لا استدعاء متتالٍ بنفس المقاس (كل استدعاء = إعادة إنشاء المنطقة وإعادة رسم النافذة). تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/region.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0 } }));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
  const width = () => page.evaluate(() => Math.round(document.querySelector(".island-body").getBoundingClientRect().width));
  const pillW = await width();
  // تأخير ردّ report_island_rect 400ms (خلفية مشغولة): المنطقة لم تُغطِّ الحجم الجديد بعد.
  await page.evaluate(() => {
    const t = window.__TAURI_INTERNALS__, inv = t.invoke.bind(t);
    t.invoke = (cmd, args, o) => cmd === "report_island_rect" ? new Promise((r) => setTimeout(() => r(inv(cmd, args, o)), 400)) : inv(cmd, args, o);
  });
  await page.mouse.move(400, 10);
  await page.waitForTimeout(200);
  ok("growth waits for the region: body still pill-sized before report_island_rect returns", (await width()) <= pillW + 1, String(await width()));
  await page.waitForTimeout(1400);
  ok("body grows after the region covers it", (await width()) > pillW + 40, String(await width()));
  // لا طلبان متتاليان بنفس المقاس عبر دورة فتح/إغلاق كاملة.
  await page.mouse.move(700, 480); await page.waitForTimeout(2500);
  const rects = await page.evaluate(() => window.__calls.filter((c) => c[0] === "report_island_rect").map((c) => `${c[1].width}x${c[1].height}r${c[1].radius}`));
  ok("no consecutive identical report_island_rect calls", rects.every((r, i) => i === 0 || r !== rects[i - 1]), rects.join(" "));
  ok("returns to pill region at the end", rects[rects.length - 1] === rects[0], rects.join(" "));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
})();
