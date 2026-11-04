import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import {
  BatteryCharging, Battery as BatteryIcon, Calendar, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudOff, CloudRain, CloudSnow, CloudSun, Moon, RotateCw, Sun, Video,
} from "lucide-react";
import { itemVariants, sectionVariants, tap, useEco } from "../../motion";
import { i } from "../../i18n";
import { countdown, dateLines, fmtClock, nextPrayer, prayerLabel, weatherKind, weatherLabel, type Lang, type WeatherKind } from "../../today";
import { nextMeeting, visibleTiles } from "../../homeTiles";
import { useToday, useWeather } from "../../useToday";
import { PROVIDER_NAME, type Meeting } from "../../useMeetings";
import type { Battery } from "../../useBattery";
import { LottieIcon } from "../../lottie";
import type { Settings } from "../../settings";

const ICONS: Record<WeatherKind, typeof Sun> = {
  clear: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

const tile = "i-card flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2 text-[12px]";

/**
 * صف بلاطات «لمحة» تحت بطاقة النشاط الحي. كل بلاطة تُركَّب (وتُشغَّل بياناتها) فقط عند تفعيلها:
 * الصلاة (showToday) · الطقس (showWeather) · الاجتماع القادم (showMeetings) · البطارية (showBattery + وجود بطارية).
 * لا شيء قائم ⇒ لا عنصر أصلًا (الفراغ الهادئ مقصود). البطاقة التي تعرضها بطاقة النشاط الحي الآن تُخفى هنا منعًا للتكرار.
 */
export function HomeTiles({ settings, meetings, battery, liveShown, wide = false, reference }: {
  settings: Partial<Settings>;
  meetings: readonly Meeting[];
  battery: Battery | null;
  liveShown: string | null;
  /** تخطيط عريض: البلاطات عمود جانبي بدل صف أسفل المشغّل. */
  wide?: boolean;
  /** الرئيسية المرجعية فقط؛ العريض والتبويبات القديمة تبقى بمسارها القائم. */
  reference?: "idle" | "media";
}) {
  const lang: Lang = settings.language === "en" ? "en" : "ar";
  const clock = settings.clockFormat ?? "auto";
  const { eco } = useEco();
  const prayerOn = settings.showToday ?? true;
  // الجلب مشروط بالتفعيل؛ وضع التوفير يوقف جلب الطقس الدوري.
  const { info, now } = useToday(settings.prayerCity, prayerOn);
  const { weather, reload: reloadWeather } = useWeather(!!settings.showWeather, settings.weatherCity, settings.weatherUnits);
  const next = prayerOn && info ? nextPrayer(info.prayers, now) : null;
  const minute = Math.floor(now / 60_000);
  const hijri = useMemo(() => (next ? dateLines(now, lang).hijri : ""), [!!next, lang, Math.floor(now / 3_600_000)]);
  const wOk = !!settings.showWeather && !!weather && weather.enabled && !weather.offline;
  // فشل صريح: لا بيانات (offline) أو Eco بلا ذاكرة مؤقتة ⇒ بلاطة خطأ مع إعادة المحاولة بدل الصمت.
  const wErr = !!settings.showWeather && !!weather && weather.enabled && weather.offline;
  const upcoming = settings.showMeetings ? nextMeeting(meetings, minute * 60_000) : null;
  const batOk = !!settings.showBattery && !!battery?.has_battery && battery.percent != null;

  const kinds = visibleTiles({
    prayer: !!next,
    weather: wOk || wErr,
    meeting: !reference && !!upcoming && liveShown !== "meeting",
    battery: reference !== "idle" && batOk && liveShown !== "battery",
  });
  if (kinds.length === 0) return null;

  const errText = (e?: string) => (e === "eco" ? i("متوقف في وضع التوفير", "Paused in eco mode") : e === "dns" || e === "connect" || e === "network" || e === "timeout" || e === "ipc"
    ? i("تعذّر الاتصال بالإنترنت", "Couldn't reach the internet") : e?.startsWith("http_") ? i("الخدمة لا تستجيب", "The weather service isn't responding") : i("تعذّر قراءة الطقس", "Couldn't read the weather"));
  const wk = wOk && weather ? weatherKind(weather.code) : null;
  const WIcon = wk ? (wk === "clear" && !weather!.is_day ? Moon : ICONS[wk]) : null;
  // Lottie لحالتين فقط: مشمس نهارًا + احتمال مطر (رذاذ)؛ غيرهما Lucide.
  const animWeather = wk === "drizzle" || (wk === "clear" && !!weather?.is_day);
  const unit = weather?.units === "f" ? "°F" : "°C";
  const BatIcon = battery && (battery.charging || battery.ac) ? BatteryCharging : BatteryIcon;
  const lowBat = !!battery && battery.percent != null && battery.percent <= 20 && !battery.ac;

  const render = (k: (typeof kinds)[number]) => {
    switch (k) {
      case "prayer":
        if (reference) return next && (
          <div data-testid="tile-prayer" className="i-card home-tile" dir={lang === "ar" ? "rtl" : "ltr"}>
            <Calendar size={15} /><div className="min-w-0"><span className="block truncate">{prayerLabel(next.id, lang)} <span>{i("بعد", "in")} {Math.ceil((next.at - now) / 60_000)} {i("د", "min")}</span></span>
            {reference === "idle" && <span className="home-tile-sub">{fmtClock(next.at, clock)}</span>}</div>
          </div>
        );
        return next && (
          <div data-testid="tile-prayer" className={tile} dir="auto">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-bold">{prayerLabel(next.id, lang)}</span>
              <span dir="ltr" className="shrink-0 tabular-nums text-white/60">{fmtClock(next.at, clock)}</span>
            </div>
            <span dir="ltr" className="text-[18px] font-bold leading-tight tabular-nums text-[var(--c-info)]">{countdown(next.at - now)}</span>
            <span className="truncate text-[11px] text-white/50">{hijri}</span>
          </div>
        );
      case "weather":
        if (wErr) return (
          <div data-testid="tile-weather-error" className={tile} dir="auto" role="status">
            <div className="flex items-center gap-2"><CloudOff size={18} /><span className="truncate text-[13px] font-bold">{i("الطقس غير متاح", "Weather unavailable")}</span></div>
            <span className="truncate text-white/60">{errText(weather?.error)}</span>
            <button data-testid="weather-retry" onClick={(e) => { e.stopPropagation(); reloadWeather(); }} className="act-btn ms-auto"><RotateCw size={12} />{i("إعادة المحاولة", "Retry")}</button>
          </div>
        );
        if (reference) return WIcon && weather && (
          <div data-testid="tile-weather" className="i-card home-tile" dir={lang === "ar" ? "rtl" : "ltr"}>
            <WIcon size={15} /><div className="min-w-0"><span className="block truncate">{Math.round(weather.temp)}{unit} {weatherLabel(wk!, lang)}</span>
            {reference === "idle" && <span className="home-tile-sub truncate">{weather.city}</span>}</div>
          </div>
        );
        return WIcon && weather && (
          <div data-testid="tile-weather" className={tile} title={`${i("المحسوس", "Feels like")} ${Math.round(weather.feels)}${unit} · ${i("الرطوبة", "Humidity")} ${Math.round(weather.humidity)}%`}>
            <div className="flex items-center gap-2">
              {animWeather ? <LottieIcon name="weather" size={28} /> : <WIcon size={20} />}
              <span dir="ltr" className="text-[20px] font-bold leading-none tabular-nums">{Math.round(weather.temp)}{unit}</span>
            </div>
            <span className="truncate text-white/60">{weatherLabel(wk!, lang)}{weather?.error ? ` · ${i("قديم", "stale")}` : ""}</span>
          </div>
        );
      case "meeting":
        return upcoming && (
          <div data-testid="tile-meeting" className={tile}>
            <span dir="auto" className="truncate text-[13px] font-bold">{upcoming.title || i("اجتماع", "Meeting")}</span>
            <div className="flex items-center gap-2">
              <span dir="ltr" className="tabular-nums text-white/60">{fmtClock(upcoming.start, clock)}</span>
              {upcoming.join && (
                <motion.button
                  onClick={() => invoke("meetings_join", { url: upcoming.join!.url }).catch(() => {})}
                  whileHover={tap.whileHover} whileTap={tap.whileTap} transition={tap.transition}
                  className="act-btn act-btn-solid ms-auto"
                  aria-label={`${i("انضمام", "Join")} ${PROVIDER_NAME[upcoming.join.provider]}`}
                >
                  <Video size={13} />{i("انضمام", "Join")}
                </motion.button>
              )}
            </div>
          </div>
        );
      case "battery":
        if (reference) return battery && (
          <div data-testid="tile-battery" className="i-card home-tile" dir="ltr"><BatIcon size={15} /><span>{battery.percent}%</span></div>
        );
        return battery && (
          <div data-testid="tile-battery" className={tile}>
            <div className="flex items-center gap-2" dir="ltr">
              <BatIcon size={20} className={lowBat ? "text-red-400" : ""} />
              <span className={`text-[20px] font-bold leading-none tabular-nums ${lowBat ? "text-red-400" : ""}`}>{battery.percent}%</span>
            </div>
            <span className="truncate text-white/60">
              {battery.charging ? i("يشحن", "Charging") : battery.ac ? i("موصول بالتيار", "Plugged in") : i("على البطارية", "On battery")}
            </span>
          </div>
        );
    }
  };

  // الأم تدخل بنابض القسم؛ كل بلاطة بتدرّج خفيف (itemVariants) — كلاهما من src/motion.ts ويتبعان motionLevel.
  return (
    <motion.div data-testid="home-tiles" data-reference={reference} dir={reference && lang === "ar" ? "rtl" : "ltr"} custom={1} variants={sectionVariants} initial="initial" animate="animate" className={wide ? "flex w-[36%] shrink-0 flex-col items-stretch gap-2 overflow-y-auto" : "flex shrink-0 items-stretch gap-2"}>
      {kinds.map((k, n) => (
        <motion.div key={k} custom={n} variants={itemVariants} initial="initial" animate="animate" className="flex min-w-0 flex-1">
          {render(k)}
        </motion.div>
      ))}
    </motion.div>
  );
}
