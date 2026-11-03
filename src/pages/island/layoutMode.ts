// وضع التخطيط التلقائي للوحة (ARCH-UI): عريض/عمودي من مقاس اللوحة الفعلي (الذي يحدّده المستخدم في الإعدادات) — لا يغيّر المقاس نفسه أبدًا.
// PURE-BEGIN
/** عريض ⇔ الارتفاع ≤ 320px والعرض ≥ 2.1× الارتفاع (مثال: 720×300 نعم، 520×290 لا). مدخل غير صالح ⇒ false. */
export function isWideLayout(w: number, h: number): boolean {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  return h <= 320 && w >= h * 2.1;
}
// PURE-END
