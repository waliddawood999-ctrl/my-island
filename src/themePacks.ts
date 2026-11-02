// حزم الثيمات: كل حزمة = 3 بذور + معاملات آلية (غسلة/توهّج/حبيبات/زخرفة/شكل). المحرك (themeEngine.ts) يشتق منها كل الرموز.
// حزم المصنع ثابتة لا تُعدَّل؛ تخصيصها يولّد «نسخة مستخدم» (myThemes). الأسماء الأجنبية للحزم أسماء علامات لا نصوص واجهة.
import { hexToRgb, mixLin, rgbToHex, type DecorId, type DeriveInput, type Seeds, type WashDir } from "./themeEngine";
import type { ArtSwatches } from "./artwork";

export type PackFamily = "seed" | "gradient" | "craft" | "editorial" | "shape" | "time" | "art" | "custom";
export type ShapeKind = "default" | "sharp" | "squircle" | "arena";
export type PackSource = "windows" | "artwork" | "time";

/** الشكل قائد: هندسة الثيم = مقياس زوايا البطاقات/الأزرار + أنصاف أقطار الحبة/اللمحة/اللوحة (null = من الإعدادات). */
export interface ShapeTune { corner: number; pillR: number | null; peekR: number | null; panelR: number | null }
export const SHAPES: Record<ShapeKind, ShapeTune> = {
  default: { corner: 1, pillR: null, peekR: null, panelR: null },
  sharp: { corner: 0.35, pillR: 6, peekR: 14, panelR: 16 },
  squircle: { corner: 1.5, pillR: null, peekR: 46, panelR: 52 },
  arena: { corner: 2, pillR: null, peekR: 40, panelR: 44 },
};
/** انحراف درجة الأكسنت مع دورة الشمس: ±24° (ذروة +24° عند الظهر، −24° عند منتصف الليل). */
export const timeHueShift = (hour: number): number => Math.round(24 * Math.sin(((hour - 6) / 24) * 2 * Math.PI) * 100) / 100;

export interface Pack {
  id: string; ar: string; en: string; family: PackFamily; dar: string; den: string;
  seeds: Seeds;
  wash: number; washDir: WashDir; mesh?: string | null; glow: number; grain: number; decor?: DecorId; decorAmount?: number;
  /** حركة بطيئة جدًا للغسلة (عائلة التدرّج) — تنطفئ في Eco. */
  anim?: boolean;
  shape?: ShapeKind;
  /** مصدر حيّ يُشتق منه الأكسنت/البذور وقت التشغيل. */
  source?: PackSource;
  /** مقياس الإزهار الافتراضي (٪) لحزمة Living Artwork. */
  bloom?: number;
  /** ثنائية تحريرية: أحادي + أكسنت واحد بتباين عالٍ (ألفا نص أعلى، بلا غسلة ولا توهّج). */
  ink?: boolean;
  /** متغير «منطقة غلاف بطل الترويسة»: الغلاف يظهر كمنطقة محصورة في أعلى الجزيرة لا بكامل الخلفية. */
  hero?: boolean;
  /** حزمة مستخدم: معرّف الحزمة الأساس (المصنع) التي نُسخت منها. */
  baseId?: string;
}

export const OBSIDIAN: Pack = {
  id: "obsidian", ar: "أوبسيديان", en: "Obsidian", family: "seed", dar: "أزرق أردوازي هادئ — الافتراضية", den: "Calm slate blue — the default",
  seeds: { surface: "#161a24", fg: "#eef1f8", accent: "#6d8dff" },
  wash: 0.85, washDir: "top", glow: 0.55, grain: 0.035,
};

