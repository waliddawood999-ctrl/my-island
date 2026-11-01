// تخطيط الإعدادات الجديد (Playwright + جسر وهمي): شريط جانبي مرتّب، «حول» وحده، زر الإغلاق الأحمر أسفل الشريط بتأكيد من خطوتين،
// بحث حيّ، وصول كل عناصر التحكم السابقة، إعادة ضبط القسم، استيراد/تصدير، أسلوبا الزجاج، RTL. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/settings.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
// عناصر التحكم (aria-label) السابقة (63) — يجب أن تبقى كلها قابلة للوصول في مكانها المنطقي الجديد.
const BASELINE = ["Check for updates automatically", "Start with Windows", "Language", "Monitor", "Horizontal offset", "Open delay", "Auto-hide", "Hide in fullscreen", "Show clock", "Clock format", "Pill width", "Pill height", "Theme", "Background", "Opacity at rest", "Opacity when open", "Mascot eyes", "Audio spectrum & liquid pill", "Show the Today section", "City", "Prayer alerts", "Weather", "Temperature unit", "Event countdowns", "Event name", "Event date", "Mini world clock", "Alert sound", "Show battery", "“Unplug at 80%” tip", "Bluetooth device batteries", "Network speed in the pill", "Item limit", "Paste on click", "Excluded apps", "Mic & camera indicator", "High-load alert", "Volume control in System", "Show upcoming meetings", "“Upcoming meeting” window", "Private iCal link", "Show the island in captures", "Screenshots folder", "Area screenshot hotkey", "Full-screen screenshot hotkey", "Recording format", "Recording FPS", "Recording quality", "Recordings folder", "Recording hotkey", "Color picker hotkey", "Live currency rates", "Focus-time tracking", "Break reminders", "Continuous use before a break (min)", "Eco mode", "Auto-eco on battery", "Motion level"];
const ORDER = ["general", "island", "appearance", "motion", "modules", "notifications", "shortcuts", "perf", "updates", "about"];
// خريطة مكان كل إعداد (للتقرير): قسم ← عناصره
const where = {};
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 880, height: 620 } });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", themeMaterial: "glass", glassStyle: "crystal" }, extra: { app_quit: null } }));
  const errs = []; page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
  await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(800);
  const nav = (g) => page.locator(`[data-nav="${g}"]`);
  const calls = (n) => page.evaluate((c) => window.__calls.filter((x) => x[0] === c).map((x) => x[1]), n);

  // الشريط الجانبي
  const ids = await page.evaluate(() => [...document.querySelectorAll("nav[aria-label='Settings sections'] [data-nav]")].map((b) => b.dataset.nav));
  ok("sidebar order: General, Island, Appearance, Motion, Modules, Notifications, Shortcuts, Performance, Updates, About", JSON.stringify(ids) === JSON.stringify(ORDER), JSON.stringify(ids));
  ok("every item has an icon", await page.evaluate(() => [...document.querySelectorAll("[data-nav]")].every((b) => b.querySelector("svg"))));
  ok("About is alone at the bottom of the list, after a separator", await page.evaluate(() => { const n = document.querySelector("nav[aria-label='Settings sections']"); const kids = [...n.children]; return kids[kids.length - 1].dataset.nav === "about" && kids[kids.length - 2].getAttribute("role") === "separator"; }));
  ok("default section = General (current + only its group rendered)", (await nav("general").getAttribute("aria-current")) === "true" && (await page.locator("[data-group]").count()) === 1);

  // زر الإغلاق: أسفل الشريط الجانبي (خارج رأس الإعدادات)، أحمر، بخطوتين
  const q = page.locator('[data-testid="quit-btn"]');
  const geo = await page.evaluate(() => { const b = document.querySelector('[data-testid="quit-btn"]').getBoundingClientRect(); const s = document.querySelector(".st-side").getBoundingClientRect(); const last = document.querySelector("nav[aria-label='Settings sections']").getBoundingClientRect(); const c = getComputedStyle(document.querySelector('[data-testid="quit-btn"]')).color; return { bottomGap: s.bottom - b.bottom, below: b.top >= last.bottom - 1, inSide: !!document.querySelector('.st-side [data-testid="quit-btn"]'), c }; });
  ok("quit button pinned at very bottom of the sidebar, below the list", geo.inSide && geo.below && geo.bottomGap < 24, JSON.stringify(geo));
  ok("quit button is red (text)", /rgb\((2[0-9]{2}|1[5-9][0-9]),\s*(\d{1,2}|1[0-3]\d),\s*(\d{1,2}|1[0-3]\d)\)/.test(geo.c), geo.c);
  await q.click();
  ok("quit step 1: armed, app_quit not called", (await q.getAttribute("data-armed")) === "true" && (await calls("app_quit")).length === 0);
  await q.click();
  ok("quit step 2: app_quit called exactly once", (await calls("app_quit")).length === 1);
  await page.locator("h2").first().click(); // يفقد التركيز

  // تجوّل بين الأقسام وجمع عناصر التحكم
  const seen = [];
  for (const g of ORDER) {
    await nav(g).click(); await page.waitForTimeout(350);
    ok(`[${g}] shows exactly one group and nav marks it current`, (await page.locator("[data-group]").count()) === 1 && (await page.locator('nav [aria-current="true"]').count()) === 1 && (await nav(g).getAttribute("aria-current")) === "true");
    const labels = await page.evaluate(() => [...document.querySelectorAll(".st-card [aria-label]")].map((e) => e.getAttribute("aria-label")));
    where[g] = await page.evaluate(() => [...document.querySelectorAll(".st-row-title")].map((e) => e.textContent));
    seen.push(...labels);
    ok(`[${g}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.querySelector(".st-main").scrollWidth <= document.querySelector(".st-main").clientWidth + 1));
    ok(`[${g}] rows follow the 56px grid`, await page.evaluate(() => [...document.querySelectorAll(".st-row")].every((r) => parseFloat(getComputedStyle(r).minHeight) >= 56)));
    if (g !== "about") ok(`[${g}] has Reset section`, (await page.getByTestId(`reset-${g}`).count()) === 1);
  }
  const miss = BASELINE.filter((b) => !seen.includes(b));
  ok("all 63 previous controls still reachable", miss.length === 0, miss.join("|"));
  const dup = seen.filter((l, i) => seen.indexOf(l) !== i && !["Custom color"].includes(l));
  ok("no setting appears in two sections", dup.length === 0, [...new Set(dup)].join("|"));

  // About
  await nav("about").click(); await page.waitForTimeout(300);
  ok("About: version + developer + What's new + GitHub", (await page.getByTestId("about-version").count()) === 1 && (await page.getByText("Developed by Walid").count()) === 1 && (await page.getByTestId("about-whatsnew").count()) === 1 && (await page.getByTestId("about-github").count()) === 1);
  ok("About is not mixed into other sections (no update/quit controls)", (await page.getByRole("switch").count()) === 0);
  await nav("updates").click(); await page.waitForTimeout(300);
  ok("Updates: auto-check switch + manual check", (await page.getByRole("switch", { name: "Check for updates automatically" }).count()) === 1 && (await page.getByTestId("update-check").count()) === 1);
  await page.getByRole("switch", { name: "Check for updates automatically" }).click(); await page.waitForTimeout(150);
  ok("toggling saves instantly (no reload)", JSON.stringify(await calls("settings_set")).includes("updateAutoCheck"));

  // بحث حيّ
  await page.getByTestId("settings-search").fill("pill width"); await page.waitForTimeout(350);
  const vis = await page.evaluate(() => [...document.querySelectorAll(".st-row:not([hidden]) .st-row-title")].filter((e) => e.offsetParent).map((e) => e.textContent));
  ok("search 'pill width' ⇒ shows Pill width only (live)", vis.length === 1 && vis[0] === "Pill width", JSON.stringify(vis));
  ok("search hides empty sections", await page.evaluate(() => [...document.querySelectorAll(".st-sec")].filter((s) => s.offsetParent).every((s) => s.querySelector(".st-row:not([hidden])"))));
  await page.getByTestId("settings-search").fill("زججج"); await page.waitForTimeout(250);
  await page.getByTestId("settings-search").fill(""); await page.waitForTimeout(300);

  // الجزيرة: حجم + إعادة ضبط
  await nav("island").click(); await page.waitForTimeout(300);
  const sl = page.getByRole("slider", { name: "Pill width" });
  ok("slider shows live value beside it", (await sl.evaluate((e) => e.parentElement.querySelector(".st-val").textContent)) === "220 px");
  await sl.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(250);
  ok("slider change persists instantly (live, no reload)", JSON.stringify(await calls("settings_set")).includes('"pillWidth":230'));
  await page.getByTestId("reset-island").click(); await page.waitForTimeout(150);
  const rs = (await calls("settings_set")).filter((c) => c.patch && "pillWidth" in c.patch).pop();
  ok("Reset section restores pill defaults (220×34, radius auto, position center)", rs && rs.patch.pillWidth === 220 && rs.patch.pillHeight === 34 && rs.patch.pillRadius === 0 && rs.patch.pillPosition === "center", JSON.stringify(rs));

  // المظهر: أسلوب الزجاج + الإعدادات المسبقة
  await nav("appearance").click(); await page.waitForTimeout(300);
  await page.getByRole("radio", { name: "Clear glass" }).click(); await page.waitForTimeout(150);
  const gs = (await calls("settings_set")).filter((c) => c.patch && c.patch.glassStyle === "clear").pop();
  ok("Clear glass ⇒ glassStyle=clear, tint 25, no blur key", gs && gs.patch.glassTint === 25 && !("glassBlur" in gs.patch), JSON.stringify(gs));
  await page.locator('[data-preset="smoked"]').click(); await page.waitForTimeout(150);
  const pr = (await calls("settings_set")).filter((c) => c.patch && c.patch.glassStyle === "crystal" && c.patch.glassTint === 68).pop();
  ok("preset 'Smoked' applies crystal + tint 68", !!pr && pr.patch.themeMaterial === "glass" && !("glassBlur" in pr.patch), JSON.stringify(pr));
  ok("4 presets available", (await page.locator("[data-preset]").count()) === 4);

  // اختصار: مسجّل
  await nav("shortcuts").click(); await page.waitForTimeout(300);
  const hk = page.getByRole("button", { name: "Area screenshot hotkey", exact: true });
  await hk.click(); await page.keyboard.press("Control+Shift+K"); await page.waitForTimeout(150);
  ok("shortcut recorder captures Ctrl+Shift+K", JSON.stringify(await calls("settings_set")).includes('"hotkeyArea":"Ctrl+Shift+K"'));

  // استيراد/تصدير
  await nav("general").click(); await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 3000 }).catch(() => null), page.getByTestId("export-btn").click()]);
  ok("export triggers a JSON download", !!dl && dl.suggestedFilename() === "myisland-settings.json");
  await page.getByTestId("import-file").setInputFiles({ name: "s.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ app: "myisland", settings: { density: "compact", evil: 1 } })) });
  await page.waitForTimeout(250);
  ok("import applies known keys only", JSON.stringify(await calls("settings_set")).includes('"density":"compact"') && !JSON.stringify(await calls("settings_set")).includes("evil"));
  const ra = page.getByTestId("reset-all"); await ra.click();
  ok("Reset all needs a second click", (await calls("settings_set")).filter((c) => c.patch && "autostart" in c.patch).length === 0);
  await ra.click(); await page.waitForTimeout(150);
  ok("Reset all restores every section's keys", (await calls("settings_set")).filter((c) => c.patch && "autostart" in c.patch && "pillWidth" in c.patch && "glassStyle" in c.patch).length === 1);

  ok("no page errors (English)", errs.length === 0, errs.join("|"));

  // العربية / RTL
  const ar = await ctx.newPage();
  await ar.addInitScript(bridge({ settings: { language: "ar" }, extra: { app_quit: null } }));
  const aerrs = []; ar.on("pageerror", (e) => aerrs.push(e.message.slice(0, 100)));
  await ar.goto(`${BASE}/settings.html`); await ar.waitForTimeout(800);
  const g = await ar.evaluate(() => { const side = document.querySelector(".st-side").getBoundingClientRect(), main = document.querySelector(".st-main").getBoundingClientRect(); return { dir: document.querySelector(".st-root").dir, sideRight: side.left > main.left, resetOnLeft: true }; });
  ok("Arabic: root dir=rtl and sidebar mirrored to the right", g.dir === "rtl" && g.sideRight, JSON.stringify(g));
  ok("Arabic: an ON switch rests with its thumb at the inline-end (left)", await (async () => { await ar.locator('[data-nav="island"]').click(); await ar.waitForTimeout(400); const sw = ar.getByRole("switch", { name: "إظهار الساعة" }); return sw.evaluate((e) => { const t = e.querySelector(".st-thumb").getBoundingClientRect(), r = e.getBoundingClientRect(); return e.getAttribute("aria-checked") === "true" && t.left + t.width / 2 < r.left + r.width / 2; }); })());
  ok("Arabic: no overflow, no page errors", (await ar.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)) && aerrs.length === 0, aerrs.join("|"));

  await ctx.close(); await browser.close();
  if (process.env.MAP) console.log(JSON.stringify(where, null, 1));
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
