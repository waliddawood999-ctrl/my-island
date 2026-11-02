import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LottieIcon, LottieShownProvider } from "../../lottie";
import { Coffee, Settings as SettingsIcon, Timer as TimerIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { alertShake, dur, ease, islandSpring, paletteVariants, useMotionLevel, sectionVariants, spring, swapVariants, tap } from "../../motion";
import { i } from "../../i18n";
import { clampTint, useResolvedTheme, useSettings } from "../../useSettings";
import { PANEL as PANEL_TOKEN, PANEL_PALETTE, PILL as PILL_TOKEN } from "../../tokens";
import { useMedia } from "../../useMedia";
import { useBattery } from "../../useBattery";
import { activeKinds, clampLeadMin, fmtStopwatch, nextKind, shownKind, type ActivityKind } from "../../liveActivity";
import { useStopwatchNow } from "../../useStopwatch";
import { useNetSpeed } from "../../useNetSpeed";
import { useBatteryHistory } from "../../useBatteryHistory";
import { ActivityStack, CapsuleSplit, NetValue, updateLabel, type LiveData } from "./activity";
import { useUpdater } from "../../useUpdater";
import { fmtElapsed, useRecording } from "../../useRecording";
import { ClipboardTab } from "./ClipboardTab";
import { ToolsTab } from "./ToolsTab";
import { ShelfTab } from "./ShelfTab";
import { LauncherTab } from "./LauncherTab";
import { useShelf } from "../../useShelf";
import { useLauncher } from "../../useLauncher";
// محرّر Tiptap ثقيل: يُحمَّل عند أول فتح لتبويب الملاحظة فقط (أو عند المرور على تبويبها). كل محاولة إعادة تنشئ lazy جديدًا
// (lazy المرفوض يبقى مرفوضًا للأبد)، وفشل التحميل يُحجَز في TabBoundary فلا يهدم الجزيرة.
const importNote = () => import("./NoteTab").then((m) => ({ default: m.NoteTab }));
const makeNoteTab = () => lazy(importNote);
import { normSound, normVolume, playSound } from "../../sounds";
import { IslandMachine, normCardOrder, realSched } from "../../islandMachine";
import { crossfade, normSpeed, resolveReduce } from "../../islandMotion";
import { tintForOpacity } from "../../appearance";
import { PeekView } from "./PeekView";
import { PillMedia, PlayerPanel, useAccent } from "./Player";
import { scrollsFurther } from "./wheel";
import { Bell as BellIcon, Calendar as CalendarIcon, ClipboardList, Grid2x2, Home as HomeIcon, Layers as LayersIcon, Notebook, Wrench, Cpu as CpuIcon, MessageCircle, Rocket, Users } from "lucide-react";
import { fmtCountdown, TIMER_NEAR_MS, useNoteAlert, useTimer } from "../../useNote";
import { MediaSection } from "./MediaSection";
import { TodaySection } from "./TodaySection";
import { HomeTiles } from "./HomeTiles";
import { Liquid } from "./Liquid";
import { Eyes } from "./Eyes";
import { useBackdrop } from "./useBackdrop";
import { TabBoundary } from "./TabBoundary";
import { rowReversed } from "../../eyes";
import { Palette } from "./Palette";
import { TabBar } from "./TabBar";
import { AttentionSection } from "./AttentionSection";
import { BatteryChip, BatterySection, hasBatteryContent } from "./BatterySection";
import { useAttention } from "../../useAttention";
import { SystemSection } from "./SystemSection";
import { MeetingsTab } from "./MeetingsTab";
import { useMeetings, useUpcomingMeeting } from "../../useMeetings";
import { usePrivacy } from "../../useSystem";

/** المقاس الافتراضي للحبة المنكمشة (الفعلي من pillWidth/pillHeight). */
const PILL_DEFAULT = { w: PILL_TOKEN.w, h: PILL_TOKEN.h };
const clampN = (v: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, typeof v === "number" && Number.isFinite(v) ? v : d));
/** اللوحة عرضية (أعرض من ارتفاعها): 720×320 ثابتة (قرار وليد: تقصير بعد لقطة فعلية)؛ أي محتوى أطول يمرّر داخليًا في منطقة المحتوى فقط. */
const PANEL = { w: PANEL_TOKEN.w, h: PANEL_TOKEN.h };
const panelSize = () => PANEL;
const PALETTE = { w: PANEL_PALETTE.w, h: PANEL_PALETTE.h };
/** احتياط (ms): لو لم يصل رد اكتمال الحركة تُصغَّر النافذة بعد هذه المدة. */
const SHRINK_GUARD_MS = dur.windowShrinkGuard * 1000;

/** clockFormat: auto = حسب نظام المستخدم، 24/12 صريحان. */
function fmtTime(fmt: string): string {
  const hour12 = fmt === "12" ? true : fmt === "24" ? false : undefined;
  return new Date().toLocaleTimeString(fmt === "auto" ? undefined : "en-US", {
    hour: "2-digit", minute: "2-digit", hour12,
  });
}

