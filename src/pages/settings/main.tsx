import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import "../../index.css";
import { i } from "../../i18n";
import { saveSettings, useSettings } from "../../useSettings";
import { EcoIndicator, RamUsage } from "./Perf";
import { WorkspacesEditor } from "./Workspaces";
import { CountdownsEditor, WorldClockEditor } from "./TodayExtras";
import { clampGlassBlur, clampGlassSaturation } from "../../glass";
import { manualCheck } from "../../useUpdater";
import type { ManualStatus } from "../../updater";
import { Blocks, Gauge, Palette, SlidersHorizontal } from "lucide-react";
import { Group, LinesField, NumberField, Row, Section, Select, SideNav, Slider, SubHead, TextField, Toggle } from "./fields";

interface CityOpt { id: string; ar: string; en: string }
interface MonitorInfo { index: number; name: string; width: number; height: number; primary: boolean }

/** رابط iCal الخاص: سرّ يُحفظ مشفّرًا (DPAPI) في الخلفية؛ الحقل لا يعرض القيمة المحفوظة أبدًا. */
function MeetingsKey() {
  const [isSet, setIsSet] = useState(false);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { invoke<{ set: boolean }>("meetings_key_status").then((r) => setIsSet(r.set)).catch(() => {}); }, []);
  const save = (url: string) =>
    invoke<{ set: boolean }>("meetings_key_set", { url })
      .then((r) => {
        setIsSet(r.set); setVal("");
        setMsg(r.set ? i("حُفظ الرابط مشفّرًا", "Link saved (encrypted)") : i("حُذف الرابط", "Link removed"));
        if (r.set) invoke("meetings_refresh").catch(() => {});
      })
      .catch((e) => setMsg(String(e) === "https_only" ? i("يجب أن يبدأ الرابط بـ https أو webcal", "The link must start with https or webcal") : i("رابط غير صالح", "Invalid link")));
  return (
    <div className="flex flex-col gap-2">
      <Row label={i("رابط iCal الخاص بالتقويم", "Private iCal link")} hint={isSet ? i("محفوظ ومشفّر — الصق رابطًا جديدًا لاستبداله", "Saved & encrypted — paste a new link to replace it") : i("من إعدادات التقويم: «العنوان السرّي بصيغة iCal»", "From your calendar settings: “Secret address in iCal format”")}>
        <div className="flex items-center gap-2">
          <input
            type="password" dir="ltr" autoComplete="off" spellCheck={false}
            aria-label={i("رابط iCal الخاص بالتقويم", "Private iCal link")}
            value={val} onChange={(e) => setVal(e.target.value)}
            placeholder={isSet ? "••••••••••••" : "https://…/basic.ics"}
            className="w-56 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs outline-none focus:border-[#6f86ff]"
          />
          <button disabled={!val.trim()} onClick={() => save(val)} className="rounded-md bg-[#6f86ff] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">{i("حفظ", "Save")}</button>
          {isSet && <button onClick={() => save("")} className="rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20">{i("حذف", "Remove")}</button>}
        </div>
      </Row>
      {msg && <div role="status" dir="auto" className="text-xs text-white/60">{msg}</div>}
    </div>
  );
}

/** زر «التحقق من التحديثات»: الحالة تُعرض في مكانها (يتحقق… / أنت على أحدث إصدار / تعذّر التحقق / يوجد إصدار). */
const RELEASES_REPO = "https://github.com/waliddawood999-ctrl/my-island-releases";

/** «حول»: الإصدار من حزمة التطبيق (نفس رقم CI في tauri.conf.json) + المطوّر + روابط المستودع العام للإصدارات. عرض فقط. */
function AboutSection() {
  const [ver, setVer] = useState("");
  useEffect(() => {
    getVersion().then(setVer).catch(() => {});
  }, []);
  const open = (url: string) => () => { invoke("open_path", { path: url }).catch(() => {}); };
  const link = "rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20";
  return (
    <Section title={i("حول", "About")}>
      <Row label={i("الإصدار الحالي", "Current version")}>
        <span dir="ltr" className="text-sm tabular-nums text-white/80" data-testid="about-version">{ver || "—"}</span>
      </Row>
      <Row label={i("طُوِّر بواسطة وليد", "Developed by Walid")}>
        <span />
      </Row>
      <div className="flex gap-2">
        <button className={link} data-testid="about-whatsnew" onClick={open(`${RELEASES_REPO}/releases`)}>{i("ما الجديد", "What's new")}</button>
        <button className={link} data-testid="about-github" onClick={open(RELEASES_REPO)}>GitHub</button>
      </div>
    </Section>
  );
}

