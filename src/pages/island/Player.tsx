import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FastAverageColor } from "fast-average-color";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { LottieIcon } from "../../lottie";
import { i } from "../../i18n";
import type { Settings } from "../../settings";
import { mediaTitle, type MediaView } from "../../useMedia";
import { classifySource, vibrant } from "../../mediaSource";

// المشغّل (T03): عناصر مشتركة بين اللمحة واللوحة والحبة — غلاف، شارة مصدر، شريط تقدّم، أزرار، مؤشر صوتي، لون إبراز من الغلاف.
// البيانات من GSMTC عبر media.rs (media_now/media:update/media:cover/media_control/media_seek) — لا أوامر جديدة.

const fac = new FastAverageColor();
const accentCache = new Map<string, string>();

/** لون الإبراز: auto ⇒ من الغلاف (fast-average-color، مفضّل الحيوي، مخزَّن لكل أغنية)؛ fixed أو بلا غلاف ⇒ accentColor. */
/** بصمة رخيصة لنص الغلاف (الطول + عينات منه): تتغيّر حين تستبدل GSMTC أيقونة المتصفح البديلة بصورة الفيديو لنفس المسار. */
export function coverKey(cover: string | null): string {
  if (!cover) return "";
  const n = cover.length; let h = n;
  for (let k = 0; k < 64; k++) h = (h * 31 + cover.charCodeAt(Math.floor((k / 64) * (n - 1)))) | 0;
  return `${n}:${h}`;
}

/** لون الإبراز: auto ⇒ من **مصغّرة الوسائط الفعلية** (fast-average-color، مفضّل الحيوي)؛ المخزَّن يُفتَّح بالمسار + بصمة الغلاف فيُعاد حسابه عند تبدّل الصورة.
 *  fixed أو بلا غلاف ⇒ accentColor. */
export function useAccent(cover: string | null, trackKey: string, s: Partial<Settings>): string {
  const fixed = s.accentColor || "#4fd1c5";
  const key = `${trackKey}#${coverKey(cover)}`;
  const [auto, setAuto] = useState<string | null>(() => accentCache.get(key) ?? null);
  useEffect(() => {
    if (s.accentMode === "fixed" || !cover) { setAuto(null); return; }
    const hit = accentCache.get(key);
    if (hit) { setAuto(hit); return; }
    let alive = true;
    fac.getColorAsync(cover, { algorithm: "dominant", ignoredColor: [[255, 255, 255, 255, 30], [0, 0, 0, 255, 30]] })
      .then((c) => {
        if (!alive) return;
        const v = vibrant([c.value[0], c.value[1], c.value[2]]);
        if (accentCache.size > 40) accentCache.clear();
        accentCache.set(key, v); setAuto(v);
      })
      .catch(() => alive && setAuto(null));
    return () => { alive = false; };
  }, [key, s.accentMode]); // eslint-disable-line react-hooks/exhaustive-deps
  return s.accentMode === "fixed" ? fixed : auto ?? fixed;
}

/** الموضع الحيّ: آخر موضع من GSMTC + الزمن المنقضي محليًا؛ نبضة 1ث فقط أثناء التشغيل والظهور (بلا rAF). */
export function usePos(m: MediaView, active: boolean): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active || !m.info.playing) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [active, m.info.playing]);
  const base = m.info.position + (m.info.playing ? (performance.now() - m.at) / 1000 : 0);
  return m.info.duration > 0 ? Math.min(Math.max(0, base), m.info.duration) : Math.max(0, base);
}

const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** مستويات الطيف الحقيقية (media:bands) إن وصلت حديثًا؛ وإلا null فيُستعمل التحريك الاصطناعي. */
function useBands(on: boolean) {
  const ref = useRef<{ v: number[]; t: number }>({ v: [], t: 0 });
  useEffect(() => {
    if (!on) return;
    const un = listen<number[]>("media:bands", (e) => { ref.current = { v: e.payload, t: performance.now() }; });
    return () => { un.then((f) => f()); };
  }, [on]);
  return ref;
}

/**
 * المؤشر الصوتي: bars (شرائط تتحرك بـscaleY بين 0.18 و1) أو wave (خط جيبي SVG) أو off.
 * حلقة rAF واحدة تعمل فقط أثناء التشغيل والظهور؛ عند الإيقاف تهبط المستويات برفق ثم تتوقف تمامًا (0 rAF في الخمول).
 * تقليل الحركة ⇒ ساكن. المستويات من طيف WASAPI إن توفّر وإلا اصطناعية.
 */
