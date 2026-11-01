// منطق المظهر الخالص (بلا واجهة): تحويل الإعدادات إلى متغيرات CSS على <html>، الإعدادات المسبقة، ترحيل الإعدادات القديمة،
// وحساب التباين (WCAG). يُختبر بـ scripts/glass.test.mjs. الواجهة: useSettings.ts::useAppearance.
import { DEFAULTS, type Settings } from "./settings";
import { PILL } from "./tokens";
import { migratePreset, migrateReduce, migrateSpeed, normSpeed, resolveReduce } from "./islandMotion";

export type ResolvedTheme = "dark" | "light";
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

export const ACCENT_PRESETS: { id: string; hex: string; ar: string; en: string }[] = [
  { id: "teal", hex: "#4fd1c5", ar: "تيل", en: "Teal" },
  { id: "blue", hex: "#4c8dff", ar: "أزرق", en: "Blue" },
  { id: "green", hex: "#34d399", ar: "أخضر", en: "Green" },
  { id: "amber", hex: "#ffb224", ar: "عنبري", en: "Amber" },
  { id: "coral", hex: "#ff6b5e", ar: "مرجاني", en: "Coral" },
  { id: "pink", hex: "#f472b6", ar: "وردي", en: "Pink" },
  { id: "graphite", hex: "#94a3b8", ar: "رمادي", en: "Graphite" },
];

export const resolveTheme = (mode: unknown, systemDark: boolean): ResolvedTheme =>
  mode === "light" ? "light" : mode === "dark" ? "dark" : systemDark ? "dark" : "light";

const hex6 = (h: unknown): string => (typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : "#4fd1c5");
const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (c: [number, number, number]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
/** نسبة التباين WCAG بين لونين [r,g,b]. */
export const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** مزج لون شفاف [r,g,b,a] فوق خلفية معتمة. */
export const over = (fg: [number, number, number, number], bg: [number, number, number]): [number, number, number] =>
  [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])) as [number, number, number];

/** لون التمييز: في الفاتح يُغمَّق حتى يبلغ تباينه ≥ 3:1 فوق سطح فاتح؛ النص فوقه أسود/أبيض بحسب الأعلى تباينًا. */
export function accentVars(hex: unknown, theme: ResolvedTheme): { accent: string; accentFg: string } {
  let c = rgb(hex6(hex));
  if (theme === "light") {
    for (let n = 0; n < 12 && contrast(c, [236, 239, 244]) < 3; n++) c = c.map((v) => Math.round(v * 0.9)) as [number, number, number];
  }
  const fg = contrast(c, [255, 255, 255]) >= contrast(c, [6, 8, 12]) ? "#ffffff" : "#06080c";
  return { accent: `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`, accentFg: fg };
}

export interface Env { systemDark: boolean; eco: boolean; reducedTransparency: boolean; osReducedMotion: boolean }
export const ENV_DEFAULT: Env = { systemDark: true, eco: false, reducedTransparency: false, osReducedMotion: false };

/** هل الزجاج مسموح؟ لا ⇒ سطح مصبوغ شبه مصمت (احتياط). */
export const glassAllowed = (s: Partial<Settings>, env: Env) => (s.themeMaterial ?? "glass") === "glass" && !env.eco && !env.reducedTransparency;

/** كل خصائص <html>: data-* ومتغيرات CSS الحيّة. */
export function appearanceVars(s: Partial<Settings>, env: Env): { attrs: Record<string, string>; vars: Record<string, string> } {
  const theme = resolveTheme(s.themeMode, env.systemDark);
  const glass = glassAllowed(s, env);
  const style = s.glassStyle === "clear" ? "clear" : "crystal";
  const a = accentVars(s.accentColor, theme);
  const pw = num(s.pillWidth, PILL.minW, PILL.maxW, PILL.w), ph = num(s.pillHeight, PILL.minH, PILL.maxH, PILL.h);
  const pr = num(s.pillRadius, 0, 22, 0);
  const radius = pr === 0 ? ph / 2 : Math.min(pr, ph / 2);
  const speed = normSpeed(s.motionSpeed);
  return {
    attrs: {
      theme, material: glass ? "glass" : "solid", glass: style, density: s.density === "compact" ? "compact" : "comfortable",
      fallback: (s.themeMaterial ?? "glass") === "glass" && !glass ? "solid" : "",
    },
    vars: {
      "--accent": a.accent, "--accent-fg": a.accentFg, "--app-accent": a.accent,
      "--border-k": String(num(s.borderStrength, 0, 100, 50) / 50), "--shadow-k": String(num(s.shadowStrength, 0, 100, 50) / 50),
      "--corner-scale": s.cornerStyle === "extra" ? "1.3" : "1", "--font-scale": String(num(s.fontScale, 90, 120, 100) / 100),
      "--speed": String(speed), "--pill-width": `${pw}px`, "--pill-height": `${ph}px`, "--pill-radius": `${radius}px`,
      "--glass-tint": String(num(s.glassTint, 0, 80, 45)),
      "--bg-k": String(Math.min(1, Math.max(0.3, typeof s.backgroundOpacity === "number" && Number.isFinite(s.backgroundOpacity) ? s.backgroundOpacity : 1))),
    },
  };
}

