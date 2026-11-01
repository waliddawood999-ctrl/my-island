// privacy — مؤشر استخدام الميكروفون/الكاميرا (حسب المخطط §7/privacy).
// المصدر: HKCU\Software\Microsoft\Windows\CapabilityAccessManager\ConsentStore\{microphone,webcam}
// (التطبيقات المتجرية مباشرة + NonPackaged لسطح المكتب): التطبيق يستخدم الجهاز الآن إن كان
// LastUsedTimeStart > 0 وLastUsedTimeStop == 0.
// يعمل فقط عند privacyIndicator مفعّلًا والحبة ظاهرة؛ فحص كل 3s وقراءة ريجيستري فقط (لا التقاط ولا تسجيل).
// privacy_status() → {mic, cam} · الحدث privacy:update عند التغيّر فقط.
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct PrivacyState {
    pub mic: bool,
    pub cam: bool,
}

/// قيد الاستخدام: بدأ ولم ينتهِ.
pub fn in_use(start: u64, stop: u64) -> bool { start > 0 && stop == 0 }

/// مؤشر الخصوصية ميزة أمان: في Eco يُخفَّف الفحص (15s) ولا يُوقَف.
pub fn scan_interval_secs(eco: bool) -> u64 { if eco { 15 } else { 3 } }

pub fn enabled(app: &AppHandle) -> bool {
    use tauri::Manager;
    app.state::<crate::state::AppState>().settings.lock().unwrap()
        .get("privacyIndicator").and_then(|v| v.as_bool()).unwrap_or(false)
}

#[cfg(windows)]
mod reg {
    use super::in_use;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::{ERROR_SUCCESS, FILETIME};
    use windows::Win32::System::Registry::*;

    const BASE: &str = "Software\\Microsoft\\Windows\\CapabilityAccessManager\\ConsentStore\\";

    fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }

    unsafe fn open(path: &str) -> Option<HKEY> {
        let mut k = HKEY::default();
        let p = wide(path);
        if RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(p.as_ptr()), Some(0), KEY_READ, &mut k) == ERROR_SUCCESS { Some(k) } else { None }
    }

    unsafe fn qword(k: HKEY, name: &str) -> u64 {
        let n = wide(name);
        let (mut v, mut len) = (0u64, 8u32);
        let mut ty = REG_VALUE_TYPE::default();
        let r = RegQueryValueExW(k, PCWSTR(n.as_ptr()), None, Some(&mut ty), Some(&mut v as *mut u64 as *mut u8), Some(&mut len));
        if r == ERROR_SUCCESS && ty == REG_QWORD { v } else { 0 }
    }

    unsafe fn subkeys(k: HKEY) -> Vec<String> {
        let mut out = Vec::new();
        let mut idx = 0u32;
        loop {
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let r = RegEnumKeyExW(k, idx, Some(PWSTR(buf.as_mut_ptr())), &mut len, None, None, None, None::<*mut FILETIME>);
            if r != ERROR_SUCCESS { break; }
            out.push(String::from_utf16_lossy(&buf[..len as usize]));
            idx += 1;
        }
        out
    }

    unsafe fn key_in_use(path: &str) -> bool {
        match open(path) {
            Some(k) => {
                let u = in_use(qword(k, "LastUsedTimeStart"), qword(k, "LastUsedTimeStop"));
                let _ = RegCloseKey(k);
                u
            }
            None => false,
        }
    }

    /// هل يستخدم أي تطبيق الإمكانية (microphone/webcam) الآن؟
    pub fn capability_in_use(cap: &str) -> bool {
        unsafe {
            let root = format!("{BASE}{cap}");
            let Some(k) = open(&root) else { return false };
            let names = subkeys(k);
            let _ = RegCloseKey(k);
            for n in names {
                if n == "NonPackaged" {
                    let np = format!("{root}\\NonPackaged");
                    if let Some(nk) = open(&np) {
                        let apps = subkeys(nk);
                        let _ = RegCloseKey(nk);
                        if apps.iter().any(|a| key_in_use(&format!("{np}\\{a}"))) { return true; }
                    }
                } else if key_in_use(&format!("{root}\\{n}")) {
                    return true;
                }
            }
            false
        }
    }
}

#[cfg(windows)]
pub fn scan() -> PrivacyState {
    PrivacyState { mic: reg::capability_in_use("microphone"), cam: reg::capability_in_use("webcam") }
}
#[cfg(not(windows))]
pub fn scan() -> PrivacyState { PrivacyState::default() }

#[tauri::command]
pub fn privacy_status(app: AppHandle) -> PrivacyState {
    if enabled(&app) { scan() } else { PrivacyState::default() }
}

pub fn start(app: &AppHandle) {
    use tauri::{Emitter, Manager};
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last = PrivacyState::default();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(scan_interval_secs(crate::perf::eco())));
            let hidden = *app.state::<crate::state::AppState>().hidden.lock().unwrap();
            let now = if enabled(&app) && !hidden { scan() } else if enabled(&app) { last.clone() } else { PrivacyState::default() };
            if now != last {
                let _ = app.emit("privacy:update", &now);
                last = now;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn eco_relaxes_scan() {
        assert_eq!(scan_interval_secs(false), 3);
        assert_eq!(scan_interval_secs(true), 15);
    }
    #[test]
    fn usage() {
        assert!(in_use(133_000_000_000, 0));
        assert!(!in_use(133_000_000_000, 133_000_100_000));
        assert!(!in_use(0, 0));
    }
}
