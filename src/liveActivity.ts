/**
 * نموذج «النشاط الحي» (منطق خالص بلا React — يُختبر بـ scripts/wow.test.mjs):
 * أولوية موحّدة تُطبَّق على الكبسولة المدمجة واللوحة الموسّعة معًا، ولون لمسة واحد لكل نوع، ومساعدات الرسم الخفيفة
 * (حلقة تقدّم، مراحل، منحنى مصغّر، سحب للتأكيد، هيئة تبويب المتصفح). انظر docs/MOTION.md §النشاط الحي.
 */

export type ActivityKind = "rec" | "timer" | "stopwatch" | "media" | "meeting" | "battery" | "net" | "update";

/**
 * ترتيب الأولوية الثابت والمعلن: تسجيل جارٍ ← مؤقّت/ساعة إيقاف ← تحديث متاح ← ميديا مشغّلة ← اجتماع قريب ← بطارية ← سرعتا الشبكة (محيطي).
 * «اجتماع قريب» يُنتجه `upcomingMeeting` من وحدة الاجتماعات (L4) ضمن نافذة `meetingLeadMin` (الافتراضي 15 دقيقة).
 */
export const PRIORITY: readonly ActivityKind[] = ["rec", "timer", "stopwatch", "update", "media", "meeting", "battery", "net"];

export type ActivityInput = Partial<Record<ActivityKind, boolean>>;

/** الأنشطة القائمة بترتيب الأولوية. */
export function activeKinds(inp: ActivityInput): ActivityKind[] {
  return PRIORITY.filter((k) => !!inp[k]);
}

/** النشاط المعروض: التثبيت اليدوي (مفتاح التبديل) إن كان لا يزال قائمًا وإلا الأعلى أولوية؛ لا شيء ⇒ null. */
export function shownKind(kinds: readonly ActivityKind[], pinned: ActivityKind | null): ActivityKind | null {
  if (kinds.length === 0) return null;
  return pinned && kinds.includes(pinned) ? pinned : kinds[0];
}

/** التالي دوريًا بين الأنشطة القائمة (مفتاح التبديل/السحب). */
export function nextKind(kinds: readonly ActivityKind[], cur: ActivityKind | null): ActivityKind | null {
  if (kinds.length === 0) return null;
  const n = cur ? kinds.indexOf(cur) : -1;
  return kinds[(n + 1) % kinds.length];
}

/** النشاط الثانوي المضغوط أسفل البطاقة الأولوية (د2): الأعلى أولوية بعد المعروض. */
export function secondaryKind(kinds: readonly ActivityKind[], shown: ActivityKind | null): ActivityKind | null {
  return kinds.find((k) => k !== shown) ?? null;
}

/** لون اللمسة الواحد لكل نوع (متغيرات CSS في island.css تتبدّل مع الثيم). */
export const ACCENT: Record<ActivityKind, string> = {
  rec: "var(--act-rec)",
  timer: "var(--act-timer)",
  stopwatch: "var(--act-timer)",
  media: "var(--act-media)",
  meeting: "var(--act-meeting)",
  battery: "var(--act-battery)",
  net: "var(--act-net)",
  update: "var(--act-update)",
};

// ───────────────────────────── تقدّم ─────────────────────────────
/** حلقة التقدّم: محيط الدائرة وإزاحة الشرطة لنسبة 0..1. */
export function ringDash(p: number, r: number): { c: number; offset: number } {
  const c = 2 * Math.PI * r;
  const q = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
  return { c, offset: c * (1 - q) };
}

/** نسبة السحب 0..1 لمقبض عرضه thumb داخل مسار عرضه track. */
export function swipeProgress(dx: number, track: number, thumb: number): number {
  const span = Math.max(1, track - thumb);
  return Math.max(0, Math.min(1, dx / span));
}
/** يُؤكَّد الإجراء الحساس عند بلوغ هذه النسبة (سحب بالماوس لا نقرة). */
export const SWIPE_CONFIRM_AT = 0.9;
export const swipeDone = (p: number) => p >= SWIPE_CONFIRM_AT;

// ───────────────────────────── منحنى مصغّر ─────────────────────────────
/** نقاط SVG polyline لسجلّ قيم (0..max) داخل w×h بحشوة pad؛ أقل من نقطتين ⇒ سلسلة فارغة (لا رسم). */
export function sparkPoints(values: readonly number[], w: number, h: number, pad = 2, lo?: number, hi?: number): string {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return "";
  const min = lo ?? Math.min(...v);
  let max = hi ?? Math.max(...v);
  if (max - min < 1e-9) max = min + 1; // خط مستقيم عند ثبات القيم
  const dx = (w - pad * 2) / (v.length - 1);
  return v
    .map((x, n) => `${(pad + n * dx).toFixed(1)},${(pad + (h - pad * 2) * (1 - (x - min) / (max - min))).toFixed(1)}`)
    .join(" ");
}

/** يضيف عيّنة إلى سجلّ محدود الطول، بفاصل أدنى بين العيّنات (ms) كي يعني المنحنى زمنًا لا ضجيج أحداث. */
export function pushSample<T extends { t: number; v: number }>(hist: readonly T[], s: T, minGapMs: number, cap: number): T[] {
  const last = hist[hist.length - 1];
  if (last && s.t - last.t < minGapMs) {
    // نفس الفترة: تحديث آخر عيّنة بالقيمة الأحدث (بلا نمو)
    return last.v === s.v ? (hist as T[]) : [...hist.slice(0, -1), { ...last, v: s.v }];
  }
  return [...hist, s].slice(-cap);
}

