// T03: حالات الجزيرة (حبة/لمحة/لوحة)، العجلة، المشغّل، العيون، المنطقة (اختبار الإصابة)، تقليل الحركة. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/t03.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const media = (o = {}) => ({ session: true, source: "Spotify.exe", source_name: "Spotify", title: "Blue Hour", artist: "Nova", album: "Night Drive", duration: 215, position: 62, playing: true, can_prev: true, can_next: true, can_seek: true, ...o });
const COVER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%23e0457b'/><circle cx='32' cy='32' r='18' fill='%23f7b733'/></svg>";
const now = Date.now();
const today = { city: { id: "madinah", ar: "المدينة", en: "Madinah" }, prayers: [["fajr", -10], ["sunrise", -8], ["dhuhr", 1], ["asr", 4], ["maghrib", 7], ["isha", 8]].map(([id, h]) => ({ id, at: now + h * 3600e3 })), next_day_at: now + 20 * 3600e3 };
const mk = async (browser, cfg, settings = {}, vp = { width: 800, height: 500 }) => {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, panelTabsStyle: "labels", ...settings }, extra: { today_get: today, ...(cfg.extra || {}) }, ...cfg }));
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
  return { ctx, page, errs };
};
const st = (page) => page.evaluate(() => { const b = document.querySelector(".island-body"); const r = b.getBoundingClientRect(); return { mode: b.dataset.mode, w: Math.round(r.width), h: Math.round(r.height) }; });
const card = (page) => page.evaluate(() => document.querySelector("[data-testid=peek-view]")?.dataset.card ?? null);
const rects = (page) => page.evaluate(() => window.__calls.filter((c) => c[0] === "report_island_rect").map((c) => c[1]));

