// اختبار نموذج الزجاج المُحاكى (Tier A): node scripts/glass.test.mjs (أو npm run test:glass)
//  · لا backdrop-filter ولا SetWindowCompositionAttribute/ACCENT_* في أي مسار · السطح من --glass-a · الاحتياط معتم · الإعدادات المسبقة أربعة حقيقية.
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "glass-"));
const load = async (f) => { const out = join(dir, f.replace(/\W/g, "_") + ".mjs"); await build({ entryPoints: [f], bundle: true, format: "esm", outfile: out, logLevel: "warning" }); return import(pathToFileURL(out).href); };
const A = await load("src/appearance.ts");
let fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${n}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };
const stripC = (c) => c.replace(/\/\*[\s\S]*?\*\//g, "");
const stripRs = (c) => c.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

const css = stripC(readFileSync("src/pages/island/island.css", "utf8"));
// ── لا backdrop-filter في أي مسار، ولا SWCA في Rust
eq("island.css has NO backdrop-filter", /backdrop-filter/.test(css), false);
const jsFiles = walk("src").filter((f) => /\.(tsx|ts|css)$/.test(f));
eq("no backdrop-filter / backdrop-blur in any src file (comments aside)", jsFiles.filter((f) => /backdrop-(filter|blur)/.test(stripC(readFileSync(f, "utf8")).replace(/\/\/.*$/gm, ""))), []);
const rsFiles = walk("src-tauri/src").filter((f) => f.endsWith(".rs"));
eq("no SetWindowCompositionAttribute / ACCENT_ / AccentPolicy / DWMSBT / island_backdrop in Rust code", rsFiles.filter((f) => /SetWindowCompositionAttribute|ACCENT_|AccentPolicy|DWMSBT|DwmSetWindowAttribute|island_backdrop/.test(stripRs(readFileSync(f, "utf8")))), []);
eq("no island_backdrop / data-backdrop / useBackdrop left in src, scripts' bridge or capabilities", [...walk("src"), "src-tauri/build.rs", "src-tauri/capabilities/main.json", "scripts/mockBridge.cjs"].filter((f) => /island_backdrop|island-backdrop|dataset\.backdrop|data-backdrop|useBackdrop/.test(stripC(readFileSync(f, "utf8")))), []);
eq("useBackdrop.ts deleted", existsSync("src/pages/island/useBackdrop.ts"), false);
// ── CSS: سطح Tier A
eq("glass base dark rgb(22 22 27) and light rgb(245 245 248), 5% accent mix", css.includes("--glass-base: rgb(22 22 27)") && css.includes("--glass-base: rgb(245 245 248)") && css.includes("--glass-accent-mix: 5%"), true);
eq("island-bg built from --glass-a over the accent-mixed base", css.includes("color-mix(in srgb, var(--glass-solid) calc(var(--glass-a, 0.78) * 100%), transparent)"), true);
eq("fallback is the fully opaque base (--island-bg: var(--glass-solid))", css.includes('[data-fallback="solid"] { --island-bg: var(--glass-solid); }'), true);
eq("border 1px rgba(255,255,255,.14), inset top highlight, soft outer shadow", css.includes("inset 0 0 0 1px rgb(255 255 255 / calc(0.14 * var(--border-k)))") && css.includes("inset 0 1px 0 var(--glass-spec)") && /0 5px 12px rgb\(0 0 0/.test(css), true);
eq("grain: SVG feTurbulence data-URI tile at 3.5% on ::before, glass only", /island-body::before \{[^}]*opacity: 0\.035[^}]*feTurbulence/s.test(css) && !/fallback="solid"\] \.island-body::before/.test(css), true);
eq("no gradient rim mask (old acrylic-era rim) left", css.includes("mask-composite"), false);
eq("inner cards flat: .i-glass like .i-card (.07 / light .05)", css.includes(".i-glass { background: rgb(255 255 255 / 0.07); }") && css.includes('[data-theme="light"] .i-glass { background: rgb(13 16 23 / 0.05); }'), true);
// ── الإعدادات المسبقة: أربعة فقط
eq("presets = frosted/smoked/clear/minimal", A.STYLE_PRESETS.map((p) => p.id), ["frosted", "smoked", "clear", "minimal"]);
eq("presets: veil styles/tints", A.STYLE_PRESETS.slice(0, 3).map((p) => [p.values.glassStyle, p.values.glassTint]), [["crystal", 45], ["crystal", 68], ["clear", 25]]);
eq("presets give distinct veil alphas (dark): frosted < smoked, clear < frosted", (() => { const [f, s, c] = A.STYLE_PRESETS.slice(0, 3).map((p) => A.glassAlpha(p.values.glassStyle, false, p.values.glassTint)); return f < s && c < f; })(), true);
eq("minimal is solid dark", [A.STYLE_PRESETS[3].values.themeMaterial, A.STYLE_PRESETS[3].values.themeMode], ["solid", "dark"]);
eq("GLASS_STYLE_VALUES = veil only", A.GLASS_STYLE_VALUES, { crystal: { glassStyle: "crystal", themeMaterial: "glass", glassTint: 45 }, clear: { glassStyle: "clear", themeMaterial: "glass", glassTint: 25 } });
// ── مفاتيح وهمية محذوفة
const settingsSrc = readFileSync("src/settings.ts", "utf8"), rs = readFileSync("src-tauri/src/state.rs", "utf8");
eq("glassBlur / glassSaturation gone from settings.ts, glass.ts and appearance sections", [/glassBlur|glassSaturation/.test(settingsSrc), existsSync("src/glass.ts"), A.SECTION_KEYS.appearance.some((k) => /glassBlur|glassSaturation/.test(k))], [false, false, false]);
eq("state.rs: defaults no longer carry them, OBSOLETE_KEYS purge them from kv", [/"glassBlur": \d|"glassSaturation": \d/.test(rs), /OBSOLETE_KEYS[^;]*"glassBlur"[^;]*"glassSaturation"/s.test(rs)], [false, true]);
// ترحيل v3 (glassStyle) باقٍ
eq("migration: glassStyle missing ⇒ crystal, glassTint untouched, idempotent", [A.migrateSettings({ settingsVersion: 2, glassTint: 70 }).glassStyle, "glassTint" in A.migrateSettings({ settingsVersion: 2, glassTint: 70 }), Object.keys(A.migrateSettings({ settingsVersion: 3 })).length], ["crystal", false, 0]);
console.log(fail ? `FAIL (${fail})` : "OK glass");
process.exit(fail ? 1 : 0);
