// mascot — عيون التميمة: موضع المؤشر الحقيقي للواجهة (mascot:look) بكلفة خاملة صفرية.
// الخيط «مركون» (park) ما لم تفعّله الواجهة بـ mascot_active(true)، فلا يعمل شيء حين تُخفى العيون
// (Hidden: ملء شاشة/توفير/حركة متوقفة/حبة مخفية/إعداد مطفأ) أو حين لا تكون الساعة هي المعروضة.
// أثناء التفعيل: قريب (≤240px) ⇒ 50ms ويُبثّ الحدث عند التغيّر فقط؛ بعيد (نوم) ⇒ استطلاع هادئ 400ms
// بلا أي بثّ (قراءة GetCursorPos واحدة) حتى يقترب المؤشر. لا JS ولا IPC أثناء النوم.
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};

// PURE-BEGIN
/// المؤشر «قريب» (العيون مستيقظة) ضمن هذه المسافة من مركز الحبة (CSS px).
pub const NEAR_PX: f64 = 240.0;
/// هستيريسيس: بعد القرب لا يعود «بعيدًا» إلا بعد تجاوز هذه المسافة (يمنع الرجفان عند الحدّ).
pub const FAR_PX: f64 = 272.0;
/// ارتفاع الحبة المنكمشة (CSS px): مركزها الرأسي = نصفه من أعلى النافذة.
const PILL_H: f64 = 32.0;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Look {
    /// موضع المؤشر على الشاشة بالبكسل الفيزيائي (GetCursorPos؛ العملية Per-Monitor-DPI فلا تحويل صامت من ويندوز).
    pub cx: i32,
    pub cy: i32,
    /// أصل منطقة محتوى نافذة main (الداخلية لا الخارجية) على الشاشة بالفيزيائي — مرجع كل الإحداثيات.
    pub wx: i32,
    pub wy: i32,
    /// معامل DPI للشاشة التي تقع عليها النافذة (فيزيائي ÷ منطقي). التحويل إلى CSS px يتم مرة واحدة في eyes.ts::toPage.
    pub s: f64,
    /// المؤشر فوق الحبة نفسها (مستطيل النافذة).
    pub over: bool,
    /// ضمن نطاق الاستيقاظ (مع هستيريسيس).
    pub near: bool,
}

/// cur: موضع المؤشر على الشاشة (فيزيائي) · win: (x,y,w,h) فيزيائي لمنطقة محتوى النافذة · scale: معامل DPI.
/// over/near تُحسبان هنا بالإحداثيات المنطقية نفسها التي تستعملها الواجهة (cur − win) ÷ scale بلا تقريب.
pub fn look(cur: (i32, i32), win: (i32, i32, u32, u32), scale: f64, was_near: bool) -> Look {
    let s = if scale > 0.0 { scale } else { 1.0 };
    let (wx, wy, ww, wh) = win;
    let x = (cur.0 - wx) as f64 / s;
    let y = (cur.1 - wy) as f64 / s;
    let w = ww as f64 / s;
    let h = wh as f64 / s;
    let over = x >= 0.0 && y >= 0.0 && x < w && y < h;
    let (dx, dy) = (x - w / 2.0, y - PILL_H / 2.0);
    let dist = (dx * dx + dy * dy).sqrt();
    let near = if was_near { dist <= FAR_PX } else { dist <= NEAR_PX };
    Look { cx: cur.0, cy: cur.1, wx, wy, s, over, near }
}

/// فاصل الاستطلاع (ms): قريب ⇒ سلس · بعيد ⇒ استطلاع إيقاظ هادئ.
pub fn interval_ms(near: bool) -> u64 {
    if near { 50 } else { 400 }
}

/// هل يُبثّ هذا الاستطلاع؟ دائمًا عند القرب وعند أول عيّنة/عند تغيّر الحالة؛ لا بثّ بين عيّنتين بعيدتين.
pub fn should_emit(prev: Option<&Look>, now: &Look) -> bool {
    match prev {
        None => true,
        Some(p) => p != now && (now.near || p.near),
    }
}
// PURE-END

static ACTIVE: AtomicBool = AtomicBool::new(false);
static THREAD: OnceLock<std::thread::Thread> = OnceLock::new();

#[cfg(windows)]
fn cursor_pos() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p) }.ok().map(|_| (p.x, p.y))
}
#[cfg(not(windows))]
fn cursor_pos() -> Option<(i32, i32)> {
    None
}

