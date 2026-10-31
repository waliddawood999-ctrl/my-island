// محوّل وحدات وعملات. المعدلات المضمّنة أدناه احتياطية (محدّثة يدويًا)؛ الأسعار الحية (rates_get ⇒ setLiveRates)
// تتقدّم عليها متى وُجدت، وإلا يسقط التحويل تلقائيًا على المضمّنة.
import { fmtNum, normDigits } from "./norm";

/** وحدات العملة لكل 1 دولار أمريكي. آخر تحديث يدوي: 2025-06 (تقريبية؛ المربوطة بالدولار دقيقة). */
export const RATES_UPDATED = "2025-06";
export const RATES_PER_USD: Record<string, number> = {
  usd: 1, eur: 0.92, gbp: 0.78, chf: 0.82, jpy: 145, cny: 7.2, inr: 85.5, rub: 80, try: 39, cad: 1.37, aud: 1.53,
  sar: 3.75, aed: 3.6725, qar: 3.64, bhd: 0.376, omr: 0.3845, jod: 0.709, kwd: 0.306, egp: 50, iqd: 1310,
  lbp: 89500, syp: 13000, mad: 9.3, dzd: 131, tnd: 2.95, sdg: 600, yer: 250, ils: 3.5, pkr: 280, idr: 16300,
  myr: 4.25, sgd: 1.29, krw: 1370, brl: 5.6, mxn: 19.5, zar: 18, ngn: 1550, sek: 9.6, nok: 10.1, dkk: 6.9, pln: 3.7,
};

export interface LiveRates { rates: Record<string, number>; updated: number; source: "live" | "cache" | "stale" }
let live: LiveRates | null = null;

/** أسعار حية من rates_get؛ null يعيد المضمّنة. العملات الجديدة تُضاف للجدول فتصير قابلة للتحويل. */
export function setLiveRates(r: LiveRates | null) {
  live = r && r.rates && r.rates.usd === 1 ? r : null;
  if (live) for (const c of Object.keys(live.rates)) if (!U[c]) U[c] = { cat: "currency", to: 1, label: c.toUpperCase() };
}
export const liveRatesState = () => live;
const rateOf = (code: string): number | undefined => live?.rates[code] ?? RATES_PER_USD[code];

type Cat = "length" | "mass" | "volume" | "time" | "data" | "speed" | "temp" | "currency";
interface Unit { cat: Cat; to: number; label: string } // to = كم من الوحدة الأساس (م، كغ، ل، ث، بايت، م/ث)

const U: Record<string, Unit> = {};
function add(cat: Cat, label: string, to: number, ...names: string[]) {
  for (const n of [label.toLowerCase(), ...names]) U[n] = { cat, to, label };
}
// طول
add("length", "mm", 0.001, "ملم", "مليمتر"); add("length", "cm", 0.01, "سم", "سنتيمتر");
add("length", "m", 1, "متر", "م"); add("length", "km", 1000, "كم", "كيلومتر");
add("length", "in", 0.0254, "inch", "inches", "انش", "إنش", "بوصة"); add("length", "ft", 0.3048, "feet", "foot", "قدم");
add("length", "yd", 0.9144, "yard", "ياردة"); add("length", "mi", 1609.344, "mile", "miles", "ميل");
// كتلة
add("mass", "mg", 1e-6, "ملغ"); add("mass", "g", 0.001, "غرام", "جرام", "غ"); add("mass", "kg", 1, "كغ", "كيلو", "كيلوغرام", "كيلوجرام");
add("mass", "lb", 0.45359237, "lbs", "pound", "pounds", "باوند", "رطل"); add("mass", "oz", 0.028349523125, "ounce", "اونصة", "أونصة");
add("mass", "t", 1000, "طن", "ton");
// حجم
add("volume", "ml", 0.001, "مل", "مليلتر"); add("volume", "l", 1, "لتر", "liter", "litre"); add("volume", "gal", 3.785411784, "gallon", "جالون");
// زمن
add("time", "ms", 0.001, "ملي"); add("time", "s", 1, "sec", "ثانية", "ث"); add("time", "min", 60, "دقيقة", "د");
add("time", "h", 3600, "hr", "hour", "ساعة"); add("time", "d", 86400, "day", "يوم"); add("time", "wk", 604800, "week", "اسبوع", "أسبوع");
// بيانات (1024)
add("data", "B", 1, "byte", "بايت"); add("data", "KB", 1024, "كيلوبايت"); add("data", "MB", 1024 ** 2, "ميغابايت", "ميجابايت");
add("data", "GB", 1024 ** 3, "غيغابايت", "جيجابايت", "جيجا"); add("data", "TB", 1024 ** 4, "تيرابايت", "تيرا"); add("data", "PB", 1024 ** 5);
// سرعة
add("speed", "km/h", 1 / 3.6, "kmh", "kph", "كمس"); add("speed", "mph", 0.44704); add("speed", "m/s", 1, "mps");
// حرارة (التحويل خاص)
add("temp", "°C", 1, "c", "°c", "celsius", "مئوية"); add("temp", "°F", 1, "f", "°f", "fahrenheit", "فهرنهايت");
add("temp", "K", 1, "k", "kelvin", "كلفن");
// عملات (+ أسماء عربية شائعة)
for (const c of Object.keys(RATES_PER_USD)) U[c] = { cat: "currency", to: 1, label: c.toUpperCase() };
for (const [ar, c] of Object.entries({
  "دولار": "usd", "يورو": "eur", "ريال": "sar", "درهم": "aed", "جنيه": "egp", "دينار": "kwd", "ليرة": "try", "روبل": "rub", "استرليني": "gbp",
})) U[ar] = U[c];

