// مصادر الأكسنت الاختيارية للثيمات (docs/THEMES.md §مصادر الأكسنت): أكسنت ويندوز الحي + لون الخلفية الغالب.
// صريحة من المستخدم (accentSource=windows|wallpaper) ومحلية بالكامل: لا رفع ولا شبكة. تسأل الواجهة فقط عند اختيار المصدر ثم عند التركيز بفاصل — بلا مؤقّتات هنا.
// فشل أي مصدر ⇒ None فتسقط الواجهة صامتًا إلى بذرة الحزمة. الخلفية: مسار من النظام → تصغير إلى 64px → لون غالب، مع كاش بالمسار+وقت التعديل.

// PURE-BEGIN
/// «#rrggbb» من قيمة DWM AccentColor (DWORD بترتيب ABGR: 0xAABBGGRR).
pub fn hex_from_abgr(v: u32) -> String { format!("#{:02x}{:02x}{:02x}", v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff) }

/// اللون الغالب من عيّنة بكسلات: صناديق 4 بت لكل قناة (4096)، وزن الصندوق = العدد × (0.25 + تشبّع) مع تجاهل القريب من الأسود والأبيض؛
/// الناتج = متوسط أعضاء أثقل صندوق. عيّنة بلا بكسل صالح (رمادية/سوداء/بيضاء كلها) ⇒ متوسط العيّنة كاملة بدل None، وعيّنة فارغة ⇒ None.
pub fn dominant(px: &[[u8; 3]]) -> Option<[u8; 3]> {
    if px.is_empty() { return None; }
    let mut bins: std::collections::HashMap<u16, (f64, [u64; 3], u64)> = std::collections::HashMap::new();
    for p in px {
        let (mx, mn) = (*p.iter().max().unwrap() as f64, *p.iter().min().unwrap() as f64);
        if mx < 24.0 || mn > 232.0 { continue; }
        let sat = if mx > 0.0 { (mx - mn) / mx } else { 0.0 };
        let key = ((p[0] >> 4) as u16) << 8 | ((p[1] >> 4) as u16) << 4 | (p[2] >> 4) as u16;
        let e = bins.entry(key).or_insert((0.0, [0; 3], 0));
        e.0 += 0.25 + sat; e.2 += 1;
        for k in 0..3 { e.1[k] += p[k] as u64; }
    }
    let best = bins.into_iter().max_by(|a, b| a.1 .0.partial_cmp(&b.1 .0).unwrap().then(b.0.cmp(&a.0)));
    match best {
        Some((_, (_, s, n))) if n > 0 => Some([(s[0] / n) as u8, (s[1] / n) as u8, (s[2] / n) as u8]),
        _ => {
            let n = px.len() as u64;
            let s = px.iter().fold([0u64; 3], |mut a, p| { for k in 0..3 { a[k] += p[k] as u64; } a });
            Some([(s[0] / n) as u8, (s[1] / n) as u8, (s[2] / n) as u8])
        }
    }
}
// PURE-END

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use windows::core::w;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS};

    pub fn accent() -> Option<String> {
        unsafe {
            let mut v: u32 = 0;
            let mut len = std::mem::size_of::<u32>() as u32;
            let r = RegGetValueW(HKEY_CURRENT_USER, w!("Software\\Microsoft\\Windows\\DWM"), w!("AccentColor"), RRF_RT_REG_DWORD, None, Some(&mut v as *mut u32 as *mut c_void), Some(&mut len));
            if r.0 != 0 { None } else { Some(hex_from_abgr(v)) }
        }
    }

    fn wallpaper_path() -> Option<String> {
        let mut buf = [0u16; 520];
        unsafe { SystemParametersInfoW(SPI_GETDESKWALLPAPER, buf.len() as u32, Some(buf.as_mut_ptr() as *mut c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)).ok()?; }
        let n = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
        let p = String::from_utf16_lossy(&buf[..n]);
        if p.is_empty() { None } else { Some(p) }
    }

    static CACHE: std::sync::Mutex<Option<(String, std::time::SystemTime, String)>> = std::sync::Mutex::new(None);

    pub fn wallpaper() -> Option<String> {
        let path = wallpaper_path()?;
        let mtime = std::fs::metadata(&path).ok()?.modified().ok()?;
        if let Some((p, t, hex)) = CACHE.lock().unwrap().as_ref() { if *p == path && *t == mtime { return Some(hex.clone()); } }
        let img = image::ImageReader::open(&path).ok()?.with_guessed_format().ok()?.decode().ok()?.thumbnail(64, 64).to_rgb8();
        let px: Vec<[u8; 3]> = img.pixels().map(|p| p.0).collect();
        let c = dominant(&px)?;
        let hex = format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2]);
        *CACHE.lock().unwrap() = Some((path, mtime, hex.clone()));
        Some(hex)
    }
}

/// أكسنت ويندوز الحالي «#rrggbb»؛ غير ويندوز/فشل القراءة ⇒ None.
#[tauri::command]
pub fn system_accent() -> Option<String> {
    #[cfg(windows)]
    { imp::accent() }
    #[cfg(not(windows))]
    { None }
}

/// اللون الغالب لخلفية سطح المكتب «#rrggbb» (مصغّرة 64px محليًا، بكاش)؛ لون مصمت/فشل ⇒ None. بلا أي رفع.
#[tauri::command]
pub fn wallpaper_color() -> Option<String> {
    #[cfg(windows)]
    { imp::wallpaper() }
    #[cfg(not(windows))]
    { None }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn abgr_to_hex() {
        assert_eq!(hex_from_abgr(0xFF_D4_78_00), "#0078d4", "أكسنت ويندوز الافتراضي (BGR في DWORD)");
        assert_eq!(hex_from_abgr(0x00_00_00_FF), "#ff0000");
    }
    #[test]
    fn dominant_prefers_saturated_majority_ignores_extremes() {
        let mut px = vec![[0u8, 0, 0]; 200];
        px.extend(vec![[255u8, 255, 255]; 200]);
        px.extend(vec![[40u8, 120, 220]; 60]);
        px.extend(vec![[200u8, 60, 60]; 30]);
        let c = dominant(&px).unwrap();
        assert_eq!(c, [40, 120, 220], "السواد والبياض لا يغلبان اللون الغالب");
    }
    #[test]
    fn dominant_edge_cases() {
        assert_eq!(dominant(&[]), None);
        assert_eq!(dominant(&[[0, 0, 0]; 10]), Some([0, 0, 0]), "صورة سوداء كلها ⇒ المتوسط بدل None");
        let a = dominant(&[[10, 200, 90], [12, 198, 92], [200, 20, 20]]).unwrap();
        assert!(a[1] > 150, "الأخضر الأكثر تكرارًا");
    }
}
