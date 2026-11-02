import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULTS, type Settings } from "./settings";
import { setLang } from "./i18n";
import { setMotionTuning, setPressTap, useMotionSync, useEco } from "./motion";
import { PRESS, normTune } from "./themeTune";
import { appearanceVars, deriveFor, effectiveMotion, fxFor, glassAllowed, migrateSettings, resolveTheme, type Env, type Fx } from "./appearance";
import { resolvePack } from "./themePacks";
import { extractSwatches, type ArtSwatches } from "./artwork";

/** glassTint صالح 0..80 (غير ذلك ⇒ الافتراضي 45). */
export const clampTint = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(80, Math.max(0, Math.round(v))) : 45);

/** استعلام وسائط النظام كمصدر خارجي (يتحدّث مباشرة عند تغيّر تفضيل النظام). */
function useMedia(q: string): boolean {
  const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q) : null;
  return useSyncExternalStore(
    (f) => { mq?.addEventListener("change", f); return () => mq?.removeEventListener("change", f); },
    () => !!mq?.matches,
    () => false,
  );
}

/** «تأثيرات الشفافية» في ويندوز (system_transparency). يُسأل عند التحميل ثم عند أول تفاعل/تركيز بحدّ أدنى 5ث بين النداءات — بلا مؤقّتات.
 *  false ⇒ السطح المُحاكى معتم بالكامل. فشل الأمر (نافذة بلا صلاحية/متصفح) ⇒ true. */
function useSystemTransparency(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let last = 0, alive = true;
    const ask = () => {
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      invoke<boolean>("system_transparency").then((v) => { if (alive) setOn(v !== false); }).catch(() => {});
    };
    ask();
    window.addEventListener("pointerover", ask, { passive: true });
    window.addEventListener("focus", ask);
    document.addEventListener("visibilitychange", ask);
    return () => { alive = false; window.removeEventListener("pointerover", ask); window.removeEventListener("focus", ask); document.removeEventListener("visibilitychange", ask); };
  }, []);
  return on;
}

/** ما تحتاجه الإعدادات من مصادر حيّة (لا نجلب شيئًا غير مطلوب): الحزم المختارة + accentSource + themeMode. */
function liveNeeds(s: Partial<Settings>) {
  const packs = [s.themePack, s.themePackLight, s.themePackDark].map((id) => resolvePack(id, s.themeCustom, s.myThemes));
  return {
    art: packs.some((p) => p.source === "artwork"),
    win: s.accentSource === "windows" || packs.some((p) => p.source === "windows"),
    wall: s.accentSource === "wallpaper",
    hour: s.themeMode === "sun" || packs.some((p) => p.source === "time"),
  };
}

/** مصدر لون خارجي اختياري (أكسنت ويندوز/لون الخلفية): يُسأل عند التفعيل ثم عند focus/visibilitychange بفاصل ≥ 30ث (بلا مؤقّتات)؛ فشل ⇒ null (سقوط صامت). */
function useColorSource(cmd: "system_accent" | "wallpaper_color", on: boolean): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    if (!on) { setV(null); return; }
    let last = 0, alive = true;
    const ask = (force = false) => {
      const now = Date.now();
      if (!force && now - last < 30000) return;
      last = now;
      invoke<string | null>(cmd).then((c) => { if (alive) setV(typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null); }).catch(() => { if (alive) setV(null); });
    };
    const onVis = () => { if (document.visibilityState !== "hidden") ask(); };
    ask(true);
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.removeEventListener("focus", onVis); document.removeEventListener("visibilitychange", onVis); };
  }, [cmd, on]);
  return v;
}

/** سواتش غلاف الوسائط الجارية (Living Artwork فقط): media_now + media:update/media:cover؛ الغلاف يُفكّ مرة لكل تبدّل إلى 40×40 ثم يُحرَّر. بلا جلسة/فشل ⇒ null. */
function useArtworkSwatches(on: boolean): ArtSwatches | null {
  const [sw, setSw] = useState<ArtSwatches | null>(null);
  useEffect(() => {
    if (!on) { setSw(null); return; }
    let alive = true, seq = 0, session = false, raw: string | null = null;
    const apply = async () => {
      const my = ++seq;
      if (!session || !raw) { setSw(null); return; }
      try {
        const img = new Image(); img.decoding = "async"; img.src = raw; await img.decode();
        const c = document.createElement("canvas"); c.width = c.height = 40;
        const g = c.getContext("2d", { willReadFrequently: true });
        if (!g) throw new Error("no 2d");
        g.drawImage(img, 0, 0, 40, 40);
        const d = g.getImageData(0, 0, 40, 40).data;
        img.src = ""; c.width = c.height = 0;
        if (alive && my === seq) setSw(extractSwatches(d));
      } catch { if (alive && my === seq) setSw(null); }
    };
    invoke<{ info: { session: boolean }; cover: string | null }>("media_now").then((n) => { session = !!n?.info?.session; raw = n?.cover ?? null; apply(); }).catch(() => {});
    const u1 = listen<{ session: boolean }>("media:update", (e) => { const was = session; session = !!e.payload?.session; if (was !== session) apply(); });
    const u2 = listen<string | null>("media:cover", (e) => { raw = e.payload ?? null; apply(); });
    return () => { alive = false; u1.then((f) => f()); u2.then((f) => f()); };
  }, [on]);
  return sw;
}

