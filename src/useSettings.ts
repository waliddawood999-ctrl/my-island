import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULTS, type Settings } from "./settings";
import { setLang } from "./i18n";
import { useMotionSync } from "./motion";

/** يعكس إعدادات الخلفية (settings_get) ويتحدّث عند settings:changed. الخلفية مصدر الحقيقة.
 *  اللغة: تُطبَّق على i18n أثناء الرسم نفسه، فكل نافذة تعيد رسم نفسها عند تغيّر language عبر الحدث. */
export function useSettings(): Partial<Settings> {
  const [s, setS] = useState<Partial<Settings>>(DEFAULTS);
  useEffect(() => {
    let alive = true;
    invoke<Partial<Settings>>("settings_get")
      .then((v) => { if (alive) setS({ ...DEFAULTS, ...v }); })
      .catch(() => {});
    const un = listen<Partial<Settings>>("settings:changed", (e) =>
      setS((cur) => ({ ...cur, ...e.payload })),
    );
    return () => { alive = false; un.then((f) => f()); };
  }, []);
  setLang(s.language === "en" ? "en" : "ar");
  useMotionSync(s.motionLevel); // مستوى الحركة الفعلي (الإعداد + Eco) لهذه النافذة
  return s;
}

/** يحفظ مقطعًا عبر settings_set (الحدث settings:changed يعيد الرسم في كل النوافذ). */
export const saveSettings = (patch: Partial<Settings>) =>
  invoke("settings_set", { patch }).catch(() => {});
