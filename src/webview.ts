// تشخيص WebView2 Runtime (سطر «حول»): النسخة الفعلية من API Tauri + حكم الشفافية.
// Runtime 145.x–146.x فيه تراجع موثّق: DefaultBackgroundColor ألفا 0 يُرسم أبيض/رماديًا (WebView2Feedback#5481) وأُصلح في 147 — فنحذّر المستخدم.
export interface WebviewRuntime { version: string; major: number; background_clear: boolean | null }

export type WebviewVerdict = "unknown" | "ok" | "buggy" | "opaque";

/** الحكم: opaque = الخلفية لم تصبح شفافة فعليًا بعد الفرض · buggy = نسخة 145–146 المعروفة · unknown = لم تُقرأ النسخة · ok غير ذلك. */
export function webviewVerdict(rt: Partial<WebviewRuntime> | null | undefined): WebviewVerdict {
  if (!rt || !rt.version) return "unknown";
  if (rt.background_clear === false) return "opaque";
  if (typeof rt.major === "number" && rt.major >= 145 && rt.major <= 146) return "buggy";
  return "ok";
}
