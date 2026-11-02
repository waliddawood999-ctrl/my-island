import { memo, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Film, Music } from "lucide-react";
import { dur, ease, spring, thumbHover } from "../../motion";
import { THUMB } from "../../tokens";
import { thumbKind, type ThumbKind } from "../../coverImage";
import { classifySource } from "../../mediaSource";
import { fmtTime } from "../../seek";

// المصغّرة الاحترافية (P · docs/MOTION.md §المصغّرة): نسبة أصلية بلا مطّ (16:9 فيديو / مربّعة صوت) بارتفاع واحد THUMB.h في الإطلالة واللوحة،
// عنصر نائب بنفس الأبعاد، تلاشٍ متقاطع عند تبدّل الصورة، وميض هيكلي أثناء التحميل، شارة مدّة زجاجية، وهالة محيطية من لون الإبراز.
// كل الزخرفة (هالة/تمويه/وميض/تمرير) تُعطَّل مع reduce (Eco/تقليل الحركة) ولا يوجد أي rAF هنا: تحويلات/CSS فقط.

/** نوع الإطار قبل وصول الصورة: المتصفحات ⇒ فيديو، غيرها ⇒ صوت (يتأكّد بنسبة الصورة عند وصولها). */
export function guessKind(aumid: string, friendly: string): ThumbKind {
  const k = classifySource(aumid, friendly).kind;
  return k === "other" || k === "spotify" ? "audio" : "video";
}

/** هل تتّسع الصورة للإطار بلا قصّ مشوِّه؟ نسبتها ضمن ±10٪ من نسبة الإطار ⇒ cover وإلا contain (حواف مملوءة بنسخة مموّهة). */
export function fitFor(iw: number, ih: number, slotRatio: number): "cover" | "contain" {
  return iw > 0 && ih > 0 && Math.abs(iw / ih / slotRatio - 1) <= 0.1 ? "cover" : "contain";
}

export interface ThumbProps {
  cover: string | null; coverW: number; coverH: number;
  session: boolean; trackKey: string; source: string; sourceName: string;
  duration: number; accent: string; reduce: boolean; h?: number;
}

export const Thumb = memo(function Thumb({ cover, coverW, coverH, session, trackKey, source, sourceName, duration, accent, reduce, h = THUMB.h }: ThumbProps) {
  // النوع: الصورة الواصلة تحسم؛ قبلها آخر نوع معروف لنفس المصدر ثم تخمين المصدر ⇒ لا قفزة عند الغياب/التبدّل.
  const guess = guessKind(source, sourceName);
  const lastKind = useRef<{ src: string; kind: ThumbKind } | null>(null);
  const kind: ThumbKind = cover && coverW > 0 ? thumbKind(coverW, coverH) : lastKind.current && lastKind.current.src === source ? lastKind.current.kind : guess;
  useEffect(() => { if (cover && coverW > 0) lastKind.current = { src: source, kind }; }, [cover, coverW, kind, source]);
  const w = kind === "video" ? Math.round(h * THUMB.videoRatio) : h;
  const slotRatio = w / h;

  // تلاشٍ متقاطع: الصورة الجديدة تتلاشى فوق القديمة ثم تُزال القديمة (بلا وميض).
  const [layers, setLayers] = useState<{ k: number; uri: string }[]>(() => (cover ? [{ k: 0, uri: cover }] : []));
  const seq = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  const pruneT = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(pruneT.current), []);
  useEffect(() => {
    let added = 0;
    setLayers((cur) => {
      const top = cur[cur.length - 1];
      if ((top?.uri ?? null) === cover) return cur;
      if (!cover) return [];
      added = ++seq.current;
      return [...cur.slice(-1), { k: added, uri: cover }];
    });
    if (!cover) return;
    // بعد اكتمال التلاشي تُزال الطبقة القديمة (مؤقّت واحد لكل تبدّل، لا اعتماد على أحداث انتهاء الحركة).
    window.clearTimeout(pruneT.current);
    pruneT.current = window.setTimeout(() => setLayers((cur) => (cur.length > 1 ? [cur[cur.length - 1]] : cur)), (reduce ? 0.15 : dur.swap) * 1000 + 120);
  }, [cover]); // eslint-disable-line react-hooks/exhaustive-deps

  // وميض هيكلي: فقط بين تبدّل المسار ووصول الصورة (حدّ أقصى 2.5ث) — مؤقّت واحد لكل تبدّل لا غير.
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!session || cover) { setLoading(false); return; }
    setLoading(true);
    const t = window.setTimeout(() => setLoading(false), 2500);
    return () => window.clearTimeout(t);
  }, [session, cover, trackKey]);

  const fit = fitFor(coverW, coverH, slotRatio);
  const top = layers[layers.length - 1]?.uri ?? null;
  const fade = { duration: reduce ? 0.15 : dur.swap, ease: ease.out };
  return (
    <motion.div
      className="th" data-testid="thumb" data-kind={kind} data-loading={loading ? "true" : "false"}
      initial={false}
      animate={{ width: w }}
      transition={reduce ? { duration: 0 } : spring.content}
      whileHover={reduce ? undefined : { scale: thumbHover.scale }}
      style={{ height: h, ["--thumb-r" as string]: `${THUMB.radius}px` }}
    >
      {!reduce && kind === "video" && <span aria-hidden className="th-halo" data-testid="thumb-halo" style={{ background: `radial-gradient(closest-side, ${accent}, transparent)`, opacity: THUMB.ambientMax }} />}
      {!reduce && kind === "audio" && top && <img aria-hidden data-testid="thumb-blur" className="th-blur" src={top} alt="" draggable={false} />}
      <div className="th-frame" data-testid="artwork" style={{ width: w, height: h }}>
        {fit === "contain" && top && <img aria-hidden className="th-img" src={top} alt="" draggable={false} style={{ objectFit: "cover", filter: reduce ? undefined : "blur(14px)", transform: "scale(1.2)", opacity: 0.7 }} />}
        {layers.map((l, n) => (
          <motion.img
            key={l.k} className="th-img" src={l.uri} alt="" draggable={false} data-testid="thumb-img"
            style={{ objectFit: fit }}
            initial={mounted.current || n > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1, transition: fade }}
          />
        ))}
        {!top && (
          <div className="th-ph" data-testid="thumb-placeholder">
            {kind === "video" ? <Film size={Math.round(h * 0.34)} /> : <Music size={Math.round(h * 0.34)} />}
            {loading && !reduce && <span className="th-shimmer" data-testid="thumb-shimmer" />}
          </div>
        )}
        {kind === "video" && duration > 0 && <span className="th-badge" data-testid="thumb-duration" dir="ltr">{fmtTime(duration)}</span>}
      </div>
    </motion.div>
  );
});
