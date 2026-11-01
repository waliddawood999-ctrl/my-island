// طبقة الزجاج CSS (وصفة css.glass من الموقع المرجعي) — منطق خالص بلا واجهة، يُختبر بـ scripts/glass.test.mjs.
// الطبقة مستقلة عن الزجاج الأصلي (DWM acrylic عبر island_backdrop) وعن glassTint.
export const GLASS_BLUR_DEFAULT = 24, GLASS_BLUR_MIN = 0, GLASS_BLUR_MAX = 40;
export const GLASS_SAT_DEFAULT = 180, GLASS_SAT_MIN = 100, GLASS_SAT_MAX = 200;
/** وضع التوفير: سقف التمويه وتشبّع محايد (حفاظًا على الأداء). */
export const GLASS_ECO_BLUR_MAX = 8, GLASS_ECO_SAT = 100;

const clampInt = (v: unknown, lo: number, hi: number, def: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def;

/** glassBlur صالح 0..40 بكسل (غير ذلك ⇒ 24). */
export const clampGlassBlur = (v: unknown): number => clampInt(v, GLASS_BLUR_MIN, GLASS_BLUR_MAX, GLASS_BLUR_DEFAULT);
/** glassSaturation صالح 100..200 ٪ (غير ذلك ⇒ 180). */
export const clampGlassSaturation = (v: unknown): number => clampInt(v, GLASS_SAT_MIN, GLASS_SAT_MAX, GLASS_SAT_DEFAULT);

/** قيم متغيرات CSS الفعلية: --glass-blur (px) و--glass-saturate (نسبة 1.0..2.0). Eco يختصر blur ≤ 8 وsaturation = 100. */
export function glassVars(blur: unknown, saturation: unknown, eco: boolean): { blur: string; saturate: string } {
  let b = clampGlassBlur(blur), s = clampGlassSaturation(saturation);
  if (eco) { b = Math.min(b, GLASS_ECO_BLUR_MAX); s = GLASS_ECO_SAT; }
  return { blur: `${b}px`, saturate: String(s / 100) };
}
