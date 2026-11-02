// منطق المظهر الخالص (بلا واجهة): تحويل الإعدادات إلى متغيرات CSS على <html>، الإعدادات المسبقة، ترحيل الإعدادات القديمة،
// وحساب التباين (WCAG). يُختبر بـ scripts/glass.test.mjs. الواجهة: useSettings.ts::useAppearance.
import { DEFAULTS, type Settings } from "./settings";
import { PILL } from "./tokens";
import { migratePreset, migrateReduce, migrateSpeed, normSpeed, resolveReduce } from "./islandMotion";
import { contrast, deriveTheme, hex6, hexToRgb, luminance, over, type Derived } from "./themeEngine";
import { DEFAULT_PACK, getPack, packInput } from "./themePacks";
export { contrast, luminance, over };

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

/** «sun» = تبديل نهار/ليل تلقائي بدورة الشمس المحلية (06:00–18:00 فاتح) لكل الحزم؛ hour = الساعة المحلية العشرية. */
export const resolveTheme = (mode: unknown, systemDark: boolean, hour?: number): ResolvedTheme =>
  mode === "light" ? "light" : mode === "dark" ? "dark" : mode === "sun" && typeof hour === "number" ? (hour >= 6 && hour < 18 ? "light" : "dark") : systemDark ? "dark" : "light";

const rgb = hexToRgb;
/** لون التمييز: في الفاتح يُغمَّق حتى يبلغ تباينه ≥ 3:1 فوق سطح فاتح؛ النص فوقه أسود/أبيض بحسب الأعلى تباينًا. */
export function accentVars(hex: unknown, theme: ResolvedTheme): { accent: string; accentFg: string } {
  let c = rgb(hex6(hex, "#4fd1c5"));
  if (theme === "light") {
    for (let n = 0; n < 12 && contrast(c, [236, 239, 244]) < 3; n++) c = c.map((v) => Math.round(v * 0.9)) as [number, number, number];
  }
  const fg = contrast(c, [255, 255, 255]) >= contrast(c, [6, 8, 12]) ? "#ffffff" : "#06080c";
  return { accent: `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`, accentFg: fg };
}

/** transparency = «تأثيرات الشفافية» في ويندوز (system_transparency). false ⇒ السطح المُحاكى معتم بالكامل. */
export interface Env {
  systemDark: boolean; eco: boolean; reducedTransparency: boolean; osReducedMotion: boolean; transparency: boolean;
  /** مصادر أكسنت اختيارية (تُجلب فقط عند اختيارها صراحةً): أكسنت ويندوز · لون الخلفية الغالب. */
  winAccent?: string | null; wallpaperAccent?: string | null;
  /** الساعة المحلية العشرية — لحزم/وضع «واعية بالوقت». */
  hour?: number;
}
export const ENV_DEFAULT: Env = { systemDark: true, eco: false, reducedTransparency: false, osReducedMotion: false, transparency: true };

/** الحزمة المختارة للوضع المحلول: تعيين منفصل للداكن والفاتح (فارغ ⇒ themePack العام). */
export function chosenPackId(s: Partial<Settings>, theme: ResolvedTheme): string {
  const specific = theme === "dark" ? s.themePackDark : s.themePackLight;
  return (typeof specific === "string" && specific) || (typeof s.themePack === "string" && s.themePack) || DEFAULT_PACK;
}
/** أكسنت المصدر المختار: pack ⇒ بذرة الحزمة؛ custom ⇒ accentColor؛ windows/wallpaper ⇒ القيمة المجلوبة (سقوط صامت للحزمة إن غابت). */
export function accentOverride(s: Partial<Settings>, env: Env): string | undefined {
  const src = s.accentSource;
  if (src === "custom") return hex6(s.accentColor, "#6d8dff");
  if (src === "windows" && env.winAccent) return hex6(env.winAccent);
  if (src === "wallpaper" && env.wallpaperAccent) return hex6(env.wallpaperAccent);
  return undefined;
}
/** الاشتقاق الكامل للمظهر الحالي (الحزمة ← المحرك). المصدر الوحيد لرموز اللون في كل النوافذ. */
export function deriveFor(s: Partial<Settings>, env: Env): { derived: Derived; packId: string; theme: ResolvedTheme } {
  const theme = resolveTheme(s.themeMode, env.systemDark, env.hour);
  const packId = chosenPackId(s, theme);
  const pack = getPack(packId);
  const derived = deriveTheme(packInput(pack, theme === "dark", { accent: accentOverride(s, env), eco: env.eco, borderStrength: num(s.borderStrength, 0, 100, 50) }));
  return { derived, packId: pack.id, theme };
}

