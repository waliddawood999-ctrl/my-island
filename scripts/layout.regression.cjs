// «لا تداخل في أي مكان»: تدقيق هندسي لكل العروض (الحبة بحالاتها، اللمحة بكل بطاقاتها، اللوحة بكل تبويباتها وتخطيطات المشغّل، ونافذة الإعدادات
// بكل أقسامها) بعناوين طويلة، RTL، ومقاسات مختلفة. القاعدة لكل عنصر نصي مرئي: (1) لا يتدفّق خارج صندوقه إلا بقطع بنقاط (ellipsis/clip)،
// (2) لا يتقاطع صندوقه المرئي مع صندوق عنصر نصي آخر ليس سلفه/سليله، (3) لا يخرج عن حدود الجزيرة/النافذة. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/layout.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };

const AUDIT = (rootSel) => {
  const root = document.querySelector(rootSel); if (!root) return { err: "no root " + rootSel };
  const rr = root.getBoundingClientRect();
  const eff = (e) => { let o = 1; for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return 0; o *= +cs.opacity; if (n.hidden) return 0; } return o; };
  const clipRect = (e, r) => { // يقتطع المستطيل بأسلاف overflow≠visible
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (let n = e.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") { const b = n.getBoundingClientRect(); x1 = Math.max(x1, b.left); y1 = Math.max(y1, b.top); x2 = Math.min(x2, b.right); y2 = Math.min(y2, b.bottom); }
      if (n === root) break;
    }
    return x2 > x1 && y2 > y1 ? { left: x1, top: y1, right: x2, bottom: y2 } : null;
  };
  const leaves = [...root.querySelectorAll("*")].filter((e) => {
    if (e.closest("[aria-hidden='true']") || e.closest("svg") || e.closest(".fake-acrylic")) return false;
    const control = e.matches("button,[role=switch],[role=tab],input,select,textarea,img,canvas");
    if (!control && !([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) return false;
    if (eff(e) < 0.05) return false;
    const r = e.getBoundingClientRect(); return r.width >= 1 && r.height >= 1;
  });
  const issues = [];
  const desc = (e) => `${e.tagName.toLowerCase()}${e.dataset.testid ? "#" + e.dataset.testid : ""}[${(e.textContent || "").trim().slice(0, 24)}]`;
  // (1) تدفّق نص خارج صندوقه بلا قطع
  for (const e of leaves.filter((x) => !x.matches("input,select,textarea,img,canvas,button"))) {
    const cs = getComputedStyle(e);
    const clips = cs.overflowX !== "visible";
    if (e.scrollWidth > e.clientWidth + 1 && !clips && e.clientWidth > 0 && cs.display !== "inline") issues.push({ k: "spill", el: desc(e), sw: e.scrollWidth, cw: e.clientWidth });
    if (clips && e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== "ellipsis" && cs.textOverflow !== "clip" && !/auto|scroll/.test(cs.overflowX) && !e.closest(".island-marquee,[data-pill-title]")) issues.push({ k: "hard-clip", el: desc(e), sw: e.scrollWidth, cw: e.clientWidth });
  }
  // (3) خارج حدود الجذر
  for (const e of leaves) {
    const r = e.getBoundingClientRect(); const c = clipRect(e, r); if (!c) continue;
    if (c.left < rr.left - 1 || c.right > rr.right + 1 || c.top < rr.top - 1 || c.bottom > rr.bottom + 1) issues.push({ k: "outside", el: desc(e) });
  }
  // (2) تقاطع نصوص
  const boxes = leaves.map((e) => ({ e, c: clipRect(e, e.getBoundingClientRect()) })).filter((b) => b.c);
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const A = boxes[a], B = boxes[b];
    if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    const w = Math.min(A.c.right, B.c.right) - Math.max(A.c.left, B.c.left), h = Math.min(A.c.bottom, B.c.bottom) - Math.max(A.c.top, B.c.top);
    if (w > 2 && h > 2) issues.push({ k: "overlap", a: desc(A.e), b: desc(B.e), w: Math.round(w), h: Math.round(h) });
  }
  return { n: leaves.length, issues };
};
const audit = async (page, sel, label) => {
  const r = await page.evaluate(AUDIT, sel);
  ok(`layout: ${label} (${r.n ?? 0} text nodes)`, !r.err && r.issues.length === 0, r.err || JSON.stringify(r.issues.slice(0, 4)));
};

const LONG = { session: true, source: "Spotify.exe", source_name: "Spotify", title: "An extremely long song title that keeps going and going beyond any sensible width of the island", artist: "Artist With A Very Long Name Featuring Several Other Famous Artists", album: "The Album With An Equally Long Name That Must Truncate", duration: 215, position: 62, playing: true, can_prev: true, can_next: true, can_seek: true };
const now = Date.now();
const today = { city: { id: "madinah", ar: "المدينة المنورة", en: "Madinah" }, prayers: [["fajr", -10], ["sunrise", -8], ["dhuhr", 1], ["asr", 4], ["maghrib", 7], ["isha", 8]].map(([id, h]) => ({ id, at: now + h * 3600e3 })), next_day_at: now + 20 * 3600e3 };
const W = { enabled: true, offline: false, temp: 31.2, feels: 33, humidity: 20, wind: 9, code: 1, is_day: true, units: "c", city: "madinah", fetched_at: now, error: "" };
const mk = async (browser, url, cfg, vp) => {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.addInitScript(bridge(cfg));
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
  await page.goto(`${BASE}/${url}`); await page.waitForTimeout(900);
  return { ctx, page, errs };
};
const hoverClick = async (page) => { await page.mouse.move(400, 10); await page.waitForTimeout(700); await page.mouse.click(400, 10); await page.waitForTimeout(1500); };

