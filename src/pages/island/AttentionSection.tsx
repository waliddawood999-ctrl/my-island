import { Timer } from "lucide-react";
import { i } from "../../i18n";
import { fmtDuration, type AttentionSnap } from "../../useAttention";

const SHOWN = 4;

/** «وقتي»: أعلى التطبيقات تركيزًا اليوم (محلي فقط؛ العدّ يتوقف عند الخمول). */
export function AttentionSection({ snap }: { snap: AttentionSnap | null }) {
  if (!snap || !snap.enabled) return null;
  const dur = (s: number) => fmtDuration(s, i("س", "h"), i("د", "m"));
  const apps = snap.apps.slice(0, SHOWN);
  const max = apps[0]?.seconds || 1;
  return (
    <div data-testid="attention" className="flex flex-col gap-1.5 text-[12px]">
      <div className="flex items-center gap-2 text-white/60">
        <Timer size={14} />
        <span>{i("وقتي اليوم", "My time today")}</span>
        <span className="ms-auto tabular-nums"><bdi>{snap.total > 0 ? dur(snap.total) : ""}</bdi></span>
      </div>
      {apps.length === 0 ? (
        <span className="text-white/40">{i("لا بيانات بعد", "No data yet")}</span>
      ) : (
        apps.map((a) => (
          <div key={a.app} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span dir="ltr" className="min-w-0 flex-1 truncate capitalize">{a.app}</span>
              <span className="shrink-0 tabular-nums text-white/60"><bdi>{dur(a.seconds)}</bdi></span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-[#8ea2ff]" style={{ width: `${Math.max(4, (a.seconds / max) * 100)}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