// ───────────────────────────── تنسيقات ─────────────────────────────
/** سرعة شبكة بايت/ث ⇒ «1.4 MB/s» (1024). */
export function fmtSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps < 1024) return "0 KB/s";
  const u = ["KB/s", "MB/s", "GB/s"];
  let v = bps / 1024, k = 0;
  while (v >= 1024 && k < u.length - 1) { v /= 1024; k++; }
  return `${v.toFixed(v >= 100 || k === 0 ? 0 : 1)} ${u[k]}`;
}

/** ساعة إيقاف: «م:ث.سس» (أو «س:م:ث» عند الساعة فأكثر)؛ centis=false يحذف الأجزاء (الكبسولة). */
export function fmtStopwatch(ms: number, centis = true): string {
  const t = Math.max(0, Math.floor(ms));
  const h = Math.floor(t / 3_600_000), m = Math.floor((t % 3_600_000) / 60_000), s = Math.floor((t % 60_000) / 1000);
  const c = Math.floor((t % 1000) / 10);
  const p = (n: number) => String(n).padStart(2, "0");
  const base = h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  return centis && h === 0 ? `${base}.${p(c)}` : base;
}

/** حالة ساعة الإيقاف: المنقضي = المتراكم + (الآن − البدء) أثناء الجريان. */
export interface StopwatchState { running: boolean; startedAt: number; acc: number }
export const SW_IDLE: StopwatchState = { running: false, startedAt: 0, acc: 0 };
export const swElapsed = (s: StopwatchState, now: number) => s.acc + (s.running ? Math.max(0, now - s.startedAt) : 0);
export const swStart = (s: StopwatchState, now: number): StopwatchState => (s.running ? s : { running: true, startedAt: now, acc: s.acc });
export const swPause = (s: StopwatchState, now: number): StopwatchState => (s.running ? { running: false, startedAt: 0, acc: swElapsed(s, now) } : s);
export const swReset = (): StopwatchState => SW_IDLE;
/** قائمة بوجود ما يُعرض (جرى أو توقّف بقيمة). */
export const swActive = (s: StopwatchState) => s.running || s.acc > 0;

// ───────────────────────────── اجتماع قريب ─────────────────────────────
/** نافذة «اجتماع قريب» الافتراضية (دقائق قبل البدء)؛ الإعداد `meetingLeadMin`. */
export const MEETING_LEAD_DEFAULT_MIN = 15;
/** بعد البدء يبقى النشاط «الآن» هذه المدة (للانضمام المتأخر) ثم يسقط. */
export const MEETING_GRACE_MS = 5 * 60_000;
export const clampLeadMin = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, Math.min(60, n)) : MEETING_LEAD_DEFAULT_MIN;
};

export interface MeetingLite { id: string; title: string; start: number; end: number }
export interface UpcomingMeeting<T extends MeetingLite = MeetingLite> { item: T; state: "soon" | "now"; minutes: number }

/**
 * أقرب اجتماع داخل النافذة: «soon» من (البدء − lead) حتى البدء، و«now» من البدء حتى البدء + 5 دقائق.
 * `minutes` = الدقائق المتبقية مقرَّبة للأعلى (≥1) في «soon»، و0 في «now». لا شيء داخل النافذة ⇒ null.
 */
export function upcomingMeeting<T extends MeetingLite>(items: readonly T[], now: number, leadMin: number): UpcomingMeeting<T> | null {
  const lead = clampLeadMin(leadMin) * 60_000;
  let best: UpcomingMeeting<T> | null = null;
  for (const m of items) {
    if (!Number.isFinite(m.start)) continue;
    const dt = m.start - now;
    let st: "soon" | "now" | null = null;
    if (dt > 0 && dt <= lead) st = "soon";
    else if (dt <= 0 && -dt < MEETING_GRACE_MS) st = "now";
    if (!st) continue;
    if (!best || m.start < best.item.start) best = { item: m, state: st, minutes: st === "soon" ? Math.max(1, Math.ceil(dt / 60_000)) : 0 };
  }
  return best;
}

/**
 * متى يُعاد الحساب؟ داخل النافذة: كل 30s (للعدّاد بالدقائق)؛ خارجها: عند أقرب دخول للنافذة (بحدّ أقصى 5 دقائق)؛
 * لا اجتماعات قادمة ⇒ null (لا مؤقّت أصلًا).
 */
export function nextMeetingWake(items: readonly MeetingLite[], now: number, leadMin: number): number | null {
  if (upcomingMeeting(items, now, leadMin)) return 30_000;
  const lead = clampLeadMin(leadMin) * 60_000;
  let next = Infinity;
  for (const m of items) if (Number.isFinite(m.start) && m.start - lead > now) next = Math.min(next, m.start - lead - now);
  return next === Infinity ? null : Math.max(1_000, Math.min(next + 50, 5 * 60_000));
}

// ───────────────────────────── مقاسات الكبسولة ─────────────────────────────
/** عرض الكبسولة المدمجة المنقسمة (طرفان) من عرض الحبة الأساسي. */
