import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import { ClipboardPaste, File as FileIcon, FileText, Folder, Trash2 } from "lucide-react";
import { dur, ease, spring, tap } from "../../motion";
import { i } from "../../i18n";
import { fmtBytes } from "../../useDownloads";
import type { ShelfItem } from "../../useShelf";

/** ذاكرة أيقونات الصدفة (palette_icon) لكل مسار — تُجلب مرة واحدة. */
const iconCache = new Map<string, string | null>();

export function useShellIcon(path: string, want: boolean): string | null {
  const [icon, setIcon] = useState<string | null>(iconCache.get(path) ?? null);
  useEffect(() => {
    if (!want) return;
    if (iconCache.has(path)) { setIcon(iconCache.get(path) ?? null); return; }
    let live = true;
    invoke<string | null>("palette_icon", { path })
      .then((b) => { iconCache.set(path, b); if (live) setIcon(b); })
      .catch(() => {});
    return () => { live = false; };
  }, [path, want]);
  return icon;
}

const DRAG_THRESHOLD = 6;

function Tile({
  item, onOpen, onMenu, onDragOut,
}: {
  item: ShelfItem;
  onOpen: (it: ShelfItem) => void;
  onMenu: (e: React.MouseEvent, it: ShelfItem) => void;
  onDragOut: (it: ShelfItem) => void;
}) {
  const shell = useShellIcon(item.path, (item.kind === "file" || item.kind === "dir" || (item.kind === "image" && !item.thumb)) && !item.missing);
  const dragged = useRef(false);

  // سحب للخارج: ضغط ثم حركة > عتبة ⇒ سحب أصلي (OLE) عبر shelf_drag.
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || item.missing) return;
    const sx = e.clientX, sy = e.clientY;
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return;
      cleanup();
      dragged.current = true;
      onDragOut(item);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
  };

  const visual = item.thumb ? (
    <img src={`data:image/png;base64,${item.thumb}`} alt="" draggable={false} className="h-full w-full object-cover" />
  ) : item.kind === "text" ? (
    <p dir="auto" className="line-clamp-4 break-words p-1.5 text-[10px] leading-tight text-white/70">{item.preview}</p>
  ) : shell ? (
    <img src={`data:image/png;base64,${shell}`} alt="" draggable={false} className="h-9 w-9" />
  ) : item.kind === "dir" ? (
    <Folder size={28} className="text-amber-300/80" />
  ) : (
    <FileIcon size={28} className="text-white/60" />
  );

  const meta = item.missing
    ? i("غير موجود", "Missing")
    : item.kind === "dir"
      ? i("مجلد", "Folder")
      : item.size != null
        ? fmtBytes(item.size)
        : "";

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.92, filter: "blur(4px)" }}
      animate={{ opacity: item.missing ? 0.45 : 1, scale: 1, filter: "blur(0px)", transition: { ...spring.content, opacity: { duration: dur.swap, ease: ease.out } } }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: dur.fast, ease: ease.inOut } }}
      whileTap={{ scale: 0.97 }}
      role="button"
      tabIndex={-1}
      title={item.path}
      onPointerDown={down}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } onOpen(item); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(e, item); }}
      className="i-card i-card-hover flex w-[104px] cursor-pointer flex-col items-center gap-1 p-2"
    >
      <div className="flex h-14 w-full items-center justify-center overflow-hidden rounded-lg bg-white/5">{visual}</div>
      <span dir="auto" className="w-full truncate text-center text-[12px] text-white/90">{item.name}</span>
      <span dir="ltr" className="text-[10px] text-white/40">{meta}</span>
    </motion.div>
  );
}

