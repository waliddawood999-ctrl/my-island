// اختبار منطق عيون التميمة الخالص: node scripts/eyes.test.mjs (أو npm run test:eyes)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "ey-")), "e.mjs");
await build({ entryPoints: ["src/eyes.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const m = await import(pathToFileURL(out).href);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };
const near = (name, got, want, eps = 1e-9) => { n++; if (Math.abs(got - want) > eps) { fail++; console.log(`✗ ${name}: ${got} ≠ ${want}`); } };

// الهندسة: نفس نِسب islandly (13×26 / حبة 36، مركزان 22) مكيَّفة لحبة 32
const g = m.eyeGeometry(32);
near("w/pill ratio", g.w / 32, 13 / 36);
near("h/pill ratio", g.h / 32, 26 / 36);
near("centers/pill ratio", g.centers / 32, 22 / 36);
near("gap = centers − w", g.gap, g.centers - g.w);
eq("tilt 11°", g.tilt, 11);
const ref = m.eyeGeometry(36);
eq("identity at 36px", [ref.w, ref.h, ref.centers], [13, 26, 22]);
eq("awake pose tilt 11°", m.POSES.awake.rot, 11);

// الحالات
eq("no sample → awake", m.eyeMode(null), "awake");
eq("near → awake", m.eyeMode({ x: 0, y: 0, over: false, near: true }), "awake");
eq("far → sleepy", m.eyeMode({ x: 0, y: 0, over: false, near: false }), "sleepy");
eq("over → happy", m.eyeMode({ x: 0, y: 0, over: true, near: true }), "happy");
eq("sleepy flat", m.POSES.sleepy.sy < 0.35 && m.POSES.sleepy.sy > 0, true);
eq("happy squint", m.POSES.happy.sy < 0.6 && m.POSES.happy.sy > m.POSES.sleepy.sy, true);

// التتبّع فيزيائي: الإشارة تتبع الموضع الحقيقي وتتناسب ثم تشبع
const z = m.eyeOffset(0, 0);
eq("zero offset at centre", [z.x, z.y], [0, 0]);
eq("right → +x", m.eyeOffset(80, 0).x > 0, true);
eq("left → −x", m.eyeOffset(-80, 0).x < 0, true);
near("symmetric", m.eyeOffset(-80, 0).x, -m.eyeOffset(80, 0).x);
eq("monotonic", m.eyeOffset(20, 0).x < m.eyeOffset(60, 0).x && m.eyeOffset(60, 0).x < m.eyeOffset(150, 0).x, true);
eq("saturates inside pill", Math.abs(m.eyeOffset(5000, 5000).x) <= 32 * 0.16 + 1e-9 && Math.abs(m.eyeOffset(5000, 5000).y) <= 32 * 0.09 + 1e-9, true);
eq("down → +y", m.eyeOffset(0, 100).y > 0, true);
eq("max y keeps eyes inside pill", g.h * Math.cos(11 * Math.PI / 180) + g.w * Math.sin(11 * Math.PI / 180) + 2 * m.eyeOffset(0, 1e6).y <= 32, true);

// RTL: الترتيب ينعكس بالعربية فقط، والتتبّع نفسه
eq("ar reversed", m.rowReversed("ar"), true);
eq("en not reversed", m.rowReversed("en"), false);

// الإخفاء
const h = (o) => m.eyesHidden({ islandHidden: false, eco: false, motionOff: false, ...o });
eq("visible by default", h({}), false);
eq("fullscreen/hidden island", h({ islandHidden: true }), true);
eq("eco", h({ eco: true }), true);
eq("motion off", h({ motionOff: true }), true);

// الرمش
eq("blink min", m.blinkDelay(0, 2800, 5600), 2800);
eq("blink max", m.blinkDelay(0.999999, 2800, 5600) <= 5600, true);

console.log(`${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
