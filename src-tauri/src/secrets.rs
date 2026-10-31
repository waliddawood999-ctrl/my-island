// secrets — مخزن الأسرار المشفّر بـ DPAPI (CryptProtectData، مرتبط بمستخدم ويندوز الحالي).
// كل سرّ ملف مستقل `<بيانات>/secrets/<name>.bin` (بايتات مشفّرة فقط): لا يدخل الإعدادات ولا kv ولا السجلات.
// يستعمله `*_key_set/*_key_status` في الوحدات (الآن: meetings). خارج ويندوز لا يخزّن شيئًا (يرفض) كي لا يُكتب نص صريح.
use std::path::{Path, PathBuf};

/// اسم السرّ: حروف/أرقام/شرطة سفلية فقط (يمنع الخروج من المجلد).
pub fn valid_name(n: &str) -> bool {
    !n.is_empty() && n.len() <= 40 && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn path(dir: &Path, name: &str) -> Option<PathBuf> {
    if valid_name(name) { Some(dir.join("secrets").join(format!("{name}.bin"))) } else { None }
}

const ENTROPY: &[u8] = b"app.myisland.desktop/secrets/v1";

#[cfg(windows)]
mod dpapi {
    use super::ENTROPY;
    use windows::core::w;
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB};

    fn blob(b: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: b.len() as u32, pbData: b.as_ptr() as *mut u8 }
    }
    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out.pbData as *mut _)));
        v
    }
    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let (i, e) = (blob(data), blob(ENTROPY));
            let mut out = CRYPT_INTEGER_BLOB::default();
            CryptProtectData(&i, w!("MyIsland"), Some(&e), None, None, 0, &mut out).map_err(|e| e.to_string())?;
            Ok(take(out))
        }
    }
    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let (i, e) = (blob(data), blob(ENTROPY));
            let mut out = CRYPT_INTEGER_BLOB::default();
            CryptUnprotectData(&i, None, Some(&e), None, None, 0, &mut out).map_err(|e| e.to_string())?;
            Ok(take(out))
        }
    }
}
#[cfg(not(windows))]
mod dpapi {
    pub fn protect(_d: &[u8]) -> Result<Vec<u8>, String> { Err("DPAPI متاح على ويندوز فقط".into()) }
    pub fn unprotect(_d: &[u8]) -> Result<Vec<u8>, String> { Err("DPAPI متاح على ويندوز فقط".into()) }
}

pub fn set(dir: &Path, name: &str, plain: &str) -> Result<(), String> {
    let p = path(dir, name).ok_or("اسم سرّ غير صالح")?;
    let enc = dpapi::protect(plain.as_bytes())?;
    std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(&p, enc).map_err(|e| e.to_string())
}

pub fn get(dir: &Path, name: &str) -> Option<String> {
    let enc = std::fs::read(path(dir, name)?).ok()?;
    String::from_utf8(dpapi::unprotect(&enc).ok()?).ok()
}

pub fn exists(dir: &Path, name: &str) -> bool {
    path(dir, name).map_or(false, |p| p.is_file())
}

pub fn delete(dir: &Path, name: &str) -> Result<(), String> {
    let p = path(dir, name).ok_or("اسم سرّ غير صالح")?;
    match std::fs::remove_file(p) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names() {
        assert!(valid_name("meetings_ical"));
        assert!(!valid_name(""));
        assert!(!valid_name("../x"));
        assert!(!valid_name("a/b"));
        assert!(!valid_name(&"a".repeat(41)));
    }
    #[test]
    fn delete_missing_is_ok_and_exists_false() {
        let d = std::env::temp_dir().join("myisland-secrets-test-none");
        assert!(!exists(&d, "k"));
        assert!(delete(&d, "k").is_ok());
        assert!(delete(&d, "../k").is_err());
    }
}
