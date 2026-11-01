import { isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/*
 * نمط shadcn/ui (zinc) على رموز ثيمنا: نصف قطر 0.5rem (rounded-lg) وحدود/خفوت بشفافية white/N — فتنعكس تلقائيًا
 * في الفاتح (--color-white مُعاد ربطه) ولا تكسر الزجاج (لا خلفيات صلبة جديدة). عرض فقط؛ لا مفاتيح ولا سلوك.
 */
export const inputCls = "h-9 rounded-md border border-white/15 bg-[var(--app-field)] px-3 text-sm shadow-xs outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-white/30";
/** أزرار shadcn: أساسي (مملوء بلون النص) / outline (حدّ) / destructive. */
export const btnPrimary = "inline-flex h-9 items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-black shadow-xs hover:bg-white/90 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white/30 outline-none";
export const btnOutline = "inline-flex h-9 items-center justify-center rounded-md border border-white/15 bg-transparent px-4 text-sm font-medium shadow-xs hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white/30 outline-none";

/** مجموعة رئيسية في الإعدادات (عام · المظهر والميديا · الوحدات · الأداء): عنوان واحد متّسق ثم أقسامها بتباعد ثابت. */
export function Group({ id, title, desc, children }: { id: string; title: string; desc?: string; children: ReactNode }) {
  return (
    <div id={`grp-${id}`} data-group={id} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        {desc && <p dir="auto" className="text-sm text-white/50">{desc}</p>}
      </div>
      <div role="separator" className="h-px w-full bg-white/10" />
      <div className="flex flex-col gap-8 [&>section+section]:border-t [&>section+section]:border-white/10 [&>section+section]:pt-8">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-medium text-white">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** عنوان فرعي لتجميع مفاتيح مرتبطة داخل قسم. */
export function SubHead({ children }: { children: ReactNode }) {
  return <div dir="auto" className="border-t border-white/10 pt-4 text-sm font-medium text-white/50 first:border-t-0 first:pt-0">{children}</div>;
}

/** شريط جانبي لقائمة الأقسام: قسم واحد نشط في كل مرة (تنقّل بالقائمة لا تمرير). */
export function SideNav({ items, current, onSelect }: { items: { id: string; label: string; icon: ReactNode }[]; current: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Settings sections" className="sticky top-12 flex w-48 shrink-0 flex-col gap-1 self-start py-2">
      {items.map((x) => (
        <button
          key={x.id}
          data-nav={x.id}
          onClick={() => onSelect(x.id)}
          aria-current={current === x.id ? "true" : undefined}
          className={`flex h-9 items-center gap-2 rounded-md px-3 text-start text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${current === x.id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
        >
          <span aria-hidden className="shrink-0">{x.icon}</span>
          <span dir="auto" className="min-w-0 truncate">{x.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  // صف المفتاح (Switch) = بطاقة بحدود على نمط صفحة Notifications؛ بقية الصفوف FormItem مسطّح.
  const card = isValidElement(children) && children.type === Toggle;
  return (
    <div className={`flex items-center justify-between gap-4 ${card ? "rounded-lg border border-white/10 p-4" : ""}`}>
      <div className="min-w-0 space-y-0.5">
        <div dir="auto" className="text-sm font-medium">{label}</div>
        {hint && <div dir="auto" className="text-[0.8rem] text-white/50">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/30 ${value ? "bg-white" : "bg-white/20"}`}
    >
      <span
        className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow-sm transition-all ${value ? "start-[22px] bg-black" : "start-0.5 bg-white"}`}
      />
    </button>
  );
}

/** منزلق: القيمة محلية أثناء السحب، وتُحفظ عند الإفلات فقط (pointerup/keyup/blur). */
export function Slider(p: {
  value: number; min: number; max: number; step: number;
  onCommit: (v: number) => void; format?: (v: number) => string; label: string;
  /** معاينة حيّة أثناء السحب (مخنوقة ~80ms)؛ onCommit يثبّت القيمة النهائية عند الإفلات. */
  onLive?: (v: number) => void;
}) {
  const [v, setV] = useState(p.value);
  const [drag, setDrag] = useState(false);
  useEffect(() => { if (!drag) setV(p.value); }, [p.value, drag]);
  const commit = () => { setDrag(false); if (v !== p.value) p.onCommit(v); };
  const lastLive = useRef(0);
  const live = (n: number) => {
    if (!p.onLive) return;
    const now = performance.now();
    if (now - lastLive.current >= 80) { lastLive.current = now; p.onLive(n); }
  };
  return (
    <div className="flex items-center gap-3" dir="ltr">
      <input
        type="range" aria-label={p.label}
        min={p.min} max={p.max} step={p.step} value={v}
        onChange={(e) => { const n = Number(e.target.value); setDrag(true); setV(n); live(n); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        style={{ "--pct": `${p.max > p.min ? ((v - p.min) / (p.max - p.min)) * 100 : 0}%` } as CSSProperties}
        className="sh-range w-48"
      />
      <span className="w-14 text-end text-sm tabular-nums text-white/50">{(p.format ?? String)(v)}</span>
    </div>
  );
}

export function Select<T extends string | number>(p: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="relative inline-block">
      <select
        aria-label={p.label}
        value={String(p.value)}
        onChange={(e) => {
          const o = p.options.find((x) => String(x.value) === e.target.value);
          if (o) p.onChange(o.value);
        }}
        className={`${inputCls} min-w-36 cursor-pointer appearance-none pe-9`}
      >
        {p.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 opacity-50" />
    </div>
  );
}

/** حقل رقم يحفظ عند الخروج/Enter مع تقييد المدى. */
export function NumberField(p: { value: number; min: number; max: number; onCommit: (v: number) => void; label: string }) {
  const [t, setT] = useState(String(p.value));
  useEffect(() => setT(String(p.value)), [p.value]);
  const commit = () => {
    const n = Math.min(p.max, Math.max(p.min, Math.round(Number(t))));
    if (Number.isFinite(n)) { setT(String(n)); if (n !== p.value) p.onCommit(n); } else setT(String(p.value));
  };
  return (
    <input
      type="number" aria-label={p.label} dir="ltr" min={p.min} max={p.max} value={t}
      onChange={(e) => setT(e.target.value)} onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`${inputCls} w-24`}
    />
  );
}

/** قائمة نصية سطر-لكل-عنصر؛ تُحفظ عند الخروج من الحقل. */
export function LinesField(p: { value: string[]; onCommit: (v: string[]) => void; label: string; placeholder?: string }) {
  const [t, setT] = useState(p.value.join("\n"));
  useEffect(() => setT(p.value.join("\n")), [p.value]);
  return (
    <textarea
      aria-label={p.label} dir="ltr" rows={4} value={t} placeholder={p.placeholder}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => {
        const next = t.split("\n").map((x) => x.trim()).filter(Boolean);
        if (next.join("\n") !== p.value.join("\n")) p.onCommit(next);
      }}
      className={`${inputCls} w-64`}
    />
  );
}

/** حقل نص يحفظ عند الخروج/Enter (مسارات واختصارات). */
export function TextField(p: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string }) {
  const [t, setT] = useState(p.value);
  useEffect(() => setT(p.value), [p.value]);
  const commit = () => { const n = t.trim(); if (n !== p.value) p.onCommit(n); };
  return (
    <input
      type="text" aria-label={p.label} dir="ltr" value={t} placeholder={p.placeholder}
      onChange={(e) => setT(e.target.value)} onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`${inputCls} w-64`}
    />
  );
}
