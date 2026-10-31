import { useEffect, useState, type ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="mb-3 text-base font-bold text-[var(--app-accent)]">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
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
      className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-[#6f86ff]" : "bg-white/20"}`}
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
}) {
  const [v, setV] = useState(p.value);
  const [drag, setDrag] = useState(false);
  useEffect(() => { if (!drag) setV(p.value); }, [p.value, drag]);
  const commit = () => { setDrag(false); if (v !== p.value) p.onCommit(v); };
  return (
    <div className="flex items-center gap-3" dir="ltr">
      <input
        type="range" aria-label={p.label}
        min={p.min} max={p.max} step={p.step} value={v}
        onChange={(e) => { setDrag(true); setV(Number(e.target.value)); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        className="w-48 accent-[#6f86ff]"
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
