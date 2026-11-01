import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PrayerAt } from "./today";

export interface CityInfo { id: string; ar: string; en: string }
export interface TodayInfo { city: CityInfo; prayers: PrayerAt[]; next_day_at: number }
export interface Weather {
  enabled: boolean; offline: boolean; temp: number; feels: number; humidity: number;
  wind: number; code: number; is_day: boolean; units: "c" | "f"; city: string; fetched_at: number;
}
const WEATHER_REFRESH_MS = 15 * 60_000;

/** مواقيت اليوم + ساعة تدق كل ثانية (للعدّاد)؛ enabled=false ⇒ لا مؤقّت ولا استدعاء. تُعاد القراءة عند تغيّر المدينة أو تجاوز نهاية اليوم. */
export function useToday(city: string | undefined, enabled = true) {
  const [info, setInfo] = useState<TodayInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [enabled]);
  const stale = info !== null && now >= info.next_day_at;
  useEffect(() => {
    if (!enabled) { setInfo(null); return; }
    let alive = true;
    invoke<TodayInfo>("today_get").then((v) => alive && setInfo(v)).catch(() => {});
    return () => { alive = false; };
  }, [city, stale, enabled]);
  return { info, now };
}

/** الطقس الحالي؛ يُجلب فقط عند enabled (showWeather) ويتجدد كل 15 دقيقة ما دام القسم معروضًا. */
export function useWeather(enabled: boolean, city: string | undefined, units: string | undefined) {
  const [w, setW] = useState<Weather | null>(null);
  useEffect(() => {
    if (!enabled) { setW(null); return; }
    let alive = true;
    const load = () => invoke<Weather>("weather_get").then((v) => alive && setW(v)).catch(() => {});
    load();
    const t = window.setInterval(load, WEATHER_REFRESH_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [enabled, city, units]);
  return w;
}
