import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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
};
export type MediaSource = { id: string; name: string };

export const NO_MEDIA: MediaInfo = {
  session: false, source: "", source_name: "", title: "", artist: "", album: "",
  duration: 0, position: 0, playing: false, can_prev: false, can_next: false, can_seek: false, kind: "",
};

export type MediaView = { info: MediaInfo; cover: string | null; sources: MediaSource[]; at: number };

/** يعكس media:update / media:cover من media.rs؛ `at` لحظة وصول آخر تحديث (لاستيفاء الموضع محليًا). */
export function useMedia(enabled: boolean): MediaView {
  const [info, setInfo] = useState<MediaInfo>(NO_MEDIA);
  const [cover, setCover] = useState<string | null>(null);
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [at, setAt] = useState(() => performance.now());
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

  return { info, cover, sources, at };
}
