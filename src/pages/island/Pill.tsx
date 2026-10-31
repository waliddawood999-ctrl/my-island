import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Settings as SettingsIcon } from "lucide-react";
import { i } from "../../i18n";
import { useSettings } from "../../useSettings";
import { useMedia } from "../../useMedia";
import { fmtBytes, useBattery, useDownloads } from "../../useDownloads";
import { ClipboardTab } from "./ClipboardTab";
import { MediaSection } from "./MediaSection";
import { Liquid } from "./Liquid";
import { BatteryChip, DownloadsSection } from "./DownloadsSection";

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

/** عنوان متحرك داخل الحبة المنكمشة؛ يتحرك فقط إن زاد النص عن العرض. */
function PillTitle({ text }: { text: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const span = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(false);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const tw = span.current?.scrollWidth ?? 0;
    setW(tw);
    setScroll(tw > (wrap.current?.clientWidth ?? 0));
  }, [text]);
  return (
    <div ref={wrap} className="w-full overflow-hidden px-4 text-center">
      {scroll ? (
        <div className="island-marquee" style={{ ["--marquee-dur" as string]: `${Math.max(6, w / 35)}s` }}>
          <span dir="auto" className="pe-10">{text}</span>
          <span dir="auto" className="pe-10">{text}</span>
        </div>
      ) : (
        <span ref={span} dir="auto" className="whitespace-nowrap">{text}</span>
      )}
      {scroll && <span ref={span} dir="auto" className="invisible absolute whitespace-nowrap">{text}</span>}
    </div>
  );
}

/** الحبة: pill أسود 200×32 بساعة، تتمدد بالهوفر إلى لوحة 720×480 وتنكمش بعد مغادرة المؤشر. */
export function Pill() {
  const settings = useSettings();
  const fmt = settings.clockFormat ?? "auto";
  const [time, setTime] = useState(() => fmtTime(fmt));
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const moduleMedia = settings.moduleMedia ?? true;
  const media = useMedia(moduleMedia);
  // mediaPill: "off"/"clock" = تبقى الساعة؛ غير ذلك (الافتراضي) = العنوان المتحرك أثناء التشغيل فقط.
  const pillTitle =
    moduleMedia && !["off", "clock"].includes(settings.mediaPill ?? "") && media.info.session && media.info.playing && media.info.title
      ? [media.info.title, media.info.artist].filter(Boolean).join(" — ")
      : null;
  const showDl = !!settings.showDownloads;
  const dlInPill = !!settings.downloadsInPill;
  const showBat = !!settings.showBattery;
  const dl = useDownloads(showDl || dlInPill);
  const battery = useBattery(showBat);
  // downloadsInPill: أكبر تنزيل جارٍ (نسبة إن عُرفت وإلا الحجم) تتقدم على عنوان الميديا.
  const biggest = dlInPill ? [...dl.active].sort((a, b) => b.size - a.size)[0] : undefined;
  const dlText = biggest ? (biggest.percent != null ? `⬇ ${Math.round(biggest.percent)}%` : `⬇ ${fmtBytes(biggest.size)}`) : null;
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
        <Liquid
          enabled={moduleMedia && (settings.liquidSpectrum ?? false)}
          width={size.w}
          boxH={64}
          maxH={open ? 30 : 12}
          cover={media.cover}
          playing={media.info.session && media.info.playing}
          hasSession={media.info.session}
          visible={!hidden && opacity > 0}
        />
        <div
          aria-label={i("الساعة", "Clock")}
          style={{ height: PILL.h }}
          className={`absolute inset-x-0 top-0 flex items-center justify-center text-[13px] font-medium tabular-nums transition-opacity duration-200 ${open ? "opacity-0" : "opacity-100"}`}
        >
          {dlText ? (
            <span dir="ltr" aria-label={i("أكبر تنزيل جارٍ", "Largest active download")}>{dlText}</span>
          ) : pillTitle ? (
            <PillTitle text={pillTitle} />
          ) : (
            (settings.showClock ?? true) && <span dir="ltr">{time}</span>
          )}
          {showBat && !pillTitle && !dlText && battery?.has_battery && (
            <span className="ms-3 text-[11px] text-white/70"><BatteryChip b={battery} size={12} /></span>
          )}
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
          {tab === 0 && open && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
              {moduleMedia && (
                <div className="min-h-0 flex-1">
                  <MediaSection media={media} showLyrics={!!(settings.lyricsInHome || settings.lyricsInPlayer)} />
                </div>
              )}
              {(showDl || (showBat && battery?.has_battery)) && (
                <DownloadsSection snap={dl} battery={showBat ? battery : null} showDownloads={showDl} />
              )}
            </div>
          )}
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
