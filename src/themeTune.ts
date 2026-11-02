// مخزون التخصيص الشامل (themeTune): كل ما يراه المستخدم أو يلمسه له مقبض ضمن **نطاقات مصمَّمة** — بلا قيم حرّة.
// نقي بلا واجهة (يُختبر في scripts/appearance.test.mjs). المفتاح الوحيد في الإعدادات: `themeTune` (كائن) + `themeDisclosure`؛ الحقول هنا.
// كل حقل: [أدنى، أقصى، الافتراضي]. القيمة خارج النطاق تُقصّ، والنوع الخاطئ يسقط للافتراضي، والمفتاح المجهول يُحذف.
import { contrast, hexToRgb, type RGB } from "./themeEngine";

/** المقابض الرقمية. veil* = عتامة السطح ×؛ edge* = قوة حدّ السطح × (≤1: يخفّض الحدّ المشتق 6–10٪ ولا يتجاوزه)؛ scale = مقياس. */
export const TUNE_NUM = {
  veilPill: [0.4, 1.2, 1], veilPanel: [0.4, 1.2, 1], veilCards: [0.4, 2, 1], veilPop: [0.4, 2, 1],
  edgePill: [0, 1, 1], edgePanel: [0, 1, 1], edgeCards: [0, 1, 1], edgePop: [0, 1, 1],
  pillScale: [0.85, 1.25, 1], panelScale: [0.85, 1.15, 1], cornerK: [0.4, 2, 1],
  iconScale: [0.85, 1.25, 1], iconTint: [0, 100, 0], hoverK: [0.4, 1.6, 1],
} as const satisfies Record<string, readonly [number, number, number]>;
export type TuneNumKey = keyof typeof TUNE_NUM;

/** المقابض المعدودة. القيمة الأولى = الافتراضي. */
export const TUNE_ENUM = {
  textWeight: ["regular", "bold"],
  elevation: ["soft", "flat", "lifted"],
  dividers: ["hairline", "none", "strong"],
  press: ["normal", "none", "strong"],
  scroll: ["instant", "smooth"],
  focusRing: ["accent", "contrast"],
} as const satisfies Record<string, readonly string[]>;
export type TuneEnumKey = keyof typeof TUNE_ENUM;

/** رموز يسمح محرر الخبير بتجاوزها (hex فقط) — تُطبَّق بعد الاشتقاق، ويُفحص تباينها حيًّا (تحذير لا منع). */
export const TOKEN_KEYS = ["--accent", "--glass-base", "--c-surface-raised", "--island-fg", "--c-success", "--c-warning", "--c-danger", "--c-info"] as const;
export type TokenKey = (typeof TOKEN_KEYS)[number];

export interface Tune {
  num: Record<TuneNumKey, number>;
  en: Record<TuneEnumKey, string>;
  highContrast: boolean;
  tokens: Partial<Record<TokenKey, string>>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** يطهّر كائن themeTune الخام (من الإعدادات/الاستيراد) إلى Tune كاملة صالحة. */
export function normTune(raw: unknown): Tune {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = {} as Record<TuneNumKey, number>;
  for (const [k, [lo, hi, d]] of Object.entries(TUNE_NUM) as [TuneNumKey, readonly [number, number, number]][]) {
    const v = r[k];
    num[k] = typeof v === "number" && Number.isFinite(v) ? round3(clamp(v, lo, hi)) : d;
  }
  const en = {} as Record<TuneEnumKey, string>;
  for (const [k, opts] of Object.entries(TUNE_ENUM) as [TuneEnumKey, readonly string[]][]) en[k] = typeof r[k] === "string" && opts.includes(r[k] as string) ? (r[k] as string) : opts[0];
  const tokens: Partial<Record<TokenKey, string>> = {};
  const t = r.tokens && typeof r.tokens === "object" ? (r.tokens as Record<string, unknown>) : {};
  for (const k of TOKEN_KEYS) { const v = t[k]; if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) tokens[k] = v.toLowerCase(); }
  return { num, en, highContrast: r.highContrast === true, tokens };
}

/** يعيد كائنًا مضغوطًا يحوي ما يخالف الافتراضي فقط (يُحفظ في الإعدادات). */
export function compactTune(t: Tune): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, [, , d]] of Object.entries(TUNE_NUM) as [TuneNumKey, readonly [number, number, number]][]) if (t.num[k] !== d) out[k] = t.num[k];
  for (const [k, opts] of Object.entries(TUNE_ENUM) as [TuneEnumKey, readonly string[]][]) if (t.en[k] !== opts[0]) out[k] = t.en[k];
  if (t.highContrast) out.highContrast = true;
  if (Object.keys(t.tokens).length) out.tokens = t.tokens;
  return out;
}

