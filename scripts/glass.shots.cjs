// لقطات الجزيرة على خلفية ملوّنة: داكن/فاتح × (مُحاكى مثلّج · مُحاكى شفاف · مصمت · احتياط معتم). متصفح بجسر وهمي — ليست نافذة ويندوز.
// الخرج: docs/screenshots/glass-{sim-frosted,sim-clear,solid,opaque-fallback}-{dark,light}[-open].png
const { chromium } = require("playwright"); const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
const V = { "sim-frosted": [{ glassStyle: "crystal", glassTint: 45 }, {}], "sim-clear": [{ glassStyle: "clear", glassTint: 25 }, {}], solid: [{ themeMaterial: "solid" }, {}], "opaque-fallback": [{}, { transparency: false }] };
(async () => {
  const browser = await chromium.launch();
  for (const theme of ["dark", "light"]) for (const [name, [st, cfg]] of Object.entries(V)) for (const open of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 300 }, colorScheme: theme }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, showClock: true, themeMode: theme, hoverDelayMs: 0, themeMaterial: "glass", ...st }, ...cfg }));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1000);
    await page.addStyleTag({ content: `html{background:linear-gradient(120deg,#4c8dff,#f472b6 50%,#ffb224)!important}` });
    if (open) { await page.mouse.move(400, 10); await page.waitForTimeout(900); await page.mouse.click(400, 10); await page.waitForTimeout(1300); }
    await page.screenshot({ path: `docs/screenshots/glass-${name}-${theme}${open ? "-open" : ""}.png` });
    await ctx.close();
  }
  await browser.close();
})();
