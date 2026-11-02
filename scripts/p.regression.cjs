// تراجع المرحلة P: بحث الوسائط (نقر/سحب/تعطيل) + الإطلالة التفاعلية (تبويبات حقيقية بلا فتح اللوحة، بلا سرقة فوكس) + المصغّرة (نسبة/حجم موحّد/عنصر نائب) + خمول صفر rAF.
// متصفح Chromium بجسر Tauri وهمي — لا GSMTC ولا نافذة ويندوز حقيقية (التحقق الفعلي على جهاز المالك: docs/STATUS.md).
//   npm run build && npx vite preview --port 4173 &   ثم:   node scripts/p.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEDIA = { session: true, source: "Spotify.exe", source_name: "Spotify", title: "Song", artist: "Artist", album: "Album", duration: 240, position: 30, playing: true, can_prev: true, can_next: true, can_seek: true, kind: "gsmtc", degraded: false };
const mkCover = async (browser, w, h) => { const p = await browser.newPage(); const u = await p.evaluate(([w, h]) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#e5484d"); g.addColorStop(1, "#3e63dd"); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.fillRect(w / 2 - 20, h / 2 - 20, 40, 40); return c.toDataURL("image/png"); }, [w, h]); await p.close(); return u; };
const open = async (browser, { media = MEDIA, cover = null, settings = {}, scale = 1 } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: scale });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, pillRadius: 0, ...settings }, media, extra: { media_now: { info: media, cover } } }));
  await page.goto(`${BASE}/index.html`); await sleep(900);
  return { ctx, page, errs };
};
const mode = (page) => page.evaluate(() => document.querySelector(".island-body").dataset.mode);
const calls = (page, name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n).map((c) => c[1]), name);
const toPeek = async (page) => { await page.hover(".island-body"); await sleep(900); };
const bar = (page) => page.evaluate(() => { const r = document.querySelector("[data-testid=seekbar] .sk").getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });

(async () => {
  const browser = await chromium.launch();
  const vid = await mkCover(browser, 1280, 720), sq = await mkCover(browser, 600, 600);

  // ── 1) بحث بالنقر: يلتقط الموضع الصحيح ولا يفتح اللوحة
  let s = await open(browser); await toPeek(s.page);
  ok("hover ⇒ peek", (await mode(s.page)) === "peek");
  let b = await bar(s.page);
  await s.page.mouse.click(b.x + b.w * 0.5, b.y); await sleep(200);
  let seeks = await calls(s.page, "media_seek");
  ok("click at 50% ⇒ media_seek(120s)", seeks.length === 1 && Math.abs(seeks[0].seconds - 120) <= 1.5, JSON.stringify(seeks));
  ok("seek click does NOT expand the panel", (await mode(s.page)) === "peek");
  ok("time labels show current and total", (await s.page.textContent("[data-testid=time-total]")) === "4:00" && /^\d+:\d\d$/.test(await s.page.textContent("[data-testid=time-now]")));
  // ── 2) سحب: معاينة حيّة بلا أمر، والتثبيت عند الإفلات بأمر واحد
  s.page.evaluate(() => { window.__calls.length = 0; });
  b = await bar(s.page);
  await s.page.mouse.move(b.x + b.w * 0.2, b.y); await s.page.mouse.down();
  await s.page.mouse.move(b.x + b.w * 0.45, b.y, { steps: 4 }); await s.page.mouse.move(b.x + b.w * 0.7, b.y, { steps: 4 }); await sleep(120);
  const live = await s.page.textContent("[data-testid=time-now]");
  ok("drag shows live preview time (≈2:48) with no seek call yet", /^2:4\d$|^2:5\d$|^2:3\d$/.test(live) && (await calls(s.page, "media_seek")).length === 0, live);
  await s.page.mouse.up(); await sleep(200);
  seeks = await calls(s.page, "media_seek");
  ok("release ⇒ exactly one media_seek ≈168s", seeks.length === 1 && Math.abs(seeks[0].seconds - 168) <= 2, JSON.stringify(seeks));
  ok("still peek after drag", (await mode(s.page)) === "peek");
  // لوحة المفاتيح
  s.page.evaluate(() => { window.__calls.length = 0; });
  await s.page.focus("[data-testid=seekbar] .sk"); await s.page.keyboard.press("ArrowRight"); await sleep(100);
  seeks = await calls(s.page, "media_seek");
  ok("ArrowRight seeks +5s", seeks.length === 1 && seeks[0].seconds > 0, JSON.stringify(seeks));
  ok("no page errors (seek)", s.errs.length === 0, s.errs.join("|")); await s.ctx.close();

  // ── 3) مصدر بلا دعم بحث: معطَّل بصريًا بلا أخطاء ولا أوامر
  s = await open(browser, { media: { ...MEDIA, can_seek: false } }); await toPeek(s.page);
  ok("no seek support ⇒ data-can-seek=false + aria-disabled + tooltip", await s.page.evaluate(() => { const w = document.querySelector("[data-testid=seekbar]"), k = w.querySelector(".sk"); return w.dataset.canSeek === "false" && k.getAttribute("aria-disabled") === "true" && !!w.title && !w.querySelector(".sk-knob") && parseFloat(getComputedStyle(w).opacity) < 1; }));
  b = await bar(s.page); await s.page.mouse.click(b.x + b.w * 0.5, b.y); await s.page.mouse.down(); await s.page.mouse.move(b.x + 10, b.y); await s.page.mouse.up(); await sleep(150);
  ok("disabled bar issues no media_seek and does not expand", (await calls(s.page, "media_seek")).length === 0 && (await mode(s.page)) === "peek");
  ok("no page errors (disabled)", s.errs.length === 0, s.errs.join("|")); await s.ctx.close();

  // ── 4) الإطلالة التفاعلية: تبويبات حقيقية بلا فتح اللوحة وبلا سرقة فوكس
  s = await open(browser, { media: MEDIA }); await toPeek(s.page);
  const tabNames = await s.page.evaluate(() => [...document.querySelectorAll("[data-testid=peek-tabs] [role=tab]")].map((e) => e.getAttribute("aria-label")));
  ok("peek shows the whole tab bar (same tabs as the panel)", tabNames.length >= 6 && tabNames.includes("Home") && tabNames.includes("Clipboard") && tabNames.includes("Tools"), tabNames.join(","));
  const h0 = await s.page.evaluate(() => document.querySelector(".island-body").getBoundingClientRect().height);
  s.page.evaluate(() => { window.__calls.length = 0; });
  await s.page.click("[data-testid=peek-tabs] [role=tab][aria-label=Clipboard]"); await sleep(1100);
  let st = await s.page.evaluate(() => ({ mode: document.querySelector(".island-body").dataset.mode, tab: document.querySelector("[data-testid=peek-body]")?.dataset.tab, h: document.querySelector(".island-body").getBoundingClientRect().height, search: !!document.querySelector("[data-testid=peek-body] input") }));
  ok("Clipboard tab inside the peek (real component), mode stays peek", st.mode === "peek" && st.tab === "clip" && st.search, JSON.stringify(st));
  ok("peek grows for a tab body but stays under the documented cap (≤ 240)", st.h > h0 && st.h <= 240.5, `${h0}→${st.h}`);
  await s.page.click("[data-testid=peek-tabs] [role=tab][aria-label=Tools]"); await sleep(1000);
  st = await s.page.evaluate(() => ({ mode: document.querySelector(".island-body").dataset.mode, tab: document.querySelector("[data-testid=peek-body]")?.dataset.tab, btn: document.querySelectorAll("[data-testid=peek-body] button").length }));
  ok("Tools tab works inside the peek with real buttons", st.mode === "peek" && st.tab === "tools" && st.btn > 0, JSON.stringify(st));
  await s.page.click("[data-testid=peek-body] button"); await sleep(300);
  ok("clicking a real button inside the peek does not open the panel", (await mode(s.page)) === "peek");
  ok("no take_focus from tab/button interaction (focus rule intact)", (await calls(s.page, "take_focus")).length === 0);
  // عجلة فوق تبويب غير الرئيسية لا تبدّل شيئًا (تمرير المحتوى نفسه)
  await s.page.mouse.move(400, 120); await s.page.mouse.wheel(0, 200); await sleep(400);
  ok("wheel over a non-home peek tab keeps the tab (scrolls content)", await s.page.evaluate(() => document.querySelector("[data-testid=peek-body]").dataset.tab === "tools"));
  // الضغط على الخلفية = اختصار للوحة الأكبر على نفس التبويب
  await s.page.click("[data-testid=peek-tabs]", { position: { x: 3, y: 3 } }); await sleep(1100);
  st = await s.page.evaluate(() => ({ mode: document.querySelector(".island-body").dataset.mode, panelTools: !!document.querySelector("[data-testid=panel-layer] [role=tab][aria-selected=true]") }));
  ok("click on the background is still the shortcut to the bigger panel", st.mode === "panel", JSON.stringify(st));
  ok("no page errors (peek tabs)", s.errs.length === 0, s.errs.join("|")); await s.ctx.close();

  // ── 5) أدوات المشغّل داخل الإطلالة (أزرار) بلا فتح اللوحة
  s = await open(browser); await toPeek(s.page);
  s.page.evaluate(() => { window.__calls.length = 0; });
  await s.page.click("[data-testid=player-peek] [data-testid=player-controls] button:nth-child(3)"); await sleep(200);
  ok("peek player: next button works without expanding", (await calls(s.page, "media_control")).some((a) => a.action === "next") && (await mode(s.page)) === "peek");
  await s.ctx.close();

  // ── 6) المصغّرة: نسبة أصلية وحجم موحّد وعنصر نائب
  const dims = (page) => page.evaluate(() => { const f = document.querySelector("[data-testid=thumb] [data-testid=artwork]"); if (!f) return null; const r = f.getBoundingClientRect(); const im = f.querySelector("[data-testid=thumb-img]"); const t = document.querySelector("[data-testid=thumb]"); return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100, kind: t.dataset.kind, fit: im ? getComputedStyle(im).objectFit : null, ph: !!f.querySelector("[data-testid=thumb-placeholder]"), loading: t.dataset.loading, nw: im?.naturalWidth || 0, nh: im?.naturalHeight || 0 }; });
  s = await open(browser, { media: { ...MEDIA, source: "chrome.exe", source_name: "Google Chrome" }, cover: vid }); await toPeek(s.page); await sleep(500);
  let d = await dims(s.page);
  ok("video thumbnail: 16:9 frame at the single size token (128×72), cover fit, no distortion", d && d.kind === "video" && Math.abs(d.w / d.h - 16 / 9) < 0.02 && Math.abs(d.h - 72) < 1 && d.fit === "cover", JSON.stringify(d));
  ok("cover was downscaled once to the size cap (≤ 480 long side) and keeps 16:9", d.nw <= 480 && d.nw > 0 && Math.abs(d.nw / d.nh - 16 / 9) < 0.02, JSON.stringify(d));
  ok("video duration badge shown", (await s.page.textContent("[data-testid=thumb-duration]")) === "4:00");
  ok("ambient halo present in full motion", (await s.page.locator("[data-testid=thumb-halo]").count()) === 1);
  const peekDims = d;
  await s.page.mouse.click(300, 8); await sleep(1300);
  d = await dims(s.page);
  ok("panel uses the same thumbnail size as the peek (one token)", d && Math.abs(d.w - peekDims.w) < 0.6 && Math.abs(d.h - peekDims.h) < 0.6, JSON.stringify([peekDims, d]));
  await s.ctx.close();
  s = await open(browser, { cover: sq }); await toPeek(s.page); await sleep(500);
  d = await dims(s.page);
  ok("audio cover: square 72×72, cover fit, blurred backdrop behind the sharp cover", d && d.kind === "audio" && Math.abs(d.w - d.h) < 0.6 && Math.abs(d.h - 72) < 1 && d.fit === "cover" && (await s.page.locator("[data-testid=thumb-blur]").count()) === 1, JSON.stringify(d));
  ok("audio has no duration badge", (await s.page.locator("[data-testid=thumb-duration]").count()) === 0);
  await s.ctx.close();
  // عنصر نائب بنفس الأبعاد: بلا غلاف ثم وصول الغلاف بلا قفزة
  s = await open(browser, { media: { ...MEDIA, source: "chrome.exe", source_name: "Google Chrome" }, cover: null }); await toPeek(s.page);
  d = await dims(s.page);
  ok("placeholder: same 128×72 slot, loading shimmer", d && d.ph && Math.abs(d.w - 128) < 1 && Math.abs(d.h - 72) < 1 && d.loading === "true" && (await s.page.locator("[data-testid=thumb-shimmer]").count()) === 1, JSON.stringify(d));
  await s.page.evaluate((c) => window.__emit("media:cover", c), vid); await sleep(700);
  const d2 = await dims(s.page);
  ok("cover arrives ⇒ same dimensions (no jump), shimmer gone", d2 && !d2.ph && Math.abs(d2.w - d.w) < 1 && Math.abs(d2.h - d.h) < 1 && (await s.page.locator("[data-testid=thumb-shimmer]").count()) === 0, JSON.stringify(d2));
  await s.page.evaluate((c) => window.__emit("media:cover", c), sq); await sleep(900);
  ok("cross-fade swap leaves a single image layer (no flicker residue)", (await s.page.locator("[data-testid=thumb-img]").count()) === 1);
  await s.page.evaluate(() => window.__emit("media:cover", null)); await sleep(300);
  const d3 = await dims(s.page);
  ok("cover disappears ⇒ placeholder keeps the learned kind/size (no jump)", d3 && d3.ph && Math.abs(d3.h - 72) < 1, JSON.stringify(d3));
  ok("no page errors (thumb)", s.errs.length === 0, s.errs.join("|")); await s.ctx.close();

  // ── 7) Eco/reduced: لا هالة ولا تمويه ولا وميض ولا تكبير تمرير
  s = await open(browser, { cover: vid, media: { ...MEDIA, source: "chrome.exe", source_name: "Google Chrome" }, settings: { motionLevel: "reduced", reduceMotion: true } }); await toPeek(s.page); await sleep(500);
  ok("reduced motion: no halo / blur / shimmer", (await s.page.locator("[data-testid=thumb-halo], [data-testid=thumb-blur], [data-testid=thumb-shimmer]").count()) === 0);
  await s.ctx.close();

  // ── 8) خمول: بعد المغادرة لا rAF ولا مؤقّتات تقدّم
  s = await open(browser, { cover: vid, media: { ...MEDIA, playing: false } }); await toPeek(s.page); await s.page.mouse.move(5, 480); await sleep(1800);
  await s.page.evaluate(() => { window.__count = true; window.__raf = 0; }); await sleep(2500);
  ok("idle after leaving the peek: 0 rAF", (await s.page.evaluate(() => window.__raf)) === 0, String(await s.page.evaluate(() => window.__raf)));
  await s.ctx.close();

  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
