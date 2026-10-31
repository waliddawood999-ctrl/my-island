import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Bell, Coffee, Settings as SettingsIcon, Timer as TimerIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { alertShake, dur, ease, paletteVariants, useMotionLevel, sectionVariants, spring, swapVariants, tap } from "../../motion";
import { i } from "../../i18n";
import { useSettings } from "../../useSettings";
import { useMedia } from "../../useMedia";
import { fmtBytes, useBattery, useDownloads } from "../../useDownloads";
import { fmtElapsed, useRecording } from "../../useRecording";
import { ClipboardTab } from "./ClipboardTab";
import { ToolsTab } from "./ToolsTab";
import { ShelfTab } from "./ShelfTab";
import { LauncherTab } from "./LauncherTab";
import { useShelf } from "../../useShelf";
import { useLauncher } from "../../useLauncher";
// محرّر Tiptap ثقيل: يُحمَّل عند أول فتح لتبويب الملاحظة فقط.
const NoteTab = lazy(() => import("./NoteTab").then((m) => ({ default: m.NoteTab })));
import { fmtCountdown, TIMER_NEAR_MS, useNoteAlert, useTimer } from "../../useNote";
import { MediaSection } from "./MediaSection";
import { Liquid } from "./Liquid";
import { Palette } from "./Palette";
import { TabBar } from "./TabBar";
import { BatteryChip, DownloadsSection } from "./DownloadsSection";
import { AttentionSection } from "./AttentionSection";
import { BatterySection, hasBatteryContent } from "./BatterySection";
import { useAttention } from "../../useAttention";

const PILL = { w: 200, h: 32 };
/** تنبيه تذكير/مؤقّت: حبة أعرض قليلًا تعرض النص حتى يُنقر عليها أو تنتهي المهلة. */
const ALERT = { w: 340, h: 36 };
/** اللوحة عرضية (أعرض من ارتفاعها): 720×320 ثابتة (قرار وليد: تقصير بعد لقطة فعلية)؛ أي محتوى أطول يمرّر داخليًا في منطقة المحتوى فقط. */
const PANEL = { w: 720, h: 320 };
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

