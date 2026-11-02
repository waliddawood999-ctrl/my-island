// دوك الصفحات: ٥ صفحات (الرئيسية · الالتقاط · الحافظة · التطبيقات · الأدوات)؛ الأدوات تحمل تبويبات فرعية؛ الوحدات المطفأة تُخفي صفحاتها؛ الأنماط القديمة سليمة. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/dock.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const open = async (browser, settings) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, ...settings } }));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(800);
  await page.mouse.move(400, 10); await page.waitForTimeout(500); await page.click(".island-body"); await page.waitForTimeout(1600);
  return { ctx, page, errs };
};
(async () => {
  const browser = await chromium.launch();
  let { ctx, page, errs } = await open(browser, { panelTabsStyle: "dock" });
  const ids = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="dock-"]')].map((e) => e.dataset.testid.slice(5)));
  const activeLabel = () => page.evaluate(() => { const a = document.querySelector('[data-testid^="dock-"][aria-selected="true"]'); return a ? a.getAttribute("aria-label") : null; });
  ok("dock shows five pages in order", JSON.stringify(await ids()) === JSON.stringify(["home", "capture", "clip", "apps", "work"]), JSON.stringify(await ids()));
  ok("home is active and the old top tab bar is gone", (await activeLabel()) === "Home" && (await page.locator('[role="tablist"]:not([data-testid])').count()) === 0);
  await page.click('[data-testid="dock-capture"]'); await page.waitForTimeout(700);
  ok("Capture page = the tools page (area shot button)", (await page.getByText("Area shot").count()) >= 1 && (await activeLabel()) === "Capture");
  await page.click('[data-testid="dock-work"]'); await page.waitForTimeout(700);
  ok("Tools page has sub-tabs (shelf · note · meetings · system)", (await page.locator('[data-testid="sub-tabs"] [role="tab"]').count()) >= 3);
  await page.locator('[data-testid="sub-tabs"] [role="tab"]').last().click(); await page.waitForTimeout(600);
  const lastSub = await page.locator('[data-testid="sub-tabs"] [aria-selected="true"]').innerText();
  await page.click('[data-testid="dock-home"]'); await page.waitForTimeout(500);
  await page.click('[data-testid="dock-work"]'); await page.waitForTimeout(600);
  ok("returning to Tools restores the last sub-tab", (await page.locator('[data-testid="sub-tabs"] [aria-selected="true"]').innerText()) === lastSub, lastSub);
  ok("settings button lives on the dock row", (await page.locator('button[aria-label="Settings"]').count()) >= 1);
  ok("no page errors", errs.length === 0, errs.join("|"));
  await page.screenshot({ path: process.env.SHOT || "/tmp/dock.png" });
  await ctx.close();
  // وحدة مطفأة ⇒ صفحتها تختفي
  ({ ctx, page } = await open(browser, { panelTabsStyle: "dock", moduleLauncher: false }));
  ok("moduleLauncher off ⇒ Apps page hidden", JSON.stringify(await ids()) === JSON.stringify(["home", "capture", "clip", "work"]), JSON.stringify(await ids()));
  await ctx.close();
  // الأنماط القديمة تعمل كما كانت
  for (const style of ["labels", "icons", "dots"]) {
    ({ ctx, page } = await open(browser, { panelTabsStyle: style }));
    ok(`legacy style "${style}": no dock, tab bar present`, (await page.locator('[data-testid="page-dock"]').count()) === 0 && (await page.locator('[role="tablist"]').count()) >= 1);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
})();
