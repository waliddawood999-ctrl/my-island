/**
 * ثوابت الحركة المشتركة — المرجع الوحيد لأي حركة في الواجهة (انظر docs/MOTION.md).
 * كل حركة جديدة عبر مكتبة `motion` وهذه الثوابت فقط؛ لا قيم زمنية/نوابض مبعثرة في المكوّنات.
 *
 * مستويات الحركة (الإعداد `motionLevel`) — نقطة التحكّم الوحيدة:
 *  · full    : نوابض نابضة كما في docs/MOTION.md.
 *  · reduced : انتقالات قصيرة (tween ~120ms) بلا ارتداد ولا تجاوز ولا تمويه ولا تكبير.
 *  · off     : بلا حركة إطلاقًا (مدد 0، بلا إزاحة/تمويه/تكبير، وCSS animation/transition معطّلة عبر data-motion).
 * الثوابت أدناه كائنات حيّة يُحدّثها `setMotionLevel` في مكانها، فلا يتغيّر أي مكوّن قائم: كل `transition={spring.x}`
 * و`variants={…}` يقرأ القيم الحالية عند بدء كل حركة. وضع التوفير (Eco) يخفض full إلى reduced تلقائيًا (resolveMotion).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Transition, Variants } from "motion/react";
import { springPresets, type SpringStyle } from "./tokens";

export type MotionLevel = "full" | "reduced" | "off";
export const MOTION_LEVELS: MotionLevel[] = ["full", "reduced", "off"];

/** منحنيات easing (cubic-bezier) لما لا يناسبه نابض: التلاشي والتمويه. */
export const ease = {
  out: [0.2, 0.8, 0.2, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

type SpringKey = "island" | "content" | "press" | "tabLead" | "tabTrail" | "eye";

/** سرعة الحركة (0.5..1.5) ونمط النابض (snappy/smooth/gentle): من الإعدادين animSpeed/springStyle عبر setMotionTuning.
 *  السرعة تضرب الصلابة في مربعها والتخميد في نفسها (نسبة التخميد ثابتة)، وتقسم المدد. */
let speed = 1;
let style: SpringStyle = "snappy";
/** كل النوابض (لا island/content فقط) تتبع نمط النابض: الصلابة × (صلابة النمط/500) والتخميد × (تخميد النمط/35)، ثم السرعة. */
const sp = (stiffness: number, damping: number, mass: number): Transition => {
  const p = springPresets[style];
  return { type: "spring", stiffness: stiffness * (p.stiffness / 500) * speed * speed, damping: damping * (p.damping / 35) * speed, mass };
};

/** نوابض: تجاوز (overshoot) بسيط جدًا كحد أقصى. */
function buildFullSpring(): Record<SpringKey, Transition> {
  return {
    /** تحوّل الحبة↔اللوحة: الحجم والانحناء (عنصر واحد يتحوّل دون قطع). */
    island: sp(500, 35, 0.9),
    /** ظهور عناصر داخل اللوحة وأقسامها. */
    content: sp(525, 37, 0.8),
    /** ضغط/تحويم الأزرار — سريع بلا تجاوز. */
    press: sp(700, 40, 0.5),
    /** حافة مؤشر التبويب القائدة (تتمدد أولًا). */
    tabLead: sp(620, 38, 0.7),
    /** حافة مؤشر التبويب التابعة (أبطأ فيتمدد المؤشر ثم ينكمش). */
    tabTrail: sp(300, 34, 0.8),
    /** عيون التميمة: انزلاق/تغيّر الحالة — فوق الحرج قليلًا (ζ≈1.1): ناعم بلا أي ارتداد. */
    eye: sp(240, 29, 0.7),
  };
}
let FULL_SPRING: Record<SpringKey, Transition> = buildFullSpring();
const SHORT: Transition = { type: "tween", duration: 0.12, ease: ease.out };
const NONE: Transition = { type: "tween", duration: 0 };
const flat = (t: Transition): Record<SpringKey, Transition> => ({ island: t, content: t, press: t, tabLead: t, tabTrail: t, eye: t });

export const spring: Record<SpringKey, Transition> = { ...FULL_SPRING };

interface Dur { fast: number; base: number; swap: number; windowShrinkGuard: number; alert: number; tabSwitchGuard: number }
/** مدد (ثوانٍ). */
const buildFullDur = (): Dur => ({
  fast: 0.12 / speed,
  base: 0.18 / speed,
  swap: 0.2 / speed,
  /** احتياط لتأخير تصغير النافذة إن لم يصل رد اكتمال الحركة. */
  windowShrinkGuard: 0.9,
  /** هزّة جرس تنبيه التذكير/المؤقّت (ثوانٍ لكل دورة؛ تتكرر مرتين). */
  alert: 0.6,
  /** حارس تبديل التبويب: إن لم يبدأ دخول التبويب الجديد خلال هذه المدة (حركة الخروج لم تكتمل) يُفرَض التبديل. */
  tabSwitchGuard: 0.6,
});
let FULL_DUR: Dur = buildFullDur();
export const dur: Dur = { ...FULL_DUR };

/** رمشة العيون: إغلاق سريع ثم فتح أبطأ قليلًا (tween لا نابض: لا ارتداد)، والفاصل العشوائي بين رمشتين (ms). */
export const eyeBlink: { close: Transition; open: Transition; minMs: number; maxMs: number } = {
  close: { type: "tween", duration: 0.07, ease: ease.inOut },
  open: { type: "tween", duration: 0.13, ease: ease.out },
  minMs: 2800,
  maxMs: 5600,
};

/** تمويه قصير للمحتوى المتبدّل (px). */
export const blur = { swap: 6, section: 4 };
/** إزاحة دخول/خروج المحتوى (px) — صغيرة عمدًا. */
export const shift = { swap: 6, section: 8 };
/** تأخير تتابع الأقسام (ثوانٍ). */
/** item: تتابع عناصر القوائم (حافظة/رفّ/لانشر/تنزيلات) — يُسقَّف عند MAX_STAGGER_ITEMS كي لا يطول التتابع. */
export const stagger = { section: 0.05, item: 0.03 };
export const MAX_STAGGER_ITEMS = 8;
/** تكبير دخول/خروج شريط الأوامر. */
const scale = { enter: 0.97, exit: 0.98 };

/** تفاعل الأزرار الموحّد (hover/active) عبر whileHover/whileTap. */
export const tap: { whileHover: { scale: number }; whileTap: { scale: number }; transition: Transition } = {
  whileHover: { scale: 1.05 }, whileTap: { scale: 0.97 }, transition: spring.press,
};

/** هزّة جرس تنبيه الحبة (Pill): تتوقف في reduced/off. */
export const alertShake: { animate: { rotate: number | number[] }; transition: Transition } = {
  animate: { rotate: [0, -16, 14, -10, 0] }, transition: { duration: dur.alert, repeat: 2 },
};

/** تبديل محتوى: تمويه قصير، دخول وخروج بتوقيت مستقل لكل نص فلا يتداخلان. */
export const swapVariants: Variants = {};
/** ظهور قسم (ميديا/تنزيلات/بطارية) بتتابع. */
export const sectionVariants: Variants = {};
/** ظهور/اختفاء شريط الأوامر. */
export const paletteVariants: Variants = {};
/** دخول عنصر قائمة بتتابع خفيف (custom = فهرس العنصر): شفافية + إزاحة صغيرة بنابض المحتوى، بلا تمويه (تكلفة أقل على قوائم طويلة). */
export const itemVariants: Variants = {};

function buildVariants() {
  Object.keys(swapVariants).forEach((k) => delete swapVariants[k]);
  Object.assign(swapVariants, {
    initial: { opacity: 0, y: shift.swap, filter: `blur(${blur.swap}px)` },
    animate: {
      opacity: 1, y: 0, filter: "blur(0px)",
      transition: { ...spring.content, opacity: { duration: dur.swap, ease: ease.out, delay: level === "full" ? 0.06 : 0 } },
    },
    exit: {
      opacity: 0, y: -shift.swap, filter: `blur(${blur.swap}px)`,
      transition: { duration: dur.fast, ease: ease.inOut },
    },
  } satisfies Variants);
  Object.keys(sectionVariants).forEach((k) => delete sectionVariants[k]);
  Object.assign(sectionVariants, {
    initial: { opacity: 0, y: shift.section, filter: `blur(${blur.section}px)` },
    animate: (n: number = 0) => ({
      opacity: 1, y: 0, filter: "blur(0px)",
      transition: { ...spring.content, delay: n * stagger.section, opacity: { duration: dur.swap, ease: ease.out, delay: n * stagger.section } },
    }),
    exit: { opacity: 0, transition: { duration: dur.fast, ease: ease.inOut } },
  } satisfies Variants);
  Object.keys(itemVariants).forEach((k) => delete itemVariants[k]);
  Object.assign(itemVariants, {
    initial: { opacity: 0, y: shift.section },
    animate: (n: number = 0) => {
      const d = Math.min(Math.max(0, n), MAX_STAGGER_ITEMS) * stagger.item;
      return { opacity: 1, y: 0, transition: { ...spring.content, delay: d, opacity: { duration: dur.swap, ease: ease.out, delay: d } } };
    },
    exit: { opacity: 0, transition: { duration: dur.fast, ease: ease.inOut } },
  } satisfies Variants);
  Object.keys(paletteVariants).forEach((k) => delete paletteVariants[k]);
  Object.assign(paletteVariants, {
    initial: { opacity: 0, scale: scale.enter, filter: `blur(${blur.swap}px)` },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { ...spring.content } },
    exit: { opacity: 0, scale: scale.exit, filter: `blur(${blur.section}px)`, transition: { duration: dur.fast, ease: ease.inOut } },
  } satisfies Variants);
}

// ───────── مستوى الحركة (نقطة التحكّم الوحيدة) ─────────

let level: MotionLevel = "full";
const subs = new Set<() => void>();

/** الإعداد المختار + حالة Eco ⇒ المستوى الفعلي. قيمة غير صالحة ⇒ full؛ Eco يخفض full إلى reduced (ولا يرفع off). */
export function resolveMotion(chosen: unknown, eco: boolean): MotionLevel {
  const c: MotionLevel = chosen === "reduced" || chosen === "off" ? chosen : "full";
  return eco && c === "full" ? "reduced" : c;
}

/** يطبّق المستوى على كل الثوابت الحيّة وعلى <html data-motion> (لـCSS)، ثم يُعلم المشتركين. */
export function setMotionLevel(l: MotionLevel) {
  level = l;
  FULL_SPRING = buildFullSpring();
  FULL_DUR = buildFullDur();
  if (l === "full") {
    Object.assign(spring, FULL_SPRING);
    Object.assign(dur, FULL_DUR);
    Object.assign(blur, { swap: 6, section: 4 });
    Object.assign(shift, { swap: 6, section: 8 });
    Object.assign(stagger, { section: 0.05, item: 0.03 });
    Object.assign(scale, { enter: 0.97, exit: 0.98 });
    tap.whileHover = { scale: 1.05 }; tap.whileTap = { scale: 0.97 };
    alertShake.animate = { rotate: [0, -16, 14, -10, 0] };
    alertShake.transition = { duration: FULL_DUR.alert, repeat: 2 };
    eyeBlink.close = { type: "tween", duration: 0.07, ease: ease.inOut };
    eyeBlink.open = { type: "tween", duration: 0.13, ease: ease.out };
  } else {
    const t = l === "off" ? NONE : SHORT;
    Object.assign(spring, flat(t));
    const d = l === "off" ? 0 : 0.1;
    Object.assign(dur, { fast: d * 0.8, base: d, swap: d, windowShrinkGuard: FULL_DUR.windowShrinkGuard, alert: FULL_DUR.alert });
    Object.assign(blur, { swap: 0, section: 0 });
    Object.assign(shift, { swap: l === "off" ? 0 : 2, section: l === "off" ? 0 : 3 });
    Object.assign(stagger, { section: 0, item: 0 });
    Object.assign(scale, { enter: l === "off" ? 1 : 0.995, exit: 1 });
    tap.whileHover = { scale: l === "off" ? 1 : 1.02 }; tap.whileTap = { scale: l === "off" ? 1 : 0.97 };
    alertShake.animate = { rotate: 0 };
    alertShake.transition = NONE;
    eyeBlink.close = l === "off" ? NONE : { type: "tween", duration: 0.05, ease: ease.inOut };
    eyeBlink.open = l === "off" ? NONE : SHORT;
  }
  tap.transition = spring.press;
  buildVariants();
  if (typeof document !== "undefined") document.documentElement.dataset.motion = l;
  subs.forEach((f) => f());
}

/** سرعة ونمط النابض من الإعدادات (قيم غير صالحة ⇒ الافتراضي)؛ تعيد بناء الثوابت الحيّة عند التغيّر فقط. */
export function setMotionTuning(animSpeed: unknown, springStyle: unknown) {
  const sp2 = typeof animSpeed === "number" && Number.isFinite(animSpeed) ? Math.min(150, Math.max(50, animSpeed)) / 100 : 1;
  const st: SpringStyle = springStyle === "smooth" || springStyle === "gentle" ? springStyle : "snappy";
  if (sp2 === speed && st === style) return;
  speed = sp2; style = st;
  setMotionLevel(level);
}

export const motionLevel = (): MotionLevel => level;

/** يشترك المكوّن في المستوى الفعلي (يعيد الرسم عند تغيّره). */
export function useMotionLevel(): MotionLevel {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => level, () => level);
}