export const Visualizer = memo(function Visualizer({ kind, count, playing, visible, reduce, accent, w = 5, h = 18 }: {
  kind: "bars" | "wave" | "off"; count: number; playing: boolean; visible: boolean; reduce: boolean; accent: string; w?: number; h?: number;
}) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const line = useRef<SVGPolylineElement>(null);
  const lv = useRef<number[]>(Array.from({ length: 12 }, () => 0.18));
  const bands = useBands(kind !== "off" && playing && visible);
  const run = kind !== "off" && visible && !reduce;
  useEffect(() => {
    if (kind === "off") return;
    const paint = (ph: number) => {
      if (kind === "bars") {
        for (let n = 0; n < count; n++) { const e = bars.current[n]; if (e) e.style.transform = `scaleY(${lv.current[n].toFixed(3)})`; }
      } else if (line.current) {
        const W = 60, H = 20, N = 24; const pts: string[] = [];
        const amp = Math.max(0.1, lv.current.slice(0, count).reduce((a, b) => a + b, 0) / Math.max(1, count));
        for (let n = 0; n <= N; n++) {
          const x = (n / N) * W, taper = Math.sin((n / N) * Math.PI);
          pts.push(`${x.toFixed(1)},${(H / 2 + Math.sin(n * 0.7 + ph) * amp * (H / 2 - 2) * taper).toFixed(1)}`);
        }
        line.current.setAttribute("points", pts.join(" "));
      }
    };
    if (!run) { lv.current = lv.current.map(() => (reduce && playing ? 0.55 : 0.18)); paint(0); return; }
    let raf = 0;
    const step = (t: number) => {
      const b = bands.current; const fresh = b.v.length > 0 && t - b.t < 400;
      let moving = false;
      for (let n = 0; n < count; n++) {
        let target = 0.18;
        if (playing) {
          target = fresh ? Math.max(0.18, Math.min(1, (b.v[Math.floor((n / count) * b.v.length)] ?? 0) * 1.4))
            : 0.3 + 0.7 * Math.abs(Math.sin(t / (210 + n * 53) + n * 1.7)) * (0.65 + 0.35 * Math.sin(t / 1100 + n));
        }
        const cur = lv.current[n]; const nx = cur + (target - cur) * 0.2;
        lv.current[n] = nx;
        if (playing || nx > 0.2) moving = true;
      }
      paint(t / 260);
      if (playing || moving) raf = requestAnimationFrame(step); // يتوقف ذاتيًا بعد الهبوط
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [kind, count, playing, run, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  if (kind === "off") return null;
  if (kind === "wave") {
    return (
      <svg aria-hidden data-viz="wave" width={60} height={20} viewBox="0 0 60 20" style={{ flex: "none", overflow: "visible" }}>
        <polyline ref={line} points="0,10 60,10" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <span aria-hidden data-viz="bars" dir="ltr" style={{ display: "inline-flex", alignItems: "center", gap: Math.max(2, w * 0.45), height: h, flex: "none" }}>
      {Array.from({ length: count }, (_, n) => (
        <span key={n} ref={(e) => { bars.current[n] = e; }} style={{ width: w, height: h, borderRadius: w, background: accent, transformOrigin: "center", transform: "scaleY(0.18)", willChange: "transform" }} />
      ))}
    </span>
  );
});

/** شارة المصدر: كبسولة، 10px/600، خلفية rgba(255,255,255,.12)، نقطة 6px بلون المصدر (محايدة لغير Spotify/YouTube). */
export function SourceBadge({ aumid, name }: { aumid: string; name: string }) {
  const b = useMemo(() => classifySource(aumid, name), [aumid, name]);
  if (!b.label) return null;
  return (
    <span data-testid="source-badge" data-source={b.kind} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,.12)", fontSize: 10, fontWeight: 600, lineHeight: 1.3, maxWidth: 140 }}>
      <span style={{ width: 6, height: 6, borderRadius: 6, flex: "none", background: b.color ?? "rgba(255,255,255,.55)" }} />
      <span dir="auto" className="truncate">{b.label}</span>
    </span>
  );
}

/** الغلاف: نصف قطر 24٪ (لمحة) / 18٪ (لوحة) من حجمه، وظل بلون الإبراز. */
export function Artwork({ cover, size, radiusPct, accent }: { cover: string | null; size: number; radiusPct: number; accent: string }) {
  return (
    <div data-testid="artwork" style={{ width: size, height: size, flex: "none", borderRadius: size * radiusPct, overflow: "hidden", background: "rgba(255,255,255,.1)", boxShadow: `0 10px 30px -6px ${accent}bb, 0 0 0 1px rgba(255,255,255,.08)` }}>
      {cover ? <img src={cover} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "rgba(255,255,255,.4)" }}><Music size={Math.round(size * 0.4)} /></div>}
    </div>
  );
}

/** شريط التقدّم: LTR دائمًا، مسار rgba(255,255,255,.16) + تعبئة بلون الإبراز بـscaleX ينتقل 1ث خطيًا (بلا rAF). */
export function Progress({ pos, dur, playing, accent, h, reduce, onSeek }: { pos: number; dur: number; playing: boolean; accent: string; h: number; reduce: boolean; onSeek?: (frac: number) => void }) {
  const p = dur > 0 ? Math.min(1, Math.max(0, pos / dur)) : 0;
  return (
    <div dir="ltr" data-testid="progress" onClick={(e) => {
      if (!onSeek) return; e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    }} style={{ height: Math.max(h, 12), display: "flex", alignItems: "center", cursor: onSeek ? "pointer" : "default" }}>
      <div style={{ width: "100%", height: h, borderRadius: h, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: h, background: accent, transformOrigin: "left", transform: `scaleX(${p})`, transition: playing && !reduce ? "transform 1s linear" : "none" }} />
      </div>
    </div>
  );
}

export function Times({ pos, dur }: { pos: number; dur: number }) {
  return (
    <div dir="ltr" data-testid="times" style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
      <span>{fmt(pos)}</span><span>{dur > 0 ? `-${fmt(dur - pos)}` : "--:--"}</span>
    </div>
  );
}

/** أزرار التحكم (LTR، gap 14): سابق/تشغيل-إيقاف/تالٍ — الضغط لا يفتح الجزيرة ولا يغلقها. */
export function Controls({ info, accent }: { info: MediaView["info"]; accent?: string }) {
  const ctl = (e: React.MouseEvent, action: string) => { e.stopPropagation(); invoke("media_control", { action }).catch(() => {}); };
  void accent;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div dir="ltr" data-testid="player-controls" onClick={stop} onMouseDown={stop} style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <button className="pl-btn pl-ghost" disabled={!info.can_prev} onClick={(e) => ctl(e, "prev")} aria-label={i("السابق", "Previous")} title={i("السابق", "Previous")}><SkipBack size={16} fill="currentColor" /></button>
      <button className="pl-btn pl-play" disabled={info.kind === "audio"} onClick={(e) => ctl(e, "toggle")} aria-label={info.playing ? i("إيقاف مؤقت", "Pause") : i("تشغيل", "Play")} title={info.playing ? i("إيقاف مؤقت", "Pause") : i("تشغيل", "Play")}>
        {info.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginInlineStart: 2 }} />}
      </button>
      <button className="pl-btn pl-ghost" disabled={!info.can_next} onClick={(e) => ctl(e, "next")} aria-label={i("التالي", "Next")} title={i("التالي", "Next")}><SkipForward size={16} fill="currentColor" /></button>
    </div>
  );
}

