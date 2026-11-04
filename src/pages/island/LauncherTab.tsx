import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import {
  AppWindow, FolderPlus, File as FileIcon, FilePlus, Folder, Globe, GripVertical, Keyboard, LayoutGrid, Pencil, Plus, Rocket,
  Search, Trash2, X,
} from "lucide-react";
import { dur, ease, MAX_STAGGER_ITEMS, spring, stagger, tap } from "../../motion";
import { LottieIcon } from "../../lottie";
import { i } from "../../i18n";
import { useShellIcon } from "./ShelfTab";
import type { useLauncher } from "../../useLauncher";
import {
  addGroup, filterItems, keyCombo, moveGroup, moveItem, removeGroup, renameGroup, sections,
  type LauncherGroup, type LauncherItem,
} from "../../launcherGroups";

type Launcher = ReturnType<typeof useLauncher>;
const DRAG_THRESHOLD = 6;

/** نافذة الحبة لا تأخذ فوكسًا إلا لحقول الإدخال: take_focus عند الدخول، release_focus عند الخروج/الإزالة. */
function useFocusGuard() {
  const on = useRef(false);
  useEffect(() => () => { if (on.current) invoke("release_focus").catch(() => {}); }, []);
  return {
    onFocus: () => { on.current = true; invoke("take_focus").catch(() => {}); },
    onBlur: () => { on.current = false; invoke("release_focus").catch(() => {}); },
  };
}

type Over =
  | { kind: "group"; id: string; below: boolean }
  | { kind: "item"; id: number; group: string };
type Drag = { kind: "item" | "group"; id: number | string; x: number; y: number; label: string; icon: string | null; over: Over | null };

type Dialog =
  | { type: "link" }
  | { type: "edit"; item: LauncherItem }
  | { type: "group"; gid?: string; name: string }
  | { type: "hotkey"; item: LauncherItem };

function Visual({ item, size }: { item: LauncherItem; size: number }) {
  const shell = useShellIcon(item.path, item.kind !== "link" && !item.icon && !item.missing);
  const b64 = item.icon ?? shell;
  if (b64) return <img src={`data:image/png;base64,${b64}`} alt="" draggable={false} style={{ width: size, height: size }} className="object-contain" />;
  const cls = "text-white/60";
  return item.kind === "link" ? <Globe size={size * 0.7} className="text-sky-300/80" />
    : item.kind === "dir" ? <Folder size={size * 0.7} className="text-amber-300/80" />
    : item.kind === "app" ? <AppWindow size={size * 0.7} className={cls} />
    : <FileIcon size={size * 0.7} className={cls} />;
}

