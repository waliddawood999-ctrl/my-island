// يولّد قناع الهالة (PNG 72×72 ألفا فقط، مستطيل مستدير مموَّه غاوسيًا σ=8) كـdata-URI للصقه في island.css (.island-halo). بلا مكتبات.
//   node scripts/halo.gen.mjs        → يطبع data-URI (والاختبار arch.test.mjs يتحقق أنه مطابق لما في CSS)
// لماذا PNG لا SVG+feGaussianBlur: مصدر SVG بفلتر يُعاد تقييمه عند كل رَسْتَرة بحجم الوجهة (قياس: وقفات 300ms+ عند الإغلاق)، أما البتماب فيُفكّ مرة.
import { deflateSync, crc32 } from "node:zlib";
const N = 72, S = 4, SIGMA = 8, RECT = [24, 24, 48, 48], RX = 13;
export function haloPngDataUri() {
  const M = N * S, a = new Float64Array(M * M);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const [x0, y0, x1, y1] = RECT.map((v) => v * S), r = RX * S, cx = Math.min(Math.max(x + 0.5, x0 + r), x1 - r), cy = Math.min(Math.max(y + 0.5, y0 + r), y1 - r);
    a[y * M + x] = x + 0.5 >= x0 && x + 0.5 <= x1 && y + 0.5 >= y0 && y + 0.5 <= y1 && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r ? 1 : 0;
  }
  const k = []; const sg = SIGMA * S, R = Math.ceil(sg * 3); let ks = 0;
  for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * sg * sg)); k.push(v); ks += v; }
  const blur = (src, horiz) => { const o = new Float64Array(M * M); for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { let s = 0; for (let i = -R; i <= R; i++) { const xx = horiz ? Math.min(M - 1, Math.max(0, x + i)) : x, yy = horiz ? y : Math.min(M - 1, Math.max(0, y + i)); s += src[yy * M + xx] * k[i + R]; } o[y * M + x] = s / ks; } return o; };
  const b = blur(blur(a, true), false);
  const raw = Buffer.alloc(N * (1 + N * 4));
  for (let y = 0; y < N; y++) { raw[y * (1 + N * 4)] = 0; for (let x = 0; x < N; x++) { let s = 0; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) s += b[(y * S + j) * M + x * S + i]; const o = y * (1 + N * 4) + 1 + x * 4; raw[o] = raw[o + 1] = raw[o + 2] = 255; raw[o + 3] = Math.round((s / (S * S)) * 255); } }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + png.toString("base64");
}
if (process.argv[1] && process.argv[1].endsWith("halo.gen.mjs")) console.log(haloPngDataUri());
