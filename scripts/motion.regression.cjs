// «نمط النابض» و«تقليل الحركة» يغيّران الحركة فعلًا: يقيس زمن فتح اللوحة (عرض الجسم → 98٪ من 720) لكل إعداد. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/motion.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const URL = process.env.URL || "http://localhost:4173/index.html";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
async function openTime(browser, settings, media) { const a = await openTime1(browser, settings, media); const b = await openTime1(browser, settings, media); return a.ms <= b.ms ? a : b; }
async function openTime1(browser, settings, media) {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 360 }, reducedMotion: media || "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, ...settings } }));
  await page.goto(URL); await page.waitForTimeout(900);
  const r = await page.evaluate(() => new Promise((res) => {
    const b = document.querySelector(".island-body"); const t0 = performance.now(); let peak = 0;
    const tick = () => { const w = b.getBoundingClientRect().width; peak = Math.max(peak, w); if (w >= 520 * 0.98 && performance.now() - t0 > 30) return res({ ms: Math.round(performance.now() - t0), peak }); if (performance.now() - t0 > 4000) return res({ ms: 4000, peak }); requestAnimationFrame(tick); };
    b.dispatchEvent(new MouseEvent("click", { bubbles: true })); requestAnimationFrame(tick);
  }));
  await ctx.close(); return r;
}
(async () => {
  const browser = await chromium.launch();
  const snappy = await openTime(browser, { motionPreset: "cultUi" });
  const smooth = await openTime(browser, { motionPreset: "snappy" });
  const gentle = await openTime(browser, { motionPreset: "calm" });
  console.log("open time ms → snappy", snappy.ms, "smooth", smooth.ms, "gentle", gentle.ms);
  ok("spring style is visible: calm is clearly slower than cultUi (≥ +120 ms)", gentle.ms - snappy.ms >= 120, JSON.stringify({ snappy, gentle }));
  ok("ordering cultUi < snappy < calm", snappy.ms < smooth.ms && smooth.ms < gentle.ms, JSON.stringify({ snappy, smooth, gentle }));
  const fast = await openTime(browser, { motionPreset: "snappy", motionSpeed: 2 });
  const slow = await openTime(browser, { motionPreset: "snappy", motionSpeed: 0.5 });
  ok("animation speed 0.5× is slower than 1.5×", slow.ms > fast.ms + 150, JSON.stringify({ fast, slow }));
  const red = await openTime(browser, { motionPreset: "bouncy", reduceMotion: "always" });
  ok("Reduce motion: short fade-like open (≤ 270 ms, ≪ gentle) with no overshoot", red.ms <= 270 && red.ms < gentle.ms * 0.7 && red.peak <= 722, JSON.stringify(red));
  const os = await openTime(browser, { motionPreset: "bouncy" }, "reduce");
  ok("OS 'reduce motion / show animations off' is honored the same way", os.ms <= 270 && os.ms < gentle.ms * 0.7 && os.peak <= 722, JSON.stringify(os));
  const off = await openTime(browser, { motionPreset: "bouncy", motionLevel: "off" });
  ok("Motion level 'off' opens instantly (≤ 120 ms)", off.ms <= 120, JSON.stringify(off));
  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
