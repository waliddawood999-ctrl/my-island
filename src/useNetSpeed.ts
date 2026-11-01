import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface NetSpeed { down: number; up: number }

/** سرعتا الشبكة (net:speed). تفعيل الخيط في الخلفية فقط ما دام enabled؛ إطفاؤه يركنه (صفر كلفة). */
export function useNetSpeed(enabled: boolean): NetSpeed | null {
  const [v, setV] = useState<NetSpeed | null>(null);
  useEffect(() => {
    if (!enabled) { setV(null); invoke("netspeed_active", { active: false }).catch(() => {}); return; }
    const un = listen<NetSpeed>("net:speed", (e) => setV(e.payload));
    invoke("netspeed_active", { active: true }).catch(() => {});
    return () => { un.then((f) => f()); invoke("netspeed_active", { active: false }).catch(() => {}); };
  }, [enabled]);
  return enabled ? v : null;
}
