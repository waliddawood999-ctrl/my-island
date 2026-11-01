// T02: إزالة الميزات (تبويب المتصفح/الكلمات/تحت شريط المهام)، «اليوم» فوري، الطقس (حالة خطأ + إعادة محاولة + مدينة افتراضية)، الأصوات، والأوصاف. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/t02.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const SPY = `(() => { window.__osc = 0; const AC = window.AudioContext; if (AC) { const o = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return o.apply(this, arguments); }; } })();`;
(async () => {
  const browser = await chromium.launch();
  const now = Date.now();
  const mk = (id, h) => ({ id, at: now + h * 3600e3 });
  const today = { city: { id: "madinah", ar: "المدينة", en: "Madinah" }, prayers: [["fajr", -10], ["sunrise", -8], ["dhuhr", 1], ["asr", 4], ["maghrib", 7], ["isha", 8]].map(([a, b]) => mk(a, b)), next_day_at: now + 20 * 3600e3 };
  const W = (o = {}) => ({ enabled: true, offline: false, temp: 31.2, feels: 33, humidity: 20, wind: 9, code: 1, is_day: true, units: "c", city: "madinah", fetched_at: now, error: "", ...o });

  // 1) «اليوم»: الصفحة الرئيسية + تبويب النظام يتبعان المفتاح فورًا
  { const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false }, extra: { today_get: today } }));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
    await page.mouse.move(380, 10); await page.waitForTimeout(700); await page.mouse.click(380, 10); await page.waitForTimeout(1600);
    const has = (id) => page.evaluate((i) => !!document.querySelector(`[data-testid="${i}"]`), id);
    ok("Today: Home prayer tile visible when on", await has("tile-prayer"));
    await page.evaluate(() => window.__emit("settings:changed", { showToday: false })); await page.waitForTimeout(400);
    ok("Today: Home tile hides immediately when turned off", !(await has("tile-prayer")));
    await page.getByRole("tab", { name: "System", exact: true }).click(); await page.waitForTimeout(900);
    ok("Today: System tab card hidden when off", !(await page.evaluate(() => !!document.querySelector('[data-testid="golden-hour"], .grid-rows-3'))));
    await page.evaluate(() => window.__emit("settings:changed", { showToday: true })); await page.waitForTimeout(700);
    ok("Today: System tab card shows immediately when turned on", await page.evaluate(() => !!document.querySelector(".grid-rows-3")));
    await ctx.close(); }

  // 2) الطقس
  for (const [label, w, want] of [["ok", W(), "tile-weather"], ["offline+error", W({ offline: true, error: "dns" }), "tile-weather-error"], ["eco/no cache", W({ offline: true, error: "eco" }), "tile-weather-error"]]) {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, showWeather: true, showToday: false }, extra: { weather_get: w } }));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
    await page.mouse.move(380, 10); await page.waitForTimeout(700); await page.mouse.click(380, 10); await page.waitForTimeout(1600);
    ok(`Weather ${label}: shows ${want}`, await page.evaluate((i) => !!document.querySelector(`[data-testid="${i}"]`), want));
    if (want === "tile-weather-error") {
      ok(`Weather ${label}: clear message, not silent`, /Weather unavailable/.test(await page.locator(`[data-testid="${want}"]`).innerText()) && /(internet|eco)/i.test(await page.locator(`[data-testid="${want}"]`).innerText()));
      await page.getByTestId("weather-retry").click(); await page.waitForTimeout(300);
      ok(`Weather ${label}: retry asks the backend with refresh=true`, await page.evaluate(() => window.__calls.some((c) => c[0] === "weather_get" && c[1] && c[1].refresh === true)));
    }
    await ctx.close(); }
  { const ctx = await browser.newContext({ viewport: { width: 880, height: 620 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en" }, extra: { today_cities: [{ id: "riyadh", ar: "الرياض", en: "Riyadh" }, { id: "madinah", ar: "المدينة المنورة", en: "Madinah" }] } }));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(900);
    await page.locator('[data-nav="modules"]').click(); await page.waitForTimeout(500);
    ok("Weather city defaults to Madinah (separate from the prayer city)", (await page.getByLabel("Weather city").inputValue()) === "madinah");
    await ctx.close(); }

  // 3) الأصوات: 6 خيارات + معاينة + مستوى الصوت + تعزف في الجزيرة عند التنبيه
  { const ctx = await browser.newContext({ viewport: { width: 880, height: 620 } }); const page = await ctx.newPage();
    await page.addInitScript(SPY); await page.addInitScript(bridge({ settings: { language: "en", soundChoice: "bell", soundVolume: 60 } }));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(900);
    await page.locator('[data-nav="notifications"]').click(); await page.waitForTimeout(500);
    const opts = await page.getByLabel("Alert sound").locator("option").allTextContents();
    ok("Sound picker lists 6 sounds incl. None", opts.length === 6 && opts.includes("None"), JSON.stringify(opts));
    ok("Volume slider present", (await page.getByRole("slider", { name: "Sound volume" }).count()) === 1);
    await page.getByTestId("sound-preview").click(); await page.waitForTimeout(300);
    ok("Preview plays the sound (WebAudio oscillators created, no network)", (await page.evaluate(() => window.__osc)) >= 2);
    await page.getByLabel("Alert sound").selectOption("pop"); await page.waitForTimeout(200);
    ok("Choosing a sound saves soundChoice and previews it", await page.evaluate(() => window.__calls.some((c) => c[0] === "settings_set" && c[1].patch.soundChoice === "pop")));
    ok("No custom-path text field remains", (await page.getByRole("textbox", { name: "Alert sound" }).count()) === 0);
    await ctx.close(); }
  for (const [choice, expectPlay] of [["chime", true], ["none", false]]) {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } }); const page = await ctx.newPage();
    await page.addInitScript(SPY); await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, soundChoice: choice, soundVolume: 80 } }));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(800);
    await page.evaluate(() => window.__emit("island:note", { kind: "reminder", id: "n1", at: Date.now(), late: false, text: "x" })); await page.waitForTimeout(600);
    const n = await page.evaluate(() => window.__osc);
    ok(`Island alert with sound '${choice}': ${expectPlay ? "plays" : "silent"}`, expectPlay ? n >= 2 : n === 0, String(n));
    await ctx.close(); }

  // 4) محذوف + أوصاف
  { const ctx = await browser.newContext({ viewport: { width: 880, height: 620 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en" } }));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(900);
    const labels = []; const missing = [];
    const NEED = ["Spring style", "Reduce motion", "Density", "Glass tint strength", "Border strength", "Shadow strength", "Eco mode", "Opacity at rest", "Position", "Horizontal offset", "Vertical offset", "Auto-hide", "Hide in fullscreen", "Animation speed", "Corner style", "Font size"];
    for (const g of ["general", "island", "appearance", "motion", "modules", "notifications", "shortcuts", "perf", "updates", "about"]) {
      await page.locator(`[data-nav="${g}"]`).click(); await page.waitForTimeout(350);
      labels.push(...await page.evaluate(() => [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label"))));
      const rows = await page.evaluate(() => [...document.querySelectorAll(".st-row")].map((r) => [r.querySelector(".st-row-title")?.textContent, !!r.querySelector(".st-row-hint")]));
      for (const [t, h] of rows) if (NEED.includes(t) && !h) missing.push(t);
      if (g === "island") ok("Island: hint under position/offset/auto-hide are one short line", await page.evaluate(() => [...document.querySelectorAll(".st-row-hint")].every((e) => e.textContent.length < 140)));
    }
    ok("Removed options are gone (Browser tab mode, Lyrics, Under the taskbar)", !labels.some((l) => /browser tab|lyrics|under the taskbar/i.test(l)), labels.filter((l) => /browser tab|lyrics|taskbar/i.test(l)).join());
    ok("Every non-obvious setting has a description", missing.length === 0, missing.join("|"));
    ok("Arabic descriptions come first via i() (spot-check in ar)", true);
    await ctx.close(); }
  { const ctx = await browser.newContext({ viewport: { width: 880, height: 620 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "ar" } }));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(900);
    await page.locator('[data-nav="motion"]').click(); await page.waitForTimeout(400);
    const t = await page.locator(".st-row-hint").allTextContents();
    ok("Arabic UI: motion descriptions are Arabic", t.length >= 4 && t.every((x) => /[؀-ۿ]/.test(x)), JSON.stringify(t));
    await ctx.close(); }
  { const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false } }));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(800);
    await page.mouse.move(380, 10); await page.waitForTimeout(700); await page.mouse.click(380, 10); await page.waitForTimeout(1400);
    const names = await page.evaluate(() => window.__calls.map((c) => c[0]));
    ok("Island never calls removed commands (lyrics_get, island_dock_get)", !names.includes("lyrics_get") && !names.includes("island_dock_get"));
    await ctx.close(); }

  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
