// الهالة (ظل + توهّج مرساة): طبقة مُعدّة مسبقًا بمقاس **الهدف** تُرسَم (تُرفَع كطبقة مركّبة) مرة واحدة عند تغيّر الحالة، وأثناء الحركة تتحرّك بالتحويل
// (scale) والعتامة فقط — لا إعادة رسم ولا تمويه حيّ لكل إطار (ARCH · docs/GLASS.md). النابض نفسه الذي يحرّك عرض/ارتفاع الجسم يحرّك المقياس
// من (المرسوم/الهدف) إلى 1، فالعرض المرئي للهالة = الجسم بالضبط (w(t) = A + (B−A)·p(t) = B·scale(t)).
import { animate, motion, useMotionValue, type Transition } from "motion/react";
import { useLayoutEffect, useRef } from "react";

export function IslandHalo({ w, h, radius, opacity, align, transition, opacityTransition }: {
  w: number; h: number; radius: number; opacity: number; align: "left" | "center" | "right"; transition: Transition; opacityTransition: Transition;
}) {
  const sx = useMotionValue(1), sy = useMotionValue(1);
  const prev = useRef({ w, h });
  const tr = useRef(transition);
  tr.current = transition;
  useLayoutEffect(() => {
    const p = prev.current;
    if (p.w === w && p.h === h) return;
    // المرسوم الآن = الهدف السابق × المقياس الحالي (يصحّ أيضًا لو قاطعنا حركة جارية)؛ الهدف الجديد يبدأ من ذلك المقياس نحو 1.
    sx.set((p.w * sx.get()) / w); sy.set((p.h * sy.get()) / h);
    prev.current = { w, h };
    const a = animate(sx, 1, tr.current as never), b = animate(sy, 1, tr.current as never);
    return () => { a.stop(); b.stop(); };
  }, [w, h, sx, sy]);
  const pos = align === "left" ? { left: 0 } : align === "right" ? { right: 0 } : { left: "50%", x: "-50%" };
  const originX = align === "left" ? "0%" : align === "right" ? "100%" : "50%";
  return (
    <motion.span
      aria-hidden className="island-halo" initial={false}
      animate={{ opacity }} transition={{ opacity: opacityTransition }}
      style={{ width: w, height: h, borderRadius: radius, ...pos, scaleX: sx, scaleY: sy, transformOrigin: `${originX} 0px` }}
    />
  );
}
