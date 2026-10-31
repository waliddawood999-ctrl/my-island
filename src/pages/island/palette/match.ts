import { normText } from "./norm";

/** نفس منطق files.rs::score: كل الرموز يجب أن تظهر؛ التطابق التام > البادئة > بداية كلمة > جزء. */
export function score(name: string, query: string): number | null {
  const lc = normText(name);
  const toks = normText(query).split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const words = lc.split(/[^\p{L}\p{N}]+/u);
  let total = 0;
  for (const t of toks) {
    if (lc === t) total += 100;
    else if (lc.startsWith(t)) total += 80;
    else if (words.some((w) => w.startsWith(t))) total += 60;
    else if (lc.includes(t)) total += 40;
    else return null;
  }
  return total * 10 - Math.min(lc.length, 200) / 4;
}

/** أحرف أولى (vsc ⇒ Visual Studio Code) كمطابقة ثانوية ضعيفة. */
export function initials(name: string, query: string): boolean {
  const q = normText(query).replace(/\s+/g, "");
  if (q.length < 2) return false;
  const ini = normText(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w[0]).join("");
  return ini.startsWith(q);
}
