// تشخيص المرحلة Q (جودة/سلاسة/رام) — يقيس في Chromium (Playwright) بجسر Tauri وهمي. ليس نافذة ويندوز حقيقية:
// الأرقام نسبية (قبل/بعد على نفس الجهاز) لا مطلقة. الاستخدام:  npm run build && npx vite preview --port 4173 &  ثم  node scripts/q.diag.cjs out.json
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
const OUT = process.argv[2] || "docs/q/diag.json";

const rssMB = () => { // مجموع RSS لكل عمليات كروميوم (MB)
  const out = execSync("ps -eo rss,args").toString().split("\n").filter((l) => /chrom|headless_shell/i.test(l) && !/ps -eo/.test(l));
  return Math.round(out.reduce((a, l) => a + (parseInt(l.trim(), 10) || 0), 0) / 1024);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEDIA = { session: true, source: "Spotify.exe", source_name: "Spotify", title: "A long song title", artist: "Artist", album: "Album", duration: 240, position: 30, playing: true, can_prev: true, can_next: true, can_seek: true, kind: "gsmtc", degraded: false };

async function makeCover(browser, w, h) {
  const p = await browser.newPage();
  const uri = await p.evaluate(([w, h]) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#e5484d"); g.addColorStop(0.5, "#3e63dd"); g.addColorStop(1, "#30a46c"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${(i * 37) % 360} 70% 55% / .6)`; x.beginPath(); x.arc((i * 97) % w, (i * 53) % h, 20 + (i % 40), 0, 7); x.fill(); }
    return c.toDataURL("image/jpeg", 0.92);
  }, [w, h]);
  await p.close(); return uri;
}

// مسح ما بعد الاستقرار: عناصر فيها نص ولها transform/filter/will-change، أو حدودها كسرية بالبكسل الفيزيائي.
const scan = (page) => page.evaluate(() => {
  const dpr = window.devicePixelRatio; const res = { transform: [], filter: [], willChange: [], fractional: [], textEls: 0 };
  const root = document.querySelector(".island-body"); if (!root) return res;
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const desc = (el) => `${el.tagName.toLowerCase()}${el.dataset.testid ? "[" + el.dataset.testid + "]" : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""}`;
  const visibleOpacity = (el) => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).opacity === "0" || getComputedStyle(e).visibility === "hidden") return false; return true; };
  for (const el of root.querySelectorAll("*")) {
    if (!visibleOpacity(el)) continue;
    const cs = getComputedStyle(el);
    // الأسلاف المرسومة لطبقة: transform/filter على الأصل يرسم النص داخل طبقة (يُرسَم بخلفية معلومة رمادية AA لا LCD وقد يُعاد أخذ عيّنته)
    if (hasText(el)) {
      res.textEls++;
      for (let a = el; a && a !== root.parentElement; a = a.parentElement) {
        const c = getComputedStyle(a);
        if (c.transform !== "none" && a !== root) res.transform.push(desc(el) + " <- " + desc(a) + " " + c.transform);
        if (c.filter !== "none") res.filter.push(desc(el) + " <- " + desc(a) + " " + c.filter);
        if (c.willChange !== "auto") res.willChange.push(desc(el) + " <- " + desc(a) + " " + c.willChange);
      }
      const r = el.getBoundingClientRect(); const f = (v) => Math.abs(v * dpr - Math.round(v * dpr)) > 0.02;
      if (f(r.left) || f(r.top)) res.fractional.push(desc(el) + ` @${r.left.toFixed(2)},${r.top.toFixed(2)}`);
    }
  }
  for (const k of ["transform", "filter", "willChange", "fractional"]) res[k] = [...new Set(res[k])].slice(0, 12);
  return res;
});

async function frames(page, action, ms) {
  await page.evaluate(() => { window.__ft = []; let last = performance.now(); const f = (t) => { window.__ft.push(t - last); last = t; if (window.__run) requestAnimationFrame(f); }; window.__run = true; requestAnimationFrame(f); });
  await action(); await sleep(ms);
  const ft = await page.evaluate(() => { window.__run = false; return window.__ft; });
  const v = ft.slice(1); return { n: v.length, mean: +(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(2), worst: +Math.max(0, ...v).toFixed(1), over20: v.filter((x) => x > 20).length };
}

(async () => {
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
  const cover = await makeCover(browser, 1280, 720);
  const result = { when: new Date().toISOString(), cover: { w: 1280, h: 720, uriKB: Math.round(cover.length / 1024) }, dpr: {} };
  for (const dpr of [1, 1.25, 1.5]) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3 }, media: MEDIA, extra: { media_now: { info: MEDIA, cover } } }));
    await page.goto(`${BASE}/index.html`); await sleep(1200);
    const r = { dpr: await page.evaluate(() => window.devicePixelRatio) };
    r.scanPill = await scan(page);
    r.open = await frames(page, () => page.hover(".island-body"), 1600);
    r.scanOpen = await scan(page);
    r.close = await frames(page, () => page.mouse.move(5, 480), 1600);
    r.scanClosed = await scan(page);
    // لقطات مكبّرة لحافة الحبة (يسار) — نفس المنطقة 40×40 CSS بدقة الجهاز
    const b = await page.evaluate(() => { const r = document.querySelector(".island-body").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    r.pillBox = b;
    await page.screenshot({ path: `docs/q/edge-${process.argv[3] || "before"}-${Math.round(dpr * 100)}.png`, clip: { x: Math.max(0, b.x - 6), y: 0, width: 40, height: Math.min(40, b.h + 6) } });
    r.errors = errs; result.dpr[dpr] = r; await ctx.close();
  }
  // ذاكرة: الرئيسية خاملة (بدون/مع غلاف) + صفحة التراكب منفصلة
  const base = rssMB();
  const mk = async (cfgExtra, media) => { const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } }); const p = await ctx.newPage(); await p.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3 }, media, extra: cfgExtra })); await p.goto(`${BASE}/index.html`); await sleep(1500); return { ctx, p }; };
  const a = await mk({}, undefined); await sleep(500); const idleNoMedia = rssMB();
  const heap0 = await a.p.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
  const b2 = await mk({ media_now: { info: MEDIA, cover } }, MEDIA); await sleep(800); const idleCover = rssMB();
  const heap1 = await b2.p.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
  const ov = await browser.newPage(); await ov.addInitScript(bridge({ settings: { language: "en" } })); await ov.goto(`${BASE}/overlay.html`); await sleep(1200); const withOverlay = rssMB();
  result.memory = { chromiumBaselineMB: base, afterMainNoMediaMB: idleNoMedia, afterSecondMainWithCover1280x720MB: idleCover, afterOverlayPageMB: withOverlay, jsHeapMainNoMediaMB: +heap0.toFixed(1), jsHeapMainWithCoverMB: +heap1.toFixed(1),
    deltaMainNoMedia: idleNoMedia - base, deltaCoverPage: idleCover - idleNoMedia, deltaOverlayPage: withOverlay - idleCover };
  // خمول rAF: صفر في الراحة
  await a.p.evaluate(() => { window.__count = true; window.__raf = 0; }); await sleep(2500);
  result.idleRaf = await a.p.evaluate(() => window.__raf);
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
