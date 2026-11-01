/**
 * منطق خالص لحالة المحدّث (بلا React ولا Tauri — يُختبر بـ scripts/updater.test.mjs).
 * مراحل النشاط الحي «update»: available ← downloading ← installing، أو error (مع إعادة محاولة).
 */
export type UpdatePhase = "idle" | "available" | "downloading" | "installing" | "error";

export interface UpdateState {
  phase: UpdatePhase;
  version: string;
  downloaded: number; // بايت
  total: number;      // بايت؛ 0 = غير معروف
}

export const UPDATE_IDLE: UpdateState = { phase: "idle", version: "", downloaded: 0, total: 0 };

/** أحداث التنزيل كما تبثّها إضافة tauri-plugin-updater. */
export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number | null } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export function applyDownloadEvent(s: UpdateState, ev: DownloadEvent): UpdateState {
  switch (ev.event) {
    case "Started": return { ...s, phase: "downloading", downloaded: 0, total: Math.max(0, Number(ev.data?.contentLength) || 0) };
    case "Progress": return { ...s, phase: "downloading", downloaded: s.downloaded + Math.max(0, Number(ev.data?.chunkLength) || 0) };
    case "Finished": return { ...s, phase: "installing" };
    default: return s;
  }
}

/** نسبة التحميل 0..100 (عدد صحيح)، أو null إن كان الحجم الكلي مجهولًا. */
export function updatePercent(s: UpdateState): number | null {
  if (s.total <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((s.downloaded / s.total) * 100)));
}

/** الفحص الصامت بعد الإقلاع: يتأخر بضع ثوانٍ كي لا ينافس الإقلاع. */
export const AUTO_CHECK_DELAY_MS = 8000;

/** حالة الزر اليدوي في الإعدادات. */
export type ManualStatus = "idle" | "checking" | "latest" | "available" | "failed";
