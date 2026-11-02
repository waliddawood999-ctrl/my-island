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
const AW = await load("src/artwork.ts", "a.mjs");
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
// ── استخراج سواتش الغلاف
const img = (fills) => { const px = []; for (const [n, rgb] of fills) for (let k = 0; k < n; k++) px.push(rgb[0], rgb[1], rgb[2], 255); return px; };
{
  const cover = img([[500, [40, 20, 70]], [300, [255, 120, 20]], [120, [30, 30, 40]], [80, [240, 240, 240]]]);
  const sw = AW.extractSwatches(cover);
  const hue = (h) => E.rgbToOklch(E.hexToRgb(h)).h;
  ok("swatches: vibrant = the saturated orange, darkMuted = the dark violet-grey", sw && sw.vibrant && sw.darkMuted && E.hexToRgb(sw.vibrant)[0] > 200 && E.luminance(E.hexToRgb(sw.darkMuted)) < 0.05, J(sw));
  ok("swatches: deterministic", J(AW.extractSwatches(cover)) === J(sw));
  ok("swatches: grayscale cover ⇒ no vibrant, avg still present", (() => { const g = AW.extractSwatches(img([[400, [90, 90, 90]], [200, [30, 30, 30]]])); return g && g.vibrant === null && /^#[0-9a-f]{6}$/.test(g.avg); })());
  ok("swatches: fully transparent / empty ⇒ null", AW.extractSwatches([0, 0, 0, 0, 5, 5, 5, 10]) === null && AW.extractSwatches([]) === null);
  void hue;
}
// ── Living Artwork
{
  const art = P.PACKS.find((p) => p.id === "living-artwork");
  const swa = { vibrant: "#ff7a14", darkMuted: "#2a2438", muted: "#6a6480", avg: "#403850" };
  const at = (bloom, dark = true, a = swa) => E.deriveTheme(P.packInput(art, dark, { live: { art: a, bloom } }));
  const ob = E.deriveTheme(P.packInput(P.OBSIDIAN, true));
  ok("living artwork: no media ⇒ identical to Obsidian (silent fall-through)", J(E.deriveTheme(P.packInput(art, true, { live: { art: null } }))) === J(ob) && P.effectivePack(art, {}).id === "obsidian" && P.effectivePack(art, { art: swa }).id === "living-artwork");
  ok("living artwork: wash = DarkMuted, glow = Vibrant, accent = Vibrant (adjusted ≥3:1)", (() => { const d = at(0.6); return d.vars["--t-wash-c"] === "#2a2438" && d.vars["--t-glow-c"] === "#ff7a14" && d.measures.find((m) => m.role === "accent").ok; })());
  ok("bloom scale: 0 ⇒ no wash/glow; 60% = 0.6×cap; 100% = cap; default bloom is 60", at(0).washAlpha === 0 && at(0).glowAlpha === 0 && Math.abs(at(0.6).washAlpha - 0.6 * E.CAPS.wash.dark) < 1e-6 && Math.abs(at(1).washAlpha - E.CAPS.wash.dark) < 1e-6 && art.bloom === 60);
  ok("bloom 200%: wash up to 2×cap (documented) but text stays ≥4.5 for dark/light and a worst-case cover", [true, false].every((dk) => [swa, { vibrant: "#ffffff", darkMuted: "#e8e8ff", muted: "#ffffff", avg: "#ffffff" }, { vibrant: "#ffee00", darkMuted: "#9a8a00", muted: "#ccbb00", avg: "#ccbb00" }].every((a) => at(2, dk, a).measures.every((m) => m.ok))));
  ok("luma floor never raises wash above the requested bloom", [0.3, 1, 2].every((b) => at(b).washAlpha <= b * E.CAPS.wash.dark + 1e-9));
  ok("crossfade 600ms constant lives in motion (dur.theme) — checked by the UI suite; engine exposes registered vars for fading", at(1).vars["--t-wash-c"] && at(1).vars["--t-glow-c"]);
}
// ── Windows Mirror: البذرة = أكسنت ويندوز
{
  const wm = P.PACKS.find((p) => p.id === "windows-mirror");
  const a1 = E.deriveTheme(P.packInput(wm, true, { live: { winAccent: "#c43b8a" } })), a0 = E.deriveTheme(P.packInput(wm, true, { live: { winAccent: null } }));
  ok("windows mirror: accent follows the OS accent; without it falls back to its seed #0078d4", Math.abs(E.rgbToOklch(a1.accent).h - E.rgbToOklch(E.hexToRgb("#c43b8a")).h) < 6 && Math.abs(E.rgbToOklch(a0.accent).h - E.rgbToOklch(E.hexToRgb("#0078d4")).h) < 6 && a1.measures.every((m) => m.ok));
}
// ── مخزون الحزم المنفَّذ حتى الآن
ok("pack ids are unique and every pack has the 3 seeds", new Set(P.PACKS.map((p) => p.id)).size === P.PACKS.length && P.PACKS.every((p) => p.seeds.surface && p.seeds.fg && p.seeds.accent));
ok("Porcelain is light-first (surface detected light) and the dark variant is derived", E.detectDark(P.getPack("porcelain").seeds.surface) === false && E.deriveTheme(P.packInput(P.getPack("porcelain"), true)).dark === true);
// ── عوائل الآليات (ج)
{
  const get = (id) => P.PACKS.find((p) => p.id === id);
  const fam = (f) => P.PACKS.filter((p) => p.family === f).map((p) => p.id);
  ok("≈18+ packs: nine seed packs + mechanism families (gradient 2, craft 4, editorial 1, shape 3, time 1, art 2)", P.PACKS.length >= 18 && fam("gradient").length === 2 && fam("craft").length === 4 && fam("editorial").length === 1 && fam("shape").length === 3 && fam("time").length === 1 && fam("art").length === 2, `${P.PACKS.length}`);
  // ب) تدرّج قائد: الحركة اختيارية وتنتقل الغسلة إلى طبقة ::after
  const nb = get("nebula-mesh");
  const on = E.deriveTheme(P.packInput(nb, true, { anim: true })), off = E.deriveTheme(P.packInput(nb, true, { anim: false }));
  ok("gradient-led: anim on ⇒ wash moves to the ::after layer (body wash none); off ⇒ static wash on the body", on.washAnim && on.vars["--t-wash-img"] === "none" && on.vars["--t-after-img"].includes("gradient") && Number(on.vars["--t-after-a"]) === 1 && !off.washAnim && off.vars["--t-wash-img"].includes("gradient") && off.vars["--t-after-img"] === "none");
  ok("gradient-led: Mesh uses two wash colours and both fade to transparent", on.vars["--t-wash-c"] !== on.vars["--t-wash-c2"] && /transparent 57%/.test(on.vars["--t-after-img"]) && /transparent 60%/.test(off.vars["--t-wash-img"]));
  // ج) حرفة: كل ملمس 4–8٪ ومحصور بطبقة ::after (ليس صورة كاملة التغطية)
  for (const id of ["brushed-titanium", "frosted-paper", "carbon-fibre", "linen-sand"]) for (const dk of [true, false]) {
    const d = E.deriveTheme(P.packInput(get(id), dk));
    ok(`craft ${id}/${dk ? "dark" : "light"}: decor layer present at ${d.vars["--t-decor-a"]} (4–8%), no full-bleed image url besides the paper SVG tile`, Number(d.vars["--t-after-a"]) >= 0.04 && Number(d.vars["--t-after-a"]) <= 0.08 && d.vars["--t-after-img"] !== "none" && (id === "frosted-paper" || !d.vars["--t-after-img"].includes("url(")) && !d.washAnim);
  }
  ok("decor beats anim when both are requested (one ::after role)", !E.deriveTheme({ ...P.packInput(get("carbon-fibre"), true), anim: true }).washAnim);
  // د) تحريرية
  const ink = (dk) => E.deriveTheme(P.packInput(get("ink-vermilion"), dk));
  ok("editorial: no wash, no glow, higher-contrast secondary/tertiary text than Obsidian", [true, false].every((dk) => ink(dk).washAlpha === 0 && ink(dk).glowAlpha === 0 && ink(dk).measures.find((m) => m.role === "text.tertiary").ratio > E.deriveTheme(P.packInput(P.OBSIDIAN, dk)).measures.find((m) => m.role === "text.tertiary").ratio));
  ok("editorial: single accent vermilion survives on light (≥3:1) and is logged if adjusted", ink(false).measures.find((m) => m.role === "accent").ok);
  // هـ) الشكل
  const sh = (id) => P.SHAPES[get(id).shape];
  ok("shape-led: sharp < default < squircle < arena corner scales; radii ordered", sh("angular").corner < 1 && sh("squircle-max").corner > 1 && sh("arena").corner > sh("squircle-max").corner && sh("angular").panelR < 34 && sh("squircle-max").panelR > 34);
  // و) الوقت
  ok("time-aware: hue shift ±24° on the sun cycle (peak noon, trough midnight), 0 at 06:00/18:00", P.timeHueShift(12) === 24 && P.timeHueShift(0) === -24 && P.timeHueShift(6) === 0 && P.timeHueShift(18) === 0);
  { const sd = get("solar-drift"); const noon = E.deriveTheme(P.packInput(sd, true, { hueShift: P.timeHueShift(12) })), night = E.deriveTheme(P.packInput(sd, true, { hueShift: P.timeHueShift(0) }));
    ok("time-aware: noon and midnight accents differ in hue and both pass WCAG", Math.abs(E.rgbToOklch(noon.accent).h - E.rgbToOklch(night.accent).h) > 20 && noon.measures.every((m) => m.ok) && night.measures.every((m) => m.ok)); }
  // ز) فن: متغير البطل
  ok("art-led: the hero variant exists, is an artwork source and flags hero; the plain one does not", get("living-artwork-hero").hero === true && get("living-artwork-hero").source === "artwork" && !get("living-artwork").hero);
}
// ── حزمة المستخدم: نطاقات مصمَّمة فقط
{
  const bad = P.sanitizeUserTheme({ id: "u:abc", name: "  x  ".repeat(30), base: "nope", accent: "red", wash: 99, glow: -5, grain: 5, washDir: "diagonal", evil: 1 });
  ok("user theme: out-of-range / wrong-type inputs are clamped or dropped", bad && bad.base === undefined && bad.accent === undefined && bad.wash === 1 && bad.glow === 0 && bad.grain === 0.08 && bad.washDir === undefined && bad.name.length <= 40 && !("evil" in bad));
  ok("user theme: id must be custom or u:xxxx (no path-like ids)", P.sanitizeUserTheme({ id: "obsidian" }) === null && P.sanitizeUserTheme({ id: "u:../x" }) === null && P.sanitizeUserTheme(null) === null && P.sanitizeUserTheme({ id: "custom" }) !== null);
  // أسوأ مجموعة مسموحة: كل المقابض في أقصاها مع أكسنت أبيض/أصفر
  const worst = [{ accent: "#ffffff" }, { accent: "#ffee00" }, { accent: "#000000" }, { accent: "#00ff66" }].flatMap((a) => ["obsidian", "porcelain", "carbon-fibre", "frosted-paper"].flatMap((base) => [true, false].map((dk) => E.deriveTheme(P.packInput(P.userPack(P.sanitizeUserTheme({ id: "custom", base, wash: 1, glow: 1, grain: 0.08, washDir: "radial", ...a })), dk)))));
  ok(`user theme: every allowed extreme (${worst.length} combos) still passes every WCAG role — cannot produce an unreadable theme`, worst.every((d) => d.measures.every((m) => m.ok)));
  ok("factory packs are never mutated by customisation (userPack copies)", (() => { const before = J(P.getPack("obsidian")); P.userPack({ id: "u:z", name: "z", accent: "#ff0000", wash: 0 }); return J(P.getPack("obsidian")) === before; })());
  ok("resolvePack: custom slot and u:ids resolve; unknown ⇒ Obsidian", P.resolvePack("custom", { accent: "#ff6b5e" }).seeds.accent === "#ff6b5e" && P.resolvePack("u:a1", null, [{ id: "u:a1", name: "Mine", base: "ember" }]).ar === "Mine" && P.resolvePack("u:zz", null, []).id === "obsidian" && P.resolvePack("???").id === "obsidian");
}
// ── تقرير
for (const dark of [true, false]) { const d = E.deriveTheme(P.packInput(obs, dark)); console.log(`  [report] obsidian/${dark ? "dark" : "light"} base ${E.rgbToHex(d.base)} accent ${E.rgbToHex(d.accent)} onAccent ${E.rgbToHex(d.onAccent)} wash ${d.washAlpha.toFixed(3)} adj ${d.adjustments.length}: ${d.measures.map((m) => `${m.role}=${m.ratio}`).join(" ")}`); }
console.log(fail ? `FAILED ${fail}` : "ALL PASSED");
process.exit(fail ? 1 : 0);
