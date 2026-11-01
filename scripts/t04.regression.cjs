// T04: الزجاج الأصلي لكل أسلوب. crystal/clear × داكن/فاتح: island_backdrop يُستدعى بالأسلوب، data-backdrop pending→win10، الجسم شفاف عند win10
// وشبه معتم (ألفا ≥ .9) عند pending/none/الاحتياط، ولا backdrop-filter في أي عنصر. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/t04.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
const alphaOf = (rgba) => { const m = rgba.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map((x) => parseFloat(x)); return p.length === 4 ? p[3] : 1; };
const SEQ = `(() => { window.__seq = []; const r = document.documentElement; const log = () => { const v = r.dataset.backdrop || "unset"; if (window.__seq[window.__seq.length - 1] !== v) window.__seq.push(v); }; new MutationObserver(log).observe(r, { attributes: true, attributeFilter: ["data-backdrop"] }); log(); })();`;
const mk = async (browser, cfg, settings, theme) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, themeMode: theme, themeMaterial: "glass", ...settings }, ...cfg }));
  await page.addInitScript(`document.addEventListener("DOMContentLoaded", () => { ${SEQ} });`);
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1500);
  return { ctx, page, errs };
};
const bg = (page) => page.evaluate(() => getComputedStyle(document.querySelector(".island-body")).backgroundColor);
const calls = (page) => page.evaluate(() => window.__calls.filter((c) => c[0] === "island_backdrop").map((c) => c[1]));
const noFilter = (page) => page.evaluate(() => [...document.querySelectorAll(".island-body, .island-body *")].filter((e) => { const cs = getComputedStyle(e); const f = cs.backdropFilter || cs.webkitBackdropFilter || "none"; return f !== "none"; }).length);

