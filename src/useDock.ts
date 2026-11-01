import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DOCK_OFF, sanitizeDock, type DockInfo } from "./liveActivity";

/**
 * وضع تبويب المتصفح: حالة الإرساء من الخلفية (island:dock عند التغيّر + island_dock_get عند الإقلاع).
 * المفتاح مطفأ أو أي حمولة مشوّهة ⇒ الوضع الطبيعي دائمًا. لا مؤقّتات هنا.
 */
export function useDock(enabled: boolean): DockInfo {
  const [d, setD] = useState<DockInfo>(DOCK_OFF);
  useEffect(() => {
    if (!enabled) { setD(DOCK_OFF); return; }
    let alive = true;
    invoke<unknown>("island_dock_get").then((v) => { if (alive) setD(sanitizeDock(v)); }).catch(() => {});
    const un = listen<unknown>("island:dock", (e) => setD(sanitizeDock(e.payload)));
    return () => { alive = false; un.then((f) => f()); };
  }, [enabled]);
  return enabled ? d : DOCK_OFF;
}
