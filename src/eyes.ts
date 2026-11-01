/**
 * منطق عيون التميمة الخالص (بلا React ولا Tauri) — يُختبَر بـ scripts/eyes.test.mjs.
 * مطابقة بصرية لورقتي مواصفات islandly (كبسولات سميكة جريئة كعيون روبوت): الأصل 13×26 داخل حبة 138×36،
 * ميلان 11° (العينان تميلان باتجاه واحد: القمة نحو اليسار «\ \»)، مسافة المركزين 22px، فجوة ≈8.6px.
 * على حبتنا (32px): كبسولة 11.5×21 (≈66% من ارتفاع الحبة؛ صُغّرت ~15% بأمر المالك من 13.5×24.5)، مركزان 19px، فجوة 7.5px.
 * العيون مرسومة بالكود فقط (div) — لا Lottie ولا صور. اللون = لون نص الحبة (أبيض على الداكنة، أسود على الفاتحة).
 */
export const REF = { pillH: 36, w: 13, h: 26, tilt: 11, centers: 22 } as const;
/** ارتفاع حبتنا المنكمشة. */
export const PILL_H = 32;

/** الأبعاد النهائية على حبتنا (px). slotW = عرض خانة العين (أوسع حالة) والمركزان ثابتان 19px. */
export const GEOM = { w: 11.5, h: 21, tilt: 11, centers: 19, slotW: 11.5 } as const;
/** الفجوة بين الكبسولتين المفتوحتين = المركزان − العرض. */
export const GAP = GEOM.centers - GEOM.w;

/** مسافة الاستيقاظ (px) — يطابق mascot::NEAR_PX في الخلفية. */
export const NEAR_PX = 240;

/**
 * ما تبثّه الخلفية (mascot:look): المؤشر الحقيقي بالبكسل **الفيزيائي** + أصل منطقة محتوى النافذة الفيزيائي + معامل DPI لشاشة النافذة.
 * لا تحويل في الخلفية؛ التحويل الوحيد إلى إحداثيات الصفحة (CSS px) هو `toPage` أدناه — فلا يختلط فيزيائي بمنطقي.
 */
export interface Look { cx: number; cy: number; wx: number; wy: number; s: number; over: boolean; near: boolean }

/** المؤشر في إحداثيات صفحة main (CSS px) = (المؤشر − أصل النافذة) ÷ DPI، بلا تقريب. معامل غير صالح ⇒ 1. */
export function toPage(l: Pick<Look, "cx" | "cy" | "wx" | "wy" | "s">): { x: number; y: number } {
  const s = l.s > 0 && Number.isFinite(l.s) ? l.s : 1;
  return { x: (l.cx - l.wx) / s, y: (l.cy - l.wy) / s };
}

/** تقريب إلى بكسل فيزيائي كامل (على شاشة بمقياس s): يرسم الحواف حادّة بلا نصف بكسل. s=1 ⇒ أعداد صحيحة. */
export function snapPx(v: number, s: number): number {
  const k = s > 0 && Number.isFinite(s) ? s : 1;
  return Math.round(v * k) / k;
}

/**
 * إزاحة العينين نحو المؤشر: المؤشر (من الخلفية) نسبةً إلى **مركز العينين الفعلي** على الصفحة (center، CSS px، دون إزاحة الانزلاق الجارية
 * وإلا تغذّت الإزاحة على نفسها)، ثم eyeOffset، ثم تقريب لبكسل فيزيائي كامل.
 */
export function gazeOffset(l: Look, center: { x: number; y: number }, pillH: number = PILL_H): { x: number; y: number } {
  const p = toPage(l);
  const o = eyeOffset(p.x - center.x, p.y - center.y, pillH);
  return { x: snapPx(o.x, l.s), y: snapPx(o.y, l.s) };
}

export type EyeMode = "awake" | "sleepy" | "happy";

/** الحالة من العيّنة: فوق الحبة ⇒ انضغاط سعيد · قريب ⇒ مستيقظ (يتتبّع) · بعيد ⇒ نعسان. قبل أول عيّنة ⇒ مستيقظ. */
export function eyeMode(l: Look | null): EyeMode {
  if (!l) return "awake";
  if (l.over) return "happy";
  return l.near ? "awake" : "sleepy";
}

/**
 * وضعية العين: w/h/radius بالـpx (تُحرَّك فعليًا فتبقى الحواف مستديرة تمامًا)، rot درجات (سالب = القمة لليسار)،
 * cut = نسبة القصّ من الأعلى (0 = كاملة · 0.5 = نصف سفلي بسطح علوي مستوٍ أفقيًا بعد الدوران).
 */
export interface Pose { w: number; h: number; r: number; rot: number; cut: number; y: number }
export const POSES: Record<EyeMode, Pose> = {
  /** كبسولتان ممتلئتان (stadium). */
  awake: { w: GEOM.w, h: GEOM.h, r: GEOM.w / 2, rot: -GEOM.tilt, cut: 0, y: 0 },
  /** نصف مغلقة من الأعلى: نصف سفلي ممتلئ بسطح علوي مستوٍ، بلا ميلان. */
  sleepy: { w: GEOM.w, h: GEOM.h, r: GEOM.w / 2, rot: 0, cut: 0.5, y: 0 },
  /** انضغاط سعيد: كتلتان مضغوطتان بحواف مستديرة. */
  happy: { w: 10.5, h: 10, r: 4, rot: -8, cut: 0, y: 0 },
};
/** عرض العين عند منتصف الرمشة: خط رفيع مائل (يُضغط العرض لا الارتفاع) — نسبة من العرض. */
export const BLINK_X = 0.12;

/**
 * إزاحة انزلاق المجموعة نحو المؤشر: dx/dy = المؤشر − مركز العينين (px، فيزيائي).
 * منحنى tanh ناعم: يتناسب مع المسافة قرب المركز ثم يشبع عند حدّ الحبة — لا اتجاهات ثابتة.
 * الحدّ الرأسي صغير كي تبقى الكبسولة المائلة (≈26.6px) داخل الحبة 32px.
 */
export function eyeOffset(dx: number, dy: number, pillH: number = PILL_H): { x: number; y: number } {
  const maxX = pillH * 0.16;
  const maxY = pillH * 0.06;
  return { x: maxX * Math.tanh(dx / 110), y: maxY * Math.tanh(dy / 60) };
}

/** الامتداد الرأسي للكبسولة المائلة (px). */
export const tiltedExtent = (w = GEOM.w, h = GEOM.h, deg = GEOM.tilt): number => {
  const a = (deg * Math.PI) / 180;
  return h * Math.cos(a) + w * Math.sin(a);
};

/** ترتيب العينين/الساعة ينعكس بالعربية فقط (التتبّع لا يتأثر). */
export const rowReversed = (lang: "ar" | "en"): boolean => lang === "ar";

/** فاصل الرمشة التالية (ms) من عدد عشوائي r∈[0,1). */
export const blinkDelay = (r: number, minMs: number, maxMs: number): number => Math.round(minMs + r * (maxMs - minMs));

/** هل تُخفى العيون (تبقى نقطة خضراء + الساعة)؟ ملء الشاشة/الحبة مخفية · وضع التوفير · الحركة متوقفة. */
export const eyesHidden = (o: { islandHidden: boolean; eco: boolean; motionOff: boolean }): boolean =>
  o.islandHidden || o.eco || o.motionOff;
