import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { i } from "../../i18n";
import { useEco } from "../../motion";

interface Ram { total: number; main: number; webview: number; webviewCount: number; cpu: number; active: boolean; metric?: "private" | "mixed" | "working" }

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
        {ram.metric === "working"
          ? i("تعذّرت قراءة الذاكرة الخاصة على هذا النظام فيُعرض Working Set الكلي لعمليات التطبيق فقط؛ يتضمن صفحات مشتركة بين عمليات WebView2 مكرَّرة فيزيد عن الواقع وعن عمود «الذاكرة الخاصة» في مدير المهام.", "Private memory could not be read on this system, so the full Working Set of this app's own processes is shown; it counts pages shared between WebView2 processes repeatedly, so it overstates real usage and the Task Manager \"Memory\" column.")
          : i(`الذاكرة الخاصة (Private Working Set) لعمليات التطبيق فقط: لا تُحسب الصفحات المشتركة بين عمليات WebView2 مكرّرة، فهي أقرب لما يشغله التطبيق فعلًا من Working Set الكلي${ram.metric === "mixed" ? " (قُدِّر بعض العمليات بالكلي لتعذّر قراءة خاصتها)" : ""}. قد تختلف قليلًا عن مدير المهام، وتتغيّر مع كل قياس.`, `Private Working Set of this app's own processes only: pages shared between WebView2 processes are not counted repeatedly, so it is closer to what the app really uses than the full Working Set${ram.metric === "mixed" ? " (some processes fell back to the full Working Set because their private memory could not be read)" : ""}. It may differ slightly from Task Manager and varies per sample.`)}
      </div>
    </div>
  );
}
