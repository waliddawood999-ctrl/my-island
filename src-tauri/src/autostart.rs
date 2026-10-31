// وحدة autostart: مفتاح تشغيل ويندوز الفعلي HKCU\Software\Microsoft\Windows\CurrentVersion\Run.
// القيمة = مسار exe الحالي مقتبسًا؛ الحذف عند التعطيل. لا صلاحيات مسؤول (HKCU).

const VALUE_NAME: &str = "MyIsland";

#[cfg(windows)]
pub fn apply(enabled: bool) -> Result<(), String> {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_SZ,
    };

    let name: Vec<u16> = VALUE_NAME.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let mut key = HKEY::default();
        let r = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
            Some(0),
            KEY_SET_VALUE,
            &mut key,
        );
        if r != ERROR_SUCCESS {
            return Err(format!("RegOpenKeyEx: {}", r.0));
        }
        let res = if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let data: Vec<u16> = format!("\"{}\"", exe.display()).encode_utf16().chain(Some(0)).collect();
            let bytes = std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 2);
            RegSetValueExW(key, PCWSTR(name.as_ptr()), Some(0), REG_SZ, Some(bytes))
        } else {
            let r = RegDeleteValueW(key, PCWSTR(name.as_ptr()));
            if r == ERROR_FILE_NOT_FOUND { ERROR_SUCCESS } else { r }
        };
        let _ = RegCloseKey(key);
        if res == ERROR_SUCCESS { Ok(()) } else { Err(format!("registry: {}", res.0)) }
    }
}

#[cfg(not(windows))]
pub fn apply(_enabled: bool) -> Result<(), String> {
    Ok(())
}
