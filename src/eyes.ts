/**
 * منطق عيون التميمة الخالص (بلا React ولا Tauri) — يُختبَر بـ scripts/eyes.test.mjs.
 * الهندسة مأخوذة بنسب islandly الدقيقة ومكيَّفة تناسبيًا لارتفاع حبتنا (32px):
 * في islandly: عينان كبسوليتان 13×26 داخل حبة 138×36، ميلان 11°، مسافة المركزين 22px (فجوة ≈9px).
 * العيون مرسومة بالكود فقط (div كبسولي) — لا Lottie ولا صور.
 */
export const REF = { pillH: 36, w: 13, h: 26, tilt: 11, centers: 22 } as const;
/** ارتفاع حبتنا المنكمشة. */
export const PILL_H = 32;

export interface EyeGeometry { w: number; h: number; tilt: number; centers: number; gap: number }
export function eyeGeometry(pillH: number = PILL_H): EyeGeometry {
  const k = pillH / REF.pillH;
  return { w: REF.w * k, h: REF.h * k, tilt: REF.tilt, centers: REF.centers * k, gap: (REF.centers - REF.w) * k };
}

/** مسافة الاستيقاظ (px) — يطابق mascot::NEAR_PX في الخلفية. */
export const NEAR_PX = 240;

/** ما تبثّه الخلفية (mascot:look): موضع المؤشر الحقيقي في إحداثيات صفحة main. */
export interface Look { x: number; y: number; over: boolean; near: boolean }

export type EyeMode = "awake" | "sleepy" | "happy";

/** الحالة من العيّنة: فوق الحبة ⇒ انضغاط سعيد · قريب ⇒ مستيقظ (يتتبّع) · بعيد ⇒ نعسان. قبل أول عيّنة ⇒ مستيقظ. */
export function eyeMode(l: Look | null): EyeMode {
  if (!l) return "awake";
  if (l.over) return "happy";
  return l.near ? "awake" : "sleepy";
}

export interface Pose { sx: number; sy: number; rot: number; y: number; opacity: number }
/** وضعيات الحالات (كلها نسبة إلى العين المفتوحة). rot = الميلان بالدرجات (يُعكس للعين الأخرى). */
export const POSES: Record<EyeMode, Pose> = {
  awake: { sx: 1, sy: 1, rot: REF.tilt, y: 0, opacity: 1 },
  sleepy: { sx: 1.18, sy: 0.24, rot: 4, y: 1, opacity: 0.72 },
  happy: { sx: 1.2, sy: 0.44, rot: 18, y: -1, opacity: 1 },
};

/**
 * إزاحة انزلاق المجموعة نحو المؤشر: dx/dy = المؤشر − مركز العينين (px، فيزيائي).
 * منحنى tanh ناعم: يتناسب مع المسافة قرب المركز ثم يشبع عند حدّ الحبة — لا اتجاهات ثابتة.
 */
export function eyeOffset(dx: number, dy: number, pillH: number = PILL_H): { x: number; y: number } {
  const maxX = pillH * 0.16;
  const maxY = pillH * 0.09;
  return { x: maxX * Math.tanh(dx / 110), y: maxY * Math.tanh(dy / 60) };
}

/** ترتيب العينين/الساعة ينعكس بالعربية فقط (التتبّع لا يتأثر). */
export const rowReversed = (lang: "ar" | "en"): boolean => lang === "ar";

/** فاصل الرمشة التالية (ms) من عدد عشوائي r∈[0,1). */
export const blinkDelay = (r: number, minMs: number, maxMs: number): number => Math.round(minMs + r * (maxMs - minMs));

/** هل تُخفى العيون (تبقى نقطة خضراء + الساعة)؟ ملء الشاشة/الحبة مخفية · وضع التوفير · الحركة متوقفة. */
export const eyesHidden = (o: { islandHidden: boolean; eco: boolean; motionOff: boolean }): boolean =>
  o.islandHidden || o.eco || o.motionOff;
