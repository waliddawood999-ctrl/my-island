// استخراج سواتش الغلاف (Living Artwork): Vibrant و DarkMuted و Muted من بكسلات مصغّرة — نقي بلا DOM (يُختبر في scripts/theme.test.mjs).
// الطريقة: صناديق 4 بت لكل قناة (4096)، لكل سواتش هدف (تشبّع، إضاءة HSL) وحدود، والدرجة = 3·قرب التشبّع + 6·قرب الإضاءة + 1·الكثافة (وزن شائع في مستخرجات اللوحات).
import { rgbToHex, type RGB } from "./themeEngine";

export interface ArtSwatches { vibrant: string | null; darkMuted: string | null; muted: string | null; avg: string }
interface Bin { n: number; s: [number, number, number] }
const hsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [0, s, l];
};
interface Target { s: number; l: number; sMin: number; sMax: number; lMin: number; lMax: number }
const TARGETS: Record<"vibrant" | "darkMuted" | "muted", Target> = {
  vibrant: { s: 0.75, l: 0.5, sMin: 0.35, sMax: 1, lMin: 0.3, lMax: 0.7 },
  darkMuted: { s: 0.3, l: 0.26, sMin: 0, sMax: 0.4, lMin: 0.08, lMax: 0.45 },
  muted: { s: 0.3, l: 0.5, sMin: 0, sMax: 0.4, lMin: 0.3, lMax: 0.7 },
};

/** px = بكسلات RGBA متتابعة (ImageData.data). يعيد null إن لم يوجد بكسل معتم. */
export function extractSwatches(px: ArrayLike<number>): ArtSwatches | null {
  const bins = new Map<number, Bin>();
  let total = 0; const sum: [number, number, number] = [0, 0, 0];
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    total++; sum[0] += r; sum[1] += g; sum[2] += b;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(k) ?? { n: 0, s: [0, 0, 0] as [number, number, number] };
    e.n++; e.s[0] += r; e.s[1] += g; e.s[2] += b; bins.set(k, e);
  }
  if (!total) return null;
  const avg = rgbToHex([sum[0] / total, sum[1] / total, sum[2] / total]);
  let maxN = 1; for (const e of bins.values()) if (e.n > maxN) maxN = e.n;
  const pick = (t: Target): string | null => {
    let best = -1, out: RGB | null = null;
    for (const [key, e] of [...bins.entries()].sort((a, b) => a[0] - b[0])) { // ترتيب ثابت ⇒ نتيجة حتمية
      const c: RGB = [e.s[0] / e.n, e.s[1] / e.n, e.s[2] / e.n];
      const [, s, l] = hsl(c[0], c[1], c[2]);
      if (s < t.sMin || s > t.sMax || l < t.lMin || l > t.lMax) continue;
      const score = 3 * (1 - Math.abs(s - t.s)) + 6 * (1 - Math.abs(l - t.l)) + e.n / maxN;
      if (score > best + 1e-12) { best = score; out = c; void key; }
    }
    return out ? rgbToHex(out) : null;
  };
  return { vibrant: pick(TARGETS.vibrant), darkMuted: pick(TARGETS.darkMuted), muted: pick(TARGETS.muted), avg };
}
