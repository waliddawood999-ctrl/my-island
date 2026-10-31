import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type LyricLine = { t: number; text: string };
export type Lyrics = {
  found: boolean;
  synced: boolean;
  instrumental: boolean;
  offline: boolean;
  lines: LyricLine[];
  plain: string;
};
export type LyricsState = { status: "idle" | "loading" | "ready"; data: Lyrics | null };

/** كلمات الأغنية الحالية عبر lyrics_get (الخلفية تخزّن مؤقتًا). تُعاد الطلبات عند تغيّر الأغنية فقط. */
export function useLyrics(enabled: boolean, artist: string, title: string, album: string, duration: number): LyricsState {
  const [st, setSt] = useState<LyricsState>({ status: "idle", data: null });
  const dur = Math.round(duration);
  useEffect(() => {
    if (!enabled || !title) { setSt({ status: "idle", data: null }); return; }
    let alive = true;
    setSt({ status: "loading", data: null });
    invoke<Lyrics>("lyrics_get", { artist, title, album, duration: dur })
      .then((d) => alive && setSt({ status: "ready", data: d }))
      .catch(() => alive && setSt({ status: "ready", data: null }));
    return () => { alive = false; };
  }, [enabled, artist, title, album, dur]);
  return st;
}
