// منطق موضع/حجم الساعة وموضع العيون (clockPlacement.ts). node scripts/clock.test.mjs
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "clock-")), "m.mjs");
await build({ entryPoints: ["src/pages/island/clockPlacement.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent", platform: "node" });
const m = await import(pathToFileURL(out).href);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };
eq("position normalizes: free only when exactly free", [m.normClockPosition("free"), m.normClockPosition("auto"), m.normClockPosition("left"), m.normClockPosition(undefined)], ["free", "auto", "auto", "auto"]);
eq("eyes align normalizes", [m.normEyesAlign("left"), m.normEyesAlign("center"), m.normEyesAlign("right"), m.normEyesAlign("x"), m.normEyesAlign(1)], ["left", "center", "right", "auto", "auto"]);
eq("percent clamps to 0..100 and falls back to the middle", [m.clampPct(-5), m.clampPct(140), m.clampPct(37), m.clampPct(NaN), m.clampPct("a"), m.clampPct(undefined, 20)], [0, 100, 37, 50, 50, 20]);
eq("scale clamps 60..180, rounds, defaults 100", [m.clampScale(10), m.clampScale(999), m.clampScale(124.6), m.clampScale(NaN), m.clampScale(undefined)], [60, 180, 125, 100, 100]);
eq("font size: none at 100%, em otherwise", [m.clockFontSize(100), m.clockFontSize(undefined), m.clockFontSize(150), m.clockFontSize(10)], [undefined, undefined, "1.5em", "0.6em"]);
eq("absolute style anchors the clock by its own percentage (never leaves the pill)", [m.clockAbsStyle(0, 0), m.clockAbsStyle(100, 100), m.clockAbsStyle(25, 75)], [
  { position: "absolute", left: "0%", top: "0%", transform: "translate(-0%, -0%)", whiteSpace: "nowrap" },
  { position: "absolute", left: "100%", top: "100%", transform: "translate(-100%, -100%)", whiteSpace: "nowrap" },
  { position: "absolute", left: "25%", top: "75%", transform: "translate(-25%, -75%)", whiteSpace: "nowrap" }]);
eq("absolute style clamps bad input to the middle/edges", [m.clockAbsStyle(NaN, 200).left, m.clockAbsStyle(NaN, 200).top], ["50%", "100%"]);
eq("eyes align: auto ⇒ no override; left/right add edge padding; center none", [m.eyesAlignStyle("auto", 12), m.eyesAlignStyle("left", 12), m.eyesAlignStyle("right", 9), m.eyesAlignStyle("center", 12)], [null, { justifyContent: "flex-start", paddingInline: 12 }, { justifyContent: "flex-end", paddingInline: 9 }, { justifyContent: "center", paddingInline: 0 }]);
eq("pad: center and edges map to percentages", [m.padToPct(0, 0), m.padToPct(1, 0), m.padToPct(-1, 0), m.padToPct(0, -1), m.padToPct(0, 1)], [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 0, y: 50 }, { x: 50, y: 0 }, { x: 50, y: 100 }]);
eq("pad: dragging outside the circle is constrained to its rim", [m.padToPct(2, 0), m.padToPct(1, 1)], [{ x: 100, y: 50 }, { x: 85, y: 85 }]);
eq("pad: bad numbers behave as the center", m.padToPct(NaN, Infinity), { x: 50, y: 50 });
eq("pad round trip (inside the circle)", (() => { const p = m.padToPct(0.3, -0.4); const k = m.pctToPad(p.x, p.y); return [Math.round(k.left), Math.round(k.top)]; })(), [65, 30]);
eq("pctToPad keeps the knob inside the circle for corner values", (() => { const k = m.pctToPad(100, 100); return Math.hypot(k.left - 50, k.top - 50) <= 50.0001; })(), true);
console.log(fail ? `FAIL (${fail}/${n})` : `OK clock (${n})`); process.exit(fail ? 1 : 0);
