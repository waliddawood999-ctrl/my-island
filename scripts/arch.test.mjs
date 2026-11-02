// حرّاس معمارية ARCH (بلا منطقة نافذة + شفافية مفروضة + هالة مُعدّة مسبقًا + تشخيص WebView2). node scripts/arch.test.mjs
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { haloPngDataUri } from "./halo.gen.mjs";
const out = join(mkdtempSync(join(tmpdir(), "arch-")), "m.mjs");
await build({ entryPoints: ["src/webview.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const wv = await import(pathToFileURL(out).href);
let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) { fail++; console.log(`✗ ${name} ${extra}`); } };
const rs = readdirSync("src-tauri/src").filter((f) => f.endsWith(".rs")).map((f) => [f, readFileSync(`src-tauri/src/${f}`, "utf8")]);
const code = (s) => s.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"); // التعليقات قد تشرح ما حُذف
const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
const hit = readFileSync("src-tauri/src/hit.rs", "utf8");
const bd = readFileSync("src-tauri/src/backdrop.rs", "utf8");
const css = readFileSync("src/pages/island/island.css", "utf8");

// 1) لا منطقة نافذة في أي مكان
for (const [f, s] of rs) ok(`${f}: no SetWindowRgn / CreateRoundRectRgn / HRGN in code`, !/SetWindowRgn|CreateRoundRectRgn|CreateRectRgn|\bHRGN\b/.test(code(s)));

// 2) الشفافية: المتغير يُضبط قبل Builder، والفرض + التحقق موجودان وبقيمة صفر
ok("WEBVIEW2_DEFAULT_BACKGROUND_COLOR value is 00000000", /TRANSPARENT_ENV_VALUE: &str = "00000000"/.test(bd) && /set_var\("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", TRANSPARENT_ENV_VALUE\)/.test(bd));
ok("env applied in run() BEFORE tauri::Builder (before any webview exists)", lib.indexOf("backdrop::apply_transparency_env()") > 0 && lib.indexOf("backdrop::apply_transparency_env()") < lib.indexOf("tauri::Builder::default()"));
ok("controller-level SetDefaultBackgroundColor(0,0,0,0) + read-back verification", /COREWEBVIEW2_COLOR \{ A: 0, R: 0, G: 0, B: 0 \}/.test(bd) && /DefaultBackgroundColor\(&mut got\)/.test(bd) && /is_fully_transparent\(got\.A/.test(bd));
ok("force_webview_transparent called from setup", lib.includes("backdrop::force_webview_transparent(app.handle())"));
ok("main window stays transparent + shadow:false in tauri.conf", /"label": "main"[^}]*"transparent": true[^}]*"shadow": false/.test(readFileSync("src-tauri/tauri.conf.json", "utf8")));

// 3) hit.rs: التبديل عند الانتقالات فقط ومن خيط مركون
ok("hit thread parks when hidden and is started in setup", /std::thread::park\(\)/.test(hit) && lib.includes("hit::start(app.handle())"));
ok("set_ignore_cursor_events only behind next_ignore()", (hit.match(/set_ignore_cursor_events/g) || []).length === 2 && /if let Some\(v\) = next_ignore\(/.test(hit));
ok("report_island_rect → hit::set_shape (no window call)", /hit::set_shape\(width, height/.test(readFileSync("src-tauri/src/win.rs", "utf8")));
ok("mascot reads the reported island rect (hit::shape), not a region", readFileSync("src-tauri/src/mascot.rs", "utf8").includes("crate::hit::shape()"));

// 4) الهالة: لا box-shadow/filter حيّ على الجسم/الهالة
ok("no outer box-shadow with blur on .island-body rules", !/\.island-body[^{]*\{[^}]*box-shadow:[^;}]*\b0 [0-9]+px [0-9]+px/.test(css));
ok("halo pseudo layers use mask-box-image, no filter/box-shadow", /island-halo::before, \.island-halo::after \{[^}]*-webkit-mask-box-image/s.test(css) && !/\.island-halo[^{]*\{[^}]*(?:box-shadow|filter):/.test(css));

ok("halo mask PNG in CSS is exactly what scripts/halo.gen.mjs generates", css.includes(haloPngDataUri()));
ok("halo mask is a bitmap (PNG), never an SVG filter re-evaluated per raster", !/island-halo[^{]*\{[^}]*svg\+xml/s.test(css));

// 5) تشخيص WebView2
ok("verdict: 145/146 buggy", wv.webviewVerdict({ version: "145.0.3770.0", major: 145, background_clear: true }) === "buggy" && wv.webviewVerdict({ version: "146.0.1", major: 146, background_clear: true }) === "buggy");
ok("verdict: 143 and 147 ok", wv.webviewVerdict({ version: "143.0.1", major: 143, background_clear: true }) === "ok" && wv.webviewVerdict({ version: "147.0.1", major: 147, background_clear: null }) === "ok");
ok("verdict: non-transparent forced background wins over version", wv.webviewVerdict({ version: "147.0.1", major: 147, background_clear: false }) === "opaque");
ok("verdict: missing/empty ⇒ unknown", wv.webviewVerdict(null) === "unknown" && wv.webviewVerdict({ version: "", major: 0, background_clear: null }) === "unknown");
ok("command registered (build.rs, handler, settings capability)", readFileSync("src-tauri/build.rs", "utf8").includes('"webview_runtime"') && lib.includes("backdrop::webview_runtime") && readFileSync("src-tauri/capabilities/settings.json", "utf8").includes("allow-webview-runtime"));
console.log(fail ? `FAIL (${fail}/${n})` : `OK arch (${n})`); process.exit(fail ? 1 : 0);
