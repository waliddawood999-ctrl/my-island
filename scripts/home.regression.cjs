// فحص رئيسية الجزيرة الخفيفة + غياب التنزيلات + العيون (Playwright + جسر Tauri وهمي). تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/home.regression.cjs
// SHOTS=dir لحفظ لقطات الشاشة.
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const URL = process.env.URL || "http://localhost:4173/index.html";
const SHOTS = process.env.SHOTS || "";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const NOW = Date.now();
const TODAY = (offs = [-6, -5, -4, 3, 6, 9]) => ({ city: { id: "riyadh", ar: "الرياض", en: "Riyadh" }, prayers: ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"].map((id, n) => ({ id, at: NOW + offs[n] * 3_600_000 })), next_day_at: NOW + 12 * 3_600_000 });
const WEATHER = (code = 0, is_day = true) => ({ enabled: true, offline: false, temp: 24.4, feels: 25, humidity: 40, wind: 3, code, is_day, units: "c", city: "X", fetched_at: NOW });
const MEET = (start = NOW + 3 * 3_600_000, join = true) => ({ configured: true, enabled: true, error: null, fetched_at: NOW, items: [{ id: "m1", title: "Design review", start, end: start + 1_800_000, location: "", join: join ? { provider: "zoom", url: "https://zoom.us/j/1" } : null, recurring: false }] });
const BAT = (o = {}) => ({ has_battery: true, percent: 80, ac: false, charging: false, remaining_min: 120, bt: [], ...o });

const fresh = async (browser, cfg = {}, vp = { width: 760, height: 420 }) => {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ ...cfg, settings: { language: "en", eyesEnabled: false, ...(cfg.settings || {}) } }));
  const errs = [];
  page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
  await page.goto(URL);
  await page.waitForTimeout(700);
  return { ctx, page, errs };
};
const open = async (page) => { await page.mouse.move(380, 10); await page.waitForTimeout(700); await page.mouse.click(380, 10); await page.waitForTimeout(1500); };
const close = async (page) => { await page.mouse.move(5, 400); await page.waitForTimeout(1500); };
const has = (page, id) => page.evaluate((i) => !!document.querySelector(`[data-testid="${i}"]`), id);
const tiles = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="home-tiles"] > div > [data-testid]')].map((e) => e.dataset.testid));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const tab = async (page, name) => { await page.getByRole("tab", { name }).click(); await page.waitForTimeout(1200); };
const ALL = { showWeather: true, showMeetings: true, showBattery: true, showToday: true };
const allExtra = { today_get: TODAY(), weather_get: WEATHER(), meetings_list: MEET() };

