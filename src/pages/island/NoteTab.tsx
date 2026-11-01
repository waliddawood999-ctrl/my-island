import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import {
  Bell, Bold, Check, FolderPlus, Heading2, Italic, Link2, List, ListChecks, ListOrdered, Pencil, Play, Plus,
  Redo2, Square, Timer as TimerIcon, Trash2, Undo2, X, FileText,
} from "lucide-react";
import { motion } from "motion/react";
import { i } from "../../i18n";
import { tap } from "../../motion";
import { parseReminder, type RepeatKind } from "../../reminderParse";
import { fmtCountdown, type Folder, type Reminder, type TimerState } from "../../useNote";

type Sub = "note" | "remind" | "timer";
const SAVE_DEBOUNCE_MS = 700;

/** ربط حقل نصي بفوكس النافذة: النافذة NOACTIVATE فلا كتابة إلا بـtake_focus (ويُردّ عند المغادرة). */
function useTypingFocus() {
  const n = useRef(0);
  useEffect(() => () => { if (n.current > 0) invoke("release_focus").catch(() => {}); }, []);
  return {
    onFocus: () => { n.current++; invoke("take_focus").catch(() => {}); },
    onBlur: () => { n.current = Math.max(0, n.current - 1); invoke("release_focus").catch(() => {}); },
  };
}

const inputCls =
  "w-full rounded-full bg-white/10 px-3 py-1.5 text-[13px] text-white placeholder:text-white/40 focus:bg-white/15 focus:outline-none";

