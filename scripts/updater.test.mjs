// اختبار منطق المحدّث الخالص (src/updater.ts):  node scripts/updater.test.mjs   (أو npm run test:updater)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "upd-")), "m.mjs");
await build({ entryPoints: ["src/updater.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const m = await import(pathToFileURL(out).href);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };

let s = { ...m.UPDATE_IDLE, phase: "available", version: "1.0.7" };
eq("no percent before start", m.updatePercent(s), null);
s = m.applyDownloadEvent(s, { event: "Started", data: { contentLength: 1000 } });
eq("started ⇒ downloading 0%", [s.phase, m.updatePercent(s)], ["downloading", 0]);
s = m.applyDownloadEvent(s, { event: "Progress", data: { chunkLength: 250 } });
s = m.applyDownloadEvent(s, { event: "Progress", data: { chunkLength: 255 } });
eq("progress accumulates ⇒ 50%", m.updatePercent(s), 50);
s = m.applyDownloadEvent(s, { event: "Progress", data: { chunkLength: 9999 } });
eq("percent clamps to 100", m.updatePercent(s), 100);
s = m.applyDownloadEvent(s, { event: "Finished" });
eq("finished ⇒ installing, version kept", [s.phase, s.version], ["installing", "1.0.7"]);
eq("unknown length ⇒ null percent", m.updatePercent(m.applyDownloadEvent(m.UPDATE_IDLE, { event: "Started", data: {} })), null);
eq("bad chunk ignored", m.applyDownloadEvent({ ...m.UPDATE_IDLE, total: 10 }, { event: "Progress", data: { chunkLength: NaN } }).downloaded, 0);
eq("auto-check delay is a few seconds", m.AUTO_CHECK_DELAY_MS >= 3000 && m.AUTO_CHECK_DELAY_MS <= 15000, true);

console.log(fail ? `FAILED ${fail}/${n}` : `ALL PASSED ${n}/${n}`);
process.exit(fail ? 1 : 0);
