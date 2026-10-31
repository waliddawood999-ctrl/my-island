// طبقة الالتقاط: صورة الشاشة المجمّدة + سحب لتحديد منطقة (الجلسة 3.2).
// الإحداثيات المُرسلة بالبكسلات الفعلية = بكسلات CSS × (عرض الصورة الطبيعي ÷ عرضها المعروض)،
// فتبقى الأبعاد صحيحة مهما اختلف DPI الشاشة.
// 3.3: الطبقة نفسها تخدم ثلاثة أغراض حسب frame.mode — "area" لقطة (Shift = افتح المحرّر بعد الحفظ)،
// "record" اختيار منطقة تسجيل (Enter بلا تحديد = الشاشة كاملة)، "color" عدسة مكبّرة لالتقاط لون بكسل.
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "../../index.css";
import { i } from "../../i18n";
import { useSettings } from "../../useSettings";

type Mode = "area" | "record" | "color";
type Frame = { image: string; width: number; height: number; mode?: Mode };
type Pt = { x: number; y: number };
const MIN = 4; // أصغر مساحة (بكسل CSS) تُعدّ تحديدًا
const GRID = 11; // خلايا العدسة (فردي كي يوجد بكسل مركزي)
const CELL = 12; // حجم الخلية بالبكسل المعروض

const hex2 = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

