// غلاف الوسائط بحجم العرض (Q): Rust يبثّ مصغّرة GSMTC كما هي (حتى 6MB، غالبًا 1280×720 أو أكبر) فكانت تُفكّ كاملةً في كل مستهلك
// (<img> الحبة، <img> اللمحة/اللوحة، خلفية الغلاف المموّهة، FastAverageColor، Liquid). هنا تُصغَّر مرة واحدة إلى سقف ضلع واحد
// (COVER_MAX) وتُرسَل نسخة واحدة صغيرة للجميع. الأبعاد تُحفظ لاختيار الإطار (فيديو 16:9 / صوت مربّع).
export const COVER_MAX = 480;

export interface CoverInfo { uri: string; /** أبعاد الصورة المعروضة (بعد التصغير) */ w: number; h: number; }

/** منطق خالص: أبعاد الصورة بعد التصغير (يحفظ النسبة، لا يكبّر أبدًا). */
export function fitSize(w: number, h: number, max = COVER_MAX): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export type ThumbKind = "video" | "audio";
/** نوع الإطار من نسبة الصورة: عريضة (≥1.3) ⇒ فيديو 16:9؛ وإلا غلاف صوت مربّع. غير معروف ⇒ مربّع. */
export function thumbKind(w: number, h: number): ThumbKind {
  return w > 0 && h > 0 && w / h >= 1.3 ? "video" : "audio";
}

/** يُصغّر data-URI إلى سقف COVER_MAX (WebP لحفظ الشفافية) — صورة أصغر من السقف تُعاد كما هي. أي فشل ⇒ الأصل بلا أبعاد معروفة. */
export async function shrinkCover(raw: string): Promise<CoverInfo> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = raw;
    await img.decode();
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const fit = fitSize(nw, nh);
    if (fit.w === 0) return { uri: raw, w: 0, h: 0 };
    if (fit.w === nw && fit.h === nh) { img.src = ""; return { uri: raw, w: nw, h: nh }; }
    const c = document.createElement("canvas");
    c.width = fit.w; c.height = fit.h;
    const g = c.getContext("2d");
    if (!g) return { uri: raw, w: nw, h: nh };
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, fit.w, fit.h);
    const uri = c.toDataURL("image/webp", 0.9);
    img.src = ""; c.width = c.height = 0; // أفرج عن الذاكرة فورًا
    // بعض المحرّكات تعيد PNG إن لم تدعم WebP: يبقى صالحًا، ونتجنّب النسخة الأكبر من الأصل.
    return uri.length < raw.length ? { uri, w: fit.w, h: fit.h } : { uri: raw, w: nw, h: nh };
  } catch {
    return { uri: raw, w: 0, h: 0 };
  }
}
