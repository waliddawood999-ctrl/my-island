/**
 * ثوابت الحركة المشتركة — المرجع الوحيد لأي حركة في الواجهة (انظر docs/MOTION.md).
 * كل حركة جديدة عبر مكتبة `motion` وهذه الثوابت فقط؛ لا قيم زمنية/نوابض مبعثرة في المكوّنات.
 */
import type { Transition, Variants } from "motion/react";

/** نوابض: تجاوز (overshoot) بسيط جدًا كحد أقصى — damping مرتفع نسبيًا. */
export const spring = {
  /** تحوّل الحبة↔اللوحة: الحجم والانحناء (عنصر واحد يتحوّل دون قطع). */
  island: { type: "spring", stiffness: 380, damping: 36, mass: 0.9 },
  /** ظهور عناصر داخل اللوحة وأقسامها. */
  content: { type: "spring", stiffness: 420, damping: 38, mass: 0.8 },
  /** ضغط/تحويم الأزرار — سريع بلا تجاوز. */
  press: { type: "spring", stiffness: 700, damping: 40, mass: 0.5 },
  /** حافة مؤشر التبويب القائدة (تتمدد أولًا). */
  tabLead: { type: "spring", stiffness: 620, damping: 38, mass: 0.7 },
  /** حافة مؤشر التبويب التابعة (أبطأ فيتمدد المؤشر ثم ينكمش). */
  tabTrail: { type: "spring", stiffness: 300, damping: 34, mass: 0.8 },
} as const satisfies Record<string, Transition>;

/** منحنيات easing (cubic-bezier) لما لا يناسبه نابض: التلاشي والتمويه. */
export const ease = {
  out: [0.2, 0.8, 0.2, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** مدد (ثوانٍ). */
export const dur = {
  fast: 0.12,
  base: 0.18,
  swap: 0.2,
  /** احتياط لتأخير تصغير النافذة إن لم يصل رد اكتمال الحركة. */
  windowShrinkGuard: 0.9,
  /** هزّة جرس تنبيه التذكير/المؤقّت (ثوانٍ لكل دورة؛ تتكرر مرتين). */
  alert: 0.6,
} as const;

/** تمويه قصير للمحتوى المتبدّل (px). */
export const blur = { swap: 6, section: 4 } as const;

/** إزاحة دخول/خروج المحتوى (px) — صغيرة عمدًا. */
export const shift = { swap: 6, section: 8 } as const;

/** تأخير تتابع الأقسام (ثوانٍ). */
export const stagger = { section: 0.05 } as const;

/** تبديل محتوى: تمويه قصير، دخول وخروج بتوقيت مستقل لكل نص فلا يتداخلان. */
export const swapVariants: Variants = {
  initial: { opacity: 0, y: shift.swap, filter: `blur(${blur.swap}px)` },
  animate: {
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { ...spring.content, opacity: { duration: dur.swap, ease: ease.out, delay: 0.06 } },
  },
  exit: {
    opacity: 0, y: -shift.swap, filter: `blur(${blur.swap}px)`,
    transition: { duration: dur.fast, ease: ease.inOut },
  },
};

/** ظهور قسم (ميديا/تنزيلات/بطارية) بتتابع. */
export const sectionVariants: Variants = {
  initial: { opacity: 0, y: shift.section, filter: `blur(${blur.section}px)` },
  animate: (n: number = 0) => ({
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { ...spring.content, delay: n * stagger.section, opacity: { duration: dur.swap, ease: ease.out, delay: n * stagger.section } },
  }),
  exit: { opacity: 0, transition: { duration: dur.fast, ease: ease.inOut } },
};

/** ظهور/اختفاء شريط الأوامر. */
export const paletteVariants: Variants = {
  initial: { opacity: 0, scale: 0.97, filter: `blur(${blur.swap}px)` },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { ...spring.content } },
  exit: { opacity: 0, scale: 0.98, filter: `blur(${blur.section}px)`, transition: { duration: dur.fast, ease: ease.inOut } },
};

/** تفاعل الأزرار الموحّد (hover/active) عبر whileHover/whileTap. */
export const tap = { whileHover: { scale: 1.06 }, whileTap: { scale: 0.92 }, transition: spring.press } as const;
