import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { i } from "../../i18n";
import { useEco } from "../../motion";

interface Ram { total: number; main: number; webview: number; webviewCount: number; cpu: number; active: boolean }

const mb = (b: number) => `${(b / 1048576).toFixed(b >= 104857600 ? 0 : 1)} MB`;

/** مؤشر حالة وضع التوفير (من الخلفية: يدوي أو بسبب البطارية). */
export function EcoIndicator() {
  const e = useEco();
  const text = !e.eco
    ? i("وضع التوفير غير مفعّل", "Eco mode is off")
    : e.reason === "battery"
      ? i("وضع التوفير مفعّل (على البطارية)", "Eco mode is on (on battery)")
      : i("وضع التوفير مفعّل", "Eco mode is on");
  return (
    <span role="status" data-eco={e.eco ? "on" : "off"} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${e.eco ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"}`}>
      <span className={`h-2 w-2 rounded-full ${e.eco ? "bg-emerald-400" : "bg-white/40"}`} />
      {text}
    </span>
  );
}

/** استهلاك رام التطبيق الآن: يُحدَّث كل 2s **فقط** ما دامت نافذة الإعدادات ظاهرة؛ إخفاؤها/إغلاقها يوقف المؤقّت فورًا (صفر كلفة). */
export function RamUsage() {
  const [ram, setRam] = useState<Ram | null>(null);
  useEffect(() => {
    let timer = 0;
    let alive = true;
    let busy = false;
    const poll = () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      invoke<Ram>("perf_ram").then((r) => { if (alive && r) setRam(r); }).catch(() => {}).finally(() => { busy = false; });
    };
    const start = () => { if (!timer) { poll(); timer = window.setInterval(poll, 2000); } };
    const stop = () => { if (timer) { window.clearInterval(timer); timer = 0; } };
    const vis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", vis);
    vis();
    return () => { alive = false; stop(); document.removeEventListener("visibilitychange", vis); };
  }, []);

  if (!ram) return <div className="text-xs text-white/50">{i("جارٍ القياس…", "Measuring…")}</div>;
  return (
    <div dir="auto" className="flex flex-col gap-1 text-sm" data-testid="ram">
      <div className="flex items-baseline justify-between gap-4">
        <span>{i("إجمالي استهلاك التطبيق", "App total")}</span>
        <span dir="ltr" className="text-base font-semibold tabular-nums">{mb(ram.total)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 text-white/70">
        <span>{i("العملية الرئيسية", "Main process")}</span>
        <span dir="ltr" className="tabular-nums">{mb(ram.main)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 text-white/70">
        <span>{i(`نوافذ الويب (WebView2 × ${ram.webviewCount})`, `Web windows (WebView2 × ${ram.webviewCount})`)}</span>
        <span dir="ltr" className="tabular-nums">{mb(ram.webview)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 text-white/70">
        <span>{i("الحالة", "State")}</span>
        <span className={ram.active ? "text-amber-300" : "text-emerald-300"}>
          {ram.active ? i("نشط", "Active") : i("خامل", "Idle")} <span dir="ltr" className="text-white/50 tabular-nums">({ram.cpu.toFixed(1)}% CPU)</span>
        </span>
      </div>
      <div className="mt-1 text-xs text-white/40">
        {i("الذاكرة الفعلية (Working Set) لعمليات التطبيق فقط؛ قد تتضمن صفحات مشتركة بين عمليات WebView2 فيختلف المجموع قليلًا عن مدير المهام.", "Working-set memory of this app's own processes only; shared pages across WebView2 processes may make the total differ slightly from Task Manager.")}
      </div>
    </div>
  );
}