/** التبويبات؛ الرفّ يظهر فقط إن كان moduleShelf مفعّلًا (غياب المفتاح = مفعّل) وعدّاده بجانب الاسم. */
const tabDefs = (shelfOn: boolean, shelfCount: number, launcherOn: boolean) => [
  { id: "home", label: i("الرئيسية", "Home") },
  { id: "clip", label: i("الحافظة", "Clipboard") },
  ...(shelfOn ? [{ id: "shelf", label: shelfCount > 0 ? `${i("الرفّ", "Shelf")} (${shelfCount})` : i("الرفّ", "Shelf") }] : []),
  ...(launcherOn ? [{ id: "launcher", label: i("اللانشر", "Launcher") }] : []),
  { id: "note", label: i("ملاحظة", "Note") },
  { id: "tools", label: i("الأدوات", "Tools") },
  { id: "chat", label: i("المحادثة", "Chat") },
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

/** الحبة: pill أسود 200×32 بساعة، تتمدد بالهوفر إلى لوحة 720×320 وتنكمش بعد مغادرة المؤشر. */
export function Pill() {
  const settings = useSettings();
  const motion_level = useMotionLevel();
  const fmt = settings.clockFormat ?? "auto";
  const [time, setTime] = useState(() => fmtTime(fmt));
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [tabId, setTabId] = useState("home");
  // سحب ملفات من المستكشف فوق النافذة (أحداث tauri://drag-*).
  const [dragging, setDragging] = useState(false);
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
  const shelfOn = settings.moduleShelf ?? true;
  const shelf = useShelf(shelfOn);
  const launcherOn = settings.moduleLauncher ?? true;
  const launcher = useLauncher(launcherOn);
  const showDl = !!settings.showDownloads;
  const dlInPill = !!settings.downloadsInPill;
  const showBat = !!settings.showBattery;
  const dl = useDownloads(showDl || dlInPill);
  const battery = useBattery(showBat);
  const btOn = settings.btBatteries ?? true;
  const attentionOn = settings.attentionTracking ?? true;
  const attention = useAttention(attentionOn);
  // downloadsInPill: أكبر تنزيل جارٍ (نسبة إن عُرفت وإلا الحجم) تتقدم على عنوان الميديا.
  const biggest = dlInPill ? [...dl.active].sort((a, b) => b.size - a.size)[0] : undefined;
  const dlText = biggest ? (biggest.percent != null ? `⬇ ${Math.round(biggest.percent)}%` : `⬇ ${fmtBytes(biggest.size)}`) : null;
  // التسجيل: نقطة حمراء + مؤقّت في الحبة المنكمشة؛ النقر عليها (منكمشة) يوقف التسجيل.
  const rec = useRecording();
  // ملاحظة/تذكيرات/مؤقّت: التنبيه (island:note) والمؤقّت القريب يظهران في الحبة المنكمشة.
  const { alert, dismiss } = useNoteAlert();
  const { timer, remaining } = useTimer();
  const timerNear = timer !== null && remaining !== null && remaining > 0 && remaining <= TIMER_NEAR_MS;
  const alertRef = useRef(alert);
  alertRef.current = alert;
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
    const rest = alertRef.current ? ALERT : PILL;
    report(rest.w, rest.h);
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

  // إفلات ملفات من المستكشف: الدخول يفتح اللوحة على تبويب الرفّ، الإفلات يضيف فورًا، المغادرة تنكمش.
  const dnd = useRef({ enter: () => {}, leave: () => {}, drop: (_p: string[]) => {} });
  dnd.current.enter = () => {
    if (!shelfOn || paletteRef.current) return;
    window.clearTimeout(collapseT.current);
    window.clearTimeout(hoverT.current);
    setTabId("shelf");
    setDragging(true);
    if (!open) expand();
  };
  dnd.current.leave = () => {
    setDragging(false);
    if (paletteRef.current || !open) return;
    window.clearTimeout(collapseT.current);
    collapseT.current = window.setTimeout(collapse, settings.collapseDelayMs ?? 350);
  };
  dnd.current.drop = (paths) => {
    setDragging(false);
    if (!shelfOn || paletteRef.current || paths.length === 0) return;
    invoke("shelf_add", { paths }).catch(() => {});
    window.clearTimeout(collapseT.current);
    collapseT.current = window.setTimeout(collapse, 2500); // يلغيه دخول المؤشر (onEnter)
  };
  useEffect(() => {
    const subs = [
      listen("tauri://drag-enter", () => dnd.current.enter()),
      listen("tauri://drag-leave", () => dnd.current.leave()),
      listen<{ paths: string[] }>("tauri://drag-drop", (e) => dnd.current.drop(e.payload?.paths ?? [])),
    ];
    return () => { subs.forEach((u) => u.then((f) => f())); };
  }, []);

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

  // وصول تنبيه أثناء الانكماش: تكبير النافذة قبل الحركة؛ زواله: تصغيرها بعد الحركة.
  useEffect(() => {
    if (paletteRef.current || open) return;
    if (alert) { cancelShrink(); report(ALERT.w, ALERT.h); }
    else scheduleShrink();
  }, [alert?.id, alert?.at]);

  const size = palette ? PALETTE : open ? panel : alert ? ALERT : PILL;
  // الشفافية من الإعدادات؛ autoHide يخفي الحبة في الراحة (النافذة تبقى تستقبل المرور فتظهر عند الهوفر).
  const rest = (settings.opacityRest ?? 100) / 100;
  const opened = (settings.opacityOpen ?? 100) / 100;
  const opacity = hidden ? 0 : palette ? 1 : open ? opened : settings.autoHide && !hover ? 0 : rest;

  const radius = palette ? 24 : open ? 28 : 16;
  const tabs = tabDefs(shelfOn, shelf.items.length, launcherOn);
  const tab = Math.max(0, tabs.findIndex((t) => t.id === tabId));
  const curTab = tabs[tab].id;
  const tabLabels = tabs.map((t) => t.label);
  /** ما يُعرض في الحبة المنكمشة: واحد فقط، يتبدّل بتمويه قصير. */
  const pillKey = rec.recording ? "rec" : alert && !open ? "alert" : timerNear ? "timer" : dlText ? "dl" : pillTitle ? "title" : "clock";

  return (
    <div className="flex w-full justify-center">
      <motion.div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={() => { if (alert) dismiss(); else if (rec.recording && !open && !palette) invoke("record_stop").catch(() => {}); }}
        onContextMenu={(e) => { e.preventDefault(); invoke("open_settings").catch(() => {}); }}
        initial={false}
        animate={{ opacity, width: size.w, height: size.h, borderRadius: radius }}
        transition={{ default: spring.island, opacity: { duration: dur.base, ease: ease.out } }}
        onAnimationComplete={flushShrink}
        style={{ boxShadow: open || palette ? "var(--island-ring-open)" : "var(--island-ring)" }}
        className="relative overflow-hidden bg-black text-white"
      >
        <Liquid
          enabled={moduleMedia && (settings.liquidSpectrum ?? false) && motion_level !== "off"}
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
          style={{ height: alert && !open ? ALERT.h : PILL.h }}
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
              {rec.recording ? (
                <span dir="ltr" className="flex items-center gap-2" aria-label={i("جارٍ التسجيل — انقر للإيقاف", "Recording — click to stop")}>
                  <span className="island-rec-dot h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="tabular-nums">{fmtElapsed(rec.elapsed)}</span>
                </span>
              ) : alert && !open ? (
                <span dir="auto" className="flex max-w-full items-center gap-2 px-3" role="alert">
                  <motion.span animate={alertShake.animate} transition={alertShake.transition}>
                    {alert.kind === "timer" ? <TimerIcon size={15} /> : alert.kind === "break" ? <Coffee size={15} /> : <Bell size={15} />}
                  </motion.span>
                  <span className="truncate">
                    {alert.text || (alert.kind === "timer" ? i("انتهى المؤقّت", "Timer finished") : i("تذكير", "Reminder"))}
                  </span>
                </span>
              ) : timerNear && remaining !== null ? (
                <span dir="ltr" className="flex items-center gap-1.5" aria-label={i("المؤقّت", "Timer")}>
                  <TimerIcon size={13} />
                  <span className="tabular-nums">{fmtCountdown(remaining)}</span>
                </span>
              ) : dlText ? (
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
            <TabBar labels={tabLabels} active={tab} onSelect={(n) => setTabId(tabs[n]?.id ?? "home")} />
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
          <AnimatePresence>
            {open && alert && (
              <motion.button
                key="alert-toast"
                variants={swapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                onClick={dismiss}
                role="alert"
                dir="auto"
                className="absolute bottom-3 left-1/2 z-20 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-[13px] backdrop-blur"
              >
                {alert.kind === "timer" ? <TimerIcon size={15} /> : alert.kind === "break" ? <Coffee size={15} /> : <Bell size={15} />}
                <span className="truncate">{alert.text || (alert.kind === "timer" ? i("انتهى المؤقّت", "Timer finished") : i("تذكير", "Reminder"))}</span>
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            {open && (
              <motion.div
                key={curTab}
                variants={swapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex min-h-0 flex-1 flex-col pt-3"
              >
                {curTab === "home" && (
                  <div className="flex min-h-0 flex-1 flex-row" style={{ gap: "var(--island-section-gap)" }}>
                    {moduleMedia && (
                      <motion.div custom={0} variants={sectionVariants} initial="initial" animate="animate" className="min-h-0 min-w-0 flex-1">
                        <MediaSection media={media} showLyrics={!!(settings.lyricsInHome || settings.lyricsInPlayer)} />
                      </motion.div>
                    )}
                    {(showDl || (showBat && hasBatteryContent(battery, btOn)) || (attentionOn && attention?.enabled)) && (
                      <motion.div custom={1} variants={sectionVariants} initial="initial" animate="animate" className="flex min-h-0 w-60 shrink-0 flex-col gap-3 overflow-y-auto border-s border-white/10 ps-3">
                        {showDl && (
                          <div className="min-h-[56px] flex-1">
                            <DownloadsSection snap={dl} battery={null} showDownloads />
                          </div>
                        )}
                        {showBat && <BatterySection b={battery} tip={settings.batteryTip ?? true} btOn={btOn} />}
                        {attentionOn && <AttentionSection snap={attention} />}
                      </motion.div>
                    )}
                  </div>
                )}
                {curTab === "note" && (
                  <div className="min-h-0 flex-1">
                    <Suspense fallback={null}>
                      <NoteTab timer={timer} />
                    </Suspense>
                  </div>
                )}
                {curTab === "tools" && (
                  <div className="min-h-0 flex-1">
                    <ToolsTab />
                  </div>
                )}
                {curTab === "clip" && (
                  <div className="min-h-0 flex-1">
                    <ClipboardTab />
                  </div>
                )}
                {curTab === "launcher" && (
                  <div className="min-h-0 flex-1">
                    <LauncherTab launcher={launcher} />
                  </div>
                )}
                {curTab === "shelf" && (
                  <div className="min-h-0 flex-1">
                    <ShelfTab items={shelf.items} dragging={dragging} reload={shelf.reload} />
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
