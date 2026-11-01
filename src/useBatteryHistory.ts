import { useEffect, useRef, useState } from "react";
import { pushSample } from "./liveActivity";
import type { Battery } from "./useDownloads";

export interface BatSample { t: number; v: number }
const GAP_MS = 60_000;
const CAP = 30;

/** سجلّ نسبة البطارية في الذاكرة من أحداث battery:update القائمة (عيّنة كل ≥60s، 30 عيّنة)؛ لا مؤقّت ولا IPC جديد. */
export function useBatteryHistory(b: Battery | null): BatSample[] {
  const [hist, setHist] = useState<BatSample[]>([]);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!b || !b.has_battery || b.percent == null) return;
    if (last.current === b.percent && hist.length > 0) return;
    last.current = b.percent;
    setHist((h) => pushSample(h, { t: Date.now(), v: b.percent as number }, GAP_MS, CAP));
  }, [b?.percent, b?.has_battery]);
  return hist;
}
