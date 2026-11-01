import { Component, type ReactNode } from "react";
import { i } from "../../i18n";

/**
 * حدّ أخطاء لمحتوى التبويب: فشل تحميل حزمة كسولة أو خطأ رسم داخل تبويب لا يهدم جذر الجزيرة كله (بدونه يُفرَّغ #root
 * ويبقى المستخدم أمام لوحة فارغة حتى يعيد الحارس تحميل الصفحة). يعرض رسالة قصيرة بنص الخطأ (للتشخيص) وزر إعادة المحاولة.
 * يُعاد تركيبه بتغيّر `key` (تبديل التبويب أو إعادة المحاولة) فيعود سليمًا.
 */
export class TabBoundary extends Component<{ children: ReactNode; onRetry: (error: Error) => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("[tab]", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" dir="auto" className="flex h-full flex-col items-center justify-center gap-2 text-center text-[13px] text-white/70">
        <div>{i("تعذّر تحميل هذا التبويب", "This tab failed to load")}</div>
        <div dir="ltr" className="max-w-[80%] truncate text-[11px] text-white/40">{String(this.state.error.message || this.state.error).slice(0, 120)}</div>
        <button onClick={() => this.props.onRetry(this.state.error as Error)} className="i-btn rounded-full bg-white/10 px-3 py-1 text-[12px] text-white">
          {i("إعادة المحاولة", "Retry")}
        </button>
      </div>
    );
  }
}
