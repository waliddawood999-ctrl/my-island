// كشف نوع محتوى عنصر الحافظة النصي بأنماط صريحة (بلا React/Tauri) ← إجراء سياقي واحد. قابل للاختبار:
// npm run test:clip. الأولوية: رابط > لون hex > رقم جوال > تعبير حسابي > نص عادي (ترجمة).
import { calc } from "./pages/island/palette/calc";
import { normDigits } from "./pages/island/palette/norm";

export type ClipAction =
  | { kind: "url"; url: string }
  | { kind: "phone"; digits: string; wa: string }
  | { kind: "hex"; rgb: string }
  | { kind: "calc"; expr: string; result: string }
  | { kind: "text"; translate: string };

/** أقصى طول نص يُمرَّر لعنوان الترجمة (حدّ طول الرابط). */
export const TRANSLATE_MAX = 1500;
/** أقصى طول لتعبير حسابي يُقيَّم من الحافظة. */
const CALC_MAX = 120;

const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i;
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const PHONE_CHARS_RE = /^[+\d\s\-().]+$/;
/** تواريخ كـ 2024-05-01 أو 10/5/2024 ليست عمليات حسابية. */
const DATE_RE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;
const ARABIC_RE = /[\u0600-\u06FF]/g;
const LETTER_RE = /\p{L}/u;

export function detectUrl(text: string): string | null {
  const t = text.trim();
  if (!URL_RE.test(t)) return null;
  const u = /^www\./i.test(t) ? `https://${t}` : t;
  try {
    const p = new URL(u);
    if (p.protocol !== "http:" && p.protocol !== "https:") return null;
    if (!p.hostname.includes(".") && p.hostname !== "localhost") return null;
    return p.href === u || p.href === `${u}/` ? u : p.href;
  } catch {
    return null;
  }
}

/** #rgb / #rgba / #rrggbb / #rrggbbaa ← rgb(...) أو rgba(...). */
export function hexToRgb(text: string): string | null {
  const t = text.trim();
  if (!HEX_RE.test(t)) return null;
  let h = t.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  const n = (k: number) => parseInt(h.slice(k, k + 2), 16);
  if (h.length === 8) {
    const a = Math.round((n(6) / 255) * 1000) / 1000;
    return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${a})`;
  }
  return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
}

/**
 * رقم جوال → أرقام دولية بلا + (لـ wa.me). يقبل: +<8..15 رقم> · 00<8..15> · 05XXXXXXXX (سعودي محلي) ·
 * 9665XXXXXXXX. لا يقبل أرقامًا مجردة قصيرة (5XXXXXXXX) تفاديًا لخلطها بالمبالغ.
 */
export function detectPhone(text: string): string | null {
  const t = normDigits(text).trim();
  if (!PHONE_CHARS_RE.test(t) || t.length > 25) return null;
  const s = t.replace(/[\s\-().]/g, "");
  if ((s.match(/\+/g) ?? []).length > 1 || (s.includes("+") && !s.startsWith("+"))) return null;
  if (/^\+\d{8,15}$/.test(s)) return s.slice(1);
  if (/^00\d{8,15}$/.test(s)) return s.slice(2);
  if (/^05\d{8}$/.test(s)) return `966${s.slice(1)}`;
  if (/^9665\d{8}$/.test(s)) return s;
  return null;
}

/** تعبير حسابي مركّب (عملية واحدة على الأقل) عبر محلّل الحاسبة الآمن نفسه؛ لا تواريخ ولا أرقام مجردة. */
export function detectCalc(text: string): { expr: string; result: string } | null {
  const t = text.trim();
  if (!t || t.length > CALC_MAX || t.includes("\n") || DATE_RE.test(normDigits(t))) return null;
  const c = calc(t);
  return c ? { expr: c.expr, result: c.text } : null;
}

/** ترجمة جوجل: العربي ⇒ إنجليزي، وغيره ⇒ عربي. */
export function translateUrl(text: string): string {
  const t = text.trim().slice(0, TRANSLATE_MAX);
  const letters = t.match(/\p{L}/gu)?.length ?? 0;
  const arabic = t.match(ARABIC_RE)?.length ?? 0;
  const tl = letters > 0 && arabic / letters >= 0.5 ? "en" : "ar";
  return `https://translate.google.com/?sl=auto&tl=${tl}&text=${encodeURIComponent(t)}&op=translate`;
}

export function classifyClip(text: string | null | undefined): ClipAction | null {
  if (!text || !text.trim()) return null;
  const url = detectUrl(text);
  if (url) return { kind: "url", url };
  const rgb = hexToRgb(text);
  if (rgb) return { kind: "hex", rgb };
  const digits = detectPhone(text);
  if (digits) return { kind: "phone", digits, wa: `https://wa.me/${digits}` };
  const c = detectCalc(text);
  if (c) return { kind: "calc", ...c };
  if (LETTER_RE.test(text)) return { kind: "text", translate: translateUrl(text) };
  return null;
}
