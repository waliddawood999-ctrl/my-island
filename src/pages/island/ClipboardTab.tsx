import { AnimatePresence, motion } from "motion/react";
import { dur, ease, MAX_STAGGER_ITEMS, spring, stagger, tap } from "../../motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pin, PinOff, Search, Trash2, X } from "lucide-react";
import { LottieIcon } from "../../lottie";
import { i } from "../../i18n";
import { ClipActions } from "./ClipActions";

type Clip = {
  id: number;
  kind: string;
  text: string | null;
  thumb: string | null;
  width: number | null;
  height: number | null;
  pinned: boolean;
  source: string | null;
  created_at?: number;
  image_path?: string | null;
};

/** تبويب الحافظة: بحث فوري + تثبيت/حذف لكل عنصر + مسح الكل + لصق بنقرة. */
export function ClipboardTab() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<number | undefined>(undefined);
  const focused = useRef(false);

  const load = useCallback(
    () => invoke<Clip[]>("clip_list").then(setClips).catch(() => {}),
    [],
  );

  // لا حدث «clip:changed» في العقد — استطلاع خفيف طالما التبويب ظاهر.
  useEffect(() => {
    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [load]);

  // إن أُغلق التبويب والبحث ممسك بالفوكس، أعده للتطبيق السابق.
  useEffect(
    () => () => {
      window.clearTimeout(toastT.current);
      if (focused.current) invoke("release_focus").catch(() => {});
    },
    [],
  );

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clips.filter(c => !s || (c.text ?? "").toLowerCase().includes(s) || (c.source ?? "").toLowerCase().includes(s));
  }, [clips, q]);

  const flash = (m: string) => {
    setToast(m);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 1800);
  };

  const paste = async (c: Clip) => {
    try {
      const r = await invoke<string>("clip_paste", { id: c.id });
      if (r !== "pasted") flash(i("لُصق في الحافظة", "Copied to clipboard"));
    } catch {
      flash(i("تعذّر اللصق", "Paste failed"));
    }
    load();
  };

  const act = (e: React.MouseEvent, fn: () => Promise<unknown>) => {
    e.stopPropagation();
    fn().then(() => flash(i("تم الإجراء", "Done"))).catch((error) => flash(`${i("تعذّر الإجراء", "Action failed")}: ${String(error)}`)).finally(load);
  };

  return (
    <div className="clipboard-page relative flex h-full min-h-0 flex-col" data-testid="clipboard-page">
      <div className="clipboard-toolbar" data-testid="clipboard-toolbar">
        <label className="clipboard-search flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
          <Search size={14} className="text-white/50" />
          <input
            value={q}
            dir="auto"
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => { focused.current = true; invoke("take_focus").catch(() => {}); }}
            onBlur={() => { focused.current = false; invoke("release_focus").catch(() => {}); }}
            placeholder={i("ابحث في الحافظة…", "Search clipboard…")}
            className="w-full bg-transparent text-[13px] text-white placeholder:text-white/40 focus:outline-none"
          />
        </label>
        <motion.button
          {...tap}
          onClick={(e) => act(e, () => invoke("clip_clear"))}
          data-testid="clipboard-clear" className="clipboard-clear i-btn flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[12px] text-white/80"
        >
          <Trash2 size={13} />
          {i("مسح الكل", "Clear all")}
        </motion.button>
      </div>

      <div className="clipboard-items min-h-0 flex-1 overflow-y-auto pe-1" data-testid="clipboard-items">
        {shown.length === 0 && (
          <div className="flex flex-col items-center gap-1 pt-4 text-center text-[13px] text-white/40">
            <LottieIcon name="empty" size={64} />
            <p>{q ? i("لا نتائج", "No results") : i("الحافظة فارغة", "Clipboard is empty")}</p>
          </div>
        )}
        <AnimatePresence mode="popLayout">
        {shown.map((c, n) => (
          <motion.div
            key={c.id}
            layout="position"
            initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { ...spring.content, delay: Math.min(n, MAX_STAGGER_ITEMS) * stagger.item, opacity: { duration: dur.swap, ease: ease.out, delay: Math.min(n, MAX_STAGGER_ITEMS) * stagger.item } } }}
            exit={{ opacity: 0, transition: { duration: dur.fast, ease: ease.inOut } }}
            whileTap={{ scale: 0.985 }}
            role="button"
            tabIndex={0}
            data-testid={`clip-item-${c.id}`}
            aria-label={c.text || i("صورة في الحافظة", "Clipboard image")}
            onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter") { e.preventDefault(); setSelected(c.id); void paste(c); } else if (e.key === " ") { e.preventDefault(); setSelected(c.id); } }}
            onClick={() => { setSelected(c.id); void paste(c); }}
            className={`clip-item i-card i-card-hover group flex cursor-pointer items-center gap-2 px-2 py-1 ${selected === c.id ? "clip-selected" : ""}`}
          >
            <div className="min-w-0 flex-1">
              {c.kind === "image" && c.thumb ? (
                <img
                  src={`data:image/png;base64,${c.thumb}`}
                  alt={i("صورة", "Image")}
                  className="max-h-9 rounded-md object-contain"
                />
              ) : (
                <p dir="auto" className="line-clamp-1 break-words text-[12px] leading-snug text-white/90">
                  {c.text}
                </p>
              )}
              {c.created_at != null && <time dateTime={new Date(c.created_at).toISOString()} className="text-[10px] text-white/50">{new Date(c.created_at).toLocaleTimeString(i("ar-SA", "en-US"), {hour:"2-digit",minute:"2-digit"})}</time>}
              {c.kind === "text" && <ClipActions text={c.text} onDone={flash} />}
              {c.kind === "image" && c.width && (
                <span dir="ltr" className="text-[11px] text-white/40">{c.width}×{c.height}</span>
              )}
            </div>
            <button className="i-btn p-1.5" aria-label={i("نسخ العنصر", "Copy item")} onClick={e => act(e, async () => {
              if (c.kind === "text") await invoke("clip_set_text", {text:c.text ?? ""});
              else if (c.image_path) { const items=await invoke<{id:number}[]>("shelf_add",{paths:[c.image_path]}); if (!items?.[0]) throw new Error(i("تعذر تجهيز الصورة", "Could not prepare image")); await invoke("shelf_copy",{id:items[0].id}); }
              else throw new Error(i("لا مسار للصورة", "Image path unavailable"));
            })}>{i("نسخ", "Copy")}</button>
            <motion.button
              {...tap}
              aria-label={c.pinned ? i("إلغاء التثبيت", "Unpin") : i("تثبيت", "Pin")}
              onClick={(e) => act(e, () => invoke("clip_pin", { id: c.id, pinned: !c.pinned }))}
              className={`i-btn p-1.5 ${c.pinned ? "!text-amber-300" : "!text-white/40 hover:!text-white"}`}
            >
              {c.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </motion.button>
            <motion.button
              {...tap}
              aria-label={i("حذف", "Delete")}
              onClick={(e) => act(e, () => invoke("clip_delete", { id: c.id }))}
              className="i-btn p-1.5 !text-white/40 hover:!text-red-300"
            >
              <X size={14} />
            </motion.button>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: spring.content }}
          className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center"
        >
          <span className="flex items-center gap-1 rounded-full bg-white/90 py-1 pe-4 ps-2 text-[12px] font-medium text-black"><LottieIcon name="tick" size={20} />{toast}</span>
        </motion.div>
      )}
    </div>
  );
}
