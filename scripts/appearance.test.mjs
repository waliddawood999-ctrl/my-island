// منطق المظهر الخالص: متغيرات CSS، الإعدادات المسبقة، الترحيل، الاستيراد/التصدير، وتباين WCAG للزجاج. node scripts/appearance.test.mjs
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "ap-")), "a.mjs");
await build({ entryPoints: ["src/appearance.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const a = await import(pathToFileURL(out).href);
let fail = 0;
const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : x}`); };

// ثيم
ok("system dark", a.resolveTheme("system", true) === "dark" && a.resolveTheme(undefined, false) === "light");
ok("explicit wins", a.resolveTheme("light", true) === "light" && a.resolveTheme("dark", false) === "dark");
// متغيرات
const env = { ...a.ENV_DEFAULT };
const v = a.appearanceVars({}, env);
ok("defaults: glass crystal, pill 220x34 r17", v.attrs.material === "glass" && v.attrs.glass === "crystal" && v.vars["--pill-width"] === "220px" && v.vars["--pill-height"] === "34px" && v.vars["--pill-radius"] === "17px", JSON.stringify(v));
ok("eco ⇒ solid fallback", a.appearanceVars({}, { ...env, eco: true }).attrs.fallback === "solid");
ok("reduced transparency ⇒ solid fallback", a.appearanceVars({}, { ...env, reducedTransparency: true }).attrs.material === "solid");
ok("explicit solid ⇒ no fallback flag", a.appearanceVars({ themeMaterial: "solid" }, env).attrs.fallback === "");
ok("pill clamped 160..280 / 28..44", (() => { const x = a.appearanceVars({ pillWidth: 9999, pillHeight: 1 }, env).vars; return x["--pill-width"] === "280px" && x["--pill-height"] === "28px"; })());
ok("pillRadius capped at h/2", a.appearanceVars({ pillHeight: 34, pillRadius: 22 }, env).vars["--pill-radius"] === "17px" && a.appearanceVars({ pillHeight: 40, pillRadius: 8 }, env).vars["--pill-radius"] === "8px");
ok("garbage numbers fall back", (() => { const x = a.appearanceVars({ fontScale: "x", motionSpeed: NaN, borderStrength: null }, env).vars; return x["--font-scale"] === "1" && x["--speed"] === "1" && x["--border-k"] === "1"; })());
ok("font scale + speed", (() => { const x = a.appearanceVars({ fontScale: 115, motionSpeed: 1.5 }, env).vars; return x["--font-scale"] === "1.15" && x["--speed"] === "1.5"; })());
// الحركة
ok("reduceMotion/OS ⇒ reduced; off stays off", a.effectiveMotion({ reduceMotion: true }, env) === "reduced" && a.effectiveMotion({}, { ...env, osReducedMotion: true }) === "reduced" && a.effectiveMotion({ motionLevel: "off", reduceMotion: true }, env) === "off");
// لون التمييز
ok("accent invalid ⇒ default; fg readable", (() => { const x = a.accentVars("zzz", "dark"); return x.accent === "#4fd1c5" && ["#ffffff", "#06080c"].includes(x.accentFg); })());
ok("light accent darkened to ≥3:1 on light surface", (() => { const x = a.accentVars("#ffb224", "light"); const c = [1, 3, 5].map((i) => parseInt(x.accent.slice(i, i + 2), 16)); return a.contrast(c, [236, 239, 244]) >= 3; })());
// إعدادات مسبقة
ok("4 presets with expected ids", a.STYLE_PRESETS.map((p) => p.id).join() === "frosted,smoked,clear,minimal");
ok("presets never set blur/saturation", a.STYLE_PRESETS.every((p) => !("glassBlur" in p.values) && !("glassSaturation" in p.values)));
// ترحيل
ok("migrate v0: shrunken pill reset, crystal added, version 2", (() => { const m = a.migrateSettings({ pillWidth: 180, pillHeight: 30 }); return m.pillWidth === 220 && m.pillHeight === 34 && m.glassStyle === "crystal" && m.settingsVersion === 4; })());
ok("migrate keeps larger pill", (() => { const m = a.migrateSettings({ pillWidth: 260, pillHeight: 40, glassStyle: "clear" }); return !("pillWidth" in m) && !("pillHeight" in m) && !("glassStyle" in m); })());
ok("migrate v4 ⇒ nothing", Object.keys(a.migrateSettings({ settingsVersion: 4, pillWidth: 100 })).length === 0);
ok("migrate v3→4: custom accent kept as accentSource=custom; default teal untouched; explicit source respected", (() => { const m = a.migrateSettings({ settingsVersion: 3, accentColor: "#ff6b5e" }); const d = a.migrateSettings({ settingsVersion: 3, accentColor: "#4fd1c5" }); const x = a.migrateSettings({ settingsVersion: 3, accentColor: "#ff6b5e", accentSource: "windows" }); return m.accentSource === "custom" && m.settingsVersion === 4 && !("accentSource" in d) && !("accentSource" in x); })());
// تصدير/استيراد
ok("export→import round-trip", (() => { const s = { pillWidth: 240, language: "en", clipExcludedApps: ["a.exe"] }; const p = a.parseImport(a.exportSettings(s), s); return p.pillWidth === 240 && p.clipExcludedApps[0] === "a.exe"; })());
ok("import rejects wrong app/garbage", a.parseImport("{}", {}) === null && a.parseImport("nope", {}) === null && a.parseImport('{"app":"x","settings":{}}', {}) === null);
ok("import drops unknown keys and wrong types", (() => { const p = a.parseImport(JSON.stringify({ app: "myisland", settings: { pillWidth: "big", evil: 1, density: "compact" } }), { pillWidth: 220, density: "comfortable" }); return !("pillWidth" in p) && !("evil" in p) && p.density === "compact"; })());
// خريطة الأقسام: لا تكرار
ok("no key in two sections", (() => { const all = Object.values(a.SECTION_KEYS).flat(); return new Set(all).size === all.length; })(), (() => { const all = Object.values(a.SECTION_KEYS).flat(); return all.filter((k, i) => all.indexOf(k) !== i).join(); })());
ok("resetPatch gives a value for every section key", Object.values(a.SECTION_KEYS).flat().every((k) => k in a.resetPatch([k]) && a.resetPatch([k])[k] !== undefined), Object.values(a.SECTION_KEYS).flat().filter((k) => a.resetPatch([k])[k] === undefined).join());
// تباين الزجاج المُحاكى WCAG: النص فوق السطح المركّب = لون الحجاب (glassSurface) بعتمته glassAlpha فوق الخلفية.
//  لا تمويه ⇒ ما خلف الحجاب يظهر بحدّته، فنقيس الحالات: أسوأ خلفية (أبيض نقيّ في الداكن / أسود نقيّ في الفاتح) وخلفية متوسطة.
//  · Frosted (45) وSmoked (68): ≥ 4.5 فوق أسوأ خلفية وفوق المتوسط.
//  · Clear (25): حجاب أخفّ مقصود ⇒ ≥ 4.5 فوق خلفية متوسطة؛ الأسوأ يُقاس للتقرير فقط (بلا ادّعاء AA عليه).
const TEXT = { dark: [255, 255, 255], light: [13, 16, 23] };
const worst = { dark: [255, 255, 255], light: [0, 0, 0] };
const mid = [128, 128, 128];
const cases = [["crystal", 45], ["crystal", 68], ["clear", 25]];
for (const theme of ["dark", "light"]) for (const [style, tint] of cases) {
  const sf = a.glassSurface(style, theme, tint);
  const cw = a.contrast(TEXT[theme], a.over([...sf.color, sf.alpha], worst[theme]));
  const cm = a.contrast(TEXT[theme], a.over([...sf.color, sf.alpha], mid));
  console.log(`  [report] ${style}/${theme}/tint${tint}: alpha ${sf.alpha} worst ${cw.toFixed(2)} mid ${cm.toFixed(2)}`);
  if (style === "crystal") ok(`contrast frosted/${theme}/tint${tint}: worst backdrop ${cw.toFixed(2)} ≥ 4.5, mid ${cm.toFixed(2)}`, cw >= 4.5 && cm >= 4.5);
  else ok(`contrast clear/${theme}/tint${tint}: mid backdrop ${cm.toFixed(2)} ≥ 4.5 (extreme worst case ${cw.toFixed(2)} reported, not claimed)`, cm >= 4.5);
}
ok("glassAlpha anchors: crystal 45 = .78/.82 (±.005), clear 25 = .60/.64", [a.glassAlpha("crystal", false, 45) - 0.78, a.glassAlpha("crystal", true, 45) - 0.82, a.glassAlpha("clear", false, 25) - 0.6, a.glassAlpha("clear", true, 25) - 0.64].every((d) => Math.abs(d) < 0.005));
ok("glassAlpha monotonic in tint, clear < crystal, cap .97, density scales, garbage safe", (() => {
  for (const style of ["crystal", "clear"]) for (const light of [false, true]) { let prev = -1; for (let t = 0; t <= 80; t++) { const v = a.glassAlpha(style, light, t); if (!(v >= prev) || v > 0.97) return false; prev = v; } }
  return a.glassAlpha("clear", false, 45) < a.glassAlpha("crystal", false, 45) && a.glassAlpha("crystal", false, 45, 0.5) < a.glassAlpha("crystal", false, 45) * 0.55 && Number.isFinite(a.glassAlpha("crystal", false, NaN, "x"));
})());
ok("appearanceVars exposes --glass-a (and no --glass-blur/saturate)", (() => { const v = a.appearanceVars({ glassTint: 45 }, a.ENV_DEFAULT).vars; return Math.abs(Number(v["--glass-a"]) - 0.779) < 0.002 && !("--glass-blur" in v) && !("--glass-saturate" in v); })());
ok("Windows transparency off ⇒ solid fallback (opaque surface)", (() => { const r = a.appearanceVars({}, { ...a.ENV_DEFAULT, transparency: false }); return r.attrs.fallback === "solid" && r.attrs.material === "solid"; })());
ok("veil base is accent-independent (the accent enters only as the wash layer)", (() => { const t = a.glassSurface("crystal", "dark", 45, "#4fd1c5"), c = a.glassSurface("crystal", "dark", 45, "#ff6b5e"); return t.color.join() === c.color.join(); })());
ok("pack selection: per-mode pack wins, else global, else default", a.chosenPackId({ themePackDark: "x", themePack: "y" }, "dark") === "x" && a.chosenPackId({ themePackDark: "x", themePack: "y" }, "light") === "y" && a.chosenPackId({}, "dark") === "obsidian");
ok("accent source: pack ⇒ none, custom ⇒ accentColor, windows/wallpaper use fetched value and fall back silently", (() => { const e = { ...a.ENV_DEFAULT, winAccent: "#0078d4", wallpaperAccent: null }; return a.accentOverride({}, e) === undefined && a.accentOverride({ accentSource: "custom", accentColor: "#ff6b5e" }, e) === "#ff6b5e" && a.accentOverride({ accentSource: "windows" }, e) === "#0078d4" && a.accentOverride({ accentSource: "wallpaper" }, e) === undefined; })());
ok("theme mode sun: 06–18 light, else dark; system ignores hour", a.resolveTheme("sun", true, 12) === "light" && a.resolveTheme("sun", false, 22) === "dark" && a.resolveTheme("sun", true, 5.9) === "dark" && a.resolveTheme("system", true, 12) === "dark");
ok("appearanceVars carries the derived palette (accent, --t-wash-img, --glass-base) and data-pack", (() => { const r = a.appearanceVars({}, a.ENV_DEFAULT); return r.attrs.pack === "obsidian" && /^#[0-9a-f]{6}$/.test(r.vars["--accent"]) && r.vars["--t-wash-img"].includes("gradient") && r.vars["--glass-base"].startsWith("rgb("); })());
ok("Eco kills the glow", Number(a.appearanceVars({}, { ...a.ENV_DEFAULT, eco: true }).vars["--t-glow-a"]) === 0 && Number(a.appearanceVars({}, a.ENV_DEFAULT).vars["--t-glow-a"]) > 0);
ok("deriveFor: Living Artwork without media falls back to Obsidian (data-pack reports the effective pack); with swatches it is itself", (() => { const sw = { vibrant: "#ff7a14", darkMuted: "#2a2438", muted: "#6a6480", avg: "#403850" }; const x = a.deriveFor({ themePack: "living-artwork" }, a.ENV_DEFAULT), y = a.deriveFor({ themePack: "living-artwork" }, { ...a.ENV_DEFAULT, artwork: sw }); return x.packId === "obsidian" && y.packId === "living-artwork" && x.derived.vars["--accent"] !== y.derived.vars["--accent"]; })());
ok("deriveFor: separate packs for dark and light", (() => { const s = { themePackDark: "ember", themePackLight: "porcelain" }; return a.deriveFor(s, { ...a.ENV_DEFAULT, systemDark: true }).packId === "ember" && a.deriveFor(s, { ...a.ENV_DEFAULT, systemDark: false }).packId === "porcelain"; })());
ok("deriveFor: accent source custom/windows override the pack accent but still pass WCAG", (() => { const c = a.deriveFor({ accentSource: "custom", accentColor: "#ffe600" }, { ...a.ENV_DEFAULT, systemDark: false }); const w = a.deriveFor({ accentSource: "windows" }, { ...a.ENV_DEFAULT, winAccent: "#0078d4" }); return c.derived.measures.every((m) => m.ok) && w.derived.measures.every((m) => m.ok) && c.derived.adjustments.some((x) => x.token === "accent"); })());
console.log(fail ? `FAILED ${fail}` : "ALL PASSED");
process.exit(fail ? 1 : 0);
