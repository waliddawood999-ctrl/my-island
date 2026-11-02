// واجهة التخصيص الشامل (Playwright + جسر وهمي): المعرض أولًا، المعاينات، تعيين حزمة للفاتح/الداكن، الوحدات السبع (ملخص/معاينة/إعادة ضبط)، مستويات الإفصاح،
// البحث، رفّ «ثيماتي»، تصدير/استيراد، محرر الرموز الخام بفحص تباين حي، وأثر المقابض على الجزيرة. تشغيل: npm run build && npx vite preview --port 4173 &  ثم  node scripts/themes.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };
(async () => {
  const browser = await chromium.launch();
  const mk = async (settings, vp = { width: 980, height: 700 }, page0) => {
    const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
    const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", settingsVersion: 4, themeMaterial: "glass", ...settings }, extra: { app_quit: null } }));
    const errs = []; page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(800);
    await page.locator('[data-nav="appearance"]').click(); await page.waitForTimeout(400);
    return { ctx, page, errs };
  };
  const calls = (page, n) => page.evaluate((c) => window.__calls.filter((x) => x[0] === c).map((x) => x[1]), n);
  const lastPatch = async (page, key) => (await calls(page, "settings_set")).filter((c) => c.patch && key in c.patch).pop()?.patch;

  // ── 1) المعرض أولًا + الوحدات بالترتيب الإلزامي
  { const { ctx, page, errs } = await mk({});
    const order = await page.evaluate(() => [...document.querySelector('[data-testid="appearance-body"]').children].map((e) => e.dataset.testid || e.dataset.mod || e.tagName.toLowerCase()));
    ok("gallery is the first block, before every module", order[0] === "theme-gallery" && order.indexOf("theme-gallery") < order.findIndex((x) => ["packs", "surfaces"].includes(x)), JSON.stringify(order));
    ok("modules appear in the mandated order (basic level: no behaviour module)", JSON.stringify(order.filter((x) => ["packs", "surfaces", "shape", "text", "feel", "behavior", "a11y"].includes(x))) === JSON.stringify(["packs", "surfaces", "shape", "text", "feel", "a11y"]), JSON.stringify(order));
    ok("gallery has live preview (expanded panel) + pinned split dark/light preview", (await page.locator(".tp-stage-main .tp-mini").count()) === 1 && (await page.getByTestId("split-preview").locator(".tp-mini").count()) === 2);
    const packs = await page.locator("button[data-pack]").count();
    ok(`gallery lists ≥21 factory packs (found ${packs})`, packs >= 21);
    ok("every module has icon + one-line summary + mini preview + reset", await page.evaluate(() => [...document.querySelectorAll(".tp-mod")].every((m) => m.querySelector(".st-row-tile svg") && m.querySelector(".tp-mod-sum")?.textContent.trim().length > 3 && m.querySelector(".tp-mod-prev") && m.querySelector('[data-testid^="reset-mod-"]'))));
    // معاينة الحزمة عند المرور وتطبيقها بالنقر
    const before = await page.locator(".tp-stage-name").textContent();
    await page.locator('button[data-pack="ember"]').hover(); await page.waitForTimeout(150);
    ok("hovering a pack previews it in the live stage (not applied)", (await page.locator(".tp-stage-name").textContent()) === "Ember" && before !== "Ember" && !(await lastPatch(page, "themePack")));
    await page.locator('button[data-pack="ember"]').click(); await page.waitForTimeout(150);
    ok("clicking a pack applies it (themePack=ember)", (await lastPatch(page, "themePack"))?.themePack === "ember");
    // تعيين منفصل للفاتح/الداكن
    await page.getByRole("combobox", { name: "Dark-mode pack" }).selectOption("carbon-fibre");
    await page.getByRole("combobox", { name: "Light-mode pack" }).selectOption("porcelain"); await page.waitForTimeout(150);
    ok("separate pack for dark and for light", (await lastPatch(page, "themePackDark"))?.themePackDark === "carbon-fibre" && (await lastPatch(page, "themePackLight"))?.themePackLight === "porcelain");
    // إعادة ضبط وحدة
    await page.getByTestId("reset-mod-surfaces").click(); await page.waitForTimeout(150);
    const rp = await lastPatch(page, "glassTint");
    ok("module reset restores that module's keys only (surfaces: material/veil/density/border/shadow + its tune fields)", rp && rp.themeMaterial === "glass" && rp.glassTint === 45 && rp.borderStrength === 50 && "themeTune" in rp && !("themePack" in rp) && !("fontScale" in rp), JSON.stringify(rp));
    ok("basic level hides advanced knobs (no 'Card radius', no per-surface overrides, no raw tokens)", (await page.getByRole("slider", { name: "Card radius" }).count()) === 0 && (await page.getByText("Surface: Pill", { exact: true }).count()) === 0 && (await page.getByLabel("--accent hex").count()) === 0);
    ok("no horizontal overflow at 980px", await page.evaluate(() => document.querySelector(".st-main").scrollWidth <= document.querySelector(".st-main").clientWidth + 1));
    await page.screenshot({ path: "docs/screenshots/settings-themes-gallery-en.png" });
    ok("no page errors (basic)", errs.length === 0, errs.join("|")); await ctx.close(); }

  // ── 2) المستويات: متقدم ثم خبير
  { const { ctx, page, errs } = await mk({});
    await page.getByRole("radio", { name: "Advanced" }).click(); await page.waitForTimeout(250);
    ok("level → saved as themeDisclosure=advanced", (await lastPatch(page, "themeDisclosure"))?.themeDisclosure === "advanced");
    await ctx.close(); }
  { const { ctx, page, errs } = await mk({ themeDisclosure: "advanced" });
    ok("advanced level shows tune knobs (Card radius, Pill scale, Icon size, per-surface overrides, Behavior module)", (await page.getByRole("slider", { name: "Card radius" }).count()) === 1 && (await page.getByRole("slider", { name: "Pill scale" }).count()) === 1 && (await page.getByRole("slider", { name: "Icon size" }).count()) === 1 && (await page.getByText("Surface: Pill", { exact: true }).count()) === 1 && (await page.locator('[data-mod="behavior"]').count()) === 1);
    ok("advanced does not open the raw token editor yet", (await page.getByLabel("--accent hex").count()) === 0);
    // مقبض ← themeTune مضغوط
    const sl = page.getByRole("slider", { name: "Icon size" }); await sl.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(250);
    const tp = await lastPatch(page, "themeTune");
    ok("a knob writes a compact themeTune (only non-default fields, clamped)", tp && tp.themeTune.iconScale === 1.1 && Object.keys(tp.themeTune).length === 1, JSON.stringify(tp));
    await page.getByRole("radio", { name: "Flat" }).click(); await page.waitForTimeout(150);
    ok("enum knob (elevation=flat) merges into themeTune", (await lastPatch(page, "themeTune"))?.themeTune.elevation === "flat");
    ok("no page errors (advanced)", errs.length === 0, errs.join("|")); await ctx.close(); }
  { const { ctx, page, errs } = await mk({ themeDisclosure: "expert" });
    ok("expert opens the raw token editor with live contrast checks", (await page.getByLabel("--accent hex").count()) === 1 && (await page.getByTestId("adjustments").count() + (await page.getByText("None — every colour passed as is").count())) >= 1);
    const hexIn = page.getByLabel("--island-fg hex"); await hexIn.fill("#2a2a2a"); await page.waitForTimeout(250);
    const t = await lastPatch(page, "themeTune");
    ok("raw token override saved (hex only) and flagged below the readability limit", t?.themeTune?.tokens?.["--island-fg"] === "#2a2a2a");
    await page.screenshot({ path: "docs/screenshots/settings-themes-expert-en.png", fullPage: false });
    ok("no page errors (expert)", errs.length === 0, errs.join("|")); await ctx.close(); }
  { const { ctx, page } = await mk({ themeDisclosure: "expert", themeMode: "dark", themeTune: { tokens: { "--island-fg": "#2a2a2a" } } });
    ok("a failing raw override shows ✗ in its row", (await page.locator('.st-row:has-text("--island-fg") .st-row-hint').textContent()).includes("✗"));
    await ctx.close(); }

  // ── 3) البحث داخل المظهر + الرفّ + التصدير/الاستيراد
  { const { ctx, page } = await mk({});
    await page.getByTestId("settings-search").fill("icon"); await page.waitForTimeout(350);
    const vis = await page.evaluate(() => [...document.querySelectorAll(".st-row:not([hidden]) .st-row-title")].filter((e) => e.offsetParent).map((e) => e.textContent));
    ok("search reaches advanced rows even at basic level (finds Icon size / Icon tint)", vis.includes("Icon size") && vis.includes("Icon tint"), JSON.stringify(vis));
    ok("searching hides the gallery and empty modules", (await page.getByTestId("theme-gallery").isHidden()) && (await page.evaluate(() => [...document.querySelectorAll(".tp-mod")].filter((m) => m.offsetParent).every((m) => m.querySelector(".st-row:not([hidden])")))));
    await page.getByTestId("settings-search").fill(""); await page.waitForTimeout(300);
    await page.getByLabel("Theme name").fill("My dusk"); await page.getByTestId("shelf-save").click(); await page.waitForTimeout(200);
    const sh = await lastPatch(page, "myThemes");
    ok("save current ⇒ shelf entry u:xxxxxx with the name, selected", sh && sh.myThemes.length === 1 && /^u:[a-z0-9]{6}$/.test(sh.myThemes[0].id) && sh.myThemes[0].name === "My dusk" && sh.themePack === sh.myThemes[0].id, JSON.stringify(sh));
    await ctx.close(); }
  { const { ctx, page } = await mk({ themeDisclosure: "advanced", myThemes: [{ id: "u:abc123", name: "Dusk", base: "ember", accent: "#ffab40" }], themePack: "u:abc123" });
    ok("shelf lists user themes with apply/delete; gallery shows them under My themes", (await page.locator('[data-shelf-apply="u:abc123"]').count()) === 1 && (await page.locator('button[data-pack="u:abc123"]').count()) === 1);
    await page.locator('[data-shelf-del="u:abc123"]').click(); await page.waitForTimeout(150);
    const dp = await lastPatch(page, "myThemes");
    ok("deleting the active user theme falls back to Obsidian", dp && dp.myThemes.length === 0 && dp.themePack === "obsidian", JSON.stringify(dp));
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 3000 }).catch(() => null), page.getByTestId("theme-export").click()]);
    ok("export theme downloads myisland-theme.json", !!dl && dl.suggestedFilename() === "myisland-theme.json");
    const good = JSON.stringify({ app: "myisland-theme", version: 1, theme: { themePack: "aurora", themeMode: "dark", glassTint: 999, evil: 1, themeTune: { pillScale: 9, press: "strong", bogus: 1 }, myThemes: [{ id: "u:zz1111", name: "X", wash: 99 }, { id: "../etc", name: "bad" }] } });
    await page.getByTestId("theme-import-file").setInputFiles({ name: "t.json", mimeType: "application/json", buffer: Buffer.from(good) }); await page.waitForTimeout(250);
    const ip = (await calls(page, "settings_set")).map((c) => c.patch).filter((p) => p && p.themePack === "aurora").pop();
    ok("import applies known keys clamped/sanitised (tint ≤80, tune clamped, bad shelf ids dropped, unknown keys ignored)", ip && ip.glassTint === 80 && ip.themeMode === "dark" && ip.themeTune.pillScale === 1.25 && ip.themeTune.press === "strong" && !("bogus" in ip.themeTune) && ip.myThemes.length === 1 && ip.myThemes[0].wash === 1 && !("evil" in ip), JSON.stringify(ip));
    await page.getByTestId("theme-import-file").setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from("{nope") }); await page.waitForTimeout(200);
    ok("garbage import is rejected with a message", (await page.getByText("Invalid theme file").count()) >= 1);
    await ctx.close(); }

  // ── 4) أثر المقابض على الجزيرة (الصفحة الرئيسية)
  { const ctx = await browser.newContext({ viewport: { width: 800, height: 400 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "en", settingsVersion: 4, themeMode: "dark", themeMaterial: "glass", eyesEnabled: false, hoverDelayMs: 0 } }));
    const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1200);
    const probe = () => page.evaluate(() => { const r = document.documentElement, b = document.querySelector(".island-body"), cs = getComputedStyle(b), rect = b.getBoundingClientRect(); return { w: Math.round(rect.width), h: Math.round(rect.height), shadowK: r.style.getPropertyValue("--shadow-k"), bg: cs.backgroundColor, iconK: r.style.getPropertyValue("--icon-k"), attrs: { ...r.dataset }, press: r.style.getPropertyValue("--press-btn"), cs: r.style.getPropertyValue("--corner-scale") }; });
    const a0 = await probe();
    await page.evaluate(() => window.__emit("settings:changed", { themeTune: { pillScale: 1.25, elevation: "flat", iconScale: 1.2, press: "strong", cornerK: 1.5, scroll: "smooth", highContrast: true, textWeight: "bold", iconTint: 40 } })); await page.waitForTimeout(500);
    const a1 = await probe();
    ok("pill scale 1.25 grows the pill (220→275 wide)", a1.w > a0.w * 1.2 && a1.w <= a0.w * 1.3, `${a0.w} → ${a1.w}`);
    ok("elevation flat ⇒ --shadow-k 0", a0.shadowK !== "0" && a1.shadowK === "0", `${a0.shadowK} → ${a1.shadowK}`);
    ok("icon scale / press / corner knobs reach CSS vars", a1.iconK === "1.2" && a1.press === "0.78" && a1.cs === "1.5", JSON.stringify({ iconK: a1.iconK, press: a1.press, cs: a1.cs }));
    ok("data attrs: smooth scroll, bold weight, high contrast, icon tint", a1.attrs.scroll === "smooth" && a1.attrs.weight === "bold" && a1.attrs.contrast === "high" && a1.attrs.iconTint === "on", JSON.stringify(a1.attrs));
    await page.evaluate(() => window.__emit("settings:changed", { themeTune: { veilPill: 0.5 } })); await page.waitForTimeout(500);
    const a2 = await probe(); const al = (c) => Number((c.match(/\/\s*([\d.]+)\)/) || [0, 1])[1]);
    ok("per-surface veil (pill 50%) halves the pill's surface opacity independently", al(a2.bg) < al(a0.bg) * 0.6 && al(a2.bg) > 0.2, `${a0.bg} → ${a2.bg}`);
    ok("island: no page errors", errs.length === 0, errs.join("|")); await ctx.close(); }

  // ── 5) العربية / RTL
  { const ctx = await browser.newContext({ viewport: { width: 980, height: 700 } }); const page = await ctx.newPage();
    await page.addInitScript(bridge({ settings: { language: "ar", settingsVersion: 4, themeDisclosure: "expert" }, extra: { app_quit: null } }));
    const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
    await page.goto(`${BASE}/settings.html`); await page.waitForTimeout(800);
    await page.locator('[data-nav="appearance"]').click(); await page.waitForTimeout(500);
    ok("Arabic: gallery title/modules in Arabic, rtl, no overflow", (await page.getByText("معرض الحزم").count()) === 1 && (await page.locator(".tp-mod").count()) === 7 && (await page.evaluate(() => document.querySelector(".st-main").scrollWidth <= document.querySelector(".st-main").clientWidth + 1)));
    await page.screenshot({ path: "docs/screenshots/settings-themes-gallery-ar.png" });
    ok("Arabic: no page errors", errs.length === 0, errs.join("|")); await ctx.close(); }

  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