export interface PlayerProps { media: MediaView; s: Partial<Settings>; accent: string; reduce: boolean; visible: boolean; }

const Empty = ({ icon }: { icon?: ReactNode }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2" style={{ opacity: 0.5 }}>
    {icon ?? <LottieIcon name="empty" size={56} />}
    <span style={{ fontSize: 13 }}>{i("لا يوجد تشغيل حالي", "Nothing playing")}</span>
  </div>
);

const sub = (info: MediaView["info"]) => [info.artist, info.album].filter(Boolean).join(" · ");

/** بطاقة المشغّل في اللمحة: غلاف (50/64/مخفي) + عنوان 14/600 + فنان 12 + تقدّم 3px + وقت + مؤشر. */
export function PlayerPeek({ media, s, accent, reduce, visible }: PlayerProps) {
  const { info, cover } = media;
  const layout = s.playerLayout ?? "compact";
  const pos = usePos(media, visible);
  if (!info.session) return <Empty />;
  const art = layout === "minimal" ? 0 : layout === "large" ? 64 : 50;
  const viz = s.visualizer ?? "bars";
  return (
    <div data-testid="player-peek" style={{ display: "flex", alignItems: "center", gap: 14, height: "100%", ["--player-accent" as string]: accent }}>
      {art > 0 && <Artwork cover={cover} size={art} radiusPct={0.24} accent={accent} />}
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        {(s.showSourceBadge ?? true) && <div><SourceBadge aumid={info.source} name={info.source_name} /></div>}
        <div dir="auto" className="truncate" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{mediaTitle(info)}</div>
        <div dir="auto" className="truncate" style={{ fontSize: 12, opacity: 0.62 }}>{sub(info) || " "}</div>
        {(s.showProgress ?? true) && <Progress pos={pos} dur={info.duration} playing={info.playing} accent={accent} h={3} reduce={reduce} />}
        {(s.showPlaybackTime ?? true) && (s.showProgress ?? true) && <Times pos={pos} dur={info.duration} />}
      </div>
      <Visualizer kind={viz} count={5} playing={info.playing} visible={visible} reduce={reduce} accent={accent} w={4} h={26} />
    </div>
  );
}

