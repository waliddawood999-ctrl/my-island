// وحدة win: موضع/إخفاء النافذة الرئيسية + WS_EX_NOACTIVATE (لا تسرق الفوكس أبدًا).
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

pub const MAIN: &str = "main";
/// مدة التلاشي الناعم قبل الإخفاء الفعلي (ms) — تطابق transition في الواجهة.
const FADE_MS: u64 = 220;

/// يضيف WS_EX_NOACTIVATE (+ TOOLWINDOW كي لا تظهر في Alt-Tab) للنافذة.
#[cfg(windows)]
pub fn apply_noactivate(w: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };
    if let Ok(h) = w.hwnd() {
        let hwnd = HWND(h.0);
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(
                hwnd,
                GWL_EXSTYLE,
                ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize,
            );
        }
    }
}
#[cfg(not(windows))]
pub fn apply_noactivate(_w: &WebviewWindow) {}

/// إظهار بلا تنشيط (SW_SHOWNOACTIVATE) كي لا يُسرق الفوكس لحظة الظهور.
#[cfg(windows)]
fn show_noactivate(w: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
    if let Ok(h) = w.hwnd() {
        unsafe {
            let _ = ShowWindow(HWND(h.0), SW_SHOWNOACTIVATE);
        }
    }
}
#[cfg(not(windows))]
fn show_noactivate(w: &WebviewWindow) {
    let _ = w.show();
}

/// يضع النافذة أعلى منتصف الشاشة المختارة، محترمًا monitor وoffsetX وunderTaskbar.
pub fn position_main(app: &AppHandle) {
    let Some(w) = app.get_webview_window(MAIN) else { return };
    let st = app.state::<AppState>();
    let p = *st.placement.lock().unwrap();
    let monitors = w.available_monitors().unwrap_or_default();
    let Some(mon) = monitors
        .get(p.monitor)
        .cloned()
        .or_else(|| w.primary_monitor().ok().flatten())
    else {
        return;
    };
    // underTaskbar=true: من حافة الشاشة الفعلية؛ false: من أعلى منطقة العمل (تحترم شريط المهام العلوي).
    let area = if p.under_taskbar { (*mon.position(), *mon.size()) } else {
        let wa = mon.work_area();
        (wa.position, wa.size)
    };
    let win_w = w.outer_size().map(|s| s.width as i32).unwrap_or(0);
    let x = area.0.x + (area.1.width as i32 - win_w) / 2 + p.offset_x;
    let y = area.0.y;
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

/// الواجهة تبلّغ بحجم الحبة (CSS px) → النافذة تلتفّ حولها تمامًا ثم تُعاد للمنتصف.
pub fn resize_to_island(app: &AppHandle, width: f64, height: f64) {
    let Some(w) = app.get_webview_window(MAIN) else { return };
    let scale = w.scale_factor().unwrap_or(1.0);
    let _ = w.set_size(PhysicalSize::new(
        (width * scale).ceil() as u32,
        (height * scale).ceil() as u32,
    ));
    position_main(app);
}

/// إخفاء/إظهار ناعم: الحدث island:hidden يشغّل التلاشي في الواجهة ثم يُخفى الـ HWND.
pub fn set_hidden(app: &AppHandle, hidden: bool) {
    let Some(w) = app.get_webview_window(MAIN) else { return };
    {
        let st = app.state::<AppState>();
        let mut cur = st.hidden.lock().unwrap();
        if *cur == hidden {
            return;
        }
        *cur = hidden;
    }
    if hidden {
        let _ = app.emit_to(MAIN, "island:hidden", true);
        let app2 = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(FADE_MS));
            let still_hidden = *app2.state::<AppState>().hidden.lock().unwrap();
            if still_hidden {
                if let Some(w) = app2.get_webview_window(MAIN) {
                    let _ = w.hide();
                }
            }
        });
    } else {
        show_noactivate(&w);
        position_main(app);
        let _ = app.emit_to(MAIN, "island:hidden", false);
    }
}

pub fn toggle_hidden(app: &AppHandle) {
    let cur = *app.state::<AppState>().hidden.lock().unwrap();
    set_hidden(app, !cur);
}
