/**
 * مشغّل Lottie المشترك (docs/MOTION.md §Lottie) — النقطة الوحيدة لتشغيل ملفات `.lottie` في الواجهة.
 *  · wasm مضمَّن محليًا عبر `?url` + `setWasmUrl` ⇒ لا جلب من أي CDN وقت التشغيل (مبدأ «لا طلبات خفية»).
 *  · الظهور: لا يُركَّب المشغّل (لا canvas ولا rAF) إلا حين تكون الحبة/اللوحة ظاهرة فعلًا (`LottieShown`) وتبويب الصفحة مرئيًّا؛
 *    عند الإخفاء يُفكّ التركيب فورًا ⇒ يتوقف التشغيل ويُحرَّر المشغّل.
 *  · مستوى الحركة: full = كما طُلب (تكرار/مرة) · reduced = مرة واحدة دائمًا · off = إطار ثابت واحد بلا تشغيل.
 *  · الخمول: ما انتهى تشغيله لا يبقى له rAF؛ والحلقات الدائمة (مؤشر الميديا) مشروطة بتشغيل فعلي وظهور فعلي.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";
import type { DotLottie } from "@lottiefiles/dotlottie-web";
import wasmUrl from "@lottiefiles/dotlottie-web/dotlottie-player.wasm?url";
import { useMotionLevel } from "./motion";
import equalizer from "./assets/lottie/01-music-equalizer.lottie?url";
import tick from "./assets/lottie/02-success-tick.lottie?url";
import loader from "./assets/lottie/03-loader-check.lottie?url";
import empty from "./assets/lottie/04-empty-state.lottie?url";
import offline from "./assets/lottie/05-no-internet.lottie?url";
import bell from "./assets/lottie/06-bell-ringing.lottie?url";
import weather from "./assets/lottie/07-chance-rain-sunny.lottie?url";

setWasmUrl(wasmUrl);

/** الاسم ⇒ الملف + الإطار الثابت (كنسبة من الإطارات الكلية) المستعمل عند «متوقفة» أو التوقف. */
const LOTTIES = {
  equalizer: { src: equalizer, still: 0.5 },
  tick: { src: tick, still: 1 },
  loader: { src: loader, still: 1 },
  empty: { src: empty, still: 0.5 },
  offline: { src: offline, still: 0.5 },
  bell: { src: bell, still: 0 },
  weather: { src: weather, still: 0.3 },
} as const;
export type LottieName = keyof typeof LOTTIES;

/** تُحدّده الحبة: صحيح فقط حين الحبة/اللوحة ظاهرة (ليست مخفية ولا شفافيتها صفر). */
export const LottieShown = createContext(true);
export const LottieShownProvider = ({ shown, children }: { shown: boolean; children: ReactNode }) => (
  <LottieShown.Provider value={shown}>{children}</LottieShown.Provider>
);

function useDocVisible(): boolean {
  const [v, setV] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const f = () => setV(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return v;
}

export type LottieMode = "hidden" | "still" | "once" | "loop";

/** وضع التشغيل الفعلي من (الظهور، المستوى، play، loop) — دالة خالصة. */
export function lottieMode(shown: boolean, level: string, play: boolean, loop: boolean): LottieMode {
  if (!shown) return "hidden";
  if (level === "off" || !play) return "still";
  if (level === "reduced") return "once";
  return loop ? "loop" : "once";
}

interface Props {
  name: LottieName;
  size: number;
  /** false ⇒ إطار ثابت (مثلًا الميديا متوقفة مؤقتًا). */
  play?: boolean;
  /** تكرار دائم (full فقط). */
  loop?: boolean;
  /** عدد مرات التشغيل الكلي بدل التكرار الدائم (full فقط؛ reduced دائمًا مرة). */
  loops?: number;
  className?: string;
  label?: string;
}

export function LottieIcon({ name, size, play = true, loop = false, loops, className, label }: Props) {
  const inPill = useContext(LottieShown);
  const docVisible = useDocVisible();
  const shown = inPill && docVisible;
  const level = useMotionLevel();
  const mode = lottieMode(shown, level, play, loop || (loops ?? 0) > 1);
  const { src, still } = LOTTIES[name];
  const box = { width: size, height: size };
  const common = { "data-lottie": name, "data-lottie-mode": mode, className: `inline-flex shrink-0 ${className ?? ""}`, style: box, role: label ? "img" : undefined, "aria-label": label, "aria-hidden": label ? undefined : true } as const;
  if (mode === "hidden") return <span {...common} />;
  const looping = mode === "loop";
  const n = loops ?? 0;
  const cfg = looping ? (n > 1 ? { loop: true, loopCount: n - 1 } : { loop: true }) : { loop: false };
  const onRef = (dl: DotLottie | null) => {
    if (!dl || mode !== "still") return;
    const setStill = () => dl.setFrame(Math.max(0, Math.min(dl.totalFrames - 1, Math.floor(dl.totalFrames * still))));
    if (dl.isLoaded) setStill(); else dl.addEventListener("load", setStill);
  };
  return (
    <span {...common}>
      <DotLottieReact
        key={`${name}-${mode}`}
        src={src}
        autoplay={mode !== "still"}
        {...cfg}
        renderConfig={{ autoResize: false, devicePixelRatio: Math.min(2, window.devicePixelRatio || 1) }}
        dotLottieRefCallback={onRef}
        style={box}
      />
    </span>
  );
}
