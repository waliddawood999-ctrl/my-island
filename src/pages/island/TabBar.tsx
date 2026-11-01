import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { spring, tap } from "../../motion";

/**
 * شريط التبويبات بمؤشر ذي حافتين على نابضين مختلفين (docs/MOTION.md §مؤشر التبويب):
 * الحافة القائدة (باتجاه الحركة) نابضها أسرع فيتمدد المؤشر أولًا ثم تلحق التابعة.
 * الحاوية LTR بنيويًا فاليمين/اليسار فيزيائيان.
 */
export type TabsStyle = "labels" | "icons" | "dots";
export function TabBar({ labels, icons, variant = "labels", active, onSelect, onHint }: { labels: string[]; icons?: ReactNode[]; variant?: TabsStyle; active: number; onSelect: (n: number) => void; onHint?: (n: number) => void }) {
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
      {edge && variant !== "dots" && (
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
          onPointerEnter={() => onHint?.(n)}
          onFocus={() => onHint?.(n)}
          whileTap={tap.whileTap}
          transition={tap.transition}
          aria-label={variant === "labels" ? undefined : label}
          title={variant === "labels" ? undefined : label}
          className={variant === "labels"
            ? `relative z-10 rounded-full px-3.5 py-1.5 text-[13px] ${active === n ? "text-white" : "text-white/60 hover:text-white"}`
            : variant === "icons"
              ? `relative z-10 grid h-[30px] w-[30px] place-items-center rounded-full ${active === n ? "text-white" : "text-white/60 hover:text-white"}`
              : "relative z-10 h-[7px] self-center rounded-full"}
          style={variant === "dots" ? { width: active === n ? 18 : 7, background: active === n ? "currentColor" : "color-mix(in srgb, currentColor 35%, transparent)", transition: "width 200ms ease, background-color 200ms ease" } : undefined}
        >
          {variant === "labels" ? label : variant === "icons" ? icons?.[n] : null}
        </motion.button>
      ))}
    </div>
  );
}
