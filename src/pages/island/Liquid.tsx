import { useEffect, useId, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

/** السائل (المخطط §8): طبقة SVG فوق الحبة، حافتها السفلية نتوءات من media:bands بلون غلاف الأغنية. */

const N = 32;
type RGB = [number, number, number];
/** اللون الافتراضي للهوية (#4fd1c5) عند غياب الغلاف أو تعذّر تحليله. */
const ACCENT: RGB = [79, 209, 197];
const BLUR = 3;
/** مستوى الصفر مُنزَل تحت الحافة بقدر يخفي هالة الفلتر عند السكون. */
const HIDE = BLUR + 1;

let probe: HTMLCanvasElement | null = null;

/** اللون الغالب لصورة الغلاف: مدرّج صبغة (12 سلّة) موزون بالتشبّع×السطوع، ثم رفع السطوع كي يظهر على الأسود. */
export function dominantColor(src: string): Promise<RGB> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(ACCENT);
    img.onload = () => {
      try {
        probe ??= document.createElement("canvas");
        probe.width = probe.height = 24;
        const ctx = probe.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(ACCENT);
        ctx.drawImage(img, 0, 0, 24, 24);
        const px = ctx.getImageData(0, 0, 24, 24).data;
        const w = new Float64Array(12);
        const sum = Array.from({ length: 12 }, () => [0, 0, 0]);
        for (let k = 0; k < px.length; k += 4) {
          if (px[k + 3] < 128) continue;
          const r = px[k], g = px[k + 1], b = px[k + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
          if (v < 0.15) continue;
          let h = 0;
          if (mx !== mn) {
            const d = mx - mn;
            h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
          }
          const bin = Math.min(11, Math.floor((h / 6) * 12));
          const wt = s * s * v + 0.01;
          w[bin] += wt;
          sum[bin][0] += r * wt; sum[bin][1] += g * wt; sum[bin][2] += b * wt;
        }
        let best = 0;
        for (let n = 1; n < 12; n++) if (w[n] > w[best]) best = n;
        if (w[best] <= 0) return resolve(ACCENT);
        const c: RGB = [sum[best][0] / w[best], sum[best][1] / w[best], sum[best][2] / w[best]];
        const mx = Math.max(...c);
        const k = mx < 150 ? 150 / Math.max(mx, 1) : 1;
        resolve(c.map((x) => Math.min(255, Math.round(x * k))) as RGB);
      } catch {
        resolve(ACCENT);
      }
    };
    img.src = src;
  });
}

type Props = {
  /** moduleMedia && liquidSpectrum — خلاف ذلك لا يُرسم شيء ولا rAF ولا اشتراك أحداث. */
  enabled: boolean;
  /** العرض المنطقي للطبقة (عرض الحبة/اللوحة الهدف، تُقصّ بحافة الحبة). */
  width: number;
  /** ارتفاع صندوق الرسم (مثبّت بأسفل الحبة). */
  boxH: number;
  /** أقصى ارتفاع للنتوء بالبكسل. */
  maxH: number;
  cover: string | null;
  playing: boolean;
  hasSession: boolean;
  /** الحبة ظاهرة فعلًا (غير مخفية/شفافة تمامًا). */
  visible: boolean;
};

