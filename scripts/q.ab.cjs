// A/B لفرضية «filter:blur(0px) المتبقّي يغيّر رسم النص»: لقطة اللمحة/اللوحة كما هي ثم بعد filter:none على كل العناصر؛ مقياس: عدد البكسلات المختلفة + طاقة الحواف (تباين لابلاس).
const { chromium } = require("playwright"); const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEDIA = { session: true, source: "Spotify.exe", source_name: "Spotify", title: "A long song title", artist: "Artist", album: "Album", duration: 240, position: 30, playing: false, can_prev: true, can_next: true, can_seek: true, kind: "gsmtc", degraded: false };
const analyze = (page, a, b) => page.evaluate(async ([a, b]) => {
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const get = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height); };
  const da = get(ia), db = get(ib); let diff = 0, maxd = 0, sumd = 0;
  const lap = (d) => { let s = 0, n = 0; const w = d.width, h = d.height; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const g = (xx, yy) => d.data[(yy * w + xx) * 4 + 1]; const l = 4 * g(x, y) - g(x - 1, y) - g(x + 1, y) - g(x, y - 1) - g(x, y + 1); s += l * l; n++; } return s / n; };
  for (let k = 0; k < da.data.length; k += 4) { const d = Math.abs(da.data[k] - db.data[k]) + Math.abs(da.data[k + 1] - db.data[k + 1]) + Math.abs(da.data[k + 2] - db.data[k + 2]); if (d > 0) { diff++; sumd += d; if (d > maxd) maxd = d; } }
  return { w: ia.width, h: ia.height, diffPx: diff, pct: +(100 * diff / (da.width * da.height)).toFixed(2), maxDelta: maxd, lapWith: +lap(da).toFixed(1), lapNone: +lap(db).toFixed(1) };
}, [a, b]);
(async () => {
  const browser = await chromium.launch(); const out = {};
  for (const dpr of [1, 1.25, 1.5]) for (const state of ["peek", "panel"]) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: dpr }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3 }, media: MEDIA, extra: { media_now: { info: MEDIA, cover: null } } }));
    await page.goto(`${BASE}/index.html`); await sleep(900);
    await page.hover(".island-body"); await sleep(1500);
    if (state === "panel") { await page.click(".island-body"); await sleep(1800); }
    const box = await page.evaluate(() => { const r = document.querySelector(".island-body").getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
    const shot = async () => "data:image/png;base64," + (await page.screenshot({ clip: box })).toString("base64");
    const a = await shot();
    const n = await page.evaluate(() => { let n = 0; document.querySelectorAll(".island-body *").forEach((e) => { if (getComputedStyle(e).filter !== "none") { e.style.filter = "none"; n++; } }); return n; });
    await sleep(200); const b = await shot();
    out[`${dpr}/${state}`] = { elementsWithFilter: n, ...(await analyze(page, a, b)) };
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); require("fs").writeFileSync(process.argv[2] || "docs/q/ab-filter.json", JSON.stringify(out, null, 2)); await browser.close();
})();
