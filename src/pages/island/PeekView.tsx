import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Calendar, Cloud, CloudOff, Timer as TimerIcon } from "lucide-react";
import { i } from "../../i18n";
import type { Settings } from "../../settings";
import type { MediaView } from "../../useMedia";
import { peekCardVariants } from "../../islandMotion";
import type { PeekCard } from "../../islandMachine";
import { countdown, dateLines, fmtClock, nextPrayer, prayerLabel, weatherKind, weatherLabel, type Lang } from "../../today";
import { useToday, useWeather } from "../../useToday";
import { fmtCountdown } from "../../useNote";
import type { TimerState } from "../../useNote";
import { PlayerPeek } from "./Player";

/** بطاقة غير المشغّل: بلاطة أيقونة 40px مدوّرة بلون الإبراز + قيمة كبيرة tabular + سطر ثانوي خافت. */
function Tile({ icon, value, sub, extra, testid }: { icon: ReactNode; value: string; sub: string; extra?: string; testid: string }) {
  return (
    <div data-testid={testid} style={{ display: "flex", alignItems: "center", gap: 14, height: "100%" }}>
      <div className="pk-tile">{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div dir="auto" className="truncate" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div dir="auto" className="truncate" style={{ fontSize: 12.5, opacity: 0.62 }}>{sub}</div>
        {extra && <div dir="auto" className="truncate" style={{ fontSize: 12, opacity: 0.5, marginTop: 1 }}>{extra}</div>}
      </div>
    </div>
  );
}

function TodayCard({ s, nextMeeting }: { s: Partial<Settings>; nextMeeting: { title: string; start: number } | null }) {
  const lang: Lang = s.language === "en" ? "en" : "ar";
  const { info, now } = useToday(s.prayerCity, true);
  const d = dateLines(now, lang);
  const np = info ? nextPrayer(info.prayers, now) : null;
  const clock = s.clockFormat ?? "auto";
  // «الحدث القادم»: اجتماع إن وُجد (showMeetings) وإلا الصلاة القادمة (بيانات today الحالية دون تعديل حسابها).
  const next = nextMeeting ? `${nextMeeting.title || i("اجتماع", "Meeting")} · ${fmtClock(nextMeeting.start, clock)}`
    : np ? `${prayerLabel(np.id, lang)} · ${fmtClock(np.at, clock)} (${countdown(np.at - now)})` : "";
  return <Tile testid="peek-today" icon={<Calendar size={20} />} value={d.hijri} sub={`${d.weekday} · ${d.gregorian}`} extra={next} />;
}

function WeatherCard({ s }: { s: Partial<Settings> }) {
  const lang: Lang = s.language === "en" ? "en" : "ar";
  const { weather } = useWeather(!!s.showWeather, s.weatherCity, s.weatherUnits);
  if (!s.showWeather) return <Tile testid="peek-weather" icon={<Cloud size={20} />} value="—" sub={i("الطقس مطفأ — فعّله من الإعدادات", "Weather is off — enable it in Settings")} />;
  if (!weather) return <Tile testid="peek-weather" icon={<Cloud size={20} />} value="…" sub={i("جارٍ التحميل", "Loading")} />;
  if (weather.enabled && weather.offline) return <Tile testid="peek-weather-error" icon={<CloudOff size={20} />} value={i("الطقس غير متاح", "Weather unavailable")} sub={weather.error === "eco" ? i("متوقف في وضع التوفير", "Paused in eco mode") : i("تعذّر الاتصال بالإنترنت", "Couldn't reach the internet")} />;
  const unit = weather.units === "f" ? "°F" : "°C";
  return <Tile testid="peek-weather" icon={<Cloud size={20} />} value={`${Math.round(weather.temp)}${unit}`} sub={weatherLabel(weatherKind(weather.code), lang)} extra={`${i("المحسوس", "Feels like")} ${Math.round(weather.feels)}${unit}`} />;
}

function TimerCard({ timer, remaining }: { timer: TimerState | null; remaining: number | null }) {
  return timer && remaining != null && remaining > 0
    ? <Tile testid="peek-timer" icon={<TimerIcon size={20} />} value={fmtCountdown(remaining)} sub={timer.label || i("المؤقّت", "Timer")} />
    : <Tile testid="peek-timer" icon={<TimerIcon size={20} />} value="—" sub={i("لا مؤقّت جارٍ", "No timer running")} />;
}

/** اللمحة: بطاقة واحدة (حسب peekCardOrder) تتبدّل بالعجلة بحركة out/jump/in، مع نقاط الصفحات (نشطة 10×4، غيرها 4×4، 200ms). */
export function PeekView({ cards, index, dir, s, media, accent, reduce, speed, timer, remaining, nextMeeting }: {
  cards: PeekCard[]; index: number; dir: number; s: Partial<Settings>; media: MediaView; accent: string; reduce: boolean; speed: number;
  timer: TimerState | null; remaining: number | null; nextMeeting: { title: string; start: number } | null;
}) {
  const cycle = s.peekWheelCycle ?? true;
  const list = cycle ? cards : cards.slice(0, 1);
  const cur = list[Math.min(index, list.length - 1)] ?? "player";
  const v = peekCardVariants(speed, reduce);
  // نشر dir للخروج: AnimatePresence يحتاج custom محدّثًا قبل إزالة العنصر.
  const [, force] = useState(0);
  useEffect(() => { force((n) => n + 1); }, [dir]);
  return (
    <div data-testid="peek-view" data-card={cur} style={{ position: "relative", width: "100%", height: "100%", padding: "0 18px", display: "flex", flexDirection: "column", justifyContent: "center", ["--player-accent" as string]: accent }}>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={cur} custom={dir} variants={{ exit: v.out, enter: v.enter, show: v.in }} initial="enter" animate="show" exit="exit" style={{ position: "absolute", inset: 0 }}>
            {cur === "player" && <PlayerPeek media={media} s={s} accent={accent} reduce={reduce} visible />}
            {cur === "today" && <TodayCard s={s} nextMeeting={nextMeeting} />}
            {cur === "weather" && <WeatherCard s={s} />}
            {cur === "timer" && <TimerCard timer={timer} remaining={remaining} />}
          </motion.div>
        </AnimatePresence>
      </div>
      {list.length > 1 && (
        <div data-testid="peek-dots" style={{ display: "flex", justifyContent: "center", gap: 4, paddingBottom: 8 }}>
          {list.map((c, n) => <span key={c} className="pk-dot" data-on={n === Math.min(index, list.length - 1)} />)}
        </div>
      )}
    </div>
  );
}
