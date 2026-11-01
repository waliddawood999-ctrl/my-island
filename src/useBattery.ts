import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type BtBattery = { name: string; percent: number };
export type Battery = {
  has_battery: boolean; percent: number | null; ac: boolean; charging: boolean;
  /** دقائق حتى النفاد (على البطارية) أو الامتلاء (يشحن)؛ null = غير معروف. */
  remaining_min?: number | null;
  /** يشحن وفوق/عند 80% */
  unplug_tip?: boolean;
  bt?: BtBattery[];
};

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