const CONNECT = new Set(["to", "in", "=", "->", "→", "الى", "إلى", "as", "بال", "ب"]);

function tempConv(v: number, from: string, to: string): number {
  const c = from === "°C" ? v : from === "°F" ? ((v - 32) * 5) / 9 : v - 273.15;
  return to === "°C" ? c : to === "°F" ? (c * 9) / 5 + 32 : c + 273.15;
}

export interface ConvResult { text: string; from: string; to: string; /** عملة فقط: مصدر الأسعار (live:<source>:<ms> أو builtin:<YYYY-MM>) */ note?: string }

function parse(input: string): { num: number; a: Unit; b: Unit } | null {
  const s = normDigits(input).trim().toLowerCase().replace(/(\d)([^\d\s.,])/, "$1 $2");
  const toks = s.split(/\s+/).filter(Boolean);
  if (toks.length < 3 || toks.length > 4) return null;
  const num = Number(toks[0].replace(",", "."));
  if (!Number.isFinite(num) || !/^-?\d/.test(toks[0])) return null;
  let rest = toks.slice(1);
  if (rest.length === 3 && CONNECT.has(rest[1])) rest = [rest[0], rest[2]];
  if (rest.length !== 2) return null;
  const a = U[rest[0]], b = U[rest[1]];
  if (!a || !b || a.cat !== b.cat || a.label === b.label) return null;
  return { num, a, b };
}

/** هل الإدخال تحويل عملة؟ (يُستعمل لجلب الأسعار الحية كسولًا عند الحاجة فقط.) */
export function isCurrencyQuery(input: string): boolean {
  return parse(input)?.a.cat === "currency";
}

/** «100 usd sar» · «5 km to mi» · «30c f» · «2 gb mb». null إن لم يكن تحويلًا صالحًا. */
export function convert(input: string): ConvResult | null {
  const p = parse(input);
  if (!p) return null;
  const { num, a, b } = p;
  let out: number;
  let note: string | undefined;
  if (a.cat === "temp") out = tempConv(num, a.label, b.label);
  else if (a.cat === "currency") {
    const ra = rateOf(a.label.toLowerCase()), rb = rateOf(b.label.toLowerCase());
    if (!ra || !rb) return null;
    out = (num / ra) * rb;
    note = live ? `live:${live.source}:${live.updated}` : `builtin:${RATES_UPDATED}`;
  } else out = (num * a.to) / b.to;
  if (!Number.isFinite(out)) return null;
  const txt = a.cat === "currency" ? out.toLocaleString("en-US", { maximumFractionDigits: 2 }) : fmtNum(out, 6);
  return { text: `${txt} ${b.label}`, from: `${fmtNum(num)} ${a.label}`, to: b.label, note };
}
