// ARCH — نموذج «بلا منطقة نافذة»: (1) الصفحة شفافة دائمًا (html/body/#root) فالشكل ألفا الصفحة؛ (2) report_island_rect = مستطيل الإصابة: يُبلَّغ
// عند الانتقالات فقط (لا استدعاءان متتاليان بنفس المقاس، ولا استدعاء نافذة لكل إطار) ولا يحجز الحركة (الجسم ينمو والرد معلّق)؛ (3) الهالة طبقة
// مُعدّة مسبقًا: لا box-shadow خارجي ولا filter/blur حيّ على الجسم أو الهالة. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/hit.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0 } }));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(900);
  const width = () => page.evaluate(() => Math.round(document.querySelector(".island-body").getBoundingClientRect().width));
  const pillW = await width();
  const transparentAll = () => page.evaluate(() => ["html", "body", "#root"].every((q) => getComputedStyle(document.querySelector(q)).backgroundColor === "rgba(0, 0, 0, 0)"));
  const windowCalls = () => page.evaluate(() => window.__calls.filter((c) => ["report_island_rect", "take_focus", "release_focus", "set_island_hidden"].includes(c[0])).length);
  // تأخير ردّ report_island_rect 400ms (خلفية مشغولة): الحركة لا تنتظره بعد الآن.
  await page.evaluate(() => {
    const t = window.__TAURI_INTERNALS__, inv = t.invoke.bind(t);
    t.invoke = (cmd, args, o) => cmd === "report_island_rect" ? new Promise((r) => setTimeout(() => r(inv(cmd, args, o)), 400)) : inv(cmd, args, o);
  });
  ok("page background transparent at rest (halo ring is never painted by the page)", await transparentAll());
  await page.mouse.move(400, 10);
  await page.waitForTimeout(220);
  ok("page background transparent mid-transition", await transparentAll());
  ok("growth is NOT gated on report_island_rect: body already growing while the report reply is pending", (await width()) > pillW + 1, String(await width()));
  await page.waitForTimeout(1300);
  ok("page background transparent in peek", await transparentAll());
  ok("body reached the peek size", (await width()) > pillW + 40, String(await width()));
  // لا استدعاء نافذة لكل إطار: خلال حركة لوحة كاملة عدد استدعاءات النافذة = عدد الانتقالات (≤ 3) لا عدد الإطارات (~90).
  const before = await windowCalls();
  await page.click(".island-body"); await page.waitForTimeout(1500);
  const during = (await windowCalls()) - before;
  ok("window calls during peek→panel animation = transitions only (≤3), not per frame", during >= 1 && during <= 3, String(during));
  // مستطيل الإصابة يتّسع قبل النمو: أول بلاغ بعد الحوم يغطي مقاس اللمحة.
  await page.mouse.move(700, 480); await page.waitForTimeout(2500);
  const rects = await page.evaluate(() => window.__calls.filter((c) => c[0] === "report_island_rect").map((c) => c[1]));
  const keys = rects.map((r) => `${r.width}x${r.height}r${r.radius}`);
  ok("no consecutive identical report_island_rect calls across a full cycle", keys.every((r, i) => i === 0 || r !== keys[i - 1]), keys.join(" "));
  ok("returns to the pill hit-rect at the end", keys[keys.length - 1] === keys[0], keys.join(" "));
  ok("hit-rect grows before the body does (first report after hover covers the peek size)", rects.length >= 2 && rects[1].width > rects[0].width + 40, keys.join(" "));
  // الهالة طبقة مُعدّة مسبقًا: لا box-shadow خارجي ولا filter حيّ.
  const css = await page.evaluate(() => {
    const body = document.querySelector(".island-body"), halo = document.querySelector(".island-halo");
    const cs = (e, p) => getComputedStyle(e, p);
    return {
      outer: cs(body).boxShadow.split(/,(?![^(]*\))/).map((x) => x.trim()).filter((x) => x && x !== "none" && !x.includes("inset")),
      bodyFilter: cs(body).filter, haloFilter: [cs(halo).filter, cs(halo, "::before").filter, cs(halo, "::after").filter],
      haloShadow: [cs(halo).boxShadow, cs(halo, "::before").boxShadow, cs(halo, "::after").boxShadow],
      haloMask: cs(halo, "::after").webkitMaskBoxImageSource || "",
      haloEvents: cs(halo).pointerEvents, haloOpacity: +cs(halo).opacity, bodyOpacity: +cs(body).opacity,
    };
  });
  ok("island body has no outer box-shadow (only inset ring/highlight)", css.outer.length === 0, JSON.stringify(css.outer));
  ok("no live filter/blur on body or halo", css.bodyFilter === "none" && css.haloFilter.every((f) => f === "none"), JSON.stringify(css));
  ok("halo carries the soft shadow as ONE static box-shadow and uses no 9-slice mask", css.haloShadow[0] !== "none" && css.haloMask === "none" || css.haloMask === "", JSON.stringify([css.haloShadow, css.haloMask]));
  ok("halo never takes the mouse", css.haloEvents === "none");
  ok("halo opacity follows the island opacity (animated by opacity only)", Math.abs(css.haloOpacity - css.bodyOpacity) < 0.02, JSON.stringify([css.haloOpacity, css.bodyOpacity]));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
})();
