import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "../../index.css";
import { i } from "../../i18n";
import { saveSettings, useSettings } from "../../useSettings";
import { EcoIndicator, RamUsage } from "./Perf";
import { WorkspacesEditor } from "./Workspaces";
import { LinesField, NumberField, Row, Section, Select, Slider, TextField, Toggle } from "./fields";

interface MonitorInfo { index: number; name: string; width: number; height: number; primary: boolean }

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
        <Row label={i("عيون التميمة", "Mascot eyes")} hint={i("عينان بجانب الساعة تتبعان المؤشر؛ تُخفى أثناء الميديا والتوفير", "Eyes beside the clock follow the cursor; hidden during media and eco mode")}>
          <Toggle label={i("عيون التميمة", "Mascot eyes")} value={s.eyesEnabled ?? true} onChange={(v) => saveSettings({ eyesEnabled: v })} />
        </Row>
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
        <Row label={i("نصيحة «افصل الشاحن عند 80%»", "“Unplug at 80%” tip")} hint={i("في قسم البطارية أثناء الشحن", "In the battery section while charging")}>
          <Toggle label={i("نصيحة «افصل الشاحن عند 80%»", "“Unplug at 80%” tip")} value={s.batteryTip ?? true} onChange={(v) => saveSettings({ batteryTip: v })} />
        </Row>
        <Row label={i("بطاريات أجهزة البلوتوث", "Bluetooth device batteries")} hint={i("يقرأ محليًا مستوى الأجهزة المتصلة (BLE) التي تُبلغه، كل 5 دقائق", "Reads, locally, the level of connected (BLE) devices that report it, every 5 min")}>
          <Toggle label={i("بطاريات أجهزة البلوتوث", "Bluetooth device batteries")} value={s.btBatteries ?? true} onChange={(v) => saveSettings({ btBatteries: v })} />
        </Row>
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
