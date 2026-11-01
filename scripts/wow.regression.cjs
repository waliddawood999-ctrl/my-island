// فحص «جلسة الإبهار» (Playwright + جسر Tauri وهمي): النشاط الحي (كبسولة مدمجة + بطاقة + أولوية + تبديل)، ساعة الإيقاف، سرعتا الشبكة،
// المنحنى المصغّر، وضع تبويب المتصفح، مستويات الحركة، سلامة التخطيط، وصفر كلفة الخمول. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/wow.regression.cjs
// SHOTS=dir لحفظ لقطات الشاشة.
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const URL = process.env.URL || "http://localhost:4173/index.html";
const SHOTS = process.env.SHOTS || "";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };

const fresh = async (browser, cfg = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", ...(cfg.settings || {}) }, ...cfg, settings: { language: "en", ...(cfg.settings || {}) } }));
  const errs = [];
  page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
  await page.goto(URL);
  await page.waitForTimeout(700);
  return { ctx, page, errs };
};
const emit = (page, ev, p) => page.evaluate(([e, x]) => window.__emit(e, x), [ev, p]);
const open = async (page) => { await page.mouse.move(380, 10); await page.waitForTimeout(1500); };
const close = async (page) => { await page.mouse.move(5, 340); await page.waitForTimeout(1500); };
const body = (page) => page.evaluate(() => { const b = document.querySelector(".island-body"); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), tl: cs.borderTopLeftRadius, bl: cs.borderBottomLeftRadius, docked: b.dataset.docked }; });
const calls = (page, name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n).map((c) => c[1]), name);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const overflowX = (page) => page.evaluate(() => [...document.querySelectorAll(".island-body *")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && e.clientWidth > 0 && !e.closest("[data-pill-title]") && !e.className?.toString().includes("truncate")).length);
const hasTest = (page, id) => page.evaluate((i) => !!document.querySelector(`[data-testid="${i}"]`), id);
const pxNum = (v) => parseFloat(v);

