import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { dur, ease, eyeBlink, spring, useEco, useMotionLevel } from "../../motion";
import { i } from "../../i18n";
import { BLINK_X, blinkDelay, eyeMode, eyeOffset, eyesHidden, GAP, GEOM, POSES, type EyeMode, type Look } from "../../eyes";

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
  // قيم الحركة: الإزاحة، وضعية الحالة (أبعاد/استدارة/ميلان/قصّ)، والرمشة (ضغط العرض) — مستقلة فتتراكب.
  const ox = useMotionValue(0), oy = useMotionValue(0);
  const P0 = POSES.awake;
  const w = useMotionValue(P0.w), h = useMotionValue(P0.h), r = useMotionValue(P0.r), rot = useMotionValue(P0.rot), cut = useMotionValue(P0.cut);
  const blink = useMotionValue(1);
  // هوامش سالبة: لا يُقصّ ميلان الكبسولة الممتلئة.
  const clip = useTransform(cut, (c) => `inset(${c * GEOM.h - 4 * Math.max(0, 1 - 2 * c)}px -6px -6px -6px)`);

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
    const c = [animate(w, p.w, spring.eye), animate(h, p.h, spring.eye), animate(r, p.r, spring.eye), animate(rot, p.rot, spring.eye), animate(cut, p.cut, spring.eye)];
    return () => c.forEach((a) => a.stop());
  }, [mode, w, h, r, rot, cut]);

  // رمشة دورية: مؤقّت واحد ما دامت العيون مستيقظة وظاهرة؛ لا شيء في النوم/السعادة/الإخفاء.
  useEffect(() => {
    if (!tracking || mode !== "awake") return;
    let t: number;
    let live = true;
    const arm = () => {
      t = window.setTimeout(async () => {
        await animate(blink, BLINK_X, eyeBlink.close);
        await animate(blink, 1, eyeBlink.open);
        if (live) arm();
      }, blinkDelay(Math.random(), eyeBlink.minMs, eyeBlink.maxMs));
    };
    arm();
    return () => { live = false; window.clearTimeout(t); blink.set(1); };
  }, [tracking, mode, blink]);

  // خانة ثابتة العرض (المركزان 22px) تحمل غلاف القصّ (بلا دوران: سطح النعاس أفقي) ثم الكبسولة المائلة.
  const eye = (k: string) => (
    <span key={k} className="flex items-center justify-center" style={{ width: GEOM.slotW, height: GEOM.h }}>
      <motion.span style={{ clipPath: clip, width: GEOM.slotW, height: "100%" }} className="flex items-center justify-center">
        <motion.span
          style={{ width: w, height: h, borderRadius: r, rotate: rot, scaleX: blink }}
          className="block shrink-0 bg-current"
        />
      </motion.span>
    </span>
  );
  return (
    <motion.div
      ref={root}
      data-eyes={mode}
      aria-hidden
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, transition: spring.content }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: dur.fast, ease: ease.inOut } }}
      style={{ x: ox, y: oy, gap: GAP, height: GEOM.h }}
      className="flex items-center"
      dir="ltr"
    >
      {eye("l")}
      {eye("r")}
    </motion.div>
  );
}
