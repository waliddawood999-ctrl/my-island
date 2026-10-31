import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "../../index.css";
import { i } from "../../i18n";
import { saveSettings, useSettings } from "../../useSettings";
import { LinesField, NumberField, Row, Section, Select, Slider, TextField, Toggle } from "./fields";

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

function App() {
  const s = useSettings();
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  useEffect(() => {
    invoke<MonitorInfo[]>("monitors_list").then(setMonitors).catch(() => {});
  }, []);
  const pct = (v: number) => `${v}%`;
  const ms = (v: number) => `${v} ms`;
  const px = (v: number) => `${v} px`;

  return (
    <div dir="auto" className="mx-auto max-w-3xl p-5 text-white">
      <h1 className="mb-4 text-xl font-bold">{i("الإعدادات", "Settings")}</h1>

      <Section title={i("عام", "General")}>
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
        <Row label={i("الشفافية في الراحة", "Opacity at rest")}>
          <Slider label={i("الشفافية في الراحة", "Opacity at rest")} value={s.opacityRest ?? 100} min={20} max={100} step={5} format={pct} onCommit={(v) => saveSettings({ opacityRest: v })} />
        </Row>
        <Row label={i("الشفافية عند الفتح", "Opacity when open")}>
          <Slider label={i("الشفافية عند الفتح", "Opacity when open")} value={s.opacityOpen ?? 100} min={20} max={100} step={5} format={pct} onCommit={(v) => saveSettings({ opacityOpen: v })} />
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

      <Section title={i("الميديا والمظهر", "Media & appearance")}>
        <Row label={i("طيف الصوت والحبة السائلة", "Audio spectrum & liquid pill")} hint={i("يلتقط صوت الجهاز محليًا أثناء تشغيل الميديا فقط", "Captures system audio locally, only while media plays")}>
          <Toggle label={i("طيف الصوت والحبة السائلة", "Audio spectrum & liquid pill")} value={s.liquidSpectrum ?? false} onChange={(v) => saveSettings({ liquidSpectrum: v })} />
        </Row>
        <Row label={i("كلمات الأغاني في الرئيسية", "Lyrics in Home")} hint={i("تُجلب من الإنترنت (LRCLIB)", "Fetched online (LRCLIB)")}>
          <Toggle label={i("كلمات الأغاني في الرئيسية", "Lyrics in Home")} value={s.lyricsInHome ?? false} onChange={(v) => saveSettings({ lyricsInHome: v })} />
        </Row>
        <Row label={i("كلمات الأغاني في المشغّل", "Lyrics in player")} hint={i("تُجلب من الإنترنت (LRCLIB)", "Fetched online (LRCLIB)")}>
          <Toggle label={i("كلمات الأغاني في المشغّل", "Lyrics in player")} value={s.lyricsInPlayer ?? false} onChange={(v) => saveSettings({ lyricsInPlayer: v })} />
        </Row>
        <Row label={i("إظهار التنزيلات", "Show downloads")}>
          <Toggle label={i("إظهار التنزيلات", "Show downloads")} value={s.showDownloads ?? false} onChange={(v) => saveSettings({ showDownloads: v })} />
        </Row>
        <Row label={i("التنزيلات في الحبة", "Downloads in pill")}>
          <Toggle label={i("التنزيلات في الحبة", "Downloads in pill")} value={s.downloadsInPill ?? false} onChange={(v) => saveSettings({ downloadsInPill: v })} />
        </Row>
        <Row label={i("إظهار البطارية", "Show battery")}>
          <Toggle label={i("إظهار البطارية", "Show battery")} value={s.showBattery ?? false} onChange={(v) => saveSettings({ showBattery: v })} />
        </Row>
      </Section>

      <Section title={i("النظام والخصوصية", "System & privacy")}>
        <Row label={i("مؤشر الميكروفون والكاميرا", "Mic & camera indicator")} hint={i("نقطة في الحبة أثناء استخدام أي تطبيق لهما — قراءة محلية لسجلّ ويندوز فقط", "A dot in the pill while any app uses them — local Windows registry read only")}>
          <Toggle label={i("مؤشر الميكروفون والكاميرا", "Mic & camera indicator")} value={s.privacyIndicator ?? false} onChange={(v) => saveSettings({ privacyIndicator: v })} />
        </Row>
        <Row label={i("التحكم بالصوت في قسم النظام", "Volume control in System")}>
          <Toggle label={i("التحكم بالصوت في قسم النظام", "Volume control in System")} value={s.showVolume ?? true} onChange={(v) => saveSettings({ showVolume: v })} />
        </Row>
      </Section>

      <Section title={i("الاجتماعات", "Meetings")}>
        <Row label={i("عرض الاجتماعات القادمة", "Show upcoming meetings")} hint={i("ميزة شبكية اختيارية: تجلب تقويمك من الرابط أدناه فقط", "Optional network feature: fetches your calendar from the link below only")}>
          <Toggle label={i("عرض الاجتماعات القادمة", "Show upcoming meetings")} value={s.showMeetings ?? false} onChange={(v) => saveSettings({ showMeetings: v })} />
        </Row>
        <MeetingsKey />
      </Section>

      <Section title={i("الالتقاط والتسجيل", "Capture & recording")}>
        <Row label={i("إظهار الحبة في اللقطات", "Show the island in captures")} hint={i("مطفأ: الحبة تُستثنى من اللقطات والتسجيل", "Off: the island is excluded from screenshots and recordings")}>
          <Toggle label={i("إظهار الحبة في اللقطات", "Show the island in captures")} value={s.captureVisible ?? false} onChange={(v) => saveSettings({ captureVisible: v })} />
        </Row>
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
        <Row label={i("مجلد اللقطات", "Screenshots folder")} hint={i("فارغ = Pictures\\MyIsland", "Empty = Pictures\\MyIsland")}>
          <TextField label={i("مجلد اللقطات", "Screenshots folder")} value={s.screenshotDir ?? ""} onCommit={(v) => saveSettings({ screenshotDir: v })} />
        </Row>
        <Row label={i("مجلد التسجيلات", "Recordings folder")} hint={i("فارغ = Videos\\MyIsland", "Empty = Videos\\MyIsland")}>
          <TextField label={i("مجلد التسجيلات", "Recordings folder")} value={s.recordingDir ?? ""} onCommit={(v) => saveSettings({ recordingDir: v })} />
        </Row>
        <Row label={i("اختصار لقطة منطقة", "Area screenshot hotkey")} hint={i("فارغ = معطّل · PrintScreen يعترض الزر", "Empty = off · PrintScreen intercepts the key")}>
          <TextField label={i("اختصار لقطة منطقة", "Area screenshot hotkey")} value={s.hotkeyArea ?? ""} onCommit={(v) => saveSettings({ hotkeyArea: v })} />
        </Row>
        <Row label={i("اختصار لقطة الشاشة", "Full-screen screenshot hotkey")}>
          <TextField label={i("اختصار لقطة الشاشة", "Full-screen screenshot hotkey")} value={s.hotkeyScreen ?? ""} onCommit={(v) => saveSettings({ hotkeyScreen: v })} />
        </Row>
        <Row label={i("اختصار التسجيل", "Recording hotkey")} hint={i("يبدّل بدء/إيقاف · فارغ = معطّل", "Toggles start/stop · empty = off")}>
          <TextField label={i("اختصار التسجيل", "Recording hotkey")} value={s.hotkeyRecord ?? ""} onCommit={(v) => saveSettings({ hotkeyRecord: v })} />
        </Row>
        <Row label={i("اختصار منتقي الألوان", "Color picker hotkey")}>
          <TextField label={i("اختصار منتقي الألوان", "Color picker hotkey")} value={s.hotkeyColor ?? ""} onCommit={(v) => saveSettings({ hotkeyColor: v })} />
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
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