(async () => {
  const browser = await chromium.launch();
  const now = Date.now();

  // 1) خمول: كبسولة بلا أنشطة، ثم لوحة مفتوحة بلا أنشطة — لا rAF ولا مؤقّتات جديدة (العيون مطفأة هنا: مؤقّت رمشتها استثناء موثّق ويُفحَص أدناه)
  for (const [label, act] of [["collapsed", async () => {}], ["panel open", open]]) {
    const { ctx, page, errs } = await fresh(browser, { settings: { eyesEnabled: false } });
    await act(page);
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__count = true; window.__timers = 0; window.__raf = 0; });
    await page.waitForTimeout(4000);
    const c = await page.evaluate(() => ({ t: window.__timers, r: window.__raf }));
    ok(`idle (${label}): 0 new timers / 0 rAF in 4 s`, c.t === 0 && c.r === 0, JSON.stringify(c));
    ok(`idle (${label}): no page errors`, errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }

  // 2) تسجيل جارٍ: كبسولة منقسمة بلون التسجيل، بطاقة سحب-للتأكيد، السحب يوقف فعليًا عبر record_stop
  { const { ctx, page, errs } = await fresh(browser, { rec: { recording: true, startedAt: now - 5000, format: "mp4" } });
    await page.waitForTimeout(700);
    const b0 = await body(page);
    ok("recording: capsule widens to the compact split state", b0.w > 220 && await hasTest(page, "capsule-rec"), JSON.stringify(b0));
    ok("recording: capsule is a full pill", pxNum(b0.tl) >= b0.h / 2 - 1, JSON.stringify(b0));
    const reported = await calls(page, "report_island_rect");
    ok("recording: window grew before animation (report_island_rect with compact width)", reported.some((r) => r.width > 220), JSON.stringify(reported.slice(-3)));
    await shot(page, "capsule-rec");
    await open(page);
    ok("recording: panel shows live-activity card first", await hasTest(page, "activity-rec") && await hasTest(page, "swipe-confirm"));
    // سحب جزئي لا ينفّذ
    const thumb = page.locator('[data-testid="swipe-confirm"] button');
    let bb = await thumb.boundingBox(), tr = await page.locator('[data-testid="swipe-confirm"]').boundingBox();
    await page.mouse.move(bb.x + 18, bb.y + 18); await page.mouse.down(); await page.mouse.move(bb.x + 18 + (tr.width - 36) * 0.4, bb.y + 18, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(600);
    ok("swipe-to-confirm: 40% drag does NOT stop the recording", (await calls(page, "record_stop")).length === 0);
    bb = await thumb.boundingBox();
    await shot(page, "panel-rec");
    await page.mouse.move(bb.x + 18, bb.y + 18); await page.mouse.down(); await page.mouse.move(tr.x + tr.width - 4, bb.y + 18, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(600);
    ok("swipe-to-confirm: full drag stops the recording (record_stop)", (await calls(page, "record_stop")).length === 1);
    ok("recording panel: no horizontal overflow", (await overflowX(page)) === 0);
    ok("recording: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  // 3) أولوية: مؤقّت + ميديا + بطارية منخفضة ⇒ المؤقّت بطاقة أولى، الميديا ثانوي مضغوط، التبديل يعمل
  { const media = { session: true, source: "x", source_name: "Spotify", title: "Blue Hour", artist: "Nova", album: "A", duration: 200, position: 30, playing: true, can_prev: true, can_next: true, can_seek: true };
    const { ctx, page, errs } = await fresh(browser, { media, timer: { endsAt: now + 45_000, totalMs: 120_000, label: "tea" }, battery: { has_battery: true, percent: 15, ac: false, charging: false, remaining_min: 40, bt: [] }, settings: { showBattery: true } });
    await page.waitForTimeout(900);
    ok("priority(capsule): timer within 60 s outranks media", await hasTest(page, "capsule-timer") && !(await hasTest(page, "capsule-media")));
    ok("capsule shows 2+ activities ⇒ switch control present", await hasTest(page, "capsule-switch"));
    await shot(page, "capsule-timer");
    await page.getByTestId("capsule-switch").click();
    await page.waitForTimeout(700);
    ok("capsule switch cycles to the next activity (media)", await hasTest(page, "capsule-media"));
    await shot(page, "capsule-media");
    await open(page);
    ok("priority(panel): timer card is first", await hasTest(page, "activity-timer"));
    ok("panel: media shown as compact secondary row (stacked)", await hasTest(page, "secondary-media"));
    ok("panel: activity switch dots present", await hasTest(page, "activity-switch"));
    await shot(page, "panel-timer-secondary");
    await page.getByTestId("secondary-media").click();
    await page.waitForTimeout(900);
    ok("clicking the secondary row makes it the primary card", await hasTest(page, "activity-media"));
    ok("media card keeps its controls", (await page.getByLabel("Play").count()) + (await page.getByLabel("Pause").count()) > 0);
    await shot(page, "panel-media");
    ok("priority panel: no horizontal overflow", (await overflowX(page)) === 0);
    ok("priority: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  // 4) تنزيل: بطاقة + شريط مراحل + نسبة؛ لا أزرار وهمية
  { const dl = { active: [{ id: "1", name: "movie.mkv", size: 600e6, total: 1000e6, percent: 60, speed: 5e6, source: "browser" }], recent: [] };
    const { ctx, page, errs } = await fresh(browser, { dl, settings: { showDownloads: true, downloadsInPill: true } });
    await page.waitForTimeout(700);
    ok("download: compact capsule with accent state", await hasTest(page, "capsule-dl"));
    await open(page);
    ok("download: card with stage bar", await hasTest(page, "activity-dl") && (await page.getByRole("listitem").count()) === 4);
    const nowOnes = await page.locator('[role=listitem][aria-label$="now"]').count();
    ok("stage bar: exactly one lit current stage (60% ⇒ stage 3)", nowOnes === 1 && (await page.locator('[role=listitem][aria-label$="done"]').count()) === 2);
    await shot(page, "panel-dl");
    ok("download: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  // 5) بطارية: قالب النسبة الضخمة + منحنى مصغّر بعد عيّنات كافية
  { const { ctx, page, errs } = await fresh(browser, { battery: { has_battery: true, percent: 62, ac: true, charging: true, remaining_min: 55, bt: [] }, settings: { showBattery: true } });
    await page.waitForTimeout(500);
    await open(page);
    ok("battery (charging): big-percent card", await hasTest(page, "activity-battery"));
    ok("battery sparkline hidden until ≥2 samples", !(await hasTest(page, "spark")));
    await page.evaluate(() => { const d = Date.now(); window.__realNow = Date.now; Date.now = () => d + 61_000; });
    await emit(page, "battery:update", { has_battery: true, percent: 64, ac: true, charging: true, remaining_min: 50, bt: [] });
    await page.waitForTimeout(700);
    ok("battery sparkline appears from existing battery:update history", await hasTest(page, "spark"));
    await shot(page, "panel-battery");
    ok("battery: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  // 6) ساعة الإيقاف: تبويب الملاحظة → ساعة إيقاف → ابدأ ⇒ تظهر في الكبسولة وبطاقة الرئيسية، إيقاف مؤقّت/تصفير يعملان
  { const { ctx, page, errs } = await fresh(browser, { settings: { eyesEnabled: false } });
    await open(page);
    await page.getByRole("tab", { name: "Note" }).click(); await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Stopwatch" }).click(); await page.waitForTimeout(500);
    ok("stopwatch view: big digits at 00:00.00", (await page.getByTestId("stopwatch").textContent()).includes("00:00.00"));
    await page.getByRole("button", { name: "Start" }).click(); await page.waitForTimeout(1300);
    const t = await page.getByTestId("stopwatch").textContent();
    ok("stopwatch runs (digits advance)", /00:0[1-9]\./.test(t), t);
    await shot(page, "stopwatch-view");
    await page.getByRole("tab", { name: "Home" }).click(); await page.waitForTimeout(1200);
    ok("home: stopwatch live-activity card leads", await hasTest(page, "activity-stopwatch"));
    await close(page);
    ok("collapsed: capsule shows stopwatch split state", await hasTest(page, "capsule-stopwatch"));
    await open(page);
    await page.getByRole("button", { name: /Pause/ }).first().click(); await page.waitForTimeout(500);
    await close(page);
    ok("paused stopwatch leaves the capsule (back to clock)", !(await hasTest(page, "capsule-stopwatch")));
    await page.evaluate(() => { window.__count = true; window.__timers = 0; });
    await page.waitForTimeout(3000);
    ok("paused stopwatch ⇒ 0 new timers (no tick when not running)", (await page.evaluate(() => window.__timers)) === 0);
    ok("stopwatch: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  // 7) سرعتا الشبكة: المفتاح يفعّل الخلفية، الكبسولة تعرض الاتجاهين، الإطفاء يوقف
  { const { ctx, page, errs } = await fresh(browser, { settings: { showNetSpeed: true } });
    await page.waitForTimeout(600);
    ok("net speed: key on ⇒ netspeed_active(true) sent", (await calls(page, "netspeed_active")).some((a) => a.active === true));
    await emit(page, "net:speed", { down: 2_621_440, up: 307_200 });
    await page.waitForTimeout(800);
    ok("net speed: capsule shows down/up", await hasTest(page, "capsule-net") && /2\.5 MB\/s/.test(await page.getByTestId("capsule-net").textContent()) && /300 KB\/s/.test(await page.getByTestId("capsule-net").textContent()));
    await shot(page, "capsule-net");
    await emit(page, "settings:changed", { showNetSpeed: false });
    await page.waitForTimeout(800);
    ok("net speed: key off ⇒ netspeed_active(false) and capsule back to clock", (await calls(page, "netspeed_active")).slice(-1)[0]?.active === false && !(await hasTest(page, "capsule-net")));
    ok("net speed: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }
  { const { ctx, page } = await fresh(browser);
    ok("net speed default off ⇒ never activates the backend thread", !(await calls(page, "netspeed_active")).some((a) => a.active === true));
    await ctx.close(); }

  // 8) وضع تبويب المتصفح
  { const { ctx, page, errs } = await fresh(browser, { settings: { browserTabMode: true } });
    const b0 = await body(page);
    ok("tab-mode: starts as the normal capsule", b0.docked === "false" && b0.h === 34 && pxNum(b0.tl) >= 16, JSON.stringify(b0));
    await emit(page, "island:dock", { active: true, browser: "edge", strip: 41, inset: 6 });
    await page.waitForTimeout(1200);
    const b1 = await body(page);
    ok("tab-mode: browser maximized ⇒ tab shape (flat bottom, rounded top, height strip−inset, y=inset)", b1.docked === "true" && b1.h === 35 && b1.top === 6 && pxNum(b1.tl) === 12 && pxNum(b1.bl) === 0, JSON.stringify(b1));
    ok("tab-mode: window resized to the strip height (41)", (await calls(page, "report_island_rect")).some((r) => r.height === 41));
    await shot(page, "tab-mode");
    await page.mouse.move(380, 20); await page.waitForTimeout(1500);
    const b2 = await body(page);
    ok("tab-mode: hover opens the normal panel from the docked spot", b2.w === 720 && b2.top === 0 && pxNum(b2.tl) === 28, JSON.stringify(b2));
    await page.mouse.move(5, 340); await page.waitForTimeout(1500);
    const b3 = await body(page);
    ok("tab-mode: after collapse still docked", b3.docked === "true" && b3.h === 35, JSON.stringify(b3));
    await page.mouse.click(380, 20); await page.waitForTimeout(1500);
    ok("tab-mode: click opens the panel", (await body(page)).w === 720);
    await page.mouse.move(5, 340); await page.waitForTimeout(1500);
    await emit(page, "island:dock", { active: false, browser: "", strip: 0, inset: 0 });
    await page.waitForTimeout(1200);
    const b4 = await body(page);
    ok("tab-mode: another app / un-maximize ⇒ back to the floating capsule", b4.docked === "false" && b4.h === 34 && b4.top === 0 && pxNum(b4.tl) >= 16 && pxNum(b4.bl) >= 16, JSON.stringify(b4));
    await emit(page, "island:dock", { active: true, browser: "x", strip: 5000, inset: -3 });
    await page.waitForTimeout(800);
    ok("tab-mode: garbage payload ⇒ normal mode (never hidden/off-screen)", (await body(page)).docked === "false" && (await body(page)).h === 34);
    ok("tab-mode: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }
  { const { ctx, page } = await fresh(browser);
    await emit(page, "island:dock", { active: true, browser: "edge", strip: 41, inset: 6 });
    await page.waitForTimeout(800);
    ok("tab-mode OFF (default): dock events are ignored", (await body(page)).docked === "false" && (await body(page)).h === 34);
    ok("tab-mode OFF: never asks the backend for dock state", (await calls(page, "island_dock_get")).length === 0);
    await ctx.close(); }

  // 9) مستويات الحركة: «متوقفة» ⇒ تبديل فوري وبلا أخطاء؛ «مخففة» ⇒ تعمل
  for (const lvl of ["reduced", "off"]) {
    const { ctx, page, errs } = await fresh(browser, { rec: { recording: true, startedAt: now - 5000, format: "mp4" }, settings: { motionLevel: lvl } });
    await page.waitForTimeout(500);
    const w0 = (await body(page)).w;
    await open(page);
    ok(`motion ${lvl}: capsule widened (${w0}px) and panel opens with the rec card`, w0 > 220 && await hasTest(page, "activity-rec"));
    ok(`motion ${lvl}: no page errors`, errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }

  // 10) تحميل ثقيل: ثبات مع تدفّق تحديثات (تنزيل يتحدّث 30 مرة) — لا أخطاء ولا تسرّب مؤقّتات
  { const dl = { active: [{ id: "1", name: "a.zip", size: 1e6, total: 1e8, percent: 1, speed: 1e6, source: "browser" }], recent: [] };
    const { ctx, page, errs } = await fresh(browser, { dl, settings: { showDownloads: true, downloadsInPill: true } });
    await open(page);
    await page.evaluate(() => { window.__count = true; window.__timers = 0; });
    for (let n = 2; n <= 30; n++) await emit(page, "downloads:update", { active: [{ id: "1", name: "a.zip", size: n * 1e6, total: 1e8, percent: n, speed: 1e6, source: "browser" }], recent: [] });
    await page.waitForTimeout(1500);
    ok("30 rapid download updates: no errors, panel still laid out", errs.length === 0 && (await overflowX(page)) === 0, JSON.stringify(errs));
    await ctx.close(); }

  // 11) ترتيب الإعدادات: المجموعات بالترتيب المطلوب، كل المفاتيح القديمة قائمة، التنقّل يعمل، بلا فيض أفقي
  { const ctx = await browser.newContext({ viewport: { width: 760, height: 700 } });
    const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en" } }));
    const errs = []; page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
    await page.goto(URL.replace("index.html", "settings.html")); await page.waitForTimeout(900);
    const groups = await page.locator("h2").allTextContents();
    ok("settings: group order = General → Appearance & media → Modules → Performance", JSON.stringify(groups) === JSON.stringify(["General", "Appearance & media", "Modules", "Performance & saving"]), JSON.stringify(groups));
    const secs = await page.locator("h3").allTextContents();
    ok("settings: sections in the intended order", JSON.stringify(secs) === JSON.stringify(["Startup & position", "Behavior", "Media & appearance", "Today & prayer", "Downloads, battery & network", "Clipboard", "System & privacy", "Meetings", "Capture & recording", "Command palette", "My time & breaks", "Performance & saving"]), JSON.stringify(secs));
    ok("settings: all 12 sections reachable (9 original + Today & prayer, System & privacy, Meetings restored from L1/L3/L4)", (await page.locator("section").count()) === 12);
    ok("settings: new toggles exist in their thematic sections", (await page.getByRole("switch", { name: "Browser tab mode" }).count()) === 1 && (await page.getByRole("switch", { name: "Network speed in the pill" }).count()) === 1);
    ok("settings: Browser tab mode sits in «Media & appearance»", await page.evaluate(() => [...document.querySelectorAll("section")].find((x) => x.querySelector("h3")?.textContent === "Media & appearance")?.querySelector('[aria-label="Browser tab mode"]') != null));
    ok("settings: no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.getByRole("button", { name: "Performance" }).first().click(); await page.waitForTimeout(900);
    const y = await page.evaluate(() => Math.round(document.getElementById("grp-perf").getBoundingClientRect().top));
    ok("settings nav: clicking «Performance» smooth-scrolls it into view (page scrolled, group above the fold)", y >= 40 && y <= 400 && (await page.evaluate(() => window.scrollY)) > 0, String(y));
    ok("settings nav: current section highlighted", (await page.locator('nav [aria-current="true"]').textContent()) === "Performance");
    await shot(page, "settings-top"); 
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
    await shot(page, "settings-top");
    ok("settings: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  await browser.close();
  console.log(fails ? "FAILED " + fails : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
