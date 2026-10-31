import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ShelfKind = "file" | "dir" | "text" | "image";
export type ShelfItem = {
  id: number;
  path: string;
  name: string;
  kind: ShelfKind;
  size: number | null;
  missing: boolean;
  thumb: string | null;
  preview: string | null;
  created_at: number;
};

/** عناصر الرفّ (الأحدث أولًا) مع تحديث حي عبر `shelf:changed`. enabled=false ⇒ لا اشتراك ولا استدعاء. */
export function useShelf(enabled: boolean) {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const reload = useCallback(
    () => invoke<ShelfItem[]>("shelf_list").then(setItems).catch(() => {}),
    [],
  );
  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    reload();
    const un = listen("shelf:changed", () => { reload(); });
    return () => { un.then((f) => f()); };
  }, [enabled, reload]);
  return { items, reload };
}
