import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  animate, AnimatePresence, motion, useMotionValue, useTransform,
} from "motion/react";
import {
  ArrowDown, ArrowUp, BatteryCharging, Check, Download, Hourglass, Music, Pause, Play, RotateCcw, Timer as StopwatchIcon, Video, X, Zap,
  type LucideIcon,
} from "lucide-react";
import { itemVariants, spring, swapVariants, tap } from "../../motion";
import { i } from "../../i18n";
import {
  ACCENT, downloadStage, fmtSpeed, fmtStopwatch, secondaryKind, sparkPoints, stageStates, swipeDone, swipeProgress,
  type ActivityKind,
} from "../../liveActivity";
import { fmtCountdown, type TimerState } from "../../useNote";
import { fmtElapsed } from "../../useRecording";
import { fmtBytes, type Battery, type DownloadItem, type DownloadsSnap } from "../../useDownloads";
import type { MediaView } from "../../useMedia";
import { stopwatch, useStopwatchNow } from "../../useStopwatch";
import type { BatSample } from "../../useBatteryHistory";
import { fmtDuration } from "../../useAttention";
import { MediaSection } from "./MediaSection";
import { ICON, Ring, STROKE } from "./primitives";

export const KIND_META: Record<ActivityKind, { icon: LucideIcon; label: () => string }> = {
  rec: { icon: Video, label: () => i("تسجيل جارٍ", "Recording") },
  timer: { icon: Hourglass, label: () => i("مؤقّت", "Timer") },
  stopwatch: { icon: StopwatchIcon, label: () => i("ساعة إيقاف", "Stopwatch") },
  dl: { icon: Download, label: () => i("تنزيل", "Download") },
  media: { icon: Music, label: () => i("الآن يعمل", "Now playing") },
  meeting: { icon: Hourglass, label: () => i("اجتماع", "Meeting") },
  battery: { icon: BatteryCharging, label: () => i("البطارية", "Battery") },
  net: { icon: ArrowDown, label: () => i("الشبكة", "Network") },
};

const accentStyle = (k: ActivityKind): CSSProperties => ({ ["--act" as string]: ACCENT[k] });

// ───────────────────────────── مكوّنات الرسم الصغيرة ─────────────────────────────

/** شريط مراحل أيقوني عام: منجز بلون التمييز · جارٍ مضيء (حلقة) · قادم باهت. */
export function StageBar({ labels, current }: { labels: string[]; current: number }) {
  const st = stageStates(labels.length, current);
  return (
    <div dir="ltr" role="list" className="flex items-center gap-1.5">
      {labels.map((l, n) => (
        <div key={n} role="listitem" aria-label={`${l} — ${st[n]}`} className="flex flex-1 flex-col items-center gap-1">
          <motion.span
            initial={false}
            animate={{ opacity: st[n] === "next" ? 0.3 : 1, scale: st[n] === "now" ? 1.08 : 1 }}
            transition={spring.content}
            className={`act-badge h-5 w-5 ${st[n] === "now" ? "ring-2 ring-[var(--act)]" : ""} ${st[n] === "done" ? "!bg-[var(--act)] !text-black" : ""}`}
          >
            {st[n] === "done" ? <Check size={12} strokeWidth={2.5} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </motion.span>
          <span className="text-[10px] tabular-nums text-white/50">{l}</span>
        </div>
      ))}
    </div>
  );
}

/** سحب للتأكيد (بالماوس) لإجراء حساس: المقبض ينزلق على المسار ويُنفَّذ عند ≥90%، وإلا يعود بنابض. Enter على المقبض بديل لوحة المفاتيح. */
export function SwipeConfirm({ label, onConfirm, icon: Icon = X }: { label: string; onConfirm: () => void; icon?: LucideIcon }) {
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(0);
  const x = useMotionValue(0);
  const fade = useTransform(x, [0, Math.max(1, max)], [1, 0]);
  const THUMB = 36;
  useLayoutEffect(() => {
    const m = () => setMax(Math.max(0, (box.current?.clientWidth ?? 0) - THUMB));
    m();
    if (typeof ResizeObserver === "undefined" || !box.current) return;
    const ro = new ResizeObserver(m);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const settle = (done: boolean) => {
    if (done) { animate(x, max, spring.press); onConfirm(); window.setTimeout(() => animate(x, 0, spring.content), 400); }
    else animate(x, 0, spring.content);
  };
  return (
    <div ref={box} dir="ltr" data-testid="swipe-confirm" className="act-bar-track relative h-9 w-full overflow-hidden rounded-full">
      <motion.span style={{ opacity: fade }} className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-white/70">
        {label}
      </motion.span>
      <motion.button
        role="button"
        aria-label={label}
        drag="x"
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, width: THUMB, height: THUMB }}
        onDragEnd={() => settle(swipeDone(swipeProgress(x.get(), max + THUMB, THUMB)))}
        onKeyDown={(e) => { if (e.key === "Enter") settle(true); }}
        whileTap={{ scale: tap.whileTap.scale }}
        transition={tap.transition}
        className="act-bar-fill absolute inset-y-0 start-0 flex cursor-grab touch-none items-center justify-center rounded-full text-black active:cursor-grabbing"
      >
        <Icon size={ICON.md} strokeWidth={STROKE} />
      </motion.button>
    </div>
  );
}

/** منحنى مصغّر SVG خفيف (بلا مكتبات) لسجلّ قيم؛ أقل من نقطتين ⇒ لا شيء. */
export function Spark({ values, w = 120, h = 32, lo, hi }: { values: number[]; w?: number; h?: number; lo?: number; hi?: number }) {
  const pts = sparkPoints(values, w, h, 3, lo, hi);
  if (!pts) return null;
  const last = pts.split(" ").pop()!.split(",");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden data-testid="spark" className="shrink-0">
      <polyline points={pts} fill="none" stroke="var(--act)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="var(--act)" />
    </svg>
  );
}

