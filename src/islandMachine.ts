// آلة حالات الجزيرة (T03): pill ⇄ peek ⇄ panel — منطق خالص مع مجدوِل قابل للحقن، يُختبر بـscripts/island.test.mjs.
//  · enter: من pill تُجدوِل الانتقال إلى peek بعد hoverDelayMs؛ مغادرة قبل انتهاء المهلة تلغيه. الدخول من جديد يلغي أي إغلاق معلّق.
//  · leave: من peek ⇒ pill بعد 300ms؛ من panel ⇒ pill بعد 500ms؛ العودة للجزيرة تلغي الإغلاق.
//  · click: pill/peek ⇒ panel. back (Esc): panel ⇒ peek.
//  · wheel: في peek يبدّل البطاقات (دوران) بخطوة كل 280ms؛ في panel فوق = الصفحة التالية، تحت = السابقة، مع حدّ بلا التفاف؛
//    لا تخطف العجلة من قائمة قابلة للتمرير ما دامت تستطيع التمرير في الاتجاه نفسه.
export type Mode = "pill" | "peek" | "panel";
export const CLOSE_FROM_PEEK_MS = 300;
export const CLOSE_FROM_PANEL_MS = 500;
export const WHEEL_THROTTLE_MS = 280;
export const PEEK_CARDS = ["player", "today", "weather", "timer"] as const;
export type PeekCard = (typeof PEEK_CARDS)[number];

/** ترتيب البطاقات: تبديل (permutation) صالح من البطاقات الأربع؛ أي شيء غير ذلك ⇒ الافتراضي. */
export function normCardOrder(v: unknown): PeekCard[] {
  if (!Array.isArray(v) || v.length !== 4) return [...PEEK_CARDS];
  const set = new Set(v);
  return set.size === 4 && PEEK_CARDS.every((c) => set.has(c)) ? (v as PeekCard[]) : [...PEEK_CARDS];
}

export interface Sched { now(): number; set(fn: () => void, ms: number): unknown; clear(h: unknown): void }
export const realSched: Sched = { now: () => performance.now(), set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export interface MachineCfg { hoverDelayMs: number; wheelCycle: boolean; panelPaging: boolean; cards: PeekCard[]; slowMo: number }
export const DEFAULT_CFG: MachineCfg = { hoverDelayMs: 250, wheelCycle: true, panelPaging: true, cards: [...PEEK_CARDS], slowMo: 1 };
export interface WheelCtx { /** عنصر قابل للتمرير تحت المؤشر ويستطيع التمرير في اتجاه العجلة. */ scrollsFurther?: boolean }

export class IslandMachine {
  mode: Mode = "pill";
  /** فهرس البطاقة الحالية في cfg.cards واتجاه آخر تبديل (+1/−1). */
  card = 0;
  dir = 1;
  page = 0;
  pageCount = 1;
  cfg: MachineCfg;
  private openT: unknown = null;
  private closeT: unknown = null;
  private lastWheel = -Infinity;
  private sched: Sched;
  private onChange: () => void;
  constructor(sched: Sched = realSched, cfg: Partial<MachineCfg> = {}, onChange: () => void = () => {}) {
    this.sched = sched;
    this.onChange = onChange;
    this.cfg = { ...DEFAULT_CFG, ...cfg };
  }
  setCfg(c: Partial<MachineCfg>) {
    this.cfg = { ...this.cfg, ...c };
    if (this.card >= this.cfg.cards.length) this.card = 0;
  }
  private set(m: Mode) { if (m !== this.mode) { this.mode = m; this.onChange(); } }
  private clearOpen() { if (this.openT != null) { this.sched.clear(this.openT); this.openT = null; } }
  private clearClose() { if (this.closeT != null) { this.sched.clear(this.closeT); this.closeT = null; } }

  enter() {
    this.clearClose();
    if (this.mode !== "pill" || this.openT != null) return;
    this.openT = this.sched.set(() => { this.openT = null; this.card = 0; this.set("peek"); }, Math.max(0, this.cfg.hoverDelayMs));
  }
  leave() {
    this.clearOpen();
    this.clearClose();
    if (this.mode === "peek") this.closeT = this.sched.set(() => { this.closeT = null; this.set("pill"); }, CLOSE_FROM_PEEK_MS);
    else if (this.mode === "panel") this.closeT = this.sched.set(() => { this.closeT = null; this.set("pill"); }, CLOSE_FROM_PANEL_MS);
  }
  click() { this.clearOpen(); this.clearClose(); this.set("panel"); }
  back() { this.clearClose(); if (this.mode === "panel") this.set("peek"); }
  collapse() { this.clearOpen(); this.clearClose(); this.set("pill"); }
  setPages(n: number) { this.pageCount = Math.max(1, n); if (this.page >= this.pageCount) this.page = this.pageCount - 1; }
  gotoPage(p: number) { this.page = Math.min(this.pageCount - 1, Math.max(0, p)); }

  /** يعالج العجلة؛ يعيد true إن اعتُبرت مستهلَكة (ليُمنع التمرير الافتراضي). deltaY>0 = عجلة لأسفل. */
  wheel(deltaY: number, ctx: WheelCtx = {}): boolean {
    if (deltaY === 0 || this.mode === "pill") return false;
    if (this.mode === "peek" && !this.cfg.wheelCycle) return false;
    if (this.mode === "panel" && !this.cfg.panelPaging) return false;
    if (ctx.scrollsFurther) return false;
    const t = this.sched.now();
    if (t - this.lastWheel < WHEEL_THROTTLE_MS * Math.max(1, this.cfg.slowMo)) return true; // مبتلَع بالخنق
    if (this.mode === "peek") {
      const n = this.cfg.cards.length;
      if (n < 2) return false;
      this.dir = deltaY > 0 ? 1 : -1;
      this.card = (this.card + this.dir + n) % n;
      this.lastWheel = t; this.onChange();
      return true;
    }
    // panel: فوق = التالية، تحت = السابقة
    const next = deltaY < 0 ? this.page + 1 : this.page - 1;
    const clamped = Math.min(this.pageCount - 1, Math.max(0, next));
    if (clamped === this.page) return false; // عند الحد: لا التفاف ولا ابتلاع
    this.dir = deltaY < 0 ? 1 : -1;
    this.page = clamped; this.lastWheel = t; this.onChange();
    return true;
  }
  get currentCard(): PeekCard { return this.cfg.cards[this.card] ?? "player"; }
  dispose() { this.clearOpen(); this.clearClose(); }
}
