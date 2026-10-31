// اختبار المحلل العربي للتذكيرات: node scripts/reminderParse.test.mjs  (أو npm run test:reminders)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "rp-")), "rp.mjs");
await build({ entryPoints: ["src/reminderParse.ts"], format: "esm", outfile: out, logLevel: "warning" });
const { parseReminder } = await import(pathToFileURL(out).href);
// الآن: الخميس 2026-10-29 14:00 محلي
const now = new Date(2026, 9, 29, 14, 0, 0);
const f = (d) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` : null;
const cases = [
  ["ذكّرني أتصل بأمي بكرة 9", "أتصل بأمي", "2026-10-30 09:00", null],
  ["بعد ساعتين اسقِ الزرع", "اسقِ الزرع", "2026-10-29 16:00", null],
  ["كل يوم جمعة 8 صباحًا راجع الحسابات", "راجع الحسابات", "2026-10-30 08:00", "weekly"],
  ["ذكرني بعد 10 دقائق اشرب ماء", "اشرب ماء", "2026-10-29 14:10", null],
  ["ذكرني بعد نصف ساعة أطفئ الفرن", "أطفئ الفرن", "2026-10-29 14:30", null],
  ["بعد ساعة ونصف اجتماع", "اجتماع", "2026-10-29 15:30", null],
  ["بعد ربع ساعة قهوة", "قهوة", "2026-10-29 14:15", null],
  ["بعد دقيقة اختبار", "اختبار", "2026-10-29 14:01", null],
  ["ذكرني بكرة الساعة ٩ ونصف مساءً موعد الطبيب", "موعد الطبيب", "2026-10-30 21:30", null],
  ["بكرة 3 العصر اجتماع", "اجتماع", "2026-10-30 15:00", null],
  ["بعد بكرة 10 صباحا سفر", "سفر", "2026-10-31 10:00", null],
  ["ذكرني يوم الاثنين 7:30 صباحا الدوام", "الدوام", "2026-11-02 07:30", null],
  ["كل يوم 6 مساء تمرين", "تمرين", "2026-10-29 18:00", "daily"],
  ["اتصل بالبنك بكرة", "اتصل بالبنك", "2026-10-30 09:00", null],
  ["ذكرني اليوم 8 مساء الدواء", "الدواء", "2026-10-29 20:00", null],
  ["بعد 3 ايام فاتورة الكهرباء", "فاتورة الكهرباء", "2026-11-01 14:00", null],
  ["الجمعة القادمة 10 صباحا صلاة", "صلاة", "2026-10-30 10:00", null],
  ["بكرة الساعة 5 الا ربع", "", "2026-10-30 16:45", null],
  ["اشتر 3 تفاحات", "اشتر 3 تفاحات", null, null],
  ["ذكرني الخميس الساعة 3 عصرا", "", "2026-10-29 15:00", null],
  ["ذكرني الخميس 9 صباحا", "", "2026-11-05 09:00", null],
  ["ذكرني بعد الظهر اتصل", "اتصل", "2026-10-30 12:00", null],
  ["كل اسبوع راجع الخطة", "راجع الخطة", "2026-11-05 09:00", "weekly"],
  ["ذكرني بعد 5 دقايق", "", "2026-10-29 14:05", null],
  ["ذكّرني أن أدفع الإيجار الأحد 10 صباحاً", "أدفع الإيجار", "2026-11-01 10:00", null],
  ["نبهني بعد ساعتين وربع", "", "2026-10-29 16:15", null],
  ["بكرة بعد الظهر غداء", "غداء", "2026-10-30 12:00", null],
  ["12:30 غداء", "غداء", "2026-10-30 12:30", null],
];
let bad = 0;
for (const [inp, text, at, rep] of cases) {
  const r = parseReminder(inp, now);
  const ok = r.text === text && f(r.at) === at && r.repeat === rep;
  if (!ok) { bad++; console.log("FAIL", inp, "=>", JSON.stringify({ t: r.text, at: f(r.at), rep: r.repeat, d: r.timeDefaulted }), "expected", JSON.stringify({text, at, rep})); }
}
console.log(bad ? `${bad} failed` : `all ${cases.length} ok`);
process.exit(bad ? 1 : 0);
