// موضع/حجم الساعة وموضع العيون داخل الحبة المنكمشة (ARCH-UI): الموضع الحرّ نسبتان (clockX, clockY ∈ 0..100 من عرض الحبة وارتفاعها) —
// الساعة تُثبَّت بـ left/top + translate(-x%,-y%) فلا تخرج عن حدود الحبة أبدًا مهما كان حجمها (x=0 ⇒ حافتها اليسرى على حافة الحبة، 100 ⇒ اليمنى).
// clockPosition: auto = الترتيب الحالي كما هو · free = حرّ. eyesAlign: auto/center = كما هو · left/right = العيون عند الحافة. clockScale: 60..180٪.
// PURE-BEGIN
export type ClockPosition = "auto" | "free";
export type EyesAlign = "auto" | "left" | "center" | "right";
export const CLOCK_SCALE = { min: 60, max: 180, def: 100 } as const;

export const normClockPosition = (v: unknown): ClockPosition => (v === "free" ? "free" : "auto");
export const normEyesAlign = (v: unknown): EyesAlign => (v === "left" || v === "center" || v === "right" ? v : "auto");
/** نسبة 0..100 صالحة؛ غير الصالح ⇒ def (الوسط). */
export function clampPct(v: unknown, def = 50): number {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : def;
}
/** حجم الساعة ٪ ضمن النطاق؛ غير الصالح ⇒ 100. */
export function clampScale(v: unknown): number {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.min(CLOCK_SCALE.max, Math.max(CLOCK_SCALE.min, Math.round(n))) : CLOCK_SCALE.def;
}
/** خط الساعة (em) أو undefined عند 100٪ (لا تغيير في الأساس). */
export function clockFontSize(scale: unknown): string | undefined {
  const s = clampScale(scale);
  return s === CLOCK_SCALE.def ? undefined : `${s / 100}em`;
}
/** أسلوب التثبيت الحرّ داخل الحبة. */
export function clockAbsStyle(x: unknown, y: unknown): { position: "absolute"; left: string; top: string; transform: string; whiteSpace: "nowrap" } {
  const cx = clampPct(x), cy = clampPct(y);
  return { position: "absolute", left: `${cx}%`, top: `${cy}%`, transform: `translate(-${cx}%, -${cy}%)`, whiteSpace: "nowrap" };
}
/** محاذاة العيون أفقيًا (justify-content) + حشوة صغيرة عند الحافة. */
export function eyesAlignStyle(a: unknown, pad: number): { justifyContent: "center" | "flex-start" | "flex-end"; paddingInline: number } | null {
  const v = normEyesAlign(a);
  if (v === "auto") return null;
  return { justifyContent: v === "left" ? "flex-start" : v === "right" ? "flex-end" : "center", paddingInline: v === "center" ? 0 : Math.max(0, pad) };
}
/** من نقطة سحب داخل الدائرة (nx,ny ∈ [-1,1]) إلى (x,y) نسبتين؛ خارج الدائرة يُقيَّد على محيطها. */
export function padToPct(nx: number, ny: number): { x: number; y: number } {
  let dx = Number.isFinite(nx) ? nx : 0, dy = Number.isFinite(ny) ? ny : 0;
  const r = Math.hypot(dx, dy);
  if (r > 1) { dx /= r; dy /= r; }
  return { x: Math.round(50 + dx * 50), y: Math.round(50 + dy * 50) };
}
/** عكسها: (x,y) ⇒ موضع النقطة داخل الدائرة (نسب 0..100 من قطرها). */
export function pctToPad(x: unknown, y: unknown): { left: number; top: number } {
  const dx = (clampPct(x) - 50) / 50, dy = (clampPct(y) - 50) / 50;
  const r = Math.hypot(dx, dy), k = r > 1 ? 1 / r : 1;
  return { left: 50 + dx * k * 50, top: 50 + dy * k * 50 };
}
// PURE-END