/** أيقونة كل تبويب (نمط icons في panelTabsStyle). */
const TAB_ICONS: Record<string, React.ReactNode> = {
  home: <HomeIcon size={15} />, clip: <ClipboardList size={15} />, shelf: <LayersIcon size={15} />, launcher: <Grid2x2 size={15} />, note: <Notebook size={15} />,
  tools: <Wrench size={15} />, meetings: <Users size={15} />, system: <CpuIcon size={15} />, chat: <MessageCircle size={15} />,
};
void BellIcon; void CalendarIcon; void Rocket;

/** تبويب المحادثة مخفي حتى يكتمل محتواه (S4)؛ اقلب القيمة لإعادته (لا يوجد ما يحفظ/يعيد تبويبًا نشطًا غيره، فالمعرّف المجهول يرجع للرئيسية). */
const CHAT_TAB_ENABLED = false;

/** التبويبات؛ الرفّ يظهر فقط إن كان moduleShelf مفعّلًا (غياب المفتاح = مفعّل) وعدّاده بجانب الاسم. */
const tabDefs = (shelfOn: boolean, shelfCount: number, launcherOn: boolean, meetingsOn: boolean) => [
  { id: "home", label: i("الرئيسية", "Home") },
  { id: "clip", label: i("الحافظة", "Clipboard") },
  ...(shelfOn ? [{ id: "shelf", label: shelfCount > 0 ? `${i("الرفّ", "Shelf")} (${shelfCount})` : i("الرفّ", "Shelf") }] : []),
  ...(launcherOn ? [{ id: "launcher", label: i("اللانشر", "Launcher") }] : []),
  { id: "note", label: i("ملاحظة", "Note") },
  { id: "tools", label: i("الأدوات", "Tools") },
  ...(meetingsOn ? [{ id: "meetings", label: i("الاجتماعات", "Meetings") }] : []),
  { id: "system", label: i("النظام", "System") },
  ...(CHAT_TAB_ENABLED ? [{ id: "chat", label: i("المحادثة", "Chat") }] : []),
];

/**
 * عنوان متحرك داخل الحبة المنكمشة. حشوة داخلية ثابتة = نصف الارتفاع + هامش (تتجاوز انحناء الكبسولة)، والقصّ (overflow)
 * على الصندوق الداخلي فقط؛ فلا يلمس النص حدود الحبة أبدًا في أي مقاس. يتحرك (marquee) فقط إن زاد النص عن العرض،
 * مع تلاشٍ ناعم على الحافتين.
 */
function PillTitle({ text, inset }: { text: string; inset: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const span = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(false);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const tw = span.current?.scrollWidth ?? 0;
    setW(tw);
    setScroll(tw > (wrap.current?.clientWidth ?? 0));
  }, [text, inset]);
  const fade = "linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%)";
  return (
    <div className="w-full" style={{ paddingInline: inset }}>
      <div
        ref={wrap}
        data-pill-title
        className="overflow-hidden text-center"
        style={scroll ? { WebkitMaskImage: fade, maskImage: fade } : undefined}
      >
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
    </div>
  );
}

