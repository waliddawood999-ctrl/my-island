// اختبار منطق بلاطات الرئيسية الخالص (ظهور شرطي بترتيب ثابت + أقرب اجتماع قادم): node scripts/home.test.mjs (npm run test:home)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "home-")), "h.mjs");
await build({ entryPoints: ["src/homeTiles.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const m = await import(pathToFileURL(out).href);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };

eq("tile order is fixed", [...m.TILE_ORDER], ["prayer", "weather", "meeting", "battery"]);
eq("nothing available ⇒ no tiles", m.visibleTiles({}), []);
eq("all available ⇒ fixed order", m.visibleTiles({ battery: true, meeting: true, weather: true, prayer: true }), ["prayer", "weather", "meeting", "battery"]);
eq("only the available ones", m.visibleTiles({ weather: true, battery: true, prayer: false, meeting: false }), ["weather", "battery"]);
eq("no downloads tile", m.visibleTiles({ dl: true }), []);

const M = (id, start) => ({ id, title: id, start, end: start + 1800_000 });
const now = 1_000_000;
eq("no meetings ⇒ null", m.nextMeeting([], now), null);
eq("only past/started ⇒ null (started belongs to the live card)", m.nextMeeting([M("a", now - 1), M("b", now)], now), null);
eq("earliest future meeting", m.nextMeeting([M("late", now + 9e6), M("soon", now + 6e5), M("past", now - 5e5)], now)?.id, "soon");
eq("non-finite start ignored", m.nextMeeting([M("x", NaN), M("ok", now + 1)], now)?.id, "ok");

console.log(`${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
