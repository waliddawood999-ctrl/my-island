import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type SysInfo = { cpu: number; mem_used: number; mem_total: number; mem_percent: number };
export type VolumeState = { available: boolean; volume: number; muted: boolean };
export type Brightness = { available: boolean; level: number };
export type Privacy = { mic: boolean; cam: boolean };

/** قياس المعالج/الذاكرة كل 2s ما دام `active` (قسم النظام ظاهر)؛ خارج ذلك لا مؤقّت ولا استدعاء. */
export function useSysinfo(active: boolean): SysInfo | null {
  const [s, setS] = useState<SysInfo | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let t: number | undefined;
    const tick = () => {
      invoke<SysInfo>("sysinfo_get")
        .then((v) => { if (alive) setS(v); })
        .catch(() => {})
        .finally(() => { if (alive && !document.hidden) t = window.setTimeout(tick, 2000); else if (alive) t = window.setTimeout(tick, 4000); });
    };
    tick();
    return () => { alive = false; window.clearTimeout(t); };
  }, [active]);
  return s;
}

/** مستوى الصوت: لقطة أولى + audio:state (يشمل تغييرات هذا القسم)؛ لا شيء إن كان `active` خاطئًا. */
export function useVolume(active: boolean): VolumeState | null {
  const [v, setV] = useState<VolumeState | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    invoke<VolumeState>("volume_get").then((s) => alive && setV(s)).catch(() => {});
    const un = listen<VolumeState>("audio:state", (e) => setV(e.payload));
    return () => { alive = false; un.then((f) => f()); };
  }, [active]);
  return v;
}

/** سطوع الابتوب: قراءة واحدة عند الظهور (available:false ⇒ الواجهة تخفي المنزلق). */
export function useBrightness(active: boolean): Brightness | null {
  const [b, setB] = useState<Brightness | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    invoke<Brightness>("brightness_get").then((s) => alive && setB(s)).catch(() => alive && setB({ available: false, level: 0 }));
    return () => { alive = false; };
  }, [active]);
  return b;
}

/** مؤشر الخصوصية (نقطة الحبة): لقطة أولى عند التفعيل + privacy:update. */
export function usePrivacy(enabled: boolean): Privacy {
  const [p, setP] = useState<Privacy>({ mic: false, cam: false });
  useEffect(() => {
    if (!enabled) { setP({ mic: false, cam: false }); return; }
    let alive = true;
    invoke<Privacy>("privacy_status").then((s) => alive && setP(s)).catch(() => {});
    const un = listen<Privacy>("privacy:update", (e) => setP(e.payload));
    return () => { alive = false; un.then((f) => f()); };
  }, [enabled]);
  return p;
}

/** يرسل القيمة بحدّ أقصى مرة كل `ms` أثناء السحب (والقيمة الأخيرة تُرسل دائمًا). */
export function useThrottled<T>(fn: (v: T) => void, ms = 80): (v: T) => void {
  const last = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (v: T) => {
    window.clearTimeout(timer.current);
    const wait = ms - (Date.now() - last.current);
    if (wait <= 0) { last.current = Date.now(); fnRef.current(v); }
    else timer.current = window.setTimeout(() => { last.current = Date.now(); fnRef.current(v); }, wait);
  };
}

export type TopApp = { name: string; cpu: number };
export type SysDepth = { gpu: number | null; temps: { cpu: number | null; gpu: number | null; ssd: number | null }; power_w: number | null; top: TopApp | null };

/** عمق المراقبة (GPU/حرارة/قدرة/أعلى تطبيق) كل ~3s ما دام `active` (تبويب النظام ظاهر وليس Eco)؛ خارج ذلك لا مؤقّت ولا استدعاء. */
export function useSysDepth(active: boolean): SysDepth | null {
  const [d, setD] = useState<SysDepth | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let t: number | undefined;
    const tick = () => {
      invoke<SysDepth>("sysdepth_get")
        .then((v) => { if (alive && v) setD(v); })
        .catch(() => {})
        .finally(() => { if (alive) t = window.setTimeout(tick, document.hidden ? 6000 : 3000); });
    };
    tick();
    return () => { alive = false; window.clearTimeout(t); };
  }, [active]);
  return d;
}

export const SPARK_CAP = 30;
/** يضيف قيمة إلى سجلّ محدود الطول (بلا تعديل المصفوفة الأصلية). */
export const pushCapped = (arr: readonly number[], v: number, cap = SPARK_CAP): number[] => [...arr, v].slice(-cap);

/**
 * سجلّ CPU/RAM للمنحنيين المصغّرين: يتراكم مع كل عيّنة جديدة فقط وهو `active`؛ التبويب يُفكَّك بإغلاقه فيسقط السجلّ
 * (لا ذاكرة ولا عمل خارج التبويب). لا عيّنة جديدة (Eco/توقف القياس) ⇒ لا نمو.
 */
export function useSysHistory(sys: SysInfo | null, active: boolean): { cpu: number[]; mem: number[] } {
  const [h, setH] = useState<{ cpu: number[]; mem: number[] }>({ cpu: [], mem: [] });
  useEffect(() => {
    if (!active || !sys) return;
    setH((p) => ({ cpu: pushCapped(p.cpu, sys.cpu), mem: pushCapped(p.mem, sys.mem_percent) }));
  }, [sys, active]);
  return h;
}
