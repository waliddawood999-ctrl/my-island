import { useMemo } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Globe2, Moon, PartyPopper, Sun, Sunset } from "lucide-react";
import { i } from "../../i18n";
import {
  countdown, currentSlot, dateLines, daysLabel, fmtClock, goldenHour, nextPrayer, prayerLabel, sanitizeWorldClocks, upcomingCountdowns,
  weatherKind, weatherLabel, worldCityName, worldClock, type Lang, type WeatherKind,
} from "../../today";
import { useToday, useWeather } from "../../useToday";
import { useEco } from "../../motion";
import { LottieIcon } from "../../lottie";
import type { Settings } from "../../settings";

const ICONS: Record<WeatherKind, typeof Sun> = {
  clear: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

/** قسم «اليوم» في الرئيسية: هجري/ميلادي، الصلاة القادمة بعدّاد حي، مواقيت اليوم، وطقس المدينة نفسها. */
export function TodaySection({ settings }: { settings: Partial<Settings> }) {
  const lang: Lang = settings.language === "en" ? "en" : "ar";
  const clock = settings.clockFormat ?? "auto";
  const { info, now } = useToday(settings.prayerCity);
  const { eco } = useEco();
  // وضع التوفير يوقف جلب الطقس الدوري (لا weather_get أصلًا)؛ عند إطفائه تعود الدورة تلقائيًا.
  const weather = useWeather(!!settings.showWeather && !eco, settings.prayerCity, settings.weatherUnits);
  const d = dateLines(now, lang);
  const next = info ? nextPrayer(info.prayers, now) : null;
  const slot = info ? currentSlot(info.prayers, now) : null;
  const WIcon = weather && weather.enabled && !weather.offline ? (weather.code <= 1 && !weather.is_day ? Moon : ICONS[weatherKind(weather.code)]) : null;
  // أيقونة Lottie متحركة لحالتين فقط: مشمس (نهارًا) واحتمال مطر (رذاذ)؛ بقية الحالات والليل تبقى Lucide.
  const wk = weather && weather.enabled && !weather.offline ? weatherKind(weather.code) : null;
  const animWeather = wk === "drizzle" || (wk === "clear" && !!weather?.is_day);
  const unit = weather?.units === "f" ? "°F" : "°C";
  // محلي بالكامل: لا شبكة ولا IPC. مفتاحا العرض مطفآن ⇒ لا حساب (الفارغ يمنع Intl).
  const gold = info ? goldenHour(info.prayers, now) : null;
  const minute = Math.floor(now / 60_000);
  const showCounts = settings.showCountdowns ?? true;
  const counts = useMemo(() => (showCounts ? upcomingCountdowns(settings.countdowns, now, 2) : []), [showCounts, settings.countdowns, minute]);
  const clocks = useMemo(() => (settings.showWorldClock ? sanitizeWorldClocks(settings.worldClocks) : []), [settings.showWorldClock, settings.worldClocks]);
  const clockTimes = useMemo(() => clocks.map((z) => worldClock(z, now, clock)), [clocks, clock, minute]);

  return (
    <div className="flex h-full flex-col gap-1.5 text-[12px]">
      <div dir="auto">
        <div className="text-[14px] font-bold leading-tight">{d.hijri}</div>
        <div className="text-white/60">{d.weekday} · {d.gregorian}{info && <span className="text-white/40"> · {lang === "ar" ? info.city.ar : info.city.en}</span>}</div>
      </div>

      {info && next && (
        <div className="rounded-xl bg-white/[0.07] px-3 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-white/60">{i("الصلاة القادمة", "Next prayer")}</span>
            <span dir="ltr" className="tabular-nums text-white/60">{fmtClock(next.at, clock)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-bold">{prayerLabel(next.id, lang)}</span>
            <span dir="ltr" className="text-[18px] font-bold tabular-nums text-[#8ea2ff]">{countdown(next.at - now)}</span>
          </div>
        </div>
      )}

      {info && (
        <ul className="grid grid-flow-col grid-cols-2 grid-rows-3 gap-x-3">
          {info.prayers.slice(0, 6).map((p) => (
            <li key={p.id} className={`flex justify-between gap-1 rounded-md px-1.5 py-px text-[11px] leading-[18px] ${p.id === slot ? "bg-white/10 font-bold" : p.at < now ? "text-white/40" : ""}`}>
              <span>{prayerLabel(p.id, lang)}</span>
              <span dir="ltr" className="tabular-nums">{fmtClock(p.at, clock)}</span>
            </li>
          ))}
        </ul>
      )}

      {info && gold && (
        <div data-testid="golden-hour" className="flex items-center gap-1.5 text-[11px] text-white/70" title={i("الساعة الذهبية للتصوير: الساعة بعد الشروق وقبل الغروب", "Golden hour for photography: the hour after sunrise and before sunset")}>
          <Sunset size={13} className="shrink-0 text-[#f5b041]" />
          <span className="truncate">
            {gold.state === "now"
              ? i("الساعة الذهبية الآن", "Golden hour now")
              : i(gold.phase === "morning" ? "ذهبية الصباح" : "ذهبية المغرب", gold.phase === "morning" ? "Morning golden hour" : "Evening golden hour")}
          </span>
          <span dir="ltr" className="ms-auto shrink-0 tabular-nums text-white/60">{fmtClock(gold.start, clock)}–{fmtClock(gold.end, clock)}</span>
        </div>
      )}

      {counts.length > 0 && (
        <ul data-testid="countdowns" className="flex flex-col gap-0.5 text-[11px]">
          {counts.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5">
              <PartyPopper size={13} className="shrink-0 text-[#8ea2ff]" />
              <span dir="auto" className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className={`shrink-0 tabular-nums ${c.days <= 1 ? "font-bold text-[#8ea2ff]" : "text-white/60"}`}>{daysLabel(c.days, lang)}</span>
            </li>
          ))}
        </ul>
      )}

      {clocks.length > 0 && (
        <ul data-testid="world-clock" className="flex flex-col gap-0.5 text-[11px]">
          {clocks.map((z, n) => {
            const w = clockTimes[n];
            return (
              <li key={z} className="flex items-center gap-1.5">
                <Globe2 size={13} className="shrink-0 text-white/50" />
                <span className="min-w-0 flex-1 truncate">{worldCityName(z, lang)}</span>
                <span dir="ltr" className="shrink-0 tabular-nums">{w.time}{w.dayDelta !== 0 && <sup className="ms-0.5 text-white/50">{w.dayDelta > 0 ? "+1" : "−1"}</sup>}</span>
              </li>
            );
          })}
        </ul>
      )}

      {((settings.showWeather && weather?.offline) || WIcon) && <div className="mt-auto flex items-center gap-2 border-t border-white/10 pt-1.5 text-white/80">
        {settings.showWeather && weather?.offline && (
          <span className="ms-auto flex items-center gap-1 text-white/40" title={i("لا اتصال بالإنترنت", "No internet connection")}><LottieIcon name="offline" size={24} />{i("لا اتصال", "Offline")}</span>
        )}
        {WIcon && weather && (
          <span className="ms-auto flex items-center gap-1.5" title={`${i("المحسوس", "Feels like")} ${Math.round(weather.feels)}${unit} · ${i("الرطوبة", "Humidity")} ${Math.round(weather.humidity)}%`}>
            {animWeather ? <LottieIcon name="weather" size={24} /> : <WIcon size={15} />}
            <span dir="ltr" className="font-bold tabular-nums">{Math.round(weather.temp)}{unit}</span>
            <span className="text-white/60">{weatherLabel(weatherKind(weather.code), lang)}</span>
          </span>
        )}
      </div>}
    </div>
  );
}
