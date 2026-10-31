import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type DownloadItem = {
  id: string; name: string; size: number; total: number | null;
  percent: number | null; speed: number; source: "browser" | "steam";
};
export type DoneItem = { name: string; path: string; size: number; at: number };
export type DownloadsSnap = { active: DownloadItem[]; recent: DoneItem[] };
export type BtBattery = { name: string; percent: number };
export type Battery = {
  has_battery: boolean; percent: number | null; ac: boolean; charging: boolean;
  /** دقائق حتى النفاد (على البطارية) أو الامتلاء (يشحن)؛ null = غير معروف. */
  remaining_min?: number | null;
  /** يشحن وفوق/عند 80% */
  unplug_tip?: boolean;
  bt?: BtBattery[];
};

const EMPTY: DownloadsSnap = { active: [], recent: [] };

/** يعكس downloads:update من downloads.rs (لا شيء ولا استماع إن كان معطّلًا). */
export function useDownloads(enabled: boolean): DownloadsSnap {
  const [snap, setSnap] = useState<DownloadsSnap>(EMPTY);
  useEffect(() => {
    if (!enabled) { setSnap(EMPTY); return; }
    let alive = true;
    invoke<DownloadsSnap>("downloads_list").then((s) => alive && setSnap(s)).catch(() => {});
    const un = listen<DownloadsSnap>("downloads:update", (e) => setSnap(e.payload));
    return () => { alive = false; un.then((f) => f()); };
  }, [enabled]);
  return snap;
}

/** يعكس battery:update؛ لقطة أولى عند التفعيل. */
export function useBattery(enabled: boolean): Battery | null {
  const [b, setB] = useState<Battery | null>(null);
  useEffect(() => {
    if (!enabled) { setB(null); return; }
    let alive = true;
    invoke<Battery>("battery_status").then((s) => alive && setB(s)).catch(() => {});
    const un = listen<Battery>("battery:update", (e) => setB(e.payload));
    return () => { alive = false; un.then((f) => f()); };
  }, [enabled]);
  return b;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, k = 0;
  while (v >= 1024 && k < u.length - 1) { v /= 1024; k++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[k]}`;
}
