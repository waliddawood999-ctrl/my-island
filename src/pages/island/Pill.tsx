import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Settings as SettingsIcon } from "lucide-react";
import { i } from "../../i18n";
import { useSettings } from "../../useSettings";
import { ClipboardTab } from "./ClipboardTab";

const PILL = { w: 200, h: 32 };
const PANEL = { w: 720, h: 480 };
/** مدة انتقال CSS (ms) — تُستعمل أيضًا لتأخير تصغير النافذة بعد الانكماش. */
const ANIM_MS = 300;

/** clockFormat: auto = حسب نظام المستخدم، 24/12 صريحان. */
function fmtTime(fmt: string): string {
  const hour12 = fmt === "12" ? true : fmt === "24" ? false : undefined;
  return new Date().toLocaleTimeString(fmt === "auto" ? undefined : "en-US", {
    hour: "2-digit", minute: "2-digit", hour12,
  });
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
  const fmt = settings.clockFormat ?? "auto";
  const [time, setTime] = useState(() => fmtTime(fmt));
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const hoverT = useRef<number | undefined>(undefined);
  const collapseT = useRef<number | undefined>(undefined);
  const shrinkT = useRef<number | undefined>(undefined);

  useEffect(() => {
    setTime(fmtTime(fmt));
    const t = setInterval(() => setTime(fmtTime(fmt)), 1000);
    return () => clearInterval(t);
  }, [fmt]);

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
    setHover(true);
    window.clearTimeout(collapseT.current);
    if (open) return;
    window.clearTimeout(hoverT.current);
    hoverT.current = window.setTimeout(expand, settings.hoverDelayMs ?? 250);
  };
  const onLeave = () => {
    setHover(false);
    window.clearTimeout(hoverT.current);
    if (!open) return;
    window.clearTimeout(collapseT.current);
    collapseT.current = window.setTimeout(collapse, settings.collapseDelayMs ?? 350);
  };

  const size = open ? PANEL : PILL;
  // الشفافية من الإعدادات؛ autoHide يخفي الحبة في الراحة (النافذة تبقى تستقبل المرور فتظهر عند الهوفر).
  const rest = (settings.opacityRest ?? 100) / 100;
  const opened = (settings.opacityOpen ?? 100) / 100;
  const opacity = hidden ? 0 : open ? opened : settings.autoHide && !hover ? 0 : rest;

  return (
    <div className="flex w-full justify-center">
      <div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onContextMenu={(e) => { e.preventDefault(); invoke("open_settings").catch(() => {}); }}
        style={{
          opacity,
          width: size.w,
          height: size.h,
          transition: `width ${ANIM_MS}ms cubic-bezier(.2,.8,.2,1), height ${ANIM_MS}ms cubic-bezier(.2,.8,.2,1), border-radius ${ANIM_MS}ms cubic-bezier(.2,.8,.2,1)`,
          borderRadius: open ? 28 : 16,
        }}
        className="relative overflow-hidden bg-black text-white transition-opacity duration-200"
      >
        <div
          aria-label={i("الساعة", "Clock")}
          style={{ height: PILL.h }}
          className={`absolute inset-x-0 top-0 flex items-center justify-center text-[13px] font-medium tabular-nums transition-opacity duration-200 ${open ? "opacity-0" : "opacity-100"}`}
        >
          {(settings.showClock ?? true) && <span dir="ltr">{time}</span>}
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
            <button
              aria-label={i("الإعدادات", "Settings")}
              title={i("الإعدادات", "Settings")}
              onClick={() => invoke("open_settings").catch(() => {})}
              className="ms-auto rounded-full p-1.5 text-white/60 hover:text-white"
            >
              <SettingsIcon size={16} />
            </button>
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
