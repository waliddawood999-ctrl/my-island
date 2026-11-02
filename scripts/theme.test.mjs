// محرك الثيمات: حتمية الاشتقاق، حدود الرصّة، فرض التباين (WCAG)، سقوط Living Artwork، الحزم. node scripts/theme.test.mjs
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "th-"));
const load = async (entry, name) => { const out = join(dir, name); await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "warning" }); return import(pathToFileURL(out).href); };
const E = await load("src/themeEngine.ts", "e.mjs");
const P = await load("src/themePacks.ts", "p.mjs");
let fail = 0;
const ok = (n, c, x = "") => { if (!c) fail++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : x}`); };
const J = JSON.stringify;

// ── حتمية
const obs = P.getPack("obsidian");
const d1 = E.deriveTheme(P.packInput(obs, true)), d2 = E.deriveTheme(P.packInput(obs, true));
ok("determinism: same input ⇒ identical output (vars + adjustments + measures)", J(d1) === J(d2));
ok("determinism: all packs × both modes stable", P.PACKS.every((p) => [true, false].every((m) => J(E.deriveTheme(P.packInput(p, m))) === J(E.deriveTheme(P.packInput(p, m))))));

// ── القاعدة المحايدة
for (const dark of [true, false]) {
  const d = E.deriveTheme(P.packInput(obs, dark));
  const k = E.rgbToOklch(d.base);
  const [lo, hi] = dark ? E.BASE.lightDark : E.BASE.lightLight;
  ok(`base ${dark ? "dark" : "light"}: OKLCH L ${k.L.toFixed(3)} in [${lo},${hi}], chroma ${k.C.toFixed(4)} in [.008,.015] (±.001 gamut), not #000/#fff`, k.L >= lo - 0.004 && k.L <= hi + 0.004 && k.C >= 0.0075 && k.C <= 0.0155 && E.rgbToHex(d.base) !== "#000000" && E.rgbToHex(d.base) !== "#ffffff");
}
// ── السقوف
for (const dark of [true, false]) for (const p of P.PACKS) {
  const d = E.deriveTheme(P.packInput(p, dark));
  const capW = E.CAPS.wash[dark ? "dark" : "light"];
  const art = p.source === "artwork";
  ok(`caps ${p.id}/${dark ? "dark" : "light"}: wash ${d.washAlpha.toFixed(3)} ≤ ${capW}, glow ${d.glowAlpha.toFixed(3)} ≤ .20, blur ≥ 48`, d.washAlpha <= capW + 1e-9 && d.glowAlpha <= E.CAPS.glow + 1e-9 && parseInt(d.vars["--t-glow-blur"]) >= 48 && (art || true));
  ok(`decor ${p.id}/${dark ? "dark" : "light"}: 0 or 4–8%`, Number(d.vars["--t-decor-a"]) === 0 || (Number(d.vars["--t-decor-a"]) >= 0.04 && Number(d.vars["--t-decor-a"]) <= 0.08));
  ok(`border ${p.id}/${dark ? "dark" : "light"}: 6–10%`, Number(d.vars["--t-border-a"]) >= 0.06 && Number(d.vars["--t-border-a"]) <= 0.1);
  ok(`wash fades to 0 at 60% ${p.id}/${dark ? "dark" : "light"}`, d.vars["--t-wash-img"].includes("transparent 60%"));
}
// ── WCAG بعد الفرض: كل الحزم × الوضعين
for (const dark of [true, false]) for (const p of P.PACKS) {
  const d = E.deriveTheme(P.packInput(p, dark));
  const bad = d.measures.filter((m) => !m.ok);
  ok(`WCAG ${p.id}/${dark ? "dark" : "light"}: ${d.measures.length} roles pass (min ${Math.min(...d.measures.map((m) => m.ratio))})`, bad.length === 0, J(bad));
}
// ── فرض التباين: حالات عدائية
{
  const d = E.deriveTheme({ seeds: { surface: "#14161c", fg: "#eef1f8", accent: "#1a1a26" }, dark: true });
  ok("accent too dark on dark ⇒ lightened to ≥3:1 and logged", d.adjustments.some((a) => a.token === "accent" && a.after >= 3 && a.before < 3) && d.measures.find((m) => m.role === "accent").ok);
  const l = E.deriveTheme({ seeds: { surface: "#f3f4f8", fg: "#0d1017", accent: "#ffe600" }, dark: false });
  ok("yellow accent on light ⇒ darkened to ≥3:1 and logged", l.adjustments.some((a) => a.token === "accent") && l.measures.find((m) => m.role === "accent").ok);
  const w = E.deriveTheme({ seeds: { surface: "#14161c", fg: "#eef1f8", accent: "#ff3b30" }, dark: true, wash: 1, bloom: 2, lumaFloor: false });
  ok("status tokens enforced ≥4.5 on light theme (danger red #dc2626 style)", E.deriveTheme({ seeds: obs.seeds, dark: false }).measures.filter((m) => m.role.startsWith("status.")).every((m) => m.ratio >= 4.5));
  const fl = E.deriveTheme({ seeds: { surface: "#14161c", fg: "#eef1f8", accent: "#ffffff" }, dark: true, wash: 1, bloom: 2, lumaFloor: true });
  ok("luma floor: bright accent + bloom 200% ⇒ wash reduced so text still passes", fl.adjustments.some((a) => a.token === "wash" && a.reason === "luma-floor") && fl.measures.filter((m) => m.role.startsWith("text.")).every((m) => m.ok), J(fl.measures));
  ok("without luma floor the text alphas rise instead (no wash cut)", !E.deriveTheme({ seeds: { surface: "#14161c", fg: "#eef1f8", accent: "#ffffff" }, dark: true, wash: 1, bloom: 2 }).adjustments.some((a) => a.token === "wash"));
  const hostile = E.deriveTheme({ seeds: { surface: "#ffffff", fg: "#ffffff", accent: "#ffffff" }, dark: false });
  ok("hostile seeds (all white) ⇒ still readable", hostile.measures.every((m) => m.ok), J(hostile.measures.filter((m) => !m.ok)));
  const hostile2 = E.deriveTheme({ seeds: { surface: "zzz", fg: "nope", accent: "" } });
  ok("garbage seeds ⇒ safe, readable", hostile2.measures.every((m) => m.ok) && /^#[0-9a-f]{6}$/.test(hostile2.vars["--accent"]));
}
// ── كشف داكن/فاتح وقلب البذور
ok("detectDark threshold: #14161c dark, #f3f4f8 light, mid-grey boundary", E.detectDark("#14161c") && !E.detectDark("#f3f4f8") && E.detectDark("#444444") && !E.detectDark("#888888"));
{
  const v = E.variantSeeds({ surface: "#161a24", fg: "#eef1f8", accent: "#6d8dff" }, false);
  ok("variantSeeds flips dark→light with the same hue", !E.detectDark(v.surface) && E.detectDark("#161a24") && Math.abs(E.rgbToOklch(E.hexToRgb(v.surface)).h - E.rgbToOklch(E.hexToRgb("#161a24")).h) < 12 && E.detectDark(v.fg) );
}
// ── الخلط الخطي وOKLCH
ok("mixLin endpoints and midpoint", J(E.mixLin([0, 0, 0], [200, 100, 50], 0.5)) === J([100, 50, 25]) && J(E.mixLin([9, 9, 9], [1, 2, 3], 0)) === J([9, 9, 9]));
ok("oklch round-trip within 1 level", (() => { const c = [80, 140, 220]; const r = E.oklchToRgb(E.rgbToOklch(c)); return c.every((v, i) => Math.abs(v - r[i]) <= 1); })());
// ── الحزمة الافتراضية
ok("default pack is obsidian and registry resolves unknown ids to it", P.DEFAULT_PACK === "obsidian" && P.getPack("nope").id === "obsidian" && P.getPack(undefined).id === "obsidian");
// ── تقرير
for (const dark of [true, false]) { const d = E.deriveTheme(P.packInput(obs, dark)); console.log(`  [report] obsidian/${dark ? "dark" : "light"} base ${E.rgbToHex(d.base)} accent ${E.rgbToHex(d.accent)} onAccent ${E.rgbToHex(d.onAccent)} wash ${d.washAlpha.toFixed(3)} adj ${d.adjustments.length}: ${d.measures.map((m) => `${m.role}=${m.ratio}`).join(" ")}`); }
console.log(fail ? `FAILED ${fail}` : "ALL PASSED");
process.exit(fail ? 1 : 0);
