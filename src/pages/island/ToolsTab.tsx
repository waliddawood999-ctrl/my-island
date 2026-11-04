import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScanText, Monitor, NotebookPen, Pipette, Square, Trash2, Video } from "lucide-react";
import { i } from "../../i18n";
import { fmtElapsed, useRecording } from "../../useRecording";
import type { Settings } from "../../settings";

import type { CaptureShot } from "./CapturePreview";
const QuickNote = lazy(() => import("./NoteTab").then(m => ({default:m.NoteEditor})));
type RecentCapture = CaptureShot & {thumb:string};

type ColorEntry = { hex: string; r: number; g: number; b: number; h: number; s: number; l: number };

/** تبويب الأدوات: لقطات، تسجيل، منتقي ألوان مع السجل، محرّر آخر لقطة (الجلسة 3.3). */
export function ToolsTab({ settings, wide = false, quickNoteRequest = 0, onPreview }: { settings?: Partial<Settings>; wide?: boolean; quickNoteRequest?: number; onPreview?: (shot: CaptureShot) => void } = {}) {
  const rec = useRecording();
  const [noteOpen,setNoteOpen] = useState(quickNoteRequest > 0);
  const [recent,setRecent] = useState<RecentCapture[]>([]);
  const [recentError,setRecentError] = useState("");
  useEffect(() => { if (quickNoteRequest > 0) setNoteOpen(true); }, [quickNoteRequest]);
  useEffect(() => {
    let alive=true;
    const load=()=>invoke<RecentCapture[]>("capture_recent").then(v=>{if(alive){setRecent(Array.isArray(v)?v:[]);setRecentError("");}}).catch(e=>alive&&setRecentError(String(e)));
    load(); const un=listen("capture:saved",load); const changed=listen("capture:changed",load);
    return()=>{alive=false;un.then(f=>f());changed.then(f=>f());};
  },[]);
  const [colors, setColors] = useState<ColorEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<number | undefined>(undefined);

  const say = (t: string) => {
    setToast(t);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2200);
  };
  useEffect(() => () => window.clearTimeout(toastT.current), []);

  const loadColors = useCallback(
    () => invoke<ColorEntry[]>("color_history").then(setColors).catch(() => {}),
    [],
  );
  useEffect(() => {
    loadColors();
    const un = listen("color:picked", loadColors);
    return () => { un.then((f) => f()); };
  }, [loadColors]);

  const deleteShot = async (path:string) => {
    try {
      const deleted=await invoke<boolean>("capture_delete",{path});
      setRecent(list=>list.filter(shot=>shot.path!==path));
      say(deleted?i("حُذفت اللقطة","Capture deleted"):i("اللقطة غير موجودة؛ حُدّثت القائمة","Capture already missing; list updated"));
    } catch(e) { say(`${i("تعذّر حذف اللقطة","Could not delete capture")}: ${String(e)}`); }
  };
  const run = (cmd: string, args?: Record<string, unknown>) => () => {
    invoke(cmd, args).then(() => say(i("تم إرسال الطلب", "Request sent"))).catch((e) => say(String(e)));
  };
  // حذف لون واحد / مسح السجل: الخلفية تعيد القائمة المحدَّثة (الاستجابة تكفي؛ وإن تعذّرت نعيد التحميل).
  const delColor = (c: ColorEntry) => invoke<ColorEntry[] | null>("color_delete", { hex: c.hex }).then((l) => (Array.isArray(l) ? setColors(l) : loadColors())).catch(() => loadColors());
  const clearColors = () => invoke<ColorEntry[] | null>("color_clear").then((l) => (Array.isArray(l) ? setColors(l) : loadColors())).catch(() => loadColors());
  const copy = (c: ColorEntry, fmt: "hex" | "rgb" | "hsl") => {
    invoke("color_patch", { hex: c.hex, format: fmt })
      .then(() => say(i(`نُسخ ${fmt.toUpperCase()}`, `Copied ${fmt.toUpperCase()}`)))
      .catch((e) => say(String(e)));
  };

  const btn = "i-btn flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px]";
  // الاختصار العام تحت اسم كل إجراء (فارغ = معطّل ⇒ لا يظهر). الصفحة مستقلة «الالتقاط» في الدوك.
  const hk = (v?: string) => (v ? <kbd dir="ltr" className="rounded bg-white/10 px-1 text-[9.5px] font-normal text-white/55">{v}</kbd> : null);
  if (noteOpen) return <div data-testid="capture-quick-note" className="flex h-full min-h-0 flex-col gap-1"><button className="i-btn self-start px-2 py-1 text-xs" onClick={()=>setNoteOpen(false)}>{i("العودة إلى الالتقاط","Back to capture")}</button><Suspense fallback={<p>{i("جارٍ فتح الملاحظة…","Opening note…")}</p>}><QuickNote /></Suspense></div>;
  return (
    <div data-testid="capture-page" className="capture-page flex h-full min-h-0 flex-col gap-2">
      <div data-testid="capture-grid" className={`grid shrink-0 gap-2 ${wide ? "grid-cols-6" : "grid-cols-3"}`}>
        <button className={btn} onClick={run("capture_start", { mode: "area" })}>
          <Square size={18} /><span dir="auto">{i("لقطة منطقة", "Area shot")}</span>{hk(settings?.hotkeyArea)}
        </button>
        <button className={btn} onClick={run("capture_start", { mode: "screen" })}>
          <Monitor size={18} /><span dir="auto">{i("لقطة كاملة", "Full screen")}</span>{hk(settings?.hotkeyScreen)}
        </button>
        {rec.recording ? (
          <button className={`${btn} !bg-red-600/80`} onClick={run("record_stop")} aria-label={i("إيقاف التسجيل", "Stop recording")}>
            <span className="h-[18px] w-[18px] rounded-sm bg-white" />
            <span dir="ltr" className="tabular-nums">{fmtElapsed(rec.elapsed)}</span>
          </button>
        ) : (
          <button className={btn} onClick={run("record_begin")}>
            <Video size={18} /><span dir="auto">{i("تسجيل شاشة", "Record screen")}</span>{hk(settings?.hotkeyRecord)}
          </button>
        )}
        <button className={btn} onClick={run("color_pick")}>
          <Pipette size={18} /><span dir="auto">{i("منتقي الألوان", "Color picker")}</span>{hk(settings?.hotkeyColor)}
        </button>
        <button className={btn} disabled title={i("استخراج النص غير متاح بعد؛ لا يوجد محرك OCR موصول", "Text extraction is not available yet; no OCR engine is connected")}>
          <ScanText size={18} /><span dir="auto">{i("استخراج نص OCR", "Extract text OCR")}</span><small>{i("غير متاح بعد", "Not available yet")}</small>
        </button>
        <button data-testid="capture-note" className={btn} onClick={() => setNoteOpen(true)}>
          <NotebookPen size={18} /><span dir="auto">{i("ملاحظة سريعة", "Quick note")}</span>
        </button>

      </div>

      <section className="capture-recent" aria-label={i("اللقطات الأخيرة","Recent captures")}>
        <h3>{i("اللقطات الأخيرة","Recent captures")}</h3>
        <div className="capture-recent-row" data-testid="capture-recent">
          {recent.map(shot=><div className="capture-recent-square" key={shot.path}>
            <button className="capture-recent-open" onClick={()=>onPreview?.(shot)} aria-label={`${i("فتح اللقطة","Open capture")} ${shot.path}`}><img src={shot.thumb} alt="" draggable={false} /></button>
            <button className="capture-recent-delete" onClick={()=>void deleteShot(shot.path)} aria-label={`${i("حذف اللقطة","Delete capture")} ${shot.path}`} title={i("حذف ملف هذه اللقطة فقط","Delete only this capture file")}><Trash2 size={12}/></button>
          </div>)}
          {!recent.length && <span>{recentError || i("لا لقطات محفوظة بعد","No saved captures yet")}</span>}
        </div>
      </section>
      {(rec.last?.path || rec.last?.error) && !rec.recording && (
        <p dir="auto" className={`shrink-0 truncate text-xs ${rec.last.error ? "text-red-400" : "text-white/70"}`}>
          {rec.last.error
            ? i(`فشل التسجيل: ${rec.last.error}`, `Recording failed: ${rec.last.error}`)
            : i(`حُفظ التسجيل: ${rec.last.path}`, `Recording saved: ${rec.last.path}`)}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex shrink-0 items-center gap-2 text-xs text-white/60">
          <Pipette size={12} /><span dir="auto">{i("آخر الألوان", "Recent colors")}</span>
          {colors.length > 0 && <button data-testid="colors-clear" onClick={clearColors} className="ms-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] hover:bg-white/20">{i("حذف الكل", "Clear all")}</button>}
          {toast && <span dir="auto" className="ms-auto inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--app-accent)]" />{toast}</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {colors.length === 0 ? (
            <p dir="auto" className="py-3 text-center text-xs text-white/40">
              {i("لا ألوان بعد — التقط لونًا بالمنتقي", "No colors yet — pick one with the picker")}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {colors.map((c) => (
                <li key={c.hex} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5">
                  <button
                    aria-label={`${i("نسخ", "Copy")} ${c.hex}`}
                    title={i("نسخ HEX", "Copy HEX")}
                    onClick={() => copy(c, "hex")}
                    className="h-6 w-6 shrink-0 rounded-md border border-white/30"
                    style={{ background: c.hex }}
                  />
                  <span dir="ltr" className="w-[4.5rem] shrink-0 text-xs font-semibold tabular-nums">{c.hex}</span>
                  {(["hex", "rgb", "hsl"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => copy(c, f)}
                      title={f === "hex" ? c.hex : f === "rgb" ? `rgb(${c.r}, ${c.g}, ${c.b})` : `hsl(${c.h}, ${c.s}%, ${c.l}%)`}
                      className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase hover:bg-white/20"
                    >
                      {f}
                    </button>
                  ))}
                  <button data-testid="color-delete" aria-label={`${i("حذف", "Delete")} ${c.hex}`} title={i("حذف اللون", "Delete color")} onClick={() => delColor(c)} className="ms-auto rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
