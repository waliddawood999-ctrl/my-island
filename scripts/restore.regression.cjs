// فحص الوحدات المستعادة L1–L4 + ربط Eco + عمق النظام (Playwright + جسر Tauri وهمي). تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   node scripts/restore.regression.cjs
// SHOTS=dir لحفظ لقطات الشاشة. يغطي: «اليوم» (هجري/صلاة/طقس بمفتاح)، إجراءات الحافظة، تبويب النظام (قياس فقط أثناء الفتح)،
// الاجتماعات (قائمة + انضمام + عدم تسرّب رابط iCal)، وقسم الإعدادات.
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const URL = process.env.URL || "http://localhost:4173/index.html";
const SURL = process.env.SURL || "http://localhost:4173/settings.html";
const SHOTS = process.env.SHOTS || "";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };

const fresh = async (browser, cfg = {}, url = URL) => {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } });
  const page = await ctx.newPage();
  const settings = { language: "en", eyesEnabled: false, ...(cfg.settings || {}) };
  await page.addInitScript(bridge({ ...cfg, settings }));
  const errs = [];
  page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
  await page.goto(url);
  await page.waitForTimeout(700);
  return { ctx, page, errs };
};
const open = async (page) => { await page.mouse.move(380, 10); await page.waitForTimeout(1500); };
const calls = (page, name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n).map((c) => c[1]), name);
const nCalls = (page, name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n).length, name);
const body = (page) => page.evaluate(() => (document.querySelector(".island-body")?.textContent || "").replace(/\s+/g, " "));
const tab = async (page, name) => { await page.click(`[role=tab]:has-text("${name}")`); await page.waitForTimeout(900); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const day = new Date("2026-11-01T00:00:00+03:00").getTime();
const prayers = [["fajr", 4], ["sunrise", 5.5], ["dhuhr", 11.5], ["asr", 14.7], ["maghrib", 17.2], ["isha", 18.7]].map(([id, h]) => ({ id, at: day + h * 3600e3 }));
const TODAY = { city: { id: "riyadh", ar: "الرياض", en: "Riyadh" }, prayers, next_day_at: day + 86400e3 * 3 };
const WEATHER = { enabled: true, offline: false, temp: 31.4, feels: 33, humidity: 20, wind: 9, code: 0, is_day: true, units: "c", city: "riyadh", fetched_at: Date.now() };
const SECRET_URL = "https://calendar.google.com/calendar/ical/secret-token-123/basic.ics";

(async () => {
  const browser = await chromium.launch();

  // ---- L1: «اليوم» ----
  {
    const { ctx, page, errs } = await fresh(browser, { extra: { today_get: TODAY, today_cities: [TODAY.city], weather_get: WEATHER } });
    await open(page);
    const t = await body(page);
    ok("اليوم: قسم الصلاة القادمة + 6 مواقيت", /Next prayer/.test(t) && /Fajr|Dhuhr|Asr|Maghrib|Isha/.test(t), t.slice(0, 160));
    ok("اليوم: today_get استُدعي", (await nCalls(page, "today_get")) >= 1);
    ok("اليوم: بلا طقس ما دام showWeather مطفأ (لا weather_get)", (await nCalls(page, "weather_get")) === 0);
    await shot(page, "today");
    ok("اليوم: لا أخطاء صفحة", errs.length === 0, errs.join("|"));
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(browser, { settings: { showWeather: true }, extra: { today_get: TODAY, today_cities: [TODAY.city], weather_get: WEATHER } });
    await open(page);
    ok("اليوم: weather_get يُستدعى حين يُفعَّل showWeather", (await nCalls(page, "weather_get")) >= 1);
    ok("اليوم: درجة الحرارة معروضة", /31/.test(await body(page)));
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(browser, { settings: { showToday: false }, extra: { today_get: TODAY } });
    await open(page);
    ok("اليوم: showToday=false ⇒ لا today_get ولا قسم", (await nCalls(page, "today_get")) === 0 && !/Next prayer/.test(await body(page)));
    await ctx.close();
  }

  // ---- L2: إجراءات الحافظة ----
  {
    const clips = [
      ["https://example.com/a", "url"], ["+966 50 123 4567", "phone"], ["#ff8800", "hex"], ["2+2*3", "calc"], ["hello world", "text"],
    ].map(([text], n) => ({ id: n + 1, kind: "text", text, thumb: null, width: null, height: null, pinned: false, source: null }));
    const { ctx, page, errs } = await fresh(browser, { extra: { clip_list: clips } });
    await open(page);
    await tab(page, "Clipboard");
    const t = await body(page);
    ok("حافظة: فتح (رابط)", /Open/.test(t));
    ok("حافظة: واتساب (جوال)", /WhatsApp/.test(t));
    ok("حافظة: نسخ RGB (لون)", /Copy RGB/.test(t));
    ok("حافظة: ناتج العملية = 8", /= 8/.test(t));
    ok("حافظة: ترجمة (نص)", /Translate/.test(t));
    await page.click('button:has-text("Copy result")');
    await page.waitForTimeout(300);
    const set = await calls(page, "clip_set_text");
    ok("حافظة: نسخ النتيجة ⇒ clip_set_text('8')", set.length === 1 && set[0].text === "8", JSON.stringify(set));
    await shot(page, "clip-actions");
    ok("حافظة: لا أخطاء صفحة", errs.length === 0, errs.join("|"));
    await ctx.close();
  }

  // ---- L3: تبويب النظام ----
  {
    const { ctx, page, errs } = await fresh(browser, { extra: {
      sysinfo_get: { cpu: 37, mem_used: 8e9, mem_total: 16e9, mem_percent: 50 },
      volume_get: { available: true, volume: 0.4, muted: false }, brightness_get: { available: true, level: 60 },
    } });
    await open(page);
    ok("نظام: لا قياس قبل فتح التبويب", (await nCalls(page, "sysinfo_get")) === 0);
    await tab(page, "System");
    await page.waitForTimeout(2500);
    const n1 = await nCalls(page, "sysinfo_get");
    ok("نظام: sysinfo_get يُستدعى أثناء الفتح (دورة 2s)", n1 >= 2, String(n1));
    const t = await body(page);
    ok("نظام: المعالج 37% والذاكرة 50%", /37%/.test(t) && /50%/.test(t), t.slice(0, 160));
    ok("نظام: volume_get وbrightness_get", (await nCalls(page, "volume_get")) >= 1 && (await nCalls(page, "brightness_get")) >= 1);
    await shot(page, "system");
    await tab(page, "Home");
    const n2 = await nCalls(page, "sysinfo_get");
    await page.waitForTimeout(5000);
    ok("نظام: يتوقف القياس بمغادرة التبويب", (await nCalls(page, "sysinfo_get")) === n2, `${n2} → ${await nCalls(page, "sysinfo_get")}`);
    ok("نظام: لا أخطاء صفحة", errs.length === 0, errs.join("|"));
    await ctx.close();
  }

  // ---- L4: الاجتماعات (الإعداد مفتوح) ----
  {
    const soon = Date.now() + 3 * 60e3;
    const snap = { configured: true, enabled: true, error: null, fetched_at: Date.now(), items: [
      { id: "m1", title: "Design sync", start: soon, end: soon + 3600e3, location: "", join: { provider: "meet", url: "https://meet.google.com/abc-defg-hij" }, recurring: false },
      { id: "m2", title: "Planning", start: soon + 86400e3, end: soon + 86400e3 + 1800e3, location: "Room 2", join: null, recurring: true },
    ] };
    const { ctx, page, errs } = await fresh(browser, { settings: { showMeetings: true }, extra: { meetings_list: snap, meetings_key_status: { set: true } } });
    await open(page);
    await tab(page, "Meetings");
    const t = await body(page);
    ok("اجتماعات: عنوانان ظاهران", /Design sync/.test(t) && /Planning/.test(t), t.slice(0, 200));
    const joinBtn = page.locator('button[aria-label="Join Meet"]');
    ok("اجتماعات: زر انضمام Meet", (await joinBtn.count()) >= 1);
    await joinBtn.click();
    await page.waitForTimeout(300);
    const j = await calls(page, "meetings_join");
    ok("اجتماعات: meetings_join بالرابط", j.length === 1 && j[0].url.startsWith("https://meet.google.com/"), JSON.stringify(j));
    await shot(page, "meetings");
    ok("اجتماعات: لا أخطاء صفحة", errs.length === 0, errs.join("|"));
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(browser, { settings: { showMeetings: false }, extra: { meetings_list: { configured: true, enabled: true, error: null, fetched_at: 1, items: [] } } });
    await open(page);
    ok("اجتماعات: showMeetings=false ⇒ لا تبويب ولا meetings_list", (await nCalls(page, "meetings_list")) === 0 && (await page.locator('[role=tab]:has-text("Meetings")').count()) === 0);
    await ctx.close();
  }

  // ---- هـ: اجتماع قريب في الكبسولة والبطاقة (liveActivity) ----
  {
    const mk = (id, startMin, join) => ({ id, title: id, start: Date.now() + startMin * 60e3, end: Date.now() + (startMin + 30) * 60e3, location: "", join: join || null, recurring: false });
    const snap = (items) => ({ configured: true, enabled: true, error: null, fetched_at: Date.now(), items });
    const JOIN = { provider: "zoom", url: "https://zoom.us/j/123456789" };
    const { ctx, page, errs } = await fresh(browser, { settings: { showMeetings: true }, extra: { meetings_list: snap([mk("Standup", 10, JOIN), mk("Later", 120)]) } });
    await page.waitForTimeout(500);
    ok("اجتماع قريب: كبسولة بلون النوع (قبل فتح اللوحة)", (await page.locator('[data-testid="capsule-meeting"]').count()) === 1);
    const cap = await page.evaluate(() => { const e = document.querySelector('[data-testid="capsule-meeting"]'); return e ? { t: e.textContent.replace(/\s+/g, " "), c: getComputedStyle(e.querySelector(".act-badge")).color || "", v: getComputedStyle(document.documentElement).getPropertyValue("--act-meeting").trim() } : null; });
    ok("اجتماع قريب: الكبسولة تعرض العنوان والدقائق", !!cap && /Standup/.test(cap.t) && /10 min/.test(cap.t), JSON.stringify(cap));
    ok("اجتماع قريب: لون النوع --act-meeting معرّف", !!cap && /^#[0-9a-f]{6}$/i.test(cap.v), JSON.stringify(cap));
    await shot(page, "meeting-capsule");
    await open(page);
    ok("اجتماع قريب: بطاقة النشاط في الرئيسية", (await page.locator('[data-testid="activity-meeting"]').count()) === 1);
    ok("اجتماع قريب: لا يظهر اجتماع بعيد (Later)", !/Later/.test(await body(page)));
    await page.click('[data-testid="activity-meeting"] button:has-text("Join")');
    await page.waitForTimeout(300);
    const j = await calls(page, "meetings_join");
    ok("اجتماع قريب: زر الانضمام ⇒ meetings_join", j.length === 1 && j[0].url === JOIN.url, JSON.stringify(j));
    await shot(page, "meeting-card");
    ok("اجتماع قريب: لا أخطاء صفحة", errs.length === 0, errs.join("|"));
    await ctx.close();
  }
  {
    const mk = (id, startMin) => ({ id, title: id, start: Date.now() + startMin * 60e3, end: Date.now() + (startMin + 30) * 60e3, location: "", join: null, recurring: false });
    const snap = (items) => ({ configured: true, enabled: true, error: null, fetched_at: Date.now(), items });
    const { ctx, page } = await fresh(browser, { settings: { showMeetings: true, meetingLeadMin: 5 }, extra: { meetings_list: snap([mk("Standup", 10)]) } });
    await page.waitForTimeout(500);
    ok("اجتماع قريب: النافذة 5 د ⇒ اجتماع بعد 10 د لا يظهر", (await page.locator('[data-testid="capsule-meeting"]').count()) === 0);
    await ctx.close();
    const b = await fresh(browser, { settings: { showMeetings: false }, extra: { meetings_list: snap([mk("Standup", 3)]) } });
    await b.page.waitForTimeout(500);
    ok("اجتماع قريب: showMeetings=false ⇒ لا كبسولة ولا meetings_list", (await b.page.locator('[data-testid="capsule-meeting"]').count()) === 0 && (await nCalls(b.page, "meetings_list")) === 0);
    await b.ctx.close();
    const c = await fresh(browser, { settings: { showMeetings: true }, extra: { meetings_list: snap([]) } });
    await c.page.evaluate(() => { window.__count = true; window.__timers = 0; });
    await c.page.waitForTimeout(3000);
    ok("اجتماع قريب: لا اجتماعات قادمة ⇒ لا مؤقّتات جديدة (صفر كلفة خمول)", (await c.page.evaluate(() => window.__timers)) === 0);
    await c.ctx.close();
  }

  // ---- Eco: يوقف الطقس (L1) وقياس النظام (L3) فعليًا ثم تعود الدورات عند الإطفاء ----
  {
    const extra = { today_get: TODAY, today_cities: [TODAY.city], weather_get: WEATHER,
      sysinfo_get: { cpu: 37, mem_used: 8e9, mem_total: 16e9, mem_percent: 50 }, volume_get: { available: true, volume: 0.4, muted: false }, brightness_get: { available: true, level: 60 } };
    const { ctx, page, errs } = await fresh(browser, { eco: true, settings: { showWeather: true }, extra });
    await open(page);
    await page.waitForTimeout(500);
    ok("Eco: الطقس مفعّل في الإعدادات لكن لا weather_get إطلاقًا", (await nCalls(page, "weather_get")) === 0);
    ok("Eco: «اليوم» المحلي يعمل بلا شبكة (مواقيت الصلاة تُحسب)", (await nCalls(page, "today_get")) >= 1 && /Next prayer/.test(await body(page)));
    await tab(page, "System");
    await page.waitForTimeout(4500);
    ok("Eco: لا sysinfo_get أثناء فتح تبويب النظام", (await nCalls(page, "sysinfo_get")) === 0);
    ok("Eco: التبويب يعلن التوقف", /Paused/.test(await body(page)), (await body(page)).slice(0, 120));
    await page.evaluate(() => window.__emit("perf:eco", { eco: false, reason: null, onBattery: null }));
    await page.waitForTimeout(3500);
    ok("Eco مطفأ: تعود دورة sysinfo_get (≥2 في 3.5s)", (await nCalls(page, "sysinfo_get")) >= 2, String(await nCalls(page, "sysinfo_get")));
    await tab(page, "Home");
    await page.waitForTimeout(600);
    ok("Eco مطفأ: يعود الطقس (weather_get)", (await nCalls(page, "weather_get")) >= 1);
    // ثم تشغيله ثانية: يتوقف التكرار الدوري فورًا
    await page.evaluate(() => window.__emit("perf:eco", { eco: true, reason: "manual", onBattery: null }));
    await page.waitForTimeout(300);
    const w1 = await nCalls(page, "weather_get");
    await tab(page, "System");
    const s1 = await nCalls(page, "sysinfo_get");
    await page.waitForTimeout(4500);
    ok("Eco ثانية: لا استدعاءات جديدة للنظام ولا للطقس", (await nCalls(page, "sysinfo_get")) === s1 && (await nCalls(page, "weather_get")) === w1, `${s1}→${await nCalls(page, "sysinfo_get")} / ${w1}→${await nCalls(page, "weather_get")}`);
    ok("Eco: لا أخطاء صفحة", errs.length === 0, errs.join("|"));
    await ctx.close();
  }

  // ---- الإعدادات: قسم الاجتماعات والنظام واليوم؛ الرابط لا يتسرب ----
  {
    const { ctx, page, errs } = await fresh(browser, { extra: { meetings_key_status: { set: false }, meetings_key_set: { set: true }, today_cities: [TODAY.city] } }, SURL);
    await page.waitForTimeout(500);
    await page.click('text=Modules').catch(() => {});
    await page.waitForTimeout(600);
    const txt = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
    ok("إعدادات: أقسام اليوم والنظام والاجتماعات موجودة", /Today & prayer/.test(txt) && /System & privacy/.test(txt) && /Meetings/.test(txt), txt.slice(0, 200));
    const input = page.locator('input[aria-label="Private iCal link"]');
    ok("إعدادات: حقل رابط iCal من نوع password", (await input.count()) === 1 && (await input.getAttribute("type")) === "password");
    await input.fill(SECRET_URL);
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(500);
    const ks = await calls(page, "meetings_key_set");
    ok("إعدادات: الرابط يمرّ عبر meetings_key_set فقط", ks.length === 1 && ks[0].url === SECRET_URL);
    const all = await page.evaluate(() => JSON.stringify(window.__calls.filter((c) => c[0] !== "meetings_key_set")));
    ok("إعدادات: الرابط لا يظهر في أي استدعاء آخر (settings_set وغيره)", !all.includes("secret-token-123"));
    const cleared = await input.inputValue();
    ok("إعدادات: يُفرَّغ الحقل بعد الحفظ ولا يُعرض الرابط", cleared === "" && !(await page.evaluate(() => document.body.innerHTML)).includes("secret-token-123"));
    await shot(page, "settings-meetings");
    ok("إعدادات: لا أخطاء صفحة", errs.length === 0, errs.join("|"));
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
