import { useEffect, useSyncExternalStore } from "react";
import { SW_IDLE, swActive, swElapsed, swPause, swReset, swStart, type StopwatchState } from "./liveActivity";
import { useState } from "react";

/**
 * ساعة الإيقاف: حالة واحدة على مستوى صفحة main (الحبة واللوحة تشتركان فيها) — واجهة فوق بنية التوقيت القائمة بلا IPC جديد.
 * تُفقد عند إعادة تشغيل التطبيق (لا تُخزَّن). لا مؤقّت إلا أثناء الجريان وحين يوجد من يعرضها (انظر useStopwatchNow).
 */
let state: StopwatchState = SW_IDLE;
const subs = new Set<() => void>();
const set = (s: StopwatchState) => { state = s; subs.forEach((f) => f()); };
export const stopwatch = {
  start: () => set(swStart(state, Date.now())),
  pause: () => set(swPause(state, Date.now())),
  reset: () => set(swReset()),
  toggle: () => set(state.running ? swPause(state, Date.now()) : swStart(state, Date.now())),
};

export function useStopwatchState(): StopwatchState {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => state);
}

/**
 * المنقضي (ms) للعرض. fast=true (عرض اللوحة بالأجزاء) ⇒ 60ms · وإلا ثانية واحدة (الكبسولة) — فقط أثناء الجريان، ويتوقف فور التوقّف/الإلغاء.
 * استثناء الخمول الموثّق في docs/MOTION.md: مؤقّت ساعة الإيقاف الجارية.
 */
export function useStopwatchNow(fast: boolean): { sw: StopwatchState; ms: number } {
  const sw = useStopwatchState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sw.running) { setNow(Date.now()); return; }
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), fast ? 60 : 1000);
    return () => window.clearInterval(t);
  }, [sw.running, fast]);
  return { sw, ms: swElapsed(sw, sw.running ? now : Date.now()) };
}
export { swActive };
