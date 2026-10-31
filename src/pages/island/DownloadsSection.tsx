import { motion } from "motion/react";
import { spring } from "../../motion";
import { Battery as BatteryIcon, BatteryCharging, CheckCircle2, Download } from "lucide-react";
import { i } from "../../i18n";
import { fmtBytes, type Battery, type DownloadsSnap } from "../../useDownloads";

/** نسبة البطارية (للوحة والحبة): أيقونة + % ، شحن/توصيل بأيقونة مختلفة. */
export function BatteryChip({ b, size = 14 }: { b: Battery | null; size?: number }) {
  if (!b || !b.has_battery || b.percent == null) return null;
  const Icon = b.charging || b.ac ? BatteryCharging : BatteryIcon;
  return (
    <span
      dir="ltr"
      title={b.charging ? i("يشحن", "Charging") : b.ac ? i("موصول بالتيار", "Plugged in") : i("البطارية", "Battery")}
      className={`inline-flex items-center gap-1 tabular-nums ${b.percent <= 20 && !b.ac ? "text-red-400" : ""}`}
    >
      <Icon size={size} />{b.percent}%
    </span>
  );
}

/** قسم التنزيلات في الرئيسية: الجارية بشريط تقدم وحجم، ثم المكتملة أخيرًا. */
export function DownloadsSection({ snap, battery, showDownloads }: { snap: DownloadsSnap; battery: Battery | null; showDownloads: boolean }) {
  const { active, recent } = snap;
  return (
    <div className="flex h-full flex-col gap-2 text-[12px]">
      <div className="flex items-center gap-2 text-white/60">
        {showDownloads && (
          <>
            <Download size={14} />
            <span>{i("التنزيلات", "Downloads")}</span>
          </>
        )}
        <span className="ms-auto"><BatteryChip b={battery} /></span>
      </div>
      {showDownloads && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {active.length === 0 && recent.length === 0 && (
            <span className="text-white/40">{i("لا تنزيلات حاليًا", "No downloads right now")}</span>
          )}
          {active.map((d) => (
            <div key={d.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2" dir="auto">
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span dir="ltr" className="shrink-0 tabular-nums text-white/60">
                  {d.percent != null ? `${Math.round(d.percent)}% · ` : ""}
                  {d.total ? `${fmtBytes(d.size)} / ${fmtBytes(d.total)}` : fmtBytes(d.size)}
                  {d.speed > 0 ? ` · ${fmtBytes(d.speed)}/s` : ""}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                {d.percent != null ? (
                  <motion.div initial={false} animate={{ width: `${d.percent}%` }} transition={spring.content} className="h-full rounded-full bg-white" />
                ) : (
                  <div className="h-full w-full animate-pulse rounded-full bg-white/60" />
                )}
              </div>
            </div>
          ))}
          {recent.map((d) => (
            <div key={`${d.at}-${d.name}`} className="flex items-center gap-2 text-white/70" dir="auto">
              <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span dir="ltr" className="shrink-0 tabular-nums text-white/50">{fmtBytes(d.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