/** الساعة المحلية العشرية — فقط للوضع «sun»/حزم الوقت؛ تُحدَّث كل 10 دقائق (setInterval واحد، لا rAF). */
function useHour(on: boolean): number | undefined {
  const now = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const [h, setH] = useState<number>(now);
  useEffect(() => {
    if (!on) return;
    setH(now());
    const t = window.setInterval(() => setH(now()), 600000);
    return () => window.clearInterval(t);
  }, [on]);
  return on ? h : undefined;
}

/** بيئة المظهر: تفضيلات النظام + Eco + شفافية ويندوز + مصادر الثيم الحيّة (عند الحاجة فقط). */
function useEnv(s: Partial<Settings>): Env {
  const { eco } = useEco();
  const systemDark = !useMedia("(prefers-color-scheme: light)"); // الافتراضي داكن إن لم يُعرَف
  const reducedTransparency = useMedia("(prefers-reduced-transparency: reduce)");
  const osReducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const transparency = useSystemTransparency();
  const need = liveNeeds(s);
  const winAccent = useColorSource("system_accent", need.win);
  const wallpaperAccent = useColorSource("wallpaper_color", need.wall);
  const artwork = useArtworkSwatches(need.art);
  const hour = useHour(need.hour);
  return { systemDark, eco, reducedTransparency, osReducedMotion, transparency, winAccent, wallpaperAccent, artwork, hour };
}

/** يطبّق المظهر كله على <html> (data-* + متغيرات CSS من tokens.css) حيًّا بلا إعادة تحميل. */
function useAppearance(s: Partial<Settings>, env: Env) {
  const { attrs, vars } = appearanceVars(s, env);
  const key = JSON.stringify([attrs, vars]);
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(attrs)) { if (v) root.dataset[k] = v; else delete root.dataset[k]; }
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset.glassStyle = attrs.glass;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** الاشتقاق الحيّ للإعدادات الحالية (للإعدادات: قياسات التباين وسجل التعديلات الآلية). */
export function useDerivedTheme(s: Partial<Settings>) {
  const env = useEnv(s);
  return deriveFor(s, env);
}

/** الثيم الفعلي (system ⇒ تفضيل النظام) وهل الزجاج المُحاكى مسموح (ليس Eco ولا «تقليل الشفافية» ولا شفافية ويندوز مطفأة). */
export function useResolvedTheme(s: Partial<Settings>): { theme: "dark" | "light"; glassOk: boolean } {
  const env = useEnv(s);
  return { theme: resolveTheme(s.themeMode, env.systemDark, env.hour), glassOk: glassAllowed(s, env) };
}

let migrated = false;
/** يعكس إعدادات الخلفية (settings_get) ويتحدّث عند settings:changed. الخلفية مصدر الحقيقة.
 *  اللغة: تُطبَّق على i18n أثناء الرسم نفسه، فكل نافذة تعيد رسم نفسها عند تغيّر language عبر الحدث. */
export function useSettings(): Partial<Settings> & { loaded?: boolean; /** تأثيرات الحزمة غير اللونية (شكل/بطل غلاف) */ fx?: Fx } {
  const [s, setS] = useState<Partial<Settings> & { loaded?: boolean }>(DEFAULTS);
  useEffect(() => {
    let alive = true;
    invoke<Partial<Settings>>("settings_get")
      .then((v) => {
        if (!alive) return;
        setS({ ...DEFAULTS, ...v, loaded: true });
        if (!migrated) { // ترحيل لمرة واحدة (idempotent): v الخام من الخلفية، لا مدموجًا بالافتراضيات
          migrated = true;
          const p = migrateSettings((v ?? {}) as Partial<Settings>);
          if (Object.keys(p).length) saveSettings(p);
        }
      })
      .catch(() => { if (alive) setS((c) => ({ ...c, loaded: true })); });
    const un = listen<Partial<Settings>>("settings:changed", (e) =>
      setS((cur) => ({ ...cur, ...e.payload })),
    );
    return () => { alive = false; un.then((f) => f()); };
  }, []);
  setLang(s.language === "en" ? "en" : "ar");
  const env = useEnv(s);
  useAppearance(s, env);
  useEffect(() => { setMotionTuning(s.motionSpeed, s.motionPreset, s.motionBounce); }, [s.motionSpeed, s.motionPreset, s.motionBounce]);
  useMotionSync(effectiveMotion(s, env));
  const pressKey = normTune(s.themeTune).en.press;
  useEffect(() => { setPressTap(PRESS[pressKey].tap); }, [pressKey]);
  const fx = fxFor(s, env);
  const fxKey = `${fx.hero}|${fx.shape.corner}|${fx.shape.pillR}|${fx.shape.peekR}|${fx.shape.panelR}|${fx.scale.pill}|${fx.scale.panel}`;
  return useMemo(() => ({ ...s, fx }), [s, fxKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** يحفظ مقطعًا عبر settings_set (الحدث settings:changed يعيد الرسم في كل النوافذ). */
export const saveSettings = (patch: Partial<Settings>) =>
  invoke("settings_set", { patch }).catch(() => {});
