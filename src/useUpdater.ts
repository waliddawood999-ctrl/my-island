import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { applyDownloadEvent, AUTO_CHECK_DELAY_MS, UPDATE_IDLE, type UpdateState } from "./updater";

/** حدث داخلي بين النوافذ: الإعدادات تطلب من الجزيرة إعادة الفحص وإظهار النشاط عند توفر تحديث (انظر docs/IPC.md). */
export const UPDATE_RECHECK = "update:recheck";

/** فحص صامت لا يرمي أبدًا: null عند غياب التحديث أو أي فشل (الفحص التلقائي لا يُظهر شيئًا في الحالتين). */
async function quietCheck(): Promise<Update | null> {
  try { return (await check()) ?? null; } catch { return null; }
}

/** للإعدادات: فحص يدوي يميّز الفشل عن غياب التحديث. يُبلغ الجزيرة عند توفر تحديث كي تعرضه. */
export async function manualCheck(): Promise<{ status: "latest" | "available" | "failed"; version?: string }> {
  try {
    const u = await check();
    if (!u) return { status: "latest" };
    const version = u.version;
    u.close().catch(() => {});
    emit(UPDATE_RECHECK).catch(() => {});
    return { status: "available", version };
  } catch {
    return { status: "failed" };
  }
}

/**
 * نشاط التحديث الحي في الجزيرة. فحص صامت واحد بعد الإقلاع بثوانٍ (إن كان autoCheck)، وفحص عند طلب الإعدادات.
 * عند غياب تحديث أو فشل الفحص: phase يبقى idle ولا يظهر شيء. فشل التنزيل/التثبيت ⇒ phase=error مع retry، ولا يرمي أبدًا.
 */
export function useUpdater(autoCheck: boolean) {
  const [state, setState] = useState<UpdateState>(UPDATE_IDLE);
  const upd = useRef<Update | null>(null);
  const busy = useRef(false);
  const autoDone = useRef(false);

  const runCheck = useCallback(async () => {
    if (busy.current || upd.current) return;
    busy.current = true;
    const u = await quietCheck();
    busy.current = false;
    if (!u) return;
    upd.current = u;
    setState({ phase: "available", version: u.version, downloaded: 0, total: 0 });
  }, []);

  useEffect(() => {
    if (!autoCheck || autoDone.current) return;
    const t = window.setTimeout(() => { autoDone.current = true; runCheck(); }, AUTO_CHECK_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [autoCheck, runCheck]);

  useEffect(() => {
    const un = listen(UPDATE_RECHECK, () => { runCheck(); });
    return () => { un.then((f) => f()).catch(() => {}); };
  }, [runCheck]);

  const install = useCallback(async () => {
    const u = upd.current;
    if (!u || busy.current) return;
    busy.current = true;
    setState((s) => ({ ...s, phase: "downloading", downloaded: 0, total: 0 }));
    try {
      await u.downloadAndInstall((ev) => setState((s) => applyDownloadEvent(s, ev)));
      setState((s) => ({ ...s, phase: "installing" }));
      await relaunch();
    } catch {
      setState((s) => ({ ...s, phase: "error" }));
    } finally {
      busy.current = false;
    }
  }, []);

  return { state, install };
}
