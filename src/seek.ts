// منطق خالص لشريط التقديم (P): تحويل الكسر ↔ الثواني، تثبيت الحدود، خطوة لوحة المفاتيح، وتنسيق الزمن. يُختبر في scripts/p.test.mjs.

/** يحصر كسرًا في [0,1] (NaN/∞ ⇒ 0). */
export function clampFrac(f: number): number {
  return Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0;
}

/** كسر الموضع على الشريط من إحداثي المؤشر. عرض غير صالح ⇒ 0. */
export function fracFromPointer(clientX: number, left: number, width: number): number {
  return width > 0 ? clampFrac((clientX - left) / width) : 0;
}

/** الثواني المستهدفة (مقرّبة لعُشر الثانية، أقل بقليل من النهاية كي لا يقفز المصدر للمقطع التالي). مدة غير معروفة ⇒ null. */
export function secondsFromFrac(f: number, duration: number): number | null {
  if (!(duration > 0) || !Number.isFinite(duration)) return null;
  const t = clampFrac(f) * duration;
  return Math.round(Math.min(t, Math.max(0, duration - 0.5)) * 10) / 10;
}

/** خطوة الأسهم/Home/End على الشريط (ثوانٍ): ← → = ±5 · PageUp/PageDown = ±15 · Home/End. غير ذلك ⇒ null. */
export function keySeek(key: string, pos: number, duration: number): number | null {
  if (!(duration > 0)) return null;
  const d = key === "ArrowRight" || key === "ArrowUp" ? 5 : key === "ArrowLeft" || key === "ArrowDown" ? -5 : key === "PageUp" ? 15 : key === "PageDown" ? -15 : 0;
  if (key === "Home") return 0;
  if (key === "End") return secondsFromFrac(1, duration);
  if (d === 0) return null;
  return secondsFromFrac((Math.min(Math.max(0, pos), duration) + d) / duration, duration);
}

/** m:ss (أو h:mm:ss من ساعة فأكثر). */
export function fmtTime(sec: number): string {
  const t = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** هل يدعم المصدر البحث فعلًا؟ (المصدر يعلن + مدة معروفة + ليس نشاطًا صوتيًا بديلًا). */
export function canSeekNow(info: { can_seek: boolean; duration: number; kind: string }): boolean {
  return info.can_seek && info.duration > 0 && info.kind !== "audio";
}
