// تراجع «وضع التموضع» (islandDocking): عائمة (الافتراضي حرفيًا كما كان) أو ملتصقة بأعلى الشاشة (زاويتا الأعلى مسطّحتان، الأسفل دائري).
// يتحقق من: الافتراضي، الأشكال في حبة/لمحة/لوحة، التبديل الحي بلا أخطاء ولا أمر نافذة إضافي، واجهة الإعدادات (تعطيل الإزاحة الرأسية)،
// ويلتقط لقطات للوضعين عند 100% و150% إلى docs/screenshots/docking-*.png. (متصفح بجسر Tauri وهمي — لا نافذة ويندوز حقيقية.)
//   npm run build && npx vite preview --port 4173 &   ثم:   node scripts/docking.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const radii = (page) => page.evaluate(() => {
  const b = document.querySelector(".island-body"); const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
  return { tl: parseFloat(cs.borderTopLeftRadius), tr: parseFloat(cs.borderTopRightRadius), bl: parseFloat(cs.borderBottomLeftRadius), br: parseFloat(cs.borderBottomRightRadius), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), dock: b.dataset.docking };
});
const open = async (browser, settings, scale = 1) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, pillRadius: 0, ...settings } }));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
  return { ctx, page, errs };
};

(async () => {
  const browser = await chromium.launch();
  // 1) الافتراضي = عائمة، الأربع زوايا متساوية (السلوك السابق حرفيًا)
  let s = await open(browser, {});
  let m = await radii(s.page);
  ok("default is floating", m.dock === "floating", JSON.stringify(m));
  ok("floating: all four corners equal (capsule)", m.tl === m.tr && m.tl === m.bl && m.tl === m.br && m.tl > 0, JSON.stringify(m));
  const calls0 = await s.page.evaluate(() => window.__calls.filter((c) => c[0] === "report_island_rect").length);
  await s.ctx.close();

  // 2) ملتصقة: الأعلى مسطّح والأسفل دائري، لحبة ولمحة ولوحة
  s = await open(browser, { islandDocking: "attached" });
  m = await radii(s.page);
  ok("attached: pill top corners flat", m.dock === "attached" && m.tl === 0 && m.tr === 0, JSON.stringify(m));
  ok("attached: pill bottom corners round (= floating radius)", m.bl > 0 && m.bl === m.br, JSON.stringify(m));
  ok("attached: body flush with top of window (y=0)", m.top === 0, JSON.stringify(m));
  await s.page.hover(".island-body"); await s.page.waitForTimeout(1200);
  let m2 = await radii(s.page);
  ok("attached: peek/panel still flat on top, round below", m2.tl === 0 && m2.tr === 0 && m2.bl > 0 && m2.bl === m2.br && m2.h >= m.h, JSON.stringify(m2));
  ok("attached: no page errors", s.errs.length === 0, s.errs.join("|"));
  await s.ctx.close();

  // 3) تبديل حي عبر settings:changed: بلا أخطاء وبلا أوامر نافذة جديدة غير report_island_rect
  s = await open(browser, {});
  await s.page.evaluate(() => { window.__calls.length = 0; window.__emit("settings:changed", { islandDocking: "attached" }); });
  await s.page.waitForTimeout(1200);
  m = await radii(s.page);
  ok("live switch floating→attached flattens top corners", m.dock === "attached" && m.tl === 0 && m.bl > 0, JSON.stringify(m));
  await s.page.evaluate(() => window.__emit("settings:changed", { islandDocking: "floating" }));
  await s.page.waitForTimeout(1200);
  m = await radii(s.page);
  ok("live switch attached→floating restores capsule", m.dock === "floating" && m.tl === m.bl && m.tl > 0, JSON.stringify(m));
  const cmds = await s.page.evaluate(() => [...new Set(window.__calls.map((c) => c[0]).filter((c) => !c.startsWith("plugin:")))]);
  ok("switch issues no focus/window commands", !cmds.some((c) => /focus|hide|show/.test(c)), cmds.join(","));
  ok("switch: no page errors", s.errs.length === 0, s.errs.join("|"));
  await s.ctx.close();

  // 4) إعدادات: المفتاح والتعطيل
  const ctx = await browser.newContext({ viewport: { width: 980, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", settingsVersion: 3, islandDocking: "floating" } }));
  await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(800);
  await page.locator('[data-nav="island"]').click(); await page.waitForTimeout(400);
  const seg = page.locator('[role=radiogroup][aria-label="Docking mode"]');
  ok("settings: docking control exists with 2 options", (await seg.count()) === 1 && (await seg.locator("[role=radio]").count()) === 2);
  const slider = page.locator('input[type=range][aria-label="Vertical offset"]');
  ok("settings: vertical offset enabled while floating", await slider.isEnabled());
  await seg.locator("[role=radio]").nth(1).click(); await page.waitForTimeout(300);
  const patch = await page.evaluate(() => window.__calls.filter((c) => c[0] === "settings_set").map((c) => c[1].patch).filter((p) => p && "islandDocking" in p));
  ok("settings: click saves islandDocking=attached", patch.length === 1 && patch[0].islandDocking === "attached", JSON.stringify(patch));
  await page.evaluate(() => window.__emit("settings:changed", { islandDocking: "attached" })); await page.waitForTimeout(300);
  ok("settings: vertical offset disabled while attached", await slider.isDisabled());
  await ctx.close();

  // 5) لقطات: وضعان × تحجيمان
  const fs = require("fs"); fs.mkdirSync("docs/screenshots", { recursive: true });
  for (const scale of [1, 1.5]) for (const dock of ["floating", "attached"]) {
    const o = await open(browser, { islandDocking: dock, offsetY: 0 }, scale);
    await o.page.screenshot({ path: `docs/screenshots/docking-${dock}-${scale === 1 ? "100" : "150"}.png`, clip: { x: 200, y: 0, width: 400, height: 120 } });
    await o.page.hover(".island-body"); await o.page.waitForTimeout(1200);
    await o.page.screenshot({ path: `docs/screenshots/docking-${dock}-${scale === 1 ? "100" : "150"}-open.png`, clip: { x: 40, y: 0, width: 720, height: 360 } });
    ok(`screenshots ${dock}@${scale * 100}%`, o.errs.length === 0, o.errs.join("|"));
    await o.ctx.close();
  }
  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