/** الحزم المشتقة من بذور (أ): التسع. */
const SEED_PACKS: Pack[] = [
  OBSIDIAN,
  { id: "aurora", ar: "أورورا", en: "Aurora", family: "seed", dar: "غسلة مخضرّة تتحوّل إلى بنفسجي", den: "A green wash drifting into violet",
    seeds: { surface: "#101a1c", fg: "#eaf6f2", accent: "#4fe3b0" }, mesh: "#9a6bff", wash: 1, washDir: "top", glow: 0.7, grain: 0.04 },
  { id: "ember", ar: "إمبر", en: "Ember", family: "seed", dar: "كهرمان دافئ يتوهّج من الأسفل", den: "Warm amber glowing from below",
    seeds: { surface: "#1c1511", fg: "#f6eee6", accent: "#ffab40" }, wash: 0.9, washDir: "bottom", glow: 0.6, grain: 0.035 },
  { id: "sakura-veil", ar: "ساكورا", en: "Sakura Veil", family: "seed", dar: "وردي مُخفّت بحجاب ناعم", den: "A muted pink under a soft veil",
    seeds: { surface: "#1d1619", fg: "#f7ecf0", accent: "#e08fb0" }, wash: 0.8, washDir: "top", glow: 0.45, grain: 0.03 },
  { id: "evergreen-mist", ar: "ضباب أخضر", en: "Evergreen Mist", family: "seed", dar: "أخضر هادئ بضباب شعاعي", den: "Calm green with a radial mist",
    seeds: { surface: "#111a15", fg: "#e9f3ee", accent: "#5cc79a" }, wash: 0.85, washDir: "radial", glow: 0.5, grain: 0.03 },
  { id: "ultraviolet", ar: "ألترافيوليت", en: "Ultraviolet", family: "seed", dar: "تدرّج بنفسجي-وردي بحبيبات واضحة", den: "A violet-to-pink gradient with visible grain",
    seeds: { surface: "#14101f", fg: "#efeafc", accent: "#9d6bff" }, mesh: "#ff5ccd", wash: 1, washDir: "top", glow: 0.75, grain: 0.07 },
  { id: "porcelain", ar: "بورسلين", en: "Porcelain", family: "seed", dar: "فاتح أولًا — خزف أبيض بأكسنت كوبالت", den: "Light-first — white china with a cobalt accent",
    seeds: { surface: "#f5f3ef", fg: "#1c1b20", accent: "#2f5fd0" }, wash: 0.7, washDir: "top", glow: 0.35, grain: 0.02 },
  { id: "windows-mirror", ar: "مرآة ويندوز", en: "Windows Mirror", family: "seed", dar: "البذرة = أكسنت ويندوز الحيّ من النظام", den: "The seed is the live Windows accent",
    seeds: { surface: "#14161c", fg: "#eef1f8", accent: "#0078d4" }, wash: 0.9, washDir: "top", glow: 0.6, grain: 0.035, source: "windows" },
  { id: "living-artwork", ar: "غلاف حيّ", en: "Living Artwork", family: "art", dar: "غسلة DarkMuted وتوهّج Vibrant من غلاف الوسائط الجارية", den: "A DarkMuted wash and Vibrant glow from the playing cover",
    seeds: { surface: "#161a24", fg: "#eef1f8", accent: "#6d8dff" }, wash: 1, washDir: "top", glow: 1, grain: 0.035, source: "artwork", bloom: 60 },
];