/** الحركة الفعلية: الإعداد + «تقليل الحركة» + تفضيل النظام ⇒ على الأقل reduced. */
export function effectiveMotion(s: Partial<Settings>, env: Env): "full" | "reduced" | "off" {
  const m = s.motionLevel === "off" ? "off" : s.motionLevel === "reduced" ? "reduced" : "full";
  return m === "full" && resolveReduce(migrateReduce(s.reduceMotion), env.osReducedMotion) ? "reduced" : m;
}

type P = Partial<Settings>;
/** إعدادات مسبقة: نقرة واحدة تطبّق مجموعة كاملة. */
export const STYLE_PRESETS: { id: string; ar: string; en: string; values: P }[] = [
  { id: "liquid", ar: "زجاج سائل", en: "Liquid Glass", values: { themeMaterial: "glass", glassStyle: "crystal", glassTint: 38, glassBlur: 32, glassSaturation: 180, borderStrength: 60, shadowStrength: 55, cornerStyle: "extra", accentColor: "#4fd1c5" } },
  { id: "mica", ar: "ميكا فلونت", en: "Fluent Mica", values: { themeMaterial: "glass", glassStyle: "crystal", glassTint: 62, glassBlur: 20, glassSaturation: 110, borderStrength: 40, shadowStrength: 40, cornerStyle: "rounded", accentColor: "#4c8dff" } },
  { id: "minimal", ar: "داكن بسيط", en: "Minimal Dark", values: { themeMode: "dark", themeMaterial: "solid", borderStrength: 30, shadowStrength: 30, cornerStyle: "rounded", accentColor: "#94a3b8" } },
  { id: "clear", ar: "شفاف", en: "Clear", values: { themeMaterial: "glass", glassStyle: "clear", glassTint: 14, glassBlur: 6, glassSaturation: 120, borderStrength: 60, shadowStrength: 25, cornerStyle: "rounded", accentColor: "#4fd1c5" } },
];
/** قيم الأسلوب عند اختيار «بلوري/شفاف» وحدهما. */
export const GLASS_STYLE_VALUES: Record<"crystal" | "clear", P> = {
  crystal: { glassStyle: "crystal", themeMaterial: "glass", glassTint: 38, glassBlur: 32, glassSaturation: 180 },
  clear: { glassStyle: "clear", themeMaterial: "glass", glassTint: 14, glassBlur: 6, glassSaturation: 120 },
};

/** مفاتيح كل قسم (لزر «إعادة ضبط القسم»). المصدر الوحيد لخريطة الأقسام. */
export const SECTION_KEYS: Record<string, (keyof Settings)[]> = {
  general: ["autostart", "language", "monitor"],
  island: ["pillWidth", "pillHeight", "pillRadius", "peekWidth", "peekHeight", "peekRadius", "panelWidth", "panelHeight", "panelRadius", "hoverDelayMs", "hoverZone", "peekWheelCycle", "peekCardOrder", "panelWheelPaging", "panelTabsStyle", "offsetX", "offsetY", "pillPosition", "autoHide", "hideInFullscreen", "opacityRest", "opacityOpen", "showClock", "clockFormat", "eyesEnabled", "captureVisible"],
  appearance: ["themeMode", "themeMaterial", "glassStyle", "glassTint", "glassBlur", "glassSaturation", "backgroundOpacity", "accentMode", "accentColor", "borderStrength", "shadowStrength", "cornerStyle", "fontScale", "density"],
  motion: ["motionLevel", "motionPreset", "motionSpeed", "motionBounce", "reduceMotion"],
  modules: ["showToday", "prayerCity", "showWeather", "weatherCity", "weatherUnits", "showCountdowns", "showWorldClock", "showBattery", "batteryTip", "btBatteries", "showNetSpeed", "clipLimit", "pasteOnClick", "clipExcludedApps", "privacyIndicator", "showVolume", "showMeetings", "screenshotDir", "recordFormat", "recordingFps", "recordingQuality", "recordingDir", "liveRates", "liquidSpectrum", "playerLayout", "visualizer", "showPlaybackTime", "showSourceBadge", "showProgress", "artworkBackdrop", "attentionTracking"],
  notifications: ["soundChoice", "soundVolume", "prayerAlerts", "loadAlert", "meetingLeadMin", "breakReminders", "breakMinutes"],
  shortcuts: ["hotkeyPalette", "hotkeyArea", "hotkeyScreen", "hotkeyRecord", "hotkeyColor"],
  perf: ["ecoMode", "ecoOnBattery"],
  updates: ["updateAutoCheck"],
};

