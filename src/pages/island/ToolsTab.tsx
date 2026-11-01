import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, Monitor, Pencil, Pipette, Square, Video } from "lucide-react";
import { i } from "../../i18n";
import { fmtElapsed, useRecording } from "../../useRecording";

type ColorEntry = { hex: string; r: number; g: number; b: number; h: number; s: number; l: number };

/** تبويب الأدوات: لقطات، تسجيل، منتقي ألوان مع السجل، محرّر آخر لقطة (الجلسة 3.3). */
export function ToolsTab() {
  const rec = useRecording();
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

  const run = (cmd: string, args?: Record<string, unknown>) => () => {
    invoke(cmd, args).catch((e) => say(String(e)));
  };
  const copy = (c: ColorEntry, fmt: "hex" | "rgb" | "hsl") => {
    invoke("color_patch", { hex: c.hex, format: fmt })
      .then(() => say(i(`نُسخ ${fmt.toUpperCase()}`, `Copied ${fmt.toUpperCase()}`)))
      .catch((e) => say(String(e)));
  };

  const btn = "i-btn flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs";
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-6 gap-2">
        <button className={btn} onClick={run("capture_start", { mode: "area" })}>
          <Square size={18} /><span dir="auto">{i("لقطة منطقة", "Area shot")}</span>
        </button>
        <button className={btn} onClick={run("capture_start", { mode: "screen" })}>
          <Monitor size={18} /><span dir="auto">{i("لقطة الشاشة", "Full screen")}</span>
        </button>
        {rec.recording ? (
          <button className={`${btn} !bg-red-600/80`} onClick={run("record_stop")} aria-label={i("إيقاف التسجيل", "Stop recording")}>
            <span className="h-[18px] w-[18px] rounded-sm bg-white" />
            <span dir="ltr" className="tabular-nums">{fmtElapsed(rec.elapsed)}</span>
          </button>
        ) : (
          <button className={btn} onClick={run("record_begin")}>
            <Video size={18} /><span dir="auto">{i("تسجيل", "Record")}</span>
          </button>
        )}
        <button className={btn} onClick={run("color_pick")}>
          <Pipette size={18} /><span dir="auto">{i("منتقي الألوان", "Color picker")}</span>
        </button>
        <button className={btn} onClick={run("editor_open")}>
          <Pencil size={18} /><span dir="auto">{i("تحرير آخر لقطة", "Edit last shot")}</span>
        </button>
        <button className={btn} onClick={run("open_captures")}>
          <FolderOpen size={18} /><span dir="auto">{i("مجلد اللقطات", "Captures folder")}</span>
        </button>
      </div>

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
          {toast && <span dir="auto" className="ms-auto text-[var(--app-accent)]">{toast}</span>}
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
