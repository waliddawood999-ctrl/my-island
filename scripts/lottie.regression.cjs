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
const open = async (page) => { await page.mouse.move(380, 10); await page.waitForTimeout(700); await page.mouse.click(380, 10); await page.waitForTimeout(1500); };
const close = async (page) => { await page.mouse.move(5, 340); await page.waitForTimeout(1500); };
const modes = (page, name) => page.evaluate((n) => [...document.querySelectorAll(`[data-lottie="${n}"]`)].map((e) => ({ mode: e.dataset.lottieMode, canvas: !!e.querySelector("canvas") })), name);
const anyLottie = (page) => page.evaluate(() => document.querySelectorAll("[data-lottie]").length);
const idle = async (page, ms = 3000) => { await page.evaluate(() => { window.__count = true; window.__raf = 0; window.__timers = 0; }); await page.waitForTimeout(ms); return page.evaluate(() => ({ r: window.__raf, t: window.__timers })); };
const tab = async (page, name) => { await page.getByRole("tab", { name }).click(); await page.waitForTimeout(1200); };

(async () => {
  const browser = await chromium.launch();

  // 1) (T03) مؤشر «يشتغل الآن» Lottie استُبدل بالمؤشر الصوتي bars/wave (انظر player.regression.cjs)؛ هنا فقط: الحبة المنكمشة بلا Lottie.
  { const { ctx, page, errs } = await fresh(browser, { media: PLAY });
    ok("closed pill: no Lottie mounted at all", (await anyLottie(page)) === 0);
    ok("no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

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

  // 5) 03-loader-check كان للتنزيلات المكتملة؛ أُزيلت الميزة ⇒ الأصل باقٍ على القرص بلا سطح ولا تسجيل في lottie.tsx (موثّق في docs/STATUS.md)
  { const { ctx, page } = await fresh(browser, { settings: { showDownloads: true }, extra: { downloads_list: { active: [], recent: [{ name: "a.zip", size: 1000, at: Date.now() }] } } });
    await open(page);
    ok("03-loader-check: asset kept on disk", require("fs").existsSync("src/assets/lottie/03-loader-check.lottie"));
    ok("03-loader-check: unused (no loader Lottie anywhere on Home)", (await modes(page, "loader")).length === 0);
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
    // بلا بيانات (بلا اتصال) ⇒ لا بلاطة طقس أصلًا في الرئيسية الخفيفة؛ ملف 05 أُزيل مع الكلمات؛ الخطأ الصريح بلاطة أخرى.
    ok("weather offline: no weather tile and no Lottie on Home (data unavailable ⇒ tile hidden)", (await modes(page, "offline")).length === 0 && (await modes(page, "weather")).length === 0 && !(await page.locator('[data-testid="tile-weather"]').count()));
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
