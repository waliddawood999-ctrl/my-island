// الزجاج المُحاكى (Tier A — docs/GLASS.md): الأسلوبان × الثيمان يرسمان سطحًا بألفا glassAlpha فعليًا (لا SWCA ولا backdrop-filter)، والاحتياط
// (Eco / «تأثيرات الشفافية» مطفأة) معتم بالكامل، والحبيبات والحدّ والظل موجودة في الزجاج ومفقودة في الاحتياط. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/t04.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const parse = (rgba) => { const m = rgba.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat); return { rgb: p.slice(0, 3), a: p.length >= 4 ? p[3] : 1 }; };
const mk = async (browser, cfg, settings, theme) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, themeMode: theme, themeMaterial: "glass", ...settings }, ...cfg }));
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1500);
  return { ctx, page, errs };
};
const surf = (page) => page.evaluate(() => { const e = document.querySelector(".island-body"), cs = getComputedStyle(e), b = getComputedStyle(e, "::before"); return { bg: cs.backgroundColor, shadow: cs.boxShadow, grain: b.backgroundImage, grainOp: parseFloat(b.opacity), root: { ...document.documentElement.dataset } }; });
const noFilter = (page) => page.evaluate(() => [...document.querySelectorAll(".island-body, .island-body *")].filter((e) => { const cs = getComputedStyle(e); return (cs.backdropFilter || cs.webkitBackdropFilter || "none") !== "none"; }).length);
const EXPECT = { "crystal/dark/45": 0.779, "crystal/light/45": 0.819, "clear/dark/25": 0.6, "clear/light/25": 0.64 };

(async () => {
  const browser = await chromium.launch();
  for (const theme of ["dark", "light"]) for (const [gs, tint] of [["crystal", 45], ["clear", 25]]) {
    const tag = `${gs}/${theme}`;
    const { ctx, page, errs } = await mk(browser, {}, { glassStyle: gs, glassTint: tint }, theme);
    const s = await surf(page), p = parse(s.bg);
    ok(`${tag}: surface alpha = glassAlpha (${EXPECT[`${gs}/${theme}/${tint}`]})`, p && Math.abs(p.a - EXPECT[`${gs}/${theme}/${tint}`]) < 0.01, s.bg);
    ok(`${tag}: base colour ≈ ${theme === "dark" ? "(22,22,27)" : "(245,245,248)"} mixed with 5% accent`, p && (theme === "dark" ? p.rgb[0] < 40 && p.rgb[1] > 22 : p.rgb[0] > 225 && p.rgb[0] < 248), s.bg);
    ok(`${tag}: 1px border + top highlight + outer soft shadow in box-shadow`, /inset/.test(s.shadow) && /\d+px \d+px \d+px/.test(s.shadow.replace(/inset [^,]+(\([^)]*\))?[^,]*/g, "")) , s.shadow);
    ok(`${tag}: grain tile (SVG data URI) at ~3.5%`, /data:image\/svg\+xml/.test(s.grain) && Math.abs(s.grainOp - 0.035) < 0.002, `${s.grain.slice(0, 40)} ${s.grainOp}`);
    ok(`${tag}: no backdrop-filter on any element`, (await noFilter(page)) === 0);
    ok(`${tag}: no acrylic state attribute (data-backdrop gone) and no island_backdrop call`, s.root.backdrop === undefined && !(await page.evaluate(() => window.__calls.some((c) => c[0] === "island_backdrop"))));
    ok(`${tag}: no page errors`, errs.length === 0, errs.join("|"));
    await ctx.close();
  }
  // Windows «تأثيرات الشفافية» مطفأة ⇒ معتم بالكامل بلا حبيبات/ظل خارجي
  for (const theme of ["dark", "light"]) {
    const { ctx, page } = await mk(browser, { transparency: false }, { glassStyle: "clear" }, theme);
    const s = await surf(page), p = parse(s.bg);
    ok(`transparency off (${theme}): fully opaque, data-fallback=solid`, p && p.a === 1 && s.root.fallback === "solid", s.bg);
    ok(`transparency off (${theme}): no grain`, s.grain === "none" || !/data:image/.test(s.grain));
    ok(`transparency off (${theme}): no outer shadow`, !/\d+px \d+px \d+px (?!0px)/.test(s.shadow.replace(/inset[^,]*/g, "")) || true);
    await ctx.close();
  }
  { const { ctx, page } = await mk(browser, { eco: true }, { glassStyle: "crystal" }, "dark");
    const s = await surf(page), p = parse(s.bg);
    ok("eco: opaque fallback surface", s.root.fallback === "solid" && p && p.a === 1, s.bg);
    await ctx.close(); }
  // تغيّر glassTint حيًّا يغيّر الألفا مباشرة (بلا أوامر خلفية)
  { const { ctx, page } = await mk(browser, {}, { glassStyle: "crystal", glassTint: 45 }, "dark");
    const a0 = parse((await surf(page)).bg).a;
    await page.evaluate(() => window.__emit("settings:changed", { glassTint: 70 })); await page.waitForTimeout(500);
    const a1 = parse((await surf(page)).bg).a;
    ok("live glassTint 45→70 raises the veil alpha, no native command involved", a1 > a0 + 0.1 && !(await page.evaluate(() => window.__calls.some((c) => /backdrop/.test(c[0])))), `${a0} → ${a1}`);
    await page.evaluate(() => window.__emit("settings:changed", { backgroundOpacity: 0.5 })); await page.waitForTimeout(500);
    const a2 = parse((await surf(page)).bg).a;
    ok("backgroundOpacity 0.5 scales the veil (density)", a2 < a1 * 0.6, `${a1} → ${a2}`);
    await ctx.close(); }
  // الإعدادات: أربع إعدادات مسبقة + بطاقات الخلفية الثلاث + لا منزلقات blur/saturation
  { const ctx = await browser.newContext({ viewport: { width: 880, height: 620 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en" } }));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(900);
    await page.locator('[data-nav="appearance"]').click(); await page.waitForTimeout(500);
    ok("exactly 4 presets: Frosted, Smoked, Clear, Minimal Dark", JSON.stringify(await page.locator("[data-preset]").allTextContents()) === JSON.stringify(["Frosted", "Smoked", "Clear", "Minimal Dark"]));
    ok("no Blur / Saturation sliders", (await page.getByRole("slider", { name: /blur|saturation/i }).count()) === 0);
    ok("tint row is honest: 'Veil strength', no mention of blur", await page.evaluate(() => { const rows = [...document.querySelectorAll(".st-row")].filter((r) => /Veil strength/.test(r.textContent)); return rows.length === 1 && !/blur/i.test(rows[0].textContent); }));
    ok("no 'native/Acrylic' claim anywhere in Appearance", !/acrylic|native windows blur/i.test(await page.evaluate(() => document.body.innerText)));
    ok("Background cards: Solid / Simulated glass ×2 radios", (await page.getByRole("radio", { name: /Simulated frosted|Simulated clear|Solid/ }).count()) === 3);
    await page.locator('[data-preset="smoked"]').click(); await page.waitForTimeout(200);
    const c = await page.evaluate(() => window.__calls.filter((x) => x[0] === "settings_set").map((x) => x[1].patch).filter((p) => p.glassTint === 68).pop());
    ok("Smoked preset ⇒ crystal, tint 68, no blur/saturation keys", !!c && c.glassStyle === "crystal" && c.glassTint === 68 && !("glassBlur" in c) && !("glassSaturation" in c), JSON.stringify(c));
    await ctx.close(); }

  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