function Tile({
  item, n = 0, hotkey, dragging, over, onLaunch, onMenu, onDown,
}: {
  n?: number;
  item: LauncherItem; hotkey?: string; dragging: boolean; over: boolean;
  onLaunch: (it: LauncherItem) => void;
  onMenu: (e: React.MouseEvent, it: LauncherItem) => void;
  onDown: (e: React.PointerEvent, it: LauncherItem) => void;
}) {
  return (
    <motion.div
      layout="position"
      data-item-id={item.id}
      initial={{ opacity: 0, scale: 0.92, filter: "blur(4px)" }}
      animate={{ opacity: dragging ? 0.35 : item.missing ? 0.45 : 1, scale: 1, filter: "blur(0px)", transition: { ...spring.content, delay: Math.min(n, MAX_STAGGER_ITEMS) * stagger.item, opacity: { duration: dur.swap, ease: ease.out, delay: Math.min(n, MAX_STAGGER_ITEMS) * stagger.item } } }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: dur.fast, ease: ease.inOut } }}
      whileTap={{ scale: 0.96 }}
      role="button"
      tabIndex={-1}
      title={item.missing ? i("غير موجود", "Missing") : item.path}
      onPointerDown={(e) => onDown(e, item)}
      onClick={() => onLaunch(item)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(e, item); }}
      className={`i-card i-card-hover flex w-[92px] cursor-pointer select-none flex-col items-center gap-1 p-2 ${over ? "ring-2 ring-white/60" : ""}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/5"><Visual item={item} size={44} /></div>
      <span dir="auto" className="line-clamp-2 min-h-[2.2em] w-full break-words text-center text-[12px] leading-tight text-white/90">{item.name}</span>
      {hotkey && <span dir="ltr" className="rounded bg-white/10 px-1.5 text-[9px] text-white/60">{hotkey}</span>}
    </motion.div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.fast }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-black/60"
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1, transition: spring.content }}
        className="i-glass flex w-[360px] max-w-full flex-col gap-3 rounded-2xl p-4 shadow-lg ring-1 ring-white/10"
      >
        <div className="flex items-center">
          <h3 dir="auto" className="text-[14px] font-medium text-white">{title}</h3>
          <button onClick={onClose} className="i-btn ms-auto p-1" aria-label={i("إغلاق", "Close")}><X size={14} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Field({ label, value, onChange, placeholder, auto, ltr }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; auto?: boolean; ltr?: boolean;
}) {
  const f = useFocusGuard();
  return (
    <label className="flex flex-col gap-1 text-[12px] text-white/60">
      {label}
      <input
        autoFocus={auto} value={value} dir={ltr ? "ltr" : "auto"} placeholder={placeholder} {...f}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg bg-white/10 px-3 py-1.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/40"
      />
    </label>
  );
}

function SubmitRow({ busy, error, label, onSubmit }: { busy?: boolean; error: string | null; label: string; onSubmit: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {error && <span dir="auto" className="text-[12px] text-red-300">{error}</span>}
      <motion.button {...tap} disabled={busy} onClick={onSubmit} className="i-btn ms-auto bg-white/15 px-4 py-1.5 text-[13px] text-white">{label}</motion.button>
    </div>
  );
}

/** تبويب اللانشر: شبكة أيقونات كبيرة بمجموعات، بحث سريع، إطلاق بنقرة، سحب بين المجموعات، واختصارات عالمية. */
export function LauncherTab({ launcher }: { launcher: Launcher }) {
  const { items, groups, hotkeys, reload, setGroups } = launcher;
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: LauncherItem } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const toastT = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const searchFocus = useFocusGuard();

  useEffect(() => () => window.clearTimeout(toastT.current), []);
  const flash = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 1800);
  }, []);
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    fn().then(() => { if (ok) flash(ok); }).catch((e) => flash(String(e || i("تعذّرت العملية", "Operation failed")))).finally(reload);

  const saveGroups = useCallback((next: LauncherGroup[]) => {
    setGroups(next); // تفاؤلي؛ الخلفية تنظّف وتعيد النسخة المعتمدة
    invoke<LauncherGroup[]>("launcher_groups_set", { groups: next }).then(setGroups).catch(() => reload());
  }, [reload, setGroups]);

  const launch = (it: LauncherItem) => {
    if (moved.current) { moved.current = false; return; }
    if (it.missing) return flash(i("المسار لم يعد موجودًا", "Path no longer exists"));
    run(() => invoke("launcher_launch", { id: it.id }));
  };

  const add = (pick: "app" | "file" | "folder") => {
    setAddOpen(false);
    run(async () => {
      const added = await invoke<LauncherItem[]>("launcher_add", { pick });
      if (added.length > 0) flash(i(`أُضيف ${added.length}`, `Added ${added.length}`));
    });
  };

  // ── قوائم منسدلة/يمنى: تُغلق بالنقر خارجها أو Esc
  useEffect(() => {
    if (!menu && !addOpen) return;
    const close = () => { setMenu(null); setAddOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", close);
    };
  }, [menu, addOpen]);

  const showMenu = (e: React.MouseEvent, item: LauncherItem) => {
    const r = box.current?.getBoundingClientRect();
    const W = 200, H = 260;
    setAddOpen(false);
    setMenu({
      x: Math.min(Math.max(e.clientX - (r?.left ?? 0), 4), (r?.width ?? 0) - W - 4),
      y: Math.min(Math.max(e.clientY - (r?.top ?? 0), 4), (r?.height ?? 0) - H - 4),
      item,
    });
  };

  // ── السحب بالمؤشر (HTML5 DnD معطّل مع tauri drag-drop): عنصر ⇒ مجموعة/موضع، ترويسة مجموعة ⇒ ترتيب
  const resolve = (x: number, y: number, kind: "item" | "group"): Over | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const sec = el.closest<HTMLElement>("[data-group-id]");
    if (!sec || !box.current?.contains(sec)) return null;
    const group = sec.dataset.groupId ?? "";
    if (kind === "group") {
      if (group === "") return null;
      const r = sec.getBoundingClientRect();
      return { kind: "group", id: group, below: y > r.top + r.height / 2 };
    }
    const tile = el.closest<HTMLElement>("[data-item-id]");
    if (tile) return { kind: "item", id: Number(tile.dataset.itemId), group };
    return { kind: "group", id: group, below: false };
  };

  const startDrag = (e: React.PointerEvent, spec: { kind: "item" | "group"; id: number | string; label: string; icon: string | null }) => {
    if (e.button !== 0 || q.trim()) return;
    const sx = e.clientX, sy = e.clientY;
    let active = false;
    let over: Over | null = null;
    let lx = sx, ly = sy;
    const update = () => {
      over = resolve(lx, ly, spec.kind);
      const r = box.current?.getBoundingClientRect();
      setDrag({ ...spec, x: lx - (r?.left ?? 0), y: ly - (r?.top ?? 0), over });
    };
    // تمرير تلقائي عند الاقتراب من حافتي منطقة التمرير (اللوحة قصيرة فلا تتسع كل المجموعات)
    const scroll = window.setInterval(() => {
      const sc = scroller.current;
      if (!active || !sc) return;
      const r = sc.getBoundingClientRect();
      const dy = ly < r.top + 28 ? -10 : ly > r.bottom - 28 ? 10 : 0;
      if (dy) { sc.scrollBy({ top: dy, behavior: "instant" }); update(); }
    }, 16);
    const move = (ev: PointerEvent) => {
      lx = ev.clientX; ly = ev.clientY;
      if (!active) {
        if (Math.hypot(lx - sx, ly - sy) < DRAG_THRESHOLD) return;
        active = true;
        moved.current = true;
        setMenu(null);
      }
      update();
    };
    const up = () => {
      window.clearInterval(scroll);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!active) return;
      setDrag(null);
      window.setTimeout(() => { moved.current = false; }, 0); // يمنع click الناتج عن الإفلات
      if (!over) return;
      if (spec.kind === "item") {
        const id = spec.id as number;
        const t = over.kind === "item" ? { group: over.group, before: over.id === id ? undefined : over.id } : { group: over.id };
        saveGroups(moveItem(groups, id, t));
      } else {
        const gid = spec.id as string;
        if (over.kind !== "group") return;
        const idx = groups.findIndex((g) => g.id === over!.id);
        const before = over.below ? (groups[idx + 1]?.id ?? null) : over.id;
        saveGroups(moveGroup(groups, gid, before));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onItemDown = (e: React.PointerEvent, it: LauncherItem) => startDrag(e, { kind: "item", id: it.id, label: it.name, icon: it.icon });

  const searching = q.trim().length > 0;
  const found = useMemo(() => filterItems(items, q), [items, q]);
  const sec = useMemo(() => sections(items, groups), [items, groups]);

  const renderTiles = (list: LauncherItem[]) => (
    <AnimatePresence mode="popLayout">
      {list.map((it, n) => (
        <Tile
          key={it.id} n={n} item={it} hotkey={hotkeys[String(it.id)]}
          dragging={drag?.kind === "item" && drag.id === it.id}
          over={drag?.over?.kind === "item" && drag.over.id === it.id && drag.id !== it.id}
          onLaunch={launch} onMenu={showMenu} onDown={onItemDown}
        />
      ))}
    </AnimatePresence>
  );

  const hasGroups = groups.length > 0;
  const overGroup = (id: string) => (drag?.over && (drag.over.kind === "group" ? drag.over.id === id : drag.over.group === id) ? drag.kind === "item" : false);

  const entries = menu
    ? [
        { label: i("فتح", "Open"), fn: () => launch(menu.item) },
        { label: i("إعادة تسمية / تعديل", "Rename / edit"), fn: () => setDialog({ type: "edit", item: menu.item }) },
        { label: i("اختصار عالمي…", "Global hotkey…"), fn: () => setDialog({ type: "hotkey", item: menu.item }) },
        { label: i("تغيير الأيقونة…", "Change icon…"), fn: () => run(() => invoke("launcher_pick_icon", { id: menu.item.id })) },
        ...(menu.item.icon && menu.item.kind !== "link" ? [{ label: i("الأيقونة الافتراضية", "Default icon"), fn: () => run(() => invoke("launcher_pick_icon", { id: menu.item.id, reset: true })) }] : []),
        ...(menu.item.kind === "link"
          ? [{ label: i("تحديث أيقونة الموقع", "Refresh site icon"), fn: () => run(() => invoke("launcher_link_icon", { url: menu.item.path, id: menu.item.id }), i("حُدّثت الأيقونة", "Icon refreshed")) }]
          : [{ label: i("إظهار في المجلد", "Show in folder"), fn: () => run(() => invoke("run_shell", { target: menu.item.path, mode: "folder" })) }]),
        { label: i("إزالة", "Remove"), fn: () => run(() => invoke("launcher_remove", { id: menu.item.id })), danger: true },
      ]
    : [];

  return (
    <div ref={box} className="relative flex h-full min-h-0 flex-col gap-2 pt-3">
      <div className="launcher-toolbar flex shrink-0 items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
          <Search size={14} className="text-white/50" />
          <input
            value={q} dir="auto" {...searchFocus}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQ("");
              if (e.key === "Enter" && found[0]) launch(found[0]);
            }}
            placeholder={i("ابحث في المكتبة…", "Search Library…")}
            className="w-full bg-transparent text-[13px] text-white placeholder:text-white/40 focus:outline-none"
          />
        </label>
        <div className="relative">
          <motion.button
            {...tap} onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { setMenu(null); setAddOpen((v) => !v); }}
            className="i-btn flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[12px] text-white/80"
          >
            <Plus size={13} />{i("إضافة", "Add")}
          </motion.button>
          {addOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1, transition: spring.content }}
              onPointerDown={(e) => e.stopPropagation()}
              className="i-glass absolute end-0 top-full z-20 mt-1 flex w-[170px] flex-col gap-0.5 rounded-xl p-1 shadow-lg ring-1 ring-white/10"
            >
              {[
                { label: i("تطبيق", "App"), icon: <AppWindow size={14} />, fn: () => add("app") },
                { label: i("ملف", "File"), icon: <FilePlus size={14} />, fn: () => add("file") },
                { label: i("مجلد", "Folder"), icon: <Folder size={14} />, fn: () => add("folder") },
                { label: i("رابط ويب", "Web link"), icon: <Globe size={14} />, fn: () => { setAddOpen(false); setDialog({ type: "link" }); } },
              ].map((en) => (
                <button key={en.label} dir="auto" onClick={en.fn} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-start text-[13px] text-white/90 hover:bg-white/10">
                  {en.icon}{en.label}
                </button>
              ))}
            </motion.div>
          )}
        </div>
        <motion.button
          {...tap} onClick={() => setDialog({ type: "group", name: "" })}
          className="i-btn flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[12px] text-white/80"
        >
          <FolderPlus size={13} />{i("مجموعة", "Group")}
        </motion.button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pe-1">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/40">
            <LottieIcon name="empty" size={64} />
            <p className="text-[13px]">{i("لا تطبيقات محفوظة في المكتبة", "No saved applications in the Library")}</p>
            <p className="text-[11px]">{i("أضف تطبيقًا أو ملفًا أو مجلدًا أو رابطًا من «إضافة»", "Add an app, file, folder or link with “Add”")}</p>
          </div>
        ) : searching ? (
          found.length === 0 ? (
            <p className="pt-8 text-center text-[13px] text-white/40">{i("لا نتائج", "No results")}</p>
          ) : (
            <div className="flex flex-wrap content-start gap-2" dir="ltr">{renderTiles(found)}</div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {(sec.ungrouped.length > 0 || hasGroups) && (
              <section data-group-id="" className={`rounded-xl p-1 ${overGroup("") ? "bg-white/10" : ""}`}>
                {hasGroups && <h4 dir="auto" className="mb-1.5 px-1 text-[12px] font-medium text-white/50">{i("غير مصنّف", "Ungrouped")}</h4>}
                <div className="flex min-h-[40px] flex-wrap content-start gap-2" dir="ltr">
                  {renderTiles(sec.ungrouped)}
                  {hasGroups && sec.ungrouped.length === 0 && <span dir="auto" className="px-1 text-[11px] text-white/30">{i("اسحب هنا لإخراج عنصر من مجموعته", "Drop here to ungroup")}</span>}
                </div>
              </section>
            )}
            {sec.groups.map(({ group, items: gi }) => (
              <section
                key={group.id} data-group-id={group.id}
                className={`rounded-xl p-1 ${overGroup(group.id) ? "bg-white/10" : ""} ${drag?.kind === "group" && drag.over?.kind === "group" && drag.over.id === group.id ? "ring-1 ring-white/50" : ""}`}
              >
                <div className="mb-1.5 flex items-center gap-1 px-1" dir="ltr">
                  <span
                    onPointerDown={(e) => startDrag(e, { kind: "group", id: group.id, label: group.name, icon: null })}
                    className="cursor-grab touch-none text-white/30 hover:text-white/70" title={i("اسحب لإعادة الترتيب", "Drag to reorder")}
                  ><GripVertical size={14} /></span>
                  <h4 dir="auto" onDoubleClick={() => setDialog({ type: "group", gid: group.id, name: group.name })} className="text-[12px] font-medium text-white/70">{group.name}</h4>
                  <span className="text-[10px] text-white/30">{gi.length}</span>
                  <button className="i-btn ms-1 p-1" title={i("إعادة تسمية", "Rename")} onClick={() => setDialog({ type: "group", gid: group.id, name: group.name })}><Pencil size={11} /></button>
                  <button className="i-btn p-1" title={i("حذف المجموعة", "Delete group")} onClick={() => saveGroups(removeGroup(groups, group.id))}><Trash2 size={11} /></button>
                </div>
                <div className="flex min-h-[40px] flex-wrap content-start gap-2" dir="ltr">
                  {renderTiles(gi)}
                  {gi.length === 0 && (
                    <span dir="auto" className="flex h-10 flex-1 items-center justify-center rounded-lg border border-dashed border-white/15 text-[11px] text-white/30">
                      {i("اسحب عناصر إلى هنا", "Drag items here")}
                    </span>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {drag && (
        <div
          style={{ left: drag.x, top: drag.y }}
          className="pointer-events-none absolute z-40 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl bg-white/20 px-3 py-1.5 text-[12px] text-white shadow-lg "
        >
          {drag.kind === "group" ? <LayoutGrid size={14} /> : drag.icon ? <img src={`data:image/png;base64,${drag.icon}`} alt="" className="h-5 w-5" /> : <Rocket size={14} />}
          <span dir="auto" className="max-w-[140px] truncate">{drag.label}</span>
        </div>
      )}

      {menu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1, transition: spring.content }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ left: menu.x, top: menu.y, width: 200 }}
          className="i-glass absolute z-20 flex flex-col gap-0.5 rounded-xl p-1 shadow-lg ring-1 ring-white/10"
        >
          {entries.map((en) => (
            <button
              key={en.label} dir="auto" onClick={() => { setMenu(null); en.fn(); }}
              className={`rounded-lg px-3 py-1.5 text-start text-[13px] hover:bg-white/10 ${"danger" in en && en.danger ? "text-red-300" : "text-white/90"}`}
            >{en.label}</button>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {dialog?.type === "link" && <LinkDialog key="link" onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); flash(m); reload(); }} />}
        {dialog?.type === "edit" && <EditDialog key="edit" item={dialog.item} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} />}
        {dialog?.type === "group" && (
          <GroupDialog
            key="group" initial={dialog.name} editing={!!dialog.gid} onClose={() => setDialog(null)}
            onDone={(name) => { saveGroups(dialog.gid ? renameGroup(groups, dialog.gid, name) : addGroup(groups, name)); setDialog(null); }}
          />
        )}
        {dialog?.type === "hotkey" && (
          <HotkeyDialog key="hotkey" item={dialog.item} current={hotkeys[String(dialog.item.id)] ?? ""} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: spring.content }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-0 bottom-2 z-40 flex justify-center"
          >
            <span dir="auto" className="rounded-full bg-white/90 px-4 py-1.5 text-[12px] font-medium text-black">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const errText = (e: unknown) => String(e || i("تعذّرت العملية", "Operation failed"));

function LinkDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (!url.trim()) return setErr(i("أدخل الرابط", "Enter a URL"));
    setBusy(true);
    invoke("launcher_add_link", { url, name: name.trim() || undefined })
      .then(() => onDone(i("أُضيف الرابط", "Link added")))
      .catch((e) => { setErr(errText(e)); setBusy(false); });
  };
  return (
    <Modal title={i("إضافة رابط ويب", "Add web link")} onClose={onClose}>
      <Field label={i("الرابط", "URL")} value={url} onChange={setUrl} placeholder="example.com" auto ltr />
      <Field label={i("الاسم (اختياري)", "Name (optional)")} value={name} onChange={setName} />
      <p className="text-[11px] text-white/40">{i("تُجلب أيقونة الموقع تلقائيًا (اتصال بالموقع نفسه فقط).", "The site icon is fetched automatically (connects to that site only).")}</p>
      <SubmitRow busy={busy} error={err} label={i("إضافة", "Add")} onSubmit={submit} />
    </Modal>
  );
}

function EditDialog({ item, onClose, onDone }: { item: LauncherItem; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  const [url, setUrl] = useState(item.kind === "link" ? item.path : "");
  const [err, setErr] = useState<string | null>(null);
  const submit = () =>
    invoke("launcher_edit_link", { id: item.id, name, url: item.kind === "link" ? url : undefined })
      .then(onDone).catch((e) => setErr(errText(e)));
  return (
    <Modal title={item.kind === "link" ? i("تعديل الرابط", "Edit link") : i("إعادة التسمية", "Rename")} onClose={onClose}>
      <Field label={i("الاسم", "Name")} value={name} onChange={setName} auto />
      {item.kind === "link" && <Field label={i("الرابط", "URL")} value={url} onChange={setUrl} ltr />}
      <SubmitRow error={err} label={i("حفظ", "Save")} onSubmit={submit} />
    </Modal>
  );
}

function GroupDialog({ initial, editing, onClose, onDone }: { initial: string; editing: boolean; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const submit = () => (name.trim() ? onDone(name) : setErr(i("أدخل اسمًا", "Enter a name")));
  return (
    <Modal title={editing ? i("إعادة تسمية المجموعة", "Rename group") : i("مجموعة جديدة", "New group")} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === "Enter") submit(); }}>
        <Field label={i("اسم المجموعة", "Group name")} value={name} onChange={setName} auto />
      </div>
      <SubmitRow error={err} label={editing ? i("حفظ", "Save") : i("إنشاء", "Create")} onSubmit={submit} />
    </Modal>
  );
}

function HotkeyDialog({ item, current, onClose, onDone }: { item: LauncherItem; current: string; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const f = useFocusGuard();
  const pad = useRef<HTMLDivElement>(null);
  useEffect(() => { pad.current?.focus(); }, []);
  const set = (hotkey: string) => invoke("launcher_hotkeys_set", { id: item.id, hotkey }).then(onDone).catch((e) => setErr(errText(e)));
  return (
    <Modal title={i(`اختصار عالمي: ${item.name}`, `Global hotkey: ${item.name}`)} onClose={onClose}>
      <div
        ref={pad} tabIndex={0} {...f}
        onKeyDown={(e) => {
          if (e.key === "Escape") return;
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "Backspace" || e.key === "Delete") return void set("");
          if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
          const combo = keyCombo(e.nativeEvent);
          if (!combo) return setErr(i("مفتاح غير مدعوم", "Unsupported key"));
          if (!combo.includes("+")) return setErr(i("أضف Ctrl أو Alt أو Shift", "Add Ctrl, Alt or Shift"));
          set(combo);
        }}
        className="flex h-12 items-center justify-center gap-2 rounded-lg bg-white/10 text-[14px] text-white focus:outline-none focus:ring-1 focus:ring-white/50"
      >
        <Keyboard size={16} className="text-white/50" />
        <span dir="ltr">{current || i("اضغط الاختصار الآن…", "Press the shortcut now…")}</span>
      </div>
      <p dir="auto" className="text-[11px] text-white/40">{i("يعمل في أي مكان. Backspace يزيله، Esc يلغي.", "Works anywhere. Backspace removes it, Esc cancels.")}</p>
      {err && <span dir="auto" className="text-[12px] text-red-300">{err}</span>}
      {current && <motion.button {...tap} onClick={() => set("")} className="i-btn self-start bg-white/10 px-3 py-1.5 text-[12px] text-white/80">{i("إزالة الاختصار", "Remove hotkey")}</motion.button>}
    </Modal>
  );
}
