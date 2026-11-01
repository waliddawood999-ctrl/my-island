// انحدار مواقيت الصلاة مقابل الجداول الرسمية لأم القرى (ummulqura.org.sa).  node scripts/prayer.regression.mjs  (npm run test:prayer)
// لا نسخة ثانية للحساب: يقتطع المقطع الخالص من src-tauri/src/today.rs (City…civil_days) إلى صندوق Rust مؤقت بلا اعتماديات،
// فيمرّ كل رقم عبر compute_times + at_ms + schedule نفسها التي يستهلكها العدّاد والتنبيهات.
// إضافة مدينة/تاريخ لاحقًا = سطر واحد في CASES (قيم رسمية موثّقة فقط — لا قيم من مواقع حاسبات).
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const TOL = 0.5; // دقيقة: الخام يجب أن يقع ضمن ±TOL من الرسمي (يتّسق مع التقريب لأقرب دقيقة)
const IDS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const hm = (h, m) => h * 60 + m;
// [المدينة (معرّف today.rs), التاريخ, [فجر, شروق, ظهر, عصر, مغرب, عشاء] بالدقائق من منتصف الليل (12 ساعة→24)]
const CASES = [
  ["madinah", "2026-11-01", [hm(5, 10), hm(6, 28), hm(12, 6), hm(15, 18), hm(17, 42), hm(19, 12)]],
  ["riyadh", "2026-11-01", [hm(4, 42), hm(6, 0), hm(11, 37), hm(14, 50), hm(17, 14), hm(18, 44)]],
  // مكة لا تُضاف قبل تحقق حي من ummulqura.org.sa (مواقع الحاسبات متناقضة).
];

const src = readFileSync("src-tauri/src/today.rs", "utf8");
const a = src.indexOf("pub struct City {"), b = src.indexOf("pub fn civil_days");
if (a < 0 || b < 0) throw new Error("today.rs: لم يُعثر على مقطع الحساب الخالص");
const body = src.slice(a, src.indexOf("\n", b) + 1);
const main = `
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (y, m, d): (i64, i64, i64) = (args[2].parse().unwrap(), args[3].parse().unwrap(), args[4].parse().unwrap());
    let c = city_by_id(&args[1]);
    let days = days_from_civil(y, m, d);
    let raw = times_arr(&compute_times(days, c.lat, c.lon));
    let sch = schedule(days, c);
    for (i, id) in IDS.iter().enumerate() {
        let shown = (sch[i].1 + TZ_MS).rem_euclid(DAY_MS) / 60_000;
        println!("{id} {:.4} {shown}", raw[i] * 60.0);
    }
}`;
const dir = mkdtempSync(join(tmpdir(), "prayer-"));
mkdirSync(join(dir, "src"));
writeFileSync(join(dir, "Cargo.toml"), '[package]\nname="prayer"\nversion="0.0.0"\nedition="2021"\n');
writeFileSync(join(dir, "src/main.rs"), `#![allow(dead_code)]\nconst TZ_HOURS: f64 = 3.0;\nconst TZ_MS: i64 = 3 * 3_600_000;\nconst DAY_MS: i64 = 86_400_000;\n${body}\n${main}\n`);
execFileSync("cargo", ["build", "-q", "--manifest-path", join(dir, "Cargo.toml")], { stdio: "inherit" });
const bin = join(dir, "target/debug/prayer");

const fmt = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, "0")}`;
let fail = 0, n = 0;
for (const [city, date, want] of CASES) {
  const [y, m, d] = date.split("-").map(Number);
  const rows = execFileSync(bin, [city, y, m, d], { encoding: "utf8" }).trim().split("\n").map((l) => l.split(" "));
  console.log(`\n${city} ${date}`);
  rows.forEach(([id, raw, shown], i) => {
    n++;
    const diff = +raw - want[i];
    const okShown = +shown === want[i], okRaw = Math.abs(diff) <= TOL;
    if (!okShown || !okRaw) fail++;
    console.log(`  ${okShown && okRaw ? "✓" : "✗"} ${id.padEnd(8)} raw ${(+raw).toFixed(2).padStart(7)} − official ${String(want[i]).padStart(4)} = ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}  | shown ${fmt(+shown)} vs ${fmt(want[i])}`);
  });
}
console.log(fail ? `\nFAILED ${fail}/${n}` : `\nALL PASSED ${n}/${n}`);
process.exit(fail ? 1 : 0);
