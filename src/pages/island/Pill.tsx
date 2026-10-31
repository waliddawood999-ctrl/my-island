import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Settings as SettingsIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { dur, ease, paletteVariants, sectionVariants, spring, swapVariants, tap } from "../../motion";
import { i } from "../../i18n";
import { useSettings } from "../../useSettings";
import { useMedia } from "../../useMedia";
import { fmtBytes, useBattery, useDownloads } from "../../useDownloads";
import { ClipboardTab } from "./ClipboardTab";
import { MediaSection } from "./MediaSection";
import { Liquid } from "./Liquid";
import { Palette } from "./Palette";
import { TabBar } from "./TabBar";
import { BatteryChip, DownloadsSection } from "./DownloadsSection";

const PILL = { w: 200, h: 32 };
/** اللوحة عرضية (أعرض من ارتفاعها): 720×480 ثابتة. */
const PANEL = { w: 720, h: 480 };
const panelSize = () => PANEL;
const PALETTE = { w: 640, h: 440 };
/** احتياط (ms): لو لم يصل رد اكتمال الحركة تُصغَّر النافذة بعد هذه المدة. */
const SHRINK_GUARD_MS = dur.windowShrinkGuard * 1000;

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
  // شريط الأوامر: طبقة داخل نافذة main (لا نافذة خامسة) — wasHidden لإعادة الإخفاء عند الإغلاق.
  const [palette, setPalette] = useState<{ wasHidden: boolean } | null>(null);
  const paletteRef = useRef<{ wasHidden: boolean } | null>(null);
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
  const shrinkPending = useRef(false);
  const [panel, setPanel] = useState(panelSize);

  // الساعة HH:MM: مؤقّت واحد يصحو عند بداية كل دقيقة (لا مؤقّت ثانية بثانية) ويتوقف مع إخفاء الصفحة.
  useEffect(() => {
    setTime(fmtTime(fmt));
    let t: number;
    const arm = () => {
      t = window.setTimeout(() => { setTime(fmtTime(fmt)); arm(); }, 60_000 - (Date.now() % 60_000) + 50);
    };
    arm();
    return () => window.clearTimeout(t);
  }, [fmt]);

  useEffect(() => {
    const un = listen<boolean>("island:hidden", (e) => setHidden(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  const report = (w: number, h: number) =>
    invoke("report_island_rect", { width: w, height: h }).catch(() => {});

  useEffect(() => { report(PILL.w, PILL.h); }, []);

  /** تصغير النافذة بعد انتهاء حركة الانكماش (رد onAnimationComplete) مع مؤقّت احتياطي واحد. */
  const flushShrink = () => {
    if (!shrinkPending.current) return;
    shrinkPending.current = false;
    window.clearTimeout(shrinkT.current);
    report(PILL.w, PILL.h);
  };
  const scheduleShrink = () => {
    shrinkPending.current = true;
    window.clearTimeout(shrinkT.current);
    shrinkT.current = window.setTimeout(flushShrink, SHRINK_GUARD_MS);
  };
  const cancelShrink = () => {
    shrinkPending.current = false;
    window.clearTimeout(shrinkT.current);
  };

  const openPalette = (wasHidden: boolean) => {
    window.clearTimeout(hoverT.current);
    window.clearTimeout(collapseT.current);
    cancelShrink();
    setOpen(false);
    report(PALETTE.w, PALETTE.h);
    paletteRef.current = { wasHidden };
    setPalette({ wasHidden });
  };
  /** restore=false: لا نردّ الفوكس للنافذة السابقة (إطلاق هدف جديد أو نقر المستخدم خارجًا). */
  const closePalette = useCallback((restore: boolean) => {
    const cur = paletteRef.current;
    if (!cur) return;
    paletteRef.current = null;
    setPalette(null);
    invoke("release_focus", { restore }).catch(() => {});
    scheduleShrink();
    if (cur.wasHidden) invoke("set_island_hidden", { hidden: true }).catch(() => {});
  }, []);

  // palette:open يبدّل: مفتوح ⇒ يغلق (يعيد الفوكس) · مغلق ⇒ يفتح.
  useEffect(() => {
    const un = listen<{ wasHidden: boolean }>("palette:open", (e) => {
      if (paletteRef.current) closePalette(true);
      else openPalette(!!e.payload?.wasHidden);
    });
    return () => { un.then((f) => f()); };
  }, [closePalette]);

  const expand = () => {
    cancelShrink();
    const p = panelSize();
    setPanel(p);
    report(p.w, p.h); // النافذة أولًا ثم الأنيميشن
    setOpen(true);
  };
  const collapse = () => {
    setOpen(false);
    scheduleShrink();
  };

  const onEnter = () => {
    setHover(true);
    if (paletteRef.current) return;
    window.clearTimeout(collapseT.current);
    if (open) return;
    window.clearTimeout(hoverT.current);
    hoverT.current = window.setTimeout(expand, settings.hoverDelayMs ?? 250);
  };
  const onLeave = () => {
    setHover(false);
    if (paletteRef.current) return;
    window.clearTimeout(hoverT.current);
    if (!open) return;
    window.clearTimeout(collapseT.current);
    collapseT.current = window.setTimeout(collapse, settings.collapseDelayMs ?? 350);
  };

  const size = palette ? PALETTE : open ? panel : PILL;
  // الشفافية من الإعدادات؛ autoHide يخفي الحبة في الراحة (النافذة تبقى تستقبل المرور فتظهر عند الهوفر).
  const rest = (settings.opacityRest ?? 100) / 100;
  const opened = (settings.opacityOpen ?? 100) / 100;
  const opacity = hidden ? 0 : palette ? 1 : open ? opened : settings.autoHide && !hover ? 0 : rest;

  const radius = palette ? 24 : open ? 28 : 16;
  const tabLabels = TABS();
  /** ما يُعرض في الحبة المنكمشة: واحد فقط، يتبدّل بتمويه قصير. */
  const pillKey = dlText ? "dl" : pillTitle ? "title" : "clock";

  return (
    <div className="flex w-full justify-center">
      <motion.div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onContextMenu={(e) => { e.preventDefault(); invoke("open_settings").catch(() => {}); }}
        initial={false}
        animate={{ opacity, width: size.w, height: size.h, borderRadius: radius }}
        transition={{ default: spring.island, opacity: { duration: dur.base, ease: ease.out } }}
        onAnimationComplete={flushShrink}
        style={{ boxShadow: open || palette ? "var(--island-ring-open)" : "var(--island-ring)" }}
        className="relative overflow-hidden bg-black text-white"
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
        <motion.div
          aria-label={i("الساعة", "Clock")}
          initial={false}
          animate={{ opacity: open || palette ? 0 : 1 }}
          transition={{ duration: dur.base, ease: ease.out }}
          style={{ height: PILL.h }}
          className="absolute inset-x-0 top-0 flex items-center justify-center text-[13px] font-medium tabular-nums"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pillKey}
              variants={swapVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex w-full items-center justify-center"
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
            </motion.div>
          </AnimatePresence>
        </motion.div>
        <AnimatePresence>
          {palette && (
            <motion.div
              key="palette"
              variants={paletteVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ width: PALETTE.w, height: PALETTE.h }}
              className="absolute left-1/2 top-0 -translate-x-1/2"
            >
              <Palette settings={settings} onClose={closePalette} />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{ duration: dur.base, ease: ease.out, delay: open ? 0.08 : 0 }}
          style={{ width: panel.w, height: panel.h, padding: "var(--island-pad)", pointerEvents: open ? "auto" : "none" }}
          className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col"
        >
          <div className="flex shrink-0 items-center gap-2">
            <TabBar labels={tabLabels} active={tab} onSelect={setTab} />
            <motion.button
              aria-label={i("الإعدادات", "Settings")}
              title={i("الإعدادات", "Settings")}
              onClick={() => invoke("open_settings").catch(() => {})}
              whileHover={tap.whileHover}
              whileTap={tap.whileTap}
              transition={tap.transition}
              className="i-btn ms-auto p-1.5"
            >
              <SettingsIcon size={16} />
            </motion.button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {open && (
              <motion.div
                key={tab}
                variants={swapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex min-h-0 flex-1 flex-col pt-3"
              >
                {tab === 0 && (
                  <div className="flex min-h-0 flex-1 flex-row" style={{ gap: "var(--island-section-gap)" }}>
                    {moduleMedia && (
                      <motion.div custom={0} variants={sectionVariants} initial="initial" animate="animate" className="min-h-0 flex-1">
                        <MediaSection media={media} showLyrics={!!(settings.lyricsInHome || settings.lyricsInPlayer)} />
                      </motion.div>
                    )}
                    {(showDl || (showBat && battery?.has_battery)) && (
                      <motion.div custom={1} variants={sectionVariants} initial="initial" animate="animate" className="w-60 shrink-0 border-s border-white/10 ps-3">
                        <DownloadsSection snap={dl} battery={showBat ? battery : null} showDownloads={showDl} />
                      </motion.div>
                    )}
                  </div>
                )}
                {tab === 1 && (
                  <div className="min-h-0 flex-1">
                    <ClipboardTab />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
}