/** ترحيل الإعدادات المخزّنة: يعيد مقطعًا يُحفظ مرة واحدة (فارغ ⇒ لا شيء).
 *  v2: (أ) حبة أصغر من الافتراضي ⇒ تُعاد للافتراضي (تراجع «الانكماش» بعد التحديثات)، (ب) الزجاج الموجود ⇒ glassStyle=crystal، (ج) تثبيت themeMode الصريح. */
export function migrateSettings(stored: P): P {
  const v = typeof stored.settingsVersion === "number" ? stored.settingsVersion : 0;
  if (v >= 3) return {};
  const patch: P = { settingsVersion: 3 };
  if (v < 2) {
    if (typeof stored.pillWidth === "number" && stored.pillWidth < PILL.w) patch.pillWidth = PILL.w;
    if (typeof stored.pillHeight === "number" && stored.pillHeight < PILL.h) patch.pillHeight = PILL.h;
    if (!stored.glassStyle) patch.glassStyle = "crystal";
  }
  // v3 (T03): reduceMotion bool ⇒ نص؛ springStyle/animSpeed ⇒ motionPreset/motionSpeed (الخلفية Rust تُرحّل kv عند الإقلاع؛ هذا للمتبقّي/المستورد).
  const legacy = stored as Record<string, unknown>;
  if (typeof stored.reduceMotion === "boolean") patch.reduceMotion = migrateReduce(stored.reduceMotion);
  if ("springStyle" in legacy) patch.motionPreset = migratePreset(legacy.springStyle);
  if ("animSpeed" in legacy) patch.motionSpeed = migrateSpeed(legacy.animSpeed);
  return patch;
}

/** تصدير/استيراد الإعدادات (JSON): الأسرار ليست في الإعدادات أصلًا (DPAPI منفصل). الاستيراد يقبل مفاتيحًا معروفة بنفس النوع فقط. */
export function exportSettings(s: P): string {
  return JSON.stringify({ app: "myisland", version: 2, settings: s }, null, 2);
}
export function parseImport(text: string, current: P): P | null {
  try {
    const j = JSON.parse(text) as { app?: string; settings?: Record<string, unknown> };
    if (j?.app !== "myisland" || !j.settings || typeof j.settings !== "object") return null;
    const known = { ...DEFAULTS, ...current } as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(j.settings)) {
      if (!(k in known)) continue;
      const d = known[k];
      if (Array.isArray(d) ? Array.isArray(v) : typeof d === typeof v) out[k] = v;
    }
    return out as P;
  } catch { return null; }
}

/** قيم افتراضية كاملة لكل مفتاح تغطيه SECTION_KEYS (DEFAULTS جزئي): تُستعمل لـ«إعادة ضبط القسم/الكل». */
export const FULL_DEFAULTS: P = {
  ...DEFAULTS,
  autostart: false, monitor: 0, offsetX: 0, autoHide: false, hideInFullscreen: false, showClock: true,
  opacityRest: 100, opacityOpen: 100, liquidSpectrum: false,
  showWeather: false, weatherUnits: "c", showBattery: false, showNetSpeed: false, clipLimit: 200, pasteOnClick: true, clipExcludedApps: [],
  privacyIndicator: false, showVolume: true, showMeetings: false, captureVisible: false, screenshotDir: "", recordingDir: ""
};
/** مقطع إعادة الضبط لقائمة مفاتيح. */
export const resetPatch = (keys: (keyof Settings)[]): P => Object.fromEntries(keys.map((k) => [k, (FULL_DEFAULTS as Record<string, unknown>)[k]])) as P;

/** لون وألفا السطح الفعلي خلف النص (وسط الحبة) — مرآة لقيم island.css/backdrop.rs، يُستعمل لاختبار تباين WCAG (scripts/appearance.test.mjs). */
export function glassSurface(style: "crystal" | "clear", theme: ResolvedTheme, tint: number): { color: [number, number, number]; alpha: number } {
  const t = Math.min(80, Math.max(0, tint));
  const dark = theme === "dark";
  if (style === "crystal") {
    const alpha = dark ? 0.28 + 0.0075 * t : Math.min(0.32 + 0.0075 * t, 0.92);
    return { color: dark ? [0, 0, 0] : [236, 239, 243], alpha };
  }
  const alpha = dark ? 0.30 + 0.0086 * t : 0.36 + 0.01 * t; // صبغة مسطّحة واحدة (island.css)
  return { color: dark ? [0, 0, 0] : [255, 255, 255], alpha };
}