function UpdateCheck() {
  const [st, setSt] = useState<ManualStatus>("idle");
  const [ver, setVer] = useState("");
  const run = async () => {
    setSt("checking");
    const r = await manualCheck();
    setVer(r.version ?? "");
    setSt(r.status);
  };
  const msg =
    st === "checking" ? i("يتحقق…", "Checking…")
    : st === "latest" ? i("أنت على أحدث إصدار", "You're up to date")
    : st === "failed" ? i("تعذّر التحقق", "Couldn't check")
    : st === "available" ? i(`يوجد إصدار ${ver} — يظهر في الجزيرة`, `Version ${ver} is available — shown in the island`)
    : "";
  return (
    <Row label={i("التحقق من التحديثات", "Check for updates")}>
      <div className="flex items-center gap-2">
        <button
          data-testid="update-check" disabled={st === "checking"} onClick={run}
          className="rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
        >{i("التحقق من التحديثات", "Check for updates")}</button>
        {msg && <span role="status" data-testid="update-status" dir="auto" className="text-xs text-white/60">{msg}</span>}
      </div>
    </Row>
  );
}

/** «إغلاق الجزيرة»: تأكيد على خطوتين داخل الزر نفسه (نقرة أولى ⇒ «متأكد؟ إغلاق»، ثانية ⇒ app_quit). يعود تلقائيًا بعد 4 ثوانٍ أو بفقد التركيز. */
function QuitButton() {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = window.setTimeout(() => setSure(false), 4000);
    return () => window.clearTimeout(t);
  }, [sure]);
  return (
    <button
      data-testid="quit-btn" data-armed={sure ? "true" : "false"}
      onClick={() => { if (sure) invoke("app_quit").catch(() => {}); else setSure(true); }}
      onBlur={() => setSure(false)}
      className={`ms-auto rounded-md px-3 py-1 text-xs font-semibold ${sure ? "bg-red-600 text-white" : "bg-white/10 text-white hover:bg-white/20"}`}
    >{sure ? i("متأكد؟ إغلاق", "Sure? Quit") : i("إغلاق الجزيرة", "Quit island")}</button>
  );
}

