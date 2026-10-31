import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { spring, tap } from "../../motion";

/**
 * شريط التبويبات بمؤشر ذي حافتين على نابضين مختلفين (docs/MOTION.md §مؤشر التبويب):
 * الحافة القائدة (باتجاه الحركة) نابضها أسرع فيتمدد المؤشر أولًا ثم تلحق التابعة.
 * الحاوية LTR بنيويًا فاليمين/اليسار فيزيائيان.
 */
export function TabBar({ labels, active, onSelect }: { labels: string[]; active: number; onSelect: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const prev = useRef(active);
  const [edge, setEdge] = useState<{ left: number; right: number } | null>(null);
  const [forward, setForward] = useState(true);

  const measure = () => {
    const b = btns.current[active];
    const c = box.current;
    if (!b || !c) return;
    setEdge({ left: b.offsetLeft, right: c.offsetWidth - (b.offsetLeft + b.offsetWidth) });
  };

  useLayoutEffect(() => {
    setForward(active >= prev.current);
    prev.current = active;
    measure();
  }, [active, labels.join("|")]);

  useLayoutEffect(() => {
    const c = box.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    return () => ro.disconnect();
  }, [active]);

  return (
    <div ref={box} dir="ltr" role="tablist" className="relative flex gap-1">
      {edge && (
        <motion.div
          aria-hidden
          className="absolute inset-y-0 rounded-full"
          style={{ background: "var(--island-surface-strong)" }}
          initial={false}
          animate={{ left: edge.left, right: edge.right }}
          transition={{
            left: forward ? spring.tabTrail : spring.tabLead,
            right: forward ? spring.tabLead : spring.tabTrail,
          }}
        />
      )}
      {labels.map((label, n) => (
        <motion.button
          key={n}
          ref={(el) => { btns.current[n] = el; }}
          role="tab"
          dir="auto"
          aria-selected={active === n}
          onClick={() => onSelect(n)}
          whileTap={tap.whileTap}
          transition={tap.transition}
          className={`relative z-10 rounded-full px-3.5 py-1.5 text-[13px] ${active === n ? "text-white" : "text-white/60 hover:text-white"}`}
        >
          {label}
        </motion.button>
      ))}
    </div>
  );
}
