import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RepeatKind } from "./reminderParse";
import { i } from "./i18n";

export interface Reminder { id: string; text: string; at: number; repeat: RepeatKind; done: boolean }
export interface TimerState { endsAt: number; totalMs: number; label: string }
export interface NoteAlert { kind: "reminder" | "timer" | "break" | "prayer"; id: string; text: string; at: number; late: boolean }
export interface Folder { id: string; name: string }

/** يظهر المؤقّت في الحبة المنكمشة حين يتبقى هذا الزمن (ms) أو أقل. */
export const TIMER_NEAR_MS = 60_000;
/** مدة بقاء تنبيه الحبة قبل أن يزول وحده (ms). */
export const ALERT_MS = 10_000;

/** التذكيرات مع تحديث حي عبر `reminders:changed` (يُبَثّ عند الحفظ أو الإطلاق). */
export function useReminders() {
  const [list, setList] = useState<Reminder[]>([]);
  const reload = useCallback(
    () => invoke<Reminder[]>("reminders_get").then(setList).catch(() => {}),
    [],
  );
  useEffect(() => {
    reload();
    const un = listen("reminders:changed", reload);
    return () => { un.then((f) => f()); };
  }, [reload]);
  const save = useCallback(
    (next: Reminder[]) => invoke<Reminder[]>("reminders_set", { list: next }).then(setList),
    [],
  );
  return { list, save, reload };
}

/** المؤقّت الجاري + الزمن المتبقي (ms). الساعة الداخلية تعمل كل ثانية فقط حين يقترب (≤ TIMER_NEAR_MS)؛
 *  قبل ذلك مؤقّت واحد يصحو عند لحظة الاقتراب، وبلا مؤقّت لا شيء يعمل. */
export function useTimer() {
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    invoke<TimerState | null>("timer_get").then(setTimer).catch(() => {});
    const un = listen<TimerState | null>("timer:changed", (e) => { setTimer(e.payload ?? null); setNow(Date.now()); });
    return () => { un.then((f) => f()); };
  }, []);
  const endsAt = timer?.endsAt ?? 0;
  const near = endsAt > 0 && endsAt - now <= TIMER_NEAR_MS;
  useEffect(() => {
    if (!endsAt) return;
    const left = endsAt - Date.now();
    if (left <= 0) return;
    if (left > TIMER_NEAR_MS) {
      const t = window.setTimeout(() => setNow(Date.now()), left - TIMER_NEAR_MS);
      return () => window.clearTimeout(t);
    }
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [endsAt, near]);
  const remaining = timer ? Math.max(0, timer.endsAt - now) : null;
  return { timer, remaining, now };
}

/** آخر تنبيه من `island:note` (تذكير/مؤقّت)؛ يزول بعد ALERT_MS أو بـ dismiss. */
export function useNoteAlert() {
  const [alert, setAlert] = useState<NoteAlert | null>(null);
  const t = useRef<number | undefined>(undefined);
  const dismiss = useCallback(() => { window.clearTimeout(t.current); setAlert(null); }, []);
  useEffect(() => {
    const un = listen<NoteAlert>("island:note", (e) => {
      setAlert(e.payload);
      window.clearTimeout(t.current);
      t.current = window.setTimeout(() => setAlert(null), ALERT_MS);
    });
    // تذكير الاستراحة (attention.rs) يمرّ بنفس شريط التنبيه.
    const unBreak = listen<number>("attention:break", (e) => {
      const min = Number(e.payload) || 60;
      setAlert({
        kind: "break", id: `break-${Date.now()}`, at: Date.now(), late: false,
        text: i(`خذ استراحة — ${min} دقيقة متواصلة`, `Take a break — ${min} min straight`),
      });
      window.clearTimeout(t.current);
      t.current = window.setTimeout(() => setAlert(null), ALERT_MS);
    });
    return () => { un.then((f) => f()); unBreak.then((f) => f()); window.clearTimeout(t.current); };
  }, []);
  return { alert, dismiss };
}

/** م:ث (أو س:م:ث) للمؤقّت. */
export function fmtCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
}
