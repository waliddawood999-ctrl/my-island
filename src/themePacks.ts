// حزم الثيمات: كل حزمة = 3 بذور + معاملات آلية (غسلة/توهّج/حبيبات/زخرفة/شكل). المحرك (themeEngine.ts) يشتق منها كل الرموز.
// حزم المصنع ثابتة لا تُعدَّل؛ تخصيصها يولّد «نسخة مستخدم» (myThemes). الأسماء الأجنبية للحزم أسماء علامات لا نصوص واجهة.
import type { DecorId, DeriveInput, Seeds, WashDir } from "./themeEngine";

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

export const PACKS: Pack[] = [OBSIDIAN];
export const DEFAULT_PACK = OBSIDIAN.id;
export const getPack = (id: unknown): Pack => PACKS.find((p) => p.id === id) ?? OBSIDIAN;

/** يحوّل حزمة إلى دخل المحرك للوضع المطلوب (الأكسنت يمكن تجاوزه من مصدر خارجي). */
export function packInput(p: Pack, dark: boolean, o: { accent?: string; hueShift?: number; bloom?: number; eco?: boolean; borderStrength?: number } = {}): DeriveInput {
  return {
    seeds: { ...p.seeds, accent: o.accent ?? p.seeds.accent },
    dark, wash: p.wash, washDir: p.washDir, washMesh: p.mesh ?? null,
    glow: o.eco ? 0 : p.glow, grain: o.eco && p.anim ? 0 : p.grain, decor: p.decor ?? "none", decorAmount: p.decorAmount,
    hueShift: o.hueShift ?? 0, bloom: o.bloom ?? 1, lumaFloor: p.source === "artwork", borderStrength: o.borderStrength,
  };
}
