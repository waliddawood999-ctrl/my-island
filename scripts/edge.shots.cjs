// حافة الحبة المكبّرة 10× عند 100% و150% (داكن/فاتح): يسار = «قبل» (قصّ المنطقة الأحادي عند حافة الجزيرة بالضبط كما كان SetWindowRgn)،
// يمين = «بعد» (المنطقة موسَّعة بـEDGE_PAD_CSS=10px فتبقى حافة CSS المنعَّمة والظل). تحذير: محاكاة بمتصفح (Chromium) لقصّ GDI Region
// على لقطة الصفحة نفسها — ليست لقطة نافذة ويندوز حقيقية. الخرج: docs/screenshots/edge-{before-after}-{100,150}-{dark,light}.png + docs/q/edge-after.json
// تشغيل:  npm run build && npx vite preview --port 4173 &  ثم:  NODE_PATH=$(npm root -g) node scripts/edge.shots.cjs
const { chromium } = require("playwright"); const { bridge } = require("./mockBridge.cjs"); const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:4173"; const PAD = 10;
(async () => {
  const browser = await chromium.launch(); const out = {};
  for (const dpr of [1, 1.5]) for (const theme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: dpr, colorScheme: theme }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, showClock: false, themeMode: theme } }));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1200);
    const b = await page.evaluate(() => { const e = document.querySelector(".island-body"), r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, rad: parseFloat(getComputedStyle(e).borderBottomLeftRadius) }; });
    const clip = { x: Math.max(0, b.x - PAD - 4), y: 0, width: 40, height: Math.ceil(b.h + PAD + 6) };
    const png = (await page.screenshot({ clip, omitBackground: true })).toString("base64");
    const res = await page.evaluate(async ([png, dpr, b, clip, PAD]) => {
      const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
      const W = img.width, H = img.height, Z = 10;
      const c0 = document.createElement("canvas"); c0.width = W; c0.height = H; const g0 = c0.getContext("2d"); g0.drawImage(img, 0, 0); const d = g0.getImageData(0, 0, W, H);
      // داخل مستطيل مدوّر (إحداثيات CSS ← بكسل)
      const inside = (px, py, x, y, w, h, r) => { const cx = Math.min(Math.max(px, x + r), x + w - r), cy = Math.min(Math.max(py, y + r), y + h - r); return (px - cx) ** 2 + (py - cy) ** 2 <= r * r; };
      const mk = (pad) => { const o = g0.createImageData(W, H); let partial = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 4, px = (i + 0.5) / dpr + clip.x, py = (j + 0.5) / dpr + clip.y;
          const keep = inside(px, py, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad, b.rad + pad); // مجال المنطقة
          if (keep) { for (let q = 0; q < 4; q++) o.data[k + q] = d.data[k + q]; const a = d.data[k + 3]; if (a > 4 && a < 251) partial++; }
          else { o.data[k + 3] = 0; } }
        // القصّ الأحادي: ألفا ≥ 128 ⇒ معتم وإلا شفاف (سلوك المنطقة: جزء من الصورة داخل/خارج، لا تضادّ). قبل: pad=0 ⇒ الحافة تُقصّ بالبكسل الكامل
        return { o, partial }; };
      const before = mk(0), after = mk(PAD);
      // قبل: بكسلات الحافة الجزئية داخل المنطقة تظهر كاملة الألفا (المنطقة لا تمزج): ألفا ≥ 128 ⇒ 255
      let hardened = 0; for (let k = 3; k < before.o.data.length; k += 4) { const a = before.o.data[k]; if (a > 0) { if (a < 255) hardened++; before.o.data[k] = 255; } }
      const draw = (g, o, ox) => { const t = document.createElement("canvas"); t.width = W; t.height = H; t.getContext("2d").putImageData(o, 0, 0); g.drawImage(t, ox, 0, W * Z, H * Z); };
      const c = document.createElement("canvas"); c.width = W * Z * 2 + 20; c.height = H * Z; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.fillStyle = "#8a8f98"; g.fillRect(0, 0, c.width, c.height);
      draw(g, before.o, 0); draw(g, after.o, W * Z + 20);
      return { url: c.toDataURL("image/png"), hardenedEdgePx: hardened, afterPartialPx: after.partial };
    }, [png, dpr, b, clip, PAD]);
    const name = `edge-before-after-${Math.round(dpr * 100)}-${theme}`;
    fs.writeFileSync(`docs/screenshots/${name}.png`, Buffer.from(res.url.split(",")[1], "base64"));
    out[name] = { hardenedEdgePx_before: res.hardenedEdgePx, antialiasedEdgePx_after: res.afterPartialPx };
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); fs.writeFileSync("docs/q/edge-after.json", JSON.stringify(out, null, 2)); await browser.close();
})();
