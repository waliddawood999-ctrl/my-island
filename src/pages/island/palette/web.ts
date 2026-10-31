/** رابط البحث على الويب من searchEngine/searchUrl؛ http/https فقط، {q} يُستبدل بالنص المُرمَّز. */
const ENGINES: Record<string, string> = {
  google: "https://www.google.com/search?q={q}",
  yandex: "https://yandex.com/search/?text={q}",
  bing: "https://www.bing.com/search?q={q}",
  ddg: "https://duckduckgo.com/?q={q}",
  duckduckgo: "https://duckduckgo.com/?q={q}",
  brave: "https://search.brave.com/search?q={q}",
  ecosia: "https://www.ecosia.org/search?q={q}",
};

export function searchUrlFor(engine: string | undefined, custom: string | undefined, q: string): string | null {
  const key = (engine ?? "google").toLowerCase();
  let tpl = key === "custom" ? (custom ?? "").trim() : (ENGINES[key] ?? ENGINES.google);
  if (!tpl) return null;
  const enc = encodeURIComponent(q);
  tpl = tpl.includes("{q}") ? tpl.replaceAll("{q}", enc) : tpl + enc;
  return /^https?:\/\//i.test(tpl) ? tpl : null;
}
