import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { i } from "../../i18n";
import { useSettings } from "../../useSettings";
import { ClipboardTab } from "./ClipboardTab";

const PILL = { w: 200, h: 32 };
const PANEL = { w: 720, h: 480 };
/** مدة انتقال CSS (ms) — تُستعمل أيضًا لتأخير تصغير النافذة بعد الانكماش. */
const ANIM_MS = 300;

function nowHHMM(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const TABS = () => [
  i("الرئيسية", "Home"),
  i("الحافظة", "Clipboard"),
  i("الأدوات", "Tools"),
  i("المحادثة", "Chat"),
];

/** الحبة: pill أسود 200×32 بساعة، تتمدد بالهوفر إلى لوحة 720×480 وتنكمش بعد مغادرة المؤشر. */
export function Pill() {
  const settings = useSettings();
  const [time, setTime] = useState(nowHHMM);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const hoverT = useRef<number | undefined>(undefined);
  const collapseT = useRef<number | undefined>(undefined);
  const shrinkT = useRef<number | undefined>(undefined);

  useEffect(() => {
    const t = setInterval(() => setTime(nowHHMM()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const un = listen<boolean>("island:hidden", (e) => setHidden(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  const report = (w: number, h: number) =>
    invoke("report_island_rect", { width: w, height: h }).catch(() => {});

  useEffect(() => { report(PILL.w, PILL.h); }, []);

  const expand = () => {
    window.clearTimeout(shrinkT.current);
    report(PANEL.w, PANEL.h); // النافذة أولًا ثم الأنيميشن
    setOpen(true);
  };
  const collapse = () => {
    setOpen(false);
    window.clearTimeout(shrinkT.current);
    shrinkT.current = window.setTimeout(() => report(PILL.w, PILL.h), ANIM_MS + 30);
  };

  const onEnter = () => {
    window.clearTimeout(collapseT.current);
    if (open) return;
    window.clearTimeout(hoverT.current);
    hoverT.current = window.setTimeout(expand, settings.hoverDelayMs ?? 250);
  };
  const onLeave = () => {
    window.clearTimeout(hoverT.current);
    if (!open) return;
    window.clearTimeout(collapseT.current);
    collapseT.current = window.setTimeout(collapse, settings.collapseDelayMs ?? 350);
  };

  const size = open ? PANEL : PILL;

  return (
    <div className="flex w-full justify-center">
      <div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={{
          width: size.w,
          height: size.h,
          transition: `width ${ANIM_MS}ms cubic-bezier(.2,.8,.2,1), height ${ANIM_MS}ms cubic-bezier(.2,.8,.2,1), border-radius ${ANIM_MS}ms cubic-bezier(.2,.8,.2,1)`,
          borderRadius: open ? 28 : 16,
        }}
        className={`relative overflow-hidden bg-black text-white transition-opacity duration-200 ${hidden ? "opacity-0" : "opacity-100"}`}
      >
        <div
          aria-label={i("الساعة", "Clock")}
          style={{ height: PILL.h }}
          className={`absolute inset-x-0 top-0 flex items-center justify-center text-[13px] font-medium tabular-nums transition-opacity duration-200 ${open ? "opacity-0" : "opacity-100"}`}
        >
          <span dir="ltr">{time}</span>
        </div>
        <div
          style={{ width: PANEL.w, height: PANEL.h }}
          className={`absolute left-1/2 top-0 flex -translate-x-1/2 flex-col p-4 transition-opacity duration-200 ${open ? "opacity-100 delay-100" : "pointer-events-none opacity-0"}`}
        >
          <div role="tablist" className="flex shrink-0 gap-2">
            {TABS().map((label, n) => (
              <button
                key={n}
                role="tab"
                aria-selected={tab === n}
                onClick={() => setTab(n)}
                className={`rounded-full px-4 py-1.5 text-[13px] ${tab === n ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 1 && open && (
            <div className="min-h-0 flex-1">
              <ClipboardTab />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