/** عوائل الآليات (ج): الحزم الجديدة فوق التسع. */
const MECH_PACKS: Pack[] = [
  // ب) تدرّج قائد: الغسلة Mesh هي البطل، بحركة بطيئة جدًا اختيارية (والجزيرة مفتوحة فقط؛ تنطفئ في Eco/reduced/off)
  { id: "nebula-mesh", ar: "سديم", en: "Nebula Mesh", family: "gradient", dar: "شبكة تدرّج أزرق-وردي هي بطل الرصّة", den: "A blue-pink mesh wash as the hero",
    seeds: { surface: "#12121f", fg: "#eceafd", accent: "#7b8cff" }, mesh: "#ff6fb5", wash: 1, washDir: "top", glow: 0.8, grain: 0.05, anim: true },
  { id: "borealis", ar: "شفق", en: "Borealis", family: "gradient", dar: "شفق قطبي أخضر-بنفسجي بحركة بطيئة", den: "A green-violet aurora drifting slowly",
    seeds: { surface: "#0f1a1d", fg: "#e8f5f3", accent: "#35e0c1" }, mesh: "#6a7bff", wash: 1, washDir: "top", glow: 0.85, grain: 0.03, anim: true },
  // ج) حرفة وملمس دقيق: طبقة 4–8٪ داخل الرصّة مقصوصة بالشكل (ليست صورة كاملة التغطية)
  { id: "brushed-titanium", ar: "تيتانيوم مصقول", en: "Brushed Titanium", family: "craft", dar: "معدن مصقول بخطوط دقيقة ولمعة", den: "Brushed metal with fine lines and a sheen",
    seeds: { surface: "#16181c", fg: "#eceef2", accent: "#8fb3d9" }, wash: 0.5, washDir: "top", glow: 0.4, grain: 0.02, decor: "metal", decorAmount: 0.06 },
  { id: "frosted-paper", ar: "ورق مُجمّد", en: "Frosted Paper", family: "craft", dar: "فاتح أولًا بملمس ورق مجمّد", den: "Light-first with a frosted-paper feel",
    seeds: { surface: "#f4f2ee", fg: "#1d1c20", accent: "#b05a2f" }, wash: 0.5, washDir: "top", glow: 0.3, grain: 0.015, decor: "paper", decorAmount: 0.06 },
  { id: "carbon-fibre", ar: "ألياف الكربون", en: "Carbon Fibre", family: "craft", dar: "نسيج كربون داكن بأكسنت ناري", den: "A dark carbon weave with a fiery accent",
    seeds: { surface: "#121214", fg: "#efeff1", accent: "#ff5a3c" }, wash: 0.6, washDir: "bottom", glow: 0.5, grain: 0.02, decor: "carbon", decorAmount: 0.05 },
  { id: "linen-sand", ar: "كتّان رملي", en: "Linen Sand", family: "craft", dar: "فاتح أولًا بنسيج كتّان دافئ", den: "Light-first with a warm linen weave",
    seeds: { surface: "#f3eee3", fg: "#231f18", accent: "#2e7d6e" }, wash: 0.5, washDir: "top", glow: 0.25, grain: 0.015, decor: "linen", decorAmount: 0.06 },
  // د) ثنائية تحريرية: أحادي + أكسنت واحد، طابع مطبوع عالي التباين
  { id: "ink-vermilion", ar: "حبر وقرمزي", en: "Ink & Vermilion", family: "editorial", dar: "أحادي + أكسنت قرمزي واحد بطابع مطبوع", den: "Monochrome with a single vermilion accent, print-like",
    seeds: { surface: "#f5f2ea", fg: "#0c0c0c", accent: "#d9381e" }, wash: 0, washDir: "top", glow: 0, grain: 0.02, ink: true },
  // هـ) الشكل قائد: الهندسة هي الثيم
  { id: "angular", ar: "حدّة", en: "Angular", family: "shape", dar: "حادّ زاوي بزوايا شبه مربّعة", den: "Angular and sharp with near-square corners",
    seeds: { surface: "#15171b", fg: "#eef0f3", accent: "#ffcf3d" }, wash: 0.5, washDir: "start", glow: 0.3, grain: 0.02, shape: "sharp" },
  { id: "squircle-max", ar: "سكويركل", en: "Squircle Max", family: "shape", dar: "أقصى استدارة سكويركل", den: "Maximum squircle roundness",
    seeds: { surface: "#171520", fg: "#f0eef8", accent: "#c084fc" }, wash: 0.8, washDir: "top", glow: 0.55, grain: 0.03, shape: "squircle" },
  { id: "arena", ar: "ملعب", en: "Arena", family: "shape", dar: "بطاقات ملعبية (استاد) بالكامل", den: "Fully stadium-shaped cards",
    seeds: { surface: "#12171c", fg: "#ecf2f4", accent: "#4ade80" }, wash: 0.7, washDir: "top", glow: 0.5, grain: 0.03, shape: "arena" },
  // و) واعية بالوقت: درجة الأكسنت تنحرف ±24° مع دورة الشمس
  { id: "solar-drift", ar: "انجراف شمسي", en: "Solar Drift", family: "time", dar: "درجة الأكسنت تتبع دورة الشمس", den: "The accent hue follows the sun's cycle",
    seeds: { surface: "#161a22", fg: "#eef1f8", accent: "#f0a35e" }, wash: 0.9, washDir: "top", glow: 0.6, grain: 0.03, source: "time" },
  // ز) فن قائد: متغير منطقة غلاف بطل الترويسة (الغلاف في أعلى الجزيرة لا بكامل الخلفية)
  { id: "living-artwork-hero", ar: "غلاف حيّ — بطل الترويسة", en: "Living Artwork · Hero", family: "art", dar: "غلاف الوسائط كمنطقة بطل في أعلى الجزيرة", den: "The cover as a hero region at the top of the island",
    seeds: { surface: "#161a24", fg: "#eef1f8", accent: "#6d8dff" }, wash: 1, washDir: "top", glow: 1, grain: 0.035, source: "artwork", bloom: 60, hero: true },
];

