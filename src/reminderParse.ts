// محلل تذكيرات بالعربية الطبيعية (المخطط §10.2): «ذكّرني أتصل بأمي بكرة 9» ⇒ نص + وقت فعلي + تكرار.
// دالة نقية بلا اعتماد على الواجهة ولا الشبكة؛ `now` يُمرَّر للاختبار. التصحيح اليدوي دائمًا من الواجهة.

export type RepeatKind = "daily" | "weekly" | null;

export interface ParsedReminder {
  /** نص التذكير بعد إزالة عبارات الوقت والتكرار وفعل «ذكّرني». */
  text: string;
  /** الوقت المحلَّل؛ null إن لم يُفهَم أي وقت. */
  at: Date | null;
  repeat: RepeatKind;
  /** ذُكر يوم دون ساعة فاعتُمدت الساعة الافتراضية 09:00. */
  timeDefaulted: boolean;
}

export const DEFAULT_HOUR = 9;

type Tag = "verb" | "day" | "wd" | "rep" | "rel" | "time" | "mer" | "fill";
interface Tok { raw: string; n: string; tag?: Tag }

/** تطبيع للمطابقة فقط: بلا تشكيل/تطويل، همزات موحّدة، ى→ي، ة→ه، أرقام عربية→لاتينية، بلا ترقيم طرفي. */
export function norm(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/^[\s,.،؛;!؟?"'«»()\[\]]+|[\s,.،؛;!؟?"'«»()\[\]]+$/g, "")
    .toLowerCase();
}

const VERBS = new Set(["ذكرني", "ذكرنا", "نبهني", "نبهنا", "ذكر", "تذكير", "ذكرنى"]);
const LEAD_FILLERS = new Set(["ان", "اني", "في", "عند", "ل", "ب", "ثم"]);

const DAY_OFFSET: Record<string, number> = {
  اليوم: 0, الليله: 0, بكره: 1, بكرا: 1, بكرى: 1, غدا: 1, غد: 1, باكر: 1,
};
const WEEKDAYS: Record<string, number> = {
  احد: 0, اثنين: 1, اتنين: 1, ثلاثاء: 2, ثلاثا: 2, تلات: 2, تلاتاء: 2, اربعاء: 3, اربعا: 3, خميس: 4, جمعه: 5, سبت: 6,
};
const NEXT_MOD = new Set(["القادم", "القادمه", "الجاي", "الجايه", "الجاييه", "المقبل", "المقبله"]);

const NUM_WORDS: Record<string, number> = {
  واحد: 1, واحده: 1, اثنين: 2, اثنان: 2, اثنتين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5,
  ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثماني: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10,
  عشرين: 20, ثلاثين: 30,
};
const FRACTIONS: Record<string, number> = { نصف: 0.5, نص: 0.5, ربع: 0.25, ثلث: 1 / 3 };

type Unit = "m" | "h" | "d" | "w";
const UNITS: Record<string, [Unit, number]> = {
  دقيقه: ["m", 1], دقايق: ["m", 1], دقائق: ["m", 1], دقيقتين: ["m", 2], دقيقتان: ["m", 2],
  ساعه: ["h", 1], ساعات: ["h", 1], ساعتين: ["h", 2], ساعتان: ["h", 2],
  يوم: ["d", 1], ايام: ["d", 1], يومين: ["d", 2], يومان: ["d", 2],
  اسبوع: ["w", 1], اسابيع: ["w", 1], اسبوعين: ["w", 2], اسبوعان: ["w", 2],
};

type Mer = "am" | "noon" | "pm" | "night";
const MERIDIEM: Record<string, [Mer, number]> = {
  صباحا: ["am", 8], الصباح: ["am", 8], الصبح: ["am", 8], بالصباح: ["am", 8], بالصبح: ["am", 8], فجرا: ["am", 5], الفجر: ["am", 5],
  ظهرا: ["noon", 12], الظهر: ["noon", 12], بالظهر: ["noon", 12],
  عصرا: ["pm", 16], العصر: ["pm", 16], مساء: ["pm", 18], مساءا: ["pm", 18], المساء: ["pm", 18], المغرب: ["pm", 18], العشاء: ["pm", 20],
  ليلا: ["night", 21], الليل: ["night", 21], بالليل: ["night", 21],
};

function numOf(n: string): number | undefined {
  if (/^\d+$/.test(n)) return Number(n);
  return NUM_WORDS[n];
}
function weekdayOf(n: string): number | undefined {
  const k = n.startsWith("ال") ? n.slice(2) : n;
  return WEEKDAYS[k];
}

function atDay(base: Date, dayDelta: number, h: number, m: number): Date {
  const d = new Date(base.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayDelta);
  d.setHours(h, m, 0, 0);
  return d;
}

/** يحلّل عبارة تذكير؛ لا يرمي أبدًا. */
export function parseReminder(input: string, now: Date = new Date()): ParsedReminder {
  const toks: Tok[] = input.split(/\s+/).filter(Boolean).map((raw) => ({ raw, n: norm(raw) })).filter((t) => t.n !== "" || false);
  const at = (k: number): Tok | undefined => toks[k];
  const free = (k: number) => !!toks[k] && !toks[k].tag;
  const use = (k: number, tag: Tag) => { toks[k].tag = tag; };

  // 1) فعل «ذكّرني» في البداية (+ «أن» بعده)
  if (toks[0] && VERBS.has(toks[0].n)) {
    use(0, "verb");
    if (toks[1] && (toks[1].n === "ان" || toks[1].n === "اني")) use(1, "fill");
  }

  // 2) التكرار: «كل يوم» / «كل يوم جمعة» / «كل جمعة» / «كل أسبوع» / يوميًا / أسبوعيًا
  let repeat: RepeatKind = null;
  let repeatWd: number | undefined;
  for (let k = 0; k < toks.length; k++) {
    if (!free(k)) continue;
    const n = toks[k].n;
    if (n === "يوميا") { use(k, "rep"); repeat = "daily"; break; }
    if (n === "اسبوعيا") { use(k, "rep"); repeat = "weekly"; break; }
    if (n !== "كل") continue;
    let j = k + 1;
    let hasYawm = false;
    if (at(j)?.n === "يوم") { hasYawm = true; j++; }
    const wd = at(j) && free(j) ? weekdayOf(at(j)!.n) : undefined;
    if (wd !== undefined) {
      use(k, "rep"); if (hasYawm) use(k + 1, "rep"); use(j, "rep");
      repeat = "weekly"; repeatWd = wd; break;
    }
    if (hasYawm) { use(k, "rep"); use(k + 1, "rep"); repeat = "daily"; break; }
    if (at(j)?.n === "اسبوع") { use(k, "rep"); use(j, "rep"); repeat = "weekly"; break; }
  }

  // 3) نسبي: «بعد ساعتين» / «بعد 10 دقائق» / «بعد نصف ساعة» / «بعد ساعة ونصف» / «بعد 3 أيام»
  let relative: Date | null = null;
  let relDays = false; // وحدة أيام/أسابيع: تحتفظ بتقويم اليوم وتقبل ساعة صريحة
  let relBase: Date | null = null;
  // «بعد بكرة / بعد غد» أولًا
  for (let k = 0; k + 1 < toks.length; k++) {
    if (free(k) && free(k + 1) && toks[k].n === "بعد" && DAY_OFFSET[toks[k + 1].n] === 1) {
      use(k, "day"); use(k + 1, "day");
      relBase = atDay(now, 2, now.getHours(), now.getMinutes());
      relDays = true;
      break;
    }
  }
  if (!relBase) {
    for (let k = 0; k < toks.length; k++) {
      if (!free(k) || toks[k].n !== "بعد") continue;
      let j = k + 1;
      let qty: number | undefined;
      const nj = at(j)?.n;
      if (nj === undefined || !free(j)) continue;
      if (FRACTIONS[nj] !== undefined) { qty = FRACTIONS[nj]; j++; }
      else if (numOf(nj) !== undefined) { qty = numOf(nj); j++; }
      const uTok = at(j);
      if (!uTok || !free(j) || !UNITS[uTok.n]) continue;
      const [unit, mult] = UNITS[uTok.n];
      let amount = qty === undefined ? mult : qty;
      const used = [k, ...(qty !== undefined ? [k + 1] : []), j];
      let end = j;
      // «ساعة ونصف» / «ساعتين وربع» / «ساعة و نص»
      const a = at(end + 1), b = at(end + 2);
      if (a && free(end + 1)) {
        const frac = a.n.startsWith("و") && FRACTIONS[a.n.replace(/^و(?:ال)?/, "")] !== undefined ? FRACTIONS[a.n.replace(/^و(?:ال)?/, "")]
          : a.n === "و" && b && free(end + 2) && FRACTIONS[b.n] !== undefined ? FRACTIONS[b.n] : undefined;
        if (frac !== undefined) {
          amount += frac;
          used.push(end + 1);
          if (a.n === "و") { used.push(end + 2); end += 2; } else end += 1;
        }
      }
      used.forEach((u) => use(u, "rel"));
      if (unit === "m") relative = new Date(now.getTime() + amount * 60_000);
      else if (unit === "h") relative = new Date(now.getTime() + amount * 3_600_000);
      else {
        const days = unit === "w" ? amount * 7 : amount;
        const whole = Math.floor(days);
        relBase = atDay(now, whole, now.getHours(), now.getMinutes());
        if (days - whole > 0) relBase = new Date(relBase.getTime() + (days - whole) * 86_400_000);
        relDays = true;
      }
      break;
    }
  }

  // 4) اليوم: كلمات اليوم وأيام الأسبوع (+ «القادم» + «يوم»)
  let dayOffset: number | undefined = relBase ? 0 : undefined; // نسبي أيام: relBase يحدد التاريخ
  let weekday: number | undefined = repeatWd;
  let nextMod = false;
  for (let k = 0; k < toks.length; k++) {
    if (!free(k)) continue;
    const n = toks[k].n;
    if (!relBase && dayOffset === undefined && DAY_OFFSET[n] !== undefined) { use(k, "day"); dayOffset = DAY_OFFSET[n]; continue; }
    const wd = weekdayOf(n);
    if (weekday === undefined && wd !== undefined) {
      use(k, "wd"); weekday = wd;
      if (k > 0 && free(k - 1) && toks[k - 1].n === "يوم") use(k - 1, "wd");
      continue;
    }
    if (NEXT_MOD.has(n) && weekday !== undefined) { use(k, "wd"); nextMod = true; }
  }

  // 5) الساعة
  let hour: number | undefined;
  let minute = 0;
  let merKind: Mer | undefined;
  let hourIs24 = false;
  const takeMer = (k: number): boolean => {
    if (!free(k)) return false;
    const m = MERIDIEM[toks[k].n];
    if (m) { merKind = m[0]; use(k, "mer"); return true; }
    if (toks[k].n === "ص") { merKind = "am"; use(k, "mer"); return true; }
    if (toks[k].n === "م") { merKind = "pm"; use(k, "mer"); return true; }
    return false;
  };
  const isDayTag = (k: number) => toks[k]?.tag === "day" || toks[k]?.tag === "wd" || toks[k]?.tag === "rep";
  const hasMerAt = (k: number) => !!toks[k] && free(k) && (MERIDIEM[toks[k].n] !== undefined || toks[k].n === "ص" || toks[k].n === "م");
  const halfAt = (k: number): { len: number; add: number; minus: number } | null => {
    const t = toks[k]?.n;
    if (!t || !free(k)) return null;
    const cleaned = t.replace(/^وال/, "و");
    if (cleaned.startsWith("و") && FRACTIONS[cleaned.slice(1)] !== undefined && cleaned.length > 1) {
      return { len: 1, add: Math.round(FRACTIONS[cleaned.slice(1)] * 60), minus: 0 };
    }
    if (t === "و" && free(k + 1) && FRACTIONS[toks[k + 1].n] !== undefined) {
      return { len: 2, add: Math.round(FRACTIONS[toks[k + 1].n] * 60), minus: 0 };
    }
    if (t === "الا" && free(k + 1) && (toks[k + 1].n === "ربع" || toks[k + 1].n === "ثلث")) {
      return { len: 2, add: 0, minus: Math.round(FRACTIONS[toks[k + 1].n] * 60) };
    }
    return null;
  };
  const setHM = (h: number, m: number, k: number, extraLen: number) => {
    hour = h; minute = m;
    use(k, "time");
    for (let q = 1; q <= extraLen; q++) use(k + q, "time");
    const p = k - 1;
    if (p >= 0 && toks[p].tag === undefined && (toks[p].n === "الساعه" || toks[p].n === "ساعه")) use(p, "time");
    const pp = p - 1;
    if (p >= 0 && toks[p].tag === "time" && pp >= 0 && free(pp) && (toks[pp].n === "في" || toks[pp].n === "عند")) use(pp, "fill");
    // الفترة: بعد الرقم (والنصف) أو قبله
    if (!takeMer(k + 1 + extraLen)) {
      if (!takeMer(k - 1)) { if (toks[k - 1]?.tag === "time") takeMer(k - 2); }
    }
    // «بعد الظهر / بعد العصر»: كلمة «بعد» السابقة للفترة جزء منها
    for (let q = 0; q < toks.length; q++) {
      if (toks[q].tag === "mer" && q > 0 && free(q - 1) && toks[q - 1].n === "بعد") use(q - 1, "fill");
    }
  };

  if (!relative) {
    for (let k = 0; k < toks.length && hour === undefined; k++) {
      if (!free(k)) continue;
      const n = toks[k].n;
      let mt = /^(\d{1,2}):(\d{2})$/.exec(n);
      if (mt && Number(mt[1]) <= 24 && Number(mt[2]) < 60) {
        setHM(Number(mt[1]), Number(mt[2]), k, 0);
        continue;
      }
      // 9ص / 9:30م / 9pm
      mt = /^(\d{1,2})(?::(\d{2}))?(ص|م|am|pm)$/.exec(n);
      if (mt && Number(mt[1]) <= 12) {
        use(k, "time");
        hour = Number(mt[1]); minute = mt[2] ? Number(mt[2]) : 0;
        merKind = mt[3] === "ص" || mt[3] === "am" ? "am" : "pm";
        continue;
      }
      const v = numOf(n);
      if (v === undefined || v > 24) continue;
      const prevSaa = k > 0 && free(k - 1) && (toks[k - 1].n === "الساعه" || toks[k - 1].n === "ساعه");
      const isDigits = /^\d+$/.test(n);
      if (!isDigits && !prevSaa) continue;
      const half = halfAt(k + 1);
      const eligible =
        prevSaa || (k > 0 && isDayTag(k - 1)) || (k + 1 < toks.length && isDayTag(k + 1)) ||
        hasMerAt(k + 1) || half !== null ||
        (k > 1 && toks[k - 1].tag === "time" && isDayTag(k - 2));
      if (!eligible) continue;
      if (half) {
        if (half.minus) setHM(v === 1 ? 12 : v - 1, 60 - half.minus, k, half.len);
        else setHM(v, half.add, k, half.len);
      } else setHM(v, 0, k, 0);
    }
    // فترة بلا رقم: «بكرة العصر» ⇒ ساعة افتراضية للفترة
    if (hour === undefined) {
      for (let k = 0; k < toks.length; k++) {
        if (!free(k)) continue;
        const m = MERIDIEM[toks[k].n];
        if (m) {
          use(k, "mer");
          hour = m[1]; minute = 0; hourIs24 = true; // ساعة افتراضية للفترة بصيغة 24
          if (k > 0 && free(k - 1) && toks[k - 1].n === "بعد") use(k - 1, "fill");
          break;
        }
      }
    }
  }

  // 6) تركيب الوقت
  if (repeat === "weekly" && weekday === undefined && dayOffset === undefined && !relBase && !relative) dayOffset = 7; // «كل أسبوع»
  let result: Date | null = null;
  let timeDefaulted = false;
  /** ساعة بلا فترة ليوم مستقبلي: 7–11 صباحًا، 12 ظهرًا، 1–6 مساءً. */
  const guessHour = (h: number): number => (h === 12 ? 12 : h >= 1 && h <= 6 ? h + 12 : h);
  const adjustHour = (h: number): number => {
    if (merKind === "am") return h === 12 ? 0 : h;
    if (merKind === "noon") return h >= 1 && h <= 5 ? h + 12 : h;
    if (merKind === "pm") return h < 12 ? h + 12 : h;
    if (merKind === "night") return h === 12 ? 0 : h >= 6 && h <= 11 ? h + 12 : h;
    return h;
  };

  if (relative) {
    result = relative;
  } else if (relBase) {
    if (hour !== undefined) {
      const h = merKind ? adjustHour(hour) : guessHour(hour);
      result = atDay(relBase, 0, h, minute);
    } else result = relBase;
  } else if (hour !== undefined || dayOffset !== undefined || weekday !== undefined || repeat) {
    const explicitMer = merKind !== undefined || hourIs24;
    let h = hour;
    if (h === undefined) { h = DEFAULT_HOUR; timeDefaulted = true; }
    // يوم الهدف
    const todayAt = (hh: number) => atDay(now, 0, hh, minute);
    if (weekday !== undefined) {
      let diff = (weekday - now.getDay() + 7) % 7;
      if (nextMod && diff === 0) diff = 7;
      const hh = hour === undefined ? h : explicitMer || h > 12 || h === 0 ? adjustHour(h) : guessHour(h);
      let d = atDay(now, diff, hh, minute);
      if (d.getTime() <= now.getTime()) d = atDay(now, diff + 7, hh, minute);
      result = d;
    } else if (dayOffset !== undefined && dayOffset > 0) {
      const hh = hour === undefined ? h : explicitMer || h > 12 || h === 0 ? adjustHour(h) : guessHour(h);
      result = atDay(now, dayOffset, hh, minute);
    } else {
      // اليوم صراحةً أو بلا يوم: أقرب حدوث مستقبلي للساعة
      if (hour === undefined) {
        const t = todayAt(h);
        result = t.getTime() > now.getTime() ? t : atDay(now, 1, h, minute);
      } else if (explicitMer || h > 12 || h === 0) {
        const t = todayAt(adjustHour(h));
        result = t.getTime() > now.getTime() || dayOffset === 0 ? t : atDay(now, 1, adjustHour(h), minute);
      } else {
        const c1 = todayAt(h % 12), c2 = todayAt((h % 12) + 12);
        const pick = [c1, c2].find((c) => c.getTime() > now.getTime());
        result = pick ?? (dayOffset === 0 ? c2 : atDay(now, 1, guessHour(h), minute));
      }
    }
  }

  // 7) نص التذكير = الرموز غير المستهلكة
  const rest = toks.filter((t) => !t.tag);
  while (rest.length && LEAD_FILLERS.has(rest[0].n) && rest.length > 1) rest.shift();
  while (rest.length > 1 && ["في", "عند", "ال", "الساعه"].includes(rest[rest.length - 1].n)) rest.pop();
  const text = rest.map((t) => t.raw).join(" ").replace(/^[\s,،.:؛-]+|[\s,،.:؛-]+$/g, "");

  return { text, at: result, repeat, timeDefaulted };
}
