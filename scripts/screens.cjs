// لقطات Playwright (T03+T04): الحبة (خمول/تنبيه بنفس المقاس)، اللمحة (كل بطاقة)، اللوحة (compact/large/minimal)، وأقسام الإعدادات —
// فاتح/داكن، أسود صلب/مثلّج/شفاف، عربي RTL. المتصفح بلا أكريليك ويندوز: خلفية متدرّجة تُحقن خلف الصفحة الشفافة وdiv يحاكي صبغة الأكريليك
// (ألفا من styleAlpha = نفس خريطة backdrop.rs) + تمويه 30px (محاكاة للقطات فقط). تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/screens.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:4173";
const OUT = process.env.OUT || "docs/screenshots";
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith(".png")) fs.unlinkSync(`${OUT}/${f}`);
const WALL = {
  dark: "linear-gradient(120deg,#1e3a8a 0%,#7e22ce 45%,#be185d 70%,#f59e0b 100%)",
  light: "linear-gradient(120deg,#bfdbfe 0%,#fbcfe8 50%,#fde68a 100%)",
};
const COVER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23e0457b'/><stop offset='1' stop-color='%23f7b733'/></linearGradient></defs><rect width='160' height='160' fill='url(%23g)'/><circle cx='80' cy='80' r='42' fill='%23181a2a'/><circle cx='80' cy='80' r='12' fill='%23f7b733'/></svg>";
const MEDIA = { session: true, source: "Spotify.exe", source_name: "Spotify", title: "Blue Hour", artist: "Nova", album: "Night Drive", duration: 215, position: 62, playing: true, can_prev: true, can_next: true, can_seek: true };
const now = Date.now();
const today = { city: { id: "madinah", ar: "المدينة المنورة", en: "Madinah" }, prayers: [["fajr", -10], ["sunrise", -8], ["dhuhr", 1], ["asr", 4], ["maghrib", 7], ["isha", 8]].map(([id, h]) => ({ id, at: now + h * 3600e3 })), next_day_at: now + 20 * 3600e3 };
const W = { enabled: true, offline: false, temp: 31.2, feels: 33, humidity: 20, wind: 9, code: 1, is_day: true, units: "c", city: "madinah", fetched_at: now, error: "" };
const BG = { solid: { themeMaterial: "solid" }, frosted: { themeMaterial: "glass", glassStyle: "crystal", glassTint: 45 }, clear: { themeMaterial: "glass", glassStyle: "clear", glassTint: 25 } };
const alpha = (bg, theme, tint) => { const light = theme === "light"; return bg === "clear" ? (light ? Math.min(0.14 + 0.005 * tint, 0.6) : 0.1 + 0.005 * tint) : light ? Math.min(0.32 + 0.0075 * tint, 0.92) : 0.28 + 0.0075 * tint; };
const list = [];
const fake = (page, bg, theme) => bg === "solid" ? Promise.resolve() : page.evaluate(([bg, theme, a]) => {
  document.querySelectorAll(".fake-acrylic").forEach((e) => e.remove());
  const b = document.querySelector(".island-body"); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
  const d = document.createElement("div"); d.className = "fake-acrylic";
  d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${cs.borderRadius};z-index:-1;backdrop-filter:blur(30px) saturate(1.25);background:${theme === "dark" ? `rgba(0,0,0,${a})` : bg === "clear" ? `rgba(255,255,255,${a})` : `rgba(236,239,243,${a})`}`;
  document.body.appendChild(d);
}, [bg, theme, alpha(bg, theme, bg === "clear" ? 25 : 45)]);

(async () => {
  const browser = await chromium.launch();
  const mk = async (url, settings, vp, extra = {}) => {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: settings.themeMode === "light" ? "light" : "dark" });
    const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { eyesEnabled: false, settingsVersion: 3, panelTabsStyle: "icons", hoverDelayMs: 0, showWeather: true, ...settings }, backdrop: "win10", extra: { today_get: today, weather_get: W, ...(extra.extra || {}) }, ...extra }));
    await page.goto(`${BASE}/${url}`); await page.waitForTimeout(900);
    return { ctx, page };
  };
  const shot = async (page, name, clip) => { await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) }); list.push(name); };
  const island = async (page, theme, bg) => { await page.addStyleTag({ content: `html{background:${WALL[theme]} !important}` }); await fake(page, bg, theme); };
  const openPeek = async (page) => { await page.mouse.move(400, 10); await page.waitForTimeout(1300); };
  const openPanel = async (page) => { await page.mouse.move(400, 10); await page.waitForTimeout(900); await page.mouse.click(400, 10); await page.waitForTimeout(1500); };
  const cover = (page) => page.evaluate((c) => window.__emit("media:cover", c), COVER).then(() => page.waitForTimeout(400));

  // الحبة: خمول + تنبيه (نفس المقاس) × خلفية × سمة
  for (const theme of ["dark", "light"]) for (const bg of ["solid", "frosted", "clear"]) {
    const { ctx, page } = await mk("index.html", { language: "en", themeMode: theme, ...BG[bg], eyesEnabled: true }, { width: 800, height: 500 });
    await island(page, theme, bg);
    await shot(page, `pill-${bg}-${theme}-idle`, { x: 200, y: 0, width: 400, height: 60 });
    await page.evaluate(() => window.__emit("island:note", { kind: "reminder", id: "r1", at: Date.now(), late: false, text: "اجتماع الفريق بعد 10 دقائق" }));
    await page.waitForTimeout(900); await fake(page, bg, theme);
    await shot(page, `pill-${bg}-${theme}-notification`, { x: 200, y: 0, width: 400, height: 60 });
    await ctx.close();
  }
  // اللمحة: كل بطاقة (مثلّج) فاتح/داكن + بطاقة المشغّل لباقي الخلفيات
  for (const theme of ["dark", "light"]) for (const bg of ["frosted", "solid", "clear"]) {
    const { ctx, page } = await mk("index.html", { language: "en", themeMode: theme, ...BG[bg] }, { width: 800, height: 500 }, { media: MEDIA, timer_get: { endsAt: now + 90_000, totalMs: 120_000, label: "Tea" } });
    await cover(page); await island(page, theme, bg); await openPeek(page);
    const cards = bg === "frosted" ? ["player", "today", "weather", "timer"] : ["player"];
    for (const c of cards) {
      await fake(page, bg, theme); await shot(page, `peek-${c}-${bg}-${theme}`, { x: 150, y: 0, width: 500, height: 150 });
      if (c !== "timer") { await page.mouse.wheel(0, 100); await page.waitForTimeout(900); }
    }
    await ctx.close();
  }
  // اللوحة: التخطيطات الثلاثة
  for (const theme of ["dark", "light"]) for (const [layout, bg] of [["compact", "solid"], ["compact", "frosted"], ["compact", "clear"], ["large", "frosted"], ["minimal", "frosted"]]) {
    const { ctx, page } = await mk("index.html", { language: "en", themeMode: theme, playerLayout: layout, ...BG[bg] }, { width: 800, height: 500 }, { media: MEDIA });
    await cover(page); await island(page, theme, bg); await openPanel(page); await fake(page, bg, theme);
    await shot(page, `panel-${layout}-${bg}-${theme}`, { x: 100, y: 0, width: 600, height: 330 });
    await ctx.close();
  }
  // عربي RTL
  for (const theme of ["dark", "light"]) {
    const { ctx, page } = await mk("index.html", { language: "ar", themeMode: theme, ...BG.frosted }, { width: 800, height: 500 }, { media: MEDIA });
    await cover(page); await island(page, theme, "frosted");
    await shot(page, `ar-pill-${theme}`, { x: 200, y: 0, width: 400, height: 60 });
    await openPeek(page); await fake(page, "frosted", theme); await shot(page, `ar-peek-player-${theme}`, { x: 150, y: 0, width: 500, height: 150 });
    await page.mouse.click(400, 10); await page.waitForTimeout(1500); await fake(page, "frosted", theme); await shot(page, `ar-panel-${theme}`, { x: 100, y: 0, width: 600, height: 330 });
    await ctx.close();
  }
  // الإعدادات
  const SECTIONS = ["general", "island", "appearance", "motion", "modules", "notifications", "shortcuts", "perf", "updates", "about"];
  for (const lang of ["en", "ar"]) for (const theme of ["dark", "light"]) {
    const { ctx, page } = await mk("settings.html", { language: lang, themeMode: theme }, { width: 880, height: 620 });
    for (const sec of lang === "en" ? SECTIONS : ["general", "island", "appearance", "motion", "notifications"]) { await page.locator(`[data-nav="${sec}"]`).click(); await page.waitForTimeout(500); await shot(page, `settings-${lang}-${theme}-${sec}`); }
    await ctx.close();
  }
  await browser.close();
  console.log(list.length + " screenshots → " + OUT + "\n" + list.join("\n"));
})();
