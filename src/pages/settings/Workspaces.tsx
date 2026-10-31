import { i } from "../../i18n";
import type { Workspace } from "../../settings";
import { saveSettings } from "../../useSettings";
import { LinesField, TextField } from "./fields";

/** محرّر مساحات العمل: اسم + عناصر (سطر لكل عنصر: مسار تطبيق/مجلد/ملف أو رابط http(s)). */
export function WorkspacesEditor({ value }: { value: Workspace[] }) {
  const save = (next: Workspace[]) => saveSettings({ workspaces: next });
  const patch = (id: string, p: Partial<Workspace>) => save(value.map((w) => (w.id === id ? { ...w, ...p } : w)));
  return (
    <div className="flex flex-col gap-3">
      {value.map((w) => (
        <div key={w.id} className="rounded-lg border border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <TextField label={i("اسم المساحة", "Workspace name")} value={w.name} placeholder={i("مثال: عمل", "e.g. Work")} onCommit={(v) => patch(w.id, { name: v })} />
            <button
              onClick={() => save(value.filter((x) => x.id !== w.id))}
              className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
            >{i("حذف", "Delete")}</button>
          </div>
          <LinesField
            label={i("عناصر المساحة", "Workspace items")} value={w.items}
            placeholder={"C:\\Program Files\\App\\app.exe\nD:\\Projects\nhttps://example.com"}
            onCommit={(v) => patch(w.id, { items: v })}
          />
        </div>
      ))}
      <button
        onClick={() => save([...value, { id: `ws-${Date.now().toString(36)}`, name: i("مساحة جديدة", "New workspace"), items: [] }])}
        className="self-start rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
      >{i("+ مساحة عمل", "+ Workspace")}</button>
    </div>
  );
}
