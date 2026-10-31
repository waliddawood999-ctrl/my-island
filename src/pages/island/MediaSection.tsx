import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { dur, ease, spring, tap } from "../../motion";
import { i } from "../../i18n";
import type { MediaView } from "../../useMedia";
import { useLyrics } from "../../useLyrics";
import { LyricsView } from "./LyricsView";

/** سطر نصي يتبدّل: دخول بتأخير مستقل وخروج سريع (docs/MOTION.md §تبديل المحتوى). */
const line = (delay: number) => ({
  initial: { opacity: 0, y: 6, filter: "blur(5px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { ...spring.content, delay, opacity: { duration: dur.swap, ease: ease.out, delay } } },
  exit: { opacity: 0, y: -4, filter: "blur(5px)", transition: { duration: dur.fast, ease: ease.inOut } },
});

const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** الموضع الحي: آخر موضع من الخلفية + الزمن المنقضي محليًا أثناء التشغيل. */
function useLivePos(m: MediaView): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!m.info.playing) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [m.info.playing]);
  const base = m.info.position + (m.info.playing ? (performance.now() - m.at) / 1000 : 0);
  return m.info.duration > 0 ? Math.min(base, m.info.duration) : base;
}

/** قسم الميديا في الرئيسية: غلاف + عنوان/فنان + شريط تقدم قابل للنقر + سابق/تشغيل/التالي. */
export function MediaSection({ media, showLyrics = false }: { media: MediaView; showLyrics?: boolean }) {
  const { info, cover, sources } = media;
  const live = useLivePos(media);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const seekT = useRef<number | undefined>(undefined);
  const pos = seekTo ?? live;
  const lyrics = useLyrics(showLyrics && info.session, info.artist, info.title, info.album, info.duration);
  const ctl = (action: string) => invoke("media_control", { action }).catch(() => {});

  if (!info.session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-white/40">
        <Music size={28} />
        <span className="text-[13px]">{i("لا يوجد تشغيل حالي", "Nothing playing")}</span>
      </div>
    );
  }

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!info.can_seek || info.duration <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * info.duration;
    setSeekTo(t); // استجابة فورية حتى يصل التحديث الحقيقي
    window.clearTimeout(seekT.current);
    seekT.current = window.setTimeout(() => setSeekTo(null), 1200);
    invoke("media_seek", { seconds: t }).catch(() => {});
  };

  const pct = info.duration > 0 ? (pos / info.duration) * 100 : 0;
  const btn = "i-btn p-2 text-white";

  return (
    <div className={`flex h-full flex-col items-stretch ${showLyrics ? "gap-3" : "justify-center gap-5"}`}>
      <div className="flex shrink-0 items-center gap-4">
        <motion.div
          initial={false}
          animate={{ scale: info.playing ? 1 : 0.94 }}
          transition={spring.content}
          className={`${showLyrics ? "h-16 w-16" : "h-28 w-28"} shrink-0 overflow-hidden rounded-2xl bg-white/10`}
        >
          {cover ? (
            <img src={cover} alt={i("غلاف الألبوم", "Album cover")} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/40"><Music size={32} /></div>
          )}
        </motion.div>
        <div className="min-w-0 flex-1">
          {/* العنوان والفنان والألبوم: تبديل بتمويه قصير وتوقيت دخول مستقل لكل سطر فلا يتداخل */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`t-${info.title}`} {...line(0)} dir="auto" className="truncate text-[18px] font-semibold">{info.title || i("بدون عنوان", "Untitled")}</motion.div>
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`a-${info.artist}`} {...line(0.05)} dir="auto" className="truncate text-[14px] text-white/60">{info.artist}</motion.div>
          </AnimatePresence>
          {info.album && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`b-${info.album}`} {...line(0.1)} dir="auto" className="truncate text-[12px] text-white/40">{info.album}</motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {showLyrics && (
        <div className="min-h-0 flex-1 [mask-image:linear-gradient(transparent,#000_18%,#000_82%,transparent)]">
          <LyricsView lyrics={lyrics} pos={pos} />
        </div>
      )}

      <div dir="ltr" className="flex items-center gap-3 text-[12px] tabular-nums text-white/60">
        <span className="w-10 text-end">{fmt(pos)}</span>
        <div
          role="slider"
          aria-label={i("شريط التقدم", "Progress")}
          aria-valuemin={0}
          aria-valuemax={Math.round(info.duration)}
          aria-valuenow={Math.round(pos)}
          onClick={onSeek}
          className={`group relative h-4 flex-1 ${info.can_seek && info.duration > 0 ? "cursor-pointer" : ""}`}
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/20">
            <div style={{ width: `${pct}%` }} className="h-full rounded-full bg-white" />
          </div>
        </div>
        <span className="w-10">{info.duration > 0 ? fmt(info.duration) : "--:--"}</span>
      </div>

      <div dir="ltr" className="flex items-center justify-center gap-3">
        <motion.button {...tap} className={btn} disabled={!info.can_prev} onClick={() => ctl("prev")} aria-label={i("السابق", "Previous")} title={i("السابق", "Previous")}>
          <SkipBack size={22} />
        </motion.button>
        <motion.button
          {...tap}
          className="rounded-full bg-white p-3 text-black hover:bg-white/85 active:bg-white/70"
          onClick={() => ctl("toggle")}
          aria-label={info.playing ? i("إيقاف مؤقت", "Pause") : i("تشغيل", "Play")}
          title={info.playing ? i("إيقاف مؤقت", "Pause") : i("تشغيل", "Play")}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={info.playing ? "pause" : "play"}
              initial={{ opacity: 0, scale: 0.7, filter: "blur(3px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: spring.press }}
              exit={{ opacity: 0, scale: 0.7, filter: "blur(3px)", transition: { duration: dur.fast, ease: ease.inOut } }}
              className="flex"
            >
              {info.playing ? <Pause size={22} /> : <Play size={22} />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <motion.button {...tap} className={btn} disabled={!info.can_next} onClick={() => ctl("next")} aria-label={i("التالي", "Next")} title={i("التالي", "Next")}>
          <SkipForward size={22} />
        </motion.button>
      </div>

      {sources.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
          <button
            onClick={() => invoke("media_pick", { id: null }).catch(() => {})}
            className="i-btn px-3 py-1"
          >
            {i("تلقائي", "Auto")}
          </button>
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() => invoke("media_pick", { id: s.id }).catch(() => {})}
              className={`i-btn px-3 py-1 ${s.id === info.source ? "!bg-white/20 !text-white" : ""}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
