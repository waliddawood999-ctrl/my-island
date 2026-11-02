// حزم الثيمات: كل حزمة = 3 بذور + معاملات آلية (غسلة/توهّج/حبيبات/زخرفة/شكل). المحرك (themeEngine.ts) يشتق منها كل الرموز.
// حزم المصنع ثابتة لا تُعدَّل؛ تخصيصها يولّد «نسخة مستخدم» (myThemes). الأسماء الأجنبية للحزم أسماء علامات لا نصوص واجهة.
import { hexToRgb, mixLin, rgbToHex, type DecorId, type DeriveInput, type Seeds, type WashDir } from "./themeEngine";
import type { ArtSwatches } from "./artwork";

export type PackFamily = "seed" | "gradient" | "craft" | "editorial" | "shape" | "time" | "art" | "custom";
export type ShapeKind = "default" | "sharp" | "squircle" | "arena";
export type PackSource = "windows" | "artwork" | "time";

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
  /** ثنائية تحريرية: أحادي + أكسنت واحد بتباين عالٍ. */
  mono?: boolean;
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

export const PACKS: Pack[] = [...SEED_PACKS];
export const DEFAULT_PACK = OBSIDIAN.id;
export const getPack = (id: unknown): Pack => PACKS.find((p) => p.id === id) ?? OBSIDIAN;

/** مصادر حيّة تُمرَّر للاشتقاق: أكسنت ويندوز · سواتش الغلاف · الإزهار (0..2). */
export interface LiveSources { winAccent?: string | null; art?: ArtSwatches | null; bloom?: number }

/** الحزمة الفعلية: Living Artwork بلا غلاف ⇒ Obsidian (سقوط صامت). */
export const effectivePack = (p: Pack, live: LiveSources = {}): Pack => (p.source === "artwork" && !live.art ? OBSIDIAN : p);

/** يحوّل حزمة إلى دخل المحرك للوضع المطلوب (الأكسنت يمكن تجاوزه من مصدر خارجي). */
export function packInput(p0: Pack, dark: boolean, o: { accent?: string; hueShift?: number; eco?: boolean; borderStrength?: number; live?: LiveSources } = {}): DeriveInput {
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
    hueShift: o.hueShift ?? 0, bloom, lumaFloor: p.source === "artwork", borderStrength: o.borderStrength,
  };
}
