import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { i } from "./i18n";
import { shrinkCover } from "./coverImage";

export type MediaInfo = {
  session: boolean;
  source: string;
  source_name: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  position: number;
  playing: boolean;
  can_prev: boolean;
  can_next: boolean;
  can_seek: boolean;
  /** "gsmtc" = جلسة ميديا حقيقية · "audio" = نشاط صوتي بديل بلا جلسة (بلا عنوان/تحكم) · "" = لا جلسة */
  kind: "gsmtc" | "audio" | "";
  /** جلسة تعذّر جلب خصائصها/خطها الزمني: تُعرض باسم تطبيقها وغلاف عام بدل أن تختفي */
  degraded: boolean;
};
export type MediaSource = { id: string; name: string };

export const NO_MEDIA: MediaInfo = {
  session: false, source: "", source_name: "", title: "", artist: "", album: "",
  duration: 0, position: 0, playing: false, can_prev: false, can_next: false, can_seek: false, kind: "", degraded: false,
};

export type MediaView = { info: MediaInfo; cover: string | null; /** أبعاد الغلاف المعروض بعد التصغير (0 = غير معروف) */ coverW: number; coverH: number; sources: MediaSource[]; at: number; /** مستوى الصوت الحي 0..1 (للنشاط البديل "audio" فقط، وإلا 0) */ level: number };

/** العنوان المعروض: النشاط الصوتي البديل «صوت من <التطبيق>» (لا عنوان مختلق)؛ وجلسة بلا عنوان تُعرض باسم تطبيقها لا فارغة. */
export function mediaTitle(info: MediaInfo): string {
  if (info.kind === "audio") return i(`صوت من ${info.source_name}`, `Audio from ${info.source_name}`);
  return info.title || info.source_name || i("بدون عنوان", "Untitled");
}

/** يعكس media:update / media:cover من media.rs؛ `at` لحظة وصول آخر تحديث (لاستيفاء الموضع محليًا). */
export function useMedia(enabled: boolean): MediaView {
  const [info, setInfo] = useState<MediaInfo>(NO_MEDIA);
  const [cover, setCoverState] = useState<string | null>(null);
  const [coverDims, setCoverDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const coverSeq = useRef(0);
  /** الغلاف الخام ⇒ نسخة بحجم العرض مرة واحدة؛ الرقم التسلسلي يُسقط النتائج المتأخرة عند تبدّل المسار بسرعة. null ⇒ فوري. */
  const setCover = (raw: string | null) => {
    const my = ++coverSeq.current;
    if (!raw) { setCoverState(null); setCoverDims({ w: 0, h: 0 }); return; }
    shrinkCover(raw).then((r) => { if (coverSeq.current === my) { setCoverState(r.uri); setCoverDims({ w: r.w, h: r.h }); } });
  };
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [at, setAt] = useState(() => performance.now());
  const [level, setLevel] = useState(0);
  const lastSrc = useRef(0);

  useEffect(() => {
    if (!enabled) { setInfo(NO_MEDIA); setCover(null); return; }
    let alive = true;
    const loadSources = () => {
      lastSrc.current = Date.now();
      invoke<MediaSource[]>("media_sources").then((s) => alive && setSources(s)).catch(() => {});
    };
    invoke<{ info: MediaInfo; cover: string | null }>("media_now")
      .then((n) => { if (alive) { setInfo(n.info); setCover(n.cover); setAt(performance.now()); } })
      .catch(() => {});
    loadSources();
    const u1 = listen<MediaInfo>("media:update", (e) => {
      setInfo(e.payload);
      setAt(performance.now());
      if (Date.now() - lastSrc.current > 3000) loadSources();
    });
    const u2 = listen<string | null>("media:cover", (e) => setCover(e.payload ?? null));
    return () => { alive = false; u1.then((f) => f()); u2.then((f) => f()); };
  }, [enabled]);

  // مستوى الصوت الحي: يُستمع له فقط أثناء نشاط بديل "audio" (الباقي لا يبثّه Rust أصلًا).
  const audioKind = enabled && info.kind === "audio";
  useEffect(() => {
    if (!audioKind) { setLevel(0); return; }
    const u = listen<number>("media:level", (e) => setLevel(Math.max(0, Math.min(1, e.payload || 0))));
    return () => { u.then((f) => f()); setLevel(0); };
  }, [audioKind]);

  return { info, cover, coverW: coverDims.w, coverH: coverDims.h, sources, at, level };
}
