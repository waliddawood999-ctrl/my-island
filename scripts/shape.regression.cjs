// تراجع «شكل الجزيرة ثابت»: الحبة المنكمشة بنفس العرض/الارتفاع/الاستدارة في كل الحالات (خمول، تنبيه، مؤقّت، بطارية، ميديا، تسجيل، شبكة)،
// ولا يُطلب من النافذة (report_island_rect) أي مقاس آخر. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/shape.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const URL = process.env.URL || "http://localhost:4173/index.html";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const media = { session: true, source: "x", source_name: "Spotify", title: "A very long song title that must stay inside the pill", artist: "Nova", album: "A", duration: 200, position: 30, playing: true, can_prev: true, can_next: true, can_seek: true };
const now = Date.now();
const STATES = {
  idle: {},
  notification: { emit: ["island:note", { kind: "reminder", id: "r1", at: now, late: false, text: "اجتماع الفريق بعد قليل — لا تنسَ الملفات المطلوبة" }] },
  "timer": { timer: { endsAt: now + 45_000, totalMs: 120_000, label: "tea" } },
  battery: { battery: { has_battery: true, percent: 12, ac: false, charging: false, remaining_min: 20, bt: [] }, settings: { showBattery: true } },
  media: { media },
  recording: { rec: { recording: true, startedAt: now - 5000, format: "mp4" } },
  activity: { timer: { endsAt: now + 45_000, totalMs: 120_000, label: "tea" }, media, battery: { has_battery: true, percent: 12, ac: false, charging: false, remaining_min: 20, bt: [] }, settings: { showBattery: true } },
};
const measure = (page) => page.evaluate(() => { const b = document.querySelector(".island-body"); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { w: Math.round(r.width), h: Math.round(r.height), r: parseFloat(cs.borderTopLeftRadius) }; });

(async () => {
  const browser = await chromium.launch();
  for (const [pw, ph, pr] of [[220, 34, 0], [250, 40, 12]]) {
    const sizes = {};
    for (const [name, st] of Object.entries(STATES)) {
      const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } });
      const page = await ctx.newPage();
      const { emit, settings, ...rest } = st;
      await page.addInitScript(bridge({ ...rest, settings: { language: "en", eyesEnabled: false, pillWidth: pw, pillHeight: ph, pillRadius: pr, settingsVersion: 2, ...(settings || {}) } }));
      const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
      await page.goto(URL); await page.waitForTimeout(900);
      if (emit) { await page.evaluate(([e, x]) => window.__emit(e, x), emit); await page.waitForTimeout(900); }
      sizes[name] = await measure(page);
      const reported = await page.evaluate(() => window.__calls.filter((c) => c[0] === "report_island_rect").map((c) => `${c[1].width}x${c[1].height}`));
      ok(`[${pw}x${ph}] ${name}: window only ever sized to the pill`, reported.every((x) => x === `${pw}x${ph}`), reported.join(","));
      ok(`[${pw}x${ph}] ${name}: no page errors`, errs.length === 0, errs.join("|"));
      await ctx.close();
    }
    const want = { w: pw, h: ph, r: pr === 0 ? ph / 2 : pr };
    for (const [name, m] of Object.entries(sizes)) ok(`[${pw}x${ph}] ${name}: pill = ${want.w}×${want.h}, radius ${want.r}`, m.w === want.w && m.h === want.h && Math.abs(m.r - want.r) < 0.6, JSON.stringify(m));
    ok(`[${pw}x${ph}] all ${Object.keys(sizes).length} states identical`, new Set(Object.values(sizes).map((m) => `${m.w}x${m.h}/${m.r}`)).size === 1);
  }
  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
