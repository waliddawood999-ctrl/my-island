/** تطبيع نص الإدخال: أرقام عربية/فارسية ⇒ لاتينية، رموز العمليات الشائعة، فواصل عشرية عربية. */
export function normDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, "")
    .replace(/[×✕]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-");
}

/** تطبيع للمطابقة (يطابق files.rs::norm): حروف صغيرة، بلا تشكيل، توحيد الألف والياء والتاء المربوطة. */
export function normText(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

/** يعرض رقمًا بدقة معقولة بلا ضجيج الفاصلة العائمة. */
export function fmtNum(n: number, maxFrac = 10): string {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-9) return n.toExponential(6).replace(/\.?0+e/, "e");
  const r = Number(n.toPrecision(12));
  return r.toLocaleString("en-US", { maximumFractionDigits: maxFrac, useGrouping: a >= 10000 });
}
