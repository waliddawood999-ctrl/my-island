// اختبار منطق «النشاط الحي» الخالص (الأولوية، التبديل، المراحل، الحلقة، السحب، المنحنى، ساعة الإيقاف، هيئة تبويب المتصفح):
//   node scripts/wow.test.mjs   (أو npm run test:wow)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "wow-")), "m.mjs");
await build({ entryPoints: ["src/liveActivity.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const m = await import(pathToFileURL(out).href);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };
const near = (name, got, want, eps = 1e-6) => { n++; if (Math.abs(got - want) > eps) { fail++; console.log(`✗ ${name}: ${got} ≠ ${want}`); } };

// ── الأولوية المعلنة: تسجيل ← مؤقّت ← ساعة إيقاف ← تنزيل ← ميديا ← اجتماع ← بطارية ← شبكة
eq("priority order", [...m.PRIORITY], ["rec", "timer", "stopwatch", "dl", "media", "meeting", "battery", "net"]);
eq("all active sorted by priority", m.activeKinds({ net: true, battery: true, media: true, dl: true, timer: true, rec: true }), ["rec", "timer", "dl", "media", "battery", "net"]);
eq("none active", m.activeKinds({}), []);
eq("recording beats everything", m.shownKind(m.activeKinds({ rec: true, media: true, timer: true }), null), "rec");
eq("timer beats download & media", m.shownKind(m.activeKinds({ timer: true, dl: true, media: true }), null), "timer");
eq("timer beats stopwatch", m.shownKind(m.activeKinds({ stopwatch: true, timer: true }), null), "timer");
eq("download beats media", m.shownKind(m.activeKinds({ dl: true, media: true }), null), "dl");
eq("media beats battery", m.shownKind(m.activeKinds({ media: true, battery: true }), null), "media");
eq("nothing ⇒ null", m.shownKind([], null), null);
// ── التثبيت اليدوي (مفتاح التبديل) يحترم القائم ويسقط عند انتهاء النشاط
const two = m.activeKinds({ timer: true, stopwatch: true });
eq("pin lower-priority activity", m.shownKind(two, "stopwatch"), "stopwatch");
eq("pin of an ended activity falls back to priority", m.shownKind(m.activeKinds({ timer: true }), "stopwatch"), "timer");
eq("cycle wraps", [m.nextKind(two, "timer"), m.nextKind(two, "stopwatch"), m.nextKind(two, null)], ["stopwatch", "timer", "timer"]);
eq("secondary = next by priority after shown", m.secondaryKind(m.activeKinds({ timer: true, media: true, battery: true }), "timer"), "media");
eq("secondary none when single", m.secondaryKind(["media"], "media"), null);

// ── المراحل (منجز/جارٍ/قادم) ومرحلة التنزيل
eq("stages mid", m.stageStates(4, 2), ["done", "done", "now", "next"]);
eq("stages first", m.stageStates(4, 0), ["now", "next", "next", "next"]);
eq("stages clamp high/low", [m.stageStates(3, 9), m.stageStates(3, -4)], [["done", "done", "now"], ["now", "next", "next"]]);
eq("download stage by percent", [0, 24, 25, 60, 99, 100, null].map((p) => m.downloadStage(p)), [0, 0, 1, 2, 3, 3, 0]);

// ── حلقة التقدّم
const r = m.ringDash(0.25, 10);
near("ring circumference", r.c, 2 * Math.PI * 10);
near("ring offset 25%", r.offset, r.c * 0.75);
near("ring clamps >1", m.ringDash(5, 10).offset, 0);
near("ring NaN ⇒ empty", m.ringDash(NaN, 10).offset, m.ringDash(0, 10).offset);

// ── سحب للتأكيد
eq("swipe 0", m.swipeProgress(0, 200, 40), 0);
eq("swipe full", m.swipeProgress(160, 200, 40), 1);
eq("swipe clamp", [m.swipeProgress(-30, 200, 40), m.swipeProgress(900, 200, 40)], [0, 1]);
eq("swipe confirm threshold", [m.swipeDone(0.5), m.swipeDone(0.89), m.swipeDone(0.9), m.swipeDone(1)], [false, false, true, true]);

// ── المنحنى المصغّر
eq("spark <2 ⇒ empty", [m.sparkPoints([], 100, 20), m.sparkPoints([5], 100, 20), m.sparkPoints([NaN, 3], 100, 20)], ["", "", ""]);
eq("spark rising", m.sparkPoints([0, 50, 100], 104, 24, 2, 0, 100), "2.0,22.0 52.0,12.0 102.0,2.0");
eq("spark flat is a straight line", new Set(m.sparkPoints([7, 7, 7], 100, 20).split(" ").map((p) => p.split(",")[1])).size, 1);
const h1 = m.pushSample([], { t: 0, v: 80 }, 60000, 5);
const h2 = m.pushSample(h1, { t: 10000, v: 79 }, 60000, 5);
eq("sample inside gap updates last, no growth", h2, [{ t: 0, v: 79 }]);
let h = h1;
for (let k = 1; k <= 8; k++) h = m.pushSample(h, { t: k * 60000, v: 80 - k }, 60000, 5);
eq("history capped", [h.length, h[0].v, h[4].v], [5, 76, 72]);

// ── ساعة الإيقاف
let s = m.SW_IDLE;
eq("idle not active", m.swActive(s), false);
s = m.swStart(s, 1000);
eq("running elapsed", m.swElapsed(s, 3500), 2500);
eq("start while running is idempotent", m.swStart(s, 9999), s);
s = m.swPause(s, 4000);
eq("paused keeps value", [m.swElapsed(s, 99999), m.swActive(s)], [3000, true]);
s = m.swStart(s, 10000);
eq("resume accumulates", m.swElapsed(s, 12000), 5000);
eq("reset", [m.swActive(m.swReset()), m.swElapsed(m.swReset(), 5)], [false, 0]);
eq("fmt centis", [m.fmtStopwatch(0), m.fmtStopwatch(65_430), m.fmtStopwatch(65_430, false)], ["00:00.00", "01:05.43", "01:05"]);
eq("fmt hours drops centis", m.fmtStopwatch(3_725_000), "1:02:05");

// ── سرعة الشبكة
eq("fmtSpeed", [m.fmtSpeed(0), m.fmtSpeed(2048), m.fmtSpeed(1_572_864), m.fmtSpeed(250 * 1048576)], ["0 KB/s", "2 KB/s", "1.5 MB/s", "250 MB/s"]);

// ── مقاسات الكبسولة وهيئة تبويب المتصفح
eq("compact width", [m.compactWidth(220), m.compactWidth(160), m.compactWidth(280)], [286, 268, 364]);
eq("dock sanitize good", m.sanitizeDock({ active: true, browser: "edge", strip: 41, inset: 6 }), { active: true, browser: "edge", strip: 41, inset: 6 });
eq("dock sanitize garbage ⇒ off", [m.sanitizeDock(null), m.sanitizeDock({}), m.sanitizeDock({ active: true, strip: 900, inset: 1 }), m.sanitizeDock({ active: true, strip: "x", inset: 1 }), m.sanitizeDock({ active: false, strip: 41, inset: 6 })].every((d) => d.active === false), true);
const tab = m.tabShape({ active: true, browser: "chrome", strip: 41, inset: 6 }, 220, 34);
eq("tab shape", tab, { w: 220, winH: 41, bodyH: 35, y: 6, top: 12, bottom: 0 });
eq("not docked ⇒ capsule", m.tabShape(m.DOCK_OFF, 220, 34), { w: 220, winH: 34, bodyH: 34, y: 0, top: 17, bottom: 17 });

console.log(fail ? `FAILED ${fail}/${n}` : `ALL PASSED ${n}/${n}`);
process.exit(fail ? 1 : 0);
