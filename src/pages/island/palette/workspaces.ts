import type { Workspace } from "../../../settings";
import { normText } from "./norm";
import { score } from "./match";

const PREFIX = /^(?:workspace|ws|مساحة|مساحه)(?:\s+|$)/u;

/** مساحات العمل المطابقة للاستعلام: باسمها مباشرة، أو بالبادئة «ws/مساحة» (بلا باقٍ ⇒ الكل). تتجاهل غير الصالحة. */
export function matchWorkspaces(list: Workspace[] | undefined, query: string, max = 3): Workspace[] {
  if (!Array.isArray(list)) return [];
  const valid = list.filter((w) => w && typeof w.id === "string" && typeof w.name === "string" && Array.isArray(w.items) && w.items.length);
  const q = normText(query).trim();
  if (!q) return [];
  const pm = PREFIX.exec(q);
  const rest = pm ? q.slice(pm[0].length).trim() : q;
  if (pm && !rest) return valid.slice(0, max);
  if (!rest) return [];
  return valid
    .map((w) => ({ w, s: score(w.name, rest) }))
    .filter((x): x is { w: Workspace; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.w);
}
