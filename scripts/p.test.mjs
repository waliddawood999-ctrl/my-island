// وحدة (P): منطق التقديم (seek.ts) + أبعاد/نوع المصغّرة (coverImage.ts, Thumb.fitFor/guessKind) + رموز THUMB/PEEK. node scripts/p.test.mjs
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "p-"));
const load = async (f) => { const out = join(dir, f.replace(/\W/g, "_") + ".mjs"); await build({ entryPoints: [f], bundle: true, format: "esm", outfile: out, logLevel: "silent", external: ["react", "motion/react", "lucide-react", "react/jsx-runtime"] }); return import(pathToFileURL(out).href); };
const K = await load("src/seek.ts");
const C = await load("src/coverImage.ts");
const T = await load("src/tokens.ts");
const X = await load("src/mediaSource.ts");
let fail = 0, n = 0;
const ok = (name, c, x = "") => { n++; if (!c) { fail++; console.log(`✗ ${name} ${x}`); } };

// ── seek
ok("clampFrac bounds + NaN", K.clampFrac(-1) === 0 && K.clampFrac(2) === 1 && K.clampFrac(0.4) === 0.4 && K.clampFrac(NaN) === 0 && K.clampFrac(Infinity) === 0);
ok("fracFromPointer maps x→fraction, clamps outside", K.fracFromPointer(150, 100, 200) === 0.25 && K.fracFromPointer(50, 100, 200) === 0 && K.fracFromPointer(900, 100, 200) === 1 && K.fracFromPointer(5, 0, 0) === 0);
ok("secondsFromFrac: half of 240 = 120", K.secondsFromFrac(0.5, 240) === 120);
ok("secondsFromFrac: end stops 0.5s before the end (no jump to next track)", K.secondsFromFrac(1, 240) === 239.5);
ok("secondsFromFrac: unknown/zero/NaN duration ⇒ null", K.secondsFromFrac(0.5, 0) === null && K.secondsFromFrac(0.5, NaN) === null && K.secondsFromFrac(0.5, -3) === null);
ok("secondsFromFrac rounds to 0.1s", K.secondsFromFrac(1 / 3, 100) === 33.3);
ok("keySeek ±5s / ±15s / Home / End", K.keySeek("ArrowRight", 10, 240) === 15 && K.keySeek("ArrowLeft", 10, 240) === 5 && K.keySeek("PageUp", 10, 240) === 25 && K.keySeek("PageDown", 10, 240) === 0 && K.keySeek("Home", 99, 240) === 0 && K.keySeek("End", 1, 240) === 239.5);
ok("keySeek clamps at start, ignores other keys and unknown duration", K.keySeek("ArrowLeft", 2, 240) === 0 && K.keySeek("a", 2, 240) === null && K.keySeek("ArrowRight", 2, 0) === null);
ok("fmtTime m:ss and h:mm:ss", K.fmtTime(0) === "0:00" && K.fmtTime(65) === "1:05" && K.fmtTime(3600) === "1:00:00" && K.fmtTime(3725.9) === "1:02:05" && K.fmtTime(-5) === "0:00" && K.fmtTime(NaN) === "0:00");
ok("canSeekNow needs source support + duration + not audio-fallback", K.canSeekNow({ can_seek: true, duration: 10, kind: "gsmtc" }) && !K.canSeekNow({ can_seek: false, duration: 10, kind: "gsmtc" }) && !K.canSeekNow({ can_seek: true, duration: 0, kind: "gsmtc" }) && !K.canSeekNow({ can_seek: true, duration: 10, kind: "audio" }));

// ── cover sizing / kind
ok("fitSize never upscales, keeps ratio, caps long side at 480", JSON.stringify(C.fitSize(1280, 720)) === JSON.stringify({ w: 480, h: 270 }) && JSON.stringify(C.fitSize(300, 300)) === JSON.stringify({ w: 300, h: 300 }) && JSON.stringify(C.fitSize(600, 600)) === JSON.stringify({ w: 480, h: 480 }) && C.fitSize(0, 5).w === 0);
ok("thumbKind: wide ⇒ video, square/tall ⇒ audio, unknown ⇒ audio", C.thumbKind(1280, 720) === "video" && C.thumbKind(480, 360) === "video" && C.thumbKind(600, 600) === "audio" && C.thumbKind(500, 700) === "audio" && C.thumbKind(0, 0) === "audio" && C.thumbKind(130, 100) === "video" && C.thumbKind(129, 100) === "audio");

// ── tokens: one size token, 16:9 video, square audio; peek cap < panel default
ok("THUMB: 16:9 video width from one height token; ambient ≤ 0.5", Math.abs(T.THUMB.h * T.THUMB.videoRatio - 128) < 0.01 && T.THUMB.hLarge > T.THUMB.h && T.THUMB.ambientMax <= 0.5);
ok("PEEK cap: tab body fits the cap and the cap is below the panel", T.PEEK.tabBodyH <= T.PEEK.maxH && T.PEEK.maxH < 290 + 1 && T.PEEK.maxH < T.PANEL.h + 1 && T.PEEK.tabsH > 0);
// ── source guess (browsers ⇒ video, Spotify/others ⇒ audio) — logic mirrored in Thumb.guessKind
const guess = (a, f) => { const k = X.classifySource(a, f).kind; return k === "other" || k === "spotify" ? "audio" : "video"; };
ok("guessKind mirror: Spotify/other ⇒ audio, browsers/YouTube ⇒ video", guess("Spotify.exe", "Spotify") === "audio" && guess("foo.exe", "Foo") === "audio" && guess("Chrome", "Google Chrome") === "video" && guess("x", "YouTube Music") === "video" && guess("MSEdge", "Microsoft Edge") === "video");
console.log(fail ? `FAILED ${fail}/${n}` : `ALL PASSED ${n}/${n}`); process.exit(fail ? 1 : 0);
