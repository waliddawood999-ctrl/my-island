// fullscreen — «الإخفاء في وضع ملء الشاشة» (hideInFullscreen) + مراقبة تغيّر الشاشات/DPI/منطقة العمل لإعادة تموضع الحبة.
// حدثي بلا استطلاع دوري: خيط واحد بحلقة رسائل (GetMessageW ⇒ 0% معالج في الخمول) يركّب SetWinEventHook على
// EVENT_SYSTEM_FOREGROUND (تغيّر النافذة الأمامية) وEVENT_OBJECT_LOCATIONCHANGE محصورًا بخيط النافذة الأمامية (F11/ملء الشاشة بلا حدود)،
// ونافذة مخفية تستقبل WM_DISPLAYCHANGE/WM_DPICHANGED/تغيّر منطقة العمل. القرار: SHQueryUserNotificationState (BUSY/D3D/PRESENTATION)
// أو مستطيل النافذة الأمامية يغطي شاشتها بلا شريط عنوان (ملء شاشة بلا حدود).
// عند ملء الشاشة: تُخفى الحبة كليًا؛ لمس حافة الشاشة العليا (فوق الحبة) يُظهرها، ومغادرة المؤشر تُخفيها ثانية. الاستطلاع الوحيد (100ms)
// يعمل فقط أثناء ملء الشاشة لقراءة موضع المؤشر، وينام (Condvar) خارجه.
use tauri::AppHandle;

// PURE-BEGIN
/// قيم SHQueryUserNotificationState: 2=BUSY · 3=RUNNING_D3D_FULL_SCREEN · 4=PRESENTATION_MODE.
pub fn qs_is_busy(qs: i32) -> bool { matches!(qs, 2..=4) }

/// ملء الشاشة؟ حالة الإشعارات تكفي، أو نافذة تغطي شاشتها كاملة بلا شريط عنوان (المكبَّرة العادية لها شريط عنوان ⇒ ليست ملء شاشة
/// حتى لو أخفي شريط المهام).
pub fn is_fullscreen(qs: i32, covers_monitor: bool, has_caption: bool) -> bool {
    qs_is_busy(qs) || (covers_monitor && !has_caption)
}

/// مستطيل (يسار، أعلى، يمين، أسفل) يغطي مستطيلًا آخر.
pub fn rect_covers(outer: (i32, i32, i32, i32), inner: (i32, i32, i32, i32)) -> bool {
    outer.0 <= inner.0 && outer.1 <= inner.1 && outer.2 >= inner.2 && outer.3 >= inner.3
}

/// المؤشر لمس الحافة العليا للشاشة أمام الحبة (مع هامش أفقي).
pub fn edge_hit(cur: (i32, i32), mon_top: i32, win_l: i32, win_r: i32, margin: i32) -> bool {
    cur.1 <= mon_top + 1 && cur.0 >= win_l - margin && cur.0 <= win_r + margin
}

/// المؤشر خارج نافذة الحبة الموسَّعة بهامش ⇒ مغادرة.
pub fn left_island(cur: (i32, i32), win: (i32, i32, i32, i32), margin: i32) -> bool {
    cur.0 < win.0 - margin || cur.0 > win.2 + margin || cur.1 < win.1 - margin || cur.1 > win.3 + margin
}
// PURE-END

