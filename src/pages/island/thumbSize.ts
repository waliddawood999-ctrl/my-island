// حجم مصغّرة الغلاف/الفيديو حسب مقاس الجزيرة الذي يضبطه المستخدم (لوحة/لمحة): الارتفاع يتناسب مع ارتفاع الحالة والعرض مقيَّد بنسبة من عرضها،
// فالفيديو (16:9) لا يطغى على العنوان والأزرار أبدًا والصوت (مربّع) يكبر معها. الأساس (لمحة 148px ⇒ 72px) محفوظ حرفيًا.
// PURE-BEGIN
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : def);

/** اللوحة (بطاقة المشغّل في الرئيسية): ارتفاع ≈40٪ من ارتفاع اللوحة (72..184)، عرض أقصى 44٪ من عرضها. */
export function panelThumb(panelW: unknown, panelH: unknown): { h: number; maxW: number } {
  const w = num(panelW, 520), h = num(panelH, 290);
  return { h: clamp(Math.round(h * 0.4), 72, 184), maxW: Math.round(w * 0.44) };
}
/** اللمحة: الأساس 72px عند ارتفاع 148px ويتناسب معه (56..110)، عرض أقصى 40٪ من عرضها. */
export function peekThumb(peekW: unknown, peekH: unknown): { h: number; maxW: number } {
  const w = num(peekW, 460), h = num(peekH, 148);
  return { h: clamp(Math.round((72 * h) / 148), 56, 110), maxW: Math.round(w * 0.4) };
}
/** أبعاد الإطار النهائية: الفيديو 16:9 بارتفاع h يُقيَّد بـmaxW (يُصغَّر الارتفاع بالنسبة)، والصوت مربّع. */
export function fitThumb(kind: "video" | "audio", h: number, maxW?: number): { w: number; h: number } {
  const w0 = kind === "video" ? Math.round(h * (16 / 9)) : h;
  if (!maxW || w0 <= maxW) return { w: w0, h };
  return { w: maxW, h: Math.max(1, Math.round((maxW * h) / w0)) };
}
// PURE-END
