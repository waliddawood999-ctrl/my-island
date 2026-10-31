// اختبار منطق شريط الأوامر (أسعار حية/مؤقّت سريع/مساحات العمل): node scripts/palette.test.mjs (أو npm run test:palette)
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "pal-"));
const load = async (src, name) => {
  const out = join(dir, name + ".mjs");
  await build({ entryPoints: [src], bundle: true, format: "esm", outfile: out, logLevel: "warning" });
  return import(pathToFileURL(out).href);
};
const { convert, setLiveRates, isCurrencyQuery, RATES_UPDATED } = await load("src/pages/island/palette/convert.ts", "convert");
const { parseQuickTimer, fmtDuration } = await load("src/pages/island/palette/timer.ts", "timer");
const { matchWorkspaces } = await load("src/pages/island/palette/workspaces.ts", "ws");
let fail = 0, n = 0;
const eq = (name, got, want) => {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`✗ ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
};

// ── عملات: المضمّنة ثم الحية ثم السقوط
let c = convert("100 usd sar");
eq("builtin sar", c.text, "375 SAR");
eq("builtin note", c.note, `builtin:${RATES_UPDATED}`);
eq("isCurrencyQuery yes", isCurrencyQuery("100 usd eur"), true);
eq("isCurrencyQuery no (units)", isCurrencyQuery("5 km mi"), false);
setLiveRates({ rates: { usd: 1, sar: 3.8, eur: 0.5, xaf: 600 }, updated: 1_700_000_000_000, source: "live" });
c = convert("100 usd sar");
eq("live sar", c.text, "380 SAR");
eq("live note", c.note, "live:live:1700000000000");
eq("live adds new currency", convert("1 usd xaf")?.text, "600 XAF");
eq("live eur→sar", convert("10 eur sar")?.text, "76 SAR");
setLiveRates({ rates: { usd: 1, sar: 3.8 }, updated: 5, source: "stale" });
eq("stale note", convert("1 usd sar").note, "live:stale:5");
eq("builtin currency not in live falls back", convert("1 usd eur")?.text, "0.92 EUR");
setLiveRates(null);
eq("null → builtin again", convert("100 usd sar").text, "375 SAR");
setLiveRates({ rates: { sar: 3 }, updated: 1, source: "live" }); // بلا usd=1 ⇒ مرفوضة
eq("invalid live rejected", convert("100 usd sar").text, "375 SAR");
eq("units untouched", convert("5 km to mi").note, undefined);

// ── مؤقّت سريع
const t = (s) => parseQuickTimer(s);
eq("timer 25", t("timer 25"), { seconds: 1500, label: "" });
eq("timer 25m", t("timer 25m"), { seconds: 1500, label: "" });
eq("timer 90s", t("timer 90s"), { seconds: 90, label: "" });
eq("timer 1.5h", t("timer 1.5h"), { seconds: 5400, label: "" });
eq("timer 1,5 h", t("timer 1,5 h"), { seconds: 5400, label: "" });
eq("ar مؤقت 10 دقائق", t("مؤقت 10 دقائق"), { seconds: 600, label: "" });
eq("ar مؤقّت ٢٥ (tashkeel+digits)", t("مؤقّت ٢٥"), { seconds: 1500, label: "" });
eq("ar ساعة", t("مؤقت 2 ساعة"), { seconds: 7200, label: "" });
eq("label", t("timer 25 مذاكرة الرياضيات"), { seconds: 1500, label: "مذاكرة الرياضيات" });
eq("label with unit", t("timer 5 min شاي"), { seconds: 300, label: "شاي" });
eq("case kept in label", t("TIMER 5 Study"), { seconds: 300, label: "Study" });
eq("unknown unit → label", t("timer 5 pomodoro"), { seconds: 300, label: "pomodoro" });
eq("zero rejected", t("timer 0"), null);
eq("over 24h rejected", t("timer 25h"), null);
eq("no number", t("timer"), null);
eq("timer apps not hijacked", t("timers 25"), null);
eq("fmt", [fmtDuration(1500), fmtDuration(90), fmtDuration(5400), fmtDuration(3601)], ["25m", "1m 30s", "1h 30m", "1h 1s"]);

// ── مساحات العمل
const ws = [
  { id: "a", name: "عمل", items: ["C:\\x.exe", "https://a.com"] },
  { id: "b", name: "Study", items: ["D:\\Books"] },
  { id: "c", name: "فارغة", items: [] },
  { id: "d", name: "Work Project", items: ["https://b.com"] },
];
eq("by name ar", matchWorkspaces(ws, "عمل").map((w) => w.id), ["a"]);
eq("by name en partial", matchWorkspaces(ws, "stu").map((w) => w.id), ["b"]);
eq("multi word", matchWorkspaces(ws, "work").map((w) => w.id), ["d"]);
eq("empty workspace never offered", matchWorkspaces(ws, "فارغة"), []);
eq("prefix ws lists all valid", matchWorkspaces(ws, "ws").map((w) => w.id), ["a", "b", "d"]);
eq("prefix ar + name", matchWorkspaces(ws, "مساحة study").map((w) => w.id), ["b"]);
eq("no match", matchWorkspaces(ws, "zzz"), []);
eq("undefined list", matchWorkspaces(undefined, "x"), []);
eq("garbage list", matchWorkspaces([null, { id: 1 }], "x"), []);

console.log(fail ? `\n${fail}/${n} فشل` : `${n}/${n} نجح`);
process.exit(fail ? 1 : 0);
