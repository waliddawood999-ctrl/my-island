// منطق موضع الساعة (clockPlacement.ts): تطبيع + تخطيط فيزيائي + السقوط الأفقي في الارتفاع الصغير. node scripts/clock.test.mjs
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
eq("normalize known and unknown values", [m.normClockPosition("left"), m.normClockPosition("top"), m.normClockPosition("diagonal"), m.normClockPosition(undefined), m.normClockPosition(7)], ["left", "top", "auto", "auto", "auto"]);
eq("auto ⇒ no override", m.clockLayout("auto", 34), null);
eq("left/right are physical rows", [m.clockLayout("left", 34), m.clockLayout("right", 34)], [{ flexDirection: "row-reverse", stacked: false }, { flexDirection: "row", stacked: false }]);
eq("top/bottom stack when tall enough", [m.clockLayout("top", 34), m.clockLayout("bottom", 44)], [{ flexDirection: "column-reverse", stacked: true }, { flexDirection: "column", stacked: true }]);
eq("top/bottom fall back to a row when the pill is too short", [m.clockLayout("top", 28), m.clockLayout("bottom", 33.9)], [{ flexDirection: "row-reverse", stacked: false }, { flexDirection: "row", stacked: false }]);
eq("bad height never stacks", m.clockLayout("top", NaN), { flexDirection: "row-reverse", stacked: false });
eq("unknown position behaves as auto", m.clockLayout("zzz", 40), null);
console.log(fail ? `FAIL (${fail}/${n})` : `OK clock (${n})`); process.exit(fail ? 1 : 0);
