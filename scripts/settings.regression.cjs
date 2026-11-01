// فحص تخطيط الإعدادات كقائمة أقسام (Playwright + جسر وهمي): قسم واحد في كل مرة، التنقّل بين الأقسام الأربعة،
// وصول كل المفاتيح السابقة عبر أقسامها، وبقاء شريط «إغلاق الجزيرة» مثبّتًا بتأكيده. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/settings.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
// عناصر التحكم (aria-label) كما كانت قبل التخطيط الجديد، بالترتيب (63) — يجب أن تبقى كلها قابلة للوصول.
const BASELINE = ["Check for updates automatically", "Start with Windows", "Language", "Monitor", "Horizontal offset", "Under the taskbar", "Hover delay", "Collapse delay", "Auto-hide", "Hide in fullscreen", "Show clock", "Clock format", "Pill width", "Pill height", "Theme", "Material", "Opacity at rest", "Opacity when open", "Mascot eyes", "Browser tab mode", "Audio spectrum & liquid pill", "Lyrics in Home", "Lyrics in player", "Show the Today section", "City", "Prayer alerts", "Weather", "Temperature unit", "Event countdowns", "Event name", "Event date", "Mini world clock", "Alert sound", "Show battery", "“Unplug at 80%” tip", "Bluetooth device batteries", "Network speed in the pill", "Item limit", "Paste on click", "Excluded apps", "Mic & camera indicator", "High-load alert", "Volume control in System", "Show upcoming meetings", "“Upcoming meeting” window", "Private iCal link", "Show the island in captures", "Screenshots folder", "Area screenshot hotkey", "Full-screen screenshot hotkey", "Recording format", "Recording FPS", "Recording quality", "Recordings folder", "Recording hotkey", "Color picker hotkey", "Live currency rates", "Focus-time tracking", "Break reminders", "Continuous use before a break (min)", "Eco mode", "Auto-eco on battery", "Motion level"];
const GROUPS = {
  general: ["Updates", "About", "Startup & position", "Behavior"],
  look: ["Media & appearance"],
  modules: ["Today & prayer", "Battery & network", "Clipboard", "System & privacy", "Meetings", "Capture & recording", "Command palette", "My time & breaks"],
  perf: ["Performance & saving"],
};
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 760, height: 600 } });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en" }, extra: { app_quit: null } }));
  const errs = []; page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
  await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(800);
  const h3 = () => page.locator("h3").allTextContents();
  const nav = (g) => page.locator(`[data-nav="${g}"]`);

  ok("default section = General (nav highlighted + its sections only)", (await nav("general").getAttribute("aria-current")) === "true" && JSON.stringify(await h3()) === JSON.stringify(GROUPS.general), JSON.stringify(await h3()));
  ok("sidebar has the 4 groups in order with an icon each", await page.evaluate(() => { const b = [...document.querySelectorAll("nav[aria-label='Settings sections'] button")]; return b.length === 4 && b.every((x) => x.querySelector("svg")) && b.map((x) => x.textContent).join("|") === "General|Appearance & media|Modules|Performance"; }));

  // نمط shadcn: ترويسة المجموعة (h2 + وصف + فاصل)، قائمة شبحية، صفوف المفاتيح بطاقات بحدود، عناصر تحكم بمقاسات shadcn.
  ok("shadcn header: h2 + muted description + separator", await page.evaluate(() => { const g = document.querySelector("[data-group]"); const h = g.querySelector("h2"); return !!h && h.nextElementSibling?.tagName === "P" && !!g.querySelector('[role="separator"]'); }));
  ok("shadcn nav: active = muted bg + rounded, others ghost", await page.evaluate(() => { const a = document.querySelector('[data-nav="general"]'), b = document.querySelector('[data-nav="look"]'); const ra = getComputedStyle(a), rb = getComputedStyle(b); return parseFloat(ra.borderRadius) >= 6 && ra.backgroundColor !== "rgba(0, 0, 0, 0)" && rb.backgroundColor === "rgba(0, 0, 0, 0)"; }));
  ok("shadcn switch rows are bordered rounded cards (label+hint left, switch right)", await page.evaluate(() => { const sw = document.querySelector('[role="switch"]'); const card = sw.parentElement.parentElement; const cs = getComputedStyle(card); return parseFloat(cs.borderTopWidth) === 1 && parseFloat(cs.borderRadius) === 8; }));
  ok("shadcn quit button = outline button (border, 36px)", await page.locator('[data-testid="quit-btn"]').evaluate((b) => { const c = getComputedStyle(b); return parseFloat(c.borderTopWidth) === 1 && b.getBoundingClientRect().height === 36; }));
  const seen = [];
  for (const [g, secs] of Object.entries(GROUPS)) {
    await nav(g).click(); await page.waitForTimeout(80);
    ok(`[${g}] shows only its own sections`, JSON.stringify(await h3()) === JSON.stringify(secs), JSON.stringify(await h3()));
    ok(`[${g}] exactly one group heading and nav marks it current`, (await page.locator("h2").count()) === 1 && (await page.locator('nav [aria-current="true"]').count()) === 1 && (await nav(g).getAttribute("aria-current")) === "true");
    ok(`[${g}] page height does not hold other groups (no leftover sections in DOM)`, (await page.locator("section").count()) === secs.length);
    seen.push(...(await page.evaluate(() => [...document.querySelectorAll("section [aria-label]")].map((e) => e.getAttribute("aria-label")))));
    ok(`[${g}] bar + quit button still pinned at top`, await page.locator('[data-testid="quit-btn"]').evaluate((b) => b.getBoundingClientRect().top >= 0 && b.getBoundingClientRect().top < 40));
  }
  ok("all 63 previous controls reachable across the 4 sections (same set, no loss)", seen.length === BASELINE.length && [...seen].sort().join("|") === [...BASELINE].sort().join("|"), `${seen.length} vs ${BASELINE.length}`);

  await nav("general").click(); await page.waitForTimeout(80);
  ok("General: Updates section has updateAutoCheck switch + manual check button", (await page.getByRole("switch", { name: "Check for updates automatically" }).count()) === 1 && (await page.getByRole("button", { name: /check for updates/i }).count()) >= 1);
  ok("General: toggling updateAutoCheck still saves the key", await (async () => { await page.getByRole("switch", { name: "Check for updates automatically" }).click(); await page.waitForTimeout(120); return (await page.evaluate(() => JSON.stringify(window.__calls))).includes("updateAutoCheck"); })());
  ok("no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  // الشريط العلوي: يبقى مثبّتًا فوق القائمة والمحتوى، وتأكيد الخطوتين سليم من أي قسم
  await nav("modules").click(); await page.waitForTimeout(80);
  await page.evaluate(() => window.scrollTo(0, 3000)); await page.waitForTimeout(200);
  const btn = page.locator('[data-testid="quit-btn"]');
  const geo = await page.evaluate(() => ({ bar: document.querySelector('[data-testid="settings-bar"]').getBoundingClientRect().bottom, nav: document.querySelector("nav").getBoundingClientRect().top, y: document.querySelector('[data-testid="quit-btn"]').getBoundingClientRect().top }));
  ok("quit bar pinned after deep scroll, above sidebar", geo.y >= 0 && geo.y < 40 && geo.nav >= geo.bar - 1, JSON.stringify(geo));
  await btn.click();
  ok("quit step 1: armed, app_quit not called", (await btn.getAttribute("data-armed")) === "true" && (await page.evaluate(() => window.__calls.filter((c) => c[0] === "app_quit").length)) === 0);
  await btn.click();
  ok("quit step 2: app_quit called exactly once", (await page.evaluate(() => window.__calls.filter((c) => c[0] === "app_quit").length)) === 1);

  ok("no page errors", errs.length === 0, errs.join("|"));
  await ctx.close(); await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
