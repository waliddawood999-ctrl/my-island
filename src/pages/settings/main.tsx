import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  Activity, AppWindow, BatteryCharging, Bell, Blocks, Brush, CalendarClock, Camera, Clapperboard, Clipboard as ClipIcon, Clock, Cloud, Command, Cpu, Download, Eye, Film, FolderOpen,
  Gauge, Globe, Play, Info, Keyboard, Languages, Layers, LogOut, MapPin, Maximize2, Mic, Monitor, Moon, MousePointer2, Move, MoveVertical, Music, Network, Palette, PanelTop, Percent,
  PictureInPicture2, Power, RefreshCw, RotateCcw, Ruler, Scan, Search, Settings2, Shield, Sparkles, Square, SunMoon, Timer, Type, Upload, Volume2, Waves, Zap, Hourglass, SlidersHorizontal,
} from "lucide-react";
import "../../index.css";
import "./settings.css";
import { i } from "../../i18n";
import { webviewVerdict, type WebviewRuntime } from "../../webview";
import { saveSettings, retrySettingsSave, useSaveStatus, useSettings } from "../../useSettings";
import { EcoIndicator, RamUsage } from "./Perf";
import { WorkspacesEditor } from "./Workspaces";
import { ClockPad } from "./ClockPad";
import { CountdownsEditor, WorldClockEditor } from "./TodayExtras";
import { manualCheck } from "../../useUpdater";
import type { ManualStatus } from "../../updater";
import { AppearanceBody } from "./Appearance";
import { SECTION_KEYS, exportSettings, parseImport, resetPatch } from "../../appearance";
import { spring } from "../../motion";
import { MOTION_PRESETS, MOTION_PRESET_KEYS, migrateReduce, normBounce, normPreset, normSpeed } from "../../islandMotion";
import { normCardOrder } from "../../islandMachine";
import { SOUND_IDS, SOUND_LABELS, normSound, normVolume, playSound } from "../../sounds";
import { btnOutline, btnPrimary, ColorField, DirCtx, inputCls, LinesField, NumberField, OrderField, Row, SearchCtx, Section, Segmented, Select, ShortcutField, Slider, SubHead, TextField, Toggle } from "./fields";

interface CityOpt { id: string; ar: string; en: string }
interface MonitorInfo { index: number; name: string; width: number; height: number; primary: boolean }
const ic = (C: typeof Info) => <C size={16} />;

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
      <Row icon={<CalendarClock size={16} />} label={i("رابط iCal الخاص بالتقويم", "Private iCal link")} hint={isSet ? i("محفوظ ومشفّر — الصق رابطًا جديدًا لاستبداله", "Saved & encrypted — paste a new link to replace it") : i("من إعدادات التقويم: «العنوان السرّي بصيغة iCal»", "From your calendar settings: “Secret address in iCal format”")}>
        <div className="flex items-center gap-2">
          <input
            type="password" dir="ltr" autoComplete="off" spellCheck={false}
            aria-label={i("رابط iCal الخاص بالتقويم", "Private iCal link")}
            value={val} onChange={(e) => setVal(e.target.value)}
            placeholder={isSet ? "••••••••••••" : "https://…/basic.ics"}
            className={`${inputCls} w-56`}
          />
          <button disabled={!val.trim()} onClick={() => save(val)} className={btnPrimary}>{i("حفظ", "Save")}</button>
          {isSet && <button onClick={() => save("")} className={btnOutline}>{i("حذف", "Remove")}</button>}
        </div>
      </Row>
      {msg && <div role="status" dir="auto" className="text-xs text-white/60">{msg}</div>}
    </div>
  );
}

/** زر «التحقق من التحديثات»: الحالة تُعرض في مكانها. */
const RELEASES_REPO = "https://github.com/waliddawood999-ctrl/my-island-releases";

/** «حول»: قسم مستقل بذاته أسفل القائمة — الإصدار من حزمة التطبيق (نفس رقم CI) + المطوّر + ما الجديد + GitHub. عرض فقط. */
function AboutSection() {
  const [ver, setVer] = useState("");
  const [wv, setWv] = useState<WebviewRuntime | null>(null);
  useEffect(() => { getVersion().then(setVer).catch(() => {}); }, []);
  useEffect(() => { invoke<WebviewRuntime>("webview_runtime").then((r) => setWv(r ?? null)).catch(() => {}); }, []);
  const verdict = webviewVerdict(wv);
  const open = (url: string) => () => { invoke("open_path", { path: url }).catch(() => {}); };
  return (
    <Section title={i("حول", "About")}>
      <Row icon={ic(Info)} label={i("الإصدار الحالي", "Current version")}>
        <span dir="ltr" className="st-val" data-testid="about-version">{ver || "—"}</span>
      </Row>
      <Row icon={ic(Cpu)} label={i("نسخة WebView2 Runtime", "WebView2 Runtime version")}
        hint={verdict === "buggy" ? i("نسخة معروف فيها تعطّل الشفافية (145–146) — قد تظهر حواف بيضاء حول الجزيرة؛ حدّث WebView2 Runtime.", "Known transparency regression (145–146) — white edges may show around the island; update WebView2 Runtime.")
          : verdict === "opaque" ? i("خلفية العرض ليست شفافة فعليًا — قد تظهر حواف بيضاء.", "Render background is not actually transparent — white edges may show.") : undefined}>
        <span dir="ltr" className="st-val" data-testid="about-webview" data-verdict={verdict}>{wv?.version || "—"}</span>
      </Row>
      <Row icon={ic(Sparkles)} label={i("طُوِّر بواسطة وليد", "Developed by Walid")} />
      <Row icon={ic(Clapperboard)} label={i("ما الجديد", "What's new")} hint={i("ملاحظات الإصدارات على GitHub", "Release notes on GitHub")}>
        <button className={btnOutline} data-testid="about-whatsnew" onClick={open(`${RELEASES_REPO}/releases`)}>{i("ما الجديد", "What's new")}</button>
      </Row>
      <Row icon={ic(Globe)} label="GitHub" hint={i("صفحة الإصدارات", "Releases page")}>
        <button className={btnOutline} data-testid="about-github" onClick={open(RELEASES_REPO)}>GitHub</button>
      </Row>
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
    <Row icon={<RefreshCw size={16} />} label={i("التحقق من التحديثات", "Check for updates")}>
      <div className="flex items-center gap-2">
        <button
          data-testid="update-check" disabled={st === "checking"} onClick={run}
          className={btnOutline}
        >{i("التحقق من التحديثات", "Check for updates")}</button>
        {msg && <span role="status" data-testid="update-status" dir="auto" className="text-xs text-white/60">{msg}</span>}
      </div>
    </Row>
  );
}

/** «إغلاق الجزيرة»: أسفل الشريط الجانبي، أحمر؛ تأكيد على خطوتين داخل الزر نفسه (نقرة أولى ⇒ «متأكد؟ إغلاق»، ثانية ⇒ app_quit). يعود تلقائيًا بعد 4 ثوانٍ أو بفقد التركيز. */
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
      className="st-btn st-btn-danger"
    ><LogOut size={16} className="rtl:-scale-x-100" />{sure ? i("متأكد؟ إغلاق", "Sure? Quit") : i("إغلاق الجزيرة", "Quit island")}</button>
  );
}

