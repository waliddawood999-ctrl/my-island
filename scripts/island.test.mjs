// وحدة: اشتقاق النوابض (islandMotion) + آلة حالات الجزيرة (islandMachine) + الترحيلات. node scripts/island.test.mjs
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "is-"));
const load = async (f) => { const out = join(dir, f.replace(/\W/g, "_") + ".mjs"); await build({ entryPoints: [f], bundle: true, format: "esm", outfile: out, logLevel: "warning" }); return import(pathToFileURL(out).href); };
const M = await load("src/islandMotion.ts");
const S = await load("src/islandMachine.ts");
const A = await load("src/appearance.ts");
let fail = 0, n = 0;
const ok = (name, c, x = "") => { n++; if (!c) { fail++; console.log(`✗ ${name} ${x}`); } };
const near = (a, b, e = 0.6) => Math.abs(a - b) <= e;

// ── النوابض: الجدول المرجعي (سرعة 1، ارتداد النمط) — stiffness/damping لكل (open, panel, close)
const TABLE = { calm: [158, 22.6, 131, 20.6, 195, 27.9], snappy: [273, 28.1, 226, 25.6, 338, 36.7], bouncy: [158, 17.6, 131, 16.0, 195, 27.9], boringNotch: [224, 23.9, 185, 21.8, 276, 33.2], cultUi: [411, 30.4, 340, 27.6, 507, 45.0] };
for (const [k, t] of Object.entries(TABLE)) {
  const b = M.MOTION_PRESETS[k].bounce;
  const o = M.deriveSpring("open", k, 1, b), p = M.deriveSpring("panel", k, 1, b), c = M.deriveSpring("close", k, 1, b);
  ok(`${k} open`, near(o.stiffness, t[0], 1) && near(o.damping, t[1], 0.06), JSON.stringify(o));
  ok(`${k} panel (d×1.1)`, near(p.stiffness, t[2], 1) && near(p.damping, t[3], 0.06), JSON.stringify(p));
  ok(`${k} close (d×0.9, bounce 0)`, near(c.stiffness, t[4], 1) && near(c.damping, t[5], 0.06), JSON.stringify(c));
  ok(`${k} mass is 1`, o.mass === 1 && p.mass === 1 && c.mass === 1);
}
ok("speed 2 halves duration ⇒ stiffness ×4", near(M.deriveSpring("open", "calm", 2, 0.1).stiffness, 158 * 4, 3));
ok("closing ignores bounce setting", M.deriveSpring("close", "bouncy", 1, 0.4).damping === M.deriveSpring("close", "bouncy", 1, 0).damping);
ok("bounce 0 ⇒ damping 4π/d", near(M.deriveSpring("open", "calm", 1, 0).damping, 4 * Math.PI / 0.5, 0.01));
ok("normalizers clamp", M.normSpeed(9) === 2 && M.normSpeed(0) === 0.5 && M.normBounce(1) === 0.4 && M.normPreset("zzz") === "calm");
// ── تقليل الحركة والترحيلات
ok("reduce: always/never/system", M.resolveReduce("always", false) === true && M.resolveReduce("never", true) === false && M.resolveReduce("system", true) === true && M.resolveReduce("system", false) === false);
ok("migrate reduceMotion bool", M.migrateReduce(true) === "always" && M.migrateReduce(false) === "system" && M.migrateReduce("never") === "never" && M.migrateReduce(undefined) === "system");
ok("migrate springStyle", M.migratePreset("smooth") === "calm" && M.migratePreset("gentle") === "calm" && M.migratePreset("snappy") === "snappy" && M.migratePreset(undefined) === "calm");
ok("migrate animSpeed 50..150 ⇒ 0.5..1.5", M.migrateSpeed(100) === 1 && M.migrateSpeed(150) === 1.5 && M.migrateSpeed(50) === 0.5 && M.migrateSpeed("x") === 1);
ok("settings migration v3 converts legacy keys", (() => { const m = A.migrateSettings({ settingsVersion: 2, reduceMotion: true, springStyle: "gentle", animSpeed: 80 }); return m.reduceMotion === "always" && m.motionPreset === "calm" && m.motionSpeed === 0.8 && m.settingsVersion === 3; })());
ok("settings migration is idempotent at v3", Object.keys(A.migrateSettings({ settingsVersion: 3 })).length === 0);
// ── crossfade/peek variants (مدد وتحويلات حسب المواصفة)
const cf = M.crossfade(1, false);
ok("crossfade exit 120ms ease-in blur6 y4 scale.98", cf.hidden.transition.duration === 0.12 && cf.hidden.filter === "blur(6px)" && cf.hidden.y === 4 && cf.hidden.scale === 0.98);
ok("crossfade enter: opacity/blur 240ms, transform 300ms, delayed 120ms", cf.shown.transition.opacity.duration === 0.24 && cf.shown.transition.y.duration === 0.3 && cf.shown.transition.delay === 0.12);
ok("crossfade scales by 1/speed", near(M.crossfade(2, false).hidden.transition.duration, 0.06, 1e-9) && near(M.crossfade(2, false).shown.transition.y.duration, 0.15, 1e-9));
ok("reduced crossfade = 150ms opacity only", (() => { const r = M.crossfade(1, true); return r.hidden.transition.duration === 0.15 && !("y" in r.hidden) && !("scale" in r.hidden); })());
const pv = M.peekCardVariants(1, false);
ok("peek card out −20·dir / enter +20·dir jump / in 220-280ms", pv.out(1).x === -20 && pv.out(-1).x === 20 && pv.enter(1).x === 20 && pv.enter(1).transition.duration === 0 && pv.in.transition.x.duration === 0.28 && pv.in.transition.opacity.duration === 0.22 && pv.out(1).transition.duration === 0.11);

