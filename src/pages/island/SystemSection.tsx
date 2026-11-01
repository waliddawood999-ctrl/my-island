import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, MemoryStick, Sun, Volume1, Volume2, VolumeX } from "lucide-react";
import { i } from "../../i18n";
import { fmtBytes } from "../../format";
import { useEco } from "../../motion";
import { useBrightness, useSysDepth, useSysHistory, useSysinfo, useThrottled, useVolume } from "../../useSystem";
import { Spark } from "./activity";

function Meter({ icon, label, pct, detail, warn, hist }: { icon: React.ReactNode; label: string; pct: number; detail: string; warn?: boolean; hist: number[] }) {
  return (
    <div className="i-card flex flex-1 flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2 text-[13px] text-white/70">
        {icon}<span dir="auto">{label}</span>
        <span dir="ltr" className="ms-auto text-[18px] font-semibold tabular-nums text-white">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
        <div style={{ width: `${Math.min(100, pct)}%` }} className={`h-full rounded-full transition-[width] duration-700 ${warn ? "bg-red-400" : "bg-white"}`} />
      </div>
      <div className="flex items-center gap-2">
        <span dir="ltr" className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-white/40">{detail}</span>
        {/* منحنى مصغّر SVG خفيف (≤30 عيّنة)؛ يُبنى ويتراكم فقط أثناء فتح التبويب */}
        <div style={{ ["--act" as string]: warn ? "var(--act-rec)" : "var(--act-net)" }}><Spark values={hist} w={96} h={18} lo={0} hi={100} /></div>
      </div>
    </div>
  );
}

