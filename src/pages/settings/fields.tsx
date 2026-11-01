import { useEffect, useRef, useState, type ReactNode } from "react";

/** مجموعة رئيسية في الإعدادات (عام · المظهر والميديا · الوحدات · الأداء): عنوان واحد متّسق ثم أقسامها بتباعد ثابت. */
export function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={`grp-${id}`} data-group={id} className="scroll-mt-14 pt-6">
      <h2 className="mb-3 text-[15px] font-bold text-white">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-white/70">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** عنوان فرعي لتجميع مفاتيح مرتبطة داخل قسم. */
export function SubHead({ children }: { children: ReactNode }) {
  return <div dir="auto" className="border-t border-white/10 pt-3 text-[11px] font-semibold text-white/40 first:border-t-0 first:pt-0">{children}</div>;
}

/** شريط تنقّل ثابت بين المجموعات: تمرير ناعم، والمجموعة الظاهرة تُميَّز (IntersectionObserver — بلا مؤقّتات). */
export function Nav({ items }: { items: { id: string; label: string }[] }) {
  const [cur, setCur] = useState(items[0]?.id ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const id = vis?.target.getAttribute("data-group");
      if (id) setCur(id);
    }, { rootMargin: "-104px 0px -65% 0px" });
    items.forEach((x) => { const el = document.getElementById(`grp-${x.id}`); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [items.map((x) => x.id).join("|")]);
  const go = (id: string) => {
    setCur(id);
    document.getElementById(`grp-${id}`)?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  return (
    <nav aria-label="Settings sections" className="sticky top-12 z-10 -mx-5 flex gap-1 border-b border-white/10 bg-[var(--app-bg)] px-5 py-2">
      {items.map((x) => (
        <button
          key={x.id}
          onClick={() => go(x.id)}
          aria-current={cur === x.id ? "true" : undefined}
          className={`rounded-full px-3 py-1 text-[13px] ${cur === x.id ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
        >
          {x.label}
        </button>
      ))}
    </nav>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div dir="auto" className="text-sm">{label}</div>
        {hint && <div dir="auto" className="text-xs text-white/50">{hint}</div>}
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
      className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-[var(--app-accent)]" : "bg-white/20"}`}
    >
      <span
        dir="ltr"
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? "left-[22px]" : "left-0.5"}`}
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
        className="w-48 accent-[var(--app-accent)]"
      />
      <span className="w-14 text-end text-xs tabular-nums text-white/70">{(p.format ?? String)(v)}</span>
    </div>
  );
}

export function Select<T extends string | number>(p: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <select
      aria-label={p.label}
      value={String(p.value)}
      onChange={(e) => {
        const o = p.options.find((x) => String(x.value) === e.target.value);
        if (o) p.onChange(o.value);
      }}
      className="rounded-md border border-white/15 bg-[var(--app-field)] px-2 py-1 text-sm"
    >
      {p.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
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
      className="w-24 rounded-md border border-white/15 bg-[var(--app-field)] px-2 py-1 text-sm"
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
      className="w-64 rounded-md border border-white/15 bg-[var(--app-field)] px-2 py-1 text-sm"
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
      className="w-64 rounded-md border border-white/15 bg-[var(--app-field)] px-2 py-1 text-sm"
    />
  );
}
