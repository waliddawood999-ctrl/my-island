import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScanText, Monitor, NotebookPen, Pipette, Square, Trash2, Video } from "lucide-react";
import { motion } from "motion/react";
import { captureToolHover } from "../../motion";
import { i } from "../../i18n";
import { fmtElapsed, useRecording } from "../../useRecording";
import type { Settings } from "../../settings";

import type { CaptureShot } from "./CapturePreview";
const QuickNote = lazy(() => import("./NoteTab").then(m => ({default:m.NoteEditor})));
type RecentCapture = CaptureShot & {thumb:string; kind?:"image"|"video"; modified_at?:number};

type ColorEntry = { hex: string; r: number; g: number; b: number; h: number; s: number; l: number };

/** تبويب الأدوات: لقطات، تسجيل، منتقي ألوان مع السجل، محرّر آخر لقطة (الجلسة 3.3). */
export function ToolsTab({ settings, wide = false, quickNoteRequest = 0, onPreview }: { settings?: Partial<Settings>; wide?: boolean; quickNoteRequest?: number; onPreview?: (shot: CaptureShot) => void } = {}) {
  const rec = useRecording();
  const gallery = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ columns: 6, size: 40 });
  const [colorFormat,setColorFormat] = useState<"hex"|"rgb"|"hsl">("hex");
  const [noteOpen,setNoteOpen] = useState(quickNoteRequest > 0);
  useLayoutEffect(() => {
    const element=gallery.current; if(!element) return;
    const observer=new ResizeObserver(([entry])=>{
      const {width,height}=entry.contentRect;
      // Six columns always fill the panel; short panels use shallower cards to retain two visible rows.
      setGrid({columns:6,size:Math.max(16,Math.floor(Math.min((width-30)/6,(height-6)/2)))});
    });
    observer.observe(element);return()=>observer.disconnect();
  },[noteOpen]);
  const [recent,setRecent] = useState<RecentCapture[]>([]);
  const [recentError,setRecentError] = useState("");
  useEffect(() => { if (quickNoteRequest > 0) setNoteOpen(true); }, [quickNoteRequest]);
  useEffect(() => {
    let alive=true;
    const load=()=>invoke<RecentCapture[]>("capture_recent").then(v=>{if(alive){setRecent(Array.isArray(v)?v:[]);setRecentError("");}}).catch(e=>alive&&setRecentError(String(e)));
    load(); const un=listen("capture:saved",load); const changed=listen("capture:changed",load); const recorded=listen("record:state",load);
    return()=>{alive=false;un.then(f=>f());changed.then(f=>f());recorded.then(f=>f());};
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

  const btn = "i-btn capture-tool";
  // الاختصار العام تحت اسم كل إجراء (فارغ = معطّل ⇒ لا يظهر). الصفحة مستقلة «الالتقاط» في الدوك.
  const hk = (v?: string) => (v ? <kbd dir="ltr" className="rounded bg-white/10 px-1 text-[9.5px] font-normal text-white/55">{v}</kbd> : null);
  if (noteOpen) return <div data-testid="capture-quick-note" className="flex h-full min-h-0 flex-col gap-1"><button className="i-btn self-start px-2 py-1 text-xs" onClick={()=>setNoteOpen(false)}>{i("العودة إلى الالتقاط","Back to capture")}</button><Suspense fallback={<p>{i("جارٍ فتح الملاحظة…","Opening note…")}</p>}><QuickNote /></Suspense></div>;
  return (
    <div data-testid="capture-page" className="capture-page flex h-full min-h-0 flex-col gap-1">
      <div data-testid="capture-grid" className="capture-tool-frame" data-wide={wide}>
        <motion.button {...captureToolHover()} className={btn} onClick={run("capture_start", { mode: "area" })}>
          <Square size={15} /><span dir="auto">{i("لقطة منطقة", "Area shot")}</span>{hk(settings?.hotkeyArea)}
        </motion.button>
        <motion.button {...captureToolHover()} className={btn} onClick={run("capture_start", { mode: "screen" })}>
          <Monitor size={15} /><span dir="auto">{i("لقطة كاملة", "Full screen")}</span>{hk(settings?.hotkeyScreen)}
        </motion.button>
        {rec.recording ? (
          <motion.button {...captureToolHover()} className={`${btn} !bg-red-600/80`} onClick={run("record_stop")} aria-label={i("إيقاف التسجيل", "Stop recording")}>
            <span className="h-[18px] w-[18px] rounded-sm bg-white" />
            <span dir="ltr" className="tabular-nums">{fmtElapsed(rec.elapsed)}</span>
          </motion.button>
        ) : (
          <motion.button {...captureToolHover()} className={btn} onClick={run("record_begin")}>
            <Video size={15} /><span dir="auto">{i("تسجيل شاشة", "Record screen")}</span>{hk(settings?.hotkeyRecord)}
          </motion.button>
        )}
        <motion.button {...captureToolHover()} className={btn} onClick={run("color_pick")}>
          <Pipette size={15} /><span dir="auto">{i("منتقي الألوان", "Color picker")}</span>{hk(settings?.hotkeyColor)}
        </motion.button>
        <motion.button {...captureToolHover()} className={btn} disabled title={i("استخراج النص غير متاح بعد؛ لا يوجد محرك OCR موصول", "Text extraction is not available yet; no OCR engine is connected")}>
          <ScanText size={15} /><span dir="auto">{i("استخراج نص OCR", "Extract text OCR")}</span><small>{i("غير متاح بعد", "Not available yet")}</small>
        </motion.button>
        <motion.button {...captureToolHover()} data-testid="capture-note" className={btn} onClick={() => setNoteOpen(true)}>
          <NotebookPen size={15} /><span dir="auto">{i("ملاحظة سريعة", "Quick note")}</span>
        </motion.button>

      </div>

      <section className="capture-recent" aria-label={i("السجل الأخير","Recent history")}>
        <header className="capture-history-heading">
          <h3>{i("السجل الأخير","Recent history")}</h3>
          <span>{i("صور · فيديو · ألوان","Images · videos · colors")}</span>
          {colors.length > 0 && <>
            <select aria-label={i("صيغة نسخ اللون","Color copy format")} value={colorFormat} onChange={e=>setColorFormat(e.target.value as typeof colorFormat)}>
              <option value="hex">HEX</option><option value="rgb">RGB</option><option value="hsl">HSL</option>
            </select>
            <button data-testid="colors-clear" onClick={clearColors} className="i-btn">{i("مسح الألوان","Clear colors")}</button>
          </>}
        </header>
        <div ref={gallery} className="capture-history-viewport">
          <div className="capture-recent-row" data-testid="capture-recent" style={{gridTemplateColumns:`repeat(${grid.columns}, minmax(0, 1fr))`,gridAutoRows:grid.size}}>
            {recent.map(shot=><div className="capture-recent-square" data-kind={shot.kind || "image"} key={shot.path}>
              <button className="capture-recent-open" title={shot.path.split(/[\\/]/).pop()} onClick={()=>shot.kind==="video"?run("open_path",{path:shot.path})():onPreview?.(shot)} aria-label={`${shot.kind==="video"?i("فتح التسجيل","Open recording"):i("فتح اللقطة","Open capture")} ${shot.path}`}>
                {shot.kind==="video"?<><Video size={20}/><span>{shot.path.split(/[\\/]/).pop()}</span></>:<img src={shot.thumb} alt="" draggable={false} />}
              </button>
              <button className="capture-recent-delete" onClick={()=>void deleteShot(shot.path)} aria-label={`${i("حذف اللقطة","Delete capture")} ${shot.path}`} title={i("حذف هذا الملف فقط","Delete only this file")}><Trash2 size={11}/></button>
            </div>)}
            {colors.map(color=><div className="capture-recent-square" data-kind="color" key={color.hex}>
              <button className="capture-recent-open capture-color" style={{background:color.hex}} onClick={()=>copy(color,colorFormat)} aria-label={`${i("نسخ","Copy")} ${color.hex}`} title={`${color.hex} · ${colorFormat.toUpperCase()}`}><span dir="ltr">{color.hex}</span></button>
              <button data-testid="color-delete" className="capture-recent-delete" aria-label={`${i("حذف","Delete")} ${color.hex}`} onClick={()=>delColor(color)}><Trash2 size={11}/></button>
            </div>)}
            {!recent.length&&!colors.length&&<span className="capture-history-empty">{recentError||i("لقطاتك وتسجيلاتك وألوانك تظهر هنا","Your captures, recordings and colors appear here")}</span>}
          </div>
        </div>
      </section>
      {(toast||recentError||rec.last?.error) && <p className="capture-history-status" role="status" dir="auto">{toast||recentError||rec.last?.error}</p>}

    </div>
  );
}