export interface EcoStatus { eco: boolean; reason: "manual" | "battery" | null; onBattery: boolean | null }
const ECO_OFF: EcoStatus = { eco: false, reason: null, onBattery: null };

/** حالة وضع التوفير من الخلفية (perf_status + حدث perf:eco). */
// آخر حالة معروفة على مستوى الوحدة: المكوّنات التي تُركَّب لاحقًا (تبويب النظام/«اليوم») تبدأ بالحالة الصحيحة
// فلا تُطلق استدعاءً واحدًا قبل وصول perf_status (وأي استدعاء مبكر يردّه الحارس في الخلفية أيضًا).
let LAST_ECO: EcoStatus = ECO_OFF;
export function useEco(): EcoStatus {
  const [st, setSt] = useState<EcoStatus>(LAST_ECO);
  useEffect(() => {
    let alive = true;
    const apply = (v: EcoStatus) => { LAST_ECO = v; if (alive) setSt(v); };
    invoke<EcoStatus>("perf_status").then((v) => { if (v) apply(v); }).catch(() => {});
    const un = listen<EcoStatus>("perf:eco", (e) => apply(e.payload));
    return () => { alive = false; un.then((f) => f()); };
  }, []);
  return st;
}

/** يربط الإعداد المختار + Eco بالمستوى الفعلي في هذه النافذة (يُستدعى من useSettings فتغطي النوافذ الأربع). */
export function useMotionSync(chosen: unknown) {
  const { eco } = useEco();
  const eff = resolveMotion(chosen, eco);
  useEffect(() => { setMotionLevel(eff); }, [eff]);
}

buildVariants();