(async () => {
  const browser = await chromium.launch();
  for (const theme of ["dark", "light"]) for (const [gs, style, tint] of [["crystal", "frosted", 45], ["clear", "clear", 25]]) {
    const tag = `${gs}/${theme}`;
    const { ctx, page, errs } = await mk(browser, { backdrop: "win10" }, { glassStyle: gs, glassTint: tint }, theme);
    const c = await calls(page);
    ok(`${tag}: island_backdrop requested with glass=true and style="${style}"`, c.length >= 1 && c.some((x) => x.glass === true && x.style === style && x.light === (theme === "light")), JSON.stringify(c));
    const seq = await page.evaluate(() => window.__seq);
    ok(`${tag}: data-backdrop goes pending → win10 (never a flat "none" flash first)`, seq.includes("win10") && seq.indexOf("pending") >= 0 && seq.indexOf("pending") < seq.indexOf("win10") && !seq.slice(0, seq.indexOf("win10")).includes("none"), JSON.stringify(seq));
    ok(`${tag}: body transparent once acrylic is applied`, alphaOf(await bg(page)) === 0, await bg(page));
    ok(`${tag}: no element has a computed backdrop-filter`, (await noFilter(page)) === 0);
    ok(`${tag}: rim + spec highlight only (::before rim present, no ::after, no background-image)`, await page.evaluate(() => { const b = document.querySelector(".island-body"); return getComputedStyle(b, "::before").content !== "none" && getComputedStyle(b, "::after").content === "none" && getComputedStyle(b).backgroundImage === "none"; }));
    // الانتظار: سطح شبه معتم
    await page.evaluate(() => { document.documentElement.dataset.backdrop = "pending"; }); await page.waitForTimeout(400);
    const a1 = alphaOf(await bg(page));
    ok(`${tag}: pending surface is near-opaque (alpha ${a1} ≥ .9)`, a1 >= 0.9);
    await page.evaluate(() => { document.documentElement.dataset.backdrop = "none"; }); await page.waitForTimeout(400);
    const a2 = alphaOf(await bg(page));
    ok(`${tag}: none surface is near-opaque (alpha ${a2} ≥ .9)`, a2 >= 0.9);
    await page.evaluate(() => { document.documentElement.dataset.backdrop = "win10"; }); await page.waitForTimeout(400);
    ok(`${tag}: fades back to transparent`, alphaOf(await bg(page)) === 0);
    ok(`${tag}: no page errors`, errs.length === 0, errs.join("|"));
    await ctx.close();
  }

  // الدعم غير متوفر ("none" من Rust: ويندوز قديم/تأثيرات الشفافية مطفأة) ⇒ سطح شبه معتم دائم
  for (const theme of ["dark", "light"]) {
    const { ctx, page } = await mk(browser, { backdrop: "none" }, { glassStyle: "clear" }, theme);
    ok(`unsupported/transparency off (${theme}): data-backdrop=none and near-opaque surface`, (await page.evaluate(() => document.documentElement.dataset.backdrop)) === "none" && alphaOf(await bg(page)) >= 0.9, await bg(page));
    await ctx.close();
  }
  { const { ctx, page } = await mk(browser, { backdrop: "reject" }, { glassStyle: "crystal" }, "dark");
    ok("command rejects ⇒ none ⇒ near-opaque", (await page.evaluate(() => document.documentElement.dataset.backdrop)) === "none" && alphaOf(await bg(page)) >= 0.9);
    await ctx.close(); }
  // Eco / تقليل الشفافية ⇒ احتياط مصبوغ شبه معتم ولا طلب أكريليك
  { const { ctx, page } = await mk(browser, { backdrop: "win10", eco: true }, { glassStyle: "clear" }, "dark");
    const c = await calls(page);
    ok("eco: solid fallback, near-opaque, acrylic released (last request glass=false)", (await page.evaluate(() => document.documentElement.dataset.fallback)) === "solid" && alphaOf(await bg(page)) >= 0.9 && c[c.length - 1].glass === false, JSON.stringify(c));
    await ctx.close(); }
  // opacityRest = 80: الأكريليك يبقى مطبَّقًا
  { const { ctx, page } = await mk(browser, { backdrop: "win10" }, { glassStyle: "crystal", opacityRest: 80 }, "dark");
    const c = await calls(page);
    ok("opacityRest=80: acrylic still requested and applied", c.some((x) => x.glass === true) && (await page.evaluate(() => document.documentElement.dataset.backdrop)) === "win10");
    await ctx.close(); }
  // فتح/إغلاق اللوحة: لا وميض «none» (يمرّ بـpending فقط) وتعود win10 بعد الاستقرار
  { const { ctx, page } = await mk(browser, { backdrop: "win10" }, { glassStyle: "crystal", hoverDelayMs: 0 }, "dark");
    for (let n = 0; n < 3; n++) { await page.mouse.move(400, 10); await page.waitForTimeout(900); await page.mouse.click(400, 10); await page.waitForTimeout(1300); await page.mouse.move(10, 480); await page.waitForTimeout(1500); }
    const seq = await page.evaluate(() => window.__seq);
    ok(`3 open/close cycles: only pending/win10 (no "none" wash), ends on win10`, !seq.includes("none") && seq[seq.length - 1] === "win10" && seq.filter((x) => x === "pending").length >= 3, JSON.stringify(seq));
    await ctx.close(); }
  // تغيّر glassTint أو الأسلوب بنفس الهندسة: نداء بلا مسح
  { const { ctx, page } = await mk(browser, { backdrop: "win10" }, { glassStyle: "crystal", glassTint: 45 }, "dark");
    await page.evaluate(() => window.__emit("settings:changed", { glassTint: 70 })); await page.waitForTimeout(500);
    await page.evaluate(() => window.__emit("settings:changed", { glassStyle: "clear", glassTint: 25 })); await page.waitForTimeout(500);
    const c = await calls(page);
    ok("live tint/style change re-requests with the new style and tint (Rust updates the accent only)", c.some((x) => x.tint === 70 && x.style === "frosted") && c.some((x) => x.style === "clear" && x.tint === 25), JSON.stringify(c.slice(-3)));
    ok("…and never passes through glass=false (no clear → no flicker)", !c.slice(1).some((x) => x.glass === false), JSON.stringify(c));
    await ctx.close(); }
  // الإعدادات: أربع إعدادات مسبقة حقيقية + بطاقات الخلفية + لا منزلقي blur/saturation
  { const ctx = await browser.newContext({ viewport: { width: 880, height: 620 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en" } }));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(900);
    await page.locator('[data-nav="appearance"]').click(); await page.waitForTimeout(500);
    ok("exactly 4 presets: Frosted, Smoked, Clear, Minimal Dark", JSON.stringify(await page.locator("[data-preset]").allTextContents()) === JSON.stringify(["Frosted", "Smoked", "Clear", "Minimal Dark"]));
    ok("no Blur / Saturation sliders", (await page.getByRole("slider", { name: /blur|saturation/i }).count()) === 0);
    ok("tint slider has the one-line hint (Arabic first language switch → English here)", await page.evaluate(() => [...document.querySelectorAll(".st-row")].some((r) => /Glass tint/.test(r.textContent) && /Tint strength over the blur/.test(r.textContent))));
    ok("Background cards: Solid black / Frosted glass / Clear glass, previews without backdrop-filter", (await page.getByRole("radio", { name: /Frosted glass|Clear glass|Solid black/ }).count()) === 3 && await page.evaluate(() => [...document.querySelectorAll(".st-gprev, .st-gprev::before")].every((e) => (getComputedStyle(e).backdropFilter || "none") === "none")));
    await page.locator('[data-preset="smoked"]').click(); await page.waitForTimeout(200);
    const c = await page.evaluate(() => window.__calls.filter((x) => x[0] === "settings_set").map((x) => x[1].patch).filter((p) => p.glassTint === 68).pop());
    ok("Smoked preset ⇒ crystal, tint 68, no blur/saturation keys", !!c && c.glassStyle === "crystal" && c.glassTint === 68 && !("glassBlur" in c) && !("glassSaturation" in c), JSON.stringify(c));
    await ctx.close(); }

  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