/** مفتاح إعادة ضبط وحدة: حقول themeTune التي تخصّها. */
export const TUNE_MODULE_FIELDS: Record<string, string[]> = {
  surfaces: ["veilPill", "veilPanel", "veilCards", "veilPop", "edgePill", "edgePanel", "edgeCards", "edgePop", "elevation", "dividers"],
  shape: ["pillScale", "panelScale", "cornerK"],
  text: ["textWeight", "iconScale", "iconTint"],
  feel: ["press"],
  behavior: ["scroll", "hoverK", "focusRing"],
  a11y: ["highContrast", "tokens"],
};
/** themeTune بعد حذف حقول وحدة (إعادة ضبط الوحدة). */
export function resetTuneFields(raw: unknown, fields: string[]): Record<string, unknown> {
  const t = compactTune(normTune(raw));
  for (const f of fields) delete t[f];
  return t;
}

/** معامل الارتفاع (الظل): flat=0 · soft=1 · lifted=1.6 — يضرب shadowStrength في --shadow-k. */
export const ELEVATION_K: Record<string, number> = { flat: 0, soft: 1, lifted: 1.6 };
/** ضغط الأزرار: مقياس ضغط أزرار المشغّل (.pl-btn) ومقياس الضغط العام (motion tap). */
export const PRESS: Record<string, { btn: number; tap: number }> = { none: { btn: 1, tap: 1 }, normal: { btn: 0.86, tap: 0.97 }, strong: { btn: 0.78, tap: 0.92 } };
/** الفواصل: ألفا لون المقدمة (منسوبة لحدّ 6–10٪). */
export const DIVIDER_ALPHA: Record<string, number> = { none: 0, hairline: 0.08, strong: 0.18 };

/** متغيرات CSS وسمات data-* للمخزون (الألوان خارج النطاق — تأتي من المحرك). */
export function tuneVars(t: Tune): { attrs: Record<string, string>; vars: Record<string, string> } {
  const n = t.num;
  return {
    attrs: { elevation: t.en.elevation === "soft" ? "" : t.en.elevation, scroll: t.en.scroll === "smooth" ? "smooth" : "", focus: t.en.focusRing === "contrast" ? "contrast" : "", weight: t.en.textWeight === "bold" ? "bold" : "", iconTint: t.num.iconTint > 0 ? "on" : "" },
    vars: {
      "--sf-pill-veil": String(n.veilPill), "--sf-panel-veil": String(n.veilPanel), "--sf-cards-veil": String(n.veilCards), "--sf-pop-veil": String(n.veilPop),
      "--sf-pill-edge": String(n.edgePill), "--sf-panel-edge": String(n.edgePanel), "--sf-cards-edge": String(n.edgeCards), "--sf-pop-edge": String(n.edgePop),
      "--icon-k": String(n.iconScale), "--icon-tint": `${n.iconTint}%`, "--hover-k": String(n.hoverK),
      "--text-weight": t.en.textWeight === "bold" ? "700" : "400",
      "--press-btn": String(PRESS[t.en.press].btn), "--press-tap": String(PRESS[t.en.press].tap),
    },
  };
}

/** فحص تباين حيّ لتجاوز رمز خام (محرر الخبير): يعيد الأسطر الفاشلة. القاعدة = --glass-base الفعلية (أو المتجاوزة). */
export interface TokenCheck { token: string; ratio: number; min: number; ok: boolean; against: string }
export function checkTokens(tokens: Partial<Record<TokenKey, string>>, base: RGB, fg: RGB, accent: RGB): TokenCheck[] {
  const b = tokens["--glass-base"] ? hexToRgb(tokens["--glass-base"]) : base;
  const f = tokens["--island-fg"] ? hexToRgb(tokens["--island-fg"]) : fg;
  const a = tokens["--accent"] ? hexToRgb(tokens["--accent"]) : accent;
  const rows: TokenCheck[] = [
    { token: "--island-fg", ratio: contrast(f, b), min: 4.5, ok: false, against: "--glass-base" },
    { token: "--accent", ratio: contrast(a, b), min: 3, ok: false, against: "--glass-base" },
  ];
  for (const k of ["--c-success", "--c-warning", "--c-danger", "--c-info"] as const) if (tokens[k]) rows.push({ token: k, ratio: contrast(hexToRgb(tokens[k]!), b), min: 4.5, ok: false, against: "--glass-base" });
  if (tokens["--c-surface-raised"]) rows.push({ token: "--c-surface-raised", ratio: contrast(f, hexToRgb(tokens["--c-surface-raised"]!)), min: 4.5, ok: false, against: "--island-fg" });
  return rows.map((r) => ({ ...r, ratio: Math.round(r.ratio * 100) / 100, ok: r.ratio >= r.min - 0.005 }));
}
