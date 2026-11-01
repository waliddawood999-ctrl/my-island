// نافذة محرّر اللقطات (الجلسة 3.3): أسهم، خطوط، مستطيلات، نص، تمويه (pixelate)، قصّ، تراجع/إعادة.
// editor_image يعطي الصورة، editor_save يحفظ نسخة جديدة أو فوق الأصل وينسخ للحافظة.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Crop, Grid3x3, Minus, MoveUpRight, Redo2, Save, SaveAll, Square, Type, Undo2, X } from "lucide-react";
import "../../index.css";
import { i } from "../../i18n";
import { useSettings } from "../../useSettings";
import { boxFrom, drawOp, renderOps, type Op, type Tool } from "./ops";

type Img = { path: string; image: string };
const COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#ffffff", "#000000"];

function App() {
  useSettings(); // اللغة فقط
  const [path, setPath] = useState("");
  const [base, setBase] = useState<HTMLImageElement | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [redo, setRedo] = useState<Op[]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number; left: number; top: number } | null>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const draft = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const msgT = useRef<number | undefined>(undefined);

  const flash = (text: string, err = false) => {
    setMsg({ text, err });
    window.clearTimeout(msgT.current);
    msgT.current = window.setTimeout(() => setMsg(null), 3500);
  };

  const load = useCallback(async () => {
    const r = await invoke<Img>("editor_image").catch((e) => { flash(String(e), true); return null; });
    if (!r) return;
    const im = new Image();
    im.onload = () => { setBase(im); setOps([]); setRedo([]); setPath(r.path); setTextAt(null); };
    im.onerror = () => flash(i("تعذّر فتح الصورة", "Could not open the image"), true);
    im.src = r.image;
  }, []);

  useEffect(() => {
    const un = listen("editor:open", load);
    load();
    return () => { un.then((f) => f()); };
  }, [load]);

  // الصورة بعد تطبيق كل العمليات المثبّتة.
  const out = useMemo(() => (base ? renderOps(base, ops) : null), [base, ops]);

  useEffect(() => {
    const v = view.current, d = draft.current;
    if (!v || !d || !out) return;
    v.width = out.width; v.height = out.height;
    d.width = out.width; d.height = out.height;
    v.getContext("2d")!.drawImage(out, 0, 0);
  }, [out]);

  const toImg = (e: { clientX: number; clientY: number }) => {
    const r = view.current!.getBoundingClientRect();
    const k = view.current!.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k };
  };

  const push = (o: Op) => { setOps((s) => [...s, o]); setRedo([]); };
  const undo = useCallback(() => setOps((s) => {
    if (!s.length) return s;
    setRedo((r) => [...r, s[s.length - 1]]);
    return s.slice(0, -1);
  }), []);
  const redoOp = useCallback(() => setRedo((r) => {
    if (!r.length) return r;
    setOps((s) => [...s, r[r.length - 1]]);
    return r.slice(0, -1);
  }), []);

  /** يرسم معاينة السحب الحي على طبقة المسودة. */
  const paintDraft = () => {
    const d = draft.current;
    if (!d) return;
    const g = d.getContext("2d")!;
    g.clearRect(0, 0, d.width, d.height);
    const s = drag.current;
    if (!s) return;
    if (tool === "arrow" || tool === "line") {
      drawOp(g, { t: tool, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, color, width });
    } else if (tool === "rect") {
      drawOp(g, { t: "rect", x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1), color, width });
    } else if (tool === "pixelate" || tool === "crop") {
      const b = boxFrom(s.x1, s.y1, s.x2, s.y2, d.width, d.height);
      if (!b) return;
      if (tool === "crop") {
        g.fillStyle = "rgba(0,0,0,0.55)";
        g.fillRect(0, 0, d.width, d.height);
        g.clearRect(b.x, b.y, b.w, b.h);
      }
      g.setLineDash([8, 6]); g.lineWidth = Math.max(2, d.width / 600);
      g.strokeStyle = "#4fd1c5"; g.strokeRect(b.x, b.y, b.w, b.h);
    }
  };

  const clearDraft = () => {
    drag.current = null;
    const d = draft.current;
    d?.getContext("2d")!.clearRect(0, 0, d.width, d.height);
  };

  const textDone = useRef(false);
  const commitText = (value: string) => {
    // Enter ثم blur عند إزالة الحقل: لا نثبّت مرتين.
    if (textDone.current) return;
    textDone.current = true;
    if (textAt && value.trim()) {
      push({ t: "text", x: textAt.x, y: textAt.y, text: value, color, size: Math.max(14, width * 5) });
    }
    setTextAt(null);
  };

  useEffect(() => { if (textAt) { textDone.current = false; textRef.current?.focus(); } }, [textAt]);

  const save = useCallback(async (mode: "new" | "overwrite") => {
    if (!out) return;
    try {
      const p = await invoke<string>("editor_save", { data: out.toDataURL("image/png"), mode });
      flash(i(`حُفظت ونُسخت للحافظة: ${p}`, `Saved and copied to clipboard: ${p}`));
    } catch (e) {
      flash(String(e), true);
    }
  }, [out]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redoOp(); }
      else if ((e.ctrlKey || e.metaKey) && k === "s") { e.preventDefault(); save("new"); }
      else if (e.key === "Escape") { clearDraft(); setTextAt(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redoOp, save]);

  const tools: { id: Tool; icon: typeof Square; label: string }[] = [
    { id: "arrow", icon: MoveUpRight, label: i("سهم", "Arrow") },
    { id: "line", icon: Minus, label: i("خط", "Line") },
    { id: "rect", icon: Square, label: i("مستطيل", "Rectangle") },
    { id: "text", icon: Type, label: i("نص", "Text") },
    { id: "pixelate", icon: Grid3x3, label: i("تمويه", "Pixelate") },
    { id: "crop", icon: Crop, label: i("قصّ", "Crop") },
  ];
  const btn = "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors";

  return (
    <div dir="auto" className="flex h-screen flex-col bg-[var(--app-editor-bg)] text-white">
      <div dir="ltr" className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-3 py-2">
        {tools.map((t) => (
          <button
            key={t.id}
            aria-label={t.label}
            title={t.label}
            aria-pressed={tool === t.id}
            onClick={() => { setTool(t.id); setTextAt(null); }}
            className={`${btn} ${tool === t.id ? "bg-[#3cbfb3]" : "bg-white/8 hover:bg-white/15"}`}
          >
            <t.icon size={16} /><span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-white/15" />
        {COLORS.map((c) => (
          <button
            key={c}
            aria-label={c}
            onClick={() => setColor(c)}
            className="h-6 w-6 rounded-full border-2"
            style={{ background: c, borderColor: color === c ? "#4fd1c5" : "rgba(255,255,255,0.3)" }}
          />
        ))}
        <input
          type="range" min={2} max={16} value={width}
          aria-label={i("السماكة", "Thickness")}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="mx-1 w-24 accent-[#3cbfb3]"
        />
        <span className="mx-1 h-6 w-px bg-white/15" />
        <button aria-label={i("تراجع", "Undo")} title="Ctrl+Z" disabled={!ops.length} onClick={undo} className={`${btn} bg-white/8 hover:bg-white/15 disabled:opacity-30`}><Undo2 size={16} /></button>
        <button aria-label={i("إعادة", "Redo")} title="Ctrl+Y" disabled={!redo.length} onClick={redoOp} className={`${btn} bg-white/8 hover:bg-white/15 disabled:opacity-30`}><Redo2 size={16} /></button>
        <span className="flex-1" />
        <button aria-label={i("حفظ نسخة جديدة", "Save as new copy")} title="Ctrl+S" disabled={!out} onClick={() => save("new")} className={`${btn} bg-[#3cbfb3] hover:bg-[#8196ff] disabled:opacity-40`}>
          <Save size={16} /><span>{i("حفظ نسخة", "Save copy")}</span>
        </button>
        <button aria-label={i("حفظ فوق الأصل", "Overwrite original")} disabled={!out} onClick={() => save("overwrite")} className={`${btn} bg-white/8 hover:bg-white/15 disabled:opacity-40`}>
          <SaveAll size={16} /><span>{i("فوق الأصل", "Overwrite")}</span>
        </button>
        <button aria-label={i("إغلاق", "Close")} onClick={() => getCurrentWindow().hide().catch(() => {})} className={`${btn} bg-white/8 hover:bg-white/15`}><X size={16} /></button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {!out && <p className="text-white/60">{i("لا صورة مفتوحة", "No image open")}</p>}
        <div className="relative inline-block" style={{ display: out ? "inline-block" : "none", lineHeight: 0 }}>
          <canvas ref={view} data-testid="view" className="block max-h-[calc(100vh-110px)] max-w-full bg-[repeating-conic-gradient(#2a2c37_0%_25%,#20222b_0%_50%)] bg-[length:16px_16px]" />
          <canvas
            ref={draft}
            data-testid="draft"
            className="absolute inset-0 h-full w-full"
            style={{ cursor: tool === "text" ? "text" : "crosshair", touchAction: "none" }}
            // الأداة النصية: لا نترك mousedown ينقل الفوكس من حقل الكتابة الذي يُفتح للتو.
            onMouseDown={(e) => { if (tool === "text") e.preventDefault(); }}
            onPointerDown={(e) => {
              if (e.button !== 0 || !out) return;
              if (tool === "text") {
                const p = toImg(e);
                const r = view.current!.getBoundingClientRect();
                setTextAt({ x: p.x, y: p.y, left: e.clientX - r.left, top: e.clientY - r.top });
                return;
              }
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = toImg(e);
              drag.current = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const p = toImg(e);
              drag.current.x2 = p.x; drag.current.y2 = p.y;
              paintDraft();
            }}
            onPointerUp={(e) => {
              const s = drag.current;
              if (!s || !out) return;
              const p = toImg(e);
              s.x2 = p.x; s.y2 = p.y;
              clearDraft();
              const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
              if (len < 3) return;
              if (tool === "arrow" || tool === "line") push({ t: tool, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, color, width });
              else if (tool === "rect") push({ t: "rect", x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1), color, width });
              else {
                const b = boxFrom(s.x1, s.y1, s.x2, s.y2, out.width, out.height);
                if (!b) return;
                if (tool === "pixelate") push({ t: "pixelate", ...b, block: Math.max(6, Math.round(Math.min(b.w, b.h) / 8), width * 2) });
                else if (tool === "crop") push({ t: "crop", ...b });
              }
            }}
          />
          {textAt && (
            <textarea
              ref={textRef}
              data-testid="text-input"
              dir="auto"
              rows={1}
              placeholder={i("اكتب ثم Enter", "Type then Enter")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(e.currentTarget.value); }
                else if (e.key === "Escape") { e.stopPropagation(); setTextAt(null); }
              }}
              onBlur={(e) => commitText(e.currentTarget.value)}
              className="absolute min-w-40 rounded border border-[#4fd1c5] bg-black/70 px-2 py-1 text-sm leading-normal text-white outline-none"
              style={{ left: textAt.left, top: textAt.top }}
            />
          )}
        </div>
      </div>

      <div dir="auto" className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-1.5 text-xs text-white/60">
        <span className="truncate" dir="ltr">{path}</span>
        {out && <span dir="ltr">{out.width} × {out.height}</span>}
      </div>
      {msg && (
        <div
          role="status"
          dir="auto"
          className={`pointer-events-none absolute bottom-10 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full px-4 py-1.5 text-sm ${msg.err ? "bg-red-600/90" : "bg-black/85"}`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
