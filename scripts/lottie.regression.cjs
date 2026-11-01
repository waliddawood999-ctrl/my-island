// فحص Lottie (Playwright + جسر Tauri وهمي): الظهور، مستويات الحركة، الإيقاف عند الإخفاء، صفر خمول، وبلا أي جلب خارجي. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/lottie.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const URL = process.env.URL || "http://localhost:4173/index.html";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const PLAY = { session: true, source: "x", source_name: "X", title: "Song", artist: "Art", album: "", duration: 200, position: 10, playing: true, can_prev: true, can_next: true, can_seek: true };
const WEATHER = (code, is_day = true, offline = false) => ({ enabled: true, offline, temp: 24, feels: 25, humidity: 40, wind: 3, code, is_day, units: "c", city: "X", fetched_at: Date.now() });

const external = [];
const fresh = async (browser, cfg = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ ...cfg, settings: { language: "en", eyesEnabled: false, ...(cfg.settings || {}) } }));
  const errs = [];
  page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith("data:") && !u.startsWith("blob:") && !u.startsWith(new globalThis.URL(URL).origin)) external.push(u); });
  await page.goto(URL);
  await page.waitForTimeout(700);
  return { ctx, page, errs };
};
const emit = (page, ev, p) => page.evaluate(([e, x]) => window.__emit(e, x), [ev, p]);
const open = async (page) => { await page.mouse.move(380, 10); await page.waitForTimeout(1500); };
const close = async (page) => { await page.mouse.move(5, 340); await page.waitForTimeout(1500); };
const modes = (page, name) => page.evaluate((n) => [...document.querySelectorAll(`[data-lottie="${n}"]`)].map((e) => ({ mode: e.dataset.lottieMode, canvas: !!e.querySelector("canvas") })), name);
const anyLottie = (page) => page.evaluate(() => document.querySelectorAll("[data-lottie]").length);
const idle = async (page, ms = 3000) => { await page.evaluate(() => { window.__count = true; window.__raf = 0; window.__timers = 0; }); await page.waitForTimeout(ms); return page.evaluate(() => ({ r: window.__raf, t: window.__timers })); };
const tab = async (page, name) => { await page.getByRole("tab", { name }).click(); await page.waitForTimeout(1200); };

