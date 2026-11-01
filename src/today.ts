// منطق «اليوم» الخالص (بلا React/Tauri) — قابل للاختبار مباشرة. المواقيت تأتي من الخلفية (today.rs)،
// والتاريخ الهجري من Intl بتقويم أم القرى المضمَّن في WebView2 (بلا شبكة).
export type Lang = "ar" | "en";
export interface PrayerAt { id: string; at: number }
export const PRAYER_IDS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
/** كل مدن السعودية الرئيسية UTC+3 بلا توقيت صيفي — اليوم المدني يُحسب بها لا بتوقيت الجهاز. */
export const TZ = "Asia/Riyadh";

/** تاريخ هجري (أم القرى) وميلادي ليوم `at`، بأرقام لاتينية كساعة الحبة. */
export function dateLines(at: number, lang: Lang): { hijri: string; gregorian: string; weekday: string } {
  const loc = lang === "ar" ? "ar" : "en";
  const d = new Date(at);
  const fmt = (cal: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(`${loc}-u-ca-${cal}-nu-latn`, { timeZone: TZ, ...o }).format(d);
  return {
    hijri: fmt("islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }),
    gregorian: fmt("gregory", { day: "numeric", month: "long", year: "numeric" }),
    weekday: fmt("gregory", { weekday: "long" }),
  };
}

/** الصلاة القادمة بعد `now` (الشروق ليس صلاة فيُتخطى)؛ null إن انتهت القائمة. */
export function nextPrayer(prayers: PrayerAt[], now: number): PrayerAt | null {
  return prayers.find((p) => p.id !== "sunrise" && p.at > now) ?? null;
}

/** الوقت الجاري = آخر موعد (بما فيه الشروق) مرّ اليوم؛ للتمييز في القائمة. */
export function currentSlot(prayers: PrayerAt[], now: number): string | null {
  let cur: string | null = null;
  for (const p of prayers.slice(0, 6)) if (p.at <= now) cur = p.id;
  return cur;
}

/** م:ث أو س:م:ث لعدّاد تنازلي. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

export function prayerLabel(id: string, lang: Lang): string {
  const t: Record<string, [string, string]> = {
    fajr: ["الفجر", "Fajr"], sunrise: ["الشروق", "Sunrise"], dhuhr: ["الظهر", "Dhuhr"],
    asr: ["العصر", "Asr"], maghrib: ["المغرب", "Maghrib"], isha: ["العشاء", "Isha"],
  };
  const v = t[id];
  return v ? v[lang === "ar" ? 0 : 1] : id;
}

/** ساعة:دقيقة بتوقيت الرياض؛ clockFormat: "12" | "24" | auto (12 افتراضيًا للجداول الشرعية). */
export function fmtClock(at: number, clock: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: clock === "24" ? false : true,
  }).format(new Date(at));
}

export type WeatherKind = "clear" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** رمز WMO (Open-Meteo) → صنف مبسّط. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloud";
}

export function weatherLabel(k: WeatherKind, lang: Lang): string {
  const t: Record<WeatherKind, [string, string]> = {
    clear: ["صافٍ", "Clear"], partly: ["غائم جزئيًا", "Partly cloudy"], cloud: ["غائم", "Cloudy"],
    fog: ["ضباب", "Fog"], drizzle: ["رذاذ", "Drizzle"], rain: ["مطر", "Rain"],
    snow: ["ثلج", "Snow"], storm: ["عاصفة رعدية", "Thunderstorm"],
  };
  return t[k][lang === "ar" ? 0 : 1];
}

// ───────────────────────────── الساعة الذهبية (محلية بالكامل) ─────────────────────────────
export const GOLDEN_MS = 60 * 60_000;
export interface Golden { phase: "morning" | "evening"; start: number; end: number; state: "now" | "upcoming" }

/**
 * الساعة الذهبية للتصوير: الساعة بعد الشروق وقبل المغرب (الغروب)، من المواقيت المحسوبة أصلًا لأوقات الصلاة — بلا شبكة.
 * تُعاد النافذة الأقرب التي لم تنتهِ (جارية ⇒ now، وإلا upcoming)؛ انتهت النافذتان ⇒ null.
 */
export function goldenHour(prayers: PrayerAt[], now: number): Golden | null {
  const today = prayers.slice(0, 6);
  const rise = today.find((p) => p.id === "sunrise")?.at;
  const set = today.find((p) => p.id === "maghrib")?.at;
  const wins: Array<{ phase: "morning" | "evening"; start: number; end: number }> = [];
  if (rise !== undefined) wins.push({ phase: "morning", start: rise, end: rise + GOLDEN_MS });
  if (set !== undefined) wins.push({ phase: "evening", start: set - GOLDEN_MS, end: set });
  const w = wins.sort((a, b) => a.start - b.start).find((x) => x.end > now);
  return w ? { ...w, state: now >= w.start ? "now" : "upcoming" } : null;
}

// ───────────────────────────── عدّادات أحداث المستخدم ─────────────────────────────
export interface EventCountdown { id: string; name: string; date: string } // date = YYYY-MM-DD
export const MAX_COUNTDOWNS = 12;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** تاريخ اليوم المدني (YYYY-MM-DD) بتوقيت `TZ`. */
export function civilDate(at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}
const dayNum = (d: string) => { const [y, m, x] = d.split("-").map(Number); return Date.UTC(y, m - 1, x) / 86_400_000; };
export const validDate = (d: unknown): d is string => typeof d === "string" && DATE_RE.test(d) && Number.isFinite(dayNum(d)) && new Date(dayNum(d) * 86_400_000).toISOString().startsWith(d);

