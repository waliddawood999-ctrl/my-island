// موضع الساعة في الحبة المنكمشة (clockPosition): يسار/يمين/فوق/تحت العيون فعليًا (إحداثيات)، بلا قصّ داخل الحبة، والتلقائي لا يتغيّر. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/clockpos.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const probe = async (browser, settings) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.addInitScript(bridge({ settings: { language: "en", settingsVersion: 3, eyesEnabled: true, showClock: true, ...settings } }));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="pill-row"]'), clock = document.querySelector('[data-testid="pill-clock"]'), body = document.querySelector(".island-body");
    if (!row || !clock) return null;
    const eyes = row.firstElementChild, R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 }; };
    return { clock: R(clock), eyes: R(eyes), body: R(body), attr: row.dataset.clock, fs: getComputedStyle(clock).fontSize };
  });
  await ctx.close(); return { r, errs };
};
(async () => {
  const browser = await chromium.launch();
  const auto = (await probe(browser, {})).r;
  ok("auto: current order preserved (clock and eyes side by side)", !!auto && Math.abs(auto.clock.cy - auto.eyes.cy) < 8 && auto.attr === "auto");
  const left = (await probe(browser, { clockPosition: "left" })).r, right = (await probe(browser, { clockPosition: "right" })).r;
  ok("left: clock sits physically left of the eyes", left.clock.cx < left.eyes.cx - 4, JSON.stringify(left));
  ok("right: clock sits physically right of the eyes", right.clock.cx > right.eyes.cx + 4, JSON.stringify(right));
  const top = (await probe(browser, { clockPosition: "top" })).r, bottom = (await probe(browser, { clockPosition: "bottom" })).r;
  ok("top: clock above the eyes, stacked and smaller", top.clock.cy < top.eyes.cy - 3 && parseFloat(top.fs) < parseFloat(auto.fs), JSON.stringify(top));
  ok("bottom: clock below the eyes", bottom.clock.cy > bottom.eyes.cy + 3, JSON.stringify(bottom));
  for (const [n, p] of [["top", top], ["bottom", bottom], ["left", left], ["right", right]]) ok(`${n}: nothing clipped (clock + eyes inside the pill)`, p.clock.t >= p.body.t - 1 && p.clock.b <= p.body.b + 1 && p.eyes.t >= p.body.t - 1 && p.eyes.b <= p.body.b + 1 && p.clock.l >= p.body.l && p.clock.r <= p.body.r, JSON.stringify(p));
  const small = (await probe(browser, { clockPosition: "top", pillHeight: 28 })).r;
  ok("pill too short to stack ⇒ falls back to horizontal (no clipping)", small.clock.cy >= small.eyes.cy - 8 && small.clock.cy <= small.eyes.cy + 8, JSON.stringify(small));
  const bad = await probe(browser, { clockPosition: "diagonal" });
  ok("unknown value ⇒ treated as auto, no errors", bad.r && bad.r.attr === "diagonal" && Math.abs(bad.r.clock.cy - bad.r.eyes.cy) < 8 && bad.errs.length === 0, JSON.stringify(bad.errs));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
})();
