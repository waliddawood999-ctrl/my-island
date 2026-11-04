// دوك الصفحات (تصميم ARCH-UI): كبسولة سفلية بأيقونات؛ الصفحة الحالية فقط باسمها وبلون التركيز. الصفحات = مجموعات فوق التبويبات الدقيقة
// (pageGroups): الرئيسية · الالتقاط · الحافظة · التطبيقات · الأدوات (الرف/ملاحظة/اجتماعات/النظام كتبويبات فرعية). لا يغيّر منطق التبويبات نفسه.
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { i } from "../../i18n";
import { spring, tap } from "../../motion";

/** تعريف صفحة في الدوك: members = معرّفات التبويبات الدقيقة التي تنتمي لها. */
export interface PageGroup { id: string; label: string; icon: ReactNode; members: string[] }

// PURE-BEGIN
/** يبني الصفحات الظاهرة من التبويبات المتاحة فعليًا (وحدة مطفأة ⇒ تختفي عضويتها؛ مجموعة فارغة ⇒ تختفي الصفحة). */
export function pageGroups<T extends { id: string; members: string[] }>(defs: readonly T[], available: readonly string[]): (T & { members: string[] })[] {
  return defs
    .map((d) => ({ ...d, members: d.members.filter((m) => available.includes(m)) }))
    .filter((d) => d.members.length > 0);
}
/** فهرس الصفحة التي تحوي التبويب الحالي (0 إن لم يوجد). */
export function groupIndexOf(groups: readonly { members: string[] }[], tabId: string): number {
  const n = groups.findIndex((g) => g.members.includes(tabId));
  return n < 0 ? 0 : n;
}
/** التبويب المستهدف عند اختيار صفحة: آخر تبويب زرتَه فيها إن وُجد، وإلا أول عضو. */
export function targetTab(group: { members: string[] }, last: string | undefined): string {
  return last && group.members.includes(last) ? last : group.members[0];
}
// PURE-END

export function Dock({ groups, active, onSelect }: { groups: PageGroup[]; active: number; onSelect: (n: number) => void }) {
  return (
    <div role="tablist" dir={i("rtl", "ltr")} data-testid="page-dock" className="flex gap-[3px] rounded-full p-[5px]" style={{ background: "var(--island-surface-strong, rgba(255,255,255,.08))" }}>
      {groups.map((g, n) => {
        const on = n === active;
        return (
          <motion.button
            key={g.id}
            role="tab"
            aria-selected={on}
            aria-label={g.label}
            title={g.label}
            data-testid={`dock-${g.id}`}
            onClick={() => onSelect(n)}
            whileTap={tap.whileTap}
            layout
            transition={{ layout: spring.tabLead }}
            className="relative flex h-[34px] min-w-[34px] items-center justify-center gap-2 rounded-full px-[9px] text-[13px]"
            style={{ color: on ? "var(--accent-fg, #111)" : "color-mix(in srgb, var(--island-fg, #fff) 62%, transparent)", fontWeight: on ? 800 : 500 }}
          >
            {on && <motion.span layoutId="dock-active" aria-hidden className="absolute inset-0 rounded-full" style={{ background: "var(--accent, #fff)" }} transition={spring.tabLead} />}
            <span className="relative flex items-center">{g.icon}</span>
            {on && <span dir="auto" className="relative pe-1">{g.label}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

/** مفتاح تبويبات فرعية لصفحة «الأدوات» (الرف/ملاحظة/اجتماعات/النظام). */
export function SubTabs({ items, active, onSelect }: { items: { id: string; label: string }[]; active: string; onSelect: (id: string) => void }) {
  if (items.length < 2) return null;
  return (
    <div role="tablist" dir="ltr" data-testid="sub-tabs" className="mb-2 flex shrink-0 gap-1 self-start rounded-full p-[3px]" style={{ background: "var(--island-surface, rgba(255,255,255,.06))" }}>
      {items.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === active} onClick={() => onSelect(t.id)} dir="auto"
          className="rounded-full px-3 py-1 text-[12px]"
          style={t.id === active ? { background: "var(--island-surface-strong, rgba(255,255,255,.14))", fontWeight: 700 } : { opacity: 0.65 }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