/** خلية قياس عميق مضغوطة؛ القيمة الغائبة «—» مع تلميح بالسبب (لا قيمة وهمية). */
function Stat({ label, value, hint, id }: { label: string; value: string | null; hint?: string; id: string }) {
  return (
    <div data-testid={`stat-${id}`} title={value === null ? hint : undefined} className="i-card flex min-w-0 flex-col px-3 py-1">
      <span dir="auto" className="truncate text-[10px] leading-4 text-white/50">{label}</span>
      <span dir="auto" className={`truncate text-[13px] font-semibold leading-5 tabular-nums ${value === null ? "text-white/30" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

/** قسم «النظام»: المعالج والذاكرة بمنحنيين مصغّرين + الصوت + سطوع الابتوب + عمق المراقبة (GPU/حرارة/قدرة/أعلى تطبيق). كل القياس أثناء فتح التبويب فقط. */
export function SystemSection({ showVolume }: { showVolume: boolean }) {
  const { eco } = useEco();
  // وضع التوفير يوقف كل القياس (لا sysinfo_get ولا sysdepth_get)؛ عند إطفائه يعود.
  const sys = useSysinfo(!eco);
  const depth = useSysDepth(!eco);
  const hist = useSysHistory(sys, !eco);
  const vol = useVolume(showVolume);
  const bri = useBrightness(true);
  const [volLocal, setVolLocal] = useState<number | null>(null);
  const [briLocal, setBriLocal] = useState<number | null>(null);
  useEffect(() => { if (vol) setVolLocal(null); }, [vol?.volume, vol?.muted]);
  const sendVol = useThrottled((v: number) => { invoke("volume_set", { level: v }).catch(() => {}); });

  const volume = volLocal ?? vol?.volume ?? 0;
  const VolIcon = vol?.muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const level = briLocal ?? bri?.level ?? 0;
  const range = "h-1.5 min-w-0 flex-1 cursor-pointer accent-white";
  const deg = (v: number | null | undefined) => (v == null ? null : `${Math.round(v)}°C`);
  const noGpuTemp = i("لا يتيحها ويندوز بلا أدوات المورّد", "Windows does not expose it without vendor tools");
  const noSensor = i("لا يكشفها هذا الجهاز عبر ويندوز", "This device does not expose it through Windows");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
      <div className="flex gap-3">
        <Meter
          icon={<Cpu size={16} />} label={i("المعالج", "CPU")} pct={sys?.cpu ?? 0} warn={(sys?.cpu ?? 0) >= 90} hist={hist.cpu}
          detail={eco ? i("متوقف — وضع التوفير", "Paused — saving mode") : sys ? i("استخدام كلّي", "Total usage") : i("جارٍ القياس…", "Measuring…")}
        />
        <Meter
          icon={<MemoryStick size={16} />} label={i("الذاكرة", "Memory")} pct={sys?.mem_percent ?? 0} warn={(sys?.mem_percent ?? 0) >= 90} hist={hist.mem}
          detail={sys && sys.mem_total > 0 ? `${fmtBytes(sys.mem_used)} / ${fmtBytes(sys.mem_total)}` : "—"}
        />
      </div>
      <div className="flex gap-3">
        {showVolume && (
          <div className="i-card flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
            <button
              aria-label={vol?.muted ? i("إلغاء الكتم", "Unmute") : i("كتم", "Mute")}
              title={vol?.muted ? i("إلغاء الكتم", "Unmute") : i("كتم", "Mute")}
              disabled={!vol?.available}
              onClick={() => invoke("volume_mute_toggle").catch(() => {})}
              className="i-btn p-1.5 text-white"
            >
              <VolIcon size={17} />
            </button>
            <input
              dir="ltr" type="range" min={0} max={100} aria-label={i("مستوى الصوت", "Volume")}
              disabled={!vol?.available} value={Math.round(volume * 100)}
              onChange={(e) => { const v = Number(e.target.value) / 100; setVolLocal(v); sendVol(v); }}
              className={range}
            />
            <span dir="ltr" className="w-9 text-end text-[12px] tabular-nums text-white/70">{vol?.available ? `${Math.round(volume * 100)}%` : "—"}</span>
            <div className="flex gap-1">
              <button className="i-btn px-1.5 py-0.5 text-[13px]" disabled={!vol?.available} aria-label={i("خفض الصوت", "Volume down")} onClick={() => invoke("volume_step", { delta: -0.05 }).catch(() => {})}>−</button>
              <button className="i-btn px-1.5 py-0.5 text-[13px]" disabled={!vol?.available} aria-label={i("رفع الصوت", "Volume up")} onClick={() => invoke("volume_step", { delta: 0.05 }).catch(() => {})}>+</button>
            </div>
          </div>
        )}
        {bri?.available && (
          <div className="i-card flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
            <Sun size={17} className="mx-1.5 shrink-0 text-white/70" />
            <input
              dir="ltr" type="range" min={0} max={100} aria-label={i("سطوع الشاشة", "Screen brightness")}
              value={level}
              onChange={(e) => setBriLocal(Number(e.target.value))}
              // الحفظ عند الإفلات فقط (الأمر يمرّ عبر WMI فهو بطيء نسبيًا).
              onPointerUp={() => { if (briLocal !== null) invoke("brightness_set", { level: briLocal }).catch(() => {}); }}
              onKeyUp={() => { if (briLocal !== null) invoke("brightness_set", { level: briLocal }).catch(() => {}); }}
              className={range}
            />
            <span dir="ltr" className="w-9 text-end text-[12px] tabular-nums text-white/70">{level}%</span>
          </div>
        )}
      </div>
      <div data-testid="sys-depth" className="grid grid-cols-3 gap-2">
        <Stat id="gpu" label={i("المعالج الرسومي", "GPU")} value={depth?.gpu == null ? null : `${Math.round(depth.gpu)}%`} hint={noSensor} />
        <Stat id="cpu-temp" label={i("حرارة المعالج", "CPU temp")} value={deg(depth?.temps.cpu)} hint={noSensor} />
        <Stat id="ssd-temp" label={i("حرارة SSD", "SSD temp")} value={deg(depth?.temps.ssd)} hint={noSensor} />
        <Stat id="gpu-temp" label={i("حرارة GPU", "GPU temp")} value={deg(depth?.temps.gpu)} hint={noGpuTemp} />
        <Stat id="power" label={i("القدرة ≈", "Power ≈")} value={depth?.power_w == null ? null : `${depth.power_w.toFixed(1)} W`} hint={noSensor} />
        <Stat id="top-app" label={i("الأعلى استهلاكًا", "Top CPU app")} value={depth?.top ? `${depth.top.name} · ${Math.round(depth.top.cpu)}%` : null} hint={i("لا تطبيق فوق 1%", "No app above 1%")} />
      </div>
    </div>
  );
}
