import { AnimatePresence, motion } from "motion/react";
import { dur, ease, MAX_STAGGER_ITEMS, spring, stagger, tap } from "../../motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pin, PinOff, Search, Trash2, X } from "lucide-react";
import { i } from "../../i18n";

type Clip = {
  id: number;
  kind: string;
  text: string | null;
  thumb: string | null;
  width: number | null;
  height: number | null;
  pinned: boolean;
  source: string | null;
};

/** تبويب الحافظة: بحث فوري + تثبيت/حذف لكل عنصر + مسح الكل + لصق بنقرة. */
export function ClipboardTab() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [q, setQ] = useState("");
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
    if (!s) return clips;
    return clips.filter((c) => (c.text ?? "").toLowerCase().includes(s) || (c.source ?? "").toLowerCase().includes(s));
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
    fn().catch(() => {}).finally(load);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2 pt-3">
      <div className="flex shrink-0 items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
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
          className="i-btn flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[12px] text-white/80"
        >
          <Trash2 size={13} />
          {i("مسح الكل", "Clear all")}
        </motion.button>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto scroll-smooth pe-1">
        {shown.length === 0 && (
          <p className="pt-10 text-center text-[13px] text-white/40">
            {q ? i("لا نتائج", "No results") : i("الحافظة فارغة", "Clipboard is empty")}
          </p>
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
            tabIndex={-1}
            onClick={() => paste(c)}
            className="i-card i-card-hover group flex cursor-pointer items-center gap-3 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              {c.kind === "image" && c.thumb ? (
                <img
                  src={`data:image/png;base64,${c.thumb}`}
                  alt={i("صورة", "Image")}
                  className="max-h-14 rounded-md object-contain"
                />
              ) : (
                <p dir="auto" className="line-clamp-2 break-words text-[13px] leading-snug text-white/90">
                  {c.text}
                </p>
              )}
              {c.kind === "image" && c.width && (
                <span dir="ltr" className="text-[11px] text-white/40">{c.width}×{c.height}</span>
              )}
            </div>
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
          <span className="rounded-full bg-white/90 px-4 py-1.5 text-[12px] font-medium text-black">{toast}</span>
        </motion.div>
      )}
    </div>
  );
}