/** الحبة: كبسولة (الافتراضي 220×34، قابلة للضبط) بساعة، تتمدد بالهوفر إلى لوحة 720×320 وتنكمش بعد مغادرة المؤشر. */
export function Pill() {
  const settings = useSettings();
  const motion_level = useMotionLevel();
  const { theme, glassOk } = useResolvedTheme(settings);
  const fmt = settings.clockFormat ?? "auto";
  // مقاس الحبة المنكمشة من الإعدادات؛ k = الارتفاع/32 يقيس الخط والعيون والأيقونات معًا (بلا تشوّه).
  const pill = { w: clampN(settings.pillWidth, PILL_TOKEN.minW, PILL_TOKEN.maxW, PILL_DEFAULT.w), h: clampN(settings.pillHeight, PILL_TOKEN.minH, PILL_TOKEN.maxH, PILL_DEFAULT.h) };
  // نصف قطر الحبة: pillRadius=0 ⇒ كبسولة كاملة (نصف الارتفاع)، وإلا مقيّد بنصف الارتفاع.
  const pillR = settings.pillRadius && settings.pillRadius > 0 ? Math.min(settings.pillRadius, pill.h / 2) : pill.h / 2;
  const k = pill.h / 32;
  const ic = (n: number) => Math.round(n * k);
  const [time, setTime] = useState(() => fmtTime(fmt));
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);
  // آلة الحالات (pill/peek/panel): المؤقتات والعجلة والخنق في islandMachine.ts؛ هنا فقط ربط بالواجهة.
  const [, bump] = useState(0);
  const machine = useRef<IslandMachine | null>(null);
  if (!machine.current) machine.current = new IslandMachine(realSched, {}, () => bump((n) => n + 1));
  const M = machine.current;
  const mode = M.mode;
  const open = mode === "panel";
  const peek = mode === "peek";
  const [tabId, setTabId] = useState("home");
  const [NoteTab, setNoteTab] = useState(makeNoteTab);
  const [retryN, setRetryN] = useState(0);
  // آخر تبويب بدأ دخوله فعلًا + حقبة AnimatePresence: حارس يكسر الاعتماد على اكتمال حركة الخروج (انظر أسفل).
  const shownTab = useRef("home");
  const [presenceEpoch, setPresenceEpoch] = useState(0);
  // سحب ملفات من المستكشف فوق النافذة (أحداث tauri://drag-*).
  const [dragging, setDragging] = useState(false);
  // شريط الأوامر: طبقة داخل نافذة main (لا نافذة خامسة) — wasHidden لإعادة الإخفاء عند الإغلاق.
  const [palette, setPalette] = useState<{ wasHidden: boolean } | null>(null);
  const paletteRef = useRef<{ wasHidden: boolean } | null>(null);
  const moduleMedia = settings.moduleMedia ?? true;
  const media = useMedia(moduleMedia);
  const glassStyle = settings.glassStyle === "clear" ? "clear" as const : "frosted" as const;
  const trackKey = `${media.info.source}|${media.info.title}|${media.info.artist}|${media.info.album}`;
  const accent = useAccent(media.cover, trackKey, settings);
  const reduceUI = motion_level !== "full" || resolveReduce(settings.reduceMotion, false);
  // mediaPill: "off"/"clock" = تبقى الساعة؛ غير ذلك (الافتراضي) = العنوان المتحرك أثناء التشغيل فقط.
  const pillTitle =
    moduleMedia && !["off", "clock"].includes(settings.mediaPill ?? "") && media.info.session && media.info.playing && media.info.title
      ? [media.info.title, media.info.artist].filter(Boolean).join(" — ")
      : null;
  const shelfOn = settings.moduleShelf ?? true;
  const shelf = useShelf(shelfOn);
  const launcherOn = settings.moduleLauncher ?? true;
  const launcher = useLauncher(launcherOn);
  const showBat = !!settings.showBattery;
  const privacy = usePrivacy(!!settings.privacyIndicator);
  const meetingsOn = !!settings.showMeetings;
  const meetings = useMeetings(meetingsOn);
  const upMeeting = useUpcomingMeeting(meetingsOn, meetings.snap.items, clampLeadMin(settings.meetingLeadMin));
  const battery = useBattery(showBat);
  const btOn = settings.btBatteries ?? true;
  const attentionOn = settings.attentionTracking ?? true;
  const attention = useAttention(attentionOn);
  // سرعتا الشبكة (اختياري) · وضع تبويب المتصفح (اختياري) · سجلّ البطارية للمنحنى المصغّر · ساعة الإيقاف
  const netOn = !!settings.showNetSpeed;
  const net = useNetSpeed(netOn && !hidden);
  const batHist = useBatteryHistory(battery);
  const { sw, ms: swMs } = useStopwatchNow(false);
  const { state: upd, install: installUpdate } = useUpdater(settings.updateAutoCheck ?? true);
  const updOn = upd.phase !== "idle";
  // تثبيت يدوي منفصل لكل سطح (الكبسولة/اللوحة): تبديل أحدهما لا يغيّر الآخر؛ ويسقط تلقائيًا حين ينتهي النشاط المثبّت.
  const [pinCap, setPinCap] = useState<ActivityKind | null>(null);
  const [pinPanel, setPinPanel] = useState<ActivityKind | null>(null);
  // أثناء التنزيل/التثبيت/الفشل يُثبَّت نشاط التحديث على السطحين كي يبقى التقدّم ظاهرًا مهما كان غيره قائمًا.
  useEffect(() => {
    if (upd.phase === "downloading" || upd.phase === "installing" || upd.phase === "error") { setPinCap("update"); setPinPanel("update"); }
  }, [upd.phase]);
  const lastPanAt = useRef(0);
  // التسجيل: نقطة حمراء + مؤقّت في الحبة المنكمشة؛ النقر عليها (منكمشة) يوقف التسجيل.
  const rec = useRecording();
  // ملاحظة/تذكيرات/مؤقّت: التنبيه (island:note) والمؤقّت القريب يظهران في الحبة المنكمشة.
  const { alert, dismiss } = useNoteAlert();
  // صوت التنبيه المختار (WebAudio محلي): مرة لكل تنبيه جديد.
  useEffect(() => { if (alert) playSound(normSound(settings.soundChoice), normVolume(settings.soundVolume)); }, [alert?.id, alert?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const { timer, remaining } = useTimer();
  const timerNear = timer !== null && remaining !== null && remaining > 0 && remaining <= TIMER_NEAR_MS;
  const alertRef = useRef(alert);
  alertRef.current = alert;
  // النشاط الحي: أولوية موحّدة للكبسولة واللوحة (liveActivity.ts). الكبسولة: المؤقّت حين يقترب (≤60s) وساعة الإيقاف أثناء جريانها
  // والبطارية حين تنخفض فقط (≤20% على البطارية) والشبكة محيطيّة؛ اللوحة: كل نشاط قائم (الشحن أو الانخفاض للبطارية).
  const lowBat = showBat && !!battery?.has_battery && battery.percent != null && battery.percent <= 20 && !battery.ac;
  const chargingBat = showBat && !!battery?.has_battery && battery.percent != null && (battery.charging || lowBat);
  const capKinds = activeKinds({
    rec: rec.recording, timer: timerNear, stopwatch: sw.running, media: !!pillTitle, meeting: !!upMeeting, battery: lowBat, net: netOn && net !== null, update: updOn,
  });
  const shownCap = shownKind(capKinds, pinCap);
  const panelKinds = activeKinds({
    rec: rec.recording, timer: timer !== null && remaining !== null && remaining > 0, stopwatch: sw.running || sw.acc > 0,
    media: moduleMedia && media.info.session, meeting: !!upMeeting, battery: chargingBat, update: updOn,
  });
  const shownPanel = shownKind(panelKinds, pinPanel);
  const liveData: LiveData = {
    rec: { recording: rec.recording, elapsed: rec.elapsed }, timer, remaining, media, player: { s: settings, accent, reduce: reduceUI, visible: mode === "panel" },
    battery, batteryHist: batHist, meeting: upMeeting, update: upd, onInstallUpdate: installUpdate,
  };
  const cycleCap = () => setPinCap(nextKind(capKinds, shownCap));
  // استقرار الحبة: false من لحظة تغيّر الحجم المستهدف حتى انتهاء الحركة (وإعادة قياس النافذة)؛ يتحكّم بطلب الزجاج الحقيقي فقط.
  // مشتق في العرض نفسه: «مستقر» = اكتملت الحركة لمفتاح الحجم الحالي (فلا تمرّ لحظة يُطلب فيها الزجاج بحجم جديد قبل اكتمالها).
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const initKey = useRef<string | null>(null);
  const sizeKeyRef = useRef("");
  const settleNow = () => setDoneKey(sizeKeyRef.current);
  const settleT = useRef<number | undefined>(undefined);
  const hoverT = useRef<number | undefined>(undefined);
  const collapseT = useRef<number | undefined>(undefined);
  const shrinkT = useRef<number | undefined>(undefined);
  const shrinkPending = useRef(false);
  const panel = { w: clampN(settings.panelWidth, 420, 720, 520), h: clampN(settings.panelHeight, 220, 420, 290) };
  const peekSz = { w: clampN(settings.peekWidth, 240, 560, 400), h: clampN(settings.peekHeight, 72, 200, 120) };
  const peekR = clampN(settings.peekRadius, 12, 60, 30), panelR = clampN(settings.panelRadius, 16, 60, 34);
  const speed = normSpeed(settings.motionSpeed);
  const hoverZoneKey = settings.hoverZone ?? "island";

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

  // آخر مقاس أُبلغت به النافذة (لتمييز النمو الذي يسبق الحركة عن الانكماش الذي يليها).
  const reported = useRef({ w: 0, h: 0 });
  const report = (w: number, h: number, r?: number) => {
    reported.current = { w, h };
    return invoke("report_island_rect", { width: w, height: h, radius: r ?? h / 2 }).catch(() => {});
  };
  // مقاس النافذة الاستراحي الحالي (يُحدَّث في العرض): الحبة · مدمجة منقسمة · تنبيه · أو ارتفاع شريط التبويبات عند الإرساء.
  const restWinRef = useRef({ w: 0, h: 0 });

  /** تصغير النافذة بعد انتهاء حركة الانكماش (رد onAnimationComplete) مع مؤقّت احتياطي واحد. */
  const flushShrink = (): boolean => {
    if (!shrinkPending.current) return false;
    shrinkPending.current = false;
    window.clearTimeout(shrinkT.current);
    const rest = restWinRef.current;
    // الاستقرار (للزجاج الحقيقي) بعد أن تُضبط المنطقة فعلًا: وإلا يُطبَّق الأكريليك على شكل قديم.
    report(rest.w, rest.h, (rest as { r?: number }).r).finally(settleNow);
    return true;
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
    M.collapse();
    report(PALETTE.w, PALETTE.h, 24);
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

  /** النقر: لوحة كاملة (المنطقة أولًا ثم الحركة تتم في layout effect أدناه). */
  const expand = () => { cancelShrink(); M.click(); };
  const collapse = () => { M.collapse(); };

  // إفلات ملفات من المستكشف: الدخول يفتح اللوحة على تبويب الرفّ، الإفلات يضيف فورًا، المغادرة تنكمش.
  const dnd = useRef({ enter: () => {}, leave: () => {}, drop: (_p: string[]) => {} });
  dnd.current.enter = () => {
    if (!shelfOn || paletteRef.current) return;
    window.clearTimeout(collapseT.current);
    setTabId("shelf");
    setDragging(true);
    if (!open) expand();
  };
  dnd.current.leave = () => {
    setDragging(false);
    if (paletteRef.current || !open) return;
    M.leave();
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
    M.enter(); // لمحة بعد hoverDelayMs؛ الأحداث تصل فقط من شكل الجزيرة نفسه (منطقة النافذة)
  };
  const onLeave = () => {
    setHover(false);
    if (paletteRef.current) return;
    M.leave(); // إغلاق بعد 300ms (لمحة) / 500ms (لوحة)؛ العودة تلغيه
  };

  // الحالة الاستراحية: تنبيه/نشاط مدمج/ارتفاع الشريط عند الإرساء.
  const alertShown = !!alert && !open && shownCap !== "rec";
  // شكل الحبة المنكمشة ثابت دائمًا: التنبيه/النشاط/المؤقّت/البطارية تُرسم داخلها ولا تغيّر مقاسها أبدًا (الإعدادات وحدها تغيّره).
  const restContent = pill;
  const restWin = restContent;
  const restBody = restContent;
  const size = palette ? PALETTE : open ? panel : peek ? peekSz : restBody;
  const targetR = palette ? 24 : open ? panelR : peek ? Math.min(peekR, size.h / 2) : pillR;
  restWinRef.current = { ...(size), r: targetR } as { w: number; h: number; r: number };
  // تغيّر الشكل الهدف (حبة/لمحة/لوحة أو إعدادات المقاس): النمو ⇒ ضبط منطقة النافذة قبل الحركة (layout effect)؛ الانكماش ⇒ بعد انتهائها.
  // النافذة الأصلية ثابتة دائمًا (800×500)؛ ما يتغيّر هو المنطقة (اختبار الإصابة + الأكريليك) فقط.
  useLayoutEffect(() => {
    if (paletteRef.current || !settings.loaded) return; // لا مقاس قبل وصول الإعدادات: الحبة لا تقفز من الافتراضي إلى مقاس المستخدم
    const grow = size.w > reported.current.w || size.h > reported.current.h;
    if (grow) { cancelShrink(); report(size.w, size.h, targetR); }
    else scheduleShrink();
  }, [size.w, size.h, targetR, settings.loaded, hoverZoneKey]);
  // الشفافية من الإعدادات؛ autoHide يخفي الحبة في الراحة (النافذة تبقى تستقبل المرور فتظهر عند الهوفر).
  const rest = (settings.opacityRest ?? 100) / 100;
  const opened = (settings.opacityOpen ?? 100) / 100;
  const opacity = hidden ? 0 : palette ? 1 : open ? opened : settings.autoHide && !hover ? 0 : rest;

  // كبسولة كاملة الاستدارة؛ مرسيّة في شريط المتصفح: زوايا علوية مدوّرة وقاع مسطّح (هيئة تبويب).
  const rTop = targetR;
  const rBot = targetR;
  const radius = rTop;
  // مفتاح الحجم المستهدف؛ أول عرض = مستقر. مؤقّت احتياطي أحادي إن لم يصل رد الاكتمال (كحارس التصغير).
  const sizeKey = `${size.w}x${size.h}`;
  sizeKeyRef.current = sizeKey;
  if (initKey.current === null) initKey.current = sizeKey;
  const settled = (doneKey ?? initKey.current) === sizeKey;
  useEffect(() => {
    if (settled) return;
    window.clearTimeout(settleT.current);
    settleT.current = window.setTimeout(settleNow, SHRINK_GUARD_MS + 700);
    return () => window.clearTimeout(settleT.current);
  }, [sizeKey, settled]);
  useBackdrop({
    // أكريليك ويندوز الأصلي لكلا الأسلوبين (frosted/clear) حين تكون المادة زجاجية ومسموحة (ليس Eco/تقليل الشفافية)؛ docs/GLASS.md.
    glass: (settings.themeMaterial ?? "glass") === "glass" && glassOk,
    light: theme === "light",
    ready: settled && !hidden && opacity > 0,
    radius,
    // الكثافة (backgroundOpacity) تضرب ألفا الصبغة؛ الحدّ الأدنى من خريطة الأسلوب.
    tint: tintForOpacity(glassStyle, theme === "light", clampTint(settings.glassTint), clampN(settings.backgroundOpacity, 0.3, 1, 1)),
    style: glassStyle,
  });
  M.setCfg({ hoverDelayMs: clampN(settings.hoverDelayMs, 0, 800, 250), wheelCycle: settings.peekWheelCycle ?? true, panelPaging: settings.panelWheelPaging ?? true, cards: normCardOrder(settings.peekCardOrder), slowMo: Number((globalThis as { __slowmo?: number }).__slowmo) || 1 });
  const upcomingForPeek = upMeeting ? { title: upMeeting.item.title, start: upMeeting.item.start } : null;
  // Esc: لوحة ⇒ لمحة (إغلاق بنابض close بلا ارتداد).
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") M.back(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const cf = crossfade(speed, reduceUI);
  // نابض الحجم: فتح لمحة (d,b) · فتح لوحة (d×1.1,b) · أي إغلاق (d×0.9، بلا ارتداد). التقليل ⇒ قفز فوري + تلاشٍ 150ms.
  const rank = { pill: 0, peek: 1, panel: 2 } as const;
  const prevMode = useRef<"pill" | "peek" | "panel">("pill");
  const kind = palette ? "open" : rank[mode] > rank[prevMode.current] ? (mode === "panel" ? "panel" : "open") : rank[mode] < rank[prevMode.current] ? "close" : "open";
  useEffect(() => { prevMode.current = mode; }, [mode]);
  const tabs = tabDefs(shelfOn, shelf.items.length, launcherOn, meetingsOn);
  const tab = Math.max(0, tabs.findIndex((t) => t.id === tabId));
  const curTab = tabs[tab].id;
  M.setPages(tabs.length); M.page = tab; // الصفحة = التبويب الحالي (العجلة في اللوحة)
  // حارس التبديل: AnimatePresence(mode="wait") لا يركّب التبويب الجديد إلا بعد اكتمال حركة خروج القديم؛ إن لم تكتمل (إطارات متوقفة/نافذة
  // مخنوقة) بقي العرض القديم رغم تحديد التبويب الجديد. بعد tabSwitchGuard نعيد تركيب AnimatePresence فيُسقَط الخارج ويُركَّب الجديد.
  // مؤقّت واحد لكل تبديل فقط (لا شيء في الخمول).
  useEffect(() => {
    if (!open || shownTab.current === curTab) return;
    const t = window.setTimeout(() => {
      if (shownTab.current !== curTab) setPresenceEpoch((e) => e + 1);
    }, dur.tabSwitchGuard * 1000);
    return () => window.clearTimeout(t);
  }, [curTab, open]);
  const tabLabels = tabs.map((t) => t.label);
  /** ما يُعرض في الحبة المنكمشة: واحد فقط، يتبدّل بتمويه قصير. */
  const pillKey = alertShown ? "alert" : shownCap ?? "clock";
  const dots = capKinds.length > 1 ? (
    <button
      aria-label={i("تبديل النشاط", "Switch activity")}
      onClick={(e) => { e.stopPropagation(); cycleCap(); }}
      className="flex items-center gap-[3px]"
      data-testid="capsule-switch"
    >
      {capKinds.map((c) => <span key={c} className="rounded-full" style={{ width: 4 * k, height: 4 * k, background: `var(--act-${c === "stopwatch" ? "timer" : c})`, opacity: c === shownCap ? 1 : 0.35 }} />)}
    </button>
  ) : undefined;

  return (
    <LottieShownProvider shown={!hidden && opacity > 0}>
    <div className={`flex w-full ${settings.pillPosition === "left" ? "justify-start" : settings.pillPosition === "right" ? "justify-end" : "justify-center"}`}>
      <motion.div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={() => {
          if (performance.now() - lastPanAt.current < 300) return; // سحب التبديل بين النشاطين لا يُحتسب نقرة
          if (alert) dismiss();
          else if (rec.recording && mode === "pill" && !palette) invoke("record_stop").catch(() => {});
          else if (!open && !palette) expand(); // النقر على الحبة أو اللمحة يفتح اللوحة
        }}
        onContextMenu={(e) => { e.preventDefault(); invoke("open_settings").catch(() => {}); }}
        initial={false}
        animate={{
          opacity, width: size.w, height: size.h, y: 0,
          borderTopLeftRadius: rTop, borderTopRightRadius: rTop, borderBottomLeftRadius: rBot, borderBottomRightRadius: rBot,
        }}
        transition={{ default: kind === "close" ? islandSpring.close : kind === "panel" ? islandSpring.panel : islandSpring.open, opacity: { duration: reduceUI ? 0.15 : dur.base, ease: ease.out } }}
        onAnimationComplete={() => { if (!flushShrink()) settleNow(); }}
        data-open={open || palette ? "true" : "false"}
        data-mode={palette ? "palette" : mode}
        data-spring={JSON.stringify(kind === "close" ? islandSpring.close : kind === "panel" ? islandSpring.panel : islandSpring.open)}
        onWheel={(e) => {
          if (palette) return;
          const handled = M.wheel(e.deltaY, { scrollsFurther: scrollsFurther(e.target, e.deltaY, e.currentTarget) });
          if (handled && M.mode === "panel" && M.page !== tab) setTabId(tabs[M.page]?.id ?? "home");
        }}
        className="island-body relative overflow-hidden"
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
        {settings.privacyIndicator && (privacy.mic || privacy.cam) && (
          <div
            dir="ltr"
            role="status"
            aria-label={[privacy.cam && i("الكاميرا قيد الاستخدام", "Camera in use"), privacy.mic && i("الميكروفون قيد الاستخدام", "Microphone in use")].filter(Boolean).join(" · ")}
            title={[privacy.cam && i("الكاميرا قيد الاستخدام", "Camera in use"), privacy.mic && i("الميكروفون قيد الاستخدام", "Microphone in use")].filter(Boolean).join(" · ")}
            className="pointer-events-none absolute left-3 top-3 z-30 flex gap-1"
          >
            {privacy.cam && <span className="h-2 w-2 rounded-full bg-[var(--c-success)] shadow-[0_0_6px_var(--c-success)]" />}
            {privacy.mic && <span className="h-2 w-2 rounded-full bg-[var(--c-warning)] shadow-[0_0_6px_var(--c-warning)]" />}
          </div>
        )}
        {media.cover && (settings.artworkBackdrop ?? true) && (settings.playerLayout ?? "compact") !== "minimal" && (
          <>
            <div aria-hidden data-testid="artwork-backdrop" style={{
              position: "absolute", inset: -40, backgroundImage: `url(${media.cover})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(30px) saturate(1.5)", pointerEvents: "none",
              opacity: (peek && M.currentCard === "player") || (open && curTab === "home") ? ((settings.themeMaterial ?? "glass") === "solid" ? 0.45 : 0.35) : 0,
              transition: `opacity ${reduceUI ? 150 : 360}ms ease`,
            }} />
            <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.35))", opacity: (peek && M.currentCard === "player") || (open && curTab === "home") ? 1 : 0, transition: `opacity ${reduceUI ? 150 : 360}ms ease` }} />
          </>
        )}
        <AnimatePresence>
          {peek && !palette && (
            <motion.div
              key="peek" variants={cf} initial="hidden" animate="shown" exit="hidden" data-testid="peek-layer"
              style={{ width: peekSz.w, height: peekSz.h }}
              className="absolute left-1/2 top-0 -translate-x-1/2"
            >
              <PeekView
                cards={M.cfg.cards} index={M.card} dir={M.dir} s={settings} media={media} accent={accent} reduce={reduceUI} speed={speed}
                timer={timer} remaining={remaining} nextMeeting={upcomingForPeek}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          aria-label={i("الساعة", "Clock")}
          initial={false}
          variants={cf}
          animate={mode === "pill" && !palette ? "shown" : "hidden"}
          data-testid="pill-layer"
          style={{ height: restBody.h, fontSize: 13 * k, pointerEvents: mode === "pill" && !palette ? "auto" : "none" }}
          className="absolute inset-x-0 top-0 flex items-center justify-center font-medium tabular-nums"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pillKey}
              variants={swapVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onPanEnd={(_, info) => { if (capKinds.length > 1 && Math.abs(info.offset.x) > 28) { lastPanAt.current = performance.now(); cycleCap(); } }}
              className="flex w-full items-center justify-center"
            >
              {pillKey === "alert" && alert ? (
                <span dir="auto" className="flex max-w-full items-center gap-2 px-3" role="alert">
                  {alert.kind === "timer" || alert.kind === "break" ? (
                    <motion.span animate={alertShake.animate} transition={alertShake.transition}>
                      {alert.kind === "timer" ? <TimerIcon size={ic(15)} /> : <Coffee size={ic(15)} />}
                    </motion.span>
                  ) : (
                    <LottieIcon name="bell" size={ic(20)} loops={3} />
                  )}
                  <span className="truncate">
                    {alert.text || (alert.kind === "timer" ? i("انتهى المؤقّت", "Timer finished") : i("تذكير", "Reminder"))}
                  </span>
                </span>
              ) : pillKey === "rec" ? (
                <CapsuleSplit
                  kind="rec" k={k} dots={dots}
                  left={i("جارٍ التسجيل", "Recording")}
                  value={<><span className="island-rec-dot rounded-full" style={{ width: ic(8), height: ic(8), background: "var(--act-rec)" }} /><span>{fmtElapsed(rec.elapsed)}</span></>}
                />
              ) : pillKey === "timer" && remaining !== null ? (
                <CapsuleSplit kind="timer" k={k} dots={dots} left={timer?.label || i("المؤقّت", "Timer")} value={fmtCountdown(remaining)} />
              ) : pillKey === "stopwatch" ? (
                <CapsuleSplit kind="stopwatch" k={k} dots={dots} left={i("ساعة إيقاف", "Stopwatch")} value={fmtStopwatch(swMs, false)} />
              ) : pillKey === "media" && pillTitle ? (
                <PillMedia media={media} accent={accent} reduce={reduceUI} visible={mode === "pill" && !hidden} k={k} viz={settings.visualizer ?? "bars"} dots={dots} />
              ) : pillKey === "meeting" && upMeeting ? (
                <CapsuleSplit
                  kind="meeting" k={k} dots={dots}
                  left={upMeeting.item.title || i("اجتماع", "Meeting")}
                  value={upMeeting.state === "now" ? i("الآن", "Now") : `${upMeeting.minutes} ${i("د", "min")}`}
                />
              ) : pillKey === "battery" && battery?.percent != null ? (
                <CapsuleSplit kind="battery" k={k} dots={dots} left={i("بطارية منخفضة", "Low battery")} value={`${battery.percent}%`} />
              ) : pillKey === "update" && updOn ? (
                <CapsuleSplit
                  kind="update" k={k} dots={dots}
                  left={updateLabel(upd)}
                  value={upd.phase === "available" || upd.phase === "error" ? (
                    <button
                      data-testid="capsule-update-install"
                      onClick={(e) => { e.stopPropagation(); installUpdate(); }}
                      className="rounded-full bg-[var(--act-update)] px-2 text-[0.85em] font-semibold text-black"
                    >{upd.phase === "error" ? i("إعادة المحاولة", "Retry") : i("تثبيت", "Install")}</button>
                  ) : null}
                />
              ) : pillKey === "net" && net ? (
                <CapsuleSplit kind="net" k={k} dots={dots} left={i("الشبكة", "Network")} value={<NetValue down={net.down} up={net.up} />} />
              ) : (
                (settings.eyesEnabled ?? true) ? (
                  // عيون التميمة بجانب الساعة؛ ينعكس الترتيب بالعربية فقط (التتبّع فيزيائي لا يتأثر).
                  <span
                    className="flex items-center gap-2.5"
                    style={{ flexDirection: rowReversed(settings.language === "en" ? "en" : "ar") ? "row-reverse" : "row" }}
                  >
                    <Eyes islandHidden={hidden || mode !== "pill" || !!palette} k={k} />
                    {(settings.showClock ?? true) && <span dir="ltr">{time}</span>}
                  </span>
                ) : (
                  (settings.showClock ?? true) && <span dir="ltr">{time}</span>
                )
              )}
              {pillKey === "clock" && showBat && battery?.has_battery && (
                <span className="ms-3 text-white/70" style={{ fontSize: 11 * k }}><BatteryChip b={battery} size={ic(12)} /></span>
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
          variants={cf}
          animate={open ? "shown" : "hidden"}
          data-testid="panel-layer"
          style={{ width: panel.w, height: panel.h, padding: "var(--island-pad)", pointerEvents: open ? "auto" : "none" }}
          className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col"
        >
          <div className="flex shrink-0 items-center gap-2">
            {(settings.panelTabsStyle ?? "icons") !== "hidden" && <div className="min-w-0 overflow-x-auto"><TabBar
              labels={tabLabels}
              icons={tabs.map((t) => TAB_ICONS[t.id])}
              variant={(settings.panelTabsStyle ?? "icons") as "labels" | "icons" | "dots"}
              active={tab}
              onSelect={(n) => setTabId(tabs[n]?.id ?? "home")}
              onHint={(n) => { if (tabs[n]?.id === "note") void importNote().catch(() => {}); }}
            /></div>}
            <motion.button
              aria-label={i("الإعدادات", "Settings")}
              title={i("الإعدادات", "Settings")}
              onClick={() => invoke("open_settings").catch(() => {})}
              whileHover={tap.whileHover}
              whileTap={tap.whileTap}
              transition={tap.transition}
              className="i-btn ms-auto shrink-0 p-1.5"
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
                className="absolute bottom-3 left-1/2 z-20 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-[13px] text-white"
              >
                {alert.kind === "timer" ? <TimerIcon size={15} /> : alert.kind === "break" ? <Coffee size={15} /> : <LottieIcon name="bell" size={20} loops={3} />}
                <span className="truncate">{alert.text || (alert.kind === "timer" ? i("انتهى المؤقّت", "Timer finished") : i("تذكير", "Reminder"))}</span>
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence key={presenceEpoch} mode="wait" initial={false}>
            {open && (
              <motion.div
                key={curTab}
                onAnimationStart={(def) => { if (def === "animate") shownTab.current = curTab; }}
                variants={swapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex min-h-0 flex-1 flex-col pt-3"
              >
                {curTab === "home" && (
                  // بطاقة النشاط الحي الأعلى أولوية تتصدّر الرئيسية (أو حالة الميديا الفارغة)؛ تحتها صف بلاطات «لمحة» الشرطية. لا شيء آخر.
                  // الرئيسية: عمود يمرّر داخليًا إن لم يتّسع المحتوى (لا تداخل أبدًا): بطاقة النشاط/المشغّل بحدّ أدنى لمحتواها، وتحتها البلاطات.
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden" style={{ gap: "var(--island-section-gap)" }}>
                    {(shownPanel || moduleMedia) && (
                      <motion.div custom={0} variants={sectionVariants} initial="initial" animate="animate" className="min-w-0 flex-1 shrink-0 [min-height:min-content]">
                        {shownPanel ? (
                          <ActivityStack kinds={panelKinds} shown={shownPanel} onPin={setPinPanel} data={liveData} />
                        ) : (
                          <PlayerPanel media={media} s={settings} accent={accent} reduce={reduceUI} visible={open} />
                        )}
                      </motion.div>
                    )}
                    <HomeTiles settings={settings} meetings={meetings.snap.items} battery={battery} liveShown={shownPanel} />
                  </div>
                )}
                {curTab === "note" && (
                  <div className="min-h-0 flex-1">
                    <TabBoundary key={retryN} onRetry={(e) => {
                      // المتصفح يخزّن فشل الاستيراد الديناميكي لنفس العنوان طوال عمر الصفحة: لا تنفع إعادة المحاولة هنا إلا بإعادة تحميل الصفحة.
                      if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String(e?.message))) window.location.reload();
                      else { setNoteTab(makeNoteTab()); setRetryN((n) => n + 1); }
                    }}>
                      <Suspense fallback={null}>
                        <NoteTab timer={timer} />
                      </Suspense>
                    </TabBoundary>
                  </div>
                )}
                {curTab === "tools" && (
                  <div className="min-h-0 flex-1">
                    <ToolsTab />
                  </div>
                )}
                {curTab === "meetings" && (
                  <div className="min-h-0 flex-1">
                    <MeetingsTab snap={meetings.snap} refresh={meetings.refresh} loading={meetings.loading} />
                  </div>
                )}
                {curTab === "system" && (
                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                    <SystemSection showVolume={settings.showVolume ?? true} />
                    {/* ما خرج من الرئيسية يعيش هنا: يومي الكامل (قائمة الصلوات…)، البطارية التفصيلية، «وقتي اليوم». */}
                    {(settings.showToday ?? true) && <TodaySection settings={settings} />}
                    {showBat && <BatterySection b={battery} tip={settings.batteryTip ?? true} btOn={btOn} />}
                    {attentionOn && <AttentionSection snap={attention} />}
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
    </LottieShownProvider>
  );
}