export const PACKS: Pack[] = [...SEED_PACKS, ...MECH_PACKS];
export const DEFAULT_PACK = OBSIDIAN.id;
export const getPack = (id: unknown): Pack => PACKS.find((p) => p.id === id) ?? OBSIDIAN;

/** حزمة المستخدم: بذور وتعديلات ضمن نطاقات مصمَّمة فقط (أكسنت · شدة صبغة · توهّج · اتجاه غسلة · حبيبات). المحرك يفرض المقروئية بعدها فيستحيل إنتاج ثيم كاسر للقراءة. */
export interface UserTheme { id: string; name: string; base?: string; accent?: string; wash?: number; glow?: number; washDir?: WashDir; grain?: number }
export const USER_RANGES = { wash: [0, 1], glow: [0, 1], grain: [0, 0.08] } as const;
export const WASH_DIRS: WashDir[] = ["top", "bottom", "start", "end", "radial"];
const clampN = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
/** يطهّر مدخل المستخدم (من إعدادات/استيراد JSON) إلى الأنواع والنطاقات المسموحة؛ غير الصالح يسقط للقيمة الأصلية للحزمة الأساس. */
export function sanitizeUserTheme(u: unknown): UserTheme | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const id = typeof o.id === "string" && /^(custom|u:[a-z0-9]{1,16})$/.test(o.id) ? o.id : null;
  if (!id) return null;
  const out: UserTheme = { id, name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : "Custom" };
  if (typeof o.base === "string" && PACKS.some((p) => p.id === o.base)) out.base = o.base;
  if (typeof o.accent === "string" && /^#[0-9a-f]{6}$/i.test(o.accent)) out.accent = o.accent.toLowerCase();
  if (typeof o.wash === "number") out.wash = clampN(o.wash, ...USER_RANGES.wash, 0.85);
  if (typeof o.glow === "number") out.glow = clampN(o.glow, ...USER_RANGES.glow, 0.55);
  if (typeof o.grain === "number") out.grain = clampN(o.grain, ...USER_RANGES.grain, 0.035);
  if (typeof o.washDir === "string" && (WASH_DIRS as string[]).includes(o.washDir)) out.washDir = o.washDir as WashDir;
  return out;
}
/** حزمة فعلية من إدخال مستخدم: حزمة أساس (مصنع) + تجاوزات؛ حزم المصنع لا تُعدَّل أبدًا. */
export function userPack(u: UserTheme): Pack {
  const b = getPack(u.base ?? "obsidian");
  return {
    ...b, id: u.id, baseId: b.baseId ?? b.id, ar: u.name, en: u.name, family: "custom", dar: "نسخة مستخدم", den: "A user copy",
    seeds: { ...b.seeds, accent: u.accent ?? b.seeds.accent },
    wash: u.wash ?? b.wash, glow: u.glow ?? b.glow, grain: u.grain ?? b.grain, washDir: u.washDir ?? b.washDir,
    // نسخة المستخدم لا ترث مصدرًا حيًّا (windows/artwork/time) لأن أكسنتها صريح؛ الزخرفة/الشكل/الحبر موروثة
    source: b.source && !u.accent ? b.source : undefined,
  };
}
/** حل المعرّف إلى حزمة: مصنع · `custom` (خانة التعديل الحيّة themeCustom) · `u:xxxx` (رفّ «ثيماتي» myThemes). */
export function resolvePack(id: unknown, custom?: unknown, mine?: unknown): Pack {
  if (id === "custom") { const u = sanitizeUserTheme({ id: "custom", name: "Custom", ...(custom && typeof custom === "object" ? custom : {}) }); return u ? userPack(u) : OBSIDIAN; }
  if (typeof id === "string" && id.startsWith("u:") && Array.isArray(mine)) {
    const u = mine.map(sanitizeUserTheme).find((x) => x && x.id === id);
    if (u) return userPack(u);
  }
  return getPack(id);
}

