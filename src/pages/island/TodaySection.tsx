import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun, WifiOff } from "lucide-react";
import { i } from "../../i18n";
import { countdown, currentSlot, dateLines, fmtClock, nextPrayer, prayerLabel, weatherKind, weatherLabel, type Lang, type WeatherKind } from "../../today";
import { useToday, useWeather } from "../../useToday";
import type { Settings } from "../../settings";

const ICONS: Record<WeatherKind, typeof Sun> = {
  clear: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

/** قسم «اليوم» في الرئيسية: هجري/ميلادي، الصلاة القادمة بعدّاد حي، مواقيت اليوم، وطقس المدينة نفسها. */
export function TodaySection({ settings }: { settings: Partial<Settings> }) {
  const lang: Lang = settings.language === "en" ? "en" : "ar";
  const clock = settings.clockFormat ?? "auto";
  const { info, now } = useToday(settings.prayerCity);
  const weather = useWeather(!!settings.showWeather, settings.prayerCity, settings.weatherUnits);
  const d = dateLines(now, lang);
  const next = info ? nextPrayer(info.prayers, now) : null;
  const slot = info ? currentSlot(info.prayers, now) : null;
  const WIcon = weather && weather.enabled && !weather.offline ? (weather.code <= 1 && !weather.is_day ? Moon : ICONS[weatherKind(weather.code)]) : null;
  const unit = weather?.units === "f" ? "°F" : "°C";

  return (
    <div className="flex h-full flex-col gap-2 text-[12px]">
      <div dir="auto">
        <div className="text-[14px] font-bold leading-tight">{d.hijri}</div>
        <div className="text-white/60">{d.weekday} · {d.gregorian}</div>
      </div>

      {info && next && (
        <div className="rounded-xl bg-white/[0.07] px-3 py-2">
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
        <ul className="flex flex-col gap-0.5">
          {info.prayers.slice(0, 6).map((p) => (
            <li key={p.id} className={`flex justify-between rounded-md px-2 py-0.5 ${p.id === slot ? "bg-white/10 font-bold" : p.at < now ? "text-white/40" : ""}`}>
              <span>{prayerLabel(p.id, lang)}</span>
              <span dir="ltr" className="tabular-nums">{fmtClock(p.at, clock)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-white/10 pt-2 text-white/80">
        {info && <span className="truncate text-white/50">{lang === "ar" ? info.city.ar : info.city.en}</span>}
        {settings.showWeather && weather?.offline && (
          <span className="ms-auto flex items-center gap-1 text-white/40" title={i("لا اتصال بالإنترنت", "No internet connection")}><WifiOff size={13} />{i("لا اتصال", "Offline")}</span>
        )}
        {WIcon && weather && (
          <span className="ms-auto flex items-center gap-1.5" title={`${i("المحسوس", "Feels like")} ${Math.round(weather.feels)}${unit} · ${i("الرطوبة", "Humidity")} ${Math.round(weather.humidity)}%`}>
            <WIcon size={15} />
            <span dir="ltr" className="font-bold tabular-nums">{Math.round(weather.temp)}{unit}</span>
            <span className="text-white/60">{weatherLabel(weatherKind(weather.code), lang)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
