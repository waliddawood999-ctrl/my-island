// حركة الجزيرة (T03) — منطق خالص يُختبر بـscripts/island.test.mjs. النوابض تُشتق من (مدة d، ارتداد b):
//   stiffness = (2π/d)² · damping = 4π(1−b)/d · mass = 1،  حيث d = مدة النمط ÷ motionSpeed.
// الفتح للمحة: (d, b) · فتح اللوحة: (d×1.1, b) · أي إغلاق: (d×0.9, 0) فلا ارتداد عند الإغلاق أبدًا.
export const MOTION_PRESETS = {
  calm: { duration: 0.5, bounce: 0.1, ar: "هادئ", en: "Calm" },
  snappy: { duration: 0.38, bounce: 0.15, ar: "سريع", en: "Snappy" },
  bouncy: { duration: 0.5, bounce: 0.3, ar: "مرن", en: "Bouncy" },
  boringNotch: { duration: 0.42, bounce: 0.2, ar: "boring.notch", en: "boring.notch" },
  cultUi: { duration: 0.31, bounce: 0.25, ar: "Cult UI", en: "Cult UI" },
} as const;
export type MotionPresetKey = keyof typeof MOTION_PRESETS;
export const MOTION_PRESET_KEYS = Object.keys(MOTION_PRESETS) as MotionPresetKey[];
export type SpringKind = "open" | "panel" | "close";

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
export const normPreset = (v: unknown): MotionPresetKey => (typeof v === "string" && v in MOTION_PRESETS ? (v as MotionPresetKey) : "calm");
export const normSpeed = (v: unknown) => clamp(v, 0.5, 2, 1);
export const normBounce = (v: unknown) => clamp(v, 0, 0.4, 0.1);

export interface SpringT { type: "spring"; stiffness: number; damping: number; mass: 1 }
/** النابض المشتق. kind=close ⇒ ارتداد 0 وأقصر بـ10٪؛ panel ⇒ أطول بـ10٪. */
export function deriveSpring(kind: SpringKind, preset: MotionPresetKey, speed: number, bounce: number): SpringT {
  const p = MOTION_PRESETS[preset];
  const d0 = p.duration / normSpeed(speed);
  const d = kind === "panel" ? d0 * 1.1 : kind === "close" ? d0 * 0.9 : d0;
  const b = kind === "close" ? 0 : normBounce(bounce);
  return { type: "spring", stiffness: (2 * Math.PI / d) ** 2, damping: (4 * Math.PI * (1 - b)) / d, mass: 1 };
}
/** القيم الافتراضية لنمط عند سرعة 1 وارتداده المحدّد (للاختبار/الوثائق). */
export const presetBounce = (k: MotionPresetKey) => MOTION_PRESETS[k].bounce;

/** تقليل الحركة: always ⇒ نعم · never ⇒ لا · system ⇒ تفضيل النظام (إظهار الرسوم المتحركة / prefers-reduced-motion). */
export function resolveReduce(setting: unknown, osReduced: boolean): boolean {
  return setting === "always" ? true : setting === "never" ? false : osReduced;
}
/** ترحيل reduceMotion القديم (bool) إلى النص: true⇒always، false/غير صالح⇒system. */
export function migrateReduce(v: unknown): "system" | "always" | "never" {
  return v === "always" || v === "never" || v === "system" ? v : v === true ? "always" : "system";
}
/** ترحيل springStyle القديم: smooth/gentle⇒calm، snappy⇒snappy، غير ذلك⇒calm. */
export function migratePreset(springStyle: unknown): MotionPresetKey {
  return springStyle === "snappy" ? "snappy" : "calm";
}
/** ترحيل animSpeed القديم (50..150 ٪) إلى motionSpeed (0.5..2). */
export function migrateSpeed(animSpeed: unknown): number {
  return typeof animSpeed === "number" && Number.isFinite(animSpeed) ? normSpeed(animSpeed / 100) : 1;
}

/** تبديل المحتوى عند تغيّر الحالة (ثوانٍ، speed مقسوم): الخروج 120ms ease-in ثم الدخول (opacity/blur 240ms ease-out، transform 300ms). */
export const EASE_OUT_SOFT = [0.2, 0.8, 0.2, 1] as const;
export function crossfade(speed: number, reduced: boolean) {
  const s = normSpeed(speed);
  if (reduced) {
    return {
      hidden: { opacity: 0, transition: { duration: 0.15 } },
      shown: { opacity: 1, transition: { duration: 0.15 } },
    };
  }
  return {
    hidden: { opacity: 0, filter: "blur(6px)", y: 4, scale: 0.98, transition: { duration: 0.12 / s, ease: "easeIn" as const } },
    shown: {
      opacity: 1, filter: "blur(0px)", y: 0, scale: 1,
      transition: {
        delay: 0.12 / s,
        opacity: { duration: 0.24 / s, ease: "easeOut" as const, delay: 0.12 / s },
        filter: { duration: 0.24 / s, ease: "easeOut" as const, delay: 0.12 / s },
        y: { duration: 0.3 / s, ease: EASE_OUT_SOFT, delay: 0.12 / s },
        scale: { duration: 0.3 / s, ease: EASE_OUT_SOFT, delay: 0.12 / s },
      },
    },
  };
}
/** بطاقات اللمحة: dir=+1 (عجلة لأسفل) أو −1. خروج 110ms ثم قفز بلا انتقال إلى +20·dir ثم دخول. */
export function peekCardVariants(speed: number, reduced: boolean) {
  const s = normSpeed(speed);
  if (reduced) return { out: () => ({ opacity: 0, transition: { duration: 0.15 } }), enter: () => ({ opacity: 0, x: 0 }), in: { opacity: 1, x: 0, transition: { duration: 0.15 } } };
  return {
    out: (dir: number) => ({ opacity: 0, filter: "blur(4px)", x: -20 * dir, transition: { duration: 0.11 / s, ease: "easeIn" as const } }),
    enter: (dir: number) => ({ opacity: 0, filter: "blur(4px)", x: 20 * dir, transition: { duration: 0 } }),
    in: {
      opacity: 1, filter: "blur(0px)", x: 0,
      transition: { opacity: { duration: 0.22 / s, ease: "easeOut" as const }, filter: { duration: 0.22 / s, ease: "easeOut" as const }, x: { duration: 0.28 / s, ease: EASE_OUT_SOFT } },
    },
  };
}
export const DOT_TRANSITION_MS = 200;
