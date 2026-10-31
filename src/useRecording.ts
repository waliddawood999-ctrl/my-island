import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface RecState {
  recording: boolean;
  /** وقت البدء (ms منذ epoch). */
  startedAt: number;
  format: string;
  path?: string | null;
  error?: string | null;
}

const IDLE: RecState = { recording: false, startedAt: 0, format: "mp4" };

/** حالة التسجيل (record:state) + الثواني المنقضية؛ المؤقّت يعمل أثناء التسجيل فقط. */
export function useRecording(): RecState & { elapsed: number; last: RecState | null } {
  const [st, setSt] = useState<RecState>(IDLE);
  const [last, setLast] = useState<RecState | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    invoke<RecState>("record_status").then(setSt).catch(() => {});
    const un = listen<RecState>("record:state", (e) => {
      setSt(e.payload);
      if (!e.payload.recording) setLast(e.payload);
      else setLast(null);
    });
    return () => { un.then((f) => f()); };
  }, []);
  useEffect(() => {
    if (!st.recording) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [st.recording]);
  const elapsed = st.recording ? Math.max(0, Math.floor((now - st.startedAt) / 1000)) : 0;
  return { ...st, elapsed, last };
}

/** m:ss (أو h:mm:ss). */
export function fmtElapsed(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
