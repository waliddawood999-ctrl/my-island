// لقطات Playwright للتصميم: الحبة (خمول/تنبيه)، اللوحة، وكل أقسام الإعدادات — فاتح/داكن، بلوري/شفاف، إنجليزي/عربي RTL.
// الجسر وهمي والمتصفح لا يملك أكريليك ويندوز: خلفية متدرّجة تُحقن خلف الصفحة الشفافة لتحاكي ورق الجدار. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/screens.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:4173";
const OUT = process.env.OUT || "docs/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const WALL = {
  dark: "linear-gradient(120deg,#1e3a8a 0%,#7e22ce 45%,#be185d 70%,#f59e0b 100%)",
  light: "linear-gradient(120deg,#bfdbfe 0%,#fbcfe8 50%,#fde68a 100%)",
};
const SECTIONS = ["general", "island", "appearance", "motion", "modules", "notifications", "shortcuts", "perf", "updates", "about"];
const list = [];
(async () => {
  const browser = await chromium.launch();
  const mk = async (url, settings, vp, extra = {}) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { themeMaterial: "glass", glassStyle: "crystal", settingsVersion: 2, ...settings }, ...extra }));
    await page.emulateMedia({ colorScheme: settings.themeMode === "light" ? "light" : "dark" });
    await page.goto(`${BASE}/${url}`); await page.waitForTimeout(900);
    return { ctx, page };
  };
  const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); list.push(name); };
  // الجزيرة
  for (const lang of ["en", "ar"]) for (const theme of ["dark", "light"]) for (const style of lang === "en" ? ["crystal", "clear"] : ["crystal"]) {
    const { ctx, page } = await mk("index.html", { language: lang, themeMode: theme, glassStyle: style, ...(style === "clear" ? { glassTint: 14, glassBlur: 6, glassSaturation: 120 } : { glassTint: 38, glassBlur: 32 }), eyesEnabled: false }, { width: 760, height: 360 });
    await page.addStyleTag({ content: `html{background:${WALL[theme]} !important}` });
    const tag = `island-${lang}-${theme}-${style}`;
    await shot(page, `${tag}-pill-idle`);
    await page.evaluate(() => window.__emit("island:note", { kind: "reminder", id: "r1", at: Date.now(), late: false, text: "اجتماع الفريق بعد 10 دقائق" }));
    await page.waitForTimeout(900); await shot(page, `${tag}-pill-notification`);
    await page.mouse.move(380, 12); await page.waitForTimeout(1600); await shot(page, `${tag}-panel`);
    await ctx.close();
  }
  // الإعدادات
  for (const lang of ["en", "ar"]) for (const theme of ["dark", "light"]) {
    const { ctx, page } = await mk("settings.html", { language: lang, themeMode: theme }, { width: 880, height: 620 });
    for (const sec of SECTIONS) { await page.locator(`[data-nav="${sec}"]`).click(); await page.waitForTimeout(450); await shot(page, `settings-${lang}-${theme}-${sec}`); }
    await ctx.close();
  }
  await browser.close();
  console.log(list.length + " screenshots → " + OUT + "\n" + list.join("\n"));
})();
