// يولّد جدول الحزم (بذور نهائية + قياسات التباين بعد الفرض) كماركداون. node scripts/themes.report.mjs [--write]
// --write ⇒ يحدّث الكتلة بين <!-- packs:start --> و<!-- packs:end --> في docs/THEMES.md وdocs/STATUS.md.
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "thr-"));
const load = async (entry, name) => { const out = join(dir, name); await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "warning" }); return import(pathToFileURL(out).href); };
const E = await load("src/themeEngine.ts", "e.mjs"), P = await load("src/themePacks.ts", "p.mjs");
const rows = [];
for (const p of P.PACKS) for (const dark of [true, false]) {
  const d = E.deriveTheme(P.packInput(p, dark));
  const m = Object.fromEntries(d.measures.map((x) => [x.role, x.ratio]));
  const s = E.variantSeeds(p.seeds, dark);
  rows.push(`| ${p.en} | ${p.family} | ${dark ? "داكن" : "فاتح"} | \`${s.surface}\` \`${s.fg}\` \`${s.accent}\` | \`${E.rgbToHex(d.base)}\` | \`${E.rgbToHex(d.accent)}\` | ${m["text.primary"]} / ${m["text.secondary"]} / ${m["text.tertiary"]} | ${m["accent"]} | ${m["onAccent"]} | ${Math.min(...d.measures.filter((x) => x.role.startsWith("status.")).map((x) => x.ratio))} | ${d.adjustments.length} |`);
}
const table = `| الحزمة | العائلة | الوضع | بذور (سطح · مقدمة · أكسنت) | القاعدة المشتقة | الأكسنت بعد الفرض | نص (أساسي / ثانوي / ثالثي) ≥4.5 | أكسنت ≥3 | onAccent ≥4.5 | أدنى حالة ≥4.5 | تعديلات آلية |\n|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}`;
if (process.argv.includes("--write")) {
  for (const f of ["docs/THEMES.md", "docs/STATUS.md"]) {
    let t = readFileSync(f, "utf8");
    const a = t.indexOf("<!-- packs:start -->"), b = t.indexOf("<!-- packs:end -->");
    if (a < 0 || b < 0) continue;
    t = t.slice(0, a) + "<!-- packs:start -->\n" + table + "\n" + t.slice(b);
    writeFileSync(f, t);
  }
}
console.log(table);