/** تبويب الرفّ: شبكة عناصر (مصغّرات/أيقونات + اسم + حجم)، إفلات من المستكشف، سحب للخارج، قائمة يمنى. */
export function ShelfTab({ items, dragging, reload }: { items: ShelfItem[]; dragging: boolean; reload: () => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: ShelfItem } | null>(null);
  const toastT = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearTimeout(toastT.current), []);

  const flash = (m: string) => {
    setToast(m);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 1800);
  };
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    fn().then(() => { if (ok) flash(ok); }).catch((e) => flash(String(e || i("تعذّرت العملية", "Operation failed")))).finally(reload);

  const open = (it: ShelfItem) => {
    if (it.missing) return flash(i("الملف لم يعد موجودًا", "File no longer exists"));
    // نص: النقر ينسخه (لا معنى لفتح ملف .txt داخلي)؛ غيره يُفتح بالتطبيق الافتراضي.
    if (it.kind === "text") return void run(() => invoke("shelf_copy", { id: it.id }), i("نُسخ النص", "Text copied"));
    run(() => invoke("open_path", { path: it.path }));
  };
  const dragOut = (it: ShelfItem) => { invoke("shelf_drag", { ids: [it.id] }).catch(() => {}); };

  const showMenu = (e: React.MouseEvent, item: ShelfItem) => {
    const r = box.current?.getBoundingClientRect();
    const W = 190, H = 150;
    const x = Math.min(Math.max(e.clientX - (r?.left ?? 0), 4), (r?.width ?? 0) - W - 4);
    const y = Math.min(Math.max(e.clientY - (r?.top ?? 0), 4), (r?.height ?? 0) - H - 4);
    setMenu({ x, y, item });
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const entries = menu
    ? [
        { label: i("نسخ", "Copy"), fn: () => run(() => invoke("shelf_copy", { id: menu.item.id }), i("تم النسخ", "Copied")) },
        { label: i("نسخ المسار", "Copy path"), fn: () => run(() => invoke("shelf_copy", { id: menu.item.id, mode: "path" }), i("نُسخ المسار", "Path copied")) },
        { label: i("إظهار في المجلد", "Show in folder"), fn: () => run(() => invoke("run_shell", { target: menu.item.path, mode: "folder" })) },
        { label: i("إزالة", "Remove"), fn: () => run(() => invoke("shelf_remove", { id: menu.item.id })), danger: true },
      ]
    : [];

  return (
    <div ref={box} className="relative flex h-full min-h-0 flex-col gap-2 pt-3">
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[12px] text-white/50">
          {items.length > 0
            ? i(`${items.length} عنصر — اسحب إلى أي تطبيق أو مجلد`, `${items.length} items — drag to any app or folder`)
            : i("اسحب ملفات إلى الحبة أو إلى هنا", "Drag files onto the pill or here")}
        </span>
        <motion.button
          {...tap}
          onClick={() => run(() => invoke("shelf_add", { clipboard: true }), i("أُضيف من الحافظة", "Added from clipboard"))}
          className="i-btn ms-auto flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[12px] text-white/80"
        >
          <ClipboardPaste size={13} />
          {i("من الحافظة", "From clipboard")}
        </motion.button>
        <motion.button
          {...tap}
          disabled={items.length === 0}
          onClick={() => run(() => invoke("shelf_clear"))}
          className="i-btn flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[12px] text-white/80"
        >
          <Trash2 size={13} />
          {i("تفريغ", "Clear")}
        </motion.button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth pe-1">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/40">
            <FileText size={28} />
            <p className="text-[13px]">{i("الرفّ فارغ", "Shelf is empty")}</p>
          </div>
        ) : (
          <div className="flex flex-wrap content-start gap-2" dir="ltr">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((it) => (
                <Tile key={it.id} item={it} onOpen={open} onMenu={showMenu} onDragOut={dragOut} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.fast }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed border-white/40 bg-black/60 text-[14px] font-medium text-white"
          >
            {i("أفلت لإضافتها إلى الرفّ", "Drop to add to the shelf")}
          </motion.div>
        )}
      </AnimatePresence>

      {menu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1, transition: spring.content }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ left: menu.x, top: menu.y, width: 190 }}
          className="i-glass absolute z-20 flex flex-col gap-0.5 rounded-xl p-1 shadow-lg ring-1 ring-white/10"
        >
          {entries.map((en) => (
            <button
              key={en.label}
              dir="auto"
              onClick={() => { setMenu(null); en.fn(); }}
              className={`rounded-lg px-3 py-1.5 text-start text-[13px] hover:bg-white/10 ${en.danger ? "text-red-300" : "text-white/90"}`}
            >
              {en.label}
            </button>
          ))}
        </motion.div>
      )}

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: spring.content }}
          className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center"
        >
          <span className="rounded-full bg-white/90 px-4 py-1.5 text-[12px] font-medium text-black">{toast}</span>
        </motion.div>
      )}
    </div>
  );
}