/** مصادر حيّة تُمرَّر للاشتقاق: أكسنت ويندوز · سواتش الغلاف · الإزهار (0..2). */
export interface LiveSources { winAccent?: string | null; art?: ArtSwatches | null; bloom?: number }

/** الحزمة الفعلية: Living Artwork بلا غلاف ⇒ Obsidian (سقوط صامت). */
export const effectivePack = (p: Pack, live: LiveSources = {}): Pack => (p.source === "artwork" && !live.art ? OBSIDIAN : p);

/** يحوّل حزمة إلى دخل المحرك للوضع المطلوب (الأكسنت يمكن تجاوزه من مصدر خارجي). */
export function packInput(p0: Pack, dark: boolean, o: { accent?: string; hueShift?: number; eco?: boolean; borderStrength?: number; live?: LiveSources; anim?: boolean; ink?: boolean } = {}): DeriveInput {
  const live = o.live ?? {};
  const p = effectivePack(p0, live);
  let seeds: Seeds = { ...p.seeds }, washColor: string | undefined, glowColor: string | undefined, bloom = 1;
  if (p.source === "windows" && live.winAccent) {
    seeds = { ...seeds, accent: live.winAccent, surface: rgbToHex(mixLin(hexToRgb(seeds.surface), hexToRgb(live.winAccent), 0.1)) };
  }
  if (p.source === "artwork" && live.art) {
    const a = live.art, vib = a.vibrant ?? a.muted ?? a.avg, dm = a.darkMuted ?? a.muted ?? a.avg;
    seeds = { ...seeds, accent: vib, surface: dm };
    washColor = dm; glowColor = vib;
    bloom = Math.min(2, Math.max(0, live.bloom ?? (p.bloom ?? 60) / 100));
  }
  if (o.accent) seeds = { ...seeds, accent: o.accent };
  return {
    seeds, dark, wash: p.wash, washDir: p.washDir, washMesh: p.mesh ?? null, washColor, glowColor,
    glow: o.eco ? 0 : p.glow, grain: o.eco && p.anim ? 0 : p.grain, decor: p.decor ?? "none", decorAmount: p.decorAmount,
    anim: o.anim, ink: o.ink ?? p.ink, hueShift: o.hueShift ?? 0, bloom, lumaFloor: p.source === "artwork", borderStrength: o.borderStrength,
  };
}
