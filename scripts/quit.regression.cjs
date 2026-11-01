// فحص زر «إغلاق الجزيرة» (Playwright + جسر وهمي): مثبّت أعلى الإعدادات، تأكيد على خطوتين، ولا يُنفَّذ الإغلاق فعليًا. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/quit.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
(async () => {
  const browser = await chromium.launch();
  for (const lang of ["en", "ar"]) {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 500 } });
    const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: lang }, extra: { app_quit: null } }));
    const errs = []; page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(800);
    const btn = page.locator('[data-testid="quit-btn"]');
    const L = lang === "en" ? ["Quit island", "Sure? Quit"] : ["إغلاق الجزيرة", "متأكد؟ إغلاق"];
    ok(`[${lang}] button exists with label`, (await btn.innerText()) === L[0], await btn.innerText());
    const top = await btn.evaluate((b) => { const r = b.getBoundingClientRect(); const side = document.querySelector(".st-side").getBoundingClientRect(); const list = document.querySelector("nav").getBoundingClientRect(); return { y: r.top, h: r.height, gap: side.bottom - r.bottom, belowList: r.top >= list.bottom - 1, inSide: !!b.closest(".st-side") }; });
    ok(`[${lang}] sits at the very bottom of the sidebar, below the list (not in a top bar)`, top.inSide && top.belowList && top.gap < 24, JSON.stringify(top));
    await page.evaluate(() => document.querySelector(".st-main").scrollTo(0, 2500)); await page.waitForTimeout(300);
    const after = await btn.evaluate((b) => document.querySelector(".st-side").getBoundingClientRect().bottom - b.getBoundingClientRect().bottom);
    ok(`[${lang}] still pinned & visible after scrolling the content far down`, after >= 0 && after < 24, String(after));
    ok(`[${lang}] the button is red (destructive)`, await btn.evaluate((b) => { const m = getComputedStyle(b).color.match(/\d+/g).map(Number); return m[0] > 180 && m[1] < 140 && m[2] < 140; }));
    ok(`[${lang}] step 0: not armed`, (await btn.getAttribute("data-armed")) === "false");
    await btn.click();
    ok(`[${lang}] step 1: label becomes confirm, armed`, (await btn.innerText()) === L[1] && (await btn.getAttribute("data-armed")) === "true", await btn.innerText());
    ok(`[${lang}] first click does NOT call app_quit`, (await page.evaluate(() => window.__calls.filter((c) => c[0] === "app_quit").length)) === 0);
    await page.waitForTimeout(4400);
    ok(`[${lang}] confirmation expires back to normal`, (await btn.innerText()) === L[0]);
    await btn.click(); await btn.click();
    ok(`[${lang}] second click calls app_quit once (mock — nothing really closes)`, (await page.evaluate(() => window.__calls.filter((c) => c[0] === "app_quit").length)) === 1);
    ok(`[${lang}] no page errors`, errs.length === 0, errs.join("|"));
    if (lang === "ar") await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/quit-ar.png` : "/dev/null" }).catch(() => {});
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
