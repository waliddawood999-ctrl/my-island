// اختبار منطق «اليوم» الخالص: الساعة الذهبية، عدّادات الأحداث، الساعة العالمية.  node scripts/today.test.mjs  (npm run test:today)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "today-")), "m.mjs");
await build({ entryPoints: ["src/today.ts"], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
const m = await import(pathToFileURL(out).href);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };

const H = 3_600_000;
const day = Date.UTC(2026, 10, 1) - 3 * H; // منتصف ليل 2026-11-01 بتوقيت الرياض
const prayers = [["fajr", 4.5], ["sunrise", 5.9], ["dhuhr", 11.6], ["asr", 14.8], ["maghrib", 17.3], ["isha", 18.8]].map(([id, h]) => ({ id, at: day + h * H }));
prayers.push({ id: "fajr", at: day + 28.5 * H });

// ── الساعة الذهبية من الشروق/الغروب المحسوبين
const sr = prayers[1].at, ss = prayers[4].at;
eq("before sunrise ⇒ morning upcoming", m.goldenHour(prayers, day + 3 * H), { phase: "morning", start: sr, end: sr + H, state: "upcoming" });
eq("at sunrise ⇒ morning now", m.goldenHour(prayers, sr)?.state, "now");
eq("just after morning window ⇒ evening upcoming", m.goldenHour(prayers, sr + H + 1), { phase: "evening", start: ss - H, end: ss, state: "upcoming" });
eq("one hour before sunset ⇒ evening now", m.goldenHour(prayers, ss - H)?.state, "now");
eq("after sunset ⇒ null", m.goldenHour(prayers, ss), null);
eq("no sunrise/maghrib ⇒ null", m.goldenHour([{ id: "fajr", at: 1 }], 0), null);
eq("tomorrow's fajr (7th entry) is ignored", m.goldenHour(prayers.slice(0, 6).filter((p) => p.id !== "sunrise" && p.id !== "maghrib").concat([{ id: "fajr", at: 99 }]), 0), null);

// ── عدّادات الأحداث (يوم مدني بتوقيت الرياض)
const noon = day + 12 * H;
eq("civilDate", m.civilDate(noon), "2026-11-01");
eq("civilDate rolls at Riyadh midnight", [m.civilDate(day + 24 * H - 1), m.civilDate(day + 24 * H)], ["2026-11-01", "2026-11-02"]);
eq("daysUntil today/tomorrow/past/+10", [m.daysUntil("2026-11-01", noon), m.daysUntil("2026-11-02", noon), m.daysUntil("2026-10-30", noon), m.daysUntil("2026-11-11", noon)], [0, 1, -2, 10]);
eq("daysUntil across month/year", [m.daysUntil("2027-01-01", noon), m.daysUntil("2028-02-29", noon) - m.daysUntil("2028-02-28", noon)], [61, 1]);
eq("invalid dates ⇒ null", [m.daysUntil("2026-02-30", noon), m.daysUntil("x", noon), m.daysUntil("2026-13-01", noon)], [null, null, null]);
const raw = [
  { id: "a", name: "  Eid  ", date: "2026-11-05" }, { id: "b", name: "Past", date: "2026-10-01" }, { id: "c", name: "", date: "2026-11-09" },
  { id: "a", name: "dup id", date: "2026-11-06" }, { id: "d", name: "Bad date", date: "2026-02-31" }, null, 5, { id: "e", name: "Soon", date: "2026-11-02" },
  { id: "f", name: "x".repeat(100), date: "2026-12-25" },
];
eq("sanitize drops junk, trims & caps name", m.sanitizeCountdowns(raw).map((c) => [c.id, c.name.length > 40 ? "LONG" : c.name]), [["a", "Eid"], ["b", "Past"], ["e", "Soon"], ["f", "x".repeat(40)]]);
eq("sanitize non-array ⇒ []", [m.sanitizeCountdowns(null), m.sanitizeCountdowns("x"), m.sanitizeCountdowns({})], [[], [], []]);
eq("max 12", m.sanitizeCountdowns(Array.from({ length: 30 }, (_, k) => ({ id: "i" + k, name: "n" + k, date: "2026-12-01" }))).length, 12);
eq("upcoming: future only, nearest first, limit", m.upcomingCountdowns(raw, noon, 2).map((c) => [c.id, c.days]), [["e", 1], ["a", 4]]);
eq("upcoming: includes today", m.upcomingCountdowns([{ id: "t", name: "T", date: "2026-11-01" }], noon).map((c) => c.days), [0]);
eq("daysLabel", [m.daysLabel(0, "ar"), m.daysLabel(1, "en"), m.daysLabel(2, "ar"), m.daysLabel(5, "ar"), m.daysLabel(12, "ar"), m.daysLabel(5, "en")], ["اليوم", "Tomorrow", "يومان", "5 أيام", "12 يومًا", "5 days"]);

// ── الساعة العالمية
eq("sanitize clocks: known only, deduped, max 2", m.sanitizeWorldClocks(["Europe/London", "Nope/Zone", "Europe/London", "Asia/Tokyo", "Asia/Dubai"]), ["Europe/London", "Asia/Tokyo"]);
eq("sanitize clocks garbage", [m.sanitizeWorldClocks(null), m.sanitizeWorldClocks([1, {}])], [[], []]);
eq("London in November = UTC (09:00 when Riyadh is noon)", m.worldClock("Europe/London", noon, "24"), { time: "09:00", dayDelta: 0 });
eq("12-hour format", m.worldClock("Europe/London", noon, "12").time, "9:00 AM");
eq("Tokyo +6h vs Riyadh ⇒ next day after 18:00 Riyadh", m.worldClock("Asia/Tokyo", day + 19 * H, "24"), { time: "01:00", dayDelta: 1 });
eq("New York behind ⇒ previous day just after midnight Riyadh", m.worldClock("America/New_York", day + 1 * H, "24").dayDelta, -1);
eq("city names", [m.worldCityName("Asia/Dubai", "ar"), m.worldCityName("Asia/Dubai", "en"), m.worldCityName("X/Y", "en")], ["دبي", "Dubai", "X/Y"]);
eq("every world city id is a valid IANA zone", m.WORLD_CITIES.every((c) => { try { new Intl.DateTimeFormat("en", { timeZone: c.id }); return true; } catch { return false; } }), true);

console.log(fail ? `FAILED ${fail}/${n}` : `ALL PASSED ${n}/${n}`);
process.exit(fail ? 1 : 0);
