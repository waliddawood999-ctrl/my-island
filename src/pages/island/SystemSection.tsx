import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, MemoryStick, Sun, Volume1, Volume2, VolumeX } from "lucide-react";
import { i } from "../../i18n";
import { fmtBytes } from "../../useDownloads";
import { useBrightness, useSysinfo, useThrottled, useVolume } from "../../useSystem";

function Meter({ icon, label, pct, detail, warn }: { icon: React.ReactNode; label: string; pct: number; detail: string; warn?: boolean }) {
  return (
    <div className="i-card flex flex-1 flex-col gap-2 p-3">
      <div className="flex items-center gap-2 text-[13px] text-white/70">
        {icon}<span dir="auto">{label}</span>
        <span dir="ltr" className="ms-auto text-[18px] font-semibold tabular-nums text-white">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
        <div style={{ width: `${Math.min(100, pct)}%` }} className={`h-full rounded-full transition-[width] duration-700 ${warn ? "bg-red-400" : "bg-white"}`} />
      </div>
      <span dir="ltr" className="text-[11px] tabular-nums text-white/40">{detail}</span>
    </div>
  );
}

/** قسم «النظام»: المعالج والذاكرة (يُقاسان فقط ما دام هذا القسم مفتوحًا) + الصوت + سطوع الابتوب. */
export function SystemSection({ showVolume }: { showVolume: boolean }) {
  const sys = useSysinfo(true);
  const vol = useVolume(showVolume);
  const bri = useBrightness(true);
  const [volLocal, setVolLocal] = useState<number | null>(null);
  const [briLocal, setBriLocal] = useState<number | null>(null);
  useEffect(() => { if (vol) setVolLocal(null); }, [vol?.volume, vol?.muted]);
  const sendVol = useThrottled((v: number) => { invoke("volume_set", { level: v }).catch(() => {}); });

  const volume = volLocal ?? vol?.volume ?? 0;
  const VolIcon = vol?.muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const level = briLocal ?? bri?.level ?? 0;
  const range = "h-1.5 flex-1 cursor-pointer accent-white";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex gap-3">
        <Meter
          icon={<Cpu size={16} />} label={i("المعالج", "CPU")} pct={sys?.cpu ?? 0} warn={(sys?.cpu ?? 0) >= 90}
          detail={sys ? i("استخدام كلّي", "Total usage") : i("جارٍ القياس…", "Measuring…")}
        />
        <Meter
          icon={<MemoryStick size={16} />} label={i("الذاكرة", "Memory")} pct={sys?.mem_percent ?? 0} warn={(sys?.mem_percent ?? 0) >= 90}
          detail={sys && sys.mem_total > 0 ? `${fmtBytes(sys.mem_used)} / ${fmtBytes(sys.mem_total)}` : "—"}
        />
      </div>
      {showVolume && (
        <div className="i-card flex items-center gap-3 p-3">
          <button
            aria-label={vol?.muted ? i("إلغاء الكتم", "Unmute") : i("كتم", "Mute")}
            title={vol?.muted ? i("إلغاء الكتم", "Unmute") : i("كتم", "Mute")}
            disabled={!vol?.available}
            onClick={() => invoke("volume_mute_toggle").catch(() => {})}
            className="i-btn p-2 text-white"
          >
            <VolIcon size={18} />
          </button>
          <input
            dir="ltr" type="range" min={0} max={100} aria-label={i("مستوى الصوت", "Volume")}
            disabled={!vol?.available} value={Math.round(volume * 100)}
            onChange={(e) => { const v = Number(e.target.value) / 100; setVolLocal(v); sendVol(v); }}
            className={range}
          />
          <span dir="ltr" className="w-10 text-end text-[13px] tabular-nums text-white/70">{vol?.available ? `${Math.round(volume * 100)}%` : "—"}</span>
          <div className="flex gap-1">
            <button className="i-btn px-2 py-1 text-[13px]" disabled={!vol?.available} aria-label={i("خفض الصوت", "Volume down")} onClick={() => invoke("volume_step", { delta: -0.05 }).catch(() => {})}>−</button>
            <button className="i-btn px-2 py-1 text-[13px]" disabled={!vol?.available} aria-label={i("رفع الصوت", "Volume up")} onClick={() => invoke("volume_step", { delta: 0.05 }).catch(() => {})}>+</button>
          </div>
        </div>
      )}
      {bri?.available && (
        <div className="i-card flex items-center gap-3 p-3">
          <Sun size={18} className="mx-2 shrink-0 text-white/70" />
          <input
            dir="ltr" type="range" min={0} max={100} aria-label={i("سطوع الشاشة", "Screen brightness")}
            value={level}
            onChange={(e) => setBriLocal(Number(e.target.value))}
            // الحفظ عند الإفلات فقط (الأمر يمرّ عبر WMI فهو بطيء نسبيًا).
            onPointerUp={() => { if (briLocal !== null) invoke("brightness_set", { level: briLocal }).catch(() => {}); }}
            onKeyUp={() => { if (briLocal !== null) invoke("brightness_set", { level: briLocal }).catch(() => {}); }}
            className={range}
          />
          <span dir="ltr" className="w-10 text-end text-[13px] tabular-nums text-white/70">{level}%</span>
        </div>
      )}
    </div>
  );
}
