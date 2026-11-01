import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LottieIcon, LottieShownProvider } from "../../lottie";
import { Coffee, Settings as SettingsIcon, Timer as TimerIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { alertShake, dur, ease, paletteVariants, useMotionLevel, sectionVariants, spring, swapVariants, tap } from "../../motion";
import { i } from "../../i18n";
import { clampTint, useSettings } from "../../useSettings";
import { useMedia } from "../../useMedia";
import { useBattery } from "../../useBattery";
import { activeKinds, clampLeadMin, compactWidth, fmtStopwatch, nextKind, shownKind, tabShape, type ActivityKind } from "../../liveActivity";
import { useStopwatchNow } from "../../useStopwatch";
import { useNetSpeed } from "../../useNetSpeed";
import { useDock } from "../../useDock";
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
const PILL_DEFAULT = { w: 220, h: 34 };
const clampN = (v: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, typeof v === "number" && Number.isFinite(v) ? v : d));
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
const tabDefs = (shelfOn: boolean, shelfCount: number, launcherOn: boolean, meetingsOn: boolean) => [
  { id: "home", label: i("الرئيسية", "Home") },
  { id: "clip", label: i("الحافظة", "Clipboard") },
  ...(shelfOn ? [{ id: "shelf", label: shelfCount > 0 ? `${i("الرفّ", "Shelf")} (${shelfCount})` : i("الرفّ", "Shelf") }] : []),
  ...(launcherOn ? [{ id: "launcher", label: i("اللانشر", "Launcher") }] : []),
  { id: "note", label: i("ملاحظة", "Note") },
  { id: "tools", label: i("الأدوات", "Tools") },
  ...(meetingsOn ? [{ id: "meetings", label: i("الاجتماعات", "Meetings") }] : []),
  { id: "system", label: i("النظام", "System") },
  { id: "chat", label: i("المحادثة", "Chat") },
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
  const fmt = settings.clockFormat ?? "auto";
  // مقاس الحبة المنكمشة من الإعدادات؛ k = الارتفاع/32 يقيس الخط والعيون والأيقونات معًا (بلا تشوّه).
  const pill = { w: clampN(settings.pillWidth, 160, 280, PILL_DEFAULT.w), h: clampN(settings.pillHeight, 28, 44, PILL_DEFAULT.h) };
  const k = pill.h / 32;
  const alertSz = { w: Math.max(340, Math.round(pill.w * 1.55)), h: pill.h + 4 };
  const ic = (n: number) => Math.round(n * k);
  const [time, setTime] = useState(() => fmtTime(fmt));
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
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
  const dock = useDock(!!settings.browserTabMode);
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
    rec: { recording: rec.recording, elapsed: rec.elapsed }, timer, remaining, media, showLyrics: !!(settings.lyricsInHome || settings.lyricsInPlayer),
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

  // آخر مقاس أُبلغت به النافذة (لتمييز النمو الذي يسبق الحركة عن الانكماش الذي يليها).
  const reported = useRef({ w: 0, h: 0 });
  const report = (w: number, h: number) => {
    reported.current = { w, h };
    return invoke("report_island_rect", { width: w, height: h }).catch(() => {});
  };
  // مقاس النافذة الاستراحي الحالي (يُحدَّث في العرض): الحبة · مدمجة منقسمة · تنبيه · أو ارتفاع شريط التبويبات عند الإرساء.
  const restWinRef = useRef({ w: 0, h: 0 });

  /** تصغير النافذة بعد انتهاء حركة الانكماش (رد onAnimationComplete) مع مؤقّت احتياطي واحد. */
  const flushShrink = (): boolean => {
    if (!shrinkPending.current) return false;
    shrinkPending.current = false;
    window.clearTimeout(shrinkT.current);
    const rest = restWinRef.current;
    // الاستقرار (للزجاج الحقيقي) بعد أن تُقاس النافذة فعلًا: وإلا تُطبَّق المنطقة على حجم قديم.
    report(rest.w, rest.h).finally(settleNow);
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

  // الحالة الاستراحية: تنبيه/نشاط مدمج/ارتفاع الشريط عند الإرساء.
  const alertShown = !!alert && !open && shownCap !== "rec";
  const restContent = alertShown ? alertSz : shownCap ? { w: compactWidth(pill.w), h: pill.h } : pill;
  const tabS = tabShape(dock, restContent.w, restContent.h);
  const restWin = dock.active ? { w: restContent.w, h: tabS.winH } : restContent;
  const restBody = dock.active ? { w: restContent.w, h: tabS.bodyH } : restContent;
  restWinRef.current = restWin;
  // تغيّر المقاس الاستراحي والحبة منكمشة: النمو ⇒ تكبير النافذة قبل الحركة؛ الانكماش ⇒ تصغيرها بعد انتهاء الحركة.
  useEffect(() => {
    if (open || paletteRef.current) return;
    const grow = restWin.w > reported.current.w || restWin.h > reported.current.h;
    if (grow) { cancelShrink(); report(restWin.w, restWin.h); }
    else scheduleShrink();
  }, [restWin.w, restWin.h]);

  const size = palette ? PALETTE : open ? panel : restBody;
  // الشفافية من الإعدادات؛ autoHide يخفي الحبة في الراحة (النافذة تبقى تستقبل المرور فتظهر عند الهوفر).
  const rest = (settings.opacityRest ?? 100) / 100;
  const opened = (settings.opacityOpen ?? 100) / 100;
  const opacity = hidden ? 0 : palette ? 1 : open ? opened : settings.autoHide && !hover ? 0 : rest;

  // كبسولة كاملة الاستدارة؛ مرسيّة في شريط المتصفح: زوايا علوية مدوّرة وقاع مسطّح (هيئة تبويب).
  const dockedRest = dock.active && !open && !palette;
  const rTop = palette ? 24 : open ? 28 : dockedRest ? tabS.top : restBody.h / 2;
  const rBot = palette ? 24 : open ? 28 : dockedRest ? tabS.bottom : restBody.h / 2;
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
    glass: (settings.themeMaterial ?? "solid") === "glass",
    light: settings.themeMode === "light",
    ready: settled && !hidden && opacity >= 0.99,
    radius,
    tint: clampTint(settings.glassTint),
  });
  const tabs = tabDefs(shelfOn, shelf.items.length, launcherOn, meetingsOn);
  const tab = Math.max(0, tabs.findIndex((t) => t.id === tabId));
  const curTab = tabs[tab].id;
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
    <div className="flex w-full justify-center">
      <motion.div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={() => {
          if (performance.now() - lastPanAt.current < 300) return; // سحب التبديل بين النشاطين لا يُحتسب نقرة
          if (alert) dismiss();
          else if (rec.recording && !open && !palette) invoke("record_stop").catch(() => {});
          else if (!open && !palette) { window.clearTimeout(hoverT.current); expand(); } // الضغط يفتح اللوحة فورًا (في وضع التبويب أيضًا)
        }}
        onContextMenu={(e) => { e.preventDefault(); invoke("open_settings").catch(() => {}); }}
        initial={false}
        animate={{
          opacity, width: size.w, height: size.h, y: open || palette ? 0 : dock.active ? tabS.y : 0,
          borderTopLeftRadius: rTop, borderTopRightRadius: rTop, borderBottomLeftRadius: rBot, borderBottomRightRadius: rBot,
        }}
        transition={{ default: spring.island, opacity: { duration: dur.base, ease: ease.out } }}
        onAnimationComplete={() => { if (!flushShrink()) settleNow(); }}
        style={{ boxShadow: open || palette ? "var(--island-ring-open)" : "var(--island-ring)" }}
        data-docked={dockedRest ? "true" : "false"}
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
            {privacy.cam && <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_6px_rgb(74_222_128)]" />}
            {privacy.mic && <span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_6px_rgb(251_146_60)]" />}
          </div>
        )}
        <motion.div
          aria-label={i("الساعة", "Clock")}
          initial={false}
          animate={{ opacity: open || palette ? 0 : 1 }}
          transition={{ duration: dur.base, ease: ease.out }}
          style={{ height: restBody.h, fontSize: 13 * k }}
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
                <CapsuleSplit
                  kind="media" k={k} dots={dots}
                  left={<PillTitle text={media.info.title} inset={0} />}
                  value={media.info.artist ? <span dir="auto" className="max-w-[7.5em] truncate text-white/60">{media.info.artist}</span> : null}
                />
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
                    <Eyes islandHidden={hidden} k={k} />
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
          animate={{ opacity: open ? 1 : 0 }}
          transition={{ duration: dur.base, ease: ease.out, delay: open ? 0.08 : 0 }}
          style={{ width: panel.w, height: panel.h, padding: "var(--island-pad)", pointerEvents: open ? "auto" : "none" }}
          className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col"
        >
          <div className="flex shrink-0 items-center gap-2">
            <TabBar
              labels={tabLabels}
              active={tab}
              onSelect={(n) => setTabId(tabs[n]?.id ?? "home")}
              onHint={(n) => { if (tabs[n]?.id === "note") void importNote().catch(() => {}); }}
            />
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
                  <div className="flex min-h-0 flex-1 flex-col" style={{ gap: "var(--island-section-gap)" }}>
                    {(shownPanel || moduleMedia) && (
                      <motion.div custom={0} variants={sectionVariants} initial="initial" animate="animate" className="min-h-0 min-w-0 flex-1">
                        {shownPanel ? (
                          <ActivityStack kinds={panelKinds} shown={shownPanel} onPin={setPinPanel} data={liveData} />
                        ) : (
                          <MediaSection media={media} showLyrics={!!(settings.lyricsInHome || settings.lyricsInPlayer)} />
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
