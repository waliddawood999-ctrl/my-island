import type { ReactNode } from "react";
import { motion } from "motion/react";
import { spring } from "../../motion";
import { ringDash } from "../../liveActivity";

/** مقاسات الأيقونات الموحّدة (docs/MOTION.md §الأيقونات): ضربة واحدة 1.75 في كل مكان. */
export const ICON = { sm: 14, md: 16, lg: 20 } as const;
export const STROKE = 1.75;

/** حلقة تقدّم حول عنصر (زر إيقاف/تشغيل). التقدّم بنابض المحتوى؛ الحلقة SVG ثابتة لا rAF. */
export function Ring({ p, size = 44, stroke = 3, children }: { p: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const { c, offset } = ringDash(p, r);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="var(--act, currentColor)" opacity={0.2} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke="var(--act, currentColor)"
          strokeDasharray={c} initial={false} animate={{ strokeDashoffset: offset }} transition={spring.content}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