#[derive(Default)]
struct St {
    /// ملء شاشة قائم الآن (والميزة مفعّلة).
    fs: bool,
    /// نحن من أخفى الحبة (لا نُظهر ما أخفاه المستخدم بنفسه).
    we_hid: bool,
    /// الحبة ظاهرة مؤقتًا بلمس الحافة.
    peek: bool,
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::sync::{Condvar, Mutex, OnceLock};
    use std::time::Duration;
    use tauri::Manager;
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
    use windows::Win32::UI::Shell::SHQueryUserNotificationState;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetClassNameW, GetCursorPos, GetForegroundWindow, GetMessageW, GetWindowLongPtrW,
        GetWindowRect, GetWindowThreadProcessId, RegisterClassW, TranslateMessage, EVENT_OBJECT_LOCATIONCHANGE, EVENT_SYSTEM_FOREGROUND,
        GWL_STYLE, MSG, OBJID_WINDOW, WINDOW_EX_STYLE, WINEVENT_OUTOFCONTEXT, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_SETTINGCHANGE, WNDCLASSW,
        WS_CAPTION, WS_POPUP,
    };

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static STATE: Mutex<St> = Mutex::new(St { fs: false, we_hid: false, peek: false });
    static WAKE: Condvar = Condvar::new();
    static LOC_HOOK: Mutex<isize> = Mutex::new(0);

    fn enabled() -> bool {
        APP.get().map_or(false, |a| {
            a.state::<crate::state::AppState>().settings.lock().unwrap().get("hideInFullscreen").and_then(|v| v.as_bool()).unwrap_or(false)
        })
    }

    fn class_of(h: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(h, &mut buf) } as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }
    fn is_shell(h: HWND) -> bool {
        matches!(class_of(h).as_str(), "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Progman" | "WorkerW" | "NotifyIconOverflowWindow")
    }
    fn pid_of(h: HWND) -> u32 {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
        pid
    }

    /// يقرّر هل النافذة الأمامية ملء شاشة؛ None = لا تغيير (نافذتنا/الشل/لا نافذة).
    fn foreground_is_fullscreen() -> Option<bool> {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() || pid_of(fg) == GetCurrentProcessId() { return None; }
            if is_shell(fg) { return Some(false); }
            let qs = SHQueryUserNotificationState().map(|s| s.0).unwrap_or(5);
            let mut r = RECT::default();
            let (mut covers, mut caption) = (false, true);
            if GetWindowRect(fg, &mut r).is_ok() {
                let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
                let hm = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
                if GetMonitorInfoW(hm, &mut mi).as_bool() {
                    let m = mi.rcMonitor;
                    covers = rect_covers((r.left, r.top, r.right, r.bottom), (m.left, m.top, m.right, m.bottom));
                }
                caption = (GetWindowLongPtrW(fg, GWL_STYLE) as u32 & WS_CAPTION.0) == WS_CAPTION.0;
            }
            Some(is_fullscreen(qs, covers, caption))
        }
    }

    fn main_rect(app: &AppHandle) -> Option<(i32, i32, i32, i32)> {
        let w = app.get_webview_window(crate::win::MAIN)?;
        let (p, s) = (w.outer_position().ok()?, w.outer_size().ok()?);
        Some((p.x, p.y, p.x + s.width as i32, p.y + s.height as i32))
    }

    /// يطبّق حالة ملء الشاشة الجديدة (يُستدعى من خيط الأحداث).
    fn apply(app: &AppHandle, fs: bool) {
        let mut st = STATE.lock().unwrap();
        if fs == st.fs { return; }
        st.fs = fs;
        if fs {
            if !*app.state::<crate::state::AppState>().hidden.lock().unwrap() {
                st.we_hid = true;
                st.peek = false;
                drop(st);
                crate::win::set_hidden(app, true);
            } else { drop(st); }
            WAKE.notify_all(); // يوقظ خيط المؤشر
        } else {
            let we = st.we_hid;
            st.we_hid = false; st.peek = false;
            drop(st);
            if we { crate::win::set_hidden(app, false); }
        }
    }

    /// تقييم كامل (حدث/تغيير إعداد). الميزة مطفأة ⇒ إعادة الحبة إن كنا أخفيناها.
    pub fn recheck(app: &AppHandle) {
        let _ = APP.set(app.clone());
        if !enabled() { apply(app, false); return; }
        if let Some(fs) = foreground_is_fullscreen() { apply(app, fs); }
    }

    unsafe extern "system" fn win_event(_h: HWINEVENTHOOK, event: u32, hwnd: HWND, id_object: i32, _c: i32, _t: u32, _ms: u32) {
        if event == EVENT_OBJECT_LOCATIONCHANGE {
            if id_object != OBJID_WINDOW.0 || hwnd.0.is_null() { return; }
            if hwnd != GetForegroundWindow() { return; }
        } else if event == EVENT_SYSTEM_FOREGROUND {
            rehook_location(hwnd);
        }
        if let Some(app) = APP.get() { recheck(app); }
    }

    /// تحديد مراقبة التغيّر المكاني بخيط النافذة الأمامية الجديدة فقط (لا فيضان أحداث المؤشر/كل النوافذ).
    fn rehook_location(fg: HWND) {
        unsafe {
            let mut g = LOC_HOOK.lock().unwrap();
            if *g != 0 { let _ = UnhookWinEvent(HWINEVENTHOOK(*g as *mut _)); *g = 0; }
            if fg.0.is_null() { return; }
            let tid = GetWindowThreadProcessId(fg, None);
            let h = SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, None, Some(win_event), 0, tid, WINEVENT_OUTOFCONTEXT);
            if !h.0.is_null() { *g = h.0 as isize; }
        }
    }

    unsafe extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        let work_area = m == WM_SETTINGCHANGE && w.0 == 0x2F; // SPI_SETWORKAREA
        if m == WM_DISPLAYCHANGE || m == WM_DPICHANGED || work_area {
            if let Some(app) = APP.get().cloned() {
                // الشاشات تُحدَّث بتأخير بسيط بعد الرسالة؛ إعادة التموضع مرتين (فورًا وبعد 400ms).
                std::thread::spawn(move || {
                    crate::win::position_main(&app);
                    std::thread::sleep(Duration::from_millis(400));
                    crate::win::position_main(&app);
                });
            }
        }
        DefWindowProcW(h, m, w, l)
    }

    /// خيط المؤشر: ينام حتى يبدأ ملء الشاشة، ثم يقرأ المؤشر كل 100ms لإظهار/إخفاء الحبة عند الحافة العليا.
    fn cursor_thread(app: AppHandle) {
        let mut grace = 0;
        loop {
            {
                let mut st = STATE.lock().unwrap();
                while !st.fs { st = WAKE.wait(st).unwrap(); grace = 0; }
            }
            std::thread::sleep(Duration::from_millis(100));
            let mut p = POINT::default();
            if unsafe { GetCursorPos(&mut p) }.is_err() { continue; }
            let Some(win) = main_rect(&app) else { continue };
            let (peek, we) = { let st = STATE.lock().unwrap(); (st.peek, st.we_hid) };
            if !we { continue; }
            if !peek {
                // الحافة العليا للشاشة التي تحوي المؤشر: top = أعلى الشاشة عند المؤشر (win.1 حين الحبة مخفية تبقى مواقعها).
                let mon_top = app.available_monitors().ok().and_then(|ms| {
                    ms.iter().find(|m| {
                        let (mp, ms) = (m.position(), m.size());
                        p.x >= mp.x && p.x < mp.x + ms.width as i32 && p.y >= mp.y && p.y < mp.y + ms.height as i32
                    }).map(|m| m.position().y)
                });
                if let Some(top) = mon_top {
                    if edge_hit((p.x, p.y), top, win.0, win.2, 60) {
                        STATE.lock().unwrap().peek = true;
                        crate::win::set_hidden(&app, false);
                        grace = 0;
                    }
                }
            } else if left_island((p.x, p.y), win, 14) {
                grace += 1;
                if grace >= 3 { // ~300ms خارج النافذة ⇒ أخفِ
                    STATE.lock().unwrap().peek = false;
                    crate::win::set_hidden(&app, true);
                    grace = 0;
                }
            } else { grace = 0; }
        }
    }

    pub fn start(app: AppHandle) {
        let _ = APP.set(app.clone());
        let a2 = app.clone();
        std::thread::Builder::new().name("fullscreen-cursor".into()).spawn(move || cursor_thread(a2)).ok();
        std::thread::Builder::new().name("fullscreen-events".into()).spawn(move || unsafe {
            let _fg = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, None, Some(win_event), 0, 0, WINEVENT_OUTOFCONTEXT);
            rehook_location(GetForegroundWindow());
            // نافذة مخفية (top-level) تستقبل بث تغيّر الشاشات/DPI/منطقة العمل.
            if let Ok(hi) = GetModuleHandleW(None) {
                let cls = w!("MyIslandDisplayWatch");
                let wc = WNDCLASSW { lpfnWndProc: Some(wndproc), hInstance: hi.into(), lpszClassName: cls, ..Default::default() };
                if RegisterClassW(&wc) != 0 {
                    let _ = CreateWindowExW(WINDOW_EX_STYLE(0), cls, w!(""), WS_POPUP, 0, 0, 0, 0, None, None, Some(hi.into()), None);
                }
            }
            recheck(&app);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }).ok();
    }
}

