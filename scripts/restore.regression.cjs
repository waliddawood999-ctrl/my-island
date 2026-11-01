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

  // ---- أ/ب: الساعة الذهبية + عدّادات الأحداث + الساعة العالمية (كلها محلية) ----
  {
    const t0 = Date.now(), M = 60e3;
    const civil = (off) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t0 + off * 86400e3));
    const pr = (riseMin, setMin) => [["fajr", -300], ["sunrise", riseMin], ["dhuhr", 400], ["asr", 600], ["maghrib", setMin], ["isha", setMin + 90], ["fajr", 1500]].map(([id, m]) => ({ id, at: t0 + m * M }));
    const run = async (label, prayersList, settings, check) => {
      const { ctx, page, errs } = await fresh(browser, { settings, extra: { today_get: { ...TODAY, prayers: prayersList, next_day_at: t0 + 3 * 86400e3 }, today_cities: [TODAY.city] } });
      await open(page);
      await check(page);
      ok(`${label}: لا أخطاء صفحة`, errs.length === 0, errs.join("|"));
      await ctx.close();
    };
    await run("ذهبية", pr(20, 600), {}, async (page) => {
      const t = await page.locator('[data-testid="golden-hour"]').textContent().catch(() => "");
      ok("ذهبية: صباحية قادمة قبل الشروق بـ20 د", /Morning golden hour/.test(t), t);
      await shot(page, "golden");
    });
    await run("ذهبية", pr(-10, 600), {}, async (page) => {
      ok("ذهبية: «الآن» بعد الشروق بـ10 د", /Golden hour now/.test(await page.locator('[data-testid="golden-hour"]').textContent().catch(() => "")));
    });
    await run("ذهبية", pr(-300, 5), {}, async (page) => {
      ok("ذهبية: المغرب بعد 5 د ⇒ المسائية الآن", /Golden hour now/.test(await page.locator('[data-testid="golden-hour"]').textContent().catch(() => "")));
    });
    await run("ذهبية", pr(-600, -30), {}, async (page) => {
      ok("ذهبية: النافذتان انتهتا ⇒ لا سطر", (await page.locator('[data-testid="golden-hour"]').count()) === 0);
    });
    const cds = [
      { id: "a", name: "Eid", date: civil(3) }, { id: "b", name: "Exam", date: civil(1) }, { id: "c", name: "Far", date: civil(40) }, { id: "p", name: "Past", date: civil(-4) },
    ];
    await run("عدّادات", pr(20, 600), { countdowns: cds }, async (page) => {
      const t = await page.locator('[data-testid="countdowns"]').textContent().catch(() => "");
      ok("عدّادات: أقرب حدثين فقط بالترتيب (Exam غدًا ثم Eid 3 أيام)", /Exam.*Tomorrow.*Eid.*3 days/.test(t) && !/Far|Past/.test(t), t);
      await shot(page, "countdowns");
    });
    await run("عدّادات", pr(20, 600), { countdowns: cds, showCountdowns: false }, async (page) => {
      ok("عدّادات: مفتاح العرض مطفأ ⇒ لا قائمة", (await page.locator('[data-testid="countdowns"]').count()) === 0);
    });
    await run("عدّادات", pr(20, 600), { countdowns: "garbage" }, async (page) => {
      ok("عدّادات: قيمة تالفة ⇒ تُتجاهل بلا خطأ", (await page.locator('[data-testid="countdowns"]').count()) === 0);
    });
    await run("ساعة عالمية", pr(20, 600), { showWorldClock: true, worldClocks: ["Europe/London", "Asia/Tokyo", "Asia/Dubai"] }, async (page) => {
      const t = await page.locator('[data-testid="world-clock"]').textContent().catch(() => "");
      ok("ساعة عالمية: مدينتان فقط (London, Tokyo)", /London/.test(t) && /Tokyo/.test(t) && !/Dubai/.test(t), t);
      const fmtL = (at) => new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(at)).replace(/\s/g, "");
      const flat = t.replace(/\s/g, "");
      ok("ساعة عالمية: وقت لندن صحيح (تسامح دقيقة عند الحدّ)", [t0, t0 + 60e3, t0 + 120e3].some((a) => flat.includes(fmtL(a))), `${t}`);
      await shot(page, "world-clock");
    });
    await run("ساعة عالمية", pr(20, 600), { showWorldClock: false, worldClocks: ["Europe/London"] }, async (page) => {
      ok("ساعة عالمية: مفتاح العرض مطفأ ⇒ لا عنصر", (await page.locator('[data-testid="world-clock"]').count()) === 0);
    });
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
      sysdepth_get: { gpu: 41.6, temps: { cpu: 55.2, gpu: null, ssd: 38 }, power_w: 12.34, top: { name: "chrome", cpu: 23.4 } },
    } });
    await open(page);
    ok("نظام: لا قياس قبل فتح التبويب (لا sysinfo_get ولا sysdepth_get)", (await nCalls(page, "sysinfo_get")) === 0 && (await nCalls(page, "sysdepth_get")) === 0);
    await tab(page, "System");
    await page.waitForTimeout(2500);
    const n1 = await nCalls(page, "sysinfo_get");
    ok("نظام: sysinfo_get يُستدعى أثناء الفتح (دورة 2s)", n1 >= 2, String(n1));
    const t = await body(page);
    ok("نظام: المعالج 37% والذاكرة 50%", /37%/.test(t) && /50%/.test(t), t.slice(0, 160));
    const st = (id) => page.locator(`[data-testid="stat-${id}"]`).textContent();
    ok("نظام: GPU 42% · حرارة 55°C · SSD 38°C · قدرة 12.3 W", /42%/.test(await st("gpu")) && /55°C/.test(await st("cpu-temp")) && /38°C/.test(await st("ssd-temp")) && /12\.3 W/.test(await st("power")), `${await st("gpu")} ${await st("cpu-temp")} ${await st("power")}`);
    ok("نظام: حرارة GPU «—» صراحةً (ويندوز لا يتيحها) لا قيمة وهمية", (await st("gpu-temp")).replace(/\s/g, "").endsWith("—"), await st("gpu-temp"));
    ok("نظام: أعلى تطبيق chrome · 23%", /chrome.*23%/.test(await st("top-app")), await st("top-app"));
    await page.waitForTimeout(4500);
    ok("نظام: منحنيان مصغّران (CPU وRAM) بنقاط بعد عدّة عيّنات", (await page.locator('[data-testid="activity-none"], svg[data-testid="spark"]').count()) === 2);
    const pts = await page.locator('svg[data-testid="spark"] polyline').first().getAttribute("points");
    ok("نظام: منحنى CPU فيه ≥2 نقطة", !!pts && pts.trim().split(" ").length >= 2, String(pts));
    const fits = await page.evaluate(() => { const b = document.querySelector(".island-body"); const sec = document.querySelector('[data-testid="sys-depth"]'); if (!b || !sec) return null; const r = sec.getBoundingClientRect(), br = b.getBoundingClientRect(); return { bottom: Math.round(r.bottom), bodyBottom: Math.round(br.bottom) }; });
    ok("نظام: شبكة العمق ضمن اللوحة 720×320 (بلا قصّ سفلي)", !!fits && fits.bottom <= fits.bodyBottom, JSON.stringify(fits));
    ok("نظام: volume_get وbrightness_get", (await nCalls(page, "volume_get")) >= 1 && (await nCalls(page, "brightness_get")) >= 1);
    await shot(page, "system");
    await tab(page, "Home");
    const n2 = await nCalls(page, "sysinfo_get"), d2 = await nCalls(page, "sysdepth_get");
    await page.waitForTimeout(7000);
    ok("نظام: يتوقف القياس والمنحنيان بمغادرة التبويب (sysinfo_get وsysdepth_get)", (await nCalls(page, "sysinfo_get")) === n2 && (await nCalls(page, "sysdepth_get")) === d2, `${n2} → ${await nCalls(page, "sysinfo_get")} / ${d2} → ${await nCalls(page, "sysdepth_get")}`);
    ok("نظام: لا svg منحنى خارج التبويب (يُفكَّك بإغلاقه)", (await page.locator('svg[data-testid="spark"]').count()) === 0);
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
      sysdepth_get: { gpu: 10, temps: { cpu: 50, gpu: null, ssd: 30 }, power_w: null, top: null },
      sysinfo_get: { cpu: 37, mem_used: 8e9, mem_total: 16e9, mem_percent: 50 }, volume_get: { available: true, volume: 0.4, muted: false }, brightness_get: { available: true, level: 60 } };
    const { ctx, page, errs } = await fresh(browser, { eco: true, settings: { showWeather: true }, extra });
    await open(page);
    await page.waitForTimeout(500);
    ok("Eco: الطقس مفعّل في الإعدادات لكن لا weather_get إطلاقًا", (await nCalls(page, "weather_get")) === 0);
    ok("Eco: «اليوم» المحلي يعمل بلا شبكة (مواقيت الصلاة تُحسب)", (await nCalls(page, "today_get")) >= 1 && /Next prayer/.test(await body(page)));
    await tab(page, "System");
    await page.waitForTimeout(4500);
    ok("Eco: لا sysinfo_get ولا sysdepth_get أثناء فتح تبويب النظام", (await nCalls(page, "sysinfo_get")) === 0 && (await nCalls(page, "sysdepth_get")) === 0);
    ok("Eco: التبويب يعلن التوقف", /Paused/.test(await body(page)), (await body(page)).slice(0, 120));
    await page.evaluate(() => window.__emit("perf:eco", { eco: false, reason: null, onBattery: null }));
    await page.waitForTimeout(3500);
    ok("Eco مطفأ: تعود دورة sysinfo_get (≥2 في 3.5s) وsysdepth_get", (await nCalls(page, "sysinfo_get")) >= 2 && (await nCalls(page, "sysdepth_get")) >= 1, `${await nCalls(page, "sysinfo_get")}/${await nCalls(page, "sysdepth_get")}`);
    await tab(page, "Home");
    await page.waitForTimeout(600);
    ok("Eco مطفأ: يعود الطقس (weather_get)", (await nCalls(page, "weather_get")) >= 1);
    // ثم تشغيله ثانية: يتوقف التكرار الدوري فورًا
    await page.evaluate(() => window.__emit("perf:eco", { eco: true, reason: "manual", onBattery: null }));
    await page.waitForTimeout(300);
    const w1 = await nCalls(page, "weather_get");
    await tab(page, "System");
    const s1 = await nCalls(page, "sysinfo_get"), sd1 = await nCalls(page, "sysdepth_get");
    await page.waitForTimeout(4500);
    ok("Eco ثانية: لا استدعاءات جديدة للنظام ولا للطقس", (await nCalls(page, "sysinfo_get")) === s1 && (await nCalls(page, "sysdepth_get")) === sd1 && (await nCalls(page, "weather_get")) === w1, `${s1}→${await nCalls(page, "sysinfo_get")} / ${w1}→${await nCalls(page, "weather_get")}`);
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
