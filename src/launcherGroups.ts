// منطق خالص للمجموعات والاختصارات في تبويب اللانشر (بلا React/Tauri) — قابل للاختبار منفردًا.
export type LauncherKind = "app" | "file" | "dir" | "link";
export type LauncherItem = {
  id: number;
  path: string;
  name: string;
  kind: LauncherKind;
  icon: string | null;
  missing: boolean;
};
export type LauncherGroup = { id: string; name: string; items: number[] };
/** group="" = «غير مصنّف». before = id عنصر داخل المجموعة الهدف يُدرج قبله (غيابه = في الآخر). */
export type DropTarget = { group: string; before?: number };

/** ينقل عنصرًا إلى مجموعة (أو يُخرجه من كل المجموعات إن كان الهدف ""). */
export function moveItem(groups: LauncherGroup[], itemId: number, t: DropTarget): LauncherGroup[] {
  const stripped = groups.map((g) => ({ ...g, items: g.items.filter((x) => x !== itemId) }));
  if (t.group === "") return stripped;
  return stripped.map((g) => {
    if (g.id !== t.group) return g;
    const items = [...g.items];
    const at = t.before != null ? items.indexOf(t.before) : -1;
    if (at < 0) items.push(itemId);
    else items.splice(at, 0, itemId);
    return { ...g, items };
  });
}

/** ينقل مجموعة قبل أخرى (before=null ⇒ في الآخر). */
export function moveGroup(groups: LauncherGroup[], gid: string, before: string | null): LauncherGroup[] {
  const g = groups.find((x) => x.id === gid);
  if (!g || gid === before) return groups;
  const rest = groups.filter((x) => x.id !== gid);
  const at = before == null ? -1 : rest.findIndex((x) => x.id === before);
  if (at < 0) rest.push(g);
  else rest.splice(at, 0, g);
  return rest;
}

export const addGroup = (groups: LauncherGroup[], name: string): LauncherGroup[] => [
  ...groups,
  { id: `g${Date.now().toString(36)}${groups.length}`, name: name.trim(), items: [] },
];
export const renameGroup = (groups: LauncherGroup[], gid: string, name: string): LauncherGroup[] =>
  groups.map((g) => (g.id === gid ? { ...g, name: name.trim() } : g));
export const removeGroup = (groups: LauncherGroup[], gid: string): LauncherGroup[] => groups.filter((g) => g.id !== gid);

/** التقسيم للعرض: «غير مصنّف» (بترتيب العناصر) ثم كل مجموعة بترتيب عناصرها. */
export function sections(items: LauncherItem[], groups: LauncherGroup[]) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const taken = new Set<number>();
  const grouped = groups.map((g) => ({
    group: g,
    items: g.items.flatMap((id) => {
      const it = byId.get(id);
      if (!it || taken.has(id)) return [];
      taken.add(id);
      return [it];
    }),
  }));
  return { ungrouped: items.filter((it) => !taken.has(it.id)), groups: grouped };
}

/** بحث سريع بالاسم أو المسار (غير حساس للحالة). */
export function filterItems(items: LauncherItem[], q: string): LauncherItem[] {
  const s = q.trim().toLowerCase();
  if (!s) return items;
  return items.filter((it) => it.name.toLowerCase().includes(s) || it.path.toLowerCase().includes(s));
}

const NAMED: Record<string, string> = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  Insert: "Insert", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", Backquote: "`",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\",
};

/** يحوّل keydown إلى صيغة Tauri ("Ctrl+Alt+K")؛ null إن كان المفتاح معدّلًا وحده أو غير مدعوم. */
export function keyCombo(e: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null {
  const c = e.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit[0-9]$/.test(c)) key = c.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) key = c;
  else if (/^Numpad[0-9]$/.test(c)) key = `Num${c.slice(6)}`;
  else if (c in NAMED) key = NAMED[c];
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
  return [...mods, key].join("+");
}
