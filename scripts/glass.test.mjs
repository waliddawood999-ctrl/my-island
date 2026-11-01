// اختبار نموذج الزجاج (T04): node scripts/glass.test.mjs (أو npm run test:glass)
//  · لا backdrop-filter في island.css ولا في أي مكوّن للجزيرة · الأسلوبان يطلبان الأكريليك الأصلي · الإعدادات المسبقة أربعة حقيقية بلا blur/saturation.
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "glass-"));
const load = async (f) => { const out = join(dir, f.replace(/\W/g, "_") + ".mjs"); await build({ entryPoints: [f], bundle: true, format: "esm", outfile: out, logLevel: "warning" }); return import(pathToFileURL(out).href); };
const A = await load("src/appearance.ts");
const G = await load("src/glass.ts");
let fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${n}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };
const strip = (c) => c.replace(/\/\*[\s\S]*?\*\//g, "");

const css = strip(readFileSync("src/pages/island/island.css", "utf8"));
const rawCss = readFileSync("src/pages/island/island.css", "utf8");
// ── CSS: لا backdrop-filter، سطح واحد، ولا طبقات إضافية
eq("island.css has NO backdrop-filter anywhere", /backdrop-filter/.test(css), false);
eq("island.css has no ::after on the island body and no background-image on it", !/island-body::after/.test(css) && !/\.island-body[^{]*\{[^}]*background-image/.test(css), true);
eq("body background uses background-color with a 160ms transition", /\.island-body \{[^}]*background-color: var\(--island-bg\)[^}]*transition: background-color 160ms/.test(css), true);
eq("win10 (acrylic applied) ⇒ transparent body for both themes", /data-backdrop="win10"\][^{]*\{ --island-bg: transparent; \}/.test(css) && css.includes('[data-backdrop="win10"][data-theme="light"] { --island-bg: transparent; }'), true);
eq("pending surface: dark rgb(14 15 20 / .92), light rgb(236 239 243 / .94)", css.includes('{ --island-bg: rgb(14 15 20 / 0.92)') && css.includes("--island-bg: rgb(236 239 243 / 0.94)"), true);
eq("none/fallback surface: dark .94, light .96 (never a low-alpha fill)", css.includes("rgb(14 15 20 / 0.94)") && css.includes("rgb(236 239 243 / 0.96)"), true);
eq("no low-alpha glass fill: every glass --island-bg alpha is ≥ .9 or transparent", [...css.matchAll(/data-(?:material="glass"|fallback="solid")[^{]*\{[^}]*--island-bg: ([^;}]+)[;}]/g)].every((m) => m[1].trim() === "transparent" || /\/ 0\.(9\d)\)/.test(m[1])), true);
eq("Frosted spec highlight + Clear spec highlight (inset only)", css.includes("inset 0 1px 0 var(--glass-spec)") && css.includes('[data-glass="clear"] .island-body { box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22)'), true);
eq("1px rim via mask-composite kept", css.includes("padding: 1px") && css.includes("mask-composite") && css.includes(".island-body::before"), true);
eq("inner cards flat: .i-glass like .i-card (.07 / light .05)", css.includes(".i-glass { background: rgb(255 255 255 / 0.07); }") && css.includes('[data-theme="light"] .i-glass { background: rgb(13 16 23 / 0.05); }'), true);
// لا backdrop-filter/backdrop-blur في أي ملف للجزيرة
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const islandFiles = walk("src/pages/island").filter((f) => /\.(tsx|ts|css)$/.test(f));
eq("no backdrop-filter / backdrop-blur in any island file", islandFiles.filter((f) => /backdrop-(filter|blur)/.test(strip(readFileSync(f, "utf8")))), []);
eq("glass CSS variables removed (tokens.css, useSettings.ts)", /--glass-blur|--glass-saturate/.test(readFileSync("src/tokens.css", "utf8")) || /--glass-blur|--glass-saturate/.test(readFileSync("src/useSettings.ts", "utf8")), false);

