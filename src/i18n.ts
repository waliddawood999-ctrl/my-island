// نمط الأصل نفسه: النصّان inline في مكان الاستعمال، بلا ملفات ترجمة.
// الأصل: i(روسي, إنجليزي) — نسختك: i(عربي, إنجليزي)
export type Lang = "ar" | "en";
let current: Lang = "ar";
export function setLang(l: Lang) { current = l; }
export function i(ar: string, en: string): string {
  return current === "ar" ? ar : en;
}
// الاستعمال: i(`فتح / إغلاق الجزيرة`, `Open / close the island`)
