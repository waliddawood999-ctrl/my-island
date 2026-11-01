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

// الهندسة: مطابقة المرجع (islandly 13×26 / حبة 36 / ميلان 11° / مركزان 22 / فجوة ≈8.6) ثم تصغير ~15% بأمر المالك على حبتنا 32
const G = m.GEOM;
eq("size 11.5×21", [G.w, G.h], [11.5, 21]);
near("shrunk ≈15% vs old 13.5×24.5 (height)", G.h / 24.5, 0.85, 0.02);
near("shrunk ≈15% vs old 13.5×24.5 (width)", G.w / 13.5, 0.85, 0.02);
near("height ≈ 66% of pill", G.h / 32, 0.66, 0.02);
eq("centres 19px (22 × ~0.86)", G.centers, 19);
near("centres proportional to the size", G.centers / 22, 0.86, 0.02);
eq("gap 7–8px", m.GAP >= 7 && m.GAP <= 8, true);
near("gap = centres − width", m.GAP, G.centers - G.w);
near("gap proportional to the old 8.5", m.GAP / 8.5, 0.88, 0.04);
eq("slot width = eye width (no dead space)", G.slotW, G.w);
eq("tilt 11°", G.tilt, 11);
eq("awake: full stadium (radius = w/2), same tilt both eyes (top leans left)", [m.POSES.awake.r, m.POSES.awake.rot, m.POSES.awake.cut], [G.w / 2, -11, 0]);
eq("tilted capsule fits the 32px pill with max slide", m.tiltedExtent() + 2 * m.eyeOffset(0, 1e6).y <= 32, true);
eq("pair width fits the pill slot (centres + w < 2·half pill)", G.centers + G.w < 40, true);
eq("blink squeezes width to a thin line (≤0.15)", m.BLINK_X > 0 && m.BLINK_X <= 0.15, true);

// الحالات
eq("no sample → awake", m.eyeMode(null), "awake");
const L = (o) => ({ cx: 0, cy: 0, wx: 0, wy: 0, s: 1, over: false, near: false, ...o });
eq("near → awake", m.eyeMode(L({ near: true })), "awake");
eq("far → sleepy", m.eyeMode(L({})), "sleepy");
eq("over → happy", m.eyeMode(L({ over: true, near: true })), "happy");
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

// خريطة التحويل: فيزيائي (مؤشر − أصل النافذة) ÷ DPI ⇒ CSS px، ثم النظرة نسبةً إلى مركز العينين الفعلي، ثم بكسل فيزيائي كامل
const P = (o) => m.toPage(L(o));
eq("toPage identity at s=1", P({ cx: 960, cy: 16, wx: 860, wy: 0 }), { x: 100, y: 16 });
eq("toPage s=1.25 (secondary monitor), exact", P({ cx: 1125, cy: 40, wx: 1000, wy: 0, s: 1.25 }), { x: 100, y: 32 });
eq("toPage s=1.5 on negative-origin monitor", P({ cx: -1350, cy: 30, wx: -1500, wy: 0, s: 1.5 }), { x: 100, y: 20 });
eq("toPage s=2", P({ cx: 1060, cy: 32, wx: 860, wy: 0, s: 2 }), { x: 100, y: 16 });
eq("toPage cursor left/above the window → negative", P({ cx: 800, cy: -40, wx: 860, wy: 0 }), { x: -60, y: -40 });
eq("toPage bad scale falls back to 1", [P({ cx: 10, cy: 10, s: 0 }).x, P({ cx: 10, cy: 10, s: NaN }).x], [10, 10]);
// نفس الموضع المنطقي على شاشات بمقاييس مختلفة ⇒ نفس النظرة (استقلال عن DPI)
const gz = (s, wx) => m.gazeOffset(L({ cx: wx + Math.round(300 * s), cy: Math.round(16 * s), wx, wy: 0, s }), { x: 100, y: 16 });
const g1 = gz(1, 860), g125 = gz(1.25, 1000), g2 = gz(2, -2000);
eq("gaze independent of DPI (logical position equal ⇒ equal gaze)", [Math.abs(g125.x - g1.x) <= 1 / 1.25 && Math.abs(g2.x - g1.x) <= 0.5, g1.x > 0], [true, true]);
// النظرة نسبةً إلى مركز العينين لا إلى منتصف شاشة/نافذة مفترض
const cur = L({ cx: 460, cy: 16, wx: 360, wy: 0 }); // CSS (100,16)
eq("cursor exactly at the eye centre ⇒ zero gaze", [m.gazeOffset(cur, { x: 100, y: 16 }).x, m.gazeOffset(cur, { x: 100, y: 16 }).y], [0, 0]);
eq("eyes right of the cursor ⇒ look left", m.gazeOffset(cur, { x: 140, y: 16 }).x < 0, true);
eq("eyes left of the cursor ⇒ look right", m.gazeOffset(cur, { x: 60, y: 16 }).x > 0, true);
eq("shifting the eye centre changes the gaze (not a fixed screen midpoint)", m.gazeOffset(cur, { x: 60, y: 16 }).x !== m.gazeOffset(cur, { x: 90, y: 16 }).x, true);
// تقريب البكسل
eq("snapPx s=1 → integers", [m.snapPx(2.4, 1), m.snapPx(2.5, 1), m.snapPx(-2.6, 1)], [2, 3, -3]);
eq("snapPx s=2 → half CSS px (whole physical px)", [m.snapPx(2.3, 2), m.snapPx(2.8, 2)], [2.5, 3]);
eq("snapPx s=1.25 → multiples of 0.8", Math.abs(m.snapPx(2.1, 1.25) * 1.25 - Math.round(m.snapPx(2.1, 1.25) * 1.25)) < 1e-9, true);
eq("snapPx bad scale falls back to 1", m.snapPx(2.6, 0), 3);
const sweep = [-4000, -300, -150, -60, -20, -3, 0, 3, 20, 60, 150, 300, 4000];
eq("gaze offsets always whole physical pixels (s=1)", sweep.every((d) => Number.isInteger(m.gazeOffset(L({ cx: 100 + d, cy: 16 + d / 4, wx: 0, wy: 0 }), { x: 100, y: 16 }).x) && Number.isInteger(m.gazeOffset(L({ cx: 100 + d, cy: 16 + d / 4 }), { x: 100, y: 16 }).y)), true);
eq("gaze offsets whole physical pixels at s=1.5", sweep.every((d) => { const g = m.gazeOffset(L({ cx: 150 + d, cy: 24 + d / 4, s: 1.5 }), { x: 100, y: 16 }); return [g.x, g.y].every((v) => Math.abs(v * 1.5 - Math.round(v * 1.5)) < 1e-9); }), true);
eq("gaze stays inside the pill bounds", sweep.every((d) => Math.abs(m.gazeOffset(L({ cx: 100 + d, cy: 16 + d }), { x: 100, y: 16 }).x) <= 32 * 0.16 + 0.5), true);

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