fn sample(app: &AppHandle, was_near: bool) -> Option<Look> {
    if *app.state::<crate::state::AppState>().hidden.lock().unwrap() {
        return None;
    }
    let w = app.get_webview_window(crate::win::MAIN)?;
    // الداخلية (منطقة المحتوى) لا الخارجية: إحداثيات الصفحة تبدأ من محتوى النافذة، وأي إطار/ظلّ خارجي كان يزيح التتبّع.
    let (p, s) = (w.inner_position().ok()?, w.inner_size().ok()?);
    Some(look(cursor_pos()?, (p.x, p.y, s.width, s.height), w.scale_factor().unwrap_or(1.0), was_near))
}

/// يُنشئ الخيط المركون (لا يعمل شيء قبل mascot_active(true)).
pub fn start(app: &AppHandle) {
    let app = app.clone();
    let h = std::thread::spawn(move || {
        let mut last: Option<Look> = None;
        loop {
            if !ACTIVE.load(Ordering::Relaxed) {
                last = None; // التفعيل التالي يبدأ بعيّنة مبثوثة
                std::thread::park();
                continue;
            }
            let near = last.as_ref().map_or(false, |l| l.near);
            if let Some(now) = sample(&app, near) {
                if should_emit(last.as_ref(), &now) {
                    let _ = app.emit_to(crate::win::MAIN, "mascot:look", &now);
                }
                last = Some(now);
            }
            std::thread::sleep(std::time::Duration::from_millis(interval_ms(
                last.as_ref().map_or(false, |l| l.near),
            )));
        }
    });
    let _ = THREAD.set(h.thread().clone());
}

/// الواجهة تفعّل/توقف التتبّع. إيقاف ⇒ يُركن الخيط عند أقرب دورة (صفر استهلاك).
#[tauri::command]
pub fn mascot_active(active: bool) {
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

    // نافذة 200×32 عند (860,0) بمقياس 1.
    const W: (i32, i32, u32, u32) = (860, 0, 200, 32);

    /// ما تفعله الواجهة (eyes.ts::toPage) — لمطابقة الخلفية: (cur − win) ÷ s.
    fn page(l: &Look) -> (f64, f64) {
        ((l.cx - l.wx) as f64 / l.s, (l.cy - l.wy) as f64 / l.s)
    }

    #[test]
    fn over_and_raw_physical_payload() {
        let l = look((960, 16), W, 1.0, false);
        assert!(l.over && l.near);
        assert_eq!((l.cx, l.cy, l.wx, l.wy), (960, 16, 860, 0));
        assert_eq!(page(&l), (100.0, 16.0));
        assert!(!look((960, 200), W, 1.0, false).over);
    }

    #[test]
    fn dpi_scale_to_css_per_monitor() {
        // مقياس 2: نافذة 400×64 فيزيائيًا؛ المؤشر عند منتصفها = (100,16) CSS.
        let l = look((860 + 200, 32), (860, 0, 400, 64), 2.0, false);
        assert_eq!(page(&l), (100.0, 16.0));
        assert!(l.over);
        // مقياس 1.25 (شاشة ثانوية): بلا تقريب — 1.25 فيزيائي = 1 CSS بالضبط.
        let l = look((1000 + 125, 40), (1000, 0, 250, 40), 1.25, false);
        assert_eq!(page(&l), (100.0, 32.0));
        // نافذة على شاشة بإحداثيات سالبة (يسار الرئيسية).
        let l = look((-1500 + 150, 30), (-1500, 0, 300, 60), 1.5, false);
        assert_eq!(page(&l), (100.0, 20.0));
    }

    #[test]
    fn near_threshold_and_hysteresis() {
        let at = |dx: i32, was: bool| look((960 + dx, 16), W, 1.0, was);
        assert!(at(240, false).near);
        assert!(!at(250, false).near, "من بعيد: لا استيقاظ فوق 240");
        assert!(at(250, true).near, "كان قريبًا: يبقى حتى FAR_PX");
        assert!(!at(280, true).near);
    }

    #[test]
    fn far_polls_slow_and_emits_only_on_transition() {
        assert!(interval_ms(false) > interval_ms(true) * 4);
        let far = look((3000, 900), W, 1.0, false);
        let far2 = look((3100, 950), W, 1.0, false);
        let near = look((960, 16), W, 1.0, false);
        assert!(should_emit(None, &far), "أول عيّنة تُبثّ دائمًا");
        assert!(!should_emit(Some(&far), &far2), "نوم: لا بثّ بين عيّنتين بعيدتين");
        assert!(should_emit(Some(&far), &near), "الاقتراب يوقظ");
        assert!(should_emit(Some(&near), &far), "الابتعاد يُبثّ مرة لتنام العيون");
        assert!(!should_emit(Some(&near), &near), "لا تكرار لنفس العيّنة");
    }
}