/** هل الزجاج المُحاكى مسموح؟ لا (Eco / تقليل الشفافية / «تأثيرات الشفافية» مطفأة في ويندوز) ⇒ السطح نفسه لكن معتم بالكامل. */
export const glassAllowed = (s: Partial<Settings>, env: Env) => (s.themeMaterial ?? "glass") === "glass" && !env.eco && !env.reducedTransparency && env.transparency !== false;

/** كل خصائص <html>: data-* ومتغيرات CSS الحيّة. */
export function appearanceVars(s: Partial<Settings>, env: Env): { attrs: Record<string, string>; vars: Record<string, string> } {
  const { derived, packId, theme } = deriveFor(s, env);
  const glass = glassAllowed(s, env);
  const style = s.glassStyle === "clear" ? "clear" : "crystal";
  const pw = num(s.pillWidth, PILL.minW, PILL.maxW, PILL.w), ph = num(s.pillHeight, PILL.minH, PILL.maxH, PILL.h);
  const pr = num(s.pillRadius, 0, 22, 0);
  const radius = pr === 0 ? ph / 2 : Math.min(pr, ph / 2);
  const speed = normSpeed(s.motionSpeed);
  return {
    attrs: {
      theme, pack: packId, material: glass ? "glass" : "solid", glass: style, density: s.density === "compact" ? "compact" : "comfortable",
      fallback: (s.themeMaterial ?? "glass") === "glass" && !glass ? "solid" : "",
    },
    vars: {
      ...derived.vars,
      "--border-k": String(num(s.borderStrength, 0, 100, 50) / 50), "--shadow-k": String(num(s.shadowStrength, 0, 100, 50) / 50),
      "--corner-scale": s.cornerStyle === "extra" ? "1.3" : "1", "--font-scale": String(num(s.fontScale, 90, 120, 100) / 100),
      "--speed": String(speed), "--pill-width": `${pw}px`, "--pill-height": `${ph}px`, "--pill-radius": `${radius}px`,
      "--glass-tint": String(num(s.glassTint, 0, 80, 45)),
      "--glass-a": String(glassAlpha(style, theme === "light", num(s.glassTint, 0, 80, 45), s.backgroundOpacity)),
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
/** إعدادات مسبقة: أربعة فقط، كلٌّ منها يرسم فعلًا بشكل مختلف (T04) — الزجاج أكريليك أصلي بصبغة مختلفة، لا blur/saturation (غير فعّالين على ويندوز). */
export const STYLE_PRESETS: { id: string; ar: string; en: string; values: P }[] = [
  { id: "frosted", ar: "زجاج مثلّج", en: "Frosted", values: { themeMaterial: "glass", glassStyle: "crystal", glassTint: 45 } },
  { id: "smoked", ar: "زجاج مدخّن", en: "Smoked", values: { themeMaterial: "glass", glassStyle: "crystal", glassTint: 68 } },
  { id: "clear", ar: "شفاف", en: "Clear", values: { themeMaterial: "glass", glassStyle: "clear", glassTint: 25 } },
  { id: "minimal", ar: "داكن بسيط", en: "Minimal Dark", values: { themeMode: "dark", themeMaterial: "solid", borderStrength: 30, shadowStrength: 30, cornerStyle: "rounded", accentColor: "#94a3b8" } },
];
/** قيم الأسلوب عند اختيار «مثلّج/شفاف» وحدهما (الصبغة فقط). */
export const GLASS_STYLE_VALUES: Record<"crystal" | "clear", P> = {
  crystal: { glassStyle: "crystal", themeMaterial: "glass", glassTint: 45 },
  clear: { glassStyle: "clear", themeMaterial: "glass", glassTint: 25 },
};

/**
 * عتامة الحجاب (0..0.97) من الأسلوب والثيم وglassTint (0–80) وكثافة backgroundOpacity (0.3–1، تضرب النتيجة).
 * crystal: داكن 0.50 + 0.0062·t · فاتح 0.54 + 0.0062·t  ⇒ عند 45: 0.78 / 0.82 (نقطة البداية المعتمدة).
 * clear:   داكن 0.425 + 0.007·t · فاتح 0.465 + 0.007·t ⇒ عند 25: 0.60 / 0.64.   سقف 0.97 (لا مصمت كامل من الشريط).
 */
export function glassAlpha(style: "crystal" | "clear", light: boolean, tint: number, density: unknown = 1): number {
  const t = Math.min(80, Math.max(0, Number.isFinite(tint) ? tint : 45));
  const a = style === "clear" ? (light ? 0.465 : 0.425) + 0.007 * t : (light ? 0.54 : 0.5) + 0.0062 * t;
  const k = typeof density === "number" && Number.isFinite(density) ? Math.min(1, Math.max(0.3, density)) : 1;
  return Math.round(Math.min(0.97, a) * k * 1000) / 1000;
}

/** مفاتيح كل قسم (لزر «إعادة ضبط القسم»). المصدر الوحيد لخريطة الأقسام. */
export const SECTION_KEYS: Record<string, (keyof Settings)[]> = {
  general: ["autostart", "language", "monitor"],
  island: ["pillWidth", "pillHeight", "pillRadius", "peekWidth", "peekHeight", "peekRadius", "panelWidth", "panelHeight", "panelRadius", "hoverDelayMs", "hoverZone", "peekWheelCycle", "peekCardOrder", "panelWheelPaging", "panelTabsStyle", "offsetX", "offsetY", "pillPosition", "islandDocking", "autoHide", "hideInFullscreen", "opacityRest", "opacityOpen", "showClock", "clockFormat", "eyesEnabled", "captureVisible"],
  appearance: ["themeMode", "themePack", "themePackLight", "themePackDark", "accentSource", "themeMaterial", "glassStyle", "glassTint", "backgroundOpacity", "accentMode", "accentColor", "borderStrength", "shadowStrength", "cornerStyle", "fontScale", "density"],
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
  if (v >= 4) return {};
  const patch: P = { settingsVersion: 4 };
  // v4 (الثيمات): من اختار لون تمييز غير الافتراضي القديم ⇒ يبقى مصدر الأكسنت «مخصص» حتى لا يتغيّر لونه مع حزمة Obsidian.
  if (typeof stored.accentColor === "string" && stored.accentColor.toLowerCase() !== "#4fd1c5" && !stored.accentSource) patch.accentSource = "custom";
  if (v >= 3) return patch;
  if (v < 2) {
    if (typeof stored.pillWidth === "number" && stored.pillWidth < PILL.w) patch.pillWidth = PILL.w;
    if (typeof stored.pillHeight === "number" && stored.pillHeight < PILL.h) patch.pillHeight = PILL.h;
  }
  if (!stored.glassStyle) patch.glassStyle = "crystal"; // v<3: الأسلوب مفقود ⇒ crystal (glassTint لا يُمسّ)
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

/** لون وألفا السطح الفعلي خلف النص (وسط الحبة): قاعدة OKLCH المشتقة من حزمة Obsidian (أو المحددة) + عتامة glassAlpha — يُستعمل لاختبار تباين WCAG (scripts/appearance.test.mjs).
 *  الغسلة اللونية طبقة منفصلة فوق القاعدة (وتُقاس في themeEngine ضمن «أسوأ سطح»)، فلا تُمزج هنا. */
export function glassSurface(style: "crystal" | "clear", theme: ResolvedTheme, tint: number, accent?: string, density: unknown = 1, packId: string = DEFAULT_PACK): { color: [number, number, number]; alpha: number } {
  const d = deriveTheme(packInput(getPack(packId), theme === "dark", { accent }));
  return { color: d.base.map((v) => Math.round(v)) as [number, number, number], alpha: glassAlpha(style, theme === "light", tint, density) };
}