(async () => {
  const browser = await chromium.launch();

  // 1) العيون: نفس الحجم والموضع داخل الحبة كما قبل T03 (الأساس من الإصدار 450146e)
  { const base = JSON.parse(fs.readFileSync(`${__dirname}/eyes.baseline.json`, "utf8"));
    for (const [name, s] of [["default", {}], ["wide", { pillWidth: 260, pillHeight: 40 }]]) {
      const { ctx, page } = await mk(browser, {}, { eyesEnabled: true, ...s });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const body = document.querySelector(".island-body").getBoundingClientRect(); const eyes = document.querySelector("[data-eyes]");
        const r = (e) => { const x = e.getBoundingClientRect(); return { x: x.left - body.left, y: x.top - body.top, w: x.width, h: x.height }; };
        return { pill: { w: body.width, h: body.height }, mode: eyes.dataset.eyes, group: r(eyes), shapes: [...eyes.querySelectorAll(".block")].map(r) };
      });
      const b = base[name]; const near = (a, c) => Math.abs(a - c) <= 0.6;
      // x يتبع عرض نص الساعة (الأرقام غير ثابتة العرض) فيُسمح بـ±2px؛ الحجم والارتفاع والفاصل بين العينين صارمة.
      const same = (a, c) => Math.abs(a.x - c.x) <= 2 && near(a.y, c.y) && near(a.w, c.w) && near(a.h, c.h);
      ok(`eyes [${name}]: group rect identical to pre-T03 (${JSON.stringify(b.group)})`, same(m.group, b.group), JSON.stringify(m.group));
      ok(`eyes [${name}]: both eye shapes identical size/position/gap`, m.shapes.length === 2 && near(m.shapes[1].x - m.shapes[0].x, b.shapes[1].x - b.shapes[0].x) && same(m.shapes[0], b.shapes[0]) && same(m.shapes[1], b.shapes[1]), JSON.stringify(m.shapes));
      ok(`eyes [${name}]: awake and pill ${b.pill.w}×${b.pill.h}`, m.mode === "awake" && m.pill.w === b.pill.w && m.pill.h === b.pill.h);
      ok(`eyes [${name}]: pill layer is visible in pill mode`, await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=pill-layer]")).opacity === "1"));
      await ctx.close();
    }
    // العيون تختفي مع المحتوى عند التمدد وتعود عند الإغلاق (بلا قفز)
    const { ctx, page } = await mk(browser, {}, { eyesEnabled: true });
    const op = () => page.evaluate(() => +getComputedStyle(document.querySelector("[data-testid=pill-layer]")).opacity);
    await page.mouse.move(400, 10); await page.waitForTimeout(1200);
    ok("eyes layer faded out in peek", (await op()) < 0.05, String(await op()));
    await page.mouse.move(10, 480); await page.waitForTimeout(1500);
    ok("eyes layer back at full opacity after closing", (await op()) > 0.99, String(await op()));
    await ctx.close(); }

  // 2) الحالات والمهل
  { const { ctx, page, errs } = await mk(browser, { media: media() }, { hoverDelayMs: 400 });
    await page.mouse.move(400, 10); await page.waitForTimeout(250); await page.mouse.move(10, 480); await page.waitForTimeout(800);
    ok("leaving before hoverDelay cancels the peek", (await st(page)).mode === "pill");
    await page.mouse.move(400, 10); await page.waitForTimeout(250);
    ok("no peek before hoverDelayMs (400)", (await st(page)).mode === "pill");
    await page.waitForTimeout(1200);
    ok("peek after the delay, size from peekWidth×peekHeight (400×120)", (await st(page)).mode === "peek" && (await st(page)).w === 400 && (await st(page)).h === 120, JSON.stringify(await st(page)));
    await page.mouse.move(10, 480); await page.waitForTimeout(150);
    ok("peek still open 150ms after leaving (close delay 300ms)", (await st(page)).mode === "peek");
    await page.mouse.move(400, 10); await page.waitForTimeout(600);
    ok("returning to the island cancels the close", (await st(page)).mode === "peek");
    await page.mouse.click(400, 10); await page.waitForTimeout(1500);
    ok("click ⇒ panel 520×290", (await st(page)).mode === "panel" && (await st(page)).w === 520 && (await st(page)).h === 290, JSON.stringify(await st(page)));
    await page.mouse.move(10, 480); await page.waitForTimeout(250);
    ok("panel still open 250ms after leaving", (await st(page)).mode === "panel");
    await page.waitForTimeout(1500);
    ok("panel closed to pill after ~500ms", (await st(page)).mode === "pill" && (await st(page)).w === 220, JSON.stringify(await st(page)));
    await page.mouse.move(400, 10); await page.waitForTimeout(1500); await page.mouse.click(400, 10); await page.waitForTimeout(1300);
    await page.keyboard.press("Escape"); await page.waitForTimeout(1000);
    ok("Esc: panel ⇒ peek", (await st(page)).mode === "peek", JSON.stringify(await st(page)));
    const r = await rects(page);
    ok("native window never resized: only region reports with radius (pill→peek→panel→…)", r.length >= 4 && r.every((x) => typeof x.radius === "number") && r.some((x) => x.width === 400 && x.height === 120) && r.some((x) => x.width === 520 && x.height === 290), JSON.stringify(r.slice(0, 5)));
    ok("no page errors", errs.length === 0, errs.join("|"));
    await ctx.close(); }

  // 3) عجلة اللمحة: دوران + خنق 280ms + ترتيب + إيقاف
  { const { ctx, page } = await mk(browser, { media: media(), extra: { weather_get: { enabled: true, offline: false, temp: 30, feels: 31, humidity: 20, wind: 5, code: 1, is_day: true, units: "c", city: "m", fetched_at: now, error: "" } } }, { hoverDelayMs: 0, showWeather: true });
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    ok("peek starts on the first card (player) with 4 dots", (await card(page)) === "player" && (await page.locator(".pk-dot").count()) === 4);
    ok("active dot 10×4, others 4×4", await page.evaluate(() => { const d = [...document.querySelectorAll(".pk-dot")].map((e) => e.getBoundingClientRect()); return Math.round(d[0].width) === 10 && Math.round(d[0].height) === 4 && d.slice(1).every((r) => Math.round(r.width) === 4 && Math.round(r.height) === 4); }));
    await page.mouse.wheel(0, 100); await page.mouse.wheel(0, 100); await page.waitForTimeout(900);
    ok("two wheel ticks inside 280ms = ONE step (today)", (await card(page)) === "today", await card(page));
    await page.waitForTimeout(300); await page.mouse.wheel(0, 100); await page.waitForTimeout(900);
    ok("next tick after the throttle ⇒ weather", (await card(page)) === "weather");
    await page.waitForTimeout(300); await page.mouse.wheel(0, -100); await page.waitForTimeout(900);
    ok("wheel up goes back ⇒ today", (await card(page)) === "today");
    await ctx.close(); }
  { const { ctx, page } = await mk(browser, { media: media() }, { hoverDelayMs: 0, peekCardOrder: ["timer", "weather", "today", "player"] });
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    ok("peekCardOrder decides the first card (timer)", (await card(page)) === "timer", await card(page));
    await ctx.close(); }
  { const { ctx, page } = await mk(browser, { media: media() }, { hoverDelayMs: 0, peekWheelCycle: false });
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    await page.mouse.wheel(0, 100); await page.waitForTimeout(700);
    ok("peekWheelCycle=false: first card only, no dots, wheel ignored", (await card(page)) === "player" && (await page.locator(".pk-dot").count()) === 0);
    await ctx.close(); }

  // 4) عجلة اللوحة: فوق = التالية، تحت = السابقة، بلا التفاف
  { const { ctx, page } = await mk(browser, { media: media() }, { hoverDelayMs: 0 });
    await page.mouse.move(400, 10); await page.waitForTimeout(1000); await page.mouse.click(400, 10); await page.waitForTimeout(1400);
    const sel = () => page.evaluate(() => document.querySelector("[role=tab][aria-selected=true]")?.textContent);
    ok("panel starts on Home", (await sel()) === "Home");
    await page.mouse.move(400, 150); await page.mouse.wheel(0, -100); await page.waitForTimeout(700);
    ok("wheel up ⇒ next page (Clipboard)", (await sel()) === "Clipboard", await sel());
    await page.waitForTimeout(300); await page.mouse.wheel(0, 100); await page.waitForTimeout(700);
    ok("wheel down ⇒ previous page (Home)", (await sel()) === "Home");
    await page.waitForTimeout(300); await page.mouse.wheel(0, 100); await page.waitForTimeout(700);
    ok("clamped at the first page (no wrap)", (await sel()) === "Home");
    await ctx.close(); }

  // 5) المشغّل
  { const { ctx, page } = await mk(browser, { media: media({ title: "A".repeat(160) }), extra: {} }, { hoverDelayMs: 0 });
    await page.evaluate((c) => window.__emit("media:cover", c), COVER); await page.waitForTimeout(500);
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    ok("peek: source badge Spotify with green dot", await page.evaluate(() => { const b = document.querySelector("[data-testid=source-badge]"); return b?.dataset.source === "spotify" && getComputedStyle(b.firstElementChild).backgroundColor === "rgb(30, 215, 96)"; }));
    ok("peek: artwork 50px, radius 24%", await page.evaluate(() => { const a = document.querySelector("[data-testid=artwork]"); const r = a.getBoundingClientRect(); return Math.round(r.width) === 50 && Math.abs(parseFloat(getComputedStyle(a).borderTopLeftRadius) - 12) < 0.6; }));
    ok("peek: progress track 3px, times tabular", await page.evaluate(() => Math.round(document.querySelector("[data-testid=progress] > div").getBoundingClientRect().height) === 3 && getComputedStyle(document.querySelector("[data-testid=times]")).fontVariantNumeric.includes("tabular")));
    ok("peek: very long title is truncated with ellipsis, no overflow", await page.evaluate(() => { const t = [...document.querySelectorAll("[data-testid=peek-view] .truncate")].find((e) => e.textContent.startsWith("AAAA")); return !!t && getComputedStyle(t).textOverflow === "ellipsis" && t.scrollWidth > t.clientWidth; }));
    ok("backdrop: blurred artwork at 0.35 (glass) on the player card", await page.evaluate(() => { const b = document.querySelector("[data-testid=artwork-backdrop]"); return !!b && Math.abs(+getComputedStyle(b).opacity - 0.35) < 0.02 && getComputedStyle(b).filter.includes("blur(30px)") && getComputedStyle(b).filter.includes("saturate(1.5)"); }));
    await page.mouse.click(400, 10); await page.waitForTimeout(1500);
    const ctlCount = await page.evaluate(() => window.__calls.filter((c) => c[0] === "media_control").length);
    await page.getByRole("button", { name: "Pause" }).click(); await page.waitForTimeout(400);
    ok("play/pause calls media_control(toggle) and does NOT change the island state", (await st(page)).mode === "panel" && (await page.evaluate(() => window.__calls.filter((c) => c[0] === "media_control").map((c) => c[1].action))).pop() === "toggle" && ctlCount === 0);
    ok("panel: artwork 112px (compact), controls 34/44/34", await page.evaluate(() => { const a = document.querySelector("[data-testid=player-panel] [data-testid=artwork]").getBoundingClientRect(); const b = [...document.querySelectorAll("[data-testid=player-panel] [data-testid=player-controls] button")].map((x) => x.offsetWidth); return Math.round(a.width) === 112 && b.join() === "34,44,34"; }), JSON.stringify(await page.evaluate(() => ({ a: document.querySelector("[data-testid=player-panel] [data-testid=artwork]")?.getBoundingClientRect().width, b: [...document.querySelectorAll("[data-testid=player-panel] [data-testid=player-controls] button")].map((x) => x.getBoundingClientRect().width) }))));
    ok("panel: progress 5px; title 20px/650", await page.evaluate(() => { const t = [...document.querySelectorAll("[data-testid=player-panel] .truncate")].find((e) => e.textContent.startsWith("AAAA")); return Math.round(document.querySelector("[data-testid=player-panel] [data-testid=progress] > div").getBoundingClientRect().height) === 5 && getComputedStyle(t).fontSize === "20px" && getComputedStyle(t).fontWeight === "650"; }));
    ok("panel: backdrop on Home tab", await page.evaluate(() => +getComputedStyle(document.querySelector("[data-testid=artwork-backdrop]")).opacity > 0.3));
    await page.getByRole("tab", { name: "Clipboard" }).click(); await page.waitForTimeout(900);
    ok("backdrop fades out on a non-player tab", await page.evaluate(() => +getComputedStyle(document.querySelector("[data-testid=artwork-backdrop]")).opacity < 0.05));
    await ctx.close(); }
  for (const [layout, art] of [["large", 150], ["minimal", 0]]) {
    const { ctx, page } = await mk(browser, { media: media() }, { hoverDelayMs: 0, playerLayout: layout });
    await page.evaluate((c) => window.__emit("media:cover", c), COVER); await page.waitForTimeout(400);
    await page.mouse.move(400, 10); await page.waitForTimeout(1000); await page.mouse.click(400, 10); await page.waitForTimeout(1500);
    const w = await page.evaluate(() => { const a = document.querySelector("[data-testid=player-panel] [data-testid=artwork]"); return a ? Math.round(a.getBoundingClientRect().width) : 0; });
    ok(`panel layout=${layout}: artwork ${art}px`, w === art, String(w));
    if (layout === "minimal") ok("minimal: backdrop opacity 0", await page.evaluate(() => !document.querySelector("[data-testid=artwork-backdrop]")));
    await ctx.close();
  }
  for (const [aumid, name, kind] of [["Spotify.exe", "Spotify", "spotify"], ["chrome.exe", "chrome", "chrome"], ["MSEdge", "MSEdge", "edge"], ["Google.YouTubeMusic", "YouTubeMusic", "youtube"], ["Some.App", "SomeApp", "other"]]) {
    const { ctx, page } = await mk(browser, { media: media({ source: aumid, source_name: name }) }, { hoverDelayMs: 0 });
    await page.mouse.move(400, 10); await page.waitForTimeout(1200);
    const b = await page.evaluate(() => { const e = document.querySelector("[data-testid=source-badge]"); return { kind: e?.dataset.source, dot: e && getComputedStyle(e.firstElementChild).backgroundColor }; });
    ok(`source badge ${aumid} ⇒ ${kind}${kind === "youtube" ? " (only when the source itself says YouTube)" : kind === "chrome" || kind === "edge" ? " (browser name, never faked as YouTube)" : ""}`, b.kind === kind && (kind === "youtube" ? b.dot === "rgb(255, 59, 48)" : kind === "spotify" ? b.dot === "rgb(30, 215, 96)" : b.dot !== "rgb(255, 59, 48)"), JSON.stringify(b));
    await ctx.close();
  }

  // 6) المؤشر الصوتي ومبدأ «0 rAF في الخمول»
  const raf = async (page, ms) => { await page.evaluate(() => { window.__raf = 0; window.__count = true; }); await page.waitForTimeout(ms); return page.evaluate(() => { window.__count = false; return window.__raf; }); };
  { const { ctx, page } = await mk(browser, { media: media({ playing: true }) }, { hoverDelayMs: 0 });
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    ok("visualizer bars animate while playing & visible (rAF running)", (await raf(page, 1500)) > 10);
    ok("peek: 5 bars", (await page.locator("[data-testid=peek-view] [data-viz=bars] > span").count()) === 5);
    await ctx.close(); }
  { const { ctx, page } = await mk(browser, { media: media({ playing: false }) }, { hoverDelayMs: 0 });
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    ok("paused: visualizer eased down and stopped — 0 rAF", (await raf(page, 1500)) <= 2);
    await ctx.close(); }
  { const { ctx, page } = await mk(browser, { media: media({ playing: true }) }, { hoverDelayMs: 0, reduceMotion: "always" });
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    ok("reduce motion: visualizer is static — 0 rAF", (await raf(page, 1500)) <= 2);
    await ctx.close(); }
  { const { ctx, page } = await mk(browser, { media: media({ playing: true }) }, { visualizer: "wave", hoverDelayMs: 0 });
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    ok("visualizer=wave renders an SVG polyline", (await page.locator("[data-testid=peek-view] [data-viz=wave] polyline").count()) === 1);
    await ctx.close(); }
  { const { ctx, page } = await mk(browser, { media: media({ playing: true }) }, { visualizer: "off", hoverDelayMs: 0 });
    await page.mouse.move(400, 10); await page.waitForTimeout(1300);
    ok("visualizer=off hides it and nothing animates", (await page.locator("[data-viz]").count()) === 0 && (await raf(page, 1000)) <= 2);
    await ctx.close(); }
  { const { ctx, page } = await mk(browser, { media: media({ playing: true }) }, {});
    ok("pill with playing media: 4 mini bars + thumbnail inside the same pill size", (await page.locator("[data-testid=capsule-media] [data-viz=bars] > span").count()) === 4 && (await st(page)).w === 220 && (await st(page)).h === 34);
    await ctx.close(); }
  { const { ctx, page } = await mk(browser, {}, {});
    ok("idle pill (no media): 0 rAF", (await raf(page, 2000)) === 0);
    await ctx.close(); }

  // 7) تقليل الحركة: القفز بلا نابض + تلاشٍ 150ms
  { for (const [label, st2, media2] of [["reduceMotion=always", { reduceMotion: "always" }, undefined], ["OS prefers-reduced-motion + system", { reduceMotion: "system" }, "reduce"]]) {
      const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, reducedMotion: media2 || "no-preference" });
      const page = await ctx.newPage();
      await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, ...st2 }, media: media() }));
      await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
      await page.mouse.move(400, 10); await page.waitForTimeout(80);
      const s1 = await page.evaluate(() => { const b = document.querySelector(".island-body").getBoundingClientRect(); return { w: b.width, mode: document.querySelector(".island-body").dataset.mode }; });
      await page.waitForTimeout(600);
      const sizes = await page.evaluate(() => new Promise((res) => { const b = document.querySelector(".island-body"); const out = []; const t0 = performance.now(); const f = () => { out.push(Math.round(b.getBoundingClientRect().width)); if (performance.now() - t0 < 250) requestAnimationFrame(f); else res(out); }; b.dispatchEvent(new MouseEvent("click", { bubbles: true })); f(); }));
      ok(`${label}: island jumps to the panel size (no spring, no overshoot)`, Math.max(...sizes) <= 522 && sizes.filter((w) => w > 220 && w < 520).length <= 2, JSON.stringify(sizes.slice(0, 12)));
      void s1; await ctx.close();
    } }

  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
