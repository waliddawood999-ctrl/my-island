import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "../../index.css";
import { i } from "../../i18n";
import { saveSettings, useSettings } from "../../useSettings";
import { LinesField, NumberField, Row, Section, Select, Slider, Toggle } from "./fields";

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