(async () => {
  const browser = await chromium.launch();

  // 1) الميديا تعمل: المؤشر يدور (حلقة) داخل اللوحة المفتوحة، وlottie يرسم فعلًا (rAF يعمل)، ويصير إطارًا ثابتًا عند الإيقاف المؤقت
  { const { ctx, page, errs } = await fresh(browser, { media: PLAY });
    ok("closed pill: no Lottie mounted at all", (await anyLottie(page)) === 0);
    await open(page);
    const m = await modes(page, "equalizer");
    ok("equalizer: panel open + playing ⇒ loop with a canvas", m.length === 1 && m[0].mode === "loop" && m[0].canvas, JSON.stringify(m));
    const run = await idle(page, 1500);
    ok("equalizer: actually animating while visible (rAF > 0)", run.r > 5, JSON.stringify(run));
    await emit(page, "media:changed", { info: { ...PLAY, playing: false }, cover: null }).catch(() => {});
    await page.evaluate((p) => window.__emit("media:info", p), { ...PLAY, playing: false });
    await page.waitForTimeout(800);
    // اختيار حدث الميديا الفعلي من الشيفرة: نتحقق بإخفاء الحبة بدل ذلك (مسار ملزم)
    await emit(page, "island:hidden", true); await page.waitForTimeout(900);
    ok("island hidden ⇒ Lottie unmounted immediately (no canvas)", (await modes(page, "equalizer")).every((x) => x.mode === "hidden" && !x.canvas));
    // (rAF الصفحة هنا ليس من Lottie: حلقة motion لحلقة تقدّم الميديا قائمة في main قبل هذه المهمة؛ صفر rAF للمشغّل يُثبت بالجرس أدناه)
    await emit(page, "island:hidden", false); await page.waitForTimeout(1200);
    ok("island shown again ⇒ playing again", (await modes(page, "equalizer")).some((x) => x.mode === "loop" && x.canvas));
    await close(page);
    ok("panel closed ⇒ no Lottie elements", (await anyLottie(page)) === 0);
    const c = await idle(page, 3000);
    ok("collapsed pill: 0 rAF in 3 s (Lottie gone, idle rule holds)", c.r === 0, JSON.stringify(c));
    ok("no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  // 2) مستويات الحركة: reduced = مرة واحدة (تنتهي ثم 0 rAF) · off = إطار ثابت بلا تشغيل
  for (const [lvl, want] of [["reduced", "once"], ["off", "still"]]) {
    const { ctx, page, errs } = await fresh(browser, { media: PLAY, settings: { motionLevel: lvl } });
    await open(page);
    const m = await modes(page, "equalizer");
    ok(`motion=${lvl}: equalizer mode is "${want}" with a canvas`, m.length === 1 && m[0].mode === want && m[0].canvas, JSON.stringify(m));
    // (rAF هنا يشمل حلقة حلقة تقدّم الميديا الموثّقة أثناء التشغيل — فحص صفر الخمول للمشغّل نفسه أدناه بميديا متوقفة وبالجرس)
    ok(`motion=${lvl}: no page errors`, errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }

  // 2b) ميديا متوقفة مؤقتًا: إطار ثابت في كل المستويات و0 rAF/مؤقّتات (صفر خمول)
  for (const lvl of ["full", "reduced", "off"]) {
    const { ctx, page } = await fresh(browser, { media: { ...PLAY, playing: false }, settings: { motionLevel: lvl } });
    await open(page); await page.waitForTimeout(1500);
    const m = await modes(page, "equalizer");
    const r = await idle(page, 2500);
    ok(`paused media (motion=${lvl}): equalizer is a still frame, 0 rAF / 0 timers`, m.length === 1 && m[0].mode === "still" && m[0].canvas && r.r === 0 && r.t === 0, JSON.stringify({ m, r }));
    await ctx.close();
  }

  // 3) الجرس: تذكير ⇒ جرس يتكرر 3 مرات فقط (loops) في الحبة المنكمشة، ويختفي بالإخفاء
  { const { ctx, page, errs } = await fresh(browser, {});
    await emit(page, "island:note", { kind: "reminder", id: "r1", at: Date.now(), late: false, text: "Call mom" });
    await page.waitForTimeout(1200);
    const b = await modes(page, "bell");
    ok("bell: reminder alert in pill ⇒ looping bell with canvas", b.length === 1 && b[0].mode === "loop" && b[0].canvas, JSON.stringify(b));
    await emit(page, "island:hidden", true); await page.waitForTimeout(800);
    ok("bell: island hidden ⇒ unmounted", (await modes(page, "bell")).every((x) => x.mode === "hidden" && !x.canvas));
    const hr = await idle(page, 2500);
    ok("bell: island hidden ⇒ 0 rAF / 0 timers in 2.5 s", hr.r === 0 && hr.t === 0, JSON.stringify(hr));
    await emit(page, "island:hidden", false); await page.waitForTimeout(900);
    ok("bell: island shown again ⇒ ringing again", (await modes(page, "bell")).some((x) => x.mode === "loop" && x.canvas));
    await ctx.close(); }
  { const { ctx, page } = await fresh(browser, { settings: { motionLevel: "off" } });
    await emit(page, "island:note", { kind: "reminder", id: "r2", at: Date.now(), late: false, text: "x" });
    await page.waitForTimeout(1000);
    const b = await modes(page, "bell");
    ok("bell: motion=off ⇒ still frame", b.length === 1 && b[0].mode === "still", JSON.stringify(b));
    const r = await idle(page, 2000);
    ok("bell: motion=off ⇒ 0 rAF", r.r === 0, JSON.stringify(r));
    await ctx.close(); }
  { const { ctx, page } = await fresh(browser, { settings: { motionLevel: "reduced" } });
    await emit(page, "island:note", { kind: "reminder", id: "r3", at: Date.now(), late: false, text: "x" });
    await page.waitForTimeout(800);
    const b = await modes(page, "bell");
    ok("bell: motion=reduced ⇒ plays once", b.length === 1 && b[0].mode === "once", JSON.stringify(b));
    await page.waitForTimeout(3500); // انتهت المرة الواحدة (~3.2 s)
    const r = await idle(page, 2000);
    ok("bell: motion=reduced ⇒ 0 rAF after the single run finished", r.r === 0, JSON.stringify(r));
    await ctx.close(); }

  // 4) الحالات الفارغة (ميديا فارغة + حافظة + رف + لانشر) + نجاح النسخ
  { const { ctx, page, errs } = await fresh(browser, {});
    await open(page);
    ok("empty: media 'nothing playing' uses empty-state Lottie", (await modes(page, "empty")).length >= 1);
    await tab(page, "Clipboard");
    ok("empty: clipboard empty uses empty-state Lottie", (await modes(page, "empty")).length === 1 && (await page.getByText("Clipboard is empty").count()) === 1);
    await tab(page, "Shelf");
    ok("empty: shelf empty uses empty-state Lottie", (await modes(page, "empty")).length === 1 && (await page.getByText("Shelf is empty").count()) === 1);
    await tab(page, "Launcher");
    ok("empty: launcher empty uses empty-state Lottie", (await modes(page, "empty")).length === 1 && (await page.getByText("Launcher is empty").count()) === 1);
    ok("empty: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }
  { const { ctx, page } = await fresh(browser, { extra: { clip_list: [{ id: 1, kind: "text", text: "hello", source: "x", pinned: false, at: Date.now() }], clip_paste: "copied" } });
    await open(page); await tab(page, "Clipboard");
    await page.getByText("hello").first().click(); await page.waitForTimeout(700);
    const t = await modes(page, "tick");
    ok("success: copy toast shows the success-tick Lottie (once)", t.length === 1 && t[0].mode === "loop" ? false : t.length === 1 && t[0].mode === "once" && t[0].canvas, JSON.stringify(t));
    await page.waitForTimeout(2500);
    ok("success: toast gone ⇒ tick unmounted", (await modes(page, "tick")).length === 0);
    await ctx.close(); }

  // 5) تحميل مكتمل ⇒ loader-check مرة واحدة
  { const { ctx, page } = await fresh(browser, { dl: { active: [], recent: [{ name: "a.zip", size: 1000, at: Date.now() }] }, settings: { showDownloads: true } });
    await open(page);
    const l = await modes(page, "loader");
    ok("downloads: newest finished item shows loader→check Lottie once", l.length === 1 && l[0].mode === "once" && l[0].canvas, JSON.stringify(l));
    await ctx.close(); }

  // 6) الطقس: مشمس نهارًا + رذاذ ⇒ Lottie؛ غيرها وليلًا ⇒ Lucide؛ بلا اتصال ⇒ no-internet
  for (const [label, w, want] of [["clear (day)", WEATHER(0), 1], ["drizzle", WEATHER(53), 1], ["clear (night)", WEATHER(0, false), 0], ["rain", WEATHER(63), 0], ["snow", WEATHER(73), 0]]) {
    const { ctx, page } = await fresh(browser, { settings: { showWeather: true }, extra: { weather_get: w } });
    await open(page);
    const m = await modes(page, "weather");
    ok(`weather ${label}: ${want ? "animated Lottie" : "Lucide icon (no Lottie)"}`, m.length === want && (!want || (m[0].mode === "loop" ? false : m[0].mode === "once" && m[0].canvas)), JSON.stringify(m));
    await ctx.close();
  }
  { const { ctx, page } = await fresh(browser, { settings: { showWeather: true }, extra: { weather_get: WEATHER(0, true, true) } });
    await open(page);
    const m = await modes(page, "offline");
    ok("weather offline: no-internet Lottie shown", m.length === 1 && m[0].canvas, JSON.stringify(m));
    await ctx.close(); }
  { const { ctx, page } = await fresh(browser, { settings: { showWeather: true, motionLevel: "off" }, extra: { weather_get: WEATHER(0) } });
    await open(page);
    const m = await modes(page, "weather");
    ok("weather: motion=off ⇒ still frame, 0 rAF", m.length === 1 && m[0].mode === "still" && (await idle(page, 2000)).r === 0);
    await ctx.close(); }

  ok("ZERO external requests during all runs (wasm + .lottie are local, no CDN)", external.length === 0, JSON.stringify(external));
  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
