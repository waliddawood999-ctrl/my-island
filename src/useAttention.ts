import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type AppTime = { app: string; seconds: number };
export type AttentionSnap = { enabled: boolean; total: number; apps: AppTime[]; day: string };

/** يعكس attention:update من attention.rs؛ معطّل ⇒ لا لقطة ولا استماع. */
export function useAttention(enabled: boolean): AttentionSnap | null {
  const [snap, setSnap] = useState<AttentionSnap | null>(null);
  useEffect(() => {
    if (!enabled) { setSnap(null); return; }
    let alive = true;
    invoke<AttentionSnap>("attention_today").then((s) => alive && setSnap(s)).catch(() => {});
    const un = listen<AttentionSnap>("attention:update", (e) => setSnap(e.payload));
    return () => { alive = false; un.then((f) => f()); };
  }, [enabled]);
  return snap;
}

/** مدة مختصرة: «2س 15د» / «45د» / «<1د». */
export function fmtDuration(sec: number, h: string, m: string): string {
  if (sec < 60) return `<1${m}`;
  const mins = Math.floor(sec / 60);
  const hh = Math.floor(mins / 60), mm = mins % 60;
  return hh > 0 ? `${hh}${h}${mm ? ` ${mm}${m}` : ""}` : `${mins}${m}`;
}
