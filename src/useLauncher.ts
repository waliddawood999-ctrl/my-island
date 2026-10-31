import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LauncherGroup, LauncherItem } from "./launcherGroups";

export type LauncherHotkeys = Record<string, string>;

/** عناصر اللانشر + المجموعات + الاختصارات مع تحديث حي عبر `launcher:changed`. enabled=false ⇒ لا اشتراك ولا استدعاء. */
export function useLauncher(enabled: boolean) {
  const [items, setItems] = useState<LauncherItem[]>([]);
  const [groups, setGroups] = useState<LauncherGroup[]>([]);
  const [hotkeys, setHotkeys] = useState<LauncherHotkeys>({});
  const reload = useCallback(
    () =>
      Promise.all([
        invoke<LauncherItem[]>("launcher_list"),
        invoke<LauncherGroup[]>("launcher_groups_get"),
        invoke<LauncherHotkeys>("launcher_hotkeys_get"),
      ])
        .then(([a, b, c]) => { setItems(a); setGroups(b); setHotkeys(c); })
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    if (!enabled) { setItems([]); setGroups([]); setHotkeys({}); return; }
    reload();
    const un = listen("launcher:changed", () => { reload(); });
    return () => { un.then((f) => f()); };
  }, [enabled, reload]);
  return { items, groups, hotkeys, reload, setGroups };
}
