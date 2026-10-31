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

// ───────────────────────── الفوكس واللصق (الجلسة 1.2) ─────────────────────────
// الحبة WS_EX_NOACTIVATE دائمًا؛ take_focus/release_focus هما الاستثناء الوحيد (حقل البحث + لحظة اللصق).

/// آخر نافذة أمامية ليست لنا (HWND كـ isize؛ 0 = لا شيء). يحدّثها خيط التتبّع.
#[cfg(windows)]
static LAST_TARGET: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

#[cfg(windows)]
mod focus {
    use super::*;
    use std::sync::atomic::Ordering;
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND};
    use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows::Win32::System::Threading::{
        AttachThreadInput, GetCurrentProcess, GetCurrentProcessId, GetCurrentThreadId, OpenProcess, OpenProcessToken,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
        VK_CONTROL, VK_V,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowLongPtrW, GetWindowThreadProcessId, IsIconic, IsWindow,
        SetForegroundWindow, SetWindowLongPtrW, ShowWindow, GWL_EXSTYLE, SW_RESTORE, WS_EX_NOACTIVATE,
    };

    fn pid_of(h: HWND) -> u32 {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
        pid
    }

    fn class_of(h: HWND) -> String {
        let mut buf = [0u16; 128];
        let n = unsafe { GetClassNameW(h, &mut buf) } as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }

    /// نوافذ الشل (شريط المهام/سطح المكتب) ليست أهدافًا للصق.
    fn is_shell(h: HWND) -> bool {
        matches!(
            class_of(h).as_str(),
            "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Progman" | "WorkerW" | "NotifyIconOverflowWindow"
        )
    }

    /// يتتبّع آخر نافذة أمامية غير نافذة تطبيقنا (كل 100ms).
    pub fn start_tracker() {
        std::thread::spawn(|| {
            let me = unsafe { GetCurrentProcessId() };
            loop {
                unsafe {
                    let h = GetForegroundWindow();
                    if !h.0.is_null() && pid_of(h) != me && !is_shell(h) {
                        LAST_TARGET.store(h.0 as isize, Ordering::Relaxed);
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        });
    }

    fn target() -> Option<HWND> {
        let v = LAST_TARGET.load(Ordering::Relaxed);
        if v == 0 {
            return None;
        }
        let h = HWND(v as *mut _);
        unsafe { IsWindow(Some(h)).as_bool() }.then_some(h)
    }

    /// يجعل h نافذة المقدّمة (ربط مؤقت لخيط الإدخال لتجاوز قيد SetForegroundWindow).
    fn force_foreground(h: HWND) -> bool {
        unsafe {
            if IsIconic(h).as_bool() {
                let _ = ShowWindow(h, SW_RESTORE);
            }
            let fg = GetForegroundWindow();
            if fg == h {
                return true;
            }
            let me = GetCurrentThreadId();
            let fg_tid = if fg.0.is_null() { 0 } else { GetWindowThreadProcessId(fg, None) };
            let attached = fg_tid != 0 && fg_tid != me && AttachThreadInput(me, fg_tid, true).as_bool();
            let ok = SetForegroundWindow(h).as_bool();
            if attached {
                let _ = AttachThreadInput(me, fg_tid, false);
            }
            ok || GetForegroundWindow() == h
        }
    }

    fn set_noactivate(w: &WebviewWindow, on: bool) {
        if let Ok(h) = w.hwnd() {
            let hwnd = HWND(h.0);
            unsafe {
                let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                let bit = WS_EX_NOACTIVATE.0 as isize;
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, if on { ex | bit } else { ex & !bit });
            }
        }
    }

    /// يعطي الحبة فوكس الكيبورد (يُستعمل لحقل البحث فقط).
    pub fn take_focus(app: &AppHandle) {
        let Some(w) = app.get_webview_window(MAIN) else { return };
        set_noactivate(&w, false);
        if let Ok(h) = w.hwnd() {
            force_foreground(HWND(h.0));
        }
    }

    /// يعيد NOACTIVATE ويرجع الفوكس لآخر نافذة كانت أمامية إن كان عند الحبة.
    pub fn release_focus(app: &AppHandle) {
        let Some(w) = app.get_webview_window(MAIN) else { return };
        let ours = w.hwnd().map(|h| HWND(h.0)).ok();
        let had = ours.map_or(false, |h| unsafe { GetForegroundWindow() } == h);
        set_noactivate(&w, true);
        if had {
            if let Some(t) = target() {
                force_foreground(t);
            }
        }
    }

    fn elevated(process: HANDLE) -> bool {
        unsafe {
            let mut tok = HANDLE::default();
            if OpenProcessToken(process, TOKEN_QUERY, &mut tok).is_err() {
                return true; // لا نستطيع فحصه ⇒ نعامله كمرتفع (الأحوط)
            }
            let mut e = TOKEN_ELEVATION::default();
            let mut len = 0u32;
            let r = GetTokenInformation(
                tok,
                TokenElevation,
                Some(&mut e as *mut _ as *mut _),
                std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                &mut len,
            );
            let _ = CloseHandle(tok);
            r.is_err() || e.TokenIsElevated != 0
        }
    }

    /// هل نافذة الهدف تعمل بصلاحيات أعلى منا (UIPI يُسقط الإدخال بصمت)؟
    fn target_blocked(t: HWND) -> bool {
        unsafe {
            let Ok(p) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid_of(t)) else { return true };
            let hi = elevated(p);
            let _ = CloseHandle(p);
            hi && !elevated(GetCurrentProcess())
        }
    }

    fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    /// يلصق (Ctrl+V) في آخر نافذة تطبيق سابقة. false = لم يُلصق (يبقى المحتوى في الحافظة فقط).
    pub fn paste_into_previous(app: &AppHandle) -> bool {
        let Some(t) = target() else { return false };
        if target_blocked(t) {
            return false;
        }
        // 1) استعد نافذة التطبيق السابق للمقدّمة (الحبة لا تأخذ الفوكس هنا: take_focus مخصّص لحقل البحث).
        if !force_foreground(t) {
            return false;
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(400);
        while unsafe { GetForegroundWindow() } != t {
            if std::time::Instant::now() > deadline {
                set_noactivate_main(app);
                return false;
            }
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
        // 2) Ctrl+V
        let inputs = [key(VK_CONTROL, false), key(VK_V, false), key(VK_V, true), key(VK_CONTROL, true)];
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        // 3) الحبة تعود بلا فوكس
        set_noactivate_main(app);
        sent as usize == inputs.len()
    }

    fn set_noactivate_main(app: &AppHandle) {
        if let Some(w) = app.get_webview_window(MAIN) {
            set_noactivate(&w, true);
            let _ = w.set_always_on_top(true);
        }
    }

}

#[cfg(windows)]
pub use focus::{paste_into_previous, release_focus, start_tracker, take_focus};

#[cfg(not(windows))]
pub fn start_tracker() {}
#[cfg(not(windows))]
pub fn take_focus(_app: &AppHandle) {}
#[cfg(not(windows))]
pub fn release_focus(_app: &AppHandle) {}
#[cfg(not(windows))]
pub fn paste_into_previous(_app: &AppHandle) -> bool {
    false
}