/** تبويب الملاحظة: ملاحظة غنية (Tiptap) · تذكيرات بلغة طبيعية · مؤقّت (الجلسة 3.6). */
export function NoteTab({ timer }: { timer: TimerState | null }) {
  const [sub, setSub] = useState<Sub>("note");
  const subs: { id: Sub; label: string; icon: React.ReactNode }[] = [
    { id: "note", label: i("ملاحظة", "Note"), icon: <FileText size={13} /> },
    { id: "remind", label: i("تذكيرات", "Reminders"), icon: <Bell size={13} /> },
    { id: "timer", label: i("مؤقّت", "Timer"), icon: <TimerIcon size={13} /> },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 gap-1">
        {subs.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] ${sub === s.id ? "bg-white/20 text-white" : "i-btn"}`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {sub === "note" && <NoteEditor />}
        {sub === "remind" && <RemindersView />}
        {sub === "timer" && <TimerView timer={timer} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- الملاحظة

const DEFAULT_ID = "default";

function NoteEditor() {
  const typing = useTypingFocus();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState(DEFAULT_ID);
  const [state, setState] = useState<"saved" | "saving">("saved");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [adding, setAdding] = useState<{ id: string | null; name: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const folderRef = useRef(folder);
  const dirty = useRef(false);
  const saveT = useRef<number | undefined>(undefined);
  const ready = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: "",
    editorProps: {
      attributes: { class: "island-note-doc", spellcheck: "false" },
      handleClick: (_v, _p, ev) => {
        const a = (ev.target as HTMLElement | null)?.closest?.("a");
        const href = a?.getAttribute("href");
        if (href && /^(https?:|mailto:)/i.test(href) && (ev.ctrlKey || ev.metaKey)) {
          invoke("open_path", { path: href }).catch(() => {});
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      if (!ready.current) return;
      dirty.current = true;
      setState("saving");
      window.clearTimeout(saveT.current);
      saveT.current = window.setTimeout(() => { flush(); }, SAVE_DEBOUNCE_MS);
    },
    onFocus: () => typing.onFocus(),
    onBlur: () => { typing.onBlur(); flush(); },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  /** يحفظ فورًا إن وُجد تغيير غير محفوظ (يُستدعى بعد المهلة، عند فقدان الفوكس، تبديل المجلد، إغلاق اللوحة). */
  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(saveT.current);
    const ed = editorRef.current;
    if (!dirty.current || !ed || ed.isDestroyed) return Promise.resolve();
    dirty.current = false;
    return invoke("note_set", { folder: folderRef.current, html: ed.getHTML() })
      .then(() => { if (!dirty.current) setState("saved"); })
      .catch(() => { dirty.current = true; });
  }, []);

  const loadFolders = useCallback(async () => {
    const stored = await invoke<Folder[]>("note_folders_get").catch(() => [] as Folder[]);
    setFolders(stored.some((f) => f.id === DEFAULT_ID) ? stored : [{ id: DEFAULT_ID, name: i("عام", "General") }, ...stored]);
  }, []);

  const loadDoc = useCallback(async (id: string) => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    ready.current = false;
    const html = await invoke<string>("note_get", { folder: id }).catch(() => "");
    if (ed.isDestroyed) return;
    // لا focus()/blur() هنا: كانا يستدعيان take_focus/release_focus (تبديل تنشيط النافذة) بمجرد فتح التبويب بلا نقر من المستخدم.
    ed.commands.setContent(html || "", { emitUpdate: false });
    ready.current = true;
    dirty.current = false;
    setState("saved");
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { if (editor) loadDoc(DEFAULT_ID); }, [editor, loadDoc]);

  // لا فقدان عند إغلاق اللوحة: تفريغ عند فك التركيب وعند إخفاء الصفحة/إغلاقها.
  useEffect(() => {
    const onHide = () => { flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  const switchFolder = async (id: string) => {
    if (id === folderRef.current) return;
    await flush();
    folderRef.current = id;
    setFolder(id);
    setConfirmDel(false);
    await loadDoc(id);
  };

  const saveFolders = async (next: Folder[]) => {
    const saved = await invoke<Folder[]>("note_folders_set", { folders: next }).catch(() => next);
    setFolders(saved);
  };

  const commitFolderName = async () => {
    const a = adding;
    setAdding(null);
    const name = a?.name.trim();
    if (!a || !name) return;
    if (a.id) {
      await saveFolders(folders.map((f) => (f.id === a.id ? { ...f, name } : f)));
    } else {
      const id = `f${Date.now().toString(36)}`;
      await saveFolders([...folders, { id, name }]);
      await switchFolder(id);
    }
  };

  const deleteFolder = async () => {
    if (folder === DEFAULT_ID) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    dirty.current = false;
    const next = folders.filter((f) => f.id !== folder);
    await saveFolders(next);
    folderRef.current = DEFAULT_ID;
    setFolder(DEFAULT_ID);
    setConfirmDel(false);
    await loadDoc(DEFAULT_ID);
  };

  const applyLink = () => {
    if (!editor) return;
    let u = linkUrl.trim();
    if (!u) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else {
      if (!/^(https?:|mailto:)/i.test(u)) u = `https://${u}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href: u }).run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  };

  const btn = (label: string, icon: React.ReactNode, on: () => void, active = false, disabled = false) => (
    <button
      key={label}
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={`i-btn p-1.5 ${active ? "!bg-white/20 !text-white" : ""}`}
    >
      {icon}
    </button>
  );
  const chain = () => editor?.chain().focus();

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto">
        {folders.map((f) =>
          adding?.id === f.id ? null : (
            <button
              key={f.id}
              onClick={() => switchFolder(f.id)}
              onDoubleClick={() => setAdding({ id: f.id, name: f.name })}
              title={i("نقرتان لإعادة التسمية", "Double-click to rename")}
              dir="auto"
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] ${folder === f.id ? "bg-white/20 text-white" : "i-btn"}`}
            >
              {f.name}
            </button>
          ),
        )}
        {adding ? (
          <input
            autoFocus
            dir="auto"
            value={adding.name}
            onChange={(e) => setAdding({ ...adding, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") commitFolderName(); if (e.key === "Escape") setAdding(null); }}
            onFocus={typing.onFocus}
            onBlur={() => { typing.onBlur(); commitFolderName(); }}
            placeholder={i("اسم المجلد", "Folder name")}
            className="w-28 shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[12px] text-white focus:outline-none"
          />
        ) : (
          btn(i("مجلد جديد", "New folder"), <FolderPlus size={14} />, () => setAdding({ id: null, name: "" }))
        )}
        {folder !== DEFAULT_ID && (
          <button
            onClick={deleteFolder}
            className={`ms-1 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${confirmDel ? "bg-red-500/30 text-red-200" : "i-btn"}`}
          >
            <Trash2 size={12} />
            {confirmDel ? i("تأكيد حذف المجلد وملاحظته", "Confirm delete") : ""}
          </button>
        )}
        <span className="ms-auto shrink-0 pe-1 text-[11px] text-white/40" aria-live="polite">
          {state === "saving" ? i("جارٍ الحفظ…", "Saving…") : i("محفوظ", "Saved")}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {btn(i("عريض", "Bold"), <Bold size={14} />, () => chain()?.toggleBold().run(), editor?.isActive("bold"))}
        {btn(i("مائل", "Italic"), <Italic size={14} />, () => chain()?.toggleItalic().run(), editor?.isActive("italic"))}
        {btn(i("عنوان", "Heading"), <Heading2 size={14} />, () => chain()?.toggleHeading({ level: 2 }).run(), editor?.isActive("heading"))}
        {btn(i("قائمة نقطية", "Bullet list"), <List size={14} />, () => chain()?.toggleBulletList().run(), editor?.isActive("bulletList"))}
        {btn(i("قائمة مرقّمة", "Numbered list"), <ListOrdered size={14} />, () => chain()?.toggleOrderedList().run(), editor?.isActive("orderedList"))}
        {btn(i("مهام", "Tasks"), <ListChecks size={14} />, () => chain()?.toggleTaskList().run(), editor?.isActive("taskList"))}
        {btn(i("رابط", "Link"), <Link2 size={14} />, () => { setLinkUrl(editor?.getAttributes("link").href ?? ""); setLinkOpen((o) => !o); }, editor?.isActive("link"))}
        {btn(i("تراجع", "Undo"), <Undo2 size={14} />, () => chain()?.undo().run(), false, !editor?.can().undo())}
        {btn(i("إعادة", "Redo"), <Redo2 size={14} />, () => chain()?.redo().run(), false, !editor?.can().redo())}
        {linkOpen && (
          <input
            autoFocus
            dir="ltr"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") setLinkOpen(false); }}
            onFocus={typing.onFocus}
            onBlur={typing.onBlur}
            placeholder="https://…"
            className="ms-2 w-56 rounded-full bg-white/10 px-3 py-0.5 text-[12px] text-white focus:outline-none"
          />
        )}
        {linkOpen && btn(i("تطبيق", "Apply"), <Check size={14} />, applyLink)}
      </div>

      <div className="i-card min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[13px]" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- التذكيرات

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): number | null {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
const loc = () => i("ar-u-nu-latn", "en-US");
/** «اليوم/غدًا + الساعة» أو تاريخ كامل. */
export function fmtWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms), n = new Date(now);
  const time = d.toLocaleTimeString(loc(), { hour: "numeric", minute: "2-digit" });
  const day0 = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(d) - day0(n)) / 86_400_000);
  if (diff === 0) return `${i("اليوم", "Today")} ${time}`;
  if (diff === 1) return `${i("غدًا", "Tomorrow")} ${time}`;
  return d.toLocaleString(loc(), { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}
const repeatLabel = (r: RepeatKind) =>
  r === "daily" ? i("يوميًا", "Daily") : r === "weekly" ? i("أسبوعيًا", "Weekly") : i("مرة واحدة", "Once");

function RemindersView() {
  const typing = useTypingFocus();
  const [list, setList] = useState<Reminder[]>([]);
  const [raw, setRaw] = useState("");
  const [ovText, setOvText] = useState<string | undefined>();
  const [ovAt, setOvAt] = useState<number | null | undefined>();
  const [ovRepeat, setOvRepeat] = useState<RepeatKind | undefined>();
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const reload = useCallback(() => invoke<Reminder[]>("reminders_get").then(setList).catch(() => {}), []);
  useEffect(() => {
    reload();
    const un = listen("reminders:changed", reload);
    return () => { un.then((f) => f()); };
  }, [reload]);

  const parsed = useMemo(() => parseReminder(raw, new Date()), [raw]);
  const text = ovText ?? parsed.text;
  const at = ovAt !== undefined ? ovAt : parsed.at ? parsed.at.getTime() : null;
  const repeat = ovRepeat !== undefined ? ovRepeat : parsed.repeat;
  const past = at !== null && at <= Date.now();
  const canSave = text.trim().length > 0 && at !== null && (!past || repeat !== null);

  const reset = () => { setRaw(""); setOvText(undefined); setOvAt(undefined); setOvRepeat(undefined); setEditing(null); setErr(""); };
  const onRaw = (v: string) => { setRaw(v); setOvText(undefined); setOvAt(undefined); setOvRepeat(undefined); setErr(""); };

  const save = async () => {
    if (!canSave || at === null) return;
    const item: Reminder = { id: editing ?? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text: text.trim(), at, repeat, done: false };
    const next = editing ? list.map((r) => (r.id === editing ? item : r)) : [...list, item];
    try {
      setList(await invoke<Reminder[]>("reminders_set", { list: next }));
      reset();
    } catch (e) { setErr(String(e)); }
  };
  const mutate = (next: Reminder[]) => invoke<Reminder[]>("reminders_set", { list: next }).then(setList).catch((e) => setErr(String(e)));
  const startEdit = (r: Reminder) => {
    setEditing(r.id); setRaw(r.text); setOvText(r.text); setOvAt(r.at); setOvRepeat(r.repeat); setErr("");
  };

  const upcoming = list.filter((r) => !r.done).sort((a, b) => a.at - b.at);
  const finished = list.filter((r) => r.done).sort((a, b) => b.at - a.at);
  const hasInput = raw.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex w-[300px] shrink-0 flex-col gap-2">
        <input
          value={raw}
          dir="auto"
          onChange={(e) => onRaw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          onFocus={typing.onFocus}
          onBlur={typing.onBlur}
          placeholder={i("ذكّرني أتصل بأمي بكرة 9", "Remind me to call mom tomorrow 9")}
          className={inputCls}
        />
        <div className="flex flex-wrap gap-1">
          {[
            i("بعد دقيقة تجربة التنبيه", "in one minute test alert"),
            i("بكرة 9 صباحًا ", "tomorrow 9 am "),
            i("كل يوم جمعة 8 صباحًا ", "every friday 8 am "),
          ].map((ex) => (
            <button key={ex} onClick={() => onRaw(ex)} className="i-btn px-2 py-0.5 text-[11px]">
              {ex.trim()}
            </button>
          ))}
        </div>

        {hasInput && (
          <div className="i-card flex flex-col gap-1.5 p-2.5 text-[12px]">
            <div className="text-[11px] text-white/50">{i("معاينة قبل الحفظ", "Preview before saving")}</div>
            <input
              dir="auto"
              value={text}
              onChange={(e) => setOvText(e.target.value)}
              onFocus={typing.onFocus}
              onBlur={typing.onBlur}
              placeholder={i("نص التذكير", "Reminder text")}
              className="w-full rounded-lg bg-white/10 px-2 py-1 text-[12px] text-white focus:outline-none"
            />
            <input
              type="datetime-local"
              dir="ltr"
              value={at !== null ? toLocalInput(at) : ""}
              onChange={(e) => setOvAt(fromLocalInput(e.target.value))}
              onFocus={typing.onFocus}
              onBlur={typing.onBlur}
              className="w-full rounded-lg bg-white/10 px-2 py-1 text-[12px] text-white [color-scheme:dark] focus:outline-none"
            />
            <div className="flex gap-1">
              {([null, "daily", "weekly"] as RepeatKind[]).map((r) => (
                <button
                  key={String(r)}
                  onClick={() => setOvRepeat(r)}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${repeat === r ? "bg-white/20 text-white" : "i-btn"}`}
                >
                  {repeatLabel(r)}
                </button>
              ))}
            </div>
            <div className={`text-[12px] ${at === null || (past && !repeat) ? "text-amber-300" : "text-emerald-300"}`} dir="auto">
              {at === null
                ? i("لم أفهم الوقت — اختره من الحقل أعلاه", "Couldn't read the time — pick it above")
                : past && !repeat
                  ? i("هذا الوقت مضى — اختر وقتًا لاحقًا", "That time has passed — pick a later one")
                  : `${i("سيُنبّهك", "Will alert")}: ${fmtWhen(at)}${repeat ? ` · ${repeatLabel(repeat)}` : ""}`}
              {at !== null && parsed.timeDefaulted && ovAt === undefined && (
                <span className="text-white/50"> {i("(الساعة 9:00 افتراضية)", "(default 9:00)")}</span>
              )}
            </div>
            <div className="flex gap-1.5">
              <motion.button {...tap} disabled={!canSave} onClick={save} className="i-btn flex flex-1 items-center justify-center gap-1 bg-white/15 px-3 py-1 text-[12px] !text-white">
                <Check size={13} />
                {editing ? i("حفظ التعديل", "Save changes") : i("حفظ", "Save")}
              </motion.button>
              <motion.button {...tap} onClick={reset} className="i-btn px-3 py-1 text-[12px]">
                {i("إلغاء", "Cancel")}
              </motion.button>
            </div>
            {err && <div className="text-[11px] text-red-300">{err}</div>}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
        {upcoming.length === 0 && finished.length === 0 && (
          <p className="pt-10 text-center text-[13px] text-white/40">{i("لا تذكيرات بعد", "No reminders yet")}</p>
        )}
        {upcoming.map((r) => (
          <ReminderRow key={r.id} r={r} onEdit={() => startEdit(r)} onDelete={() => mutate(list.filter((x) => x.id !== r.id))} />
        ))}
        {finished.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-2 text-[11px] text-white/40">
              <span>{i("المنتهية", "Finished")}</span>
              <button className="i-btn px-2 py-0.5" onClick={() => mutate(list.filter((x) => !x.done))}>
                {i("مسح المنتهية", "Clear finished")}
              </button>
            </div>
            {finished.map((r) => (
              <ReminderRow key={r.id} r={r} dim onDelete={() => mutate(list.filter((x) => x.id !== r.id))} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ReminderRow({ r, dim, onEdit, onDelete }: { r: Reminder; dim?: boolean; onEdit?: () => void; onDelete: () => void }) {
  return (
    <div className={`i-card flex items-center gap-2 px-3 py-2 ${dim ? "opacity-50" : ""}`}>
      <Bell size={14} className="shrink-0 text-white/50" />
      <div className="min-w-0 flex-1">
        <div dir="auto" className="truncate text-[13px]">{r.text}</div>
        <div className="text-[11px] text-white/50">
          {fmtWhen(r.at)}
          {r.repeat ? ` · ${repeatLabel(r.repeat)}` : ""}
        </div>
      </div>
      {onEdit && (
        <button className="i-btn p-1.5" aria-label={i("تعديل", "Edit")} onClick={onEdit}>
          <Pencil size={13} />
        </button>
      )}
      <button className="i-btn p-1.5" aria-label={i("حذف", "Delete")} onClick={onDelete}>
        <X size={13} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- المؤقّت

const PRESETS = [1, 5, 10, 25];

function TimerView({ timer }: { timer: TimerState | null }) {
  const typing = useTypingFocus();
  const [min, setMin] = useState("5");
  const [sec, setSec] = useState("0");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  // عدّاد العرض: ثانية بثانية طالما التبويب ظاهر والمؤقّت جارٍ فقط.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [timer?.endsAt]);

  const start = async (seconds: number) => {
    setErr("");
    try { await invoke("timer_set", { seconds, label }); } catch (e) { setErr(String(e)); }
  };
  const total = Math.max(0, Number(min) || 0) * 60 + Math.max(0, Number(sec) || 0);

  if (timer) {
    const left = Math.max(0, timer.endsAt - now);
    const pct = timer.totalMs > 0 ? Math.min(100, (left / timer.totalMs) * 100) : 0;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div dir="ltr" className="text-[56px] font-bold leading-none tabular-nums">{fmtCountdown(left)}</div>
        {timer.label && <div dir="auto" className="text-[13px] text-white/70">{timer.label}</div>}
        <div className="h-1.5 w-72 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-white/70" style={{ width: `${pct}%`, transition: "width 1s linear" }} />
        </div>
        <div className="flex gap-2">
          <motion.button {...tap} onClick={() => start(Math.max(1, Math.round(left / 1000) + 60))} className="i-btn flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[12px]">
            <Plus size={13} />
            {i("دقيقة", "1 min")}
          </motion.button>
          <motion.button {...tap} onClick={() => invoke("timer_set", { seconds: null }).catch(() => {})} className="i-btn flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[12px]">
            <Square size={13} />
            {i("إلغاء", "Cancel")}
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex items-center gap-2" dir="ltr">
        <label className="flex items-center gap-1.5 text-[12px] text-white/60">
          <input
            type="number" min={0} max={1440} value={min}
            onChange={(e) => setMin(e.target.value)}
            onFocus={typing.onFocus} onBlur={typing.onBlur}
            className="w-20 rounded-full bg-white/10 px-3 py-1.5 text-center text-[18px] tabular-nums text-white focus:outline-none"
          />
          {i("دقيقة", "min")}
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-white/60">
          <input
            type="number" min={0} max={59} value={sec}
            onChange={(e) => setSec(e.target.value)}
            onFocus={typing.onFocus} onBlur={typing.onBlur}
            className="w-20 rounded-full bg-white/10 px-3 py-1.5 text-center text-[18px] tabular-nums text-white focus:outline-none"
          />
          {i("ثانية", "sec")}
        </label>
      </div>
      <div className="flex gap-1.5">
        {PRESETS.map((m) => (
          <button key={m} onClick={() => { setMin(String(m)); setSec("0"); }} className="i-btn bg-white/10 px-3 py-1 text-[12px]">
            {m} {i("د", "m")}
          </button>
        ))}
      </div>
      <input
        value={label} dir="auto" onChange={(e) => setLabel(e.target.value)}
        onFocus={typing.onFocus} onBlur={typing.onBlur}
        placeholder={i("تسمية اختيارية (مثلاً: الشاي)", "Optional label (e.g. tea)")}
        className={`${inputCls} !w-72`}
      />
      <motion.button {...tap} disabled={total < 1} onClick={() => start(total)} className="i-btn flex items-center gap-1.5 bg-white/15 px-5 py-2 text-[13px] !text-white">
        <Play size={14} />
        {i("ابدأ", "Start")}
      </motion.button>
      {err && <div className="text-[11px] text-red-300">{err}</div>}
    </div>
  );
}
