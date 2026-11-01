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
// يحاكي أكريليك ويندوز (DWM) خلف الجسم: تمويه 30px + صبغة بألفا المعادلة نفسها في backdrop.rs؛ ويضبط data-backdrop كما تفعل الحبة بعد الاستقرار.
const fakeAcrylic = (page, theme, tint) => page.evaluate(([theme, tint]) => {
  document.querySelectorAll(".fake-acrylic").forEach((e) => e.remove());
  const b = document.querySelector(".island-body"); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
  const a = theme === "dark" ? 0.28 + 0.0075 * tint : Math.min(0.28 + 0.0075 * tint + 0.04, 0.92);
  const d = document.createElement("div"); d.className = "fake-acrylic";
  d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${cs.borderRadius};z-index:-1;backdrop-filter:blur(30px) saturate(1.25);background:${theme === "dark" ? `rgba(0,0,0,${a})` : `rgba(236,239,243,${a})`}`;
  document.body.appendChild(d); document.documentElement.dataset.backdrop = "win10";
}, [theme, tint]);
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
  // الجزيرة: تنبيه داخل الحبة نفسها + عربي RTL
  for (const lang of ["en", "ar"]) for (const theme of ["dark", "light"]) {
    const { ctx, page } = await mk("index.html", { language: lang, themeMode: theme, glassTint: 38, glassBlur: 32, eyesEnabled: false }, { width: 760, height: 360 });
    await page.addStyleTag({ content: `html{background:${WALL[theme]} !important}` });
    await fakeAcrylic(page, theme, 38);
    const tag = `island-${lang}-${theme}`;
    await shot(page, `${tag}-pill-idle`);
    await page.evaluate(() => window.__emit("island:note", { kind: "reminder", id: "r1", at: Date.now(), late: false, text: "اجتماع الفريق بعد 10 دقائق" }));
    await page.waitForTimeout(900); await fakeAcrylic(page, theme, 38); await shot(page, `${tag}-pill-notification`);
    await page.mouse.move(380, 12); await page.waitForTimeout(1600); await fakeAcrylic(page, theme, 38); await shot(page, `${tag}-panel`);
    await ctx.close();
  }
  // الأساليب: كل أسلوب/إعداد مسبق بفاتح وداكن (الحبة + اللوحة) — سطح واحد لكل أسلوب
  const STYLES = {
    crystal: { glassStyle: "crystal", themeMaterial: "glass", glassTint: 38, glassBlur: 32 },
    clear: { glassStyle: "clear", themeMaterial: "glass", glassTint: 14, glassBlur: 6, glassSaturation: 120 },
    mica: { glassStyle: "crystal", themeMaterial: "glass", glassTint: 62, glassBlur: 20, glassSaturation: 110 },
    minimal: { themeMaterial: "solid" },
  };
  for (const theme of ["dark", "light"]) for (const [name, st] of Object.entries(STYLES)) {
    const { ctx, page } = await mk("index.html", { language: "en", themeMode: theme, eyesEnabled: false, ...st }, { width: 760, height: 360 });
    await page.addStyleTag({ content: `html{background:${WALL[theme]} !important}` });
    const acrylic = st.themeMaterial === "glass" && st.glassStyle === "crystal";
    if (acrylic) await fakeAcrylic(page, theme, st.glassTint);
    await shot(page, `style-${name}-${theme}-pill`);
    await page.mouse.move(380, 12); await page.waitForTimeout(1600);
    if (acrylic) await fakeAcrylic(page, theme, st.glassTint);
    await shot(page, `style-${name}-${theme}-panel`);
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
