// لوحة تحريك الساعة: دائرة بنقطة تسحبها فتتحرّك الساعة داخل الحبة فورًا (clockX/clockY) + معاينة حيّة. الأسهم تحرّك النقطة بخطوة 2٪ (إتاحة).
import { useRef, useState } from "react";
import { i } from "../../i18n";
import { clampPct, clockAbsStyle, clockFontSize, padToPct, pctToPad } from "../island/clockPlacement";

export function ClockPad({ x, y, scale, onChange }: { x: number; y: number; scale: number; onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const cur = drag ?? { x: clampPct(x), y: clampPct(y) };
  const knob = pctToPad(cur.x, cur.y);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return padToPct(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  };
  const key = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowLeft" ? [-2, 0] : e.key === "ArrowRight" ? [2, 0] : e.key === "ArrowUp" ? [0, -2] : e.key === "ArrowDown" ? [0, 2] : null;
    if (!d) return;
    e.preventDefault();
    onChange(clampPct(cur.x + d[0]), clampPct(cur.y + d[1]));
  };
  return (
    <div className="flex flex-col items-center gap-3" data-testid="clock-pad-wrap">
      <div
        ref={ref} data-testid="clock-pad" role="slider" tabIndex={0} aria-label={i("مكان الساعة", "Clock position")} aria-valuetext={`${cur.x}% / ${cur.y}%`}
        onKeyDown={key}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag(at(e)); }}
        onPointerMove={(e) => { if (drag) setDrag(at(e)); }}
        onPointerUp={(e) => { if (drag) { const p = at(e); setDrag(null); onChange(p.x, p.y); } }}
        onPointerCancel={() => setDrag(null)}
        className="relative h-[132px] w-[132px] shrink-0 cursor-grab touch-none rounded-full outline-none"
        style={{ background: "color-mix(in srgb, currentColor 6%, transparent)", boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, currentColor 22%, transparent)" }}
      >
        <span aria-hidden className="absolute left-1/2 top-[8%] bottom-[8%] w-px" style={{ background: "color-mix(in srgb, currentColor 16%, transparent)" }} />
        <span aria-hidden className="absolute top-1/2 left-[8%] right-[8%] h-px" style={{ background: "color-mix(in srgb, currentColor 16%, transparent)" }} />
        <span data-testid="clock-pad-knob" className="absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[9px] font-extrabold"
          style={{ left: `${knob.left}%`, top: `${knob.top}%`, background: "var(--accent, #6d8dff)", color: "var(--accent-fg, #fff)", boxShadow: "0 0 0 5px color-mix(in srgb, var(--accent, #6d8dff) 30%, transparent)" }}>
          {i("ساعة", "Clock")}
        </span>
      </div>
      <div className="w-[200px] max-w-full">
        <div className="mb-1 text-[11.5px] opacity-60">{i("معاينة الحبة", "Pill preview")}</div>
        <div data-testid="clock-pad-preview" className="relative mx-auto h-[34px] w-[200px] rounded-full" style={{ background: "color-mix(in srgb, currentColor 10%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 20%, transparent)" }}>
          <span aria-hidden className="absolute left-1/2 top-[7px] h-[20px] w-[9px] -translate-x-[14px] rounded-full bg-current opacity-80" />
          <span aria-hidden className="absolute left-1/2 top-[7px] h-[20px] w-[9px] translate-x-[5px] rounded-full bg-current opacity-80" />
          <span dir="ltr" className="font-bold tabular-nums" style={{ ...clockAbsStyle(cur.x, cur.y), fontSize: `calc(13px * ${clockFontSize(scale) ? parseFloat(clockFontSize(scale)!) : 1})`, lineHeight: 1 }}>08:23</span>
        </div>
        <div className="mt-1 text-center text-[11px] tabular-nums opacity-55">{i("أفقي", "X")} {cur.x}% · {i("رأسي", "Y")} {cur.y}%</div>
      </div>
    </div>
  );
}