// ───────────────────────────── غلاف البطاقة الموحّد ─────────────────────────────

/** غلاف واحد لكل الأنشطة: شارة النوع بلون لمسته + عنوان + (اختياري) مفتاح تبديل، ثم المحتوى، ثم الإجراءات. */
export function ActivityShell({ kind, right, children, footer }: { kind: ActivityKind; right?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const M = KIND_META[kind];
  return (
    <div data-testid={`activity-${kind}`} data-kind={kind} style={accentStyle(kind)} className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <span className="act-badge h-7 w-7"><M.icon size={ICON.md} strokeWidth={STROKE} /></span>
        <span className="text-[12px] text-white/60">{M.label()}</span>
        <span className="ms-auto flex items-center gap-2">{right}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}

const big = "text-[44px] font-bold leading-none tabular-nums";

// ───────────────────────────── بطاقات الأنواع ─────────────────────────────

function RecCard({ elapsed }: { elapsed: number }) {
  return (
    <ActivityShell
      kind="rec"
      right={<span className="island-rec-dot h-2.5 w-2.5 rounded-full bg-[var(--act)]" aria-hidden />}
      footer={<SwipeConfirm label={i("اسحب لإيقاف التسجيل", "Swipe to stop recording")} onConfirm={() => invoke("record_stop").catch(() => {})} icon={Video} />}
    >
      <div className="flex flex-1 flex-col justify-center gap-1">
        <span dir="ltr" className={big}>{fmtElapsed(elapsed)}</span>
        <span className="text-[13px] text-white/60">{i("يُحفظ عند الإيقاف", "Saved when you stop")}</span>
      </div>
    </ActivityShell>
  );
}

function TimerCard({ timer, remaining }: { timer: TimerState; remaining: number }) {
  const p = timer.totalMs > 0 ? remaining / timer.totalMs : 0;
  return (
    <ActivityShell kind="timer">
      <div className="flex flex-1 items-center gap-4">
        <div className="min-w-0 flex-1">
          <span dir="ltr" className={big}>{fmtCountdown(remaining)}</span>
          {timer.label && <div dir="auto" className="mt-1 truncate text-[13px] text-white/70">{timer.label}</div>}
        </div>
        <Ring p={p} size={56} stroke={3.5}>
          <motion.button
            aria-label={i("إلغاء المؤقّت", "Cancel timer")}
            title={i("إلغاء المؤقّت", "Cancel timer")}
            onClick={() => invoke("timer_set", { seconds: null }).catch(() => {})}
            whileHover={tap.whileHover} whileTap={tap.whileTap} transition={tap.transition}
            className="i-btn p-2.5 text-white"
          ><X size={ICON.lg} strokeWidth={STROKE} /></motion.button>
        </Ring>
      </div>
    </ActivityShell>
  );
}

/** جسم ساعة الإيقاف: أرقام كبيرة + تشغيل/إيقاف/تصفير. يُستعمل في بطاقة الرئيسية وفي تبويب الملاحظة. */
export function StopwatchBody({ compact = false }: { compact?: boolean }) {
  const { sw, ms } = useStopwatchNow(true);
  return (
    <div data-testid="stopwatch" style={accentStyle("stopwatch")} className={`flex flex-1 ${compact ? "flex-row items-center gap-4" : "flex-col justify-center gap-4"}`}>
      <span dir="ltr" className={`${big} ${compact ? "" : "text-[52px]"}`} aria-live="off">{fmtStopwatch(ms)}</span>
      <div className="flex items-center gap-2">
        <motion.button
          onClick={stopwatch.toggle} whileHover={tap.whileHover} whileTap={tap.whileTap} transition={tap.transition}
          className="act-btn act-btn-solid"
        >
          {sw.running ? <Pause size={ICON.md} strokeWidth={STROKE} /> : <Play size={ICON.md} strokeWidth={STROKE} />}
          {sw.running ? i("إيقاف مؤقّت", "Pause") : sw.acc > 0 ? i("استئناف", "Resume") : i("ابدأ", "Start")}
        </motion.button>
        <motion.button
          onClick={stopwatch.reset} disabled={!sw.running && sw.acc === 0} whileHover={tap.whileHover} whileTap={tap.whileTap} transition={tap.transition}
          className="act-btn"
        >
          <RotateCcw size={ICON.md} strokeWidth={STROKE} />{i("تصفير", "Reset")}
        </motion.button>
      </div>
    </div>
  );
}

function StopwatchCard() {
  return (
    <ActivityShell kind="stopwatch">
      <StopwatchBody />
    </ActivityShell>
  );
}

const dlLabels = ["25", "50", "75", "100"];

function DownloadCard({ dl }: { dl: DownloadsSnap }) {
  const list = [...dl.active].sort((a, b) => b.size - a.size);
  const d: DownloadItem | undefined = list[0];
  if (!d) return null;
  const stage = downloadStage(d.percent);
  return (
    <ActivityShell
      kind="dl"
      right={list.length > 1 ? <span className="act-badge h-5 px-2 text-[11px] tabular-nums">+{list.length - 1}</span> : undefined}
      footer={<StageBar labels={dlLabels} current={stage} />}
    >
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div dir="auto" className="truncate text-[14px] font-semibold">{d.name}</div>
        <div className="flex items-baseline gap-3">
          <span dir="ltr" className={big}>{d.percent != null ? `${Math.round(d.percent)}%` : fmtBytes(d.size)}</span>
          <span dir="ltr" className="text-[13px] tabular-nums text-white/60">
            {d.total ? `${fmtBytes(d.size)} / ${fmtBytes(d.total)}` : ""}{d.speed > 0 ? ` · ${fmtBytes(d.speed)}/s` : ""}
          </span>
        </div>
        <div className="act-bar-track h-2 overflow-hidden rounded-full">
          <motion.div
            initial={false} animate={{ scaleX: d.percent != null ? d.percent / 100 : 1, opacity: d.percent != null ? 1 : 0.5 }} transition={spring.content}
            style={{ transformOrigin: "left" }} className="act-bar-fill h-full w-full rounded-full"
          />
        </div>
      </div>
    </ActivityShell>
  );
}

/** قالب «نسبة ضخمة + وقت متبقٍّ + شريط سميك» للبطارية، مع منحنى مصغّر لسجلّ النسبة. */
function BatteryCard({ b, hist }: { b: Battery; hist: BatSample[] }) {
  const pct = b.percent ?? 0;
  const dm = (min: number) => fmtDuration(min * 60, i("س", "h"), i("د", "m"));
  const low = pct <= 20 && !b.ac;
  return (
    <ActivityShell kind="battery" right={b.charging ? <Zap size={ICON.md} strokeWidth={STROKE} className="text-[var(--act)]" aria-label={i("يشحن", "Charging")} /> : undefined}>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <div className="flex items-end gap-4">
          <span dir="ltr" className={`${big} text-[56px]`} style={low ? { color: "var(--act-rec)" } : undefined}>{pct}%</span>
          <div className="min-w-0 flex-1 pb-1 text-[13px] text-white/60">
            {b.remaining_min != null && (
              <div dir="auto">{b.charging ? i("حتى الامتلاء ≈ ", "Full in ≈ ") : i("المتبقي ≈ ", "Time left ≈ ")}<bdi className="tabular-nums text-white">{dm(b.remaining_min)}</bdi></div>
            )}
          </div>
          <Spark values={hist.map((s) => s.v)} lo={0} hi={100} />
        </div>
        <div className="act-bar-track h-3.5 overflow-hidden rounded-full">
          <motion.div
            initial={false} animate={{ scaleX: pct / 100 }} transition={spring.content}
            style={{ transformOrigin: "left", background: low ? "var(--act-rec)" : undefined }} className="act-bar-fill h-full w-full rounded-full"
          />
        </div>
      </div>
    </ActivityShell>
  );
}

function MediaCard({ media, showLyrics }: { media: MediaView; showLyrics: boolean }) {
  return (
    <ActivityShell kind="media">
      <MediaSection media={media} showLyrics={showLyrics} />
    </ActivityShell>
  );
}

// ───────────────────────────── الصف الثانوي المضغوط ─────────────────────────────

/** نشاط ثانوي مضغوط أسفل بطاقة الأولوية (حيث يتّسع المكان): شارة + عنوان + قيمة؛ النقر يجعله الأساسي. */
function Secondary({ kind, value, onPick }: { kind: ActivityKind; value: string; onPick: () => void }) {
  const M = KIND_META[kind];
  return (
    <motion.button
      data-testid={`secondary-${kind}`}
      style={accentStyle(kind)}
      onClick={onPick}
      whileHover={tap.whileHover} whileTap={tap.whileTap} transition={tap.transition}
      className="i-card i-card-hover flex h-9 w-full shrink-0 items-center gap-2 px-2.5 text-[12px]"
      aria-label={`${M.label()} — ${value}`}
    >
      <span className="act-badge h-5 w-5"><M.icon size={ICON.sm} strokeWidth={STROKE} /></span>
      <span className="min-w-0 flex-1 truncate text-start text-white/70">{M.label()}</span>
      <span dir="ltr" className="shrink-0 tabular-nums">{value}</span>
    </motion.button>
  );
}

// ───────────────────────────── مكدّس النشاط الحي ─────────────────────────────

export interface LiveData {
  rec: { recording: boolean; elapsed: number };
  timer: TimerState | null;
  remaining: number | null;
  dl: DownloadsSnap;
  media: MediaView;
  showLyrics: boolean;
  battery: Battery | null;
  batteryHist: BatSample[];
}

function Card({ kind, d }: { kind: ActivityKind; d: LiveData }) {
  switch (kind) {
    case "rec": return <RecCard elapsed={d.rec.elapsed} />;
    case "timer": return d.timer && d.remaining != null ? <TimerCard timer={d.timer} remaining={d.remaining} /> : null;
    case "stopwatch": return <StopwatchCard />;
    case "dl": return <DownloadCard dl={d.dl} />;
    case "media": return <MediaCard media={d.media} showLyrics={d.showLyrics} />;
    case "battery": return d.battery ? <BatteryCard b={d.battery} hist={d.batteryHist} /> : null;
    default: return null;
  }
}

/** قيمة قصيرة لنشاط في الصف الثانوي. */
function secondaryValue(kind: ActivityKind, d: LiveData, swMs: number): string {
  switch (kind) {
    case "rec": return fmtElapsed(d.rec.elapsed);
    case "timer": return d.remaining != null ? fmtCountdown(d.remaining) : "";
    case "stopwatch": return fmtStopwatch(swMs, false);
    case "dl": { const x = d.dl.active[0]; return x?.percent != null ? `${Math.round(x.percent)}%` : String(d.dl.active.length); }
    case "media": return d.media.info.playing ? "▶" : "⏸";
    case "battery": return d.battery?.percent != null ? `${d.battery.percent}%` : "";
    default: return "";
  }
}

/**
 * بطاقة النشاط الأولوية (تتصدّر الرئيسية) + نشاط ثانوي مضغوط تحتها حيث يتّسع المكان (غير الميديا، لأنها تحتاج الارتفاع) + مفتاح تبديل.
 * التبديل بين البطاقات: تمويه قصير بتوقيت دخول/خروج مستقل (swapVariants).
 */
export function ActivityStack({ kinds, shown, onPin, data }: { kinds: ActivityKind[]; shown: ActivityKind; onPin: (k: ActivityKind) => void; data: LiveData }) {
  const second = shown === "media" ? null : secondaryKind(kinds, shown);
  const { ms } = useStopwatchNow(false);
  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={shown} variants={swapVariants} initial="initial" animate="animate" exit="exit" className="h-full">
            <Card kind={shown} d={data} />
          </motion.div>
        </AnimatePresence>
      </div>
      {kinds.length > 1 && (
        <div className="absolute end-0 top-0.5 flex items-center gap-1" dir="ltr" data-testid="activity-switch">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => onPin(k)}
              aria-label={KIND_META[k].label()}
              aria-pressed={k === shown}
              className="flex h-4 w-4 items-center justify-center"
            >
              <motion.span
                initial={false}
                animate={{ scale: k === shown ? 1.3 : 1, opacity: k === shown ? 1 : 0.4 }}
                transition={spring.press}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: ACCENT[k] }}
              />
            </button>
          ))}
        </div>
      )}
      <AnimatePresence initial={false}>
        {second && (
          <motion.div key={second} variants={itemVariants} initial="initial" animate="animate" exit="exit" custom={0}>
            <Secondary kind={second} value={secondaryValue(second, data, ms)} onPick={() => onPin(second)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────────── الكبسولة المدمجة المنقسمة ─────────────────────────────

/**
 * الدرجة (2): طرفان — أيقونة/عنوان قصير في طرف، وقيمة/عدّاد في الطرف الآخر — بلون اللمسة نفسه للنوع.
 * البنية LTR؛ النصوص الديناميكية dir="auto".
 */
export function CapsuleSplit({ kind, k, left, value, dots }: { kind: ActivityKind; k: number; left: ReactNode; value: ReactNode; dots?: ReactNode }) {
  const M = KIND_META[kind];
  return (
    <div dir="ltr" data-testid={`capsule-${kind}`} data-kind={kind} style={accentStyle(kind)} className="flex w-full min-w-0 items-center gap-2" >
      <span className="act-badge shrink-0" style={{ width: Math.round(22 * k), height: Math.round(22 * k), marginInlineStart: Math.round(6 * k) }}>
        <M.icon size={Math.round(13 * k)} strokeWidth={STROKE} />
      </span>
      <span dir="auto" className="min-w-0 flex-1 truncate text-start">{left}</span>
      <span className="flex shrink-0 items-center gap-2 tabular-nums" style={{ marginInlineEnd: Math.round(12 * k) }}>
        {value}
        {dots}
      </span>
    </div>
  );
}

/** سرعتا الشبكة في الكبسولة: تحميل/رفع. */
export function NetValue({ down, up }: { down: number; up: number }) {
  return (
    <span dir="ltr" className="flex items-center gap-2 text-[0.92em]">
      <span className="flex items-center gap-0.5"><ArrowDown size={12} strokeWidth={STROKE} />{fmtSpeed(down)}</span>
      <span className="flex items-center gap-0.5 text-white/60"><ArrowUp size={12} strokeWidth={STROKE} />{fmtSpeed(up)}</span>
    </span>
  );
}

