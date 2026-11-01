/**
 * منطق بلاطات «لمحة» في الرئيسية (خالص، بلا React/Tauri — يُختبر بـ scripts/home.test.mjs).
 * كل بلاطة تظهر فقط عند تفعيلها وتوفّر بياناتها؛ الترتيب ثابت: الصلاة ← الطقس ← الاجتماع ← البطارية.
 */
import type { MeetingLite } from "./liveActivity";

export type TileKind = "prayer" | "weather" | "meeting" | "battery";
export const TILE_ORDER: readonly TileKind[] = ["prayer", "weather", "meeting", "battery"];

export type TileInput = Partial<Record<TileKind, boolean>>;

/** البلاطات الظاهرة بترتيبها الثابت. */
export function visibleTiles(inp: TileInput): TileKind[] {
  return TILE_ORDER.filter((k) => !!inp[k]);
}

/** أقرب اجتماع لم يبدأ بعد (start > now)؛ ما بدأ فعلًا يخصّ بطاقة النشاط الحي لا البلاطة. لا شيء ⇒ null. */
export function nextMeeting<T extends MeetingLite>(items: readonly T[], now: number): T | null {
  let best: T | null = null;
  for (const m of items) {
    if (!Number.isFinite(m.start) || m.start <= now) continue;
    if (!best || m.start < best.start) best = m;
  }
  return best;
}
