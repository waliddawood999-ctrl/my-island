import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronDown, Keyboard, X } from "lucide-react";
import { spring } from "../../motion";
import { i } from "../../i18n";
import { ACCENT_PRESETS } from "../../appearance";

/** عناصر الإعدادات (نظام التصميم الموحّد): كل الأنماط في settings.css من رموز tokens.css. عرض فقط؛ لا مفاتيح ولا سلوك هنا. */
export const inputCls = "st-input";
export const btnPrimary = "st-btn st-btn-primary";
export const btnOutline = "st-btn";

/** الاتجاه الفعلي (rtl بالعربية) لعناصر تعتمد الإزاحة المادية (مفتاح التبديل). */
export const DirCtx = createContext<"ltr" | "rtl">("ltr");
/** نص البحث الحي: الصفوف غير المطابقة تُخفى (hidden) والبطاقات/الأقسام الخالية تُخفى بـ:has في CSS. */
export const SearchCtx = createContext("");

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="st-sec">
      <h3 dir="auto" className="st-sec-title">{title}</h3>
      <div className="st-card">{children}</div>
    </section>
  );
}

/** فاصل فرعي داخل البطاقة (لتجميع صفوف مرتبطة). */
export function SubHead({ children }: { children: ReactNode }) {
  return <div role="presentation" dir="auto" className="st-note" style={{ fontWeight: 700, paddingBlock: 8, borderTop: "1px solid var(--c-border)" }}>{children}</div>;
}

export function Row({ label, hint, icon, children, col }: { label: string; hint?: string; icon?: ReactNode; children?: ReactNode; col?: boolean }) {
  const q = useContext(SearchCtx).trim().toLowerCase();
  const hit = !q || `${label} ${hint ?? ""}`.toLowerCase().includes(q);
  return (
    <div className={`st-row${col ? " st-col" : ""}`} hidden={!hit}>
      {icon && <span aria-hidden className="st-row-tile">{icon}</span>}
      <div className="st-row-text">
        <div dir="auto" className="st-row-title">{label}</div>
        {hint && <div dir="auto" className="st-row-hint">{hint}</div>}
      </div>
      {children && <div className="st-row-ctl">{children}</div>}
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const dir = useContext(DirCtx);
  const x = (dir === "rtl" ? -1 : 1) * 18;
  return (
    <button role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)} className="st-switch">
      <motion.span className="st-thumb" initial={false} animate={{ x: value ? x : 0 }} transition={spring.press} />
    </button>
  );
}

