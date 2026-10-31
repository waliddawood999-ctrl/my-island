import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Join = { provider: "zoom" | "meet" | "teams" | "webex"; url: string };
export type Meeting = {
  id: string; title: string; start: number; end: number; location: string; join: Join | null; recurring: boolean;
};
export type MeetingsSnap = {
  configured: boolean; enabled: boolean; items: Meeting[]; error: string | null; fetched_at: number | null;
};
const EMPTY: MeetingsSnap = { configured: false, enabled: false, items: [], error: null, fetched_at: null };

/** يعكس meetings:update من meetings.rs؛ لا شيء ولا استماع إن كان `enabled` خاطئًا. */
export function useMeetings(enabled: boolean): { snap: MeetingsSnap; refresh: () => Promise<void>; loading: boolean } {
  const [snap, setSnap] = useState<MeetingsSnap>(EMPTY);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) { setSnap(EMPTY); return; }
    let alive = true;
    invoke<MeetingsSnap>("meetings_list").then((s) => alive && setSnap(s)).catch(() => {});
    const un = listen<MeetingsSnap>("meetings:update", (e) => setSnap(e.payload));
    return () => { alive = false; un.then((f) => f()); };
  }, [enabled]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSnap(await invoke<MeetingsSnap>("meetings_refresh")); } catch { /* الخطأ في snap.error */ }
    setLoading(false);
  }, []);
  return { snap, refresh, loading };
}

export const PROVIDER_NAME: Record<Join["provider"], string> = { zoom: "Zoom", meet: "Meet", teams: "Teams", webex: "Webex" };