// ── آلة الحالات مع ساعة مزيّفة
function fake() {
  let t = 0, id = 0; const q = new Map();
  return {
    sched: { now: () => t, set: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; }, clear: (h) => q.delete(h) },
    advance(ms) { const end = t + ms; for (;;) { let best = null; for (const [k, v] of q) if (v.at <= end && (!best || v.at < best[1].at)) best = [k, v]; if (!best) break; q.delete(best[0]); t = best[1].at; best[1].fn(); } t = end; },
    pending: () => q.size,
  };
}
{ const f = fake(); const m = new S.IslandMachine(f.sched, { hoverDelayMs: 250 });
  m.enter(); f.advance(249); ok("no peek before hoverDelayMs", m.mode === "pill"); f.advance(1); ok("peek after hoverDelayMs", m.mode === "peek");
  m.leave(); f.advance(299); ok("peek stays 299ms after leave", m.mode === "peek"); f.advance(1); ok("peek closes at 300ms", m.mode === "pill"); }
{ const f = fake(); const m = new S.IslandMachine(f.sched, { hoverDelayMs: 250 });
  m.enter(); f.advance(100); m.leave(); f.advance(1000); ok("leaving before the delay cancels the open", m.mode === "pill" && f.pending() === 0); }
{ const f = fake(); const m = new S.IslandMachine(f.sched, { hoverDelayMs: 0 }); m.enter(); f.advance(0); ok("hoverDelay 0 opens at once", m.mode === "peek"); }
{ const f = fake(); const m = new S.IslandMachine(f.sched, { hoverDelayMs: 100 });
  m.enter(); f.advance(100); m.leave(); f.advance(200); m.enter(); f.advance(1000); ok("returning cancels the pending close", m.mode === "peek"); }
{ const f = fake(); const m = new S.IslandMachine(f.sched, { hoverDelayMs: 100 });
  m.enter(); f.advance(100); m.click(); ok("click ⇒ panel", m.mode === "panel"); m.leave(); f.advance(499); ok("panel stays 499ms", m.mode === "panel"); f.advance(1); ok("panel closes at 500ms", m.mode === "pill");
  m.click(); ok("click from pill ⇒ panel", m.mode === "panel"); m.back(); ok("back: panel ⇒ peek", m.mode === "peek"); }
{ const f = fake(); const m = new S.IslandMachine(f.sched, { hoverDelayMs: 0 }); m.enter(); f.advance(0);
  ok("wheel in peek cycles forward (down) with dir +1", m.wheel(100) && m.currentCard === "today" && m.dir === 1);
  ok("wheel throttled within 280ms (swallowed, no step)", m.wheel(100) === true && m.currentCard === "today"); f.advance(280);
  ok("wheel again after 280ms steps", m.wheel(100) && m.currentCard === "weather"); f.advance(280);
  ok("wheel up goes back with dir −1", m.wheel(-100) && m.currentCard === "today" && m.dir === -1); f.advance(280); m.wheel(-100); f.advance(280);
  ok("cycle wraps (player → timer)", m.wheel(-100) && m.currentCard === "timer");
  m.setCfg({ wheelCycle: false }); f.advance(300); ok("peekWheelCycle=false ignores wheel", m.wheel(100) === false && m.currentCard === "timer"); }
{ const f = fake(); const m = new S.IslandMachine(f.sched, { hoverDelayMs: 0, slowMo: 4 }); m.enter(); f.advance(0); m.wheel(100); f.advance(280 * 3);
  ok("slow-mo ×4 stretches the throttle", m.currentCard === "today" && (m.wheel(100), m.currentCard === "today")); f.advance(280); ok("…and releases after 1120ms", (m.wheel(100), m.currentCard === "weather")); }
{ const f = fake(); const m = new S.IslandMachine(f.sched, { hoverDelayMs: 0 }); m.enter(); f.advance(0); m.click(); m.setPages(4);
  ok("panel wheel up = next page", m.wheel(-1) && m.page === 1); f.advance(280);
  ok("panel wheel down = previous page", m.wheel(1) && m.page === 0); f.advance(280);
  ok("clamped at first page (no wrap, not swallowed)", m.wheel(1) === false && m.page === 0);
  m.gotoPage(3); f.advance(280); ok("clamped at last page", m.wheel(-1) === false && m.page === 3);
  f.advance(280); ok("does not hijack a list that can still scroll", m.wheel(1, { scrollsFurther: true }) === false && m.page === 3);
  m.setCfg({ panelPaging: false }); ok("panelWheelPaging=false ignores wheel", m.wheel(1) === false); }
{ ok("pill ignores wheel", new S.IslandMachine(fake().sched).wheel(1) === false);
  ok("card order: valid permutation kept", JSON.stringify(S.normCardOrder(["timer", "weather", "today", "player"])) === JSON.stringify(["timer", "weather", "today", "player"]));
  ok("card order: invalid ⇒ default", JSON.stringify(S.normCardOrder(["player", "player", "today", "x"])) === JSON.stringify(["player", "today", "weather", "timer"]) && S.normCardOrder(null).length === 4); }
console.log(fail ? `FAILED ${fail}/${n}` : `ALL PASSED ${n}/${n}`);
process.exit(fail ? 1 : 0);