function App() {
  const s = useSettings();
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [cities, setCities] = useState<CityOpt[]>([]);
  useEffect(() => {
    invoke<MonitorInfo[]>("monitors_list").then(setMonitors).catch(() => {});
    invoke<CityOpt[]>("today_cities").then(setCities).catch(() => {});
  }, []);
  const [tab, setTab] = useState("general");
  const pct = (v: number) => `${v}%`;
  const ms = (v: number) => `${v} ms`;
  const px = (v: number) => `${v} px`;

  return (
    <div dir="auto" className="mx-auto max-w-4xl px-5 pb-8 text-white">
      <header className="sticky top-0 z-20 -mx-5 flex h-12 items-center gap-3 bg-[var(--app-bg)] px-5" data-testid="settings-bar">
        <h1 className="text-xl font-bold">{i("الإعدادات", "Settings")}</h1>
        <QuitButton />
      </header>

      <div className="flex gap-5">
      <SideNav
        current={tab}
        onSelect={setTab}
        items={[
          { id: "general", label: i("عام", "General"), icon: <SlidersHorizontal size={16} /> },
          { id: "look", label: i("المظهر والميديا", "Appearance & media"), icon: <Palette size={16} /> },
          { id: "modules", label: i("الوحدات", "Modules"), icon: <Blocks size={16} /> },
          { id: "perf", label: i("الأداء والتوفير", "Performance"), icon: <Gauge size={16} /> },
        ]}
      />
      <main className="min-w-0 flex-1">
      {tab === "general" && (
      <Group id="general" title={i("عام", "General")}>
      <Section title={i("التحديثات", "Updates")}>
        <Row label={i("فحص التحديثات تلقائيًا", "Check for updates automatically")} hint={i("فحص صامت واحد بعد الإقلاع؛ لا يظهر شيء إن لم يوجد تحديث", "One silent check after launch; nothing shows if there is no update")}>
          <Toggle label={i("فحص التحديثات تلقائيًا", "Check for updates automatically")} value={s.updateAutoCheck ?? true} onChange={(v) => saveSettings({ updateAutoCheck: v })} />
        </Row>
        <UpdateCheck />
      </Section>
      <AboutSection />
      <Section title={i("التشغيل والموضع", "Startup & position")}>
        <Row label={i("التشغيل مع ويندوز", "Start with Windows")}>
          <Toggle label={i("التشغيل مع ويندوز", "Start with Windows")} value={s.autostart ?? false} onChange={(v) => saveSettings({ autostart: v })} />
        </Row>
        <Row label={i("اللغة", "Language")}>
          <Select
            label={i("اللغة", "Language")} value={s.language === "en" ? "en" : "ar"}
            options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]}
            onChange={(v) => saveSettings({ language: v })}
          />
        </Row>
        <Row label={i("الشاشة", "Monitor")}>
          <Select
            label={i("الشاشة", "Monitor")} value={s.monitor ?? 0}
            options={(monitors.length ? monitors : [{ index: 0, name: "", width: 0, height: 0, primary: true }]).map((m) => ({
              value: m.index,
              label: `${m.index + 1}${m.width ? ` — ${m.width}×${m.height}` : ""}${m.primary ? ` (${i("الرئيسية", "primary")})` : ""}`,
            }))}
            onChange={(v) => saveSettings({ monitor: v })}
          />
        </Row>
        <Row label={i("الإزاحة الأفقية", "Horizontal offset")} hint={i("عن منتصف الشاشة", "From screen center")}>
          <Slider label={i("الإزاحة الأفقية", "Horizontal offset")} value={s.offsetX ?? 0} min={-800} max={800} step={10} format={px} onCommit={(v) => saveSettings({ offsetX: v })} />
        </Row>
        <Row label={i("تحت شريط المهام", "Under the taskbar")} hint={i("من حافة الشاشة الفعلية بدل منطقة العمل", "From the physical screen edge instead of the work area")}>
          <Toggle label={i("تحت شريط المهام", "Under the taskbar")} value={s.underTaskbar ?? false} onChange={(v) => saveSettings({ underTaskbar: v })} />
        </Row>
      </Section>
      <Section title={i("السلوك", "Behavior")}>
        <Row label={i("تأخير الفتح بالمرور", "Hover delay")}>
          <Slider label={i("تأخير الفتح بالمرور", "Hover delay")} value={s.hoverDelayMs ?? 250} min={0} max={600} step={25} format={ms} onCommit={(v) => saveSettings({ hoverDelayMs: v })} />
        </Row>
        <Row label={i("تأخير الانكماش", "Collapse delay")}>
          <Slider label={i("تأخير الانكماش", "Collapse delay")} value={s.collapseDelayMs ?? 350} min={100} max={1500} step={50} format={ms} onCommit={(v) => saveSettings({ collapseDelayMs: v })} />
        </Row>
        <Row label={i("إخفاء تلقائي", "Auto-hide")} hint={i("تختفي الحبة في الراحة وتظهر عند مرور المؤشر", "The pill fades at rest and reappears on hover")}>
          <Toggle label={i("إخفاء تلقائي", "Auto-hide")} value={s.autoHide ?? false} onChange={(v) => saveSettings({ autoHide: v })} />
        </Row>
        <Row label={i("الإخفاء في وضع ملء الشاشة", "Hide in fullscreen")}>
          <Toggle label={i("الإخفاء في وضع ملء الشاشة", "Hide in fullscreen")} value={s.hideInFullscreen ?? false} onChange={(v) => saveSettings({ hideInFullscreen: v })} />
        </Row>
        <Row label={i("إظهار الساعة", "Show clock")}>
          <Toggle label={i("إظهار الساعة", "Show clock")} value={s.showClock ?? true} onChange={(v) => saveSettings({ showClock: v })} />
        </Row>
        <Row label={i("نظام الساعة", "Clock format")}>
          <Select
            label={i("نظام الساعة", "Clock format")} value={s.clockFormat ?? "auto"}
            options={[
              { value: "auto", label: i("تلقائي", "Auto") },
              { value: "24", label: i("24 ساعة", "24-hour") },
              { value: "12", label: i("12 ساعة", "12-hour") },
            ]}
            onChange={(v) => saveSettings({ clockFormat: v })}
          />
        </Row>
      </Section>
      </Group>
      )}

      {tab === "look" && (
      <Group id="look" title={i("المظهر والميديا", "Appearance & media")}>
      <Section title={i("الميديا والمظهر", "Media & appearance")}>
        <SubHead>{i("الحجم", "Size")}</SubHead>
        <Row label={i("عرض الحبة", "Pill width")} hint={i("المحتوى يتدرج مع المقاس تلقائيًا", "Content scales with the size automatically")}>
          <Slider label={i("عرض الحبة", "Pill width")} value={s.pillWidth ?? 220} min={160} max={280} step={5} format={px} onCommit={(v) => saveSettings({ pillWidth: v })} />
        </Row>
        <Row label={i("ارتفاع الحبة", "Pill height")}>
          <Slider label={i("ارتفاع الحبة", "Pill height")} value={s.pillHeight ?? 34} min={28} max={44} step={1} format={px} onCommit={(v) => saveSettings({ pillHeight: v })} />
        </Row>
        <SubHead>{i("النمط والمادة", "Theme & material")}</SubHead>
        <Row label={i("النمط", "Theme")} hint={i("يُطبَّق على الحبة واللوحة ونوافذ البرنامج", "Applies to the island, the panel and app windows")}>
          <Select
            label={i("النمط", "Theme")} value={s.themeMode ?? "dark"}
            options={[
              { value: "dark", label: i("داكن", "Dark") },
              { value: "light", label: i("فاتح", "Light") },
            ]}
            onChange={(v) => saveSettings({ themeMode: v === "light" ? "light" : "dark" })}
          />
        </Row>
        <Row label={i("المادة", "Material")} hint={i("الزجاجية: شفافية مع blur", "Glass: transparency with blur")}>
          <Select
            label={i("المادة", "Material")} value={s.themeMaterial ?? "solid"}
            options={[
              { value: "solid", label: i("عادية (مصمتة)", "Solid") },
              { value: "glass", label: i("زجاجية", "Glass") },
            ]}
            onChange={(v) => saveSettings({ themeMaterial: v === "glass" ? "glass" : "solid" })}
          />
        </Row>
        {(s.themeMaterial ?? "solid") === "glass" && (
          <Row label={i("قوة تظليل الزجاج", "Glass tint strength")} hint={i("أعلى = لوحة أغمق وتباين نص أوضح فوق المحتوى الفاتح؛ الطمس يبقى ظاهرًا", "Higher = darker panel and clearer text over bright content; the blur stays visible")}>
            <Slider
              label={i("قوة تظليل الزجاج", "Glass tint strength")} value={s.glassTint ?? 45} min={0} max={80} step={1} format={pct}
              onLive={(v) => saveSettings({ glassTint: v })}
              onCommit={(v) => saveSettings({ glassTint: v })}
            />
          </Row>
        )}
        {(s.themeMaterial ?? "solid") === "glass" && (
          <Row label={i("تمويه الزجاج (CSS)", "Glass blur (CSS)")} hint={i("طبقة الصفحة فوق الزجاج الأصلي؛ يُحدّ تلقائيًا في وضع التوفير", "Page layer over the native glass; capped automatically in eco mode")}>
            <Slider
              label={i("تمويه الزجاج (CSS)", "Glass blur (CSS)")} value={clampGlassBlur(s.glassBlur)} min={0} max={40} step={1} format={px}
              onLive={(v) => saveSettings({ glassBlur: v })}
              onCommit={(v) => saveSettings({ glassBlur: v })}
            />
          </Row>
        )}
        {(s.themeMaterial ?? "solid") === "glass" && (
          <Row label={i("تشبّع الزجاج", "Glass saturation")} hint={i("يزيد حيوية الألوان خلف الزجاج؛ 100% = بلا تعزيز", "Boosts colours behind the glass; 100% = no boost")}>
            <Slider
              label={i("تشبّع الزجاج", "Glass saturation")} value={clampGlassSaturation(s.glassSaturation)} min={100} max={200} step={5} format={pct}
              onLive={(v) => saveSettings({ glassSaturation: v })}
              onCommit={(v) => saveSettings({ glassSaturation: v })}
            />
          </Row>
        )}
        <Row label={i("الشفافية في الراحة", "Opacity at rest")}>
          <Slider label={i("الشفافية في الراحة", "Opacity at rest")} value={s.opacityRest ?? 100} min={20} max={100} step={5} format={pct} onCommit={(v) => saveSettings({ opacityRest: v })} />
        </Row>
        <Row label={i("الشفافية عند الفتح", "Opacity when open")}>
          <Slider label={i("الشفافية عند الفتح", "Opacity when open")} value={s.opacityOpen ?? 100} min={20} max={100} step={5} format={pct} onCommit={(v) => saveSettings({ opacityOpen: v })} />
        </Row>
        <SubHead>{i("السلوك البصري", "Visual behavior")}</SubHead>
        <Row label={i("عيون التميمة", "Mascot eyes")} hint={i("عينان بجانب الساعة تتبعان المؤشر؛ تُخفى أثناء الميديا والتوفير", "Eyes beside the clock follow the cursor; hidden during media and eco mode")}>
          <Toggle label={i("عيون التميمة", "Mascot eyes")} value={s.eyesEnabled ?? true} onChange={(v) => saveSettings({ eyesEnabled: v })} />
        </Row>
        <Row
          label={i("وضع تبويب المتصفح", "Browser tab mode")}
          hint={i(
            "حين يكون المتصفح (Chrome/Edge/Firefox/Brave) هو النافذة الأمامية ومكبَّرًا، تتخذ الحبة هيئة تبويب في أعلى شريطه؛ الضغط عليها يفتح اللوحة. إرساء بصري يحاكي التبويب لا تبويب حقيقي، ويتوقف في وضع التوفير.",
            "When a browser (Chrome/Edge/Firefox/Brave) is the maximized foreground window, the pill takes a tab shape in its tab strip; click it to open the panel. A visual docking that imitates a tab, not a real one; paused in Eco mode.",
          )}
        >
          <Toggle label={i("وضع تبويب المتصفح", "Browser tab mode")} value={s.browserTabMode ?? false} onChange={(v) => saveSettings({ browserTabMode: v })} />
        </Row>
        <SubHead>{i("الميديا", "Media")}</SubHead>
        <Row label={i("طيف الصوت والحبة السائلة", "Audio spectrum & liquid pill")} hint={i("يلتقط صوت الجهاز محليًا أثناء تشغيل الميديا فقط", "Captures system audio locally, only while media plays")}>
          <Toggle label={i("طيف الصوت والحبة السائلة", "Audio spectrum & liquid pill")} value={s.liquidSpectrum ?? false} onChange={(v) => saveSettings({ liquidSpectrum: v })} />
        </Row>
        <Row label={i("كلمات الأغاني في الرئيسية", "Lyrics in Home")} hint={i("تُجلب من الإنترنت (LRCLIB)", "Fetched online (LRCLIB)")}>
          <Toggle label={i("كلمات الأغاني في الرئيسية", "Lyrics in Home")} value={s.lyricsInHome ?? false} onChange={(v) => saveSettings({ lyricsInHome: v })} />
        </Row>
        <Row label={i("كلمات الأغاني في المشغّل", "Lyrics in player")} hint={i("تُجلب من الإنترنت (LRCLIB)", "Fetched online (LRCLIB)")}>
          <Toggle label={i("كلمات الأغاني في المشغّل", "Lyrics in player")} value={s.lyricsInPlayer ?? false} onChange={(v) => saveSettings({ lyricsInPlayer: v })} />
        </Row>
      </Section>
      </Group>
      )}

      {tab === "modules" && (
      <Group id="modules" title={i("الوحدات", "Modules")}>
      <Section title={i("اليوم والصلاة", "Today & prayer")}>
        <Row label={i("إظهار قسم «اليوم»", "Show the Today section")} hint={i("هجري + مواقيت الصلاة في الرئيسية — محلي بلا إنترنت", "Hijri date + prayer times on Home — local, offline")}>
          <Toggle label={i("إظهار قسم «اليوم»", "Show the Today section")} value={s.showToday ?? true} onChange={(v) => saveSettings({ showToday: v })} />
        </Row>
        <Row label={i("المدينة", "City")} hint={i("مواقيت أم القرى تُحسب محليًا لإحداثيات المدينة", "Umm al-Qura times computed locally for the city")}>
          <Select
            label={i("المدينة", "City")} value={s.prayerCity ?? "riyadh"}
            options={(cities.length ? cities : [{ id: s.prayerCity ?? "riyadh", ar: "الرياض", en: "Riyadh" }]).map((c) => ({ value: c.id, label: s.language === "en" ? c.en : c.ar }))}
            onChange={(v) => saveSettings({ prayerCity: v })}
          />
        </Row>
        <Row label={i("تنبيهات الصلاة", "Prayer alerts")} hint={i("قبل 10 دقائق وعند دخول الوقت — بصوت التنبيه إن فُعّل", "10 minutes before and at the time — with the alert sound if set")}>
          <Toggle label={i("تنبيهات الصلاة", "Prayer alerts")} value={s.prayerAlerts ?? true} onChange={(v) => saveSettings({ prayerAlerts: v })} />
        </Row>
        <Row label={i("الطقس", "Weather")} hint={i("يتصل بـ Open-Meteo (بلا حساب) لمدينتك — مطفأ افتراضيًا", "Connects to Open-Meteo (no account) for your city — off by default")}>
          <Toggle label={i("الطقس", "Weather")} value={s.showWeather ?? false} onChange={(v) => saveSettings({ showWeather: v })} />
        </Row>
        <Row label={i("وحدة الحرارة", "Temperature unit")}>
          <Select
            label={i("وحدة الحرارة", "Temperature unit")} value={s.weatherUnits ?? "c"}
            options={[{ value: "c", label: "°C" }, { value: "f", label: "°F" }]}
            onChange={(v) => saveSettings({ weatherUnits: v })}
          />
        </Row>
        <CountdownsEditor s={s} />
        <WorldClockEditor s={s} />
        <Row label={i("صوت التنبيه", "Alert sound")} hint={i("مسار WAV أو default · فارغ/off = صامت", "WAV path or default · empty/off = silent")}>
          <TextField label={i("صوت التنبيه", "Alert sound")} value={s.alertSound ?? ""} onCommit={(v) => saveSettings({ alertSound: v })} />
        </Row>
      </Section>

      <Section title={i("البطارية والشبكة", "Battery & network")}>
        <SubHead>{i("البطارية", "Battery")}</SubHead>
        <Row label={i("إظهار البطارية", "Show battery")}>
          <Toggle label={i("إظهار البطارية", "Show battery")} value={s.showBattery ?? false} onChange={(v) => saveSettings({ showBattery: v })} />
        </Row>
        <Row label={i("نصيحة «افصل الشاحن عند 80%»", "“Unplug at 80%” tip")} hint={i("في قسم البطارية أثناء الشحن", "In the battery section while charging")}>
          <Toggle label={i("نصيحة «افصل الشاحن عند 80%»", "“Unplug at 80%” tip")} value={s.batteryTip ?? true} onChange={(v) => saveSettings({ batteryTip: v })} />
        </Row>
        <Row label={i("بطاريات أجهزة البلوتوث", "Bluetooth device batteries")} hint={i("يقرأ محليًا مستوى الأجهزة المتصلة (BLE) التي تُبلغه، كل 5 دقائق", "Reads, locally, the level of connected (BLE) devices that report it, every 5 min")}>
          <Toggle label={i("بطاريات أجهزة البلوتوث", "Bluetooth device batteries")} value={s.btBatteries ?? true} onChange={(v) => saveSettings({ btBatteries: v })} />
        </Row>
        <SubHead>{i("الشبكة", "Network")}</SubHead>
        <Row
          label={i("سرعتا الشبكة في الحبة", "Network speed in the pill")}
          hint={i("تحميل/رفع حاليان من عدّادات ويندوز المحلية، تعرضهما الحبة المدمجة بدل الساعة. يتوقف القياس تمامًا عند الإطفاء.", "Current down/up speed from local Windows counters, shown in the compact pill instead of the clock. Measuring stops completely when off.")}
        >
          <Toggle label={i("سرعتا الشبكة في الحبة", "Network speed in the pill")} value={s.showNetSpeed ?? false} onChange={(v) => saveSettings({ showNetSpeed: v })} />
        </Row>
      </Section>
      <Section title={i("الحافظة", "Clipboard")}>
        <Row label={i("الحد الأقصى للعناصر", "Item limit")} hint={i("غير المثبّتة تُحذف الأقدم أولًا", "Oldest unpinned items are dropped first")}>
          <NumberField label={i("الحد الأقصى للعناصر", "Item limit")} value={s.clipLimit ?? 200} min={10} max={5000} onCommit={(v) => saveSettings({ clipLimit: v })} />
        </Row>
        <Row label={i("اللصق عند النقر", "Paste on click")} hint={i("إطفاؤه يضع العنصر في الحافظة فقط", "When off, the item is only copied")}>
          <Toggle label={i("اللصق عند النقر", "Paste on click")} value={s.pasteOnClick ?? true} onChange={(v) => saveSettings({ pasteOnClick: v })} />
        </Row>
        <Row label={i("تطبيقات مستثناة", "Excluded apps")} hint={i("اسم ملف exe في كل سطر", "One exe name per line")}>
          <LinesField label={i("تطبيقات مستثناة", "Excluded apps")} value={s.clipExcludedApps ?? []} placeholder="keepassxc.exe" onCommit={(v) => saveSettings({ clipExcludedApps: v })} />
        </Row>
      </Section>

      <Section title={i("النظام والخصوصية", "System & privacy")}>
        <Row label={i("مؤشر الميكروفون والكاميرا", "Mic & camera indicator")} hint={i("نقطة في الحبة أثناء استخدام أي تطبيق لهما — قراءة محلية لسجلّ ويندوز فقط", "A dot in the pill while any app uses them — local Windows registry read only")}>
          <Toggle label={i("مؤشر الميكروفون والكاميرا", "Mic & camera indicator")} value={s.privacyIndicator ?? false} onChange={(v) => saveSettings({ privacyIndicator: v })} />
        </Row>
        <Row label={i("تنبيه الحمل المرتفع", "High-load alert")} hint={i("معالج ≥90% لمدة 30 ثانية متواصلة ⇒ تنبيه يسمّي التطبيق المسبّب (مرة كل 10 دقائق كحدّ أقصى). مطفأ افتراضيًا ويتوقف في وضع التوفير", "CPU ≥90% for 30 s straight ⇒ an alert naming the app responsible (at most once per 10 min). Off by default and stopped in saving mode")}>
          <Toggle label={i("تنبيه الحمل المرتفع", "High-load alert")} value={s.loadAlert ?? false} onChange={(v) => saveSettings({ loadAlert: v })} />
        </Row>
        <Row label={i("التحكم بالصوت في قسم النظام", "Volume control in System")}>
          <Toggle label={i("التحكم بالصوت في قسم النظام", "Volume control in System")} value={s.showVolume ?? true} onChange={(v) => saveSettings({ showVolume: v })} />
        </Row>
      </Section>

      <Section title={i("الاجتماعات", "Meetings")}>
        <Row label={i("عرض الاجتماعات القادمة", "Show upcoming meetings")} hint={i("ميزة شبكية اختيارية: تجلب تقويمك من الرابط أدناه فقط", "Optional network feature: fetches your calendar from the link below only")}>
          <Toggle label={i("عرض الاجتماعات القادمة", "Show upcoming meetings")} value={s.showMeetings ?? false} onChange={(v) => saveSettings({ showMeetings: v })} />
        </Row>
        <Row label={i("نافذة «اجتماع قريب»", "“Upcoming meeting” window")} hint={i("يظهر الاجتماع في الحبة/الرئيسية بلون نوعه قبل بدئه بهذه المدة", "The meeting shows in the island/Home in its own colour this long before it starts")}>
          <Select
            label={i("نافذة «اجتماع قريب»", "“Upcoming meeting” window")} value={s.meetingLeadMin ?? 15}
            options={[5, 10, 15, 30, 60].map((n) => ({ value: n, label: i(`${n} دقيقة`, `${n} min`) }))}
            onChange={(v) => saveSettings({ meetingLeadMin: Number(v) })}
          />
        </Row>
        <MeetingsKey />
      </Section>

      <Section title={i("الالتقاط والتسجيل", "Capture & recording")}>
        <SubHead>{i("اللقطات", "Screenshots")}</SubHead>
        <Row label={i("إظهار الحبة في اللقطات", "Show the island in captures")} hint={i("مطفأ: الحبة تُستثنى من اللقطات والتسجيل", "Off: the island is excluded from screenshots and recordings")}>
          <Toggle label={i("إظهار الحبة في اللقطات", "Show the island in captures")} value={s.captureVisible ?? false} onChange={(v) => saveSettings({ captureVisible: v })} />
        </Row>
        <Row label={i("مجلد اللقطات", "Screenshots folder")} hint={i("فارغ = Pictures\\MyIsland", "Empty = Pictures\\MyIsland")}>
          <TextField label={i("مجلد اللقطات", "Screenshots folder")} value={s.screenshotDir ?? ""} onCommit={(v) => saveSettings({ screenshotDir: v })} />
        </Row>
        <Row label={i("اختصار لقطة منطقة", "Area screenshot hotkey")} hint={i("فارغ = معطّل · PrintScreen يعترض الزر", "Empty = off · PrintScreen intercepts the key")}>
          <TextField label={i("اختصار لقطة منطقة", "Area screenshot hotkey")} value={s.hotkeyArea ?? ""} onCommit={(v) => saveSettings({ hotkeyArea: v })} />
        </Row>
        <Row label={i("اختصار لقطة الشاشة", "Full-screen screenshot hotkey")}>
          <TextField label={i("اختصار لقطة الشاشة", "Full-screen screenshot hotkey")} value={s.hotkeyScreen ?? ""} onCommit={(v) => saveSettings({ hotkeyScreen: v })} />
        </Row>
        <SubHead>{i("التسجيل", "Recording")}</SubHead>
        <Row label={i("صيغة التسجيل", "Recording format")}>
          <Select
            label={i("صيغة التسجيل", "Recording format")} value={s.recordFormat ?? "mp4"}
            options={[{ value: "mp4", label: "MP4" }, { value: "gif", label: "GIF" }]}
            onChange={(v) => saveSettings({ recordFormat: v })}
          />
        </Row>
        <Row label={i("إطارات التسجيل في الثانية", "Recording FPS")} hint={i("GIF يُسقَّف عند 20", "GIF is capped at 20")}>
          <Select
            label={i("إطارات التسجيل في الثانية", "Recording FPS")} value={s.recordingFps ?? 30}
            options={[{ value: 30, label: "30" }, { value: 60, label: "60" }]}
            onChange={(v) => saveSettings({ recordingFps: v })}
          />
        </Row>
        <Row label={i("جودة التسجيل", "Recording quality")}>
          <Select
            label={i("جودة التسجيل", "Recording quality")} value={s.recordingQuality ?? "medium"}
            options={[
              { value: "low", label: i("منخفضة", "Low") },
              { value: "medium", label: i("متوسطة", "Medium") },
              { value: "high", label: i("عالية", "High") },
            ]}
            onChange={(v) => saveSettings({ recordingQuality: v })}
          />
        </Row>
        <Row label={i("مجلد التسجيلات", "Recordings folder")} hint={i("فارغ = Videos\\MyIsland", "Empty = Videos\\MyIsland")}>
          <TextField label={i("مجلد التسجيلات", "Recordings folder")} value={s.recordingDir ?? ""} onCommit={(v) => saveSettings({ recordingDir: v })} />
        </Row>
        <Row label={i("اختصار التسجيل", "Recording hotkey")} hint={i("يبدّل بدء/إيقاف · فارغ = معطّل", "Toggles start/stop · empty = off")}>
          <TextField label={i("اختصار التسجيل", "Recording hotkey")} value={s.hotkeyRecord ?? ""} onCommit={(v) => saveSettings({ hotkeyRecord: v })} />
        </Row>
        <SubHead>{i("أدوات", "Tools")}</SubHead>
        <Row label={i("اختصار منتقي الألوان", "Color picker hotkey")}>
          <TextField label={i("اختصار منتقي الألوان", "Color picker hotkey")} value={s.hotkeyColor ?? ""} onCommit={(v) => saveSettings({ hotkeyColor: v })} />
        </Row>
      </Section>
      <Section title={i("شريط الأوامر", "Command palette")}>
        <Row
          label={i("أسعار العملات الحية", "Live currency rates")}
          hint={i(
            "عند تحويل عملة في الشريط تُجلب الأسعار من open.er-api.com وتُخزَّن 12 ساعة؛ بلا اتصال أو مطفأ تُستعمل الأسعار المضمّنة التقريبية.",
            "When you convert a currency in the palette, rates are fetched from open.er-api.com and cached for 12 h; offline or off, the built-in approximate rates are used.",
          )}
        >
          <Toggle label={i("أسعار العملات الحية", "Live currency rates")} value={s.liveRates ?? true} onChange={(v) => saveSettings({ liveRates: v })} />
        </Row>
        <div>
          <div dir="auto" className="text-sm">{i("مساحات العمل", "Workspaces")}</div>
          <div dir="auto" className="mb-2 text-xs text-white/50">
            {i("مجموعات تُفتح دفعة واحدة من الشريط: اكتب اسمها أو «ws اسم». كل سطر: مسار تطبيق أو مجلد أو ملف، أو رابط http(s).", "Groups opened at once from the palette: type the name or “ws name”. One item per line: an app, folder or file path, or an http(s) link.")}
          </div>
          <WorkspacesEditor value={Array.isArray(s.workspaces) ? s.workspaces : []} />
        </div>
      </Section>
      <Section title={i("وقتي والاستراحة", "My time & breaks")}>
        <Row
          label={i("تتبّع زمن التركيز (وقتي)", "Focus-time tracking")}
          hint={i(
            "يعمل افتراضيًا. يسجّل اسم التطبيق الأمامي فقط (بلا عناوين نوافذ أو محتوى) أثناء نشاطك، ويتوقف عند الخمول أكثر من 60 ثانية. يُحفظ على جهازك فقط 30 يومًا ولا يُرسل لأي مكان.",
            "On by default. Records only the foreground app name (no window titles or content) while you're active; pauses after 60 s idle. Stored on this device only for 30 days, never sent anywhere.",
          )}
        >
          <Toggle label={i("تتبّع زمن التركيز (وقتي)", "Focus-time tracking")} value={s.attentionTracking ?? true} onChange={(v) => saveSettings({ attentionTracking: v })} />
        </Row>
        <Row label={i("تذكير الاستراحة", "Break reminders")} hint={i("إشعار داخل التطبيق بعد استخدام متواصل (استراحة 5 دقائق تصفّر العدّ)", "In-app notice after continuous use (a 5-minute pause resets the count)")}>
          <Toggle label={i("تذكير الاستراحة", "Break reminders")} value={s.breakReminders ?? false} onChange={(v) => saveSettings({ breakReminders: v })} />
        </Row>
        <Row label={i("مدة الاستخدام المتواصل (دقيقة)", "Continuous use before a break (min)")}>
          <NumberField label={i("مدة الاستخدام المتواصل (دقيقة)", "Continuous use before a break (min)")} value={s.breakMinutes ?? 60} min={5} max={240} onCommit={(v) => saveSettings({ breakMinutes: v })} />
        </Row>
        <Row label={i("مسح بيانات وقتي", "Clear My-time data")} hint={i("يحذف كل ما سُجّل محليًا", "Deletes everything recorded locally")}>
          <button
            onClick={() => invoke("attention_clear").catch(() => {})}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >{i("مسح", "Clear")}</button>
        </Row>
      </Section>
      </Group>
      )}

      {tab === "perf" && (
      <Group id="perf" title={i("الأداء والتوفير", "Performance & saving")}>
      <Section title={i("الأداء والتوفير", "Performance & saving")}>
        <Row label={i("حالة وضع التوفير", "Eco mode status")}>
          <EcoIndicator />
        </Row>
        <Row
          label={i("وضع التوفير (Eco)", "Eco mode")}
          hint={i(
            "يبطّئ رصد الحافظة وتتبّع النافذة النشطة، ويوقف فحص بلوتوث البطارية وطيف الصوت، ويخفض الحركة إلى «مخففة».",
            "Slows clipboard watching and active-window tracking, stops Bluetooth battery polling and the audio spectrum, and lowers motion to “Reduced”.",
          )}
        >
          <Toggle label={i("وضع التوفير (Eco)", "Eco mode")} value={s.ecoMode ?? false} onChange={(v) => saveSettings({ ecoMode: v })} />
        </Row>
        <Row label={i("التوفير تلقائيًا على البطارية", "Auto-eco on battery")} hint={i("يتفعّل عند فصل الشاحن ويتوقف عند توصيله؛ التفعيل اليدوي يبقى في الحالتين", "Turns on when unplugged and off when plugged in; the manual switch stays on either way")}>
          <Toggle label={i("التوفير تلقائيًا على البطارية", "Auto-eco on battery")} value={s.ecoOnBattery ?? false} onChange={(v) => saveSettings({ ecoOnBattery: v })} />
        </Row>
        <Row label={i("مستوى الحركة", "Motion level")} hint={i("كاملة: حركة نابضة · مخففة: انتقالات قصيرة بلا ارتداد · متوقفة: بلا حركة", "Full: springy · Reduced: short, no bounce · Off: no motion")}>
          <Select
            label={i("مستوى الحركة", "Motion level")} value={s.motionLevel === "reduced" || s.motionLevel === "off" ? s.motionLevel : "full"}
            options={[
              { value: "full", label: i("كاملة", "Full") },
              { value: "reduced", label: i("مخففة", "Reduced") },
              { value: "off", label: i("متوقفة", "Off") },
            ]}
            onChange={(v) => saveSettings({ motionLevel: v })}
          />
        </Row>
        <div>
          <div dir="auto" className="mb-2 text-sm">{i("استهلاك الرام الآن", "RAM usage now")}</div>
          <RamUsage />
        </div>
      </Section>
      </Group>
      )}
      </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
