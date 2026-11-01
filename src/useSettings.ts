import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULTS, type Settings } from "./settings";
import { setLang } from "./i18n";
import { setMotionTuning, useMotionSync, useEco } from "./motion";
import { glassVars } from "./glass";
import { appearanceVars, effectiveMotion, glassAllowed, migrateSettings, resolveTheme, type Env } from "./appearance";

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

/** بيئة المظهر: تفضيلات النظام + Eco. */
function useEnv(): Env {
  const { eco } = useEco();
  const systemDark = !useMedia("(prefers-color-scheme: light)"); // الافتراضي داكن إن لم يُعرَف
  const reducedTransparency = useMedia("(prefers-reduced-transparency: reduce)");
  const osReducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  return { systemDark, eco, reducedTransparency, osReducedMotion };
}

/** يطبّق المظهر كله على <html> (data-* + متغيرات CSS من tokens.css) حيًّا بلا إعادة تحميل. */
function useAppearance(s: Partial<Settings>, env: Env) {
  const { attrs, vars } = appearanceVars(s, env);
  const gv = glassVars(s.glassBlur, s.glassSaturation, env.eco);
  const key = JSON.stringify([attrs, vars, gv]);
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(attrs)) { if (v) root.dataset[k] = v; else delete root.dataset[k]; }
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.style.setProperty("--glass-blur", gv.blur);
    root.style.setProperty("--glass-saturate", gv.saturate);
    root.dataset.glassStyle = attrs.glass;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** الثيم الفعلي (system ⇒ تفضيل النظام) وهل الزجاج مسموح (ليس Eco ولا «تقليل الشفافية») — للأكريليك الأصلي في الحبة. */
export function useResolvedTheme(s: Partial<Settings>): { theme: "dark" | "light"; glassOk: boolean } {
  const env = useEnv();
  return { theme: resolveTheme(s.themeMode, env.systemDark), glassOk: glassAllowed(s, env) };
}

let migrated = false;
/** يعكس إعدادات الخلفية (settings_get) ويتحدّث عند settings:changed. الخلفية مصدر الحقيقة.
 *  اللغة: تُطبَّق على i18n أثناء الرسم نفسه، فكل نافذة تعيد رسم نفسها عند تغيّر language عبر الحدث. */
export function useSettings(): Partial<Settings> & { loaded?: boolean } {
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
  const env = useEnv();
  useAppearance(s, env);
  useEffect(() => { setMotionTuning(s.motionSpeed, s.motionPreset, s.motionBounce); }, [s.motionSpeed, s.motionPreset, s.motionBounce]);
  useMotionSync(effectiveMotion(s, env));
  return s;
}

/** يحفظ مقطعًا عبر settings_set (الحدث settings:changed يعيد الرسم في كل النوافذ). */
export const saveSettings = (patch: Partial<Settings>) =>
  invoke("settings_set", { patch }).catch(() => {});
