// اختبار طبقة الزجاج CSS: node scripts/glass.test.mjs (أو npm run test:glass)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "glass-"));
const out = join(dir, "glass.mjs");
await build({ entryPoints: ["src/glass.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const g = await import(pathToFileURL(out).href);
const settingsSrc = readFileSync("src/settings.ts", "utf8");
let fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${n}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };

// المفتاحان وافتراضياهما في settings.ts
eq("glassBlur default 24", /glassBlur:\s*24\b/.test(settingsSrc), true);
eq("glassSaturation default 180", /glassSaturation:\s*180\b/.test(settingsSrc), true);
eq("types declared", /glassBlur:number/.test(settingsSrc) && /glassSaturation:number/.test(settingsSrc), true);
// state.rs يحمل نفس الافتراضيين
const rs = readFileSync("src-tauri/src/state.rs", "utf8");
eq("state.rs defaults", /"glassBlur": 24/.test(rs) && /"glassSaturation": 180/.test(rs), true);

// الحدود والنهايات
eq("blur 0", g.glassVars(0, 100, false), { blur: "0px", saturate: "1" });
eq("blur 40", g.glassVars(40, 200, false), { blur: "40px", saturate: "2" });
eq("blur over", g.glassVars(99, 999, false), { blur: "40px", saturate: "2" });
eq("blur under", g.glassVars(-5, 10, false), { blur: "0px", saturate: "1" });
eq("defaults", g.glassVars(24, 180, false), { blur: "24px", saturate: "1.8" });
eq("invalid ⇒ defaults", g.glassVars(NaN, "x", false), { blur: "24px", saturate: "1.8" });
eq("undefined ⇒ defaults", g.glassVars(undefined, undefined, false), { blur: "24px", saturate: "1.8" });
eq("legacy 14/100", g.glassVars(14, 100, false), { blur: "14px", saturate: "1" });
eq("rounding", g.glassVars(12.6, 150.4, false), { blur: "13px", saturate: "1.5" });
// Eco: blur ≤ 8 وsaturation = 100
eq("eco caps blur", g.glassVars(40, 200, true), { blur: "8px", saturate: "1" });
eq("eco keeps lower blur", g.glassVars(3, 150, true), { blur: "3px", saturate: "1" });
eq("eco default", g.glassVars(24, 180, true), { blur: "8px", saturate: "1" });
// الوصفة في CSS
const css = readFileSync("src/pages/island/island.css", "utf8");
eq("css recipe filter", css.includes("blur(var(--glass-blur)) saturate(var(--glass-saturate))"), true);
eq("css crystal dark layers (gradient + saturate + brightness)", css.includes("rgb(255 255 255 / 0.16)") && css.includes("brightness(1.05)"), true);
eq("css crystal light layers", css.includes("rgb(255 255 255 / 0.55), rgb(255 255 255 / 0.10) 45%"), true);
eq("css body covered by glass vars (crystal)", /data-glass="crystal"\] \.island-body\s*\{[^}]*blur\(var\(--glass-blur\)\) saturate\(var\(--glass-saturate\)\)/.test(css), true);
eq("css clear blur capped at 8px", css.includes("blur(min(var(--glass-blur), 8px))"), true);
eq("css no backdrop exemption for body", /data-backdrop="win1[01]"\] \.island-body\s*\{[^}]*backdrop-filter:\s*none/.test(css), false);
eq("css 1px rim via mask-composite", css.includes("padding: 1px") && css.includes("mask-composite") && css.includes(".island-body::before"), true);

// INSERT M: لا طبقة صبغة صفحة ثانية فوق الأكريليك الأصلي، وأشرطة التمرير مخفية، وحدّ/لمعة جسم الحبة
eq("no win11 page tint", css.includes('data-backdrop="win11"'), false);
eq("native tint only", css.includes('[data-backdrop="win10"] { --island-bg: transparent; }'), true);
eq("crystal specular + inner glow + depth", /data-glass="crystal"\] \.island-body \{[^}]*inset 0 1\.5px 0 var\(--glass-spec\)[^}]*inset 0 0 18px[^}]*inset 0 -14px 28px/.test(css), true);
const base = readFileSync("src/index.css", "utf8");
eq("scrollbars hidden (firefox/webview)", base.includes("scrollbar-width: none !important"), true);
eq("scrollbars hidden (webkit)", base.includes("::-webkit-scrollbar { display: none"), true);
eq("rust single mechanism", !/Win11/.test(readFileSync("src-tauri/src/backdrop.rs", "utf8")), true);
console.log(fail ? `FAIL (${fail})` : "OK glass");
process.exit(fail ? 1 : 0);
