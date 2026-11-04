import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LottieIcon, LottieShownProvider } from "../../lottie";
import { Coffee, Settings as SettingsIcon, Timer as TimerIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { IslandHalo } from "./Halo";
import { alertShake, dur, ease, islandSpring, pillHoverSpring, paletteVariants, useMotionLevel, sectionVariants, spring, swapVariants, tap } from "../../motion";
import { i } from "../../i18n";
import { useResolvedTheme, useSettings } from "../../useSettings";
import { shapeRadius } from "../../appearance";
import { PANEL as PANEL_TOKEN, PANEL_PALETTE, PEEK, PILL as PILL_TOKEN } from "../../tokens";
import { useMedia, mediaTitle } from "../../useMedia";
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
import { PeekView } from "./PeekView";
import { PillMedia, PlayerPeek, PlayerPanel, useAccent } from "./Player";
import { scrollsFurther } from "./wheel";
import { Bell as BellIcon, Calendar as CalendarIcon, Camera as CameraIcon, ClipboardList, Grid2x2, Home as HomeIcon, Layers as LayersIcon, Notebook, Wrench, Cpu as CpuIcon, MessageCircle, Rocket, Users } from "lucide-react";
import { fmtCountdown, TIMER_NEAR_MS, useNoteAlert, useTimer } from "../../useNote";
import { MediaSection } from "./MediaSection";
import { TodaySection } from "./TodaySection";
import { HomeTiles } from "./HomeTiles";
import { Liquid } from "./Liquid";
import { Eyes } from "./Eyes";
import { TabBoundary } from "./TabBoundary";
import { rowReversed } from "../../eyes";
import { Palette } from "./Palette";
import { TabBar } from "./TabBar";
import { IdleHome } from "./IdleHome";
import { isWideLayout } from "./layoutMode";
import { clampPct, clockAbsStyle, clockFontSize, eyesAlignStyle, normClockPosition } from "./clockPlacement";
import { Dock, SubTabs, groupIndexOf, pageGroups, targetTab } from "./Dock";
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
/** عناصر الإطلالة الوظيفية: النقر عليها لا يُعدّ «اختصار فتح اللوحة». */
const PEEK_INTERACTIVE = 'button, a, input, textarea, select, label, [role="slider"], [role="tab"], [contenteditable="true"], .ProseMirror, [data-no-expand]';
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

/** صفحات الدوك (مجموعات فوق التبويبات الدقيقة). «الالتقاط» = تبويب tools الحالي؛ «الأدوات» = الرف/ملاحظة/اجتماعات/النظام كتبويبات فرعية. */
const PAGE_DEFS = [
  { id: "home", members: ["home"], label: () => i("الرئيسية", "Home"), icon: <HomeIcon size={16} /> },
  { id: "capture", members: ["tools"], label: () => i("الالتقاط", "Capture"), icon: <CameraIcon size={16} /> },
  { id: "clip", members: ["clip"], label: () => i("الحافظة", "Clipboard"), icon: <ClipboardList size={16} /> },
  { id: "apps", members: ["launcher"], label: () => i("التطبيقات", "Apps"), icon: <Grid2x2 size={16} /> },
  { id: "work", members: ["shelf", "note", "meetings", "system"], label: () => i("الأدوات", "Tools"), icon: <Wrench size={16} /> },
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
  const { theme } = useResolvedTheme(settings);
  const fmt = settings.clockFormat ?? "auto";
  // مقاس الحبة المنكمشة من الإعدادات؛ k = الارتفاع/32 يقيس الخط والعيون والأيقونات معًا (بلا تشوّه).
  // مقياس الحبة (themeTune.pillScale): يضرب المقاس المخزّن؛ السقف المطلق ضمن النافذة الثابتة.
  const pSc = settings.fx?.scale.pill ?? 1;
  const pill = { w: Math.min(520, Math.round(clampN(settings.pillWidth, PILL_TOKEN.minW, PILL_TOKEN.maxW, PILL_DEFAULT.w) * pSc)), h: Math.min(56, Math.round(clampN(settings.pillHeight, PILL_TOKEN.minH, PILL_TOKEN.maxH, PILL_DEFAULT.h) * pSc)) };
  // نصف قطر الحبة: pillRadius=0 ⇒ كبسولة كاملة (نصف الارتفاع)، وإلا مقيّد بنصف الارتفاع.
  // الشكل قائد (docs/THEMES.md): حزمة شكل تفرض نصف القطر ما لم يضبطه المستخدم صراحةً.
  const shapePill = shapeRadius(settings.pillRadius ?? 0, 0, settings.fx?.shape.pillR ?? null);
  const pillR = shapePill !== null ? Math.min(shapePill, pill.h / 2) : settings.pillRadius && settings.pillRadius > 0 ? Math.min(settings.pillRadius, pill.h / 2) : pill.h / 2;
  const k = pill.h / 32;
  const ic = (n: number) => Math.round(n * k);
  const [time, setTime] = useState(() => fmtTime(fmt));
  const [hover, setHover] = useState(false);
  const hoverRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
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
  // تبويب الإطلالة مستقل عن تبويب اللوحة ويعود للرئيسية عند الانكماش للحبة (فلا تفتح كل إطلالة لاحقة على حقل بحث/قائمة)؛ الضغط على خلفية الإطلالة ينقله للوحة.
  const [peekTab, setPeekTab] = useState("home");
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
  const trackKey = `${media.info.source}|${media.info.title}|${media.info.artist}|${media.info.album}`;
  const accent = useAccent(media.cover, trackKey, settings);
  const reduceUI = motion_level !== "full" || resolveReduce(settings.reduceMotion, false);
  // mediaPill: "off"/"clock" = الساعة؛ جلسة الميديا تبقى في الحبة عند الإيقاف المؤقت كي لا تختفي أزرار استئنافها أثناء الهوفر.
  const pillTitle =
    moduleMedia && !["off", "clock"].includes(settings.mediaPill ?? "") && media.info.session
      ? [mediaTitle(media.info), media.info.artist].filter(Boolean).join(" — ")
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
  // الحجم المرسوم فعلًا: ينمو بعد تغطية المنطقة له (انظر useLayoutEffect أدناه) ويتبع الهدف فورًا عند الانكماش.
  const [animSize, setAnimSize] = useState<{ w: number; h: number } | null>(null);
  // مقياس اللوحة (themeTune.panelScale): ضمن النافذة الثابتة 800×500 (مع هامش المنطقة)
  const aSc = settings.fx?.scale.panel ?? 1;
  const panel = { w: Math.min(760, Math.round(clampN(settings.panelWidth, 420, 720, 520) * aSc)), h: Math.min(470, Math.round(clampN(settings.panelHeight, 220, 420, 290) * aSc)) };
  // ترتيب العجلة/الصفحات يطابق الدوك تمامًا (الرئيسية · الالتقاط · الحافظة · التطبيقات · الأدوات[الرف · ملاحظة · اجتماعات · النظام]) — بلا قفز بين الصفحات.
  const tabsRaw = tabDefs(shelfOn, shelf.items.length, launcherOn, meetingsOn);
  const dockOrder = PAGE_DEFS.flatMap((d) => d.members);
  const dockRank = (id: string) => { const n = dockOrder.indexOf(id); return n < 0 ? 99 : n; };
  const tabs = (settings.panelTabsStyle ?? "dock") === "dock" ? [...tabsRaw].sort((a, b) => dockRank(a.id) - dockRank(b.id)) : tabsRaw;
  const tab = Math.max(0, tabs.findIndex((t) => t.id === tabId));
  const curTab = tabs[tab].id;
  const peekIdx = Math.max(0, tabs.findIndex((t) => t.id === peekTab));
  const peekTabId = tabs[peekIdx].id;
  // دوك الصفحات: يُحسب من التبويبات المتاحة فعليًا؛ آخر تبويب فرعي في كل صفحة يُحفظ لتعود إليه.
  const dockStyle = (settings.panelTabsStyle ?? "dock") === "dock";
  // تخطيط عريض تلقائي: لوحة قليلة الارتفاع عريضة (≥2.1× ، ≤320px) ⇒ الرئيسية تصير صفًّا (مشغّل/اقتراحات بجانب البلاطات). مقاسات المستخدم لا تُمسّ.
  const wide = isWideLayout(panel.w, panel.h);
  const clockFree = normClockPosition(settings.clockPosition) === "free";
  const clockFs = clockFontSize(settings.clockScale);
  const eyesAlign = eyesAlignStyle(settings.eyesAlign, Math.round(12 * (pill.h / 34)));
  const liveDataW = wide && liveData.player ? { ...liveData, player: { ...liveData.player, wide: true } } : liveData;
  const groups = pageGroups(PAGE_DEFS, tabs.map((t) => t.id));
  const groupIdx = groupIndexOf(groups, curTab);
  const lastInGroup = useRef<Record<string, string>>({});
  lastInGroup.current[groups[groupIdx]?.id ?? "home"] = curTab;
  // الإطلالة التفاعلية: جسم الرئيسية = peekHeight + شريط التبويبات؛ أي تبويب آخر ⇒ جسم أطول قابل للتمرير. سقف مطلق PEEK.maxW×maxH (docs/MOTION.md §الإطلالة).
  const peekBase = { w: clampN(settings.peekWidth, 240, PEEK.maxW, 460), h: clampN(settings.peekHeight, 72, 200, 148) };
  const mediaHover = shownCap === "media" && peekTabId === "home" && M.currentCard === "player";
  const peekSz = { w: peekBase.w, h: Math.min(PEEK.maxH, peekTabId === "home" ? peekBase.h + PEEK.tabsH : Math.max(peekBase.h + PEEK.tabsH, PEEK.tabBodyH)) };
  const peekR = shapeRadius(settings.peekRadius, 30, settings.fx?.shape.peekR ?? null) ?? clampN(settings.peekRadius, 12, 60, 30);
  const panelR = shapeRadius(settings.panelRadius, 34, settings.fx?.shape.panelR ?? null) ?? clampN(settings.panelRadius, 16, 60, 34);
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
  const reported = useRef({ w: 0, h: 0, r: -1 });
  const report = (w: number, h: number, r?: number) => {
    reported.current = { w, h, r: r ?? h / 2 };
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
    const rep = reported.current;
    // المنطقة تطابق الاستراحة سلفًا (لا انكماش فعلي): لا استدعاء مكرّر يعيد إنشاء المنطقة ويُعيد رسم النافذة أثناء/بعد الحركة.
    if (rest.w === rep.w && rest.h === rep.h && ((rest as { r?: number }).r ?? rest.h / 2) === rep.r) { settleNow(); return true; }
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
  const expand = () => { cancelShrink(); if (peek && peekTabId !== "home") setTabId(peekTabId); M.click(); };
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
    hoverRef.current = true;
    setHover(true);
    if (paletteRef.current) return;
    window.clearTimeout(collapseT.current);
    M.enter(); // لمحة بعد hoverDelayMs؛ الأحداث تصل فقط من شكل الجزيرة نفسه (منطقة النافذة)
  };
  const onLeave = () => {
    hoverRef.current = false;
    setHover(false);
    if (paletteRef.current) return;
    M.leave(); // إغلاق بعد 300ms (لمحة) / 500ms (لوحة)؛ العودة تلغيه
  };

  // قد يُستبدل العنصر تحت المؤشر (Pause→Play) قبل وصول mouseleave الاصطناعي.
  // حارس حدثي أثناء إطلالة الميديا فقط؛ لا استطلاع، ولا إغلاق أثناء سحب الشريط مع زر مضغوط.
  useEffect(() => {
    if (!peek || !mediaHover) return;
    const check = (e: PointerEvent) => {
      if (e.buttons || !hoverRef.current) return;
      const r = bodyRef.current?.getBoundingClientRect();
      if (r && (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom)) {
        hoverRef.current = false;
        setHover(false);
        M.leave();
      }
    };
    document.addEventListener("pointermove", check, { passive: true });
    document.addEventListener("pointerup", check, { passive: true });
    return () => { document.removeEventListener("pointermove", check); document.removeEventListener("pointerup", check); };
  }, [peek, mediaHover, M]);

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
    const rep = reported.current;
    const grow = size.w > rep.w || size.h > rep.h;
    if (grow) {
      cancelShrink();
      // مستطيل الإصابة يتّسع أولًا (اتحاد المقاسين كي لا ينكمش في بُعد بينما ينمو الآخر) ثم تبدأ الحركة فورًا في الصفحة: لا شيء يُنتظر من
      // الخلفية (لا منطقة نافذة تقصّ الجسم بعد الآن — ARCH)، فلا تسلسل بين إطار Chromium واستدعاء أصلي.
      report(Math.max(size.w, rep.w), Math.max(size.h, rep.h), targetR);
      setAnimSize({ w: size.w, h: size.h });
      if (size.w < rep.w || size.h < rep.h) scheduleShrink();
    } else {
      setAnimSize({ w: size.w, h: size.h });
      scheduleShrink();
    }
  }, [size.w, size.h, targetR, settings.loaded, hoverZoneKey]);
  // الشفافية من الإعدادات؛ autoHide يخفي الحبة في الراحة (النافذة تبقى تستقبل المرور فتظهر عند الهوفر).
  const rest = (settings.opacityRest ?? 100) / 100;
  const opened = (settings.opacityOpen ?? 100) / 100;
  const opacity = hidden ? 0 : palette ? 1 : open ? opened : settings.autoHide && !hover ? 0 : rest;

  // كبسولة كاملة الاستدارة؛ مرسيّة في شريط المتصفح: زوايا علوية مدوّرة وقاع مسطّح (هيئة تبويب).
  // ملتصقة بالحافة العليا (islandDocking=attached): زاويتا الأعلى مسطّحتان (هندسة نوتش)، والأسفل دائري؛ العائمة كما هي.
  const attached = settings.islandDocking === "attached";
  const rTop = attached ? 0 : targetR;
  const rBot = targetR;
  const radius = targetR;
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
  const referenceHome = dockStyle && !wide && curTab === "home";
  // reduced لا يذكر filter/transform؛ امسح قيم الحالة المخفية السابقة كي تبقى الرئيسية المرجعية حادّة بعد تحميل الإعدادات.
  const homeCf = referenceHome && reduceUI ? {
    hidden: { ...cf.hidden, filter: "none", y: 0, scale: 1 },
    shown: { ...cf.shown, filter: "none", y: 0, scale: 1 },
  } : cf;
  const hoverCf = mediaHover && reduceUI ? {
    hidden: { ...cf.hidden, filter: "none", y: 0, scale: 1 },
    shown: { ...cf.shown, filter: "none", y: 0, scale: 1 },
  } : cf;
  // نابض الحجم: فتح لمحة (d,b) · فتح لوحة (d×1.1,b) · أي إغلاق (d×0.9، بلا ارتداد). التقليل ⇒ قفز فوري + تلاشٍ 150ms.
  const rank = { pill: 0, peek: 1, panel: 2 } as const;
  const prevMode = useRef<"pill" | "peek" | "panel">("pill");
  const kind = palette ? "open" : rank[mode] > rank[prevMode.current] ? (mode === "panel" ? "panel" : "open") : rank[mode] < rank[prevMode.current] ? "close" : "open";
  useEffect(() => { prevMode.current = mode; }, [mode]);
  const sizeSpring = mediaHover && !open && !palette ? pillHoverSpring(kind === "close") : kind === "close" ? islandSpring.close : kind === "panel" ? islandSpring.panel : islandSpring.open;
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
  useEffect(() => {
    if (mode !== "pill" || peekTab === "home") return;
    const t = window.setTimeout(() => setPeekTab("home"), 450); // بعد انتهاء تلاشي الإطلالة؛ مؤقّت واحد لكل انكماش
    return () => window.clearTimeout(t);
  }, [mode, peekTab]);
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

  /** جسم التبويب (مشترك بين اللوحة والإطلالة): المكوّنات الحقيقية نفسها؛ where="peek" ⇒ الرئيسية تعرض بطاقات اللمحة (لاعب تفاعلي كامل) بدل بطاقة اللوحة. */
  const renderTab = (id: string, where: "panel" | "peek") => (
    <>
    {id === "home" && where === "panel" && (
      dockStyle && !wide ? (
        <div data-layout="tall" data-testid="home-reference" className="home-reference">
          {shownPanel && shownPanel !== "media" ? (
            <ActivityStack kinds={panelKinds} shown={shownPanel} onPin={setPinPanel} data={liveData} />
          ) : moduleMedia && media.info.session ? (
            <PlayerPanel media={media} s={settings} accent={accent} reduce={reduceUI} visible={open} />
          ) : (
            <IdleHome settings={settings} attention={attention} time={time} onOpenTab={setTabId}>
              <HomeTiles settings={settings} meetings={meetings.snap.items} battery={battery} liveShown={shownPanel} reference="idle" />
            </IdleHome>
          )}
          {(shownPanel || (moduleMedia && media.info.session)) && <HomeTiles settings={settings} meetings={meetings.snap.items} battery={battery} liveShown={shownPanel} reference="media" />}
        </div>
      ) : (
      // بطاقة النشاط الحي الأعلى أولوية تتصدّر الرئيسية (أو حالة الميديا الفارغة)؛ تحتها صف بلاطات «لمحة» الشرطية. لا شيء آخر.
      // الرئيسية: عمود يمرّر داخليًا إن لم يتّسع المحتوى (لا تداخل أبدًا): بطاقة النشاط/المشغّل بحدّ أدنى لمحتواها، وتحتها البلاطات.
      <div data-layout={wide ? "wide" : "tall"} className={`flex min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${wide ? "flex-row items-stretch" : "flex-col"}`} style={{ gap: "var(--island-section-gap)", ...(dockStyle ? { WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 16px), transparent)", maskImage: "linear-gradient(to bottom, #000 calc(100% - 16px), transparent)" } : {}) }}>
        {(shownPanel || moduleMedia) && (
          <motion.div custom={0} variants={sectionVariants} initial="initial" animate="animate" className="min-w-0 flex-1 shrink-0 [min-height:min-content]">
            {shownPanel ? (
              <ActivityStack kinds={panelKinds} shown={shownPanel} onPin={setPinPanel} data={liveDataW} />
            ) : dockStyle && !media.info.session ? (
              <IdleHome settings={settings} attention={attention} onOpenTab={setTabId} />
            ) : (
              <PlayerPanel media={media} s={settings} accent={accent} reduce={reduceUI} visible={open} wide={wide} />
            )}
          </motion.div>
        )}
        <HomeTiles settings={settings} meetings={meetings.snap.items} battery={battery} liveShown={shownPanel} wide={wide} />
      </div>
      )
    )}
    {id === "note" && (
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
    {id === "tools" && (
      <div className="min-h-0 flex-1">
        <ToolsTab settings={settings} wide={wide} onOpenTab={dockStyle ? setTabId : undefined} />
      </div>
    )}
    {id === "meetings" && (
      <div className="min-h-0 flex-1">
        <MeetingsTab snap={meetings.snap} refresh={meetings.refresh} loading={meetings.loading} />
      </div>
    )}
    {id === "system" && (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <SystemSection showVolume={settings.showVolume ?? true} />
        {/* ما خرج من الرئيسية يعيش هنا: يومي الكامل (قائمة الصلوات…)، البطارية التفصيلية، «وقتي اليوم». */}
        {(settings.showToday ?? true) && <TodaySection settings={settings} />}
        {showBat && <BatterySection b={battery} tip={settings.batteryTip ?? true} btOn={btOn} />}
        {attentionOn && <AttentionSection snap={attention} />}
      </div>
    )}
    {id === "clip" && (
      <div className="min-h-0 flex-1">
        <ClipboardTab />
      </div>
    )}
    {id === "launcher" && (
      <div className="min-h-0 flex-1">
        <LauncherTab launcher={launcher} />
      </div>
    )}
    {id === "shelf" && (
      <div className="min-h-0 flex-1">
        <ShelfTab items={shelf.items} dragging={dragging} reload={shelf.reload} />
      </div>
    )}
    </>
  );

  return (
    <LottieShownProvider shown={!hidden && opacity > 0}>
    <div className={`flex w-full ${settings.pillPosition === "left" ? "justify-start" : settings.pillPosition === "right" ? "justify-end" : "justify-center"}`}>
      {/* غلاف يتبع مقاس الجسم؛ الهالة (ظل+توهّج) طبقة مُعدّة مسبقًا بمقاس الهدف تتحرّك بالتحويل/العتامة فقط — لا box-shadow ولا blur حيّ (Halo.tsx · GLASS.md). */}
      <div className="island-wrap">
      <IslandHalo
        w={(palette || !animSize ? size : animSize).w} h={(palette || !animSize ? size : animSize).h} radius={targetR} opacity={opacity}
        align={settings.pillPosition === "left" ? "left" : settings.pillPosition === "right" ? "right" : "center"}
        transition={sizeSpring}
        opacityTransition={{ duration: reduceUI ? 0.15 : dur.base, ease: ease.out }}
      />
      <motion.div
        ref={bodyRef}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={(e) => {
          if (performance.now() - lastPanAt.current < 300) return; // سحب التبديل بين النشاطين لا يُحتسب نقرة
          // الإطلالة تفاعلية: النقر على عنصر وظيفي (زر/حقل/شريط/رابط/محرّر) لا يفتح اللوحة؛ النقر على الخلفية وحدها اختصار للوحة الأكبر.
          if (peek && (e.target as Element).closest?.(PEEK_INTERACTIVE)) return;
          if (alert) dismiss();
          else if (rec.recording && mode === "pill" && !palette) invoke("record_stop").catch(() => {});
          else if (!open && !palette) expand(); // النقر على الحبة أو اللمحة يفتح اللوحة
        }}
        onContextMenu={(e) => { e.preventDefault(); invoke("open_settings").catch(() => {}); }}
        initial={false}
        animate={{
          opacity, width: (palette || !animSize ? size : animSize).w, height: (palette || !animSize ? size : animSize).h, y: 0,
          borderTopLeftRadius: rTop, borderTopRightRadius: rTop, borderBottomLeftRadius: rBot, borderBottomRightRadius: rBot,
        }}
        transition={{ default: sizeSpring, opacity: { duration: reduceUI ? 0.15 : dur.base, ease: ease.out } }}
        onAnimationComplete={() => { if (!flushShrink()) settleNow(); }}
        data-open={open || palette ? "true" : "false"}
        data-mode={palette ? "palette" : mode}
        data-media-hover={mediaHover ? "true" : undefined}
        data-docking={attached ? "attached" : "floating"}
        data-spring={JSON.stringify(kind === "close" ? islandSpring.close : kind === "panel" ? islandSpring.panel : islandSpring.open)}
        onWheel={(e) => {
          if (palette) return;
          if (peek && peekTabId !== "home") return; // تبويب غير الرئيسية في الإطلالة: العجلة تمرّر المحتوى نفسه (لا تبديل بطاقات)
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
        {media.cover && (settings.artworkBackdrop ?? true) && (settings.playerLayout ?? "compact") !== "minimal" && !(open && dockStyle && !wide && curTab === "home") && (
          <>
            <div aria-hidden data-testid="artwork-backdrop" style={{
              position: "absolute", inset: settings.fx?.hero ? "-24px -24px auto -24px" : -40, height: settings.fx?.hero ? "58%" : undefined, backgroundImage: `url(${media.cover})`, backgroundSize: "cover", backgroundPosition: "center", filter: `blur(${settings.fx?.hero ? 18 : 30}px) saturate(1.5)`, pointerEvents: "none",
              ...(settings.fx?.hero ? { WebkitMaskImage: "linear-gradient(180deg, #000 0%, transparent 100%)", maskImage: "linear-gradient(180deg, #000 0%, transparent 100%)" } : {}),
              opacity: (peek && M.currentCard === "player") || (open && curTab === "home") ? ((settings.themeMaterial ?? "glass") === "solid" ? 0.45 : 0.35) : 0,
              transition: `opacity ${reduceUI ? 150 : 360}ms ease`,
            }} />
            <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.35))", opacity: (peek && M.currentCard === "player") || (open && curTab === "home") ? 1 : 0, transition: `opacity ${reduceUI ? 150 : 360}ms ease` }} />
          </>
        )}
        <AnimatePresence>
          {peek && !palette && (
            <motion.div
              key="peek" variants={hoverCf} initial="hidden" animate="shown" exit="hidden" data-testid="peek-layer"
              style={{ width: peekSz.w, height: peekSz.h }}
              className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col"
            >
              {mediaHover ? <PlayerPeek media={media} s={settings} accent={accent} reduce={reduceUI} visible={!hidden && opacity > 0} hover /> : <>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={peekTabId} variants={swapVariants} initial="initial" animate="animate" exit="exit"
                  data-testid="peek-body" data-tab={peekTabId}
                  className="flex min-h-0 flex-1 flex-col"
                  style={peekTabId === "home" ? undefined : { padding: "var(--island-pad) var(--island-pad) 0" }}
                >
                  {peekTabId === "home" ? (
                    <PeekView
                      cards={M.cfg.cards} index={M.card} dir={M.dir} s={settings} media={media} accent={accent} reduce={reduceUI} speed={speed}
                      timer={timer} remaining={remaining} nextMeeting={upcomingForPeek}
                    />
                  ) : renderTab(peekTabId, "peek")}
                </motion.div>
              </AnimatePresence>
              {/* شريط التبويبات في أسفل الإطلالة (لا أعلاها): المؤشر يستقر أعلى المنتصف حيث كانت الحبة، فالنقر المعتاد على الإطلالة يصيب المحتوى/الخلفية ويفتح اللوحة ولا يصيب تبويبًا. */}
              <div data-testid="peek-tabs" className="flex shrink-0 items-center justify-center" style={{ height: PEEK.tabsH, paddingInline: 12 }}>
                <div className="min-w-0 overflow-x-auto">
                  <TabBar
                    labels={tabLabels}
                    icons={tabs.map((t) => TAB_ICONS[t.id])}
                    variant="icons"
                    active={peekIdx}
                    onSelect={(n) => setPeekTab(tabs[n]?.id ?? "home")}
                    onHint={(n) => { if (tabs[n]?.id === "note") void importNote().catch(() => {}); }}
                  />
                </div>
              </div>
              </>}
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
              style={pillKey === "clock" && !clockFree && eyesAlign ? eyesAlign : undefined}
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
                <PillMedia media={media} accent={accent} reduce={reduceUI} visible={mode === "pill" && !hidden} k={k} viz={settings.visualizer ?? "bars"} dots={dots} rtl={settings.language !== "en"} />
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
                  clockFree ? (
                    // وضع الساعة الحرّ: العيون تُحاذى لوحدها (eyesAlign) والساعة تُثبَّت بنسبتي clockX/clockY داخل الحبة (لا تخرج عنها).
                    <>
                      <span className="flex w-full items-center" style={eyesAlign ?? { justifyContent: "center" }}>
                        <Eyes islandHidden={hidden || mode !== "pill" || !!palette} k={k} />
                      </span>
                      {(settings.showClock ?? true) && <span dir="ltr" data-testid="pill-clock" style={{ ...clockAbsStyle(settings.clockX, settings.clockY), fontSize: clockFs, lineHeight: 1 }}>{time}</span>}
                    </>
                  ) : (
                    // عيون التميمة بجانب الساعة؛ ينعكس الترتيب بالعربية فقط (التتبّع فيزيائي لا يتأثر).
                    <span
                      data-testid="pill-row"
                      className="flex items-center gap-2.5"
                      style={{ flexDirection: rowReversed(settings.language === "en" ? "en" : "ar") ? "row-reverse" : "row" }}
                    >
                      <Eyes islandHidden={hidden || mode !== "pill" || !!palette} k={k} />
                      {(settings.showClock ?? true) && <span dir="ltr" data-testid="pill-clock" style={{ fontSize: clockFs }}>{time}</span>}
                    </span>
                  )
                ) : (
                  (settings.showClock ?? true) && (clockFree
                    ? <span dir="ltr" data-testid="pill-clock" style={{ ...clockAbsStyle(settings.clockX, settings.clockY), fontSize: clockFs, lineHeight: 1 }}>{time}</span>
                    : <span dir="ltr" data-testid="pill-clock" style={{ fontSize: clockFs }}>{time}</span>)
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
          variants={homeCf}
          animate={open ? "shown" : "hidden"}
          data-testid="panel-layer"
          style={{ width: panel.w, height: panel.h, padding: "var(--island-pad)", pointerEvents: open ? "auto" : "none" }}
          className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col"
        >
          <div className={dockStyle ? "hidden" : "flex shrink-0 items-center gap-2"}>
            {(settings.panelTabsStyle ?? "dock") !== "hidden" && !dockStyle && <div className="min-w-0 overflow-x-auto"><TabBar
              labels={tabLabels}
              icons={tabs.map((t) => TAB_ICONS[t.id])}
              variant={(settings.panelTabsStyle === "dock" || !settings.panelTabsStyle ? "icons" : settings.panelTabsStyle) as "labels" | "icons" | "dots"}
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
                className={`flex min-h-0 flex-1 flex-col ${referenceHome ? "pt-0" : "pt-3"}`}
              >
                {dockStyle && groups[groupIdx]?.id === "work" && (
                  <SubTabs
                    items={groups[groupIdx].members.map((m) => ({ id: m, label: tabs.find((t) => t.id === m)?.label ?? m }))}
                    active={curTab}
                    onSelect={(id) => setTabId(id)}
                  />
                )}
                {renderTab(curTab, "panel")}
              </motion.div>
            )}
          </AnimatePresence>
          {dockStyle && (
            <div className="relative flex shrink-0 items-center justify-center pt-2">
              <Dock
                groups={groups.map((g) => ({ id: g.id, label: g.label(), icon: g.icon, members: g.members }))}
                active={groupIdx}
                onSelect={(n) => { const g = groups[n]; if (g) setTabId(targetTab(g, lastInGroup.current[g.id])); }}
              />
              <motion.button
                aria-label={i("الإعدادات", "Settings")}
                title={i("الإعدادات", "Settings")}
                onClick={() => invoke("open_settings").catch(() => {})}
                whileHover={tap.whileHover}
                whileTap={tap.whileTap}
                transition={tap.transition}
                className="i-btn absolute end-0 shrink-0 p-1.5"
              >
                <SettingsIcon size={16} />
              </motion.button>
            </div>
          )}
        </motion.div>
      </motion.div>
      </div>
    </div>
    </LottieShownProvider>
  );
}
