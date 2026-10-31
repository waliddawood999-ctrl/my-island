// طبقة الالتقاط: صورة الشاشة المجمّدة + سحب لتحديد منطقة (الجلسة 3.2).
// الإحداثيات المُرسلة بالبكسلات الفعلية = بكسلات CSS × (عرض الصورة الطبيعي ÷ عرضها المعروض)،
// فتبقى الأبعاد صحيحة مهما اختلف DPI الشاشة.
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "../../index.css";
import { i } from "../../i18n";
import { useSettings } from "../../useSettings";

type Frame = { image: string; width: number; height: number };
type Pt = { x: number; y: number };
const MIN = 4; // أصغر مساحة (بكسل CSS) تُعدّ تحديدًا

function App() {
  useSettings(); // اللغة فقط
  const [frame, setFrame] = useState<Frame | null>(null);
  const [a, setA] = useState<Pt | null>(null);
  const [b, setB] = useState<Pt | null>(null);
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const load = useCallback(async () => {
    const f = await invoke<Frame | null>("capture_frame").catch(() => null);
    if (!f) return;
    setA(null); setB(null); setDragging(false);
    setFrame(f);
  }, []);

  useEffect(() => {
    const u1 = listen("capture:start", load);
    const u2 = listen("capture:end", () => { setFrame(null); setA(null); setB(null); setDragging(false); });
    load();
    return () => { u1.then((f) => f()); u2.then((f) => f()); };
  }, [load]);

  const cancel = useCallback(() => { invoke("capture_cancel").catch(() => {}); }, []);

  // نسبة البكسل الفعلي إلى CSS (≥1 على الشاشات عالية DPI).
  const ratio = () => {
    const el = imgRef.current;
    return el && el.clientWidth ? frame!.width / el.clientWidth : 1;
  };

  const rect = a && b ? {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  } : null;
  const selected = rect && rect.w >= MIN && rect.h >= MIN ? rect : null;

  const confirm = useCallback(() => {
    if (!selected || !frame) return;
    const r = ratio();
    invoke("capture_region", {
      x: Math.round(selected.x * r), y: Math.round(selected.y * r),
      w: Math.max(1, Math.round(selected.w * r)), h: Math.max(1, Math.round(selected.h * r)),
    }).catch(() => {});
  }, [selected, frame]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      else if (e.key === "Enter") { e.preventDefault(); confirm(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, confirm]);

  // الطبقة تُظهر نفسها بعد فكّ ترميز الصورة فقط (لا وميض).
  const onLoaded = () => { invoke("capture_ready").catch(() => {}); };

  const pt = (e: React.MouseEvent): Pt => ({ x: e.clientX, y: e.clientY });
  const label = selected
    ? `${Math.max(1, Math.round(selected.w * ratio()))} × ${Math.max(1, Math.round(selected.h * ratio()))}`
    : null;

  if (!frame) return null;
  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-black"
      style={{ cursor: "crosshair" }}
      onMouseDown={(e) => {
        if (e.button === 2) { cancel(); return; }
        if (e.button !== 0) return;
        setA(pt(e)); setB(pt(e)); setDragging(true);
      }}
      onMouseMove={(e) => { if (dragging) setB(pt(e)); }}
      onMouseUp={(e) => {
        if (!dragging) return;
        setB(pt(e)); setDragging(false);
        // الإفلات يؤكّد إن كان التحديد صالحًا؛ نقرة بلا سحب تتجاهل.
        const w = Math.abs(e.clientX - (a?.x ?? e.clientX));
        const h = Math.abs(e.clientY - (a?.y ?? e.clientY));
        if (w >= MIN && h >= MIN) {
          const r = ratio();
          const x = Math.min(a!.x, e.clientX), y = Math.min(a!.y, e.clientY);
          invoke("capture_region", {
            x: Math.round(x * r), y: Math.round(y * r),
            w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)),
          }).catch(() => {});
        } else { setA(null); setB(null); }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img
        ref={imgRef}
        src={frame.image}
        onLoad={onLoaded}
        draggable={false}
        className="absolute inset-0 h-full w-full"
        alt=""
      />
      {/* تعتيم الشاشة كلها؛ المنطقة المحددة تُفرَّغ بظلّ ضخم */}
      {!selected && <div className="absolute inset-0 bg-black/45" />}
      {selected && (
        <div
          className="absolute"
          style={{
            left: selected.x, top: selected.y, width: selected.w, height: selected.h,
            boxShadow: "0 0 0 100vmax rgba(0,0,0,0.5)",
            outline: "1px solid #8ea2ff",
          }}
        />
      )}
      {label && selected && (
        <div
          dir="ltr"
          className="absolute rounded bg-black/80 px-2 py-0.5 text-xs font-semibold text-white"
          style={{
            left: selected.x,
            top: selected.y > 26 ? selected.y - 24 : selected.y + selected.h + 4,
          }}
        >
          {label}
        </div>
      )}
      {!dragging && !selected && (
        <div
          dir="auto"
          className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/75 px-4 py-1.5 text-sm text-white"
        >
          {i("اسحب لتحديد منطقة · Esc للإلغاء", "Drag to select an area · Esc to cancel")}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
