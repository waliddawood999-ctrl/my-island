// الساعة والعيون في الحبة المنكمشة: موضع حرّ بنسبتين (يمين/يسار/أي مكان) بلا قصّ، حجم الساعة، موضع العيون (يسار/وسط/يمين)، والتلقائي لا يتغيّر؛
// + لوحة الدائرة في الإعدادات (سحب ⇒ clockPosition=free + clockX/clockY). تشغيل:
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
    const clock = document.querySelector('[data-testid="pill-clock"]'), body = document.querySelector(".island-body");
    if (!clock) return null;
    const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2, w: b.width }; };
    const eyes = document.querySelector('[data-testid="pill-row"]')?.firstElementChild || clock.parentElement?.querySelector("svg, [data-eyes]") || null;
    return { clock: R(clock), body: R(body), eyes: eyes ? R(eyes) : null, fs: parseFloat(getComputedStyle(clock).fontSize) };
  });
  await ctx.close(); return { r, errs };
};
const inside = (p) => p.clock.l >= p.body.l - 1 && p.clock.r <= p.body.r + 1 && p.clock.t >= p.body.t - 1 && p.clock.b <= p.body.b + 1;
(async () => {
  const browser = await chromium.launch();
  const auto = (await probe(browser, {})).r;
  ok("auto: untouched current layout (clock beside the eyes, centered in the pill)", !!auto && !!auto.eyes && Math.abs(auto.clock.cy - auto.eyes.cy) < 8 && Math.abs(((auto.clock.cx + auto.eyes.cx) / 2) - auto.body.cx) < 30);
  // ── موضع حرّ
  const mk = (x, y, extra = {}) => probe(browser, { clockPosition: "free", clockX: x, clockY: y, ...extra }).then((v) => v.r);
  const left = await mk(10, 50), right = await mk(90, 50), mid = await mk(50, 50), top = await mk(50, 0), bot = await mk(50, 100);
  ok("free x=10: the clock sits near the left of the pill", left.clock.cx < left.body.l + left.body.w * 0.3, JSON.stringify(left.clock));
  ok("free x=90: the clock sits near the right of the pill", right.clock.cx > right.body.l + right.body.w * 0.7, JSON.stringify(right.clock));
  ok("free x=50,y=50: centered", Math.abs(mid.clock.cx - mid.body.cx) < 3 && Math.abs(mid.clock.cy - mid.body.cy) < 3, JSON.stringify(mid.clock));
  ok("free y=0 / y=100: against the top / bottom edge, never outside", top.clock.t >= top.body.t - 1 && bot.clock.b <= bot.body.b + 1 && top.clock.cy < mid.clock.cy && bot.clock.cy > mid.clock.cy);
  for (const [n, p] of [["left", left], ["right", right], ["top", top], ["bottom", bot]]) ok(`free ${n}: clock fully inside the pill`, inside(p), JSON.stringify([p.clock, p.body]));
  const lo = await mk(-40, 300), nan = await mk("x", null);
  ok("out-of-range or invalid coordinates are clamped (stay inside)", inside(lo) && inside(nan), JSON.stringify([lo.clock, nan.clock]));
  // ── الحجم
  const big = (await probe(browser, { clockScale: 160 })).r, small = (await probe(browser, { clockScale: 70 })).r;
  ok("clock size: 160% is larger and 70% smaller than the base", big.fs > auto.fs * 1.4 && small.fs < auto.fs * 0.8, `${small.fs} ${auto.fs} ${big.fs}`);
  const bigFree = await mk(90, 50, { clockScale: 180 });
  ok("big clock at the right edge still stays inside the pill", inside(bigFree), JSON.stringify([bigFree.clock, bigFree.body]));
  // ── العيون
  const eyeAt = async (a, extra = {}) => { const p = (await probe(browser, { eyesAlign: a, ...extra })).r; return p; };
  const eL = await eyeAt("left", { clockPosition: "free", clockX: 50, clockY: 50 }), eR = await eyeAt("right", { clockPosition: "free", clockX: 50, clockY: 50 });
  const eyeBox = await (async () => { const out = {}; for (const a of ["left", "center", "right"]) { const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } }); const pg = await ctx.newPage(); await pg.addInitScript(bridge({ settings: { language: "en", settingsVersion: 3, eyesEnabled: true, clockPosition: "free", clockX: 50, clockY: 90, eyesAlign: a } })); await pg.goto(`${BASE}/index.html`); await pg.waitForTimeout(900); out[a] = await pg.evaluate(() => { const c = document.querySelector('[data-testid="pill-clock"]'); const row = c.previousElementSibling; const b = row.firstElementChild.getBoundingClientRect(), body = document.querySelector(".island-body").getBoundingClientRect(); return { cx: (b.left + b.right) / 2, l: b.left, r: b.right, bl: body.left, br: body.right, bcx: (body.left + body.right) / 2 }; }); await ctx.close(); } return out; })();
  ok("eyes left: at the left edge of the pill", eyeBox.left.cx < eyeBox.left.bl + (eyeBox.left.br - eyeBox.left.bl) * 0.25, JSON.stringify(eyeBox.left));
  ok("eyes center: centered", Math.abs(eyeBox.center.cx - eyeBox.center.bcx) < 6, JSON.stringify(eyeBox.center));
  ok("eyes right: at the right edge of the pill", eyeBox.right.cx > eyeBox.right.br - (eyeBox.right.br - eyeBox.right.bl) * 0.25, JSON.stringify(eyeBox.right));
  ok("eyes stay inside the pill at both edges", eyeBox.left.l >= eyeBox.left.bl - 1 && eyeBox.right.r <= eyeBox.right.br + 1);
  void eL; void eR;
  const noEyes = await probe(browser, { eyesEnabled: false, clockPosition: "free", clockX: 80, clockY: 50 });
  ok("eyes off: the free clock still follows its position", noEyes.r && noEyes.r.clock.cx > noEyes.r.body.cx + 20 && noEyes.errs.length === 0, JSON.stringify(noEyes.errs));
  // ── الإعدادات: لوحة الدائرة
  const ctx = await browser.newContext({ viewport: { width: 880, height: 700 } });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.addInitScript(bridge({ settings: { language: "en", settingsVersion: 3 } }));
  await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(800);
  await page.locator('[data-nav="island"]').click(); await page.waitForTimeout(500);
  const pad = page.getByTestId("clock-pad"); await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.25, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
  const patches = await page.evaluate(() => window.__calls.filter((c) => c[0] === "settings_set").map((c) => c[1].patch));
  const last = patches.filter((p) => p && p.clockPosition === "free").pop();
  ok("dragging the dot saves clockPosition=free with right/top percentages", !!last && last.clockX > 65 && last.clockY < 40, JSON.stringify(last));
  await page.getByTestId("clock-auto").click(); await page.waitForTimeout(200);
  ok("'Auto' restores the current layout setting", (await page.evaluate(() => window.__calls.filter((c) => c[0] === "settings_set").map((c) => c[1].patch).filter((p) => p && p.clockPosition === "auto").length)) >= 1);
  await pad.focus(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
  ok("keyboard arrows move the dot (accessible)", (await page.evaluate(() => window.__calls.filter((c) => c[0] === "settings_set").map((c) => c[1].patch).filter((p) => p && p.clockPosition === "free").length)) >= 2);
  ok("settings: no page errors", errs.length === 0, errs.join("|"));
  await ctx.close();
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
})();
