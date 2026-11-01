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
eq("css dark bg", css.includes("rgb(20 20 20 / 0.35)"), true);
eq("css light bg", css.includes("rgb(255 255 255 / 0.12)"), true);
eq("css border", css.includes("1px solid rgb(255 255 255 / 0.25)"), true);

console.log(fail ? `FAIL (${fail})` : "OK glass");
process.exit(fail ? 1 : 0);
