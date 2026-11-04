// وضع التخطيط التلقائي للوحة (ARCH-UI): عريض/عمودي من مقاس اللوحة الفعلي (الذي يحدّده المستخدم في الإعدادات) — لا يغيّر المقاس نفسه أبدًا.
// PURE-BEGIN
/** عريض قصير ⇔ ارتفاع اللوحة أقل من 340px، دون تغيير مقاس المستخدم. مدخل غير صالح ⇒ false. */
export function isWideLayout(w: number, h: number): boolean {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  return h < 340;
}
// PURE-END
