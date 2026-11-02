// حافة الحبة مكبّرة 10× عند 100%/125%/150%: يسار = حافة CSS الحقيقية (مضادّ التعرّج) · يمين = محاكاة قصّ المنطقة SetWindowRgn
// (أحادية البت: ألفا ≥ 0.5 ⇒ معتم وإلا شفاف). تحذير: المحاكاة تقريب لسلوك GDI Region لا لقطة نافذة ويندوز حقيقية.
const { chromium } = require("playwright"); const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173"; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch(); const out = {};
  for (const dpr of [1, 1.25, 1.5]) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: dpr }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, showClock: false } }));
    await page.goto(`${BASE}/index.html`); await sleep(1000);
    const b = await page.evaluate(() => { const r = document.querySelector(".island-body").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const clip = { x: b.x - 4, y: 0, width: 30, height: b.h + 4 };
    const png = (await page.screenshot({ clip, omitBackground: true })).toString("base64");
    const res = await page.evaluate(async ([png, dpr]) => {
      const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
      const W = img.width, H = img.height, Z = 10;
      const c0 = document.createElement("canvas"); c0.width = W; c0.height = H; const x0 = c0.getContext("2d"); x0.drawImage(img, 0, 0); const d = x0.getImageData(0, 0, W, H);
      let partial = 0, solid = 0;
      for (let k = 3; k < d.data.length; k += 4) { const a = d.data[k]; if (a > 4 && a < 251) partial++; else if (a >= 251) solid++; }
      const bin = x0.createImageData(W, H); for (let k = 0; k < d.data.length; k += 4) { const a = d.data[k + 3] >= 128 ? 255 : 0; bin.data[k] = d.data[k]; bin.data[k + 1] = d.data[k + 1]; bin.data[k + 2] = d.data[k + 2]; bin.data[k + 3] = a; }
      const c = document.createElement("canvas"); c.width = W * Z * 2 + 20; c.height = H * Z; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.fillStyle = "#8a8f98"; g.fillRect(0, 0, c.width, c.height);
      const cb = document.createElement("canvas"); cb.width = W; cb.height = H; cb.getContext("2d").putImageData(bin, 0, 0);
      g.drawImage(c0, 0, 0, W * Z, H * Z); g.drawImage(cb, W * Z + 20, 0, W * Z, H * Z);
      return { dataUrl: c.toDataURL("image/png"), partialAlphaPx: partial, solidPx: solid };
    }, [png, dpr]);
    require("fs").writeFileSync(`docs/q/edge-sim-${Math.round(dpr * 100)}.png`, Buffer.from(res.dataUrl.split(",")[1], "base64"));
    out[dpr] = { partialAlphaPx: res.partialAlphaPx, solidPx: res.solidPx, note: "partialAlpha = بكسلات حافة مضادّة للتعرّج في CSS؛ القصّ الأحادي يُسقطها كلها" };
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); require("fs").writeFileSync("docs/q/edges.json", JSON.stringify(out, null, 2)); await browser.close();
})();
