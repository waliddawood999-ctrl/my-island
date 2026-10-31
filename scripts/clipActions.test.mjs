// اختبار كشف نوع عنصر الحافظة: node scripts/clipActions.test.mjs  (أو npm run test:clip)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "ca-")), "ca.mjs");
await build({ entryPoints: ["src/clipActions.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const m = await import(pathToFileURL(out).href);
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fail++; console.log(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
};
const k = (t) => m.classifyClip(t)?.kind ?? null;

// روابط
eq("url https", m.classifyClip("https://example.com/a?b=1"), { kind: "url", url: "https://example.com/a?b=1" });
eq("url www", m.classifyClip("  www.example.com "), { kind: "url", url: "https://www.example.com" });
eq("url http+port", k("http://localhost:3000/x"), "url");
for (const t of ["javascript:alert(1)", "ftp://a.com/x", "https://nodot", "https://a b.com", "example", "file:///c:/x"]) eq(`not url ${t}`, k(t) === "url", false);
// hex
eq("hex6", m.classifyClip("#FF5733"), { kind: "hex", rgb: "rgb(255, 87, 51)" });
eq("hex3", m.hexToRgb("#0af"), "rgb(0, 170, 255)");
eq("hex8", m.hexToRgb("#ff573380"), "rgba(255, 87, 51, 0.502)");
eq("hex4", m.hexToRgb("#f008"), "rgba(255, 0, 0, 0.533)");
for (const t of ["FF5733", "#GG0000", "#12345", "#1234567"]) eq(`not hex ${t}`, k(t) === "hex", false);
// جوال
eq("sa local", m.classifyClip("0551234567"), { kind: "phone", digits: "966551234567", wa: "https://wa.me/966551234567" });
eq("sa spaces", m.detectPhone("055 123 4567"), "966551234567");
eq("sa dashes", m.detectPhone("055-123-4567"), "966551234567");
eq("sa arabic digits", m.detectPhone("٠٥٥١٢٣٤٥٦٧"), "966551234567");
eq("e164 sa", m.detectPhone("+966 55 123 4567"), "966551234567");
eq("e164 us", m.detectPhone("+1 (415) 555-2671"), "14155552671");
eq("00 prefix", m.detectPhone("00201001234567"), "201001234567");
eq("966 bare", m.detectPhone("966551234567"), "966551234567");
for (const t of ["512345678", "12345", "0123456789", "+12", "++966551234567", "966 55 1234567 ext", "2024"]) eq(`not phone ${t}`, m.detectPhone(t), null);
// حساب
eq("calc basic", m.classifyClip("2+3*4"), { kind: "calc", expr: "2+3*4", result: "14" });
eq("calc arabic digits", m.detectCalc("١٢ × ٣"), { expr: "12 * 3", result: "36" });
eq("calc percent+func", m.detectCalc("sqrt(16)+2")?.result, "6");
eq("calc decimals", m.detectCalc("0.1+0.2")?.result, "0.3");
for (const t of ["2024-05-01", "10/5/2024", "42", "1.2.3", "10:30", "192.168.1.1", "hello 2+2", "2+", ""]) eq(`not calc ${t}`, m.detectCalc(t), null);
// ترجمة
eq("text ar → en", m.classifyClip("مرحبا بالعالم"), { kind: "text", translate: "https://translate.google.com/?sl=auto&tl=en&text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%20%D8%A8%D8%A7%D9%84%D8%B9%D8%A7%D9%84%D9%85&op=translate" });
eq("text en → ar", m.classifyClip("Hello world").translate, "https://translate.google.com/?sl=auto&tl=ar&text=Hello%20world&op=translate");
eq("text mixed mostly en → ar", m.translateUrl("send file to محمد now please").includes("tl=ar"), true);
eq("translate truncates", decodeURIComponent(m.translateUrl("a".repeat(5000)).split("text=")[1].split("&op")[0]).length, m.TRANSLATE_MAX);
// لا إجراء
eq("empty", m.classifyClip("   "), null);
eq("null", m.classifyClip(null), null);
eq("symbols only", m.classifyClip("###"), null);
// أولوية: رابط على حساب، جوال على حساب
eq("priority phone>calc", k("+966551234567"), "phone");
console.log(fail ? `FAILED: ${fail}` : "OK: all clipActions cases pass");
process.exit(fail ? 1 : 0);
