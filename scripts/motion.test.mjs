// اختبار مستويات الحركة وحل Eco: node scripts/motion.test.mjs (أو npm run test:motion)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "mo-")), "m.mjs");
await build({ entryPoints: ["src/motion.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning", external: ["motion/react"] });
const m = await import(pathToFileURL(out).href);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };

// حل المستوى الفعلي
eq("full no eco", m.resolveMotion("full", false), "full");
eq("full + eco → reduced", m.resolveMotion("full", true), "reduced");
eq("reduced + eco stays", m.resolveMotion("reduced", true), "reduced");
eq("off + eco stays off (Eco لا يرفع)", m.resolveMotion("off", true), "off");
eq("undefined → full", m.resolveMotion(undefined, false), "full");
eq("garbage → full", m.resolveMotion("fancy", false), "full");
eq("garbage + eco → reduced", m.resolveMotion(7, true), "reduced");

// full: النوابض الأصلية (نابضة كما في MOTION.md)
m.setMotionLevel("full");
const near = (x, y, e = 0.6) => Math.abs(x - y) <= e;
eq("full island spring = calm open (158/22.6, mass 1)", [Math.round(m.spring.island.stiffness), +m.spring.island.damping.toFixed(1), m.spring.island.mass], [158, 22.6, 1]);
eq("islandSpring open/panel/close (calm)", [m.islandSpring.open, m.islandSpring.panel, m.islandSpring.close].map((t) => [Math.round(t.stiffness), +t.damping.toFixed(1)]), [[158, 22.6], [131, 20.6], [195, 27.9]]);
m.setMotionTuning(1.5, "snappy", 0.15);
eq("tuning: snappy @1.5× island spring", near(m.spring.island.stiffness, 273 * 2.25, 2) && near(m.dur.fast, 0.12 / 1.5, 1e-9), true);
eq("tuning: press/tab/eye springs follow speed (not style)", [Math.round(m.spring.press.stiffness), Math.round(m.spring.eye.stiffness)], [700 * 2.25, 240 * 2.25].map(Math.round));
m.setMotionTuning(1, "calm", 0.1);
eq("full dur", [m.dur.fast, m.dur.base, m.dur.swap], [0.12, 0.18, 0.2]);
eq("full tap", [m.tap.whileHover.scale, m.tap.whileTap.scale], [1.05, 0.97]);
eq("full swap enter blur+shift", [m.swapVariants.initial.y, m.swapVariants.initial.filter], [6, "blur(6px)"]);
eq("full palette scale", m.paletteVariants.initial.scale, 0.97);
eq("full shake", m.alertShake.animate.rotate, [0, -16, 14, -10, 0]);
eq("full level", m.motionLevel(), "full");

// reduced: قصيرة، بلا نوابض/ارتداد/تمويه/تكبير
m.setMotionLevel("reduced");
for (const k of Object.keys(m.spring)) eq(`reduced ${k} is tween (no spring)`, m.spring[k].type, "tween");
eq("reduced short", m.spring.island.duration <= 0.15 && m.spring.island.duration > 0, true);
eq("reduced no blur", [m.swapVariants.initial.filter, m.sectionVariants.initial.filter], ["blur(0px)", "blur(0px)"]);
eq("reduced shift small", m.swapVariants.initial.y <= 3, true);
eq("reduced palette scale ~1 no overshoot", m.paletteVariants.initial.scale >= 0.99 && m.paletteVariants.animate.scale === 1, true);
eq("reduced tap subtle", [m.tap.whileHover.scale, m.tap.whileTap.scale], [1.02, 0.97]);
eq("reduced tap uses live press transition", m.tap.transition === m.spring.press, true);
eq("reduced stagger 0", m.sectionVariants.animate(3).transition.delay, 0);
eq("reduced shake off", m.alertShake.animate.rotate, 0);
eq("reduced shrink guard kept", m.dur.windowShrinkGuard, 0.9);

// off: صفر حركة
m.setMotionLevel("off");
for (const k of Object.keys(m.spring)) eq(`off ${k} zero`, m.spring[k].duration, 0);
eq("off dur zero", [m.dur.fast, m.dur.base, m.dur.swap], [0, 0, 0]);
eq("off no shift/blur", [m.swapVariants.initial.y, m.swapVariants.initial.filter, m.sectionVariants.initial.y], [0, "blur(0px)", 0]);
eq("off palette scale 1", [m.paletteVariants.initial.scale, m.paletteVariants.exit.scale], [1, 1]);
eq("off tap inert", [m.tap.whileHover.scale, m.tap.whileTap.scale], [1, 1]);
eq("off exit duration 0", m.swapVariants.exit.transition.duration, 0);
eq("off section delay 0", m.sectionVariants.animate(5).transition.delay, 0);

// الرجوع إلى full يستعيد كل شيء (الكائنات نفسها تُحدَّث في مكانها)
const ref = m.spring;
m.setMotionLevel("full");
eq("same object identity", ref === m.spring, true);
eq("back to full island", m.spring.island.type, "spring");
eq("back to full stagger", m.sectionVariants.animate(2).transition.delay, 0.1);
// تتابع عناصر القوائم: خفيف، مسقّف، ويسقط في reduced/off
m.setMotionLevel("full");
eq("item stagger full", [m.itemVariants.animate(0).transition.delay, m.itemVariants.animate(2).transition.delay], [0, 0.06]);
eq("item stagger capped", m.itemVariants.animate(40).transition.delay, m.MAX_STAGGER_ITEMS * 0.03);
m.setMotionLevel("reduced");
eq("item stagger reduced 0", m.itemVariants.animate(5).transition.delay, 0);
m.setMotionLevel("off");
eq("item stagger off 0 + no shift", [m.itemVariants.animate(5).transition.delay, m.itemVariants.initial.y], [0, 0]);
m.setMotionLevel("full");
eq("back to full shake", m.alertShake.animate.rotate, [0, -16, 14, -10, 0]);
console.log(fail ? `\n${fail}/${n} فشل` : `${n}/${n} نجح`);
process.exit(fail ? 1 : 0);