// ── الأسلوبان يطلبان الأكريليك الأصلي
const pill = readFileSync("src/pages/island/Pill.tsx", "utf8");
eq("Pill requests native acrylic for clear too (no glassStyle !== 'clear' exclusion)", /glassStyle !== "clear"|glassStyle === "clear" && false/.test(pill), false);
eq("Pill passes style frosted|clear and ready = settled && !hidden && opacity > 0", pill.includes("style: glassStyle") && pill.includes("ready: settled && !hidden && opacity > 0"), true);
const ub = readFileSync("src/pages/island/useBackdrop.ts", "utf8");
eq("useBackdrop: pending while waiting, none only on none/reject", ub.includes('"pending"') && ub.includes('m === "win10" ? "win10" : "none"') && ub.includes('catch(() => { if (alive) root.dataset.backdrop = "none"'), true);
eq("useBackdrop sends the style argument", /style: o\.style/.test(ub), true);

// ── الإعدادات المسبقة: أربعة فقط، حقيقية، بلا blur/saturation
eq("presets = frosted/smoked/clear/minimal", A.STYLE_PRESETS.map((p) => p.id), ["frosted", "smoked", "clear", "minimal"]);
eq("presets: glass tints 45 / 68 / 25 and styles", A.STYLE_PRESETS.slice(0, 3).map((p) => [p.values.glassStyle, p.values.glassTint]), [["crystal", 45], ["crystal", 68], ["clear", 25]]);
eq("minimal is solid dark", [A.STYLE_PRESETS[3].values.themeMaterial, A.STYLE_PRESETS[3].values.themeMode], ["solid", "dark"]);
eq("no preset (or style value) sets glassBlur/glassSaturation", [...A.STYLE_PRESETS.map((p) => p.values), ...Object.values(A.GLASS_STYLE_VALUES)].some((v) => "glassBlur" in v || "glassSaturation" in v), false);
eq("GLASS_STYLE_VALUES = tint only", A.GLASS_STYLE_VALUES, { crystal: { glassStyle: "crystal", themeMaterial: "glass", glassTint: 45 }, clear: { glassStyle: "clear", themeMaterial: "glass", glassTint: 25 } });
eq("blur/saturation removed from the appearance section map", A.SECTION_KEYS.appearance.includes("glassBlur") || A.SECTION_KEYS.appearance.includes("glassSaturation"), false);
// الإبقاء على المفتاحين (مهجوران) في settings.ts وstate.rs ليبقى kv القديم والاستيراد صالحين
const settingsSrc = readFileSync("src/settings.ts", "utf8"), rs = readFileSync("src-tauri/src/state.rs", "utf8");
eq("deprecated keys kept (settings.ts + state.rs)", /glassBlur:\s*24\b/.test(settingsSrc) && /glassSaturation:\s*180\b/.test(settingsSrc) && /"glassBlur": 24/.test(rs) && /"glassSaturation": 180/.test(rs), true);
eq("glass.ts still exports glassVars for compatibility", typeof G.glassVars, "function");
// خريطة ألفا الأسلوب (مرآة Rust)
eq("styleAlpha frosted dark/light @45", [A.styleAlpha("frosted", false, 45), A.styleAlpha("frosted", true, 45)].map((x) => +x.toFixed(4)), [0.6175, 0.6575]);
eq("styleAlpha clear dark/light @25", [A.styleAlpha("clear", false, 25), A.styleAlpha("clear", true, 25)].map((x) => +x.toFixed(4)), [0.225, 0.265]);
eq("styleAlpha clear caps (light .60)", A.styleAlpha("clear", true, 200), 0.54);
eq("tintForOpacity: opacity 1 keeps tint; <1 lowers it (never below 0)", [A.tintForOpacity("frosted", false, 45, 1), A.tintForOpacity("frosted", false, 45, 0.8) < 45, A.tintForOpacity("clear", false, 25, 0.3) >= 0], [45, true, true]);
// ترحيل v3
eq("migration: glassStyle missing ⇒ crystal, glassTint untouched, idempotent", [A.migrateSettings({ settingsVersion: 2, glassTint: 70 }).glassStyle, "glassTint" in A.migrateSettings({ settingsVersion: 2, glassTint: 70 }), Object.keys(A.migrateSettings({ settingsVersion: 3 })).length], ["crystal", false, 0]);
// Rust: مصدر واحد وأسلوبان
const bd = readFileSync("src-tauri/src/backdrop.rs", "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
eq("rust: single mechanism (no Mica/DWMSBT), Style enum + style_alpha", !/Win11|DWMSBT|DwmSetWindowAttribute/.test(bd) && /pub enum Style/.test(bd) && /pub fn style_alpha/.test(bd), true);

console.log(fail ? `FAIL (${fail})` : "OK glass");
process.exit(fail ? 1 : 0);
