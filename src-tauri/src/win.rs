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

/// يضع النافذة أعلى منتصف الشاشة المختارة، محترمًا monitor وoffsetX/offsetY وpillPosition وunderTaskbar.
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
    let scale = w.scale_factor().unwrap_or(1.0);
    // pillPosition: يسار/يمين بهامش 16px عن الحافة؛ المنتصف كما كان. offsetX يُضاف في كل الحالات.
    let margin = (16.0 * scale) as i32;
    let base = match p.align {
        -1 => area.0.x + margin,
        1 => area.0.x + area.1.width as i32 - win_w - margin,
        _ => area.0.x + (area.1.width as i32 - win_w) / 2,
    };
    let x = base + p.offset_x;
    let y = area.0.y + (p.offset_y as f64 * scale).round() as i32;
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

/// الواجهة تبلّغ بحجم الحبة (CSS px) → النافذة تلتفّ حولها تمامًا ثم تُعاد للمنتصف.
pub fn resize_to_island(app: &AppHandle, width: f64, height: f64) {
    let Some(w) = app.get_webview_window(MAIN) else { return };
    // الخلفية الزجاجية الحقيقية منطقة بحجم النافذة الحالي: تُسقَط قبل تغيير الحجم وتعيد الواجهة طلبها بعد استقرار الحركة.
    crate::backdrop::drop_for_resize(app);
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


// ───────────────────── وضع تبويب المتصفح (browserTabMode) ─────────────────────
// وضع إرساء بصري: حين يكون المتصفح المعروف هو النافذة الأمامية وهو مكبَّر وتشمل حدوده مركز الحبة، تُبلَّغ الواجهة (island:dock)
// فتتخذ الحبة هيئة تبويب في شريط التبويبات. ليس تبويبًا حقيقيًا (لا واجهة تسمح لبرنامج خارجي بدخول شريط تبويبات المتصفح).
// الكشف يعيد استعمال خيط fullscreen-watch القائم (لا خيط جديد) وبشرط المفتاح مفعّلًا وخارج Eco فقط.
// PURE-BEGIN
use serde::Serialize;

/// ثوابت الشريط لكل متصفح (CSS px عند DPI 100%، والمتصفح والحبة على الشاشة نفسها فتتساوى النسبة): ارتفاع شريط التبويبات
/// المكبَّر وحيّز الأعلى فوق التبويب. قيَم تقديرية من قياس واجهات المتصفحات؛ تُعاير على ويندوز (قائمة القبول في docs/STATUS.md).
pub const BROWSERS: [(&str, &str, u32, u32); 5] = [
    // (اسم exe, المعرّف, ارتفاع الشريط, حيّز الأعلى)
    ("chrome.exe", "chrome", 41, 6),
    ("msedge.exe", "edge", 41, 6),
    ("brave.exe", "brave", 41, 6),
    ("firefox.exe", "firefox", 40, 5),
    ("vivaldi.exe", "vivaldi", 40, 5),
];

/// حمولة الحدث island:dock (active=false ⇒ العودة للوضع العائم الطبيعي).
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Dock {
    pub active: bool,
    pub browser: String,
    pub strip: u32,
    pub inset: u32,
}
impl Dock {
    pub fn off() -> Dock { Dock { active: false, browser: String::new(), strip: 0, inset: 0 } }
}

/// اسم ملف exe (من مسار كامل أو اسم) ⇒ تعريف المتصفح إن كان معروفًا.
pub fn browser_of(exe: &str) -> Option<(&'static str, u32, u32)> {
    let file = exe.rsplit(['\\', '/']).next().unwrap_or(exe).to_ascii_lowercase();
    BROWSERS.iter().find(|b| b.0 == file).map(|b| (b.1, b.2, b.3))
}

/// قرار الإرساء. أي غموض (مفتاح مطفأ، Eco، exe مجهول/غير متصفح، غير مكبَّر، لا يشمل مركز الحبة) ⇒ Dock::off.
pub fn dock_decision(enabled: bool, eco: bool, exe: Option<&str>, maximized: bool, spans_pill: bool) -> Dock {
    if !enabled || eco || !maximized || !spans_pill { return Dock::off(); }
    match exe.and_then(browser_of) {
        Some((id, strip, inset)) => Dock { active: true, browser: id.to_string(), strip, inset },
        None => Dock::off(),
    }
}
// PURE-END

static DOCK: std::sync::Mutex<Option<Dock>> = std::sync::Mutex::new(None);

/// يحدّث حالة الإرساء ويبثّ island:dock عند التغيّر فقط.
fn set_dock(app: &AppHandle, d: Dock) {
    let mut cur = DOCK.lock().unwrap();
    if cur.as_ref().unwrap_or(&Dock::off()) == &d { return; }
    *cur = Some(d.clone());
    drop(cur);
    let _ = app.emit_to(MAIN, "island:dock", d);
}

/// الحالة الحالية (الواجهة تسألها عند الإقلاع/إعادة التحميل لأن الحدث يُبثّ عند التغيّر فقط).
#[tauri::command]
pub fn island_dock_get() -> Dock {
    DOCK.lock().unwrap().clone().unwrap_or_else(Dock::off)
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
        GetClassNameW, GetForegroundWindow, GetWindowLongPtrW, GetWindowThreadProcessId, IsIconic, IsWindow, IsZoomed,
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
                // وضع التوفير: تتبّع النافذة الأمامية أبطأ (آخر هدف للصق يتأخر ≤300ms فقط).
                std::thread::sleep(std::time::Duration::from_millis(if crate::perf::eco() { 300 } else { 100 }));
            }
        });
    }

    /// اسم ملف exe لعملية النافذة h (None إن تعذّر الوصول).
    fn exe_of(h: HWND) -> Option<String> {
        use windows::core::PWSTR;
        use windows::Win32::System::Threading::{QueryFullProcessImageNameW, PROCESS_NAME_WIN32};
        let pid = pid_of(h);
        if pid == 0 { return None; }
        unsafe {
            let p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let r = QueryFullProcessImageNameW(p, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(p);
            r.ok()?;
            Some(String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    /// هل حدود نافذة h تشمل مركز نافذة الحبة أفقيًا (المتصفح على شاشة الحبة نفسها)؟
    fn spans_pill(app: &AppHandle, h: HWND) -> bool {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
        let Some(w) = app.get_webview_window(MAIN) else { return false };
        let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) else { return false };
        let cx = pos.x + size.width as i32 / 2;
        let mut r = RECT::default();
        if unsafe { GetWindowRect(h, &mut r) }.is_err() { return false; }
        r.left <= cx && cx <= r.right && r.top <= pos.y + 8
    }

    /// وضع تبويب المتصفح: يُستدعى من دورة fullscreen-watch فقط (لا خيط جديد). نافذتنا الأمامية ⇒ لا تغيير.
    fn dock_tick(app: &AppHandle, me: u32, fg: HWND) {
        let enabled = app.state::<AppState>().settings.lock().unwrap()
            .get("browserTabMode").and_then(|v| v.as_bool()).unwrap_or(false);
        if !enabled || crate::perf::eco() {
            set_dock(app, Dock::off());
            return;
        }
        if fg.0.is_null() || pid_of(fg) == me { return; }
        if is_shell(fg) { set_dock(app, Dock::off()); return; }
        let maximized = unsafe { IsZoomed(fg).as_bool() };
        let exe = if maximized { exe_of(fg) } else { None };
        let spans = maximized && spans_pill(app, fg);
        set_dock(app, dock_decision(true, false, exe.as_deref(), maximized, spans));
    }

    /// هل نافذة h تغطي شاشة كاملة (ملء الشاشة)؟ تُقارَن بمستطيلات الشاشات الفعلية.
    fn covers_monitor(app: &AppHandle, h: HWND) -> bool {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
        let mut r = RECT::default();
        if unsafe { GetWindowRect(h, &mut r) }.is_err() {
            return false;
        }
        app.available_monitors().unwrap_or_default().iter().any(|m| {
            let (p, s) = (m.position(), m.size());
            r.left <= p.x && r.top <= p.y && r.right >= p.x + s.width as i32 && r.bottom >= p.y + s.height as i32
        })
    }

    /// hideInFullscreen: يخفي الحبة طالما نافذة أمامية (ليست لنا ولا الشل) تملأ شاشة، ويعيدها بعدها.
    pub fn start_fullscreen_watch(app: AppHandle) {
        std::thread::spawn(move || {
            let me = unsafe { GetCurrentProcessId() };
            let mut auto_hidden = false;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(if crate::perf::eco() { 1500 } else { 500 }));
                let enabled = app
                    .state::<AppState>()
                    .settings
                    .lock()
                    .unwrap()
                    .get("hideInFullscreen")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let fg = unsafe { GetForegroundWindow() };
                dock_tick(&app, me, fg);
                let want = if !enabled {
                    false
                } else if fg.0.is_null() || pid_of(fg) == me {
                    auto_hidden // نافذتنا أمامية ⇒ لا تغيير
                } else {
                    !is_shell(fg) && covers_monitor(&app, fg)
                };
                if want && !auto_hidden {
                    if !*app.state::<AppState>().hidden.lock().unwrap() {
                        set_hidden(&app, true);
                        auto_hidden = true;
                    }
                } else if !want && auto_hidden {
                    auto_hidden = false;
                    set_hidden(&app, false);
                }
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

    /// يعيد NOACTIVATE فقط دون ردّ الفوكس لأحد (عند تشغيل هدف جديد أو حين نقر المستخدم تطبيقًا آخر).
    pub fn drop_focus(app: &AppHandle) {
        if let Some(w) = app.get_webview_window(MAIN) {
            set_noactivate(&w, true);
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
pub use focus::{drop_focus, paste_into_previous, release_focus, start_fullscreen_watch, start_tracker, take_focus};

#[cfg(not(windows))]
pub fn start_tracker() {}
#[cfg(not(windows))]
pub fn start_fullscreen_watch(_app: AppHandle) {}
#[cfg(not(windows))]
pub fn take_focus(_app: &AppHandle) {}
#[cfg(not(windows))]
pub fn release_focus(_app: &AppHandle) {}
#[cfg(not(windows))]
pub fn drop_focus(_app: &AppHandle) {}
#[cfg(not(windows))]
pub fn paste_into_previous(_app: &AppHandle) -> bool {
    false
}

#[cfg(test)]
mod dock_tests {
    use super::*;

    #[test]
    fn known_browsers_by_file_name_any_case_or_path() {
        assert_eq!(browser_of("C:\\Program Files\\Google\\Chrome\\Application\\CHROME.EXE").map(|b| b.0), Some("chrome"));
        assert_eq!(browser_of("msedge.exe").map(|b| b.0), Some("edge"));
        assert_eq!(browser_of("D:/x/firefox.exe").map(|b| b.0), Some("firefox"));
        assert_eq!(browser_of("brave.exe").map(|b| b.0), Some("brave"));
        assert!(browser_of("notepad.exe").is_none());
        assert!(browser_of("chrome_proxy.exe").is_none(), "اسم قريب ليس متصفحًا");
    }

    #[test]
    fn docks_only_when_all_conditions_hold() {
        let d = dock_decision(true, false, Some("C:\\x\\msedge.exe"), true, true);
        assert!(d.active && d.browser == "edge" && d.strip > 0);
        assert!(!dock_decision(false, false, Some("msedge.exe"), true, true).active, "المفتاح مطفأ");
        assert!(!dock_decision(true, true, Some("msedge.exe"), true, true).active, "Eco");
        assert!(!dock_decision(true, false, Some("msedge.exe"), false, true).active, "غير مكبَّر");
        assert!(!dock_decision(true, false, Some("msedge.exe"), true, false).active, "شاشة أخرى");
        assert!(!dock_decision(true, false, Some("notepad.exe"), true, true).active, "ليس متصفحًا");
        assert!(!dock_decision(true, false, None, true, true).active, "exe مجهول ⇒ الوضع الطبيعي");
    }
}
