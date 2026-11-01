import { useEffect, useRef } from "react";
import { i } from "../../i18n";
import { LottieIcon } from "../../lottie";
import type { LyricsState } from "../../useLyrics";

/** فهرس السطر الجاري: آخر سطر زمنه ≤ الموضع (-1 قبل أول سطر). */
function activeIndex(times: number[], pos: number): number {
  let lo = 0, hi = times.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= pos + 0.15) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

const Note = ({ text, icon }: { text: string; icon?: React.ReactNode }) => (
  <div className="flex h-full items-center justify-center gap-2 text-[13px] text-white/40">{icon}{text}</div>
);

/** عرض الكلمات: متزامنة (تمرير تلقائي + توسيط السطر الجاري) أو عادية قابلة للتمرير. */
export function LyricsView({ lyrics, pos }: { lyrics: LyricsState; pos: number }) {
  const box = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLDivElement | null>(null);
  const d = lyrics.data;
  const synced = !!d && d.found && d.synced && d.lines.length > 0;
  const idx = synced ? activeIndex(d!.lines.map((l) => l.t), pos) : -1;

  useEffect(() => {
    const b = box.current, el = cur.current;
    if (!synced || !b || !el) return;
    const top = el.offsetTop - b.clientHeight / 2 + el.clientHeight / 2;
    b.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [idx, synced, d]);

  if (lyrics.status === "loading") return <Note text={i("جارٍ تحميل الكلمات…", "Loading lyrics…")} />;
  if (!d) return <Note text={i("لا كلمات متاحة", "No lyrics available")} />;
  if (d.offline) return <Note icon={<LottieIcon name="offline" size={36} />} text={i("تعذّر تحميل الكلمات — لا يوجد اتصال بالإنترنت", "Couldn't load lyrics — you're offline")} />;
  if (d.found && d.instrumental) return <Note text={i("مقطوعة موسيقية بلا كلمات", "Instrumental — no lyrics")} />;
  if (!d.found) return <Note text={i("لا كلمات متاحة", "No lyrics available")} />;

  if (synced) {
    return (
      <div ref={box} className="relative h-full overflow-y-auto px-2 py-[40%] text-center [scrollbar-width:none]">
        {d.lines.map((l, n) => (
          <div
            key={n}
            ref={n === idx ? cur : undefined}
            dir="auto"
            className={`py-0.5 text-[15px] transition-all duration-300 ${
              n === idx ? "scale-105 font-semibold text-white" : "text-white/35"
            }`}
          >
            {l.text || "♪"}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div ref={box} className="h-full overflow-y-auto px-3 py-1 text-center text-[14px] leading-relaxed text-white/75 [scrollbar-width:thin]">
      {d.plain.split("\n").map((l, n) => (
        <div key={n} dir="auto" className="min-h-[1em]">{l}</div>
      ))}
    </div>
  );
}
