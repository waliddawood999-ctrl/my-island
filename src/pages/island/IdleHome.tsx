// الرئيسية بلا ميديا (ARCH-UI «يومك + ابدأ من هنا»): تحية بحسب الوقت + «ابدأ من حيث توقفت» (آخر ملاحظة · آخر عنصر حافظة · مساحة العمل · اللقطات)
// + «وقتي اليوم». جلب واحد عند الفتح فقط (لا استطلاع ولا مؤقّتات)؛ الصلاة/الطقس/الاجتماع/البطارية تبقى في HomeTiles تحتها.
import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import { Camera, ClipboardList, Grid2x2, Notebook } from "lucide-react";
import { i } from "../../i18n";
import { itemVariants, sectionVariants, tap } from "../../motion";
import type { Settings } from "../../settings";
import type { AttentionSnap } from "../../useAttention";

// PURE-BEGIN
/** تحية الوقت: قبل 12 صباح، 12–17 نهار، بعدها مساء (ar/en). */
export function greetingFor(hour: number, lang: "ar" | "en"): string {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  if (lang === "en") return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return h < 12 ? "صباح الخير" : h < 17 ? "طاب يومك" : "مساء الخير";
}
/** نص مختصر من HTML (للملاحظة) أو نص عادي: يزيل الوسوم ويطوي المسافات ويقصّ بعلامة … عند max. */
export function snippet(raw: string | null | undefined, max = 34): string {
  const t = String(raw ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
/** «وقتي اليوم» كنص قصير: ثوانٍ إجمالية ⇒ "3س 12د" / "3h 12m". */
export function fmtFocus(totalSec: number, lang: "ar" | "en"): string {
  const m = Math.max(0, Math.floor(totalSec / 60)), h = Math.floor(m / 60), r = m % 60;
  const [hs, ms] = lang === "en" ? ["h", "m"] : ["س", "د"];
  return h > 0 ? `${h}${hs} ${r}${ms}` : `${r}${ms}`;
}
export interface Suggestion { id: "note" | "clip" | "workspace" | "captures"; title: string; sub: string }
/** أول اقتراحين متاحين؛ لا نختلق محتوى حين لا توجد بيانات. */
export function buildSuggestions(o: { note: string; clip: string; workspace: string; workspaceItems: number; lang: "ar" | "en" }): Suggestion[] {
  const ar = o.lang === "ar", out: Suggestion[] = [];
  if (o.note) out.push({ id: "note", title: ar ? "أكمل ملاحظتك" : "Continue your note", sub: o.note });
  if (o.clip) out.push({ id: "clip", title: ar ? "آخر ما نسخت" : "Last copied", sub: o.clip });
  if (o.workspace) out.push({ id: "workspace", title: o.workspace, sub: ar ? `مساحة عمل · ${o.workspaceItems} عناصر` : `Workspace · ${o.workspaceItems} items` });
  out.push({ id: "captures", title: ar ? "آخر الملتقطات" : "Recent captures", sub: ar ? "افتح مجلد اللقطات" : "Open the captures folder" });
  return out.slice(0, 2);
}
// PURE-END

const ICON = { note: Notebook, clip: ClipboardList, workspace: Grid2x2, captures: Camera } as const;

export function IdleHome({ settings, attention, onOpenTab, time, children }: { settings: Partial<Settings>; attention: AttentionSnap | null; onOpenTab: (id: string) => void; time?: string; children?: ReactNode }) {
  const lang = settings.language === "en" ? "en" : "ar";
  const [note, setNote] = useState("");
  const [clip, setClip] = useState("");
  useEffect(() => {
    let alive = true;
    invoke<{ html?: string }>("note_get").then((n) => alive && setNote(snippet(n?.html))).catch(() => {});
    invoke<{ kind: string; text: string | null }[]>("clip_list").then((l) => { if (alive) setClip(snippet((l ?? []).find((c) => c.kind === "text" && c.text)?.text)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const ws = (settings.workspaces ?? [])[0];
  const sugg = buildSuggestions({ note, clip, workspace: ws?.name ?? "", workspaceItems: ws?.items?.length ?? 0, lang });
  const run = (id: Suggestion["id"]) => {
    if (id === "note" || id === "clip") onOpenTab(id);
    else if (id === "workspace" && ws) invoke("workspace_open", { id: ws.id }).catch(() => {});
    else invoke("open_captures").catch(() => {});
  };
  const focus = settings.attentionTracking ?? true ? attention : null;
  return (
    <motion.div data-testid="idle-home" custom={0} variants={sectionVariants} initial="initial" animate="animate" className="flex min-w-0 shrink-0 flex-col gap-2">
      <div className="home-day-header flex items-baseline justify-between gap-3" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div><span data-testid="idle-greeting" className="home-greeting text-[20px] font-extrabold">{greetingFor(new Date().getHours(), lang)}</span>
        {time && <h2 className="home-day-title">{i("يومك", "Your day")}</h2>}</div>
        {time ? <span data-testid="idle-clock" dir="ltr" className="home-day-clock">{time}</span> : focus && focus.enabled && focus.total > 0 && (
          <span data-testid="idle-focus" className="text-[12px] text-white/55">{i("وقتي اليوم", "My time today")} <b className="text-white/90">{fmtFocus(focus.total, lang)}</b></span>
        )}
      </div>
      {children}
      <span className="text-[11.5px] text-white/50" dir="auto">{i("ابدأ من حيث توقفت", "Pick up where you left off")}</span>
      <div className="grid grid-cols-2 gap-2">
        {sugg.map((s, n) => {
          const Ic = ICON[s.id];
          return (
            <motion.button key={s.id} custom={n} variants={itemVariants} initial="initial" animate="animate" whileHover={tap.whileHover} whileTap={tap.whileTap} transition={tap.transition}
              data-testid={`idle-${s.id}`} onClick={(e) => { e.stopPropagation(); run(s.id); }} dir="auto"
              className="i-card home-resume flex min-w-0 items-center gap-2 px-3 py-2 text-start">
              <span className="shrink-0" style={{ color: "var(--accent)" }}><Ic size={14} /></span>
              <span className="min-w-0"><span className="block truncate text-[12.5px] font-bold">{s.title}</span><span className="block truncate text-[11px] text-white/55">{s.sub}</span></span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