(async () => {
  const browser = await chromium.launch();
  const VP = { width: 800, height: 500 };
  const base = { language: "en", settingsVersion: 3, showWeather: true, showBattery: true, panelTabsStyle: "labels" };
  const extra = { today_get: today, weather_get: W, timer_get: { endsAt: now + 90_000, totalMs: 120_000, label: "A timer with a rather long label that needs to be truncated" } };

  for (const [lang, extraS] of [["en", {}], ["ar", { language: "ar" }]]) {
    // الحبة: كل الحالات بمقاسين
    for (const [pw, ph] of [[160, 28], [280, 44]]) {
      for (const [name, st] of Object.entries({ idle: {}, media: { media: LONG }, timer: { timer: { endsAt: now + 45_000, totalMs: 120_000, label: "tea with a very long label" } }, battery: { battery: { has_battery: true, percent: 12, ac: false, charging: false, remaining_min: 20, bt: [] } } })) {
        const { ctx, page, errs } = await mk(browser, "index.html", { settings: { ...base, ...extraS, pillWidth: pw, pillHeight: ph, eyesEnabled: true }, extra, ...st }, VP);
        if (name === "idle") { await page.evaluate(() => window.__emit("island:note", { kind: "reminder", id: "r", at: Date.now(), late: false, text: "اجتماع الفريق الطويل جدًا بعد قليل — لا تنسَ إحضار كل الملفات المطلوبة للعرض" })); await page.waitForTimeout(900); }
        await audit(page, ".island-body", `[${lang}] pill ${pw}×${ph} ${name}${name === "idle" ? " + long alert" : ""}`);
        ok(`[${lang}] pill ${pw}×${ph} ${name}: no page errors`, errs.length === 0, errs.join("|"));
        await ctx.close();
      }
    }
    // اللمحة: 4 بطاقات × عرضان
    for (const pkw of [240, 560]) {
      const { ctx, page } = await mk(browser, "index.html", { settings: { ...base, ...extraS, peekWidth: pkw, eyesEnabled: false }, extra, media: LONG }, VP);
      await page.mouse.move(400, 10); await page.waitForTimeout(1300);
      for (const c of ["player", "today", "weather", "timer"]) {
        await audit(page, ".island-body", `[${lang}] peek ${pkw}px card=${c}`);
        await page.mouse.wheel(0, 100); await page.waitForTimeout(800);
      }
      await ctx.close();
    }
    // اللوحة: كل التبويبات × مقاسات × تخطيطات المشغّل
    for (const [pw, phh, layout] of [[420, 220, "large"], [520, 290, "compact"], [720, 420, "minimal"]]) {
      const { ctx, page } = await mk(browser, "index.html", { settings: { ...base, ...extraS, panelWidth: pw, panelHeight: phh, playerLayout: layout, eyesEnabled: false, showMeetings: false }, extra, media: LONG }, VP);
      await hoverClick(page);
      const tabs = await page.getByRole("tab").allTextContents();
      for (let n = 0; n < tabs.length; n++) {
        await page.getByRole("tab").nth(n).click(); await page.waitForTimeout(900);
        await audit(page, ".island-body", `[${lang}] panel ${pw}×${phh} ${layout} tab=${tabs[n]}`);
      }
      await ctx.close();
    }
    // أنماط التبويبات
    for (const style of ["icons", "dots"]) {
      const { ctx, page } = await mk(browser, "index.html", { settings: { ...base, ...extraS, panelTabsStyle: style, eyesEnabled: false }, extra, media: LONG }, VP);
      await hoverClick(page);
      await audit(page, ".island-body", `[${lang}] panel tabs style=${style}`);
      await ctx.close();
    }
  }

  // الإعدادات: كل الأقسام × لغتان × مقاسان
  for (const lang of ["en", "ar"]) for (const vp of [{ width: 880, height: 620 }, { width: 700, height: 500 }]) {
    const { ctx, page } = await mk(browser, "settings.html", { settings: { language: lang }, extra: { today_cities: [{ id: "riyadh", ar: "الرياض", en: "Riyadh" }, { id: "madinah", ar: "المدينة المنورة", en: "Madinah" }] } }, vp);
    for (const g of ["general", "island", "appearance", "motion", "modules", "notifications", "shortcuts", "perf", "updates", "about"]) {
      await page.locator(`[data-nav="${g}"]`).click(); await page.waitForTimeout(450);
      await audit(page, ".st-root", `[${lang}] settings ${vp.width}×${vp.height} section=${g}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