function App() {
  useSettings(); // اللغة فقط
  const [frame, setFrame] = useState<Frame | null>(null);
  const [a, setA] = useState<Pt | null>(null);
  const [b, setB] = useState<Pt | null>(null);
  const [dragging, setDragging] = useState(false);
  // المنتقي: موضع المؤشر بالبكسلات الفعلية (يتحرك بالفأرة وبالأسهم بكسلًا بكسلًا).
  const [pos, setPos] = useState<Pt | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const srcRef = useRef<HTMLCanvasElement | null>(null); // الصورة بحجمها الطبيعي لقراءة البكسلات
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const mode: Mode = frame?.mode ?? "area";

  const reset = () => { setA(null); setB(null); setDragging(false); setPos(null); };

  const load = useCallback(async () => {
    const f = await invoke<Frame | null>("capture_frame").catch(() => null);
    if (!f) return;
    reset();
    srcRef.current = null;
    setFrame(f);
  }, []);

  useEffect(() => {
    const u1 = listen("capture:start", load);
    const u2 = listen("capture:end", () => { setFrame(null); reset(); });
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

  /** يؤكّد المنطقة (بكسلات CSS): لقطة ⇒ capture_region، تسجيل ⇒ record_start. */
  const commit = useCallback((x: number, y: number, w: number, h: number, edit: boolean) => {
    const r = ratio();
    const args = {
      x: Math.round(x * r), y: Math.round(y * r),
      w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)),
    };
    if (mode === "record") invoke("record_start", args).catch(() => {});
    else invoke("capture_region", { ...args, edit }).catch(() => {});
  }, [mode, frame]);

  const confirm = useCallback((edit: boolean) => {
    if (selected) { commit(selected.x, selected.y, selected.w, selected.h, edit); return; }
    // تسجيل بلا تحديد ⇒ الشاشة كاملة.
    if (mode === "record" && frame) {
      invoke("record_start", { x: 0, y: 0, w: frame.width, h: frame.height }).catch(() => {});
    }
  }, [selected, commit, mode, frame]);

  /** لون البكسل (x,y فعليان) من الصورة الأصلية. */
  const pixel = (x: number, y: number): [number, number, number] | null => {
    const c = srcRef.current;
    if (!c || x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
    const d = c.getContext("2d")!.getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2]];
  };

  const pick = useCallback(() => {
    if (mode !== "color" || !pos) return;
    invoke("color_pick", { x: pos.x, y: pos.y }).catch(() => {});
  }, [mode, pos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      else if (e.key === "Enter") { e.preventDefault(); if (mode === "color") pick(); else confirm(e.shiftKey); }
      else if (mode === "color" && pos && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (d && frame) {
          setPos({
            x: Math.min(frame.width - 1, Math.max(0, pos.x + d[0])),
            y: Math.min(frame.height - 1, Math.max(0, pos.y + d[1])),
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, confirm, pick, mode, pos, frame]);

  // الطبقة تُظهر نفسها بعد فكّ ترميز الصورة فقط (لا وميض).
  const onLoaded = () => {
    const img = imgRef.current;
    if (img && mode === "color") {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0);
      srcRef.current = c;
    }
    invoke("capture_ready").catch(() => {});
  };

  // رسم العدسة عند تغيّر الموضع.
  useEffect(() => {
    if (mode !== "color" || !pos) return;
    const c = srcRef.current, lc = loupeRef.current;
    if (!c || !lc) return;
    const half = (GRID - 1) / 2;
    const data = c.getContext("2d")!.getImageData(pos.x - half, pos.y - half, GRID, GRID);
    const g = lc.getContext("2d")!;
    g.clearRect(0, 0, lc.width, lc.height);
    for (let yy = 0; yy < GRID; yy++) {
      for (let xx = 0; xx < GRID; xx++) {
        const o = (yy * GRID + xx) * 4;
        const inside = pos.x - half + xx >= 0 && pos.y - half + yy >= 0 && pos.x - half + xx < c.width && pos.y - half + yy < c.height;
        g.fillStyle = inside ? `rgb(${data.data[o]},${data.data[o + 1]},${data.data[o + 2]})` : "#000";
        g.fillRect(xx * CELL, yy * CELL, CELL, CELL);
      }
    }
    g.strokeStyle = "#fff"; g.lineWidth = 2;
    g.strokeRect(half * CELL + 1, half * CELL + 1, CELL - 2, CELL - 2);
    g.strokeStyle = "#000"; g.lineWidth = 1;
    g.strokeRect(half * CELL, half * CELL, CELL, CELL);
  }, [pos, mode, frame]);

  const pt = (e: React.MouseEvent): Pt => ({ x: e.clientX, y: e.clientY });
  const label = selected
    ? `${Math.max(1, Math.round(selected.w * ratio()))} × ${Math.max(1, Math.round(selected.h * ratio()))}`
    : null;

  if (!frame) return null;
  const r = ratio();
  const px = pos && mode === "color" ? pixel(pos.x, pos.y) : null;
  const live = px ? `#${hex2(px[0])}${hex2(px[1])}${hex2(px[2])}` : null;
  const size = GRID * CELL;
  // موضع العدسة بـCSS: يمين-أسفل المؤشر ويقلب عند الحواف.
  const lx = pos ? pos.x / r : 0, ly = pos ? pos.y / r : 0;
  const flipX = lx + size + 40 > window.innerWidth, flipY = ly + size + 70 > window.innerHeight;
  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-black"
      style={{ cursor: mode === "color" ? "none" : "crosshair" }}
      onMouseDown={(e) => {
        if (e.button === 2) { cancel(); return; }
        if (e.button !== 0 || mode === "color") return;
        setA(pt(e)); setB(pt(e)); setDragging(true);
      }}
      onMouseMove={(e) => {
        if (mode === "color") {
          const k = ratio(); // وقت الحدث (لا قيمة الرسم السابق: الصورة قد تُركَّب بعده)
          setPos({
            x: Math.min(frame.width - 1, Math.max(0, Math.floor(e.clientX * k))),
            y: Math.min(frame.height - 1, Math.max(0, Math.floor(e.clientY * k))),
          });
          return;
        }
        if (dragging) setB(pt(e));
      }}
      onClick={() => { if (mode === "color") pick(); }}
      onMouseUp={(e) => {
        if (!dragging || mode === "color") return;
        setB(pt(e)); setDragging(false);
        // الإفلات يؤكّد إن كان التحديد صالحًا؛ نقرة بلا سحب تتجاهل.
        const w = Math.abs(e.clientX - (a?.x ?? e.clientX));
        const h = Math.abs(e.clientY - (a?.y ?? e.clientY));
        if (w >= MIN && h >= MIN) {
          commit(Math.min(a!.x, e.clientX), Math.min(a!.y, e.clientY), w, h, e.shiftKey);
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
      {/* تعتيم الشاشة كلها؛ المنطقة المحددة تُفرَّغ بظلّ ضخم (لا تعتيم في وضع الألوان كي تُرى الألوان الحقيقية) */}
      {!selected && mode !== "color" && <div className="absolute inset-0 bg-black/45" />}
      {selected && (
        <div
          className="absolute"
          style={{
            left: selected.x, top: selected.y, width: selected.w, height: selected.h,
            boxShadow: "0 0 0 100vmax rgba(0,0,0,0.5)",
            outline: `1px solid ${mode === "record" ? "#ff5a5a" : "#8ea2ff"}`,
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
      {mode === "color" && pos && (
        <div
          data-testid="loupe"
          className="pointer-events-none absolute overflow-hidden rounded-lg border-2 border-white shadow-xl"
          style={{ left: flipX ? lx - size - 24 : lx + 24, top: flipY ? ly - size - 54 : ly + 24, width: size }}
        >
          <canvas ref={loupeRef} width={size} height={size} className="block" />
          <div dir="ltr" data-testid="loupe-hex" className="flex items-center justify-between gap-2 bg-black/85 px-2 py-1 text-xs font-semibold text-white">
            <span className="h-3 w-3 rounded-sm border border-white/60" style={{ background: live ?? "transparent" }} />
            <span>{live ?? "—"}</span>
            <span className="text-white/60">{pos.x},{pos.y}</span>
          </div>
        </div>
      )}
      {!dragging && !selected && (
        <div
          dir="auto"
          className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/75 px-4 py-1.5 text-sm text-white"
        >
          {mode === "color"
            ? i("انقر لالتقاط لون البكسل · الأسهم لضبط دقيق · Esc للإلغاء", "Click to pick the pixel color · Arrows to nudge · Esc to cancel")
            : mode === "record"
              ? i("اسحب لتحديد منطقة التسجيل · Enter للشاشة كاملة · Esc للإلغاء", "Drag to select the recording area · Enter for full screen · Esc to cancel")
              : i("اسحب لتحديد منطقة · Shift = افتح المحرّر · Esc للإلغاء", "Drag to select an area · Shift = open in editor · Esc to cancel")}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
