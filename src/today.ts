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
