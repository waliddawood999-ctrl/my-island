// محرك الاشتقاق (Theme engine) — نقي بلا واجهة. كل حزمة = 3 بذور (سطح + مقدمة + أكسنت) والمحرك يشتق منها بقية الرموز.
// النسب والمعاملات كلها ثوابت مسمّاة هنا وموثّقة في docs/THEMES.md (المصدر الوحيد). النموذج المعماري (3 بذور ← رموز بألفا مثبّتة ← فرض تباين آلي)
// مأخوذ فكرةً عن BrimDeck (Apache-2.0) — لم يُنسخ كود؛ انظر NOTICE. لا يستورد appearance.ts (لا حلقة اعتماد).

export type RGB = [number, number, number];
export interface Seeds { surface: string; fg: string; accent: string }
export type WashDir = "top" | "bottom" | "start" | "end" | "radial";
export type DecorId = "none" | "metal" | "paper" | "carbon" | "linen";

// ───────── أدوات اللون ─────────
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const hex6 = (h: unknown, d = "#000000"): string => (typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : d);
export const hexToRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(hex6(h).slice(i, i + 2), 16)) as RGB;
export const rgbToHex = (c: RGB): string => `#${c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
const toLin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const fromLin = (l: number) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);

/** الإضاءة النسبية WCAG. */
export const luminance = (c: RGB) => 0.2126 * toLin(c[0]) + 0.7152 * toLin(c[1]) + 0.0722 * toLin(c[2]);
/** نسبة التباين WCAG بين لونين معتمين. */
export const contrast = (a: RGB, b: RGB) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** مزج لون شفاف [r,g,b,a] فوق خلفية معتمة. */
export const over = (fg: [number, number, number, number], bg: RGB): RGB => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])) as RGB;
/** خلط خطي (في فضاء sRGB): a·(1−t) + b·t — معامل t مثبّت لكل رمز في FG_ALPHA. */
export const mixLin = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t) as RGB;

export type Oklch = { L: number; C: number; h: number };
export function rgbToOklch(c: RGB): Oklch {
  const [r, g, b] = c.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}
const oklchRaw = ({ L, C, h }: Oklch): [number, number, number] => {
  const A = C * Math.cos(h * Math.PI / 180), B = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
};
/** OKLCH → sRGB مع تقليص الكروما حتى يدخل المجال (حفظ الإضاءة والدرجة). */
export function oklchToRgb(c: Oklch): RGB {
  let C = c.C;
  for (let n = 0; n < 40; n++) {
    const lin = oklchRaw({ L: c.L, C, h: c.h });
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return lin.map((v) => fromLin(clamp(v, 0, 1))) as RGB;
    C *= 0.93;
  }
  return oklchRaw({ L: c.L, C: 0, h: c.h }).map((v) => fromLin(clamp(v, 0, 1))) as RGB;
}

/** عتبة الكشف: إضاءة نسبية < 0.179 (نقطة تساوي تباين الأبيض والأسود) ⇒ داكن. */
export const DARK_LUMA_THRESHOLD = 0.179;
export const detectDark = (surfaceHex: string): boolean => luminance(hexToRgb(surfaceHex)) < DARK_LUMA_THRESHOLD;

// ───────── الثوابت الموثّقة (docs/THEMES.md) ─────────
/** سقوف الرصّة (§2): الغسلة 14٪ داكن / 10٪ فاتح · التوهّج 20٪ بتمويه ≥ 48px · الزخرفة 4–8٪ · الحدّ 6–10٪. */
export const CAPS = { wash: { dark: 0.14, light: 0.10 }, washFadeStop: 60, glow: 0.20, glowBlurMin: 48, decorMin: 0.04, decorMax: 0.08, borderMin: 0.06, borderMax: 0.10, grainMax: 0.08 } as const;
/** القاعدة المحايدة (OKLCH): كروما 0.008–0.015 نحو درجة بذرة السطح · إضاءة 14–18٪ داكن / 96–97٪ فاتح — لا #000 ولا #fff أبدًا. */
export const BASE = { chroma: [0.008, 0.015], lightDark: [0.14, 0.18], lightLight: [0.96, 0.97] } as const;
/** ألفا المقدمة المثبّتة لكل رمز (منفصلة داكن/فاتح) + معاملات الخلط الخطي للأسطح. border = قيمة افتراضية (تُضبط بـ borderStrength ضمن 6–10٪). */
export type FgAlpha = { primary: number; secondary: number; tertiary: number; hover: number; active: number; strong: number; card: number; raised: number; border: number; ring: number; spec: number };
export const FG_ALPHA: Record<"dark" | "light", FgAlpha> = {
  dark: { primary: 1, secondary: 0.70, tertiary: 0.52, hover: 0.08, active: 0.14, strong: 0.20, card: 0.05, raised: 0.09, border: 0.08, ring: 0.12, spec: 0.22 },
  light: { primary: 1, secondary: 0.68, tertiary: 0.58, hover: 0.07, active: 0.12, strong: 0.17, card: 0.04, raised: 0.07, border: 0.09, ring: 0.12, spec: 0.85 },
};
/** حدود WCAG: نص 4.5:1 · كبير/أكسنت 3:1. */
export const WCAG = { text: 4.5, large: 3 } as const;
/** ألوان الحالة الأساسية قبل الفرض (داكن/فاتح). */
export const SEMANTIC = {
  dark: { success: "#34d399", warning: "#fbbf24", danger: "#f87171", info: "#8ea2ff" },
  light: { success: "#047857", warning: "#b45309", danger: "#dc2626", info: "#4256d0" },
} as const;
const FG_DEFAULT = { dark: "#eef1f8", light: "#0d1017" } as const;

export interface Adjustment { token: string; from: string; to: string; reason: string; before: number; after: number }
export interface Measure { role: string; ratio: number; min: number; ok: boolean }

export interface DeriveInput {
  seeds: Seeds;
  /** إن لم يُحدَّد: يُكشف من إضاءة بذرة السطح. */
  dark?: boolean;
  /** شدة الغسلة 0..1 (من السقف)؛ bloom يضرب فوقها (Living Artwork حتى 2). */
  wash?: number; washDir?: WashDir; washMesh?: string | null;
  /** شدة التوهّج 0..1 (من السقف 20٪). */
  glow?: number;
  grain?: number; decor?: DecorId; decorAmount?: number;
  /** انحراف الدرجة بالدرجات (واعية بالوقت). */
  hueShift?: number;
  bloom?: number;
  /** أرضية المقروئية: تقليل الغسلة (لا رفع الألفا) حتى يجتاز النص بألفاته المثبّتة. */
  lumaFloor?: boolean;
  /** نسبة قوة الحدّ 0..100 (50 = افتراضي) — تُعيَّن إلى 6–10٪ (0 = بلا حدّ). */
  borderStrength?: number;
}

export interface Derived {
  dark: boolean;
  base: RGB; accent: RGB; onAccent: RGB;
  washAlpha: number; glowAlpha: number;
  vars: Record<string, string>;
  adjustments: Adjustment[];
  measures: Measure[];
  surfaces: RGB[];
}

const a3 = (n: number) => String(Math.round(n * 1000) / 1000);
const rgba = (c: RGB, a: number) => `rgb(${c.map((v) => Math.round(v)).join(" ")} / ${a3(a)})`;
const hexOf = rgbToHex;

/** يعدّل لونًا في OKLCH (الإضاءة فقط، بنفس الدرجة والكروما) حتى تتحقق الدالة ok؛ يعيد اللون وعدد الخطوات. */
function fit(c: RGB, towardLight: boolean, ok: (c: RGB) => boolean): { c: RGB; moved: boolean; reached: boolean } {
  if (ok(c)) return { c, moved: false, reached: true };
  const k = rgbToOklch(c);
  let L = k.L;
  for (let n = 0; n < 60; n++) {
    L = clamp(L + (towardLight ? 0.015 : -0.015), 0, 1);
    const t = oklchToRgb({ L, C: k.C, h: k.h });
    if (ok(t)) return { c: t, moved: true, reached: true };
    if (L <= 0 || L >= 1) break;
  }
  return { c: oklchToRgb({ L, C: k.C, h: k.h }), moved: true, reached: false };
}

/** يولّد قاعدة السطح المحايدة من بذرة السطح. */
export function deriveBase(surface: string, dark: boolean, hueShift = 0, fallbackHue = 260): RGB {
  const k = rgbToOklch(hexToRgb(hex6(surface, "#14161c")));
  const hue = (k.C < 0.002 ? fallbackHue : k.h) + hueShift;
  const [lo, hi] = dark ? BASE.lightDark : BASE.lightLight;
  return oklchToRgb({ L: clamp(k.L, lo, hi), C: clamp(k.C, BASE.chroma[0], BASE.chroma[1]), h: hue });
}

/** يعيد بذور الوضع المطلوب: إن اختلف وضع بذرة السطح قُلبت إضاءتها (نفس الدرجة) والمقدمة إلى الافتراضية. الأكسنت يبقى والمحرك يفرض تباينه. */
export function variantSeeds(seeds: Seeds, wantDark: boolean): Seeds {
  const surface = hex6(seeds.surface, "#14161c");
  if (detectDark(surface) === wantDark) return { surface, fg: fgFor(seeds.fg, wantDark), accent: hex6(seeds.accent, "#6d8dff") };
  const k = rgbToOklch(hexToRgb(surface));
  const flipped = oklchToRgb({ L: wantDark ? 0.17 : 0.965, C: clamp(k.C, BASE.chroma[0], BASE.chroma[1]), h: k.h });
  return { surface: hexOf(flipped), fg: FG_DEFAULT[wantDark ? "dark" : "light"], accent: hex6(seeds.accent, "#6d8dff") };
}
/** المقدمة المقبولة للوضع: داكن ⇒ فاتحة، فاتح ⇒ داكنة؛ غير ذلك ⇒ الافتراضية. */
const fgFor = (fg: string, dark: boolean) => (detectDark(hex6(fg, "#000000")) === dark ? FG_DEFAULT[dark ? "dark" : "light"] : hex6(fg));

const washAngle: Record<WashDir, string> = { top: "to bottom", bottom: "to top", start: "to right", end: "to left", radial: "" };

/** قلب الاشتقاق: بذور ← رموز + فرض مقروئية + سجل التعديلات. حتمي: نفس الدخل ⇒ نفس الخرج بالضبط. */
export function deriveTheme(inp: DeriveInput): Derived {
  const seeds0 = inp.seeds;
  const dark = inp.dark ?? detectDark(hex6(seeds0.surface, "#14161c"));
  const mode = dark ? "dark" : "light";
  const seeds = variantSeeds(seeds0, dark);
  const adjustments: Adjustment[] = [];
  const hueShift = inp.hueShift ?? 0;

  // أكسنت البذرة (قبل الفرض) بعد انحراف الدرجة
  let accent0 = hexToRgb(seeds.accent);
  if (hueShift) { const k = rgbToOklch(accent0); accent0 = oklchToRgb({ ...k, h: k.h + hueShift }); }
  const fgRgb = hexToRgb(seeds.fg);
  const base = deriveBase(seeds.surface, dark, hueShift, rgbToOklch(accent0).h);
  const A = FG_ALPHA[mode];

  // ── الغسلة: سقف × شدة × إزهار. الألفا النهائية لا تتجاوز السقف إلا بالإزهار (Living Artwork فقط، حتى 2×).
  const cap = CAPS.wash[mode];
  const bloom = clamp(inp.bloom ?? 1, 0, 2);
  const strength = clamp(inp.wash ?? 1, 0, 1);
  let washAlpha = cap * strength * bloom;
  const glowAlpha = CAPS.glow * clamp(inp.glow ?? 0.6, 0, 1) * bloom;
  const washColor = accent0;

  // ── أسطح القياس: القاعدة · قمة الغسلة · بطاقة مرفوعة فوق قمة الغسلة (أسوأ حالة للنص)
  const surfacesFor = (wa: number): RGB[] => {
    const top = mixLin(base, washColor, wa);
    return [base, top, mixLin(top, fgRgb, A.raised)];
  };
  let surfaces = surfacesFor(washAlpha);
  const textAt = (alpha: number, ss: RGB[]) => Math.min(...ss.map((s) => contrast(over([fgRgb[0], fgRgb[1], fgRgb[2], alpha], s), s)));

  // أرضية المقروئية (Luma): قلّل الغسلة حتى يجتاز النص بألفاته المثبّتة.
  if (inp.lumaFloor) {
    const before = washAlpha;
    for (let n = 0; n < 40 && (textAt(A.secondary, surfaces) < WCAG.text || textAt(A.tertiary, surfaces) < WCAG.text); n++) { washAlpha *= 0.9; surfaces = surfacesFor(washAlpha); }
    if (washAlpha < before) adjustments.push({ token: "wash", from: a3(before), to: a3(washAlpha), reason: "luma-floor", before: textAt(A.tertiary, surfacesFor(before)), after: textAt(A.tertiary, surfaces) });
  }

  // ── المقدمة: ألفا مثبّتة؛ أي ألفا دون الحدّ ترتفع بخطوة .02 حتى تجتاز (على نفس الرمز)
  const fgAlpha = { primary: A.primary, secondary: A.secondary, tertiary: A.tertiary };
  for (const role of ["primary", "secondary", "tertiary"] as const) {
    const before = textAt(fgAlpha[role], surfaces);
    let a = fgAlpha[role];
    while (textAt(a, surfaces) < WCAG.text && a < 1) a = Math.min(1, a + 0.02);
    if (a !== fgAlpha[role]) { adjustments.push({ token: `text.${role}`, from: a3(fgAlpha[role]), to: a3(a), reason: "wcag-text", before, after: textAt(a, surfaces) }); fgAlpha[role] = a; }
  }

  // ── الأكسنت: ≥3:1 على أسوأ سطح؛ ثم onAccent الأعلى تباينًا (≥4.58 دائمًا رياضيًا)
  const minAccent = (c: RGB) => Math.min(...surfaces.map((s) => contrast(c, s)));
  const fa = fit(accent0, dark, (c) => minAccent(c) >= WCAG.large);
  const accent = fa.c;
  if (fa.moved) adjustments.push({ token: "accent", from: hexOf(accent0), to: hexOf(accent), reason: "wcag-large", before: minAccent(accent0), after: minAccent(accent) });
  const white: RGB = [255, 255, 255], ink: RGB = [6, 8, 12];
  const onAccent = contrast(accent, white) >= contrast(accent, ink) ? white : ink;

  // ── ألوان الحالة: نص 4.5:1 على أسوأ سطح
  const sem: Record<string, RGB> = {};
  for (const [name, hx] of Object.entries(SEMANTIC[mode])) {
    const c0 = hexToRgb(hx);
    const f = fit(c0, dark, (c) => Math.min(...surfaces.map((s) => contrast(c, s))) >= WCAG.text);
    sem[name] = f.c;
    if (f.moved) adjustments.push({ token: `status.${name}`, from: hx, to: hexOf(f.c), reason: "wcag-text", before: Math.min(...surfaces.map((s) => contrast(c0, s))), after: Math.min(...surfaces.map((s) => contrast(f.c, s))) });
  }

  // ── القياسات النهائية
  const measures: Measure[] = [
    ...(["primary", "secondary", "tertiary"] as const).map((r) => ({ role: `text.${r}`, ratio: textAt(fgAlpha[r], surfaces), min: WCAG.text })),
    { role: "accent", ratio: minAccent(accent), min: WCAG.large },
    { role: "onAccent", ratio: contrast(onAccent, accent), min: WCAG.text },
    ...Object.entries(sem).map(([n, c]) => ({ role: `status.${n}`, ratio: Math.min(...surfaces.map((s) => contrast(c, s))), min: WCAG.text })),
  ].map((m) => ({ ...m, ratio: Math.round(m.ratio * 100) / 100, ok: m.ratio >= m.min - 0.005 }));

  // ── الأسطح المشتقة (خلط خطي بمعاملات FG_ALPHA)
  const raised = mixLin(base, fgRgb, A.raised);
  const border = inp.borderStrength === undefined ? A.border : (inp.borderStrength <= 0 ? 0 : CAPS.borderMin + (clamp(inp.borderStrength, 0, 100) / 100) * (CAPS.borderMax - CAPS.borderMin));
  const spec: RGB = dark ? white : [255, 255, 255];

  // ── CSS: الغسلة تتلاشى إلى صفر عند 60٪
  const fade = CAPS.washFadeStop;
  const wc = hexOf(accent0);
  const mesh = inp.washMesh ? hexToRgb(inp.washMesh) : null;
  const dir = inp.washDir ?? "top";
  // الألوان تُمرَّر عبر متغيرات مسجّلة (@property في tokens.css) لتتلاشى عند تبديل الحزمة بدل القفز.
  const stop = (v: string) => `color-mix(in srgb, var(${v}) calc(var(--t-wash-a) * 100%), transparent)`;
  let washImg: string;
  if (mesh) washImg = `radial-gradient(120% 100% at 0% 0%, ${stop("--t-wash-c")} 0%, transparent ${fade}%), radial-gradient(120% 100% at 100% 0%, ${stop("--t-wash-c2")} 0%, transparent ${fade}%)`;
  else if (dir === "radial") washImg = `radial-gradient(110% 120% at 50% 0%, ${stop("--t-wash-c")} 0%, transparent ${fade}%)`;
  else washImg = `linear-gradient(${washAngle[dir]}, ${stop("--t-wash-c")} 0%, transparent ${fade}%)`;

  const decorId = inp.decor ?? "none";
  const decorA = decorId === "none" ? 0 : clamp(inp.decorAmount ?? 0.06, CAPS.decorMin, CAPS.decorMax);
  const grainA = clamp(inp.grain ?? 0.035, 0, CAPS.grainMax);
  const glowBlur = CAPS.glowBlurMin + 8;
  const gc = "color-mix(in srgb, var(--t-glow-c) calc(var(--t-glow-a) * 100%), transparent)";
  const gc2 = "color-mix(in srgb, var(--t-glow-c) calc(var(--t-glow-a) * 50%), transparent)";
  const glowShadow = `0 0 ${glowBlur}px ${gc}, inset 0 0 ${glowBlur}px ${gc2}`;

  const vars: Record<string, string> = {
    "--accent": hexOf(accent), "--accent-fg": hexOf(onAccent), "--app-accent": hexOf(accent),
    "--accent-soft": rgba(accent, 0.16),
    "--glass-base": `rgb(${base.map((v) => Math.round(v)).join(" ")})`, "--t-base": hexOf(base),
    "--c-surface": hexOf(base), "--c-surface-raised": hexOf(raised),
    "--c-border": rgba(fgRgb, border),
    "--c-text-primary": rgba(fgRgb, fgAlpha.primary), "--c-text-secondary": rgba(fgRgb, fgAlpha.secondary), "--c-text-tertiary": rgba(fgRgb, fgAlpha.tertiary),
    "--c-success": hexOf(sem.success), "--c-warning": hexOf(sem.warning), "--c-danger": hexOf(sem.danger), "--c-info": hexOf(sem.info),
    "--island-fg": hexOf(fgRgb),
    "--island-surface": rgba(fgRgb, A.card), "--island-surface-hover": rgba(fgRgb, A.card + A.hover), "--island-surface-active": rgba(fgRgb, A.card + A.active), "--island-surface-strong": rgba(fgRgb, A.strong),
    "--island-text-dim": rgba(fgRgb, fgAlpha.secondary), "--island-text-faint": rgba(fgRgb, fgAlpha.tertiary),
    "--island-ring": `inset 0 0 0 1px ${rgba(fgRgb, border)}`,
    "--island-ring-open": `inset 0 0 0 1px ${rgba(fgRgb, border)}, inset 0 1px 0 ${rgba(spec, A.spec * 0.3)}`,
    "--glass-spec": rgba(spec, A.spec),
    "--t-border-a": a3(border), "--t-edge-a": a3(A.spec),
    "--t-wash-c": wc, "--t-wash-c2": mesh ? hexOf(mesh) : wc, "--t-wash-a": a3(washAlpha), "--t-wash-img": washImg,
    "--t-glow-c": hexOf(mesh ?? washColor), "--t-glow-a": a3(glowAlpha), "--t-glow-blur": `${glowBlur}px`, "--t-glow": glowShadow,
    "--t-decor-a": a3(decorA), "--t-grain-a": a3(grainA),
    "--t-fg": hexOf(fgRgb),
  };
  return { dark, base, accent, onAccent, washAlpha, glowAlpha, vars, adjustments, measures, surfaces };
}

/** قراءة سطر لكل تعديل آلي (للعرض الشفاف في الإعدادات). */
export function describeAdjustment(a: Adjustment, lang: "ar" | "en"): string {
  const why: Record<string, [string, string]> = {
    "wcag-text": ["حدّ النص 4.5:1", "text limit 4.5:1"],
    "wcag-large": ["حدّ الأكسنت 3:1", "accent limit 3:1"],
    "luma-floor": ["أرضية المقروئية (Luma)", "readability floor (Luma)"],
  };
  const [ar, en] = why[a.reason] ?? [a.reason, a.reason];
  return lang === "ar"
    ? `${a.token}: ${a.from} ← ${a.to} (${ar}؛ ${a.before.toFixed(2)}→${a.after.toFixed(2)})`
    : `${a.token}: ${a.from} → ${a.to} (${en}; ${a.before.toFixed(2)}→${a.after.toFixed(2)})`;
}