/** نسخ احتياطي: تصدير/استيراد JSON + إعادة ضبط الكل (بتأكيد من خطوتين). لا أسرار في الإعدادات أصلًا (DPAPI منفصل). */
function Backup({ s }: { s: Parameters<typeof exportSettings>[0] }) {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = window.setTimeout(() => setSure(false), 4000); return () => window.clearTimeout(t); }, [sure]);
  const doExport = () => {
    const url = URL.createObjectURL(new Blob([exportSettings(s)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "myisland-settings.json"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg(i("تم التصدير", "Exported"));
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    try {
      const p = parseImport(await f.text(), s);
      if (!p || !Object.keys(p).length) { setMsg(i("الملف لا يحتوي إعدادات صالحة", "No valid settings in this file")); return; }
      setMsg(i("جارٍ الاستيراد…", "Importing…"));
      const saved = await saveSettings(p);
      setMsg(saved ? i(`استُورد ${Object.keys(p).length} إعدادًا صالحًا`, `Imported ${Object.keys(p).length} valid settings`) : i("تعذّر الحفظ؛ أعد المحاولة", "Save failed; try again"));
    } catch { setMsg(i("تعذّرت قراءة الملف", "Could not read the file")); }
  };
  const all = Object.values(SECTION_KEYS).flat();
  return (
    <Section title={i("نسخ احتياطي وإعادة ضبط", "Backup & reset")}>
      <Row icon={ic(Download)} label={i("تصدير الإعدادات", "Export settings")} hint={i("ملف JSON بلا أسرار (المفاتيح السرية تُحفظ مشفّرة بشكل منفصل)", "A JSON file with no secrets (keys are stored encrypted separately)")}>
        <button className={btnOutline} data-testid="export-btn" onClick={doExport}>{i("تصدير", "Export")}</button>
      </Row>
      <Row icon={ic(Upload)} label={i("استيراد الإعدادات", "Import settings")} hint={msg || i("يُطبَّق فورًا؛ المفاتيح غير المعروفة تُتجاهل", "Applied instantly; unknown keys are ignored")}>
        <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-file" onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }} />
        <button className={btnOutline} data-testid="import-btn" onClick={() => file.current?.click()}>{i("استيراد", "Import")}</button>
      </Row>
      <Row icon={ic(RotateCcw)} label={i("إعادة ضبط كل الإعدادات", "Reset all settings")} hint={i("يعيد الافتراضيات (قوائمك مثل العدّادات ومساحات العمل تبقى)", "Restores defaults (your lists like countdowns and workspaces stay)")}>
        <button className={`st-btn ${sure ? "st-btn-danger" : ""}`} style={sure ? { width: "auto" } : undefined} data-armed={sure} data-testid="reset-all"
          onClick={async () => { if (sure) { setSure(false); const saved = await saveSettings(resetPatch(all)); setMsg(saved ? i("أُعيد الضبط", "Reset done") : i("تعذّرت إعادة الضبط", "Reset failed")); } else setSure(true); }} onBlur={() => setSure(false)}>
          {sure ? i("متأكد؟ إعادة ضبط", "Sure? Reset") : i("إعادة ضبط الكل", "Reset all")}
        </button>
      </Row>
    </Section>
  );
}


interface Sec { id: string; icon: ReactNode; label: string; desc: string; body: ReactNode }

function App() {
  const s = useSettings();
  const saveStatus = useSaveStatus();
  const [clearArmed, setClearArmed] = useState(false);
  const [clearMsg, setClearMsg] = useState("");
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [cities, setCities] = useState<CityOpt[]>([]);
  useEffect(() => {
    invoke<MonitorInfo[]>("monitors_list").then(setMonitors).catch(() => {});
    invoke<CityOpt[]>("today_cities").then(setCities).catch(() => {});
  }, []);
  const [tab, setTab] = useState("general");
  const [q, setQ] = useState("");
  const dir = s.language === "en" ? "ltr" : "rtl";
  const pct = (v: number) => `${v}%`;
  const ms = (v: number) => `${v} ms`;
  const px = (v: number) => `${v} px`;
  const glassOn = (s.themeMaterial ?? "glass") === "glass";
  const set = saveSettings;

  const originalSections: Sec[] = [
    {
      id: "general", icon: <Settings2 size={16} />, label: i("عام", "General"), desc: i("التشغيل واللغة والشاشة وسلوك الفتح والإغلاق.", "Startup, language, screen and open/close behavior."),
      body: (<>
        <Section title={i("التشغيل", "Startup")}>
          <Row icon={ic(Power)} label={i("التشغيل مع ويندوز", "Start with Windows")} hint={i("يشغّل الجزيرة تلقائيًا عند تسجيل الدخول", "Starts the island automatically when you sign in")}>
            <Toggle label={i("التشغيل مع ويندوز", "Start with Windows")} value={s.autostart ?? false} onChange={(v) => set({ autostart: v })} />
          </Row>
          <Row icon={ic(Languages)} label={i("اللغة", "Language")}>
            <Select
              label={i("اللغة", "Language")} value={s.language === "en" ? "en" : "ar"}
              options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]}
              onChange={(v) => set({ language: v })}
            />
          </Row>
          <Row icon={ic(Monitor)} label={i("الشاشة", "Monitor")} hint={i("الشاشة التي تظهر عليها الحبة", "The screen the pill appears on")}>
            <Select
              label={i("الشاشة", "Monitor")} value={s.monitor ?? 0}
              options={(monitors.length ? monitors : [{ index: 0, name: "", width: 0, height: 0, primary: true }]).map((m) => ({
                value: m.index,
                label: `${m.index + 1}${m.width ? ` — ${m.width}×${m.height}` : ""}${m.primary ? ` (${i("الرئيسية", "primary")})` : ""}`,
              }))}
              onChange={(v) => set({ monitor: v })}
            />
          </Row>
        </Section>
        <Backup s={s} />
      </>),
    },
    {
      id: "island", icon: <PictureInPicture2 size={16} />, label: i("الجزيرة", "Island"), desc: i("الحجم والموضع والظهور والتفاعل.", "Size, position, visibility and interaction."),
      body: (<>
        <Section title={i("الحجم والشكل", "Size & shape")}>
          <Row icon={ic(Ruler)} label={i("حجم الجزيرة", "Island size")} hint={i("مقاسات جاهزة؛ التفاصيل الدقيقة في الخيارات المتقدمة", "Size presets; exact dimensions are in advanced options")}>
            <div className="st-chips">{[{ id: "compact", ar: "صغير", en: "Compact", p: { pillWidth: 200, pillHeight: 30, peekWidth: 400, peekHeight: 130, panelWidth: 480, panelHeight: 260 } }, { id: "default", ar: "افتراضي", en: "Default", p: { pillWidth: 220, pillHeight: 34, peekWidth: 460, peekHeight: 148, panelWidth: 520, panelHeight: 290 } }, { id: "large", ar: "كبير", en: "Large", p: { pillWidth: 260, pillHeight: 40, peekWidth: 520, peekHeight: 180, panelWidth: 640, panelHeight: 380 } }].map(x => <button key={x.id} className="st-chip" onClick={() => set({ ...x.p, themeTune: { ...(s.themeTune ?? {}), pillScale: 1, panelScale: 1 } })}>{i(x.ar,x.en)}</button>)}</div>
          </Row>
          <details open={q.trim() ? true : undefined} className="st-advanced"><summary>{i("مقاسات متقدمة", "Advanced dimensions")}</summary>
          <Row icon={ic(Ruler)} label={i("عرض الحبة", "Pill width")} hint={i("مقاس الحبة: العرض للحالة الصغيرة", "Pill size: the width of the small state")}>
            <Slider label={i("عرض الحبة", "Pill width")} value={s.pillWidth ?? 220} min={160} max={280} step={5} format={px} onLive={(v) => set({ pillWidth: v })} onCommit={(v) => set({ pillWidth: v })} />
          </Row>
          <Row icon={ic(Ruler)} label={i("ارتفاع الحبة", "Pill height")} hint={i("ارتفاع الحبة وهي مغلقة", "Height of the pill when closed")}>
            <Slider label={i("ارتفاع الحبة", "Pill height")} value={s.pillHeight ?? 34} min={28} max={44} step={1} format={px} onLive={(v) => set({ pillHeight: v })} onCommit={(v) => set({ pillHeight: v })} />
          </Row>
          <Row icon={ic(Square)} label={i("استدارة الحبة", "Pill corner radius")} hint={i("0 = كبسولة كاملة تلقائيًا", "0 = automatic full capsule")}>
            <Slider label={i("استدارة الحبة", "Pill corner radius")} value={s.pillRadius ?? 0} min={0} max={22} step={1} format={(v) => (v === 0 ? i("تلقائي", "Auto") : `${v} px`)} onCommit={(v) => set({ pillRadius: v })} />
          </Row>
          <Row icon={ic(Ruler)} label={i("عرض اللمحة", "Peek width")} hint={i("عرض الجزيرة لما تتمدد عند المرور", "Island width when it expands on hover")}>
            <Slider label={i("عرض اللمحة", "Peek width")} value={s.peekWidth ?? 460} min={240} max={560} step={4} format={px} onLive={(v) => set({ peekWidth: v })} onCommit={(v) => set({ peekWidth: v })} />
          </Row>
          <Row icon={ic(Ruler)} label={i("ارتفاع اللمحة", "Peek height")} hint={i("ارتفاع الجزيرة في اللمحة", "Island height in the peek")}>
            <Slider label={i("ارتفاع اللمحة", "Peek height")} value={s.peekHeight ?? 148} min={72} max={200} step={2} format={px} onLive={(v) => set({ peekHeight: v })} onCommit={(v) => set({ peekHeight: v })} />
          </Row>
          <Row icon={ic(Square)} label={i("زوايا اللمحة", "Peek corner radius")} hint={i("كل ما زادت صارت أنعم", "The higher, the softer")}>
            <Slider label={i("زوايا اللمحة", "Peek corner radius")} value={s.peekRadius ?? 30} min={12} max={60} step={1} format={px} onLive={(v) => set({ peekRadius: v })} onCommit={(v) => set({ peekRadius: v })} />
          </Row>
          <Row icon={ic(Ruler)} label={i("عرض اللوحة", "Panel width")} hint={i("عرض اللوحة الكاملة", "Width of the full panel")}>
            <Slider label={i("عرض اللوحة", "Panel width")} value={s.panelWidth ?? 520} min={420} max={720} step={4} format={px} onLive={(v) => set({ panelWidth: v })} onCommit={(v) => set({ panelWidth: v })} />
          </Row>
          <Row icon={ic(Ruler)} label={i("ارتفاع اللوحة", "Panel height")} hint={i("ارتفاع اللوحة الكاملة", "Height of the full panel")}>
            <Slider label={i("ارتفاع اللوحة", "Panel height")} value={s.panelHeight ?? 290} min={220} max={420} step={2} format={px} onLive={(v) => set({ panelHeight: v })} onCommit={(v) => set({ panelHeight: v })} />
          </Row>
          <Row icon={ic(Square)} label={i("زوايا اللوحة", "Panel corner radius")} hint={i("استدارة زوايا اللوحة", "Roundness of the panel corners")}>
            <Slider label={i("زوايا اللوحة", "Panel corner radius")} value={s.panelRadius ?? 34} min={16} max={60} step={1} format={px} onLive={(v) => set({ panelRadius: v })} onCommit={(v) => set({ panelRadius: v })} />
          </Row>
          </details>
        </Section>
        <Section title={i("الموضع", "Position")}>
          <Row icon={ic(MapPin)} label={i("موضع الجزيرة", "Position")} hint={i("أين تقع الحبة على الحافة العليا للشاشة", "Where the pill sits along the top edge of the screen")}>
            <Segmented label={i("موضع الجزيرة", "Position")} value={s.pillPosition ?? "center"} onChange={(v) => set({ pillPosition: v })}
              options={[{ value: "left", label: i("يسار", "Left") }, { value: "center", label: i("منتصف", "Center") }, { value: "right", label: i("يمين", "Right") }]} />
          </Row>
          <Row icon={ic(PanelTop)} label={i("وضع التموضع", "Docking mode")} hint={i("عائمة: حبة منفصلة بهامش من الأعلى · ملتصقة: تلتصق بحافة الشاشة العلوية بزوايا علوية مسطّحة", "Floating: a detached pill with a gap from the top · Attached: sits flush on the top screen edge with flat top corners")}>
            <Segmented label={i("وضع التموضع", "Docking mode")} value={s.islandDocking ?? "floating"} onChange={(v) => set({ islandDocking: v })}
              options={[{ value: "floating", label: i("عائمة", "Floating") }, { value: "attached", label: i("ملتصقة بالأعلى", "Attached to top") }]} />
          </Row>
          <Row icon={ic(Move)} label={i("الإزاحة الأفقية", "Horizontal offset")} hint={i("تحريك الحبة يمينًا أو يسارًا من موضعها", "Nudges the pill left or right from its place")}>
            <Slider label={i("الإزاحة الأفقية", "Horizontal offset")} value={s.offsetX ?? 0} min={-800} max={800} step={10} format={px} onCommit={(v) => set({ offsetX: v })} />
          </Row>
          <Row icon={ic(MoveVertical)} label={i("الإزاحة الرأسية", "Vertical offset")} hint={s.islandDocking === "attached" ? i("معطَّلة في وضع الالتصاق: الحبة بلا هامش من أعلى الشاشة", "Disabled in Attached mode: the pill has no gap from the top") : i("المسافة بين الحبة وأعلى الشاشة (للوضع العائم فقط)", "Gap between the pill and the top of the screen (Floating mode only)")}>
            <Slider disabled={s.islandDocking === "attached"} label={i("الإزاحة الرأسية", "Vertical offset")} value={s.offsetY ?? 0} min={0} max={60} step={2} format={px} onCommit={(v) => set({ offsetY: v })} />
          </Row>
        </Section>
        <Section title={i("الفتح والتنقل", "Opening & navigation")}>
          <Row icon={ic(Hourglass)} label={i("مهلة الفتح", "Open delay")} hint={i("كم يبقى الماوس على الجزيرة قبل ما تنفتح", "How long the mouse stays on the island before it opens")}>
            <Slider label={i("مهلة الفتح", "Open delay")} value={s.hoverDelayMs ?? 250} min={0} max={800} step={50} format={ms} onCommit={(v) => set({ hoverDelayMs: v })} />
          </Row>
          <Row icon={ic(MousePointer2)} label={i("منطقة الفتح", "Hover zone")} hint={i("الجزيرة نفسها فقط، أو تحتها أيضاً", "The island itself only, or the area below it too")}>
            <Segmented label={i("منطقة الفتح", "Hover zone")} value={s.hoverZone ?? "island"} onChange={(v) => set({ hoverZone: v })}
              options={[{ value: "island", label: i("الجزيرة", "Island") }, { value: "islandAndBelow", label: i("وتحتها", "And below") }]} />
          </Row>
          <Row icon={ic(MousePointer2)} label={i("تبديل البطاقات بالعجلة", "Wheel switches cards")} hint={i("في اللمحة، العجلة تنقلك بين البطاقات", "In the peek, the mouse wheel moves between cards")}>
            <Toggle label={i("تبديل البطاقات بالعجلة", "Wheel switches cards")} value={s.peekWheelCycle ?? true} onChange={(v) => set({ peekWheelCycle: v })} />
          </Row>
          <Row icon={ic(Layers)} label={i("ترتيب بطاقات اللمحة", "Peek cards order")} hint={i("أول بطاقة هي اللي تطلع أول", "The first card is the one shown first")}>
            <OrderField label={i("ترتيب بطاقات اللمحة", "Peek cards order")} value={normCardOrder(s.peekCardOrder)} onChange={(v) => set({ peekCardOrder: v })}
              labels={{ player: i("المشغّل", "Player"), today: i("اليوم", "Today"), weather: i("الطقس", "Weather"), timer: i("المؤقّت", "Timer") }} />
          </Row>
          <Row icon={ic(MousePointer2)} label={i("التنقل بالعجلة في اللوحة", "Wheel pages in the panel")} hint={i("فوق = الصفحة التالية، تحت = السابقة", "Up = next page, down = previous")}>
            <Toggle label={i("التنقل بالعجلة في اللوحة", "Wheel pages in the panel")} value={s.panelWheelPaging ?? true} onChange={(v) => set({ panelWheelPaging: v })} />
          </Row>
          <Row icon={ic(PanelTop)} label={i("التبويبات في اللوحة", "Panel tabs")} hint={i("دوك سفلي بخمس صفحات (الافتراضي) أو الأشرطة العلوية القديمة", "A bottom dock with five pages (default) or the older top bars")}>
            <Segmented label={i("التبويبات في اللوحة", "Panel tabs")} value={s.panelTabsStyle ?? "dock"} onChange={(v) => set({ panelTabsStyle: v })}
              options={[{ value: "dock", label: i("دوك", "Dock") }, { value: "labels", label: i("نصوص", "Labels") }, { value: "icons", label: i("أيقونات", "Icons") }, { value: "dots", label: i("نقاط", "Dots") }, { value: "hidden", label: i("مخفية", "Hidden") }]} />
          </Row>
        </Section>
        <Section title={i("الظهور", "Visibility")}>
          <Row icon={ic(Eye)} label={i("إخفاء تلقائي", "Auto-hide")} hint={i("تختفي الحبة وهي ساكنة وتعود عند تمرير المؤشر عليها", "The pill fades away at rest and returns when you hover it")}>
            <Toggle label={i("إخفاء تلقائي", "Auto-hide")} value={s.autoHide ?? false} onChange={(v) => set({ autoHide: v })} />
          </Row>
          <Row icon={ic(Maximize2)} label={i("الإخفاء في وضع ملء الشاشة", "Hide in fullscreen")} hint={i("تختفي أثناء الألعاب والفيديو بملء الشاشة؛ المس الحافة العليا لإظهارها", "Hides during fullscreen games and videos; touch the top edge to show it")}>
            <Toggle label={i("الإخفاء في وضع ملء الشاشة", "Hide in fullscreen")} value={s.hideInFullscreen ?? false} onChange={(v) => set({ hideInFullscreen: v })} />
          </Row>
          <Row icon={ic(Percent)} label={i("الشفافية في الراحة", "Opacity at rest")} hint={i("شفافية الحبة وهي ساكنة؛ أقل = أخفّ حضورًا", "How see-through the pill is while resting; lower is subtler")}>
            <Slider label={i("الشفافية في الراحة", "Opacity at rest")} value={s.opacityRest ?? 100} min={20} max={100} step={5} format={pct} onCommit={(v) => set({ opacityRest: v })} />
          </Row>
          <Row icon={ic(Percent)} label={i("الشفافية عند الفتح", "Opacity when open")} hint={i("شفافية اللوحة وهي مفتوحة", "How see-through the panel is when open")}>
            <Slider label={i("الشفافية عند الفتح", "Opacity when open")} value={s.opacityOpen ?? 100} min={20} max={100} step={5} format={pct} onCommit={(v) => set({ opacityOpen: v })} />
          </Row>
          <Row icon={ic(Camera)} label={i("إظهار الحبة في اللقطات", "Show the island in captures")} hint={i("مطفأ: الحبة تُستثنى من اللقطات والتسجيل", "Off: the island is excluded from screenshots and recordings")}>
            <Toggle label={i("إظهار الحبة في اللقطات", "Show the island in captures")} value={s.captureVisible ?? false} onChange={(v) => set({ captureVisible: v })} />
          </Row>
        </Section>
        <Section title={i("المحتوى", "Content")}>
          <Row icon={ic(Clock)} label={i("إظهار الساعة", "Show clock")} hint={i("يعرض الوقت داخل الحبة", "Shows the time inside the pill")}>
            <Toggle label={i("إظهار الساعة", "Show clock")} value={s.showClock ?? true} onChange={(v) => set({ showClock: v })} />
          </Row>
          <Row when={s.showClock !== false} icon={ic(Clock)} label={i("مكان الساعة في الحبة", "Clock position in the pill")} hint={i("اسحب النقطة في الدائرة فتتحرّك الساعة داخل الحبة لأي مكان؛ «تلقائي» يرجع للترتيب الحالي", "Drag the dot in the circle to place the clock anywhere inside the pill; “Auto” restores the current layout")}>
            <div className="flex w-[200px] max-w-full flex-col gap-2">
              <ClockPad x={s.clockX ?? 50} y={s.clockY ?? 50} scale={s.clockScale ?? 100} onChange={(x, y) => set({ clockPosition: "free", clockX: x, clockY: y })} />
              <div className="flex flex-wrap justify-center gap-2">
                <button className={btnOutline} data-testid="clock-auto" onClick={() => set({ clockPosition: "auto" })} aria-pressed={(s.clockPosition ?? "auto") === "auto"}>{i("تلقائي (الحالي)", "Auto (current)")}</button>
                <button className={btnOutline} data-testid="clock-center" onClick={() => set({ clockPosition: "free", clockX: 50, clockY: 50 })}>{i("إعادة للوسط", "Center")}</button>
              </div>
            </div>
          </Row>
          <Row when={s.showClock !== false} icon={ic(Clock)} label={i("حجم الساعة", "Clock size")} hint={i("٦٠–١٨٠٪ من الحجم الأساسي", "60–180% of the base size")}>
            <Slider label={i("حجم الساعة", "Clock size")} value={s.clockScale ?? 100} min={60} max={180} step={5} format={(v) => `${v}%`} onCommit={(v) => set({ clockScale: v })} />
          </Row>
          <Row when={s.eyesEnabled !== false} icon={ic(Eye)} label={i("مكان العيون", "Eyes position")} hint={i("يسار / وسط / يمين الحبة (تلقائي = بجانب الساعة)", "Left / center / right of the pill (Auto = beside the clock)")}>
            <Segmented label={i("مكان العيون", "Eyes position")} value={s.eyesAlign ?? "auto"} onChange={(v) => set({ eyesAlign: v })}
              options={[{ value: "auto", label: i("تلقائي", "Auto") }, { value: "left", label: i("يسار", "Left") }, { value: "center", label: i("وسط", "Center") }, { value: "right", label: i("يمين", "Right") }]} />
          </Row>
          <Row when={s.showClock !== false} icon={ic(Clock)} label={i("نظام الساعة", "Clock format")} hint={i("طريقة عرض الوقت في الحبة", "How the time is shown in the pill")}>
            <Segmented label={i("نظام الساعة", "Clock format")} value={s.clockFormat ?? "auto"} onChange={(v) => set({ clockFormat: v })}
              options={[{ value: "auto", label: i("تلقائي", "Auto") }, { value: "24", label: i("24 ساعة", "24-hour") }, { value: "12", label: i("12 ساعة", "12-hour") }]} />
          </Row>
          <Row icon={ic(Eye)} label={i("عيون التميمة", "Mascot eyes")} hint={i("عينان بجانب الساعة تتبعان المؤشر؛ تُخفى أثناء الميديا والتوفير", "Eyes beside the clock follow the cursor; hidden during media and eco mode")}>
            <Toggle label={i("عيون التميمة", "Mascot eyes")} value={s.eyesEnabled ?? true} onChange={(v) => set({ eyesEnabled: v })} />
          </Row>
        </Section>
      </>),
    },
    {
      id: "appearance", icon: <Palette size={16} />, label: i("المظهر", "Appearance"), desc: i("النمط والزجاج واللون والزوايا والخط والكثافة — تُطبَّق فورًا.", "Theme, glass, color, corners, font and density — applied instantly."),
      body: <AppearanceBody s={s} set={set} />,
    },
    {
      id: "motion", icon: <Zap size={16} />, label: i("الحركة وإمكانية الوصول", "Motion & accessibility"), desc: i("سرعة الحركة ونمط النوابض وتقليلها.", "Animation speed, spring style and reducing motion."),
      body: (<>
        <Section title={i("الحركة", "Motion")}>
          <Row icon={ic(Zap)} label={i("مستوى الحركة", "Motion level")} hint={i("كاملة: حركة حيّة · مخففة: تلاشٍ قصير · متوقفة: بلا حركة", "Full: lively · Reduced: short fades · Off: no motion")}>
            <Segmented label={i("مستوى الحركة", "Motion level")} value={s.motionLevel === "off" ? "off" : s.motionLevel === "reduced" || s.reduceMotion === "always" ? "reduced" : migrateReduce(s.reduceMotion) === "system" ? "system" : "full"} onChange={(v) => set(v === "system" ? { motionLevel: "full", reduceMotion: "system" } : { motionLevel: v, reduceMotion: "never" })}
              options={[{ value: "system", label: i("حسب النظام", "System") }, { value: "full", label: i("كاملة", "Full") }, { value: "reduced", label: i("مخففة", "Reduced") }, { value: "off", label: i("متوقفة", "Off") }]} />
          </Row>
          <Row when={s.motionLevel !== "off" && s.motionLevel !== "reduced" && s.reduceMotion !== "always"} icon={ic(Waves)} label={i("نوع الحركة", "Motion style")} hint={i("إحساس التمدد والرجوع، والهادئ هو المقترح", "How expanding and closing feel; Calm is recommended")}>
            <Select label={i("نوع الحركة", "Motion style")} value={normPreset(s.motionPreset)} onChange={(v) => set({ motionPreset: v, motionBounce: MOTION_PRESETS[v].bounce })}
              options={MOTION_PRESET_KEYS.map((k) => ({ value: k, label: i(MOTION_PRESETS[k].ar, MOTION_PRESETS[k].en) }))} />
          </Row>
          <Row when={s.motionLevel !== "off" && s.motionLevel !== "reduced" && s.reduceMotion !== "always"} icon={ic(Gauge)} label={i("السرعة", "Speed")} hint={i("١ هو الافتراضي، والأعلى أسرع", "1 is the default; higher is faster")}>
            <Slider label={i("السرعة", "Speed")} value={normSpeed(s.motionSpeed)} min={0.5} max={2} step={0.1} format={(v) => `${v.toFixed(1)}×`} onCommit={(v) => set({ motionSpeed: v })} />
          </Row>
          <Row when={s.motionLevel !== "off" && s.motionLevel !== "reduced" && s.reduceMotion !== "always"} icon={ic(Waves)} label={i("الارتداد", "Bounce")} hint={i("صفر يعني بدون اهتزاز، والإغلاق دائماً بدون ارتداد", "Zero means no wobble; closing never bounces")}>
            <Slider label={i("الارتداد", "Bounce")} value={normBounce(s.motionBounce)} min={0} max={0.4} step={0.02} format={(v) => v.toFixed(2)} onCommit={(v) => set({ motionBounce: v })} />
          </Row>

        </Section>
        <AppearanceBody s={s} set={set} section="motion" />
      </>),
    },
    {
      id: "modules", icon: <Blocks size={16} />, label: i("الميزات", "Features"), desc: i("فعّل الوحدات التي تحتاجها وعدّل خياراتها.", "Turn on the modules you need and tune their options."),
      body: (<>
        <Section title={i("التنبيهات", "Alerts")}>
          <Row icon={ic(Volume2)} label={i("صوت التنبيه", "Alert sound")} hint={i("يُعزف مع التذكيرات والمؤقّت والصلاة والاجتماعات", "Plays with reminders, timers, prayers and meetings")}>
            <div className="flex items-center gap-2">
              <Select label={i("صوت التنبيه", "Alert sound")} value={normSound(s.soundChoice)} onChange={(v) => { set({ soundChoice: v }); playSound(v, normVolume(s.soundVolume)); }}
                options={SOUND_IDS.map((id) => ({ value: id, label: i(SOUND_LABELS[id][0], SOUND_LABELS[id][1]) }))} />
              <button className="st-btn" style={{ width: 36, paddingInline: 0 }} aria-label={i("معاينة الصوت", "Preview sound")} data-testid="sound-preview" disabled={normSound(s.soundChoice) === "none"} onClick={() => playSound(normSound(s.soundChoice), normVolume(s.soundVolume))}><Play size={14} className="rtl:-scale-x-100" /></button>
            </div>
          </Row>
          <Row when={normSound(s.soundChoice) !== "none"} icon={ic(Volume2)} label={i("مستوى الصوت", "Sound volume")} hint={i("مستوى صوت التنبيه فقط", "Only the alert sound's loudness")}>
            <Slider label={i("مستوى الصوت", "Sound volume")} value={normVolume(s.soundVolume)} min={0} max={100} step={5} format={pct} onCommit={(v) => set({ soundVolume: v })} />
          </Row>





        </Section>
        <Section title={i("اليوم والصلاة", "Today & prayer")}>
          <Row icon={ic(CalendarClock)} label={i("إظهار قسم «اليوم»", "Show the Today section")} hint={i("بطاقة التاريخ الهجري ومواقيت الصلاة في الرئيسية والنظام (الطقس له مفتاحه أدناه)", "The Hijri date and prayer-times card on Home and System (weather has its own switch below)")}>
            <Toggle label={i("إظهار قسم «اليوم»", "Show the Today section")} value={s.showToday ?? true} onChange={(v) => set({ showToday: v })} />
          </Row>
          <Row icon={ic(MapPin)} label={i("المدينة", "City")} hint={i("مواقيت أم القرى تُحسب محليًا لإحداثيات المدينة", "Umm al-Qura times computed locally for the city")}>
            <Select
              label={i("المدينة", "City")} value={s.prayerCity ?? "riyadh"}
              options={(cities.length ? cities : [{ id: s.prayerCity ?? "riyadh", ar: "الرياض", en: "Riyadh" }]).map((c) => ({ value: c.id, label: s.language === "en" ? c.en : c.ar }))}
              onChange={(v) => set({ prayerCity: v })}
            />
          </Row>
          <Row icon={ic(Cloud)} label={i("الطقس", "Weather")} hint={i("يتصل بـ Open-Meteo (بلا حساب) لمدينتك — مطفأ افتراضيًا", "Connects to Open-Meteo (no account) for your city — off by default")}>
            <Toggle label={i("الطقس", "Weather")} value={s.showWeather ?? false} onChange={(v) => set({ showWeather: v })} />
          </Row>
          <Row when={!!s.showWeather} icon={ic(MapPin)} label={i("مدينة الطقس", "Weather city")} hint={i("المدينة التي يُجلب لها الطقس (الافتراضي المدينة المنورة)", "The city the weather is fetched for (default Madinah)")}>
            <Select
              label={i("مدينة الطقس", "Weather city")} value={s.weatherCity ?? "madinah"}
              options={(cities.length ? cities : [{ id: "madinah", ar: "المدينة المنورة", en: "Madinah" }]).map((c) => ({ value: c.id, label: s.language === "en" ? c.en : c.ar }))}
              onChange={(v) => set({ weatherCity: v })}
            />
          </Row>
          <Row when={!!s.showWeather} icon={ic(Cloud)} label={i("وحدة الحرارة", "Temperature unit")} hint={i("درجة مئوية أو فهرنهايت", "Celsius or Fahrenheit")}>
            <Segmented label={i("وحدة الحرارة", "Temperature unit")} value={s.weatherUnits ?? "c"} onChange={(v) => set({ weatherUnits: v })} options={[{ value: "c", label: "°C" }, { value: "f", label: "°F" }]} />
          </Row>
          <Row icon={ic(Bell)} label={i("تنبيهات الصلاة", "Prayer alerts")} hint={i("قبل 10 دقائق وعند دخول الوقت — بصوت التنبيه إن فُعّل", "10 minutes before and at the time — with the alert sound if set")}>
            <Toggle label={i("تنبيهات الصلاة", "Prayer alerts")} value={s.prayerAlerts ?? true} onChange={(v) => set({ prayerAlerts: v })} />
          </Row>
          <CountdownsEditor s={s} />
          <WorldClockEditor s={s} />
        </Section>
        <Section title={i("الميديا", "Media")}>
          <Row icon={ic(Music)} label={i("طيف الصوت والحبة السائلة", "Audio spectrum & liquid pill")} hint={i("يلتقط صوت الجهاز محليًا أثناء تشغيل الميديا فقط", "Captures system audio locally, only while media plays")}>
            <Toggle label={i("طيف الصوت والحبة السائلة", "Audio spectrum & liquid pill")} value={s.liquidSpectrum ?? false} onChange={(v) => set({ liquidSpectrum: v })} />
          </Row>
          <Row icon={ic(Music)} label={i("تخطيط المشغل", "Player layout")} hint={i("مضغوط، أو غلاف كبير، أو بسيط بدون غلاف", "Compact, large artwork, or minimal without artwork")}>
            <Segmented label={i("تخطيط المشغل", "Player layout")} value={s.playerLayout ?? "compact"} onChange={(v) => set({ playerLayout: v })}
              options={[{ value: "compact", label: i("مضغوط", "Compact") }, { value: "large", label: i("كبير", "Large") }, { value: "minimal", label: i("بسيط", "Minimal") }]} />
          </Row>
          <Row icon={ic(Waves)} label={i("المؤشر الصوتي", "Visualizer")} hint={i("شكل الحركة اللي تبيّن إن فيه صوت شغال", "The motion that shows sound is playing")}>
            <Segmented label={i("المؤشر الصوتي", "Visualizer")} value={s.visualizer ?? "bars"} onChange={(v) => set({ visualizer: v })}
              options={[{ value: "bars", label: i("أشرطة", "Bars") }, { value: "wave", label: i("موجة", "Wave") }, { value: "off", label: i("مطفأ", "Off") }]} />
          </Row>
          <Row icon={ic(Clock)} label={i("الوقت", "Playback time")} hint={i("الوقت المنقضي والمتبقي تحت شريط التقدم", "Elapsed and remaining time under the progress bar")}>
            <Toggle label={i("الوقت", "Playback time")} value={s.showPlaybackTime ?? true} onChange={(v) => set({ showPlaybackTime: v })} />
          </Row>
          <Row icon={ic(Info)} label={i("شارة المصدر", "Source badge")} hint={i("من وين الصوت: YouTube أو Spotify أو غيره", "Where the sound comes from: YouTube, Spotify or others")}>
            <Toggle label={i("شارة المصدر", "Source badge")} value={s.showSourceBadge ?? true} onChange={(v) => set({ showSourceBadge: v })} />
          </Row>
          <Row icon={ic(Gauge)} label={i("شريط التقدم", "Progress bar")} hint={i("الخط اللي يبيّن وين وصلت في الأغنية", "The line that shows how far into the song you are")}>
            <Toggle label={i("شريط التقدم", "Progress bar")} value={s.showProgress ?? true} onChange={(v) => set({ showProgress: v })} />
          </Row>
          <Row icon={ic(Palette)} label={i("خلفية من الغلاف", "Artwork backdrop")} hint={i("خلفية ضبابية بلون غلاف الأغنية", "A blurred backdrop in the album art's colors")}>
            <Toggle label={i("خلفية من الغلاف", "Artwork backdrop")} value={s.artworkBackdrop ?? true} onChange={(v) => set({ artworkBackdrop: v })} />
          </Row>
        </Section>
        <Section title={i("البطارية والشبكة", "Battery & network")}>
          <Row icon={ic(BatteryCharging)} label={i("إظهار البطارية", "Show battery")}>
            <Toggle label={i("إظهار البطارية", "Show battery")} value={s.showBattery ?? false} onChange={(v) => set({ showBattery: v })} />
          </Row>
          <Row when={!!s.showBattery} icon={ic(BatteryCharging)} label={i("نصيحة «افصل الشاحن عند 80%»", "“Unplug at 80%” tip")} hint={i("في قسم البطارية أثناء الشحن", "In the battery section while charging")}>
            <Toggle label={i("نصيحة «افصل الشاحن عند 80%»", "“Unplug at 80%” tip")} value={s.batteryTip ?? true} onChange={(v) => set({ batteryTip: v })} />
          </Row>
          <Row when={!!s.showBattery} icon={ic(BatteryCharging)} label={i("بطاريات أجهزة البلوتوث", "Bluetooth device batteries")} hint={i("يقرأ محليًا مستوى الأجهزة المتصلة (BLE) التي تُبلغه، كل 5 دقائق", "Reads, locally, the level of connected BLE devices that report it, every 5 minutes")}>
            <Toggle label={i("بطاريات أجهزة البلوتوث", "Bluetooth device batteries")} value={s.btBatteries ?? true} onChange={(v) => set({ btBatteries: v })} />
          </Row>
          <Row icon={ic(Network)} label={i("سرعتا الشبكة في الحبة", "Network speed in the pill")} hint={i("تحميل/رفع حاليان من عدّادات ويندوز المحلية؛ يتوقف القياس تمامًا عند الإطفاء.", "Current down/up speed from local Windows counters; measuring stops completely when off.")}>
            <Toggle label={i("سرعتا الشبكة في الحبة", "Network speed in the pill")} value={s.showNetSpeed ?? false} onChange={(v) => set({ showNetSpeed: v })} />
          </Row>
        </Section>
        <Section title={i("الحافظة", "Clipboard")}>
          <Row icon={ic(ClipIcon)} label={i("الحد الأقصى للعناصر", "Item limit")} hint={i("غير المثبّتة تُحذف الأقدم أولًا", "Oldest unpinned items are dropped first")}>
            <NumberField label={i("الحد الأقصى للعناصر", "Item limit")} value={s.clipLimit ?? 200} min={10} max={5000} onCommit={(v) => set({ clipLimit: v })} />
          </Row>
          <Row icon={ic(ClipIcon)} label={i("اللصق عند النقر", "Paste on click")} hint={i("إطفاؤه يضع العنصر في الحافظة فقط", "When off, the item is only copied")}>
            <Toggle label={i("اللصق عند النقر", "Paste on click")} value={s.pasteOnClick ?? true} onChange={(v) => set({ pasteOnClick: v })} />
          </Row>
          <Row icon={ic(Shield)} label={i("تطبيقات مستثناة", "Excluded apps")} hint={i("اسم ملف exe في كل سطر", "One exe name per line")}>
            <LinesField label={i("تطبيقات مستثناة", "Excluded apps")} value={s.clipExcludedApps ?? []} placeholder="keepassxc.exe" onCommit={(v) => set({ clipExcludedApps: v })} />
          </Row>
        </Section>
        <Section title={i("النظام والخصوصية", "System & privacy")}>
          <Row icon={ic(Mic)} label={i("مؤشر الميكروفون والكاميرا", "Mic & camera indicator")} hint={i("نقطة في الحبة أثناء استخدام أي تطبيق لهما — قراءة محلية لسجلّ ويندوز فقط", "A dot in the pill while any app uses them — a local read of the Windows registry only")}>
            <Toggle label={i("مؤشر الميكروفون والكاميرا", "Mic & camera indicator")} value={s.privacyIndicator ?? false} onChange={(v) => set({ privacyIndicator: v })} />
          </Row>
          <Row icon={ic(Cpu)} label={i("تنبيه الحمل المرتفع", "High-load alert")} hint={i("معالج ≥90% لمدة 30 ثانية متواصلة ⇒ تنبيه يسمّي التطبيق المسبّب (مرة كل 10 دقائق كحدّ أقصى). مطفأ افتراضيًا.", "CPU ≥90% for 30 s straight ⇒ an alert naming the culprit app (at most once per 10 min). Off by default.")}>
            <Toggle label={i("تنبيه الحمل المرتفع", "High-load alert")} value={s.loadAlert ?? false} onChange={(v) => set({ loadAlert: v })} />
          </Row>
          <Row icon={ic(Volume2)} label={i("التحكم بالصوت في قسم النظام", "Volume control in System")}>
            <Toggle label={i("التحكم بالصوت في قسم النظام", "Volume control in System")} value={s.showVolume ?? true} onChange={(v) => set({ showVolume: v })} />
          </Row>
          <Row icon={ic(Activity)} label={i("تتبّع زمن التركيز (وقتي)", "Focus-time tracking")}
            hint={i(
              "يعمل افتراضيًا. يسجّل اسم التطبيق الأمامي فقط (بلا عناوين نوافذ أو محتوى) أثناء نشاطك، ويتوقف عند الخمول أكثر من 60 ثانية. يُحفظ على جهازك 30 يومًا ولا يُرسل لأي مكان.",
              "On by default. Records only the foreground app name (no window titles or content) while you're active; pauses after 60 s idle. Stored on this device only for 30 days, never sent anywhere.",
            )}>
            <Toggle label={i("تتبّع زمن التركيز (وقتي)", "Focus-time tracking")} value={s.attentionTracking ?? true} onChange={(v) => set({ attentionTracking: v })} />
          </Row>
          <Row icon={ic(Timer)} label={i("تذكير الاستراحة", "Break reminders")} hint={i("إشعار داخل التطبيق بعد استخدام متواصل (استراحة 5 دقائق تصفّر العدّ)", "In-app notice after continuous use (a 5-minute pause resets the count)")}>
            <Toggle label={i("تذكير الاستراحة", "Break reminders")} value={s.breakReminders ?? false} onChange={(v) => set({ breakReminders: v })} />
          </Row>
          <Row when={!!s.breakReminders} icon={ic(Timer)} label={i("مدة الاستخدام المتواصل (دقيقة)", "Continuous use before a break (min)")}>
            <NumberField label={i("مدة الاستخدام المتواصل (دقيقة)", "Continuous use before a break (min)")} value={s.breakMinutes ?? 60} min={5} max={240} onCommit={(v) => set({ breakMinutes: v })} />
          </Row>
          <Row icon={ic(RotateCcw)} label={i("مسح بيانات وقتي", "Clear My-time data")} hint={i("يحذف كل ما سُجّل محليًا", "Deletes everything recorded locally")}>
            <button data-testid="clear-attention" onBlur={() => setClearArmed(false)} onClick={async () => { if (!clearArmed) { setClearArmed(true); return; } setClearArmed(false); try { await invoke("attention_clear"); setClearMsg(i("مُسحت بيانات الاستخدام", "Usage data cleared")); } catch { setClearMsg(i("تعذّر المسح", "Clear failed")); } }} className={clearArmed ? "st-btn st-btn-danger" : btnOutline}>{clearArmed ? i("تأكيد حذف سجل الاستخدام؟", "Delete usage history?") : i("مسح", "Clear")}</button><span role="status">{clearMsg}</span>
          </Row>
        </Section>
        <Section title={i("الاجتماعات", "Meetings")}>
          <Row icon={ic(CalendarClock)} label={i("عرض الاجتماعات القادمة", "Show upcoming meetings")} hint={i("ميزة شبكية اختيارية: تجلب تقويمك من الرابط أدناه فقط", "Optional network feature: fetches your calendar from the link below only")}>
            <Toggle label={i("عرض الاجتماعات القادمة", "Show upcoming meetings")} value={s.showMeetings ?? false} onChange={(v) => set({ showMeetings: v })} />
          </Row>
          <Row when={!!s.showMeetings} icon={ic(CalendarClock)} label={i("نافذة «اجتماع قريب»", "“Upcoming meeting” window")} hint={i("يظهر الاجتماع في الحبة/الرئيسية بلون نوعه قبل بدئه بهذه المدة", "The meeting shows in the island/Home in its colour this long before it starts")}>
            <Select
              label={i("نافذة «اجتماع قريب»", "“Upcoming meeting” window")} value={s.meetingLeadMin ?? 15}
              options={[5, 10, 15, 30, 60].map((n) => ({ value: n, label: i(`${n} دقيقة`, `${n} min`) }))}
              onChange={(v) => set({ meetingLeadMin: Number(v) })}
            />
          </Row>
          {(s.showMeetings || q.trim()) && <MeetingsKey />}
        </Section>
        <Section title={i("الالتقاط والتسجيل", "Capture & recording")}>
          <Row icon={ic(FolderOpen)} label={i("مجلد اللقطات", "Screenshots folder")} hint={i("فارغ = Pictures\\MyIsland", "Empty = Pictures\\MyIsland")}>
            <TextField label={i("مجلد اللقطات", "Screenshots folder")} value={s.screenshotDir ?? ""} onCommit={(v) => set({ screenshotDir: v })} />
          </Row>
          <Row icon={ic(Film)} label={i("صيغة التسجيل", "Recording format")}>
            <Segmented label={i("صيغة التسجيل", "Recording format")} value={s.recordFormat ?? "mp4"} onChange={(v) => set({ recordFormat: v })} options={[{ value: "mp4", label: "MP4" }, { value: "gif", label: "GIF" }]} />
          </Row>
          <Row icon={ic(Film)} label={i("إطارات التسجيل في الثانية", "Recording FPS")} hint={i("GIF يُسقَّف عند 20", "GIF is capped at 20")}>
            {s.recordFormat === "gif" ? <span className="st-val" data-testid="gif-fps">20 FPS</span> : <Segmented label={i("إطارات التسجيل في الثانية", "Recording FPS")} value={String(s.recordingFps ?? 30) as "30" | "60"} onChange={(v) => set({ recordingFps: Number(v) as 30 | 60 })} options={[{ value: "30", label: "30" }, { value: "60", label: "60" }]} />}
          </Row>
          <Row icon={ic(Film)} label={i("جودة التسجيل", "Recording quality")}>
            <Segmented label={i("جودة التسجيل", "Recording quality")} value={(s.recordingQuality ?? "medium") as "low" | "medium" | "high"} onChange={(v) => set({ recordingQuality: v })}
              options={[{ value: "low", label: i("منخفضة", "Low") }, { value: "medium", label: i("متوسطة", "Medium") }, { value: "high", label: i("عالية", "High") }]} />
          </Row>
          <Row icon={ic(FolderOpen)} label={i("مجلد التسجيلات", "Recordings folder")} hint={i("فارغ = Videos\\MyIsland", "Empty = Videos\\MyIsland")}>
            <TextField label={i("مجلد التسجيلات", "Recordings folder")} value={s.recordingDir ?? ""} onCommit={(v) => set({ recordingDir: v })} />
          </Row>
        </Section>
        <Section title={i("شريط الأوامر", "Command palette")}>
          <Row icon={ic(Command)} label={i("أسعار العملات الحية", "Live currency rates")}
            hint={i(
              "عند تحويل عملة في الشريط تُجلب الأسعار من open.er-api.com وتُخزَّن 12 ساعة؛ بلا اتصال أو مطفأ تُستعمل الأسعار المضمّنة التقريبية.",
              "When you convert a currency in the palette, rates are fetched from open.er-api.com and cached for 12 h; offline or off, the built-in approximate rates are used.",
            )}>
            <Toggle label={i("أسعار العملات الحية", "Live currency rates")} value={s.liveRates ?? true} onChange={(v) => set({ liveRates: v })} />
          </Row>
          <Row icon={ic(Blocks)} label={i("مساحات العمل", "Workspaces")} col
            hint={i("مجموعات تُفتح دفعة واحدة من الشريط: اكتب اسمها أو «ws اسم». كل سطر: مسار تطبيق أو مجلد أو ملف، أو رابط http(s).", "Groups opened at once from the palette: type the name or “ws name”. Each line: an app, folder or file path, or an http(s) link.")}>
            <WorkspacesEditor value={Array.isArray(s.workspaces) ? s.workspaces : []} />
          </Row>
        </Section>
      </>),
    },
    {
      id: "shortcuts", icon: <Keyboard size={16} />, label: i("الاختصارات", "Shortcuts"), desc: i("انقر الحقل ثم اضغط التركيبة · Backspace يمسح (= معطّل) · Esc يلغي.", "Click a field, then press the combo · Backspace clears (= off) · Esc cancels."),
      body: (
        <Section title={i("الاختصارات العامة", "Global shortcuts")}>
          <Row icon={ic(Keyboard)} label={i("إظهار وإخفاء الجزيرة", "Toggle island visibility")} hint={i("اختصار ثابت", "Fixed shortcut")}><kbd dir="ltr">Ctrl+Alt+I</kbd></Row>
          <Row icon={ic(Command)} label={i("اختصار شريط الأوامر", "Command palette hotkey")} hint={i("فارغ = الشريط معطّل", "Empty = palette off")}>
            <ShortcutField label={i("اختصار شريط الأوامر", "Command palette hotkey")} value={s.hotkeyPalette ?? ""} onCommit={(v) => set({ hotkeyPalette: v })} />
          </Row>
          <Row icon={ic(Scan)} label={i("اختصار لقطة منطقة", "Area screenshot hotkey")} hint={i("فارغ = معطّل · PrintScreen يعترض الزر", "Empty = off · PrintScreen intercepts the key")}>
            <ShortcutField label={i("اختصار لقطة منطقة", "Area screenshot hotkey")} value={s.hotkeyArea ?? ""} onCommit={(v) => set({ hotkeyArea: v })} />
          </Row>
          <Row icon={ic(Monitor)} label={i("اختصار لقطة الشاشة", "Full-screen screenshot hotkey")}>
            <ShortcutField label={i("اختصار لقطة الشاشة", "Full-screen screenshot hotkey")} value={s.hotkeyScreen ?? ""} onCommit={(v) => set({ hotkeyScreen: v })} />
          </Row>
          <Row icon={ic(Clapperboard)} label={i("اختصار التسجيل", "Recording hotkey")} hint={i("يبدّل بدء/إيقاف · فارغ = معطّل", "Toggles start/stop · empty = off")}>
            <ShortcutField label={i("اختصار التسجيل", "Recording hotkey")} value={s.hotkeyRecord ?? ""} onCommit={(v) => set({ hotkeyRecord: v })} />
          </Row>
          <Row icon={ic(Palette)} label={i("اختصار منتقي الألوان", "Color picker hotkey")}>
            <ShortcutField label={i("اختصار منتقي الألوان", "Color picker hotkey")} value={s.hotkeyColor ?? ""} onCommit={(v) => set({ hotkeyColor: v })} />
          </Row>
        </Section>
      ),
    },
    {
      id: "perf", icon: <Gauge size={16} />, label: i("الأداء والبطارية", "Performance & battery"), desc: i("وضع التوفير واستهلاك الذاكرة.", "Eco mode and memory usage."),
      body: (
        <Section title={i("الأداء والتوفير", "Performance & saving")}>
          <Row icon={ic(Activity)} label={i("حالة وضع التوفير", "Eco mode status")}><EcoIndicator /></Row>
          <Row icon={ic(Zap)} label={i("وضع التوفير (Eco)", "Eco mode")} hint={i("يوفّر البطارية: يبطّئ الأعمال الخلفية ويخفف الحركة ويستبدل الزجاج بسطح عادي", "Saves battery: slows background work, calms motion and swaps glass for a plain surface")}>
            <Toggle label={i("وضع التوفير (Eco)", "Eco mode")} value={s.ecoMode ?? false} onChange={(v) => set({ ecoMode: v })} />
          </Row>
          <Row icon={ic(BatteryCharging)} label={i("التوفير تلقائيًا على البطارية", "Auto-eco on battery")} hint={i("يشغّل التوفير تلقائيًا عند فصل الشاحن", "Turns eco mode on when the charger is unplugged")}>
            <Toggle label={i("التوفير تلقائيًا على البطارية", "Auto-eco on battery")} value={s.ecoOnBattery ?? false} onChange={(v) => set({ ecoOnBattery: v })} />
          </Row>
          <Row icon={ic(Cpu)} label={i("استهلاك الرام الآن", "RAM usage now")} col><RamUsage /></Row>
        </Section>
      ),
    },
    {
      id: "updates", icon: <RefreshCw size={16} />, label: i("التحديثات", "Updates"), desc: i("فحص الإصدارات الموقّعة.", "Checking signed releases."),
      body: (
        <Section title={i("التحديثات", "Updates")}>
          <Row icon={ic(RefreshCw)} label={i("فحص التحديثات تلقائيًا", "Check for updates automatically")} hint={i("فحص صامت واحد بعد الإقلاع؛ لا يظهر شيء إن لم يوجد تحديث", "One silent check after launch; nothing shows if there is no update")}>
            <Toggle label={i("فحص التحديثات تلقائيًا", "Check for updates automatically")} value={s.updateAutoCheck ?? true} onChange={(v) => set({ updateAutoCheck: v })} />
          </Row>
          <UpdateCheck />
        </Section>
      ),
    },
  ];
  const about: Sec = { id: "about", icon: <Info size={16} />, label: i("حول", "About"), desc: i("الإصدار والمطوّر وما الجديد.", "Version, developer and what's new."), body: <AboutSection /> };
  const system: Sec = { id: "system", icon: <Cpu size={16} />, label: i("النظام", "System"), desc: i("الأداء والتحديثات ومعلومات الإصدار.", "Performance, updates and version information."), body: <>{originalSections.find(x => x.id === "perf")?.body}{originalSections.find(x => x.id === "updates")?.body}{about.body}</> };
  const sections = [...originalSections.filter(x => !["perf", "updates"].includes(x.id)), system];
  const all = sections;
  const searching = q.trim().length > 0;
  const cur = all.find((x) => x.id === tab) ?? all[0];
  const visible = searching ? all : [cur];
    const Item = ({ x }: { x: Sec }) => (
    <button data-nav={x.id} onClick={() => { setTab(x.id); setQ(""); }} aria-current={!searching && cur.id === x.id ? "true" : undefined} className="st-nav-item">
      {!searching && cur.id === x.id && <motion.span layoutId="st-ind" className="st-nav-ind" transition={spring.press} />}
      <span aria-hidden style={{ display: "contents" }}>{x.icon}</span>
      <span dir="auto" className="min-w-0 flex-1 truncate">{x.label}</span>
    </button>
  );
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [tab, searching]);

  return (
    <DirCtx.Provider value={dir}>
      <SearchCtx.Provider value={q}>
        <div dir={dir} className="st-root">
          <aside className="st-side" data-testid="settings-bar">
            <h1 className="st-title">{i("الإعدادات", "Settings")}</h1>
            <label className="st-search">
              <Search size={15} aria-hidden />
              <input type="search" dir="auto" aria-label={i("بحث في الإعدادات", "Search settings")} placeholder={i("بحث في الإعدادات…", "Search settings…")} value={q} onChange={(e) => setQ(e.target.value)} className="st-input" data-testid="settings-search" />
            </label>
            <nav aria-label={i("أقسام الإعدادات", "Settings sections")} className="st-nav">
              {sections.map((x) => <Item key={x.id} x={x} />)}
              <div role="separator" style={{ height: 1, background: "var(--c-border)", margin: "6px 4px" }} />

            </nav>
            <div className="st-side-foot"><span role="status" data-testid="save-status" data-state={saveStatus} className="st-save-status">{saveStatus === "saving" ? i("جارٍ الحفظ…", "Saving…") : saveStatus === "error" ? i("تعذّر الحفظ؛ أعد المحاولة", "Save failed; try again") : saveStatus === "saved" ? i("تم الحفظ", "Saved") : i("تُحفظ التغييرات تلقائيًا", "Changes save automatically")}</span>{saveStatus === "error" && <button className="st-btn" data-testid="retry-save" onClick={() => retrySettingsSave()}>{i("إعادة محاولة الحفظ", "Retry save")}</button>}<QuitButton /></div>
          </aside>
          <main ref={mainRef} className="st-main">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={searching ? "search" : cur.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}>
                {visible.map((x) => (
                  <div key={x.id} className="st-sec" data-group={x.id}>
                    <div className="st-head">
                      <div>
                        <h2>{x.label}</h2>
                        <p dir="auto">{x.desc}</p>
                      </div>
                      {SECTION_KEYS[x.id] && (
                        <button className="st-btn" data-testid={`reset-${x.id}`} onClick={() => set(resetPatch(SECTION_KEYS[x.id]))}><RotateCcw size={14} className="rtl:-scale-x-100" />{i("إعادة ضبط القسم", "Reset section")}</button>
                      )}
                    </div>
                    {x.body}
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </SearchCtx.Provider>
    </DirCtx.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