#[cfg(windows)]
pub use imp::{recheck, start};
#[cfg(not(windows))]
pub fn start(_app: AppHandle) {}
#[cfg(not(windows))]
pub fn recheck(_app: &AppHandle) {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notification_state_decides() {
        assert!(qs_is_busy(2) && qs_is_busy(3) && qs_is_busy(4));
        assert!(!qs_is_busy(1) && !qs_is_busy(5) && !qs_is_busy(6) && !qs_is_busy(7));
    }
    #[test]
    fn borderless_fullscreen_needs_no_caption() {
        assert!(is_fullscreen(5, true, false)); // F11 / لعبة بلا حدود
        assert!(!is_fullscreen(5, true, true)); // مكبَّرة عادية بشريط مهام مخفي
        assert!(!is_fullscreen(5, false, false)); // نافذة صغيرة بلا إطار
        assert!(is_fullscreen(3, false, true)); // D3D حصري
    }
    #[test]
    fn rect_cover_and_edge() {
        assert!(rect_covers((0, 0, 1920, 1080), (0, 0, 1920, 1080)));
        assert!(rect_covers((-8, -8, 1928, 1088), (0, 0, 1920, 1080)));
        assert!(!rect_covers((0, 0, 1920, 1040), (0, 0, 1920, 1080)));
        assert!(edge_hit((960, 0), 0, 800, 1120, 60));
        assert!(edge_hit((750, 1), 0, 800, 1120, 60));
        assert!(!edge_hit((960, 5), 0, 800, 1120, 60));
        assert!(!edge_hit((100, 0), 0, 800, 1120, 60));
    }
    #[test]
    fn leaving_island_has_margin() {
        let w = (800, 0, 1120, 34);
        assert!(!left_island((900, 20), w, 14));
        assert!(!left_island((1130, 20), w, 14));
        assert!(left_island((1200, 20), w, 14));
        assert!(left_island((900, 80), w, 14));
    }
}
