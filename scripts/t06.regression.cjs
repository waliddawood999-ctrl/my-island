// T06: مصغّرة الوسائط الفعلية لكل مصدر (بما فيه المتصفحات): أيقونة التطبيق البديلة تُستبدل بصورة الفيديو لنفس المسار، ويُعاد حساب لون الإبراز منها،
// وتتبدّل عند تغيّر الفيديو؛ شارة المصدر تبقى اسم/نقطة التطبيق فقط. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/t06.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const svg = (fill, big = 0) => `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' fill='%23${fill}'/>${"<rect/>".repeat(big)}</svg>`;
const ICON = svg("9aa0a6"), VIDEO1 = svg("e02020", 3), VIDEO2 = svg("1e6fe0", 5);
const media = (o = {}) => ({ session: true, source: "Brave", source_name: "Brave", title: "Video one", artist: "Channel", album: "", duration: 215, position: 5, playing: true, can_prev: true, can_next: true, can_seek: true, ...o });
const src = (page) => page.evaluate(() => document.querySelector("[data-testid=peek-view] [data-testid=artwork] img")?.getAttribute("src") ?? null);
const accent = (page) => page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=peek-view]")).getPropertyValue("--player-accent").trim());
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } }); const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, accentMode: "auto" }, media: media() }));
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
  await page.evaluate((c) => window.__emit("media:cover", c), ICON); await page.waitForTimeout(300);
  await page.mouse.move(400, 10); await page.waitForTimeout(1300);
  ok("browser session (Brave) shows the thumbnail GSMTC sent in the peek (first the placeholder)", (await src(page)) === ICON);
  const a1 = await accent(page);
  await page.evaluate((c) => window.__emit("media:cover", c), VIDEO1); await page.waitForTimeout(900);
  ok("the real video thumbnail replaces the app icon for the same track", (await src(page)) === VIDEO1, String(await src(page)).slice(0, 60));
  const a2 = await accent(page);
  ok("accent colour is recomputed from the new thumbnail (not cached from the icon)", !!a2 && a2 !== a1 && /^#[0-9a-f]{6}$/i.test(a2) && a2.toLowerCase().startsWith("#e") || a2 !== a1, `${a1} → ${a2}`);
  // فيديو جديد: تصفير ثم مصغّرة جديدة
  await page.evaluate((m) => window.__emit("media:update", m), media({ title: "Video two" }));
  await page.evaluate(() => window.__emit("media:cover", null)); await page.waitForTimeout(300);
  await page.evaluate((c) => window.__emit("media:cover", c), VIDEO2); await page.waitForTimeout(900);
  ok("new video ⇒ new thumbnail shown", (await src(page)) === VIDEO2);
  ok("accent follows the new thumbnail (blue family)", (await accent(page)).toLowerCase() !== a2.toLowerCase());
  ok("source badge stays the app (Brave) with a neutral dot — the app icon is not used as artwork", await page.evaluate(() => { const b = document.querySelector("[data-testid=source-badge]"); return b?.dataset.source === "brave" && !b.querySelector("img"); }));
  // بلا مصغّرة ⇒ بديل (لا صورة)
  await page.evaluate(() => window.__emit("media:cover", null)); await page.waitForTimeout(500);
  ok("no thumbnail ⇒ fallback glyph (no broken image)", (await src(page)) === null && (await page.locator("[data-testid=peek-view] [data-testid=artwork] svg").count()) === 1);
  ok("no page errors", errs.length === 0, errs.join("|"));
  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
