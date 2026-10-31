import { normDigits } from "./norm";

export interface QuickTimer { seconds: number; label: string }

const UNITS: Record<string, number> = {
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1, ث: 1, ثانيه: 1, ثواني: 1, ثانية: 1,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60, د: 60, دقيقه: 60, دقايق: 60, دقائق: 60, دقيقة: 60,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, س: 3600, ساعه: 3600, ساعات: 3600, ساعة: 3600,
};

/** «timer 25» · «timer 90s» · «timer 1.5h» · «مؤقت 10 دقائق» · «timer 25 مذاكرة». الافتراضي دقائق. null إن لم يكن أمر مؤقّت صالحًا (1ث..24س). */
export function parseQuickTimer(input: string): QuickTimer | null {
  const s = normDigits(input).replace(/[ً-ٰٟـ]/g, "").trim(); // بلا تشكيل فقط: التسمية تبقى كما كتبها المستخدم
  const m = /^(?:timer|مؤقت|tmr)\s+(\d+(?:[.,]\d+)?)\s*([^\d\s]+)?(?:\s+(.+))?$/iu.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  let unit = 60;
  let label = m[3] ?? "";
  if (m[2]) {
    const u = UNITS[m[2].toLowerCase()];
    if (u) unit = u;
    else label = (m[2] + " " + label).trim(); // ليست وحدة: جزء من التسمية
  }
  const seconds = Math.round(n * unit);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) return null;
  return { seconds, label: label.trim().slice(0, 100) };
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600), mn = Math.floor((sec % 3600) / 60), s = sec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (mn) parts.push(`${mn}m`);
  if (s || !parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}
