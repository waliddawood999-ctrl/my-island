import { useMemo } from "react";
import { Globe2, PartyPopper, Sunset } from "lucide-react";
import { i } from "../../i18n";
import {
  currentSlot, dateLines, daysLabel, fmtClock, goldenHour, prayerLabel, sanitizeWorldClocks, upcomingCountdowns,
  worldCityName, worldClock, type Lang,
} from "../../today";
import { useToday } from "../../useToday";
import type { Settings } from "../../settings";

/** «يومي» (تبويب النظام): هجري/ميلادي، قائمة مواقيت اليوم كاملة، الساعة الذهبية، عدّادات الأحداث، الساعة العالمية. الصلاة القادمة والطقس بلاطتان في الرئيسية. */
export function TodaySection({ settings }: { settings: Partial<Settings> }) {
  const lang: Lang = settings.language === "en" ? "en" : "ar";
  const clock = settings.clockFormat ?? "auto";
  const { info, now } = useToday(settings.prayerCity);
  const d = dateLines(now, lang);
  const slot = info ? currentSlot(info.prayers, now) : null;
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
          <Sunset size={13} className="shrink-0 text-[var(--c-warning)]" />
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
              <PartyPopper size={13} className="shrink-0 text-[var(--c-info)]" />
              <span dir="auto" className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className={`shrink-0 tabular-nums ${c.days <= 1 ? "font-bold text-[var(--c-info)]" : "text-white/60"}`}>{daysLabel(c.days, lang)}</span>
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

    </div>
  );
}
