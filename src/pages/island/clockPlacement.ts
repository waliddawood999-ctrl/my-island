// موضع الساعة داخل الحبة المنكمشة (إعداد clockPosition): auto = الترتيب الحالي كما هو · left/right = الساعة على يسار/يمين العيون فيزيائيًا ·
// top/bottom = فوق/تحت العيون (خط أصغر). الارتفاع الصغير جدًا لا يتّسع لصفّين ⇒ يرجع أفقيًا (نفس الجانب إن أمكن).
// PURE-BEGIN
export type ClockPosition = "auto" | "left" | "right" | "top" | "bottom";
export const CLOCK_POSITIONS: readonly ClockPosition[] = ["auto", "left", "right", "top", "bottom"];
/** أدنى ارتفاع حبة (px منطقية) يتّسع لساعة فوق/تحت العيون دون قصّ. */
export const MIN_STACK_H = 34;

export function normClockPosition(v: unknown): ClockPosition {
  return CLOCK_POSITIONS.includes(v as ClockPosition) ? (v as ClockPosition) : "auto";
}
/** التخطيط الفعلي: dir فيزيائي (الحاوية direction:ltr) ؛ stacked ⇒ خط الساعة مصغّر. null ⇒ auto (لا تدخّل). */
export function clockLayout(pos: ClockPosition, pillH: number): { flexDirection: "row" | "row-reverse" | "column" | "column-reverse"; stacked: boolean } | null {
  const p = normClockPosition(pos);
  if (p === "auto") return null;
  const stackedOk = Number.isFinite(pillH) && pillH >= MIN_STACK_H;
  if (p === "left") return { flexDirection: "row-reverse", stacked: false };
  if (p === "right") return { flexDirection: "row", stacked: false };
  if (!stackedOk) return { flexDirection: p === "top" ? "row-reverse" : "row", stacked: false };
  return { flexDirection: p === "top" ? "column-reverse" : "column", stacked: true };
}
// PURE-END
