// تصنيف مصدر الميديا من AUMID (GSMTC `SourceAppUserModelId`) + الاسم الودّي — منطق خالص يُختبر بـscripts/island.test.mjs.
// الصدق أولًا: «YouTube» لا يظهر إلا حين يدلّ المصدر نفسه عليه (تطبيق/PWA/YouTube Music يحمل الاسم في AUMID). جلسات المتصفح
// (Chrome/Edge/…) لا تكشف GSMTC عنوان التبويب ولا الرابط، فلا مؤشر موثوق على أن التبويب YouTube ⇒ نعرض اسم المتصفح ولا نخمّن.
export type SourceKind = "spotify" | "youtube" | "chrome" | "edge" | "firefox" | "brave" | "opera" | "other";
export interface SourceBadgeInfo { kind: SourceKind; label: string; color: string | null }
const NEUTRAL = null; // لون محايد (يُرسم بنص ثانوي)
export function classifySource(aumid: string, friendly: string): SourceBadgeInfo {
  const a = `${aumid} ${friendly}`.toLowerCase();
  if (a.includes("spotify")) return { kind: "spotify", label: "Spotify", color: "#1ed760" };
  if (a.includes("youtube")) return { kind: "youtube", label: "YouTube", color: "#ff3b30" };
  if (a.includes("msedge") || a.includes("microsoftedge") || /\bedge\b/.test(a)) return { kind: "edge", label: "Edge", color: NEUTRAL };
  if (a.includes("chrome")) return { kind: "chrome", label: "Chrome", color: NEUTRAL };
  if (a.includes("firefox")) return { kind: "firefox", label: "Firefox", color: NEUTRAL };
  if (a.includes("brave")) return { kind: "brave", label: "Brave", color: NEUTRAL };
  if (a.includes("opera")) return { kind: "opera", label: "Opera", color: NEUTRAL };
  return { kind: "other", label: friendly || aumid || "", color: NEUTRAL };
}

/** لون الإبراز المستخرج من الغلاف: يرفع تشبّع/سطوع الألوان الباهتة أو المعتمة حتى يقرأ على الخلفية الداكنة (AA للأيقونات ≥3:1 فوق الأسود). */
export function vibrant(rgb: [number, number, number]): string {
  let [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 1e-6) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  s = Math.min(1, Math.max(s, 0.55));
  l = Math.min(0.68, Math.max(l, 0.5));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(R)}${hex(G)}${hex(B)}`;
}