export function Liquid(p: Props) {
  const fid = useId().replace(/:/g, "");
  const path = useRef<SVGPathElement>(null);
  const dots = useRef<SVGGElement>(null);
  const pr = useRef(p);
  pr.current = p;
  const wake = useRef<() => void>(() => {});
  const colorT = useRef<RGB>(ACCENT);
  const bands = useRef({ v: new Float32Array(N), at: 0 });

  // المحرّك: حلقة rAF تعمل فقط حين يوجد ما يتحرك، وتتوقف كليًا عند الاستقرار.
  useEffect(() => {
    const cur = new Float32Array(N);
    const peak = new Float32Array(N);
    const vel = new Float32Array(N);
    const color: RGB = [...colorT.current];
    let raf = 0, timer = 0, running = false;

    const clear = () => {
      path.current?.setAttribute("d", "");
      dots.current?.replaceChildren();
    };
    const stop = () => {
      cancelAnimationFrame(raf); clearTimeout(timer);
      raf = timer = 0; running = false;
    };

    const frame = (now: number) => {
      raf = 0;
      const q = pr.current;
      if (!q.enabled || !q.visible || document.hidden) { running = false; clear(); return; }
      const breathing = q.hasSession && !q.playing;
      const live = q.playing && now - bands.current.at < 600;
      let moving = false;
      for (let n = 0; n < N; n++) {
        const t = live
          ? bands.current.v[n]
          : breathing
            ? 0.07 + 0.05 * Math.sin(now / 900 + n * 0.35)
            : 0;
        const d = t - cur[n];
        cur[n] += d * (d > 0 ? 0.55 : 0.14);
        if (cur[n] > peak[n]) { peak[n] = cur[n]; vel[n] = 0; }
        else { vel[n] += 0.0025; peak[n] = Math.max(cur[n], peak[n] - vel[n]); }
        if (cur[n] * q.maxH > 0.25 || peak[n] * q.maxH > 0.25) moving = true;
      }
      let cMoving = false;
      for (let c = 0; c < 3; c++) {
        const d = colorT.current[c] - color[c];
        if (Math.abs(d) > 0.8) { color[c] += d * 0.07; cMoving = true; } else color[c] = colorT.current[c];
      }

      const rgb = `rgb(${color[0] | 0},${color[1] | 0},${color[2] | 0})`;
      if (moving) {
        const W = q.width, step = W / N, base = q.boxH + HIDE;
        const ys = Array.from(cur, (v) => base - v * q.maxH);
        let d = `M-12 ${base + 12}L-12 ${ys[0]}`;
        for (let n = 0; n < N; n++) {
          const x = (n + 0.5) * step;
          const nx = n < N - 1 ? (n + 1.5) * step : W + 12;
          const ny = n < N - 1 ? ys[n + 1] : ys[n];
          d += `Q${x} ${ys[n]} ${(x + nx) / 2} ${(ys[n] + ny) / 2}`;
        }
        d += `L${W + 12} ${base + 12}Z`;
        path.current?.setAttribute("d", d);
        path.current?.setAttribute("fill", rgb);
        // قطرات القمم: تنفصل فوق النتوء وتلتحم به بالـGooey.
        const g = dots.current;
        if (g) {
          if (g.childElementCount !== N) {
            g.replaceChildren(...Array.from({ length: N }, () => document.createElementNS("http://www.w3.org/2000/svg", "circle")));
          }
          for (let n = 0; n < N; n++) {
            const el = g.children[n] as SVGCircleElement;
            const h = peak[n] * q.maxH;
            el.setAttribute("cx", String((n + 0.5) * step));
            el.setAttribute("cy", String(base - h - 1.5));
            el.setAttribute("r", String(h > 0.5 ? Math.min(step * 0.42, 1.2 + peak[n] * 2.2) : 0));
            el.setAttribute("fill", rgb);
          }
        }
      } else {
        clear();
      }

      if (!moving && !cMoving && !breathing) { running = false; return; }
      if (breathing && !live) timer = window.setTimeout(() => { raf = requestAnimationFrame(frame); }, 60); // تنفّس ~16fps
      else raf = requestAnimationFrame(frame);
    };

    wake.current = () => {
      const q = pr.current;
      if (!q.enabled || !q.visible || document.hidden) { stop(); clear(); return; }
      if (!running) { running = true; raf = requestAnimationFrame(frame); }
    };
    const onVis = () => wake.current();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop(); clear();
      wake.current = () => {};
    };
  }, []);

  // اشتراك الطيف فقط عند التفعيل — بلا اشتراك لا استهلاك.
  useEffect(() => {
    if (!p.enabled) return;
    const un = listen<number[]>("media:bands", (e) => {
      const b = bands.current;
      for (let n = 0; n < N; n++) b.v[n] = Math.min(1, Math.max(0, e.payload[n] ?? 0));
      b.at = performance.now();
      wake.current();
    });
    return () => { un.then((f) => f()); };
  }, [p.enabled]);

  // لون الغلاف: انتقال ناعم يتولاه المحرّك.
  useEffect(() => {
    if (!p.enabled) return;
    let alive = true;
    if (!p.cover) { colorT.current = ACCENT; wake.current(); return; }
    dominantColor(p.cover).then((c) => { if (alive) { colorT.current = c; wake.current(); } });
    return () => { alive = false; };
  }, [p.enabled, p.cover]);

  useEffect(() => { wake.current(); }, [p.enabled, p.visible, p.playing, p.hasSession, p.width, p.boxH, p.maxH]);

  if (!p.enabled) return null; // بديل آمن: الحبة بشكلها العادي

  return (
    <svg
      aria-hidden
      width={p.width}
      height={p.boxH}
      style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)", overflow: "visible", pointerEvents: "none" }}
    >
      <defs>
        <filter
          id={`goo${fid}`}
          filterUnits="userSpaceOnUse"
          x={-24}
          y={-24}
          width={p.width + 48}
          height={p.boxH + 48}
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation={BLUR} result="b" />
          <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
        </filter>
      </defs>
      <g filter={`url(#goo${fid})`}>
        <path ref={path} d="" />
        <g ref={dots} />
      </g>
    </svg>
  );
}
