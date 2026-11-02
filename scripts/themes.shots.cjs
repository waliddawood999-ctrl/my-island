// لقطات كل حزمة ثيم: داكن/فاتح × (حبة · لوحة مفتوحة). متصفح بجسر وهمي — ليست نافذة ويندوز. الخرج: docs/screenshots/theme-<id>-<dark|light>[-open].png
// الاستعمال: node scripts/themes.shots.cjs [packId ...]  (بلا وسائط ⇒ كل الحزم)
const { chromium } = require("playwright"); const { bridge } = require("./mockBridge.cjs");
const { build } = require("esbuild"); const os = require("os"), path = require("path"), fs = require("fs");
const COVER = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#2a1f45"/><circle cx="110" cy="120" r="90" fill="#ff7a1a"/><circle cx="210" cy="190" r="70" fill="#1fb6a6"/><rect x="0" y="230" width="300" height="70" fill="#1d1630"/></svg>`);
const MEDIA = { session: true, source: "spotify", source_name: "Spotify", title: "Golden Hour", artist: "Sample", album: "", duration: 200, position: 40, playing: true, can_prev: true, can_next: true, can_seek: true, kind: "gsmtc", degraded: false };
const BASE = process.env.BASE || "http://localhost:4173";
(async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ts-")), "p.cjs");
  await build({ entryPoints: ["src/themePacks.ts"], bundle: true, format: "cjs", outfile: out, logLevel: "warning" });
  const { PACKS } = require(out);
  const want = process.argv.slice(2); const ids = (want.length ? PACKS.filter((p) => want.includes(p.id)) : PACKS).map((p) => p.id);
  const extra = JSON.parse(process.env.EXTRA || "{}");
  const browser = await chromium.launch();
  for (const id of ids) for (const theme of ["dark", "light"]) for (const open of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 300 }, colorScheme: theme }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 4, showClock: true, themeMode: theme, themePack: id, hoverDelayMs: 0, themeMaterial: "glass", ...extra }, ...(process.env.CFG ? JSON.parse(process.env.CFG) : {}), ...(id === "living-artwork" ? { cover: COVER, media: MEDIA } : {}) }));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1000);
    await page.addStyleTag({ content: `html{background:linear-gradient(120deg,#3b6fd8,#c75b9b 50%,#e0a03a)!important}` });
    if (open) { await page.mouse.move(400, 10); await page.waitForTimeout(900); await page.mouse.click(400, 10); await page.waitForTimeout(1300); }
    await page.screenshot({ path: `docs/screenshots/theme-${id}-${theme}${open ? "-open" : ""}.png` });
    await ctx.close();
  }
  await browser.close();
})();