/** تحكّم مقطعي (segmented) بمؤشر نابض يتحرك بين الخيارات (transform فقط عبر layoutId). */
export function Segmented<T extends string>(p: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={p.label} className="st-seg">
      {p.options.map((o) => (
        <button key={o.value} role="radio" aria-checked={p.value === o.value} onClick={() => p.onChange(o.value)}>
          {p.value === o.value && <motion.span layoutId={`seg-${id}`} className="st-seg-ind" transition={spring.press} />}
          <span style={{ position: "relative" }}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** منزلق: القيمة حيّة أثناء السحب (تُعرض بجانبه)، وتُحفظ عند الإفلات أو حيًّا عبر onLive. */
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
        className="st-range"
      />
      <span className="st-val">{(p.format ?? String)(v)}</span>
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
        className="st-input"
      >
        {p.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 opacity-50" />
    </div>
  );
}

/** منتقي اللون: ألوان جاهزة + مخصّص. */
export function ColorField({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const cur = value.toLowerCase();
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-2">
      {ACCENT_PRESETS.map((a) => (
        <button key={a.id} role="radio" aria-checked={cur === a.hex} aria-label={i(a.ar, a.en)} title={i(a.ar, a.en)} className="st-swatch" style={{ "--sw": a.hex } as CSSProperties} onClick={() => onChange(a.hex)} />
      ))}
      <input type="color" aria-label={i("لون مخصّص", "Custom color")} className="st-color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#4fd1c5"} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const MODS = ["Control", "Alt", "Shift", "Meta"];
/** يحوّل keydown إلى نص اختصار (Ctrl+Alt+A). مفتاح مفرد من الموديفاير ⇒ null (ينتظر مفتاحًا فعليًا). */
export function comboFromEvent(e: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; code?: string }): string | null {
  if (MODS.includes(e.key)) return null;
  const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key.replace(/^Arrow/, "");
  return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super", k].filter(Boolean).join("+");
}

/** مسجّل اختصارات: انقر ثم اضغط التركيبة. Esc يلغي، Backspace يمسح (= معطّل). */
export function ShortcutField({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [rec, setRec] = useState(false);
  const parts = value ? value.split("+") : [];
  return (
    <div className="flex items-center gap-2">
      <button
        aria-label={label} data-rec={rec} dir="ltr" className="st-kbd"
        onClick={() => setRec(true)} onBlur={() => setRec(false)}
        onKeyDown={(e) => {
          if (!rec) return;
          e.preventDefault();
          if (e.key === "Escape") { setRec(false); return; }
          if (e.key === "Backspace" || e.key === "Delete") { onCommit(""); setRec(false); return; }
          const c = e.key === "PrintScreen" ? "PrintScreen" : comboFromEvent(e);
          if (c) { onCommit(c); setRec(false); }
        }}
      >
        {rec ? <span>{i("اضغط الاختصار…", "Press shortcut…")}</span>
          : parts.length ? parts.map((p) => <kbd key={p}>{p}</kbd>)
          : <span style={{ opacity: .5, display: "inline-flex", gap: 6, alignItems: "center" }}><Keyboard size={14} />{i("معطّل", "Off")}</span>}
      </button>
      {value && <button aria-label={`${label} — ${i("مسح", "Clear")}`} className="st-btn" style={{ width: 36, paddingInline: 0 }} onClick={() => onCommit("")}><X size={14} /></button>}
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

/** حقل نص يحفظ عند الخروج/Enter (مسارات). */
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

/** ترتيب عناصر بأزرار أعلى/أسفل (ترتيب بطاقات اللمحة): يعيد مصفوفة جديدة عند التحريك. */
export function OrderField({ value, labels, onChange, label }: { value: string[]; labels: Record<string, string>; onChange: (v: string[]) => void; label: string }) {
  const move = (n: number, d: number) => {
    const m = n + d; if (m < 0 || m >= value.length) return;
    const next = [...value]; [next[n], next[m]] = [next[m], next[n]]; onChange(next);
  };
  return (
    <ol aria-label={label} data-testid="order-field" className="flex w-60 flex-col gap-1">
      {value.map((k, n) => (
        <li key={k} data-key={k} className="flex items-center gap-2" style={{ background: "var(--c-surface)", borderRadius: "var(--radius-control)", boxShadow: "inset 0 0 0 1px var(--c-border)", padding: "4px 6px 4px 12px" }}>
          <span className="st-val" style={{ minWidth: 14, textAlign: "start", opacity: 0.5 }}>{n + 1}</span>
          <span dir="auto" className="flex-1 truncate" style={{ fontSize: 13 }}>{labels[k] ?? k}</span>
          <button className="st-btn" style={{ width: 28, height: 28, paddingInline: 0 }} disabled={n === 0} aria-label={`${labels[k] ?? k} — ${i("أعلى", "Move up")}`} onClick={() => move(n, -1)}><ArrowUp size={13} /></button>
          <button className="st-btn" style={{ width: 28, height: 28, paddingInline: 0 }} disabled={n === value.length - 1} aria-label={`${labels[k] ?? k} — ${i("أسفل", "Move down")}`} onClick={() => move(n, 1)}><ArrowDown size={13} /></button>
        </li>
      ))}
    </ol>
  );
}
