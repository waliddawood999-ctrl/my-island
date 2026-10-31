// محرّك الرسم للمحرّر (الجلسة 3.3): قائمة عمليات تُطبَّق بالترتيب على الصورة الأصلية.
// القصّ عملية كأي عملية: ما بعده يُرسم بإحداثيات الصورة المقصوصة، والتراجع/الإعادة = نقل آخر عملية بين قائمتين.

export type Tool = "arrow" | "line" | "rect" | "text" | "pixelate" | "crop";

export type Op =
  | { t: "arrow" | "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; color: string; width: number }
  | { t: "text"; x: number; y: number; text: string; color: string; size: number }
  | { t: "pixelate"; x: number; y: number; w: number; h: number; block: number }
  | { t: "crop"; x: number; y: number; w: number; h: number };

export type Box = { x: number; y: number; w: number; h: number };

/** مستطيل من نقطتين، مقصوص على حدود w×h وبأبعاد صحيحة؛ null إن كان أصغر من 1×1. */
export function boxFrom(x1: number, y1: number, x2: number, y2: number, w: number, h: number): Box | null {
  const x0 = Math.max(0, Math.floor(Math.min(x1, x2)));
  const y0 = Math.max(0, Math.floor(Math.min(y1, y2)));
  const x3 = Math.min(w, Math.ceil(Math.max(x1, x2)));
  const y3 = Math.min(h, Math.ceil(Math.max(y1, y2)));
  if (x3 - x0 < 1 || y3 - y0 < 1) return null;
  return { x: x0, y: y0, w: x3 - x0, h: y3 - y0 };
}

/** تبكسل (pixelate): يستبدل كل كتلة block×block بمتوسط لونها داخل المستطيل. */
export function pixelate(ctx: CanvasRenderingContext2D, b: Box, block: number) {
  const img = ctx.getImageData(b.x, b.y, b.w, b.h);
  const d = img.data;
  const n = Math.max(2, Math.round(block));
  for (let by = 0; by < b.h; by += n) {
    for (let bx = 0; bx < b.w; bx += n) {
      const bw = Math.min(n, b.w - bx), bh = Math.min(n, b.h - by);
      let r = 0, g = 0, bl = 0, a = 0;
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const o = ((by + y) * b.w + bx + x) * 4;
          r += d[o]; g += d[o + 1]; bl += d[o + 2]; a += d[o + 3];
        }
      }
      const c = bw * bh;
      r = Math.round(r / c); g = Math.round(g / c); bl = Math.round(bl / c); a = Math.round(a / c);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const o = ((by + y) * b.w + bx + x) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = a;
        }
      }
    }
  }
  ctx.putImageData(img, b.x, b.y);
}

function drawArrow(ctx: CanvasRenderingContext2D, o: { x1: number; y1: number; x2: number; y2: number; color: string; width: number }, head: boolean) {
  ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = o.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
  const hl = Math.max(14, o.width * 4.5);
  // الخط يقف عند قاعدة الرأس كي لا يبرز من طرفه.
  const ex = head ? o.x2 - Math.cos(ang) * hl * 0.6 : o.x2;
  const ey = head ? o.y2 - Math.sin(ang) * hl * 0.6 : o.y2;
  ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(ex, ey); ctx.stroke();
  if (!head) return;
  ctx.beginPath();
  ctx.moveTo(o.x2, o.y2);
  ctx.lineTo(o.x2 - hl * Math.cos(ang - Math.PI / 7), o.y2 - hl * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(o.x2 - hl * Math.cos(ang + Math.PI / 7), o.y2 - hl * Math.sin(ang + Math.PI / 7));
  ctx.closePath(); ctx.fill();
}

/** يرسم عملية رسم/تمويه على ctx (القصّ يُعالَج في renderOps). */
export function drawOp(ctx: CanvasRenderingContext2D, o: Op) {
  ctx.save();
  switch (o.t) {
    case "arrow": drawArrow(ctx, o, true); break;
    case "line": drawArrow(ctx, o, false); break;
    case "rect":
      ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.lineJoin = "round";
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      break;
    case "text": {
      ctx.font = `700 ${o.size}px "Segoe UI", Tahoma, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillStyle = o.color;
      ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 3;
      o.text.split("\n").forEach((line, n) => ctx.fillText(line, o.x, o.y + n * o.size * 1.25));
      break;
    }
    case "pixelate": {
      const b = boxFrom(o.x, o.y, o.x + o.w, o.y + o.h, ctx.canvas.width, ctx.canvas.height);
      if (b) pixelate(ctx, b, o.block);
      break;
    }
    default: break;
  }
  ctx.restore();
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** يطبّق كل العمليات بالترتيب على نسخة من الأصل ويعيد اللوحة الناتجة. */
export function renderOps(base: CanvasImageSource & { width: number; height: number }, ops: Op[]): HTMLCanvasElement {
  let cur = newCanvas(base.width, base.height);
  cur.getContext("2d")!.drawImage(base, 0, 0);
  for (const o of ops) {
    if (o.t === "crop") {
      const b = boxFrom(o.x, o.y, o.x + o.w, o.y + o.h, cur.width, cur.height);
      if (!b) continue;
      const next = newCanvas(b.w, b.h);
      next.getContext("2d")!.drawImage(cur, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      cur = next;
    } else {
      drawOp(cur.getContext("2d", { willReadFrequently: true })!, o);
    }
  }
  return cur;
}
