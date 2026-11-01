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
ok("migrate v0: shrunken pill reset, crystal added, version 2", (() => { const m = a.migrateSettings({ pillWidth: 180, pillHeight: 30 }); return m.pillWidth === 220 && m.pillHeight === 34 && m.glassStyle === "crystal" && m.settingsVersion === 3; })());
ok("migrate keeps larger pill", (() => { const m = a.migrateSettings({ pillWidth: 260, pillHeight: 40, glassStyle: "clear" }); return !("pillWidth" in m) && !("pillHeight" in m) && !("glassStyle" in m); })());
ok("migrate v3 ⇒ nothing", Object.keys(a.migrateSettings({ settingsVersion: 3, pillWidth: 100 })).length === 0);
// تصدير/استيراد
ok("export→import round-trip", (() => { const s = { pillWidth: 240, language: "en", clipExcludedApps: ["a.exe"] }; const p = a.parseImport(a.exportSettings(s), s); return p.pillWidth === 240 && p.clipExcludedApps[0] === "a.exe"; })());
ok("import rejects wrong app/garbage", a.parseImport("{}", {}) === null && a.parseImport("nope", {}) === null && a.parseImport('{"app":"x","settings":{}}', {}) === null);
ok("import drops unknown keys and wrong types", (() => { const p = a.parseImport(JSON.stringify({ app: "myisland", settings: { pillWidth: "big", evil: 1, density: "compact" } }), { pillWidth: 220, density: "comfortable" }); return !("pillWidth" in p) && !("evil" in p) && p.density === "compact"; })());
// خريطة الأقسام: لا تكرار
ok("no key in two sections", (() => { const all = Object.values(a.SECTION_KEYS).flat(); return new Set(all).size === all.length; })(), (() => { const all = Object.values(a.SECTION_KEYS).flat(); return all.filter((k, i) => all.indexOf(k) !== i).join(); })());
ok("resetPatch gives a value for every section key", Object.values(a.SECTION_KEYS).flat().every((k) => k in a.resetPatch([k]) && a.resetPatch([k])[k] !== undefined), Object.values(a.SECTION_KEYS).flat().filter((k) => a.resetPatch([k])[k] === undefined).join());
// تباين الزجاج WCAG (T04): النص فوق السطح المركّب = صبغة الأكريليك (styleAlpha) فوق الخلفية.
//  · Frosted (45) وSmoked (68): ≥ 4.5 فوق أسوأ خلفية (أبيض نقيّ في الداكن / أسود نقيّ في الفاتح) وفوق المتوسط.
//  · Clear (25): الصبغة الخفيفة مقصودة ⇒ ≥ 4.5 فوق خلفية متوسطة السطوع (سطح مكتب اعتيادي) مع ظل النص؛ ويُقاس الأسوأ للتقرير (بلا ادّعاء AA عليه).
const TEXT = { dark: [255, 255, 255], light: [13, 16, 23] };
const worst = { dark: [255, 255, 255], light: [0, 0, 0] };
const mid = [128, 128, 128];
const cases = [["crystal", 45], ["crystal", 68], ["clear", 25]];
for (const theme of ["dark", "light"]) for (const [style, tint] of cases) {
  const sf = a.glassSurface(style, theme, tint);
  const cw = a.contrast(TEXT[theme], a.over([...sf.color, sf.alpha], worst[theme]));
  const cm = a.contrast(TEXT[theme], a.over([...sf.color, sf.alpha], mid));
  if (style === "crystal") ok(`contrast frosted/${theme}/tint${tint}: worst backdrop ${cw.toFixed(2)} ≥ 4.5, mid ${cm.toFixed(2)}`, cw >= 4.5 && cm >= 4.5);
  else ok(`contrast clear/${theme}/tint${tint}: mid backdrop ${cm.toFixed(2)} ≥ 4.5 (extreme worst case ${cw.toFixed(2)} reported, not claimed)`, cm >= 4.5);
}
ok("styleAlpha mirrors the Rust map (frosted 45 dark = .6175; clear 25 dark = .225)", Math.abs(a.styleAlpha("frosted", false, 45) - 0.6175) < 1e-9 && Math.abs(a.styleAlpha("clear", false, 25) - 0.225) < 1e-9);
console.log(fail ? `FAILED ${fail}` : "ALL PASSED");
process.exit(fail ? 1 : 0);