/** المشغّل في اللوحة (تبويب الرئيسية): غلاف 112/150/مخفي + عنوان 20/650 + «فنان · ألبوم» 13 + تقدّم 5px + أزرار. */
export function PlayerPanel({ media, s, accent, reduce, visible }: PlayerProps) {
  const { info, cover, sources } = media;
  const layout = s.playerLayout ?? "compact";
  const pos = usePos(media, visible);
  const [seek, setSeek] = useState<number | null>(null);
  if (!info.session) return <Empty />;
  const art = layout === "minimal" ? 0 : layout === "large" ? 150 : 112;
  const shown = seek ?? pos;
  const onSeek = info.can_seek && info.duration > 0 ? (f: number) => {
    const t = f * info.duration; setSeek(t); window.setTimeout(() => setSeek(null), 1200);
    invoke("media_seek", { seconds: t }).catch(() => {});
  } : undefined;
  return (
    <div data-testid="player-panel" style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, height: "100%", ["--player-accent" as string]: accent }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {art > 0 && <Artwork cover={cover} size={art} radiusPct={0.18} accent={accent} />}
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {(s.showSourceBadge ?? true) ? <SourceBadge aumid={info.source} name={info.source_name} /> : <span />}
            <Visualizer kind={s.visualizer ?? "bars"} count={7} playing={info.playing} visible={visible} reduce={reduce} accent={accent} w={4} h={20} />
          </div>
          <div dir="auto" className="truncate" style={{ fontSize: 20, fontWeight: 650, lineHeight: 1.2 }}>{mediaTitle(info)}</div>
          <div dir="auto" className="truncate" style={{ fontSize: 13, opacity: 0.65 }}>{sub(info) || " "}</div>
          {(s.showProgress ?? true) && <div style={{ marginTop: 4 }}><Progress pos={shown} dur={info.duration} playing={info.playing && seek === null} accent={accent} h={5} reduce={reduce} onSeek={onSeek} /></div>}
          {(s.showPlaybackTime ?? true) && (s.showProgress ?? true) && <Times pos={shown} dur={info.duration} />}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}><Controls info={info} /></div>
      {sources.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5" style={{ fontSize: 11 }}>
          <button onClick={(e) => { e.stopPropagation(); invoke("media_pick", { id: null }).catch(() => {}); }} className="i-btn px-2.5 py-0.5">{i("تلقائي", "Auto")}</button>
          {sources.map((x) => (
            <button key={x.id} onClick={(e) => { e.stopPropagation(); invoke("media_pick", { id: x.id }).catch(() => {}); }} className={`i-btn px-2.5 py-0.5 ${x.id === info.source ? "!bg-white/20 !text-white" : ""}`}>{x.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** محتوى الحبة المنكمشة أثناء التشغيل: مصغّرة الغلاف + 4 أشرطة (داخل الحبة نفسها، لا تغيّر مقاسها). */
export function PillMedia({ media, accent, reduce, visible, k, viz, dots }: { media: MediaView; accent: string; reduce: boolean; visible: boolean; k: number; viz: "bars" | "wave" | "off"; dots?: ReactNode }) {
  const { info, cover } = media;
  const a = Math.round(20 * k);
  return (
    <div dir="ltr" data-testid="capsule-media" data-kind="media" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", paddingInline: Math.round(8 * k) }}>
      <div style={{ width: a, height: a, flex: "none", borderRadius: a * 0.28, overflow: "hidden", background: "rgba(255,255,255,.12)" }}>
        {cover ? <img src={cover} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <Music size={Math.round(a * 0.6)} style={{ margin: "20%" }} />}
      </div>
      <span dir="auto" className="min-w-0 flex-1 truncate" style={{ textAlign: "start", fontSize: 12.5 * k }}>{mediaTitle(info)}</span>
      <Visualizer kind={viz === "off" ? "off" : "bars"} count={4} playing={info.playing} visible={visible} reduce={reduce} accent={accent} w={Math.round(3 * k)} h={Math.round(14 * k)} />
      {dots}
    </div>
  );
}