(async () => {
  const browser = await chromium.launch();

  // 1) كل البيانات متوفرة ⇒ أربع بلاطات بالترتيب الثابت وبمحتواها
  { const { ctx, page, errs } = await fresh(browser, { battery: BAT(), extra: allExtra, settings: ALL });
    await open(page);
    ok("tiles: all four, fixed order prayer → weather → meeting → battery", JSON.stringify(await tiles(page)) === JSON.stringify(["tile-prayer", "tile-weather", "tile-meeting", "tile-battery"]), JSON.stringify(await tiles(page)));
    const t = (id) => page.locator(`[data-testid="${id}"]`).innerText();
    const p = await t("tile-prayer");
    ok("prayer tile: name + time + live countdown + hijri line", /Asr/.test(p) && /\d{1,2}:\d{2}\s?(AM|PM)/i.test(p) && /\d{1,2}:\d{2}:\d{2}|\d{2}:\d{2}/.test(p) && /\d{4}/.test(p), p);
    const c1 = await page.locator('[data-testid="tile-prayer"] span.font-bold.tabular-nums, [data-testid="tile-prayer"] span[dir=ltr].text-\\[18px\\]').first().innerText();
    await page.waitForTimeout(2100);
    const c2 = await page.locator('[data-testid="tile-prayer"] span[dir=ltr].text-\\[18px\\]').first().innerText();
    ok("prayer tile: countdown is live (ticks)", c1 !== c2, `${c1} → ${c2}`);
    const w = await t("tile-weather");
    ok("weather tile: temperature + condition", /24°C/.test(w) && /Clear|Sunny|clear/i.test(w), w);
    ok("weather tile: sunny daytime uses the animated Lottie 07", await page.evaluate(() => !!document.querySelector('[data-testid="tile-weather"] [data-lottie="weather"]')));
    const m = await t("tile-meeting");
    ok("meeting tile: title + time + Join button", /Design review/.test(m) && /\d{1,2}:\d{2}/.test(m) && /Join/.test(m), m);
    await page.getByRole("button", { name: /Join Zoom/ }).click();
    ok("meeting tile: Join invokes meetings_join with the link", await page.evaluate(() => window.__calls.some((c) => c[0] === "meetings_join" && c[1].url === "https://zoom.us/j/1")));
    const b = await t("tile-battery");
    ok("battery tile: percent + state", /80%/.test(b) && /On battery/.test(b), b);
    ok("tiles: no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await shot(page, "home-all-tiles");
    ok("tiles: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  // 2) ما لا بيانات له أو غير مفعّل لا يظهر
  const cases = [
    ["nothing enabled/available", { extra: {}, settings: { showToday: true } }, []],
    ["only battery", { battery: BAT(), extra: {}, settings: { showBattery: true } }, ["tile-battery"]],
    ["battery on but no battery hardware", { battery: BAT({ has_battery: false, percent: null }), extra: {}, settings: { showBattery: true } }, []],
    ["battery data but showBattery off", { battery: BAT(), extra: {}, settings: {} }, []],
    ["weather on, data present", { extra: { weather_get: WEATHER(63) }, settings: { showWeather: true } }, ["tile-weather"]],
    ["weather on but offline ⇒ explicit error tile (not silent)", { extra: { weather_get: { ...WEATHER(), offline: true, error: "dns" } }, settings: { showWeather: true } }, ["tile-weather-error"]],
    ["weather data but showWeather off", { extra: { weather_get: WEATHER() }, settings: {} }, []],
    ["meetings on, upcoming exists", { extra: { meetings_list: MEET() }, settings: { showMeetings: true } }, ["tile-meeting"]],
    ["meetings on, none upcoming", { extra: { meetings_list: { ...MEET(), items: [] } }, settings: { showMeetings: true } }, []],
    ["meetings off, upcoming exists", { extra: { meetings_list: MEET() }, settings: {} }, []],
    ["prayer with data", { extra: { today_get: TODAY() }, settings: { showToday: true } }, ["tile-prayer"]],
    ["prayer data but showToday off", { extra: { today_get: TODAY() }, settings: { showToday: false } }, []],
    ["prayer: all prayers passed (no next)", { extra: { today_get: TODAY([-9, -8, -7, -6, -5, -4]) }, settings: { showToday: true } }, []],
  ];
  for (const [label, cfg, want] of cases) {
    const { ctx, page, errs } = await fresh(browser, cfg);
    await open(page);
    const got = await tiles(page);
    ok(`conditional: ${label} ⇒ [${want}]`, JSON.stringify(got) === JSON.stringify(want) && (want.length > 0 || !(await has(page, "home-tiles"))), JSON.stringify(got));
    ok(`conditional: ${label} — no page errors`, errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }

  // 3) الرئيسية خفيفة: لا قائمة صلوات كاملة ولا «وقتي اليوم» ولا أي أثر للتنزيلات؛ وهي في تبويب النظام
  { const { ctx, page } = await fresh(browser, { battery: BAT(), extra: allExtra, settings: { ...ALL, showDownloads: true, downloadsInPill: true } });
    await open(page);
    const home = await page.evaluate(() => document.querySelector(".island-body").innerText);
    ok("home: no full prayer list (Fajr/Dhuhr/Maghrib/Isha absent)", !/Fajr|Dhuhr|Maghrib|Isha|Sunrise/.test(home), home);
    ok("home: no “My time today” and no golden-hour/countdown/world-clock", !/My time today/.test(home) && !(await has(page, "golden-hour")));
    ok("home: zero trace of downloads (text/markup/testids)", !/download|تنزيل/i.test(await page.evaluate(() => document.body.innerHTML + document.body.innerText)));
    await tab(page, "System");
    const sys = await page.evaluate(() => document.querySelector(".island-body").innerText);
    ok("System tab: holds the full prayer list", /Fajr/.test(sys) && /Dhuhr/.test(sys) && /Isha/.test(sys), sys.slice(0, 200));
    ok("System tab: holds “My time today”", /My time today/.test(sys));
    await shot(page, "system-tab");
    await ctx.close(); }

  // 4) تبديل البلاطة والنشاط الحي: البطاقة المعروضة لا تتكرر كبلاطة
  { const { ctx, page } = await fresh(browser, { battery: BAT({ ac: true, charging: true, percent: 55 }), extra: { meetings_list: MEET(NOW + 5 * 60_000) }, settings: { showBattery: true, showMeetings: true } });
    await open(page);
    ok("live card (meeting soon) is not duplicated as a tile; battery tile remains", JSON.stringify(await tiles(page)) === JSON.stringify(["tile-battery"]) || JSON.stringify(await tiles(page)) === JSON.stringify([]), JSON.stringify(await tiles(page)));
    await ctx.close(); }

  // 5) حركة وخمول: المستوى off ⇒ تظهر فورًا؛ والإغلاق ⇒ لا مؤقّتات للبلاطات (الرئيسية غير مركّبة)
  for (const lvl of ["reduced", "off"]) {
    const { ctx, page, errs } = await fresh(browser, { battery: BAT(), extra: allExtra, settings: { ...ALL, motionLevel: lvl } });
    await open(page);
    ok(`motion ${lvl}: tiles shown`, (await tiles(page)).length === 4 && errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }
  { const { ctx, page } = await fresh(browser, { battery: BAT(), extra: allExtra, settings: ALL });
    await open(page); await close(page);
    await page.waitForTimeout(500);
    ok("collapsed: tiles unmounted", !(await has(page, "home-tiles")));
    while ((s => s > 50 || s < 4)(new Date().getSeconds())) await page.waitForTimeout(500);
    await page.evaluate(() => { window.__count = true; window.__timers = 0; window.__raf = 0; });
    await page.waitForTimeout(4000);
    const c = await page.evaluate(() => ({ t: window.__timers, r: window.__raf }));
    ok("collapsed with all tile features on: 0 timers / 0 rAF (zero idle cost)", c.t === 0 && c.r === 0, JSON.stringify(c));
    await ctx.close(); }

  // 6) العيون: الأبعاد المصغّرة + تتبّع بكسل فيزيائي كامل
  { const { ctx, page, errs } = await fresh(browser, { settings: { eyesEnabled: true } });
    await page.waitForTimeout(500);
    const g = await page.evaluate(() => { const eyes = document.querySelector("[data-eyes]"); if (!eyes) return null; const caps = [...eyes.querySelectorAll("span.block")].map((e) => { const r = e.getBoundingClientRect(); return [parseFloat(getComputedStyle(e).width), parseFloat(getComputedStyle(e).height)]; }); const slots = [...eyes.children].map((e) => e.getBoundingClientRect().left); return { caps, centers: slots.length === 2 ? slots[1] - slots[0] : null }; });
    ok("eyes: rendered, capsule ≈ 11.5×21 (k≈1), centres ≈ 19px", !!g && g.caps.length === 2 && Math.abs(g.caps[0][0] - 11.5) < 1.2 && Math.abs(g.caps[0][1] - 21) < 2 && g.centers !== null && Math.abs(g.centers - 19) < 1.5, JSON.stringify(g));
    // يسار/يمين: يرسل الجسر mascot:look فيزيائيًا؛ التحويل ينطلق من (cx−wx)/s
    const look = async (cx, cy, s = 1) => { await page.evaluate(([x, y, k]) => window.__emit("mascot:look", { cx: x, cy: y, wx: 0, wy: 0, s: k, over: false, near: true }), [cx, cy, s]); await page.waitForTimeout(700); };
    const tx = () => page.evaluate(() => { const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector("[data-eyes]")).transform); return [m.m41, m.m42]; });
    await look(2000, 16); const right = await tx();
    await look(-1000, 16); const left = await tx();
    ok("eyes: cursor far right ⇒ +x, far left ⇒ −x", right[0] > 1 && left[0] < -1, JSON.stringify({ right, left }));
    ok("eyes: offsets are whole pixels at DPI 1 (sharp)", Number.isInteger(right[0]) && Number.isInteger(right[1]) && Number.isInteger(left[0]), JSON.stringify({ right, left }));
    await look(300, 16, 2); const hi = await tx();
    ok("eyes: DPI 2 offsets snap to whole physical pixels (half CSS px)", Number.isInteger(hi[0] * 2) && Number.isInteger(hi[1] * 2), JSON.stringify(hi));
    ok("eyes: no page errors", errs.length === 0, JSON.stringify(errs));
    await ctx.close(); }

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
