// أصوات التنبيه — مولَّدة برمجيًا بـWebAudio (لا ملفات صوت، لا شبكة، لا ترخيص خارجي: ملكية المشروع، انظر docs/ASSETS.md).
// تُعزف في نافذة الجزيرة عند وصول island:note (تذكير/مؤقّت/صلاة/اجتماع/استراحة)، وكمعاينة من الإعدادات.
export const SOUND_IDS = ["chime", "glass", "pop", "bubble", "bell", "none"] as const;
export type SoundId = (typeof SOUND_IDS)[number];
export const SOUND_LABELS: Record<SoundId, [string, string]> = {
  chime: ["رنين ناعم", "Soft chime"],
  glass: ["نقرة زجاج", "Glass tap"],
  pop: ["فقاعة قصيرة", "Pop"],
  bubble: ["فقاعة صاعدة", "Bubble"],
  bell: ["جرس", "Bell"],
  none: ["بلا صوت", "None"],
};
export const normSound = (v: unknown): SoundId => (SOUND_IDS as readonly string[]).includes(v as string) ? (v as SoundId) : "chime";
export const normVolume = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 70);

/** وصفة صوت: قائمة نغمات (تردد بدء/نهاية، بدء، مدة، ذروة، موجة). مفصولة عن WebAudio ليسهل اختبارها. */
export interface Tone { f0: number; f1?: number; at: number; dur: number; peak: number; type?: OscillatorType }
export const RECIPES: Record<Exclude<SoundId, "none">, Tone[]> = {
  chime: [{ f0: 880, at: 0, dur: 0.9, peak: 0.5 }, { f0: 1320, at: 0.0, dur: 0.7, peak: 0.22 }, { f0: 1175, at: 0.14, dur: 1.0, peak: 0.4 }],
  glass: [{ f0: 2093, at: 0, dur: 0.35, peak: 0.4 }, { f0: 3136, at: 0, dur: 0.22, peak: 0.2 }, { f0: 4186, at: 0, dur: 0.12, peak: 0.1 }],
  pop: [{ f0: 520, f1: 140, at: 0, dur: 0.11, peak: 0.7 }],
  bubble: [{ f0: 320, f1: 900, at: 0, dur: 0.16, peak: 0.5 }, { f0: 560, f1: 1300, at: 0.07, dur: 0.14, peak: 0.25 }],
  bell: [{ f0: 523.25, at: 0, dur: 1.6, peak: 0.45 }, { f0: 1444, at: 0, dur: 1.0, peak: 0.2 }, { f0: 2825, at: 0, dur: 0.6, peak: 0.1 }],
};
/** مدة الصوت الكلية (ثوانٍ). */
export const soundLength = (id: SoundId): number => id === "none" ? 0 : Math.max(...RECIPES[id].map((t) => t.at + t.dur));

let ctx: AudioContext | null = null;
/** يعزف الصوت؛ الفشل صامت (لا سياق صوت/سياسة autoplay). volume 0..100. */
export function playSound(id: SoundId, volume: number): void {
  if (id === "none" || volume <= 0) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.value = (volume / 100) ** 1.5 * 0.9; // منحنى إدراك أنعم من الخطي
    master.connect(ctx.destination);
    for (const t of RECIPES[id]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = t.type ?? "sine";
      o.frequency.setValueAtTime(t.f0, t0 + t.at);
      if (t.f1) o.frequency.exponentialRampToValueAtTime(t.f1, t0 + t.at + t.dur);
      g.gain.setValueAtTime(0.0001, t0 + t.at);
      g.gain.exponentialRampToValueAtTime(t.peak, t0 + t.at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.at + t.dur);
      o.connect(g); g.connect(master);
      o.start(t0 + t.at); o.stop(t0 + t.at + t.dur + 0.05);
    }
  } catch { /* لا صوت */ }
}
