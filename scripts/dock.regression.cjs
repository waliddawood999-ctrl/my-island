// دوك الصفحات: ٥ صفحات (الرئيسية · الالتقاط · الحافظة · التطبيقات · الأدوات)؛ الأدوات تحمل تبويبات فرعية؛ الوحدات المطفأة تُخفي صفحاتها؛ الأنماط القديمة سليمة. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/dock.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const open = async (browser, settings, media) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, panelHeight: 360, ...settings }, media }));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(800);
  await page.mouse.move(400, 10); await page.waitForTimeout(500); await page.click(".island-body", { position: { x: 8, y: 8 } }); await page.waitForTimeout(1600);
  return { ctx, page, errs };
};
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  let { ctx, page, errs } = await open(browser, { panelTabsStyle: "dock", hotkeyArea: "Ctrl+Alt+A", hotkeyRecord: "Ctrl+Alt+R" });
  const ids = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="dock-"]')].map((e) => e.dataset.testid.slice(5)));
  const activeId = () => page.evaluate(() => { const a = document.querySelector('[data-testid^="dock-"][aria-selected="true"]'); return a ? a.dataset.testid.slice(5) : null; });
  const activeLabel = () => page.evaluate(() => { const a = document.querySelector('[data-testid^="dock-"][aria-selected="true"]'); return a ? a.getAttribute("aria-label") : null; });
  ok("dock shows five pages in order", JSON.stringify(await ids()) === JSON.stringify(["home", "capture", "clip", "apps", "work"]), JSON.stringify(await ids()));
  ok("home is active and the old top tab bar is gone", (await activeLabel()) === "Home" && (await page.locator('[role="tablist"]:not([data-testid])').count()) === 0);
  await page.click('[data-testid="dock-capture"]'); await page.waitForTimeout(700);
  ok("Capture page = the tools page (area shot button)", (await page.getByText("Area shot").count()) >= 1 && (await activeLabel()) === "Capture");
  ok("Capture page shows each action's global hotkey under its button", (await page.getByText("Ctrl+Alt+A").count()) >= 1 && (await page.getByText("Ctrl+Alt+R").count()) >= 1);
  await page.getByTestId("capture-note").click(); await page.waitForTimeout(700);
  ok("'Quick note' opens the Note sub-tab inside Tools", (await activeLabel()) === "Tools" && (await page.locator('[data-testid="sub-tabs"] [aria-selected="true"]').innerText()) === "Note");
  await page.click('[data-testid="dock-capture"]'); await page.waitForTimeout(500);
  await page.click('[data-testid="dock-work"]'); await page.waitForTimeout(700);
  ok("Tools page has sub-tabs (shelf · note · meetings · system)", (await page.locator('[data-testid="sub-tabs"] [role="tab"]').count()) >= 3);
  await page.locator('[data-testid="sub-tabs"] [role="tab"]').last().click(); await page.waitForTimeout(600);
  const lastSub = await page.locator('[data-testid="sub-tabs"] [aria-selected="true"]').innerText();
  await page.click('[data-testid="dock-home"]'); await page.waitForTimeout(500);
  await page.click('[data-testid="dock-work"]'); await page.waitForTimeout(600);
  ok("returning to Tools restores the last sub-tab", (await page.locator('[data-testid="sub-tabs"] [aria-selected="true"]').innerText()) === lastSub, lastSub);
  ok("settings button lives on the dock row", (await page.locator('button[aria-label="Settings"]').count()) >= 1);
  await page.click('[data-testid="dock-home"]'); await page.waitForTimeout(700);
  ok("no media ⇒ Your day, large clock and two resume suggestions", (await page.getByTestId("idle-home").count()) === 1 && (await page.getByTestId("idle-clock").innerText()).length > 3 && (await page.locator('[data-testid="idle-home"] button').count()) === 2);
  await page.getByTestId("idle-captures").click(); await page.waitForTimeout(200);
  ok("'Recent captures' opens the captures folder", await page.evaluate(() => window.__calls.some((c) => c[0] === "open_captures")));
  // العجلة تتنقل بنفس ترتيب الدوك بلا قفز (capture → clip → apps → work)
  await page.click('[data-testid="dock-capture"]'); await page.waitForTimeout(600);
  const seq = [await activeId()];
  for (let n = 0; n < 6; n++) { await page.mouse.move(400, 200); await page.mouse.wheel(0, -120); await page.waitForTimeout(900); const a = await activeId(); if (a !== seq[seq.length - 1]) seq.push(a); }
  ok("wheel order follows the dock exactly (no skipping)", JSON.stringify(seq.slice(0, 4)) === JSON.stringify(["capture", "clip", "apps", "work"]), JSON.stringify(seq));
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
  // حذف الألوان المسجّلة: زر لكل لون + «مسح الكل» (الخلفية تعيد القائمة المحدَّثة)
  {
    const C = (hex) => ({ hex, r: 1, g: 2, b: 3, h: 4, s: 5, l: 6 });
    const ctx2 = await browser.newContext({ viewport: { width: 800, height: 500 } }); const pg = await ctx2.newPage();
    await pg.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, panelTabsStyle: "dock", panelHeight: 400 }, extra: { color_history: [C("#4C8DFF"), C("#1249FC")], color_delete: [C("#1249FC")], color_clear: [] } }));
    await pg.goto(`${BASE}/index.html`); await pg.waitForTimeout(800); await pg.mouse.move(400, 10); await pg.waitForTimeout(500); await pg.click(".island-body", { position: { x: 8, y: 8 } }); await pg.waitForTimeout(1500);
    await pg.click('[data-testid="dock-capture"]'); await pg.waitForTimeout(700);
    ok("capture page lists the saved colors with a delete button each", (await pg.getByTestId("color-delete").count()) === 2);
    await pg.getByTestId("color-delete").first().click(); await pg.waitForTimeout(400);
    ok("deleting a color calls color_delete and the list updates", (await pg.evaluate(() => window.__calls.some((c) => c[0] === "color_delete" && c[1].hex === "#4C8DFF"))) && (await pg.getByTestId("color-delete").count()) === 1);
    await pg.getByTestId("colors-clear").click(); await pg.waitForTimeout(400);
    ok("'Clear all' empties the history", (await pg.evaluate(() => window.__calls.some((c) => c[0] === "color_clear"))) && (await pg.getByTestId("color-delete").count()) === 0);
    await ctx2.close();
  }
  // تخطيط عريض تلقائي من مقاس المستخدم (المقاس نفسه لا يتغيّر)
  ({ ctx, page } = await open(browser, { panelTabsStyle: "dock", panelWidth: 720, panelHeight: 260 }));
  ok("short+wide panel ⇒ Home switches to the wide row layout", (await page.locator('[data-layout="wide"]').count()) === 1);
  const rects = await page.evaluate(() => window.__calls.filter((c) => c[0] === "report_island_rect").map((c) => c[1]));
  ok("the panel size itself is exactly the user's (hit-rect 720×260)", rects.some((r) => r.width === 720 && r.height === 260), JSON.stringify(rects.slice(-2)));
  await ctx.close();
  ({ ctx, page } = await open(browser, { panelTabsStyle: "dock" }));
  ok("explicit 360px panel ⇒ tall layout", (await page.locator('[data-layout="tall"]').count()) === 1);
  await ctx.close();
  // ميديا شغّالة ⇒ المشغّل لا الرئيسية الخاملة
  ({ ctx, page } = await open(browser, { panelTabsStyle: "dock" }, { session: true, source: "Spotify.exe", source_name: "Spotify", title: "Song A", artist: "B", album: "C", duration: 200, position: 10, playing: true, can_prev: true, can_next: true, can_seek: true, can_play: true, can_pause: true }));
  ok("tall panel ⇒ regular player layout (not the compact wide one)", (await page.locator('[data-testid="player-panel"][data-wide="true"]').count()) === 0);
  await ctx.close();
  ({ ctx, page } = await open(browser, { panelTabsStyle: "dock", panelWidth: 720, panelHeight: 260 }, { session: true, source: "Spotify.exe", source_name: "Spotify", title: "Song A", artist: "B", album: "C", duration: 200, position: 10, playing: true, can_prev: true, can_next: true, can_seek: true, can_play: true, can_pause: true }));
  ok("wide panel + media ⇒ full-width compact player whose control sits above the dock", await page.evaluate(() => { const pl = document.querySelector('[data-testid="player-panel"][data-wide="true"]'); const dk = document.querySelector('[data-testid="page-dock"]'); if (!pl || !dk) return false; const c = pl.querySelector("button:last-of-type") || pl; return pl.getBoundingClientRect().bottom <= dk.getBoundingClientRect().top + 1; }));
  await ctx.close();
  ({ ctx, page } = await open(browser, { panelTabsStyle: "dock" }, { session: true, source: "Spotify.exe", source_name: "Spotify", title: "Song A", artist: "B", album: "C", duration: 200, position: 10, playing: true, can_prev: true, can_next: true, can_seek: true, can_play: true, can_pause: true }));
  ok("dock + media ⇒ the agreed player CARD (cover + title + seek + controls in one card)", (await page.locator('[data-testid="player-panel"][data-card="true"]').count()) === 1);
  await ctx.close();
  // مصغّرة المشغّل تتبع مقاس اللوحة (يضبطه المستخدم): لوحة أطول ⇒ مصغّرة أكبر
  const thumbH = async (panelHeight) => { const MED = { session: true, source: "Spotify.exe", source_name: "Spotify", title: "Song A", artist: "B", album: "C", duration: 200, position: 10, playing: true, can_prev: true, can_next: true, can_seek: true, can_play: true, can_pause: true }; const o = await open(browser, { panelTabsStyle: "dock", panelWidth: 520, panelHeight }, MED); const h = await o.page.evaluate(() => document.querySelector('[data-testid="player-panel"][data-card="true"] [data-testid="thumb"]')?.getBoundingClientRect().height ?? 0); await o.ctx.close(); return Math.round(h); };
  const hShort = await thumbH(340), hTall = await thumbH(420);
  ok("thumbnail grows with the island size the user chose", hTall > hShort + 20 && hShort >= 72, `${hShort} → ${hTall}`);
  ({ ctx, page } = await open(browser, { panelTabsStyle: "dock" }, { session: true, source: "Spotify.exe", source_name: "Spotify", title: "Song A", artist: "B", album: "C", duration: 200, position: 10, playing: true, can_prev: true, can_next: true, can_seek: true, can_play: true, can_pause: true }));
  ok("media session ⇒ player shown, idle home hidden", (await page.getByTestId("idle-home").count()) === 0 && (await page.getByText("Song A").count()) >= 1);
  await ctx.close();
  // المهمة 3: العتبة بحسب الارتفاع وحده، مع المحافظة على مقاس اللوحة.
  for (const [w, h, expected] of [[720, 339, true], [520, 290, true], [720, 340, false], [720, 341, false]]) {
    ({ ctx, page } = await open(browser, { panelTabsStyle: "dock", panelWidth: w, panelHeight: h }));
    ok(`height boundary ${w}×${h}`, await page.locator('[data-layout="wide"]').count() === Number(expected));
    await ctx.close();
  }
  const { mkdirSync } = require("node:fs");
  const out = process.env.ARTIFACT_DIR || "/tmp/my-island-task3-shots"; mkdirSync(out, { recursive: true });
  for (const pack of ["noir-gold", "ivory", "nebula-mesh"]) for (const language of ["ar", "en"]) {
    const now = Date.now();
    ctx = await browser.newContext({ viewport: { width: 800, height: 500 } }); page = await ctx.newPage();
    const errors = []; page.on("pageerror", e => errors.push(String(e)));
    const media = { session: true, kind: "gsmtc", source: "YouTube", source_name: "YouTube", title: "سورة الكهف", artist: "مشاري راشد العفاسي", album: "", duration: 2530, position: 760, playing: true, can_seek: true, can_prev: true, can_next: true };
    const cover = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#124b3b"/></svg>').toString("base64")}`;
    await page.addInitScript(bridge({ media, cover, settings: { language, settingsVersion: 4, panelTabsStyle: "dock", panelWidth: 720, panelHeight: 270, eyesEnabled: false, hoverDelayMs: 0, motionLevel: "off", themeMode: pack === "ivory" ? "light" : "dark", themePack: pack, themePackLight: pack, themePackDark: pack, themeMaterial: "solid", showToday: true, showWeather: true, showBattery: true, showMeetings: true, updateAutoCheck: false }, extra: {
      today_get: { city: { id: "riyadh", ar: "الرياض", en: "Riyadh" }, prayers: [{ id: "asr", at: now + 42 * 60000 }], next_day_at: now + 86400000 },
      weather_get: { enabled: true, offline: false, temp: 26, feels: 26, humidity: 30, wind: 5, code: 0, is_day: true, units: "c", city: "Riyadh", fetched_at: now },
      meetings_list: { items: [{ id: "fixture", title: "Meeting", start: now + 600000, end: now + 1200000 }], error: null },
    } }));
    await page.goto(`${BASE}/index.html`); await page.waitForFunction(id => document.documentElement.dataset.pack === id, pack);
    await page.waitForTimeout(650);
    const pill = await page.locator('.island-body').boundingBox(); await page.mouse.move(pill.x + pill.width / 2, pill.y + 2); await page.waitForTimeout(350);
    const peek = await page.locator('.island-body').boundingBox(); await page.mouse.click(peek.x + peek.width / 2, peek.y + 2);
    await page.getByTestId("tile-weather").waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(900);
    const geometry = await page.evaluate(() => {
      const r = sel => { const e = document.querySelector(sel); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom }; };
      return { body: r('.island-body'), home: r('[data-layout="wide"]'), player: r('[data-testid="player-panel"]'), thumb: r('[data-testid="wide-thumb"]'), tiles: r('[data-testid="home-tiles"]'), dock: r('[data-testid="page-dock"]'), cells: [...document.querySelectorAll('[data-testid="home-tiles"] [data-testid^="tile-"]')].map(e => ({ id: e.dataset.testid, y: e.getBoundingClientRect().y })), filter: getComputedStyle(document.querySelector('[data-layout="wide"]')).filter };
    });
    const g = geometry; const label = `${pack}/${language}`;
    ok(`${label}: exact user size 720×270`, g.body.w === 720 && g.body.h === 270, JSON.stringify(g));
    ok(`${label}: full-width player then tiles then dock`, Math.abs(g.player.w - g.home.w) < 2 && g.player.bottom <= g.tiles.y + 1 && g.tiles.bottom <= g.dock.y + 1, JSON.stringify(g));
    ok(`${label}: thumbnail 96×54`, g.thumb.w === 96 && g.thumb.h === 54);
    ok(`${label}: one row prayer/weather/battery, no alternate meeting`, JSON.stringify(g.cells.map(c => c.id)) === JSON.stringify(["tile-prayer", "tile-weather", "tile-battery"]) && g.cells.every(c => Math.abs(c.y - g.cells[0].y) < 1), JSON.stringify(g.cells));
    ok(`${label}: one play control`, await page.getByTestId("player-controls").locator("button").count() === 1);
    ok(`${label}: no page errors`, errors.length === 0, errors.join("|"));
    await page.getByTestId("player-controls").locator("button").click();
    ok(`${label}: play dispatches toggle`, await page.evaluate(() => window.__calls.some(c => c[0] === "media_control" && c[1].action === "toggle")));
    const slider = await page.getByRole("slider").boundingBox(); await page.mouse.click(slider.x + slider.width / 2, slider.y + slider.height / 2);
    ok(`${label}: seek remains interactive`, await page.evaluate(() => window.__calls.some(c => c[0] === "media_seek")));
    await page.locator('.island-body').screenshot({ path: `${out}/${pack}-${language}.png` });
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
})();
