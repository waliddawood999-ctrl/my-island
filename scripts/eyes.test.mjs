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

// الهندسة: مطابقة المرجع (islandly 13×26 / حبة 36 / ميلان 11° / مركزان 22 / فجوة ≈8.6) على حبة 32
const G = m.GEOM;
eq("height 24–25px", G.h >= 24 && G.h <= 25, true);
eq("width 13–14px", G.w >= 13 && G.w <= 14, true);
near("height ≈ 75% of pill (ref 26/36=72%)", G.h / 32, 0.77, 0.03);
eq("centres 22px", G.centers, 22);
eq("gap 8–9px", m.GAP >= 8 && m.GAP <= 9, true);
near("gap = centres − width", m.GAP, G.centers - G.w);
eq("tilt 11°", G.tilt, 11);
eq("awake: full stadium (radius = w/2), same tilt both eyes (top leans left)", [m.POSES.awake.r, m.POSES.awake.rot, m.POSES.awake.cut], [G.w / 2, -11, 0]);
eq("tilted capsule fits the 32px pill with max slide", m.tiltedExtent() + 2 * m.eyeOffset(0, 1e6).y <= 32, true);
eq("blink squeezes width to a thin line (≤0.15)", m.BLINK_X > 0 && m.BLINK_X <= 0.15, true);

// الحالات
eq("no sample → awake", m.eyeMode(null), "awake");
eq("near → awake", m.eyeMode({ x: 0, y: 0, over: false, near: true }), "awake");
eq("far → sleepy", m.eyeMode({ x: 0, y: 0, over: false, near: false }), "sleepy");
eq("over → happy", m.eyeMode({ x: 0, y: 0, over: true, near: true }), "happy");
eq("sleepy: lower half filled, flat level top", [m.POSES.sleepy.cut, m.POSES.sleepy.rot], [0.5, 0]);
eq("happy: squashed rounded blocks", m.POSES.happy.h < G.h / 1.8 && m.POSES.happy.r >= 3 && m.POSES.happy.r < m.POSES.happy.w / 2, true);

// التتبّع فيزيائي: الإشارة تتبع الموضع الحقيقي وتتناسب ثم تشبع
const z = m.eyeOffset(0, 0);
eq("zero offset at centre", [z.x, z.y], [0, 0]);
eq("right → +x", m.eyeOffset(80, 0).x > 0, true);
eq("left → −x", m.eyeOffset(-80, 0).x < 0, true);
near("symmetric", m.eyeOffset(-80, 0).x, -m.eyeOffset(80, 0).x);
eq("monotonic", m.eyeOffset(20, 0).x < m.eyeOffset(60, 0).x && m.eyeOffset(60, 0).x < m.eyeOffset(150, 0).x, true);
eq("saturates inside pill", Math.abs(m.eyeOffset(5000, 5000).x) <= 32 * 0.16 + 1e-9 && Math.abs(m.eyeOffset(5000, 5000).y) <= 32 * 0.06 + 1e-9, true);
eq("down → +y", m.eyeOffset(0, 100).y > 0, true);

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
