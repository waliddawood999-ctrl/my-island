// netspeed — سرعتا الشبكة الحاليتان (تحميل/رفع) لحالة الكبسولة المدمجة (مفتاح `showNetSpeed`، افتراضيًا مطفأ).
// الخيط «مركون» (park) ما لم تفعّله الواجهة بـ netspeed_active(true): إطفاء المفتاح ⇒ لا قراءة ولا بثّ (صفر كلفة خمول).
// القراءة من عدّادات ويندوز عبر sysinfo (جدول الواجهات GetIfTable2) — لا شبكة خارجية ولا تعداد عمليات.
// ملاحظة نطاق: لا توجد «وحدة نظام» قائمة في main (L3 غير مدموجة)، فالقراءة هنا في وحدة مستقلة صغيرة بمسؤولية واحدة.
// أثناء Eco تتباطأ الدورة إلى 3s. يُبثّ `net:speed` عند تغيّر القيمة المنسّقة فقط.
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

// PURE-BEGIN
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Speed {
    /// بايت/ث.
    pub down: u64,
    pub up: u64,
}

/// معدّل بايت/ث من فرق العدّاد خلال elapsed_ms (صفر إن انعدمت المدة).
pub fn rate(delta_bytes: u64, elapsed_ms: u64) -> u64 {
    if elapsed_ms == 0 { return 0; }
    (delta_bytes as u128 * 1000 / elapsed_ms as u128) as u64
}

/// تقريب لخطوة 1KB/ث كي لا يُبثّ كل تذبذب صغير (يقلّل أحداث IPC).
pub fn quantize(bps: u64) -> u64 {
    if bps < 1024 { 0 } else { bps / 1024 * 1024 }
}

/// يُبثّ فقط عند تغيّر القيمة المنسّقة (أو أول عيّنة).
pub fn should_emit(prev: Option<&Speed>, now: &Speed) -> bool {
    prev != Some(now)
}

/// واجهات لا تُحتسب (loopback/افتراضية) كي لا يتضاعف العدّ.
pub fn counts(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    !(n.contains("loopback") || n.contains("pseudo"))
}

/// دورة الاستطلاع (ms): عادية 1s، Eco 3s.
pub fn interval_ms(eco: bool) -> u64 { if eco { 3000 } else { 1000 } }
// PURE-END

static ACTIVE: AtomicBool = AtomicBool::new(false);
static THREAD: OnceLock<std::thread::Thread> = OnceLock::new();

pub fn start(app: &AppHandle) {
    let app = app.clone();
    let h = std::thread::Builder::new().name("netspeed".into()).spawn(move || {
        use std::time::Instant;
        loop {
            if !ACTIVE.load(Ordering::Relaxed) {
                std::thread::park();
                continue;
            }
            // جلسة قياس جديدة عند كل تفعيل: قائمة واجهات + عدّادات أولية.
            let mut nets = sysinfo::Networks::new_with_refreshed_list();
            let mut last_t = Instant::now();
            let mut prev: Option<Speed> = None;
            while ACTIVE.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(interval_ms(crate::perf::eco())));
                if !ACTIVE.load(Ordering::Relaxed) { break; }
                nets.refresh(true);
                let ms = last_t.elapsed().as_millis() as u64;
                last_t = Instant::now();
                let (mut rx, mut tx) = (0u64, 0u64);
                for (name, d) in nets.iter() {
                    if counts(name) { rx += d.received(); tx += d.transmitted(); }
                }
                let now = Speed { down: quantize(rate(rx, ms)), up: quantize(rate(tx, ms)) };
                if should_emit(prev.as_ref(), &now) {
                    let _ = app.emit("net:speed", &now);
                    prev = Some(now);
                }
            }
        }
    });
    if let Ok(h) = h {
        let _ = THREAD.set(h.thread().clone());
    }
}

/// الواجهة تفعّل/توقف القياس. إيقاف ⇒ يُركن الخيط عند أقرب دورة (صفر استهلاك).
#[tauri::command]
pub fn netspeed_active(active: bool) {
    ACTIVE.store(active, Ordering::Relaxed);
    if active {
        if let Some(t) = THREAD.get() {
            t.unpark();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_per_second() {
        assert_eq!(rate(2048, 1000), 2048);
        assert_eq!(rate(1000, 500), 2000);
        assert_eq!(rate(5, 0), 0, "مدة صفرية لا تقسم على صفر");
    }

    #[test]
    fn quantize_steps() {
        assert_eq!(quantize(900), 0);
        assert_eq!(quantize(1024), 1024);
        assert_eq!(quantize(1500), 1024);
        assert_eq!(quantize(1_048_576 + 700), 1_048_576);
    }

    #[test]
    fn emits_only_on_change() {
        let a = Speed { down: 1024, up: 0 };
        assert!(should_emit(None, &a));
        assert!(!should_emit(Some(&a), &a.clone()));
        assert!(should_emit(Some(&a), &Speed { down: 2048, up: 0 }));
    }

    #[test]
    fn loopback_ignored_and_eco_slower() {
        assert!(counts("Ethernet"));
        assert!(!counts("Loopback Pseudo-Interface 1"));
        assert!(interval_ms(true) > interval_ms(false));
    }
}
