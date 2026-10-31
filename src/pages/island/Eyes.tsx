import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { dur, ease, eyeBlink, spring, useEco, useMotionLevel } from "../../motion";
import { i } from "../../i18n";
import { blinkDelay, eyeGeometry, eyeMode, eyeOffset, eyesHidden, POSES, type EyeMode, type Look } from "../../eyes";

const G = eyeGeometry();

/** هل الصفحة ظاهرة؟ (مخفية ⇒ لا تتبّع ولا مؤقّتات.) */
function usePageVisible(): boolean {
  const [v, setV] = useState(() => !document.hidden);
  useEffect(() => {
    const f = () => setV(!document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return v;
}

/**
 * عيون التميمة بجانب الساعة. تُركَّب فقط حين تكون الساعة هي المعروضة في الحبة المنكمشة
 * (الميديا/التنبيه/المؤقّت/التنزيل/التسجيل لها الأولوية فتختفي العيون تلقائيًا بإزالة المكوّن).
 * Hidden ⇒ نقطة خضراء صغيرة بلا تتبّع ولا مؤقّتات.
 */
export function Eyes({ islandHidden }: { islandHidden: boolean }) {
  const { eco } = useEco();
  const motionOff = useMotionLevel() === "off";
  const visible = usePageVisible();
  const hidden = eyesHidden({ islandHidden, eco, motionOff });
  const tracking = !hidden && visible;
  return (
    <AnimatePresence mode="wait" initial={false}>
      {hidden ? (
        <motion.span
          key="dot"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1, transition: spring.content }}
          exit={{ opacity: 0, scale: 0.5, transition: { duration: dur.fast, ease: ease.inOut } }}
          role="img"
          aria-label={i("العيون متوقفة", "Eyes paused")}
          className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
        />
      ) : (
        <EyePair key="eyes" tracking={tracking} />
      )}
    </AnimatePresence>
  );
}

function EyePair({ tracking }: { tracking: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<EyeMode>("awake");
  const modeRef = useRef<EyeMode>("awake");
  // قيم الحركة: الإزاحة، وضعية الحالة، والرمشة (مستقلة فتتراكب).
  const ox = useMotionValue(0), oy = useMotionValue(0);
  const sx = useMotionValue(1), sy = useMotionValue(1), rot = useMotionValue(POSES.awake.rot), py = useMotionValue(0), op = useMotionValue(1);
  const blink = useMotionValue(1);
  const y = useTransform([oy, py], ([a, b]: number[]) => a + b);
  const scaleY = useTransform([sy, blink], ([a, b]: number[]) => a * b);
  const rotL = useTransform(rot, (r) => -r);

  // التتبّع: الخلفية تبثّ mascot:look فقط أثناء التفعيل (خيط مركون وإلا). تفعيل/إيقاف حسب `tracking`.
  useEffect(() => {
    if (!tracking) return;
    const un = listen<Look>("mascot:look", (e) => {
      const l = e.payload;
      const m = eyeMode(l);
      if (m !== modeRef.current) { modeRef.current = m; setMode(m); }
      const r = root.current?.getBoundingClientRect();
      if (!r) return;
      // نائم/سعيد: تستقر العيون في مكانها؛ المستيقظ ينزلق نحو المؤشر الحقيقي.
      const off = m === "awake" ? eyeOffset(l.x - (r.left + r.width / 2), l.y - (r.top + r.height / 2)) : { x: 0, y: 0 };
      animate(ox, off.x, spring.eye);
      animate(oy, off.y, spring.eye);
    });
    invoke("mascot_active", { active: true }).catch(() => {});
    return () => {
      invoke("mascot_active", { active: false }).catch(() => {});
      un.then((f) => f());
    };
  }, [tracking, ox, oy]);

  // وضعية الحالة.
  useEffect(() => {
    const p = POSES[mode];
    const c = [animate(sx, p.sx, spring.eye), animate(sy, p.sy, spring.eye), animate(rot, p.rot, spring.eye), animate(py, p.y, spring.eye), animate(op, p.opacity, spring.eye)];
    return () => c.forEach((a) => a.stop());
  }, [mode, sx, sy, rot, py, op]);

  // رمشة دورية: مؤقّت واحد ما دامت العيون مستيقظة وظاهرة؛ لا شيء في النوم/السعادة/الإخفاء.
  useEffect(() => {
    if (!tracking || mode !== "awake") return;
    let t: number;
    let live = true;
    const arm = () => {
      t = window.setTimeout(async () => {
        await animate(blink, 0.08, eyeBlink.close);
        await animate(blink, 1, eyeBlink.open);
        if (live) arm();
      }, blinkDelay(Math.random(), eyeBlink.minMs, eyeBlink.maxMs));
    };
    arm();
    return () => { live = false; window.clearTimeout(t); blink.set(1); };
  }, [tracking, mode, blink]);

  const eye = (rotate: typeof rot) => (
    <motion.span
      style={{ width: G.w, height: G.h, scaleX: sx, scaleY, rotate, opacity: op }}
      className="block rounded-full bg-white"
    />
  );
  return (
    <motion.div
      ref={root}
      data-eyes={mode}
      aria-hidden
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, transition: spring.content }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: dur.fast, ease: ease.inOut } }}
      style={{ x: ox, y, gap: G.gap, height: G.h }}
      className="flex items-center"
      dir="ltr"
    >
      {eye(rotL)}
      {eye(rot)}
    </motion.div>
  );
}
