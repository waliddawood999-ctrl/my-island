import { Battery as BatteryIcon, Bluetooth, Plug } from "lucide-react";
import { i } from "../../i18n";
import { fmtDuration } from "../../useAttention";
import type { Battery } from "../../useDownloads";
import { BatteryChip } from "./DownloadsSection";

/** هل للقسم ما يُعرض؟ (جهاز مكتبي بلا بطارية لكن بأجهزة بلوتوث يعرض القائمة فقط). */
export const hasBatteryContent = (b: Battery | null, btOn: boolean) =>
  !!b && (b.has_battery || (btOn && (b.bt?.length ?? 0) > 0));

/** قسم البطارية: النسبة + الوقت المتبقي تقديريًا + نصيحة 80% + بطاريات أجهزة البلوتوث المتصلة. */
export function BatterySection({ b, tip, btOn }: { b: Battery | null; tip: boolean; btOn: boolean }) {
  if (!hasBatteryContent(b, btOn) || !b) return null;
  const dur = (min: number) => fmtDuration(min * 60, i("س", "h"), i("د", "m"));
  const bt = btOn ? b.bt ?? [] : [];
  return (
    <div data-testid="battery" className="flex flex-col gap-1.5 text-[12px]">
      <div className="flex items-center gap-2 text-white/60">
        <BatteryIcon size={14} />
        <span>{i("البطارية", "Battery")}</span>
        <span className="ms-auto"><BatteryChip b={b} /></span>
      </div>
      {b.has_battery && b.remaining_min != null && (
        <div data-testid="battery-time" dir="auto" className="text-white/70">
          {b.charging
            ? i("حتى الامتلاء ≈ ", "Full in ≈ ")
            : i("المتبقي ≈ ", "Time left ≈ ")}
          <bdi>{dur(b.remaining_min)}</bdi>
        </div>
      )}
      {tip && b.unplug_tip && (
        <div data-testid="battery-tip" dir="auto" className="flex items-start gap-1.5 text-amber-300">
          <Plug size={13} className="mt-0.5 shrink-0" />
          <span>{i("افصل الشاحن عند 80% للحفاظ على عمر البطارية", "Unplug at 80% to preserve battery health")}</span>
        </div>
      )}
      {bt.map((d) => (
        <div key={d.name} data-testid="bt-battery" className="flex items-center gap-2" dir="auto">
          <Bluetooth size={13} className="shrink-0 text-white/60" />
          <span className="min-w-0 flex-1 truncate">{d.name}</span>
          <span dir="ltr" className={`shrink-0 tabular-nums ${d.percent <= 20 ? "text-red-400" : "text-white/70"}`}>{d.percent}%</span>
        </div>
      ))}
    </div>
  );
}