/** عدد الأيام من اليوم حتى `date` (0 = اليوم، سالب = مضى)؛ تاريخ غير صالح ⇒ null. */
export function daysUntil(date: string, now: number): number | null {
  if (!validDate(date)) return null;
  return Math.round(dayNum(date) - dayNum(civilDate(now)));
}

/** تنقية القيمة المخزّنة: عناصر صالحة فقط (اسم غير فارغ ≤40، تاريخ صحيح، معرّف نصي)، حتى 12، بلا تكرار معرّف. */
export function sanitizeCountdowns(v: unknown): EventCountdown[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: EventCountdown[] = [];
  for (const x of v) {
    const o = x as Partial<EventCountdown> | null;
    if (!o || typeof o.id !== "string" || typeof o.name !== "string" || !validDate(o.date)) continue;
    const name = o.name.trim().slice(0, 40);
    if (!name || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ id: o.id, name, date: o.date });
    if (out.length >= MAX_COUNTDOWNS) break;
  }
  return out;
}

/** المقبلة فقط (اليوم فصاعدًا) بترتيب الأقرب؛ `limit` للعرض. */
export function upcomingCountdowns(list: unknown, now: number, limit = 2): Array<EventCountdown & { days: number }> {
  return sanitizeCountdowns(list)
    .map((c) => ({ ...c, days: daysUntil(c.date, now) as number }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
}

export function daysLabel(days: number, lang: Lang): string {
  if (days === 0) return lang === "ar" ? "اليوم" : "Today";
  if (days === 1) return lang === "ar" ? "غدًا" : "Tomorrow";
  if (lang === "en") return `${days} days`;
  return days === 2 ? "يومان" : days <= 10 ? `${days} أيام` : `${days} يومًا`;
}

// ───────────────────────────── ساعة عالمية مصغّرة ─────────────────────────────
export interface WorldCity { id: string; ar: string; en: string } // id = اسم IANA
export const WORLD_CITIES: readonly WorldCity[] = [
  { id: "Europe/London", ar: "لندن", en: "London" }, { id: "Europe/Paris", ar: "باريس", en: "Paris" },
  { id: "Europe/Berlin", ar: "برلين", en: "Berlin" }, { id: "Europe/Istanbul", ar: "إسطنبول", en: "Istanbul" },
  { id: "Europe/Moscow", ar: "موسكو", en: "Moscow" }, { id: "Africa/Cairo", ar: "القاهرة", en: "Cairo" },
  { id: "Africa/Casablanca", ar: "الدار البيضاء", en: "Casablanca" }, { id: "Africa/Johannesburg", ar: "جوهانسبرغ", en: "Johannesburg" },
  { id: "Asia/Dubai", ar: "دبي", en: "Dubai" }, { id: "Asia/Baghdad", ar: "بغداد", en: "Baghdad" },
  { id: "Asia/Karachi", ar: "كراتشي", en: "Karachi" }, { id: "Asia/Kolkata", ar: "مومباي", en: "Mumbai" },
  { id: "Asia/Dhaka", ar: "دكا", en: "Dhaka" }, { id: "Asia/Jakarta", ar: "جاكرتا", en: "Jakarta" },
  { id: "Asia/Kuala_Lumpur", ar: "كوالالمبور", en: "Kuala Lumpur" }, { id: "Asia/Singapore", ar: "سنغافورة", en: "Singapore" },
  { id: "Asia/Shanghai", ar: "شنغهاي", en: "Shanghai" }, { id: "Asia/Tokyo", ar: "طوكيو", en: "Tokyo" },
  { id: "Australia/Sydney", ar: "سيدني", en: "Sydney" }, { id: "America/New_York", ar: "نيويورك", en: "New York" },
  { id: "America/Chicago", ar: "شيكاغو", en: "Chicago" }, { id: "America/Los_Angeles", ar: "لوس أنجلوس", en: "Los Angeles" },
  { id: "America/Toronto", ar: "تورنتو", en: "Toronto" }, { id: "America/Sao_Paulo", ar: "ساو باولو", en: "São Paulo" },
];
export const MAX_WORLD_CLOCKS = 2;

export function sanitizeWorldClocks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ok = new Set(WORLD_CITIES.map((c) => c.id));
  return [...new Set(v.filter((x): x is string => typeof x === "string" && ok.has(x)))].slice(0, MAX_WORLD_CLOCKS);
}

export function worldCityName(id: string, lang: Lang): string {
  const c = WORLD_CITIES.find((x) => x.id === id);
  return c ? (lang === "ar" ? c.ar : c.en) : id;
}

/** وقت مدينة عالمية «س:د» + فرق اليوم عن توقيت `TZ` (−1/0/+1). */
export function worldClock(zone: string, now: number, clock: string): { time: string; dayDelta: number } {
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: clock === "24" ? false : true }).format(new Date(now));
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  return { time, dayDelta: Math.round(dayNum(local) - dayNum(civilDate(now))) };
}
