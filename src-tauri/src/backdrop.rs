// backdrop — الزجاج الحقيقي لنافذة main: تمويه ما خلف الجزيرة على سطح المكتب (Acrylic) بتركيب نظام التشغيل (DWM).
// آلية واحدة لكل البناءات (≥ 17134، ويندوز 10 وما بعده): SetWindowCompositionAttribute(ACCENT_ENABLE_ACRYLICBLURBEHIND) بصبغة ABGR تُشتق من
// glassTint (0–80): ألفا = 0.28 + 0.0075·t (الافتراضي 45 ⇒ 0.62)، والفاتح +0.04 بسقف 0.92 — البلور من النظام والصبغة منّا وحدنا.
// (سابقًا ≥22621 كان يستعمل DWMSBT_TRANSIENTWINDOW: أكريليك النظام يضيف طبقة luminosity/تفتيح خاصة به لا تُضبط، تتراكب مع صبغة CSS فيغسل اللون.)
// أقدم/فشل أي نداء ⇒ يُبتلع بصمت ويعود "none" (الواجهة تبقى على الزجاج داخل الصفحة). لا خيوط ولا مؤقّتات: نداءات عند التغيّر فقط.
// المنطقة (SetWindowRgn) كبسولة مستديرة بحجم النافذة كي لا يظهر مستطيل التمويه خارج الحبة؛ لذلك تُسقَط الخلفية قبل أي تغيير حجم
// (win::resize_to_island) وتعيد الواجهة طلبها بعد استقرار الحركة. نافذتا overlay والإعدادات/المحرّر خارج النطاق عمدًا.
use tauri::{AppHandle, Manager};

// PURE-BEGIN
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    None,
    Win10,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::None => "none",
            Mode::Win10 => "win10",
        }
    }
}

/// الآلية حسب رقم بناء ويندوز: Acrylic عبر SWCA من 17134 (10 1803) وما بعده (يشمل ويندوز 11) — صبغة واحدة بيد glassTint.
pub fn mode_for_build(build: u32) -> Mode {
    if build >= 17134 {
        Mode::Win10
    } else {
        Mode::None
    }
}

/// glassTint المقبول (نسبة 0–80)؛ غير صالح/NaN ⇒ الافتراضي 45.
pub fn clamp_tint(t: f64) -> u32 {
    if t.is_finite() { t.round().clamp(0.0, 80.0) as u32 } else { 45 }
}

/// ألفا صبغة الأكريليك على ويندوز 10 من glassTint: خريطة خطية 0.28 + 0.0075·t (0 ⇒ 0.28 تمويه شبه صافٍ بصبغة خفيفة · 45 ⇒ 0.62 ·
/// 80 ⇒ 0.88)؛ الفاتح +0.04 بسقف 0.92 (يبقى البلور ظاهرًا: لا يبلغ مصمتًا أبدًا).
pub fn win10_alpha(light: bool, tint: u32) -> f64 {
    let a = 0.28 + 0.0075 * tint.min(80) as f64;
    if light { (a + 0.04).min(0.92) } else { a }
}

/// صبغة ويندوز 10 بصيغة ABGR (0xAABBGGRR): داكن = أسود، فاتح = #eceff3، ألفا من win10_alpha.
pub fn tint_abgr(light: bool, tint: u32) -> u32 {
    let (r, g, b) = if light { (236u32, 239u32, 243u32) } else { (0, 0, 0) };
    (((win10_alpha(light, tint) * 255.0).round() as u32) << 24) | (b << 16) | (g << 8) | r
}

/// نصف قطر المنطقة بالبكسل الفيزيائي، محصور بنصف أصغر بُعد (كبسولة كاملة كحدّ أقصى).
pub fn region_radius_px(radius_css: f64, scale: f64, w: u32, h: u32) -> i32 {
    let r = if radius_css.is_finite() && radius_css > 0.0 { radius_css } else { 0.0 } * if scale > 0.0 { scale } else { 1.0 };
    r.min(w.min(h) as f64 / 2.0).round() as i32
}

/// الطلب المطبَّق سابقًا (لتجنّب نداءات مكرّرة): (زجاج، فاتح، عرض، ارتفاع، نصف قطر).
pub type Key = (bool, bool, u32, u32, i32);
// PURE-END

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use std::sync::{Mutex, OnceLock};
    use windows::core::{s, w, BOOL};
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn, HRGN};
    use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    /// المطبَّق حاليًا على main: (المفتاح، الآلية). None = لا خلفية.
    static CUR: Mutex<Option<(Key, Mode, u32)>> = Mutex::new(None);
    static BUILD: OnceLock<u32> = OnceLock::new();

    fn build_number() -> u32 {
        *BUILD.get_or_init(|| unsafe {
            let mut buf = [0u16; 16];
            let mut len = (buf.len() * 2) as u32;
            let r = RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
                w!("CurrentBuildNumber"),
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr() as *mut c_void),
                Some(&mut len),
            );
            if r.0 != 0 {
                return 0;
            }
            let n = (len as usize / 2).saturating_sub(1).min(buf.len());
            String::from_utf16_lossy(&buf[..n]).trim().parse().unwrap_or(0)
        })
    }

    #[repr(C)]
    struct AccentPolicy {
        state: u32,
        flags: u32,
        gradient: u32,
        animation: u32,
    }
    #[repr(C)]
    struct WinCompAttrData {
        attrib: u32,
        data: *mut c_void,
        size: usize,
    }
    type SetWca = unsafe extern "system" fn(HWND, *mut WinCompAttrData) -> BOOL;

    unsafe fn set_accent(h: HWND, state: u32, gradient: u32) -> bool {
        let Ok(m) = GetModuleHandleW(w!("user32.dll")) else { return false };
        let Some(p) = GetProcAddress(m, s!("SetWindowCompositionAttribute")) else { return false };
        let f: SetWca = std::mem::transmute(p);
        let mut pol = AccentPolicy { state, flags: 0, gradient, animation: 0 };
        let mut d = WinCompAttrData { attrib: 19, data: &mut pol as *mut _ as *mut c_void, size: std::mem::size_of::<AccentPolicy>() };
        f(h, &mut d).as_bool()
    }

    /// يزيل أي خلفية/منطقة. آمن عند النداء المتكرر.
    unsafe fn clear(h: HWND, mode: Mode) {
        match mode {
            Mode::Win10 => {
                let _ = set_accent(h, 0, 0); // ACCENT_DISABLED
            }
            Mode::None => {}
        }
        let _ = SetWindowRgn(h, None, true);
    }

    pub fn drop_for_resize(app: &AppHandle) {
        let mut cur = CUR.lock().unwrap();
        let Some((_, mode, _)) = cur.take() else { return };
        if let Some(w) = app.get_webview_window(crate::win::MAIN) {
            if let Ok(h) = w.hwnd() {
                unsafe { clear(HWND(h.0), mode) };
            }
        }
    }

    pub fn apply(app: &AppHandle, glass: bool, light: bool, radius_css: f64, tint: u32) -> Mode {
        let Some(w) = app.get_webview_window(crate::win::MAIN) else { return Mode::None };
        let Ok(h) = w.hwnd() else { return Mode::None };
        let h = HWND(h.0);
        let target = if glass { mode_for_build(build_number()) } else { Mode::None };
        let mut cur = CUR.lock().unwrap();
        unsafe {
            let mut r = RECT::default();
            if GetWindowRect(h, &mut r).is_err() {
                return Mode::None;
            }
            let (ww, wh) = ((r.right - r.left).max(0) as u32, (r.bottom - r.top).max(0) as u32);
            let rad = region_radius_px(radius_css, w.scale_factor().unwrap_or(1.0), ww, wh);
            let key: Key = (glass, light, ww, wh, rad);
            if let Some((k, m, t)) = *cur {
                if k == key {
                    // نفس الهندسة/الثيم: تغيّر glassTint وحده ⇒ تحديث صبغة ويندوز 10 فقط (بلا مسح فلا وميض أثناء سحب المنزلق)؛
                    // ويندوز 11 صبغته داخل الصفحة فلا شيء يُنفَّذ هنا.
                    if m == Mode::Win10 && t != tint {
                        if set_accent(h, 4, tint_abgr(light, tint)) {
                            *cur = Some((k, m, tint));
                        }
                    }
                    return m;
                }
                clear(h, m); // تغيّر الطلب: ابدأ نظيفًا (يتفادى بقايا منطقة/صبغة قديمة)
                *cur = None;
            }
            if target == Mode::None {
                return Mode::None;
            }
            // منطقة الكبسولة أولًا (يملكها النظام بعد SetWindowRgn)، ثم الخلفية.
            let rgn: HRGN = CreateRoundRectRgn(0, 0, ww as i32 + 1, wh as i32 + 1, rad * 2, rad * 2);
            if rgn.is_invalid() || SetWindowRgn(h, Some(rgn), true) == 0 {
                return Mode::None;
            }
            let ok = match target {
                Mode::Win10 => set_accent(h, 4, tint_abgr(light, tint)), // ACCENT_ENABLE_ACRYLICBLURBEHIND
                Mode::None => false,
            };
            if !ok {
                clear(h, target);
                return Mode::None;
            }
            *cur = Some((key, target, tint));
            target
        }
    }
}

#[cfg(windows)]
pub use imp::drop_for_resize;

#[cfg(not(windows))]
pub fn drop_for_resize(_app: &AppHandle) {}

/// الواجهة تطلب/تزيل الزجاج الحقيقي وتتلقى الآلية الفعلية ("none" = غير مدعوم/فشل ⇒ الزجاج داخل الصفحة).
/// tint = glassTint (0–80): يُستعمل لصبغة ويندوز 10 فقط (ويندوز 11: الصبغة في الصفحة). radius = نصف قطر سطح الحبة بـCSS px (الارتفاع/2 منكمشة، 28 مفتوحة، 24 شريط الأوامر).
#[tauri::command]
pub fn island_backdrop(app: AppHandle, glass: bool, light: bool, radius: f64, tint: f64) -> &'static str {
    #[cfg(windows)]
    {
        imp::apply(&app, glass, light, radius, clamp_tint(tint)).as_str()
    }
    #[cfg(not(windows))]
    {
        let _ = (app, glass, light, radius, tint);
        Mode::None.as_str()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mechanism_by_build() {
        assert_eq!(mode_for_build(0), Mode::None, "فشل قراءة البناء ⇒ لا خلفية");
        assert_eq!(mode_for_build(17133), Mode::None, "أقدم من 1803");
        assert_eq!(mode_for_build(17134), Mode::Win10);
        assert_eq!(mode_for_build(19045), Mode::Win10, "ويندوز 10 22H2");
        assert_eq!(mode_for_build(22000), Mode::Win10, "ويندوز 11 21H2");
        assert_eq!(mode_for_build(22621), Mode::Win10, "ويندوز 11 22H2: نفس الآلية (صبغة واحدة)");
        assert_eq!(mode_for_build(26100), Mode::Win10);
    }

    #[test]
    fn tint_is_clamped_and_defaults_on_garbage() {
        assert_eq!(clamp_tint(45.0), 45);
        assert_eq!(clamp_tint(-10.0), 0);
        assert_eq!(clamp_tint(500.0), 80);
        assert_eq!(clamp_tint(44.6), 45);
        assert_eq!(clamp_tint(f64::NAN), 45);
        assert_eq!(clamp_tint(f64::INFINITY), 45);
    }

    #[test]
    fn win10_alpha_map_is_monotonic_default_matches_old_and_blur_never_vanishes() {
        assert!((win10_alpha(false, 45) - 0.6175).abs() < 1e-9, "الافتراضي ≈ 0.62 كالسابق");
        assert!((win10_alpha(true, 45) - 0.6575).abs() < 1e-9, "الفاتح ≈ 0.66 كالسابق");
        assert!((win10_alpha(false, 0) - 0.28).abs() < 1e-9);
        assert!((win10_alpha(false, 80) - 0.88).abs() < 1e-9);
        let mut prev = -1.0;
        for t in 0..=80 {
            let a = win10_alpha(false, t);
            assert!(a > prev, "رتيب تصاعدي");
            assert!(win10_alpha(true, t) >= a, "الفاتح ≥ الداكن");
            assert!(win10_alpha(true, t) <= 0.92 && a < 0.92, "لا يبلغ مصمتًا: البلور يبقى ظاهرًا");
            prev = a;
        }
    }

    #[test]
    fn tint_abgr_packs_alpha_and_theme_colour() {
        let d = tint_abgr(false, 45);
        assert_eq!(d >> 24, 157, "round(0.6175·255)");
        assert_eq!(d & 0x00ff_ffff, 0, "أسود");
        let l = tint_abgr(true, 45);
        assert_eq!(l >> 24, 168, "round(0.6575·255)");
        // ABGR: R في البايت الأدنى
        assert_eq!((l & 0xff, (l >> 8) & 0xff, (l >> 16) & 0xff), (236, 239, 243));
        assert!(tint_abgr(false, 80) >> 24 > tint_abgr(false, 10) >> 24, "التظليل الأقوى ألفا أعلى");
    }

    #[test]
    fn radius_is_scaled_and_capped_to_capsule() {
        assert_eq!(region_radius_px(17.0, 1.0, 220, 34), 17);
        assert_eq!(region_radius_px(17.0, 1.5, 330, 51), 26, "DPI 150%");
        assert_eq!(region_radius_px(99.0, 1.0, 220, 34), 17, "لا يتجاوز نصف أصغر بُعد");
        assert_eq!(region_radius_px(28.0, 1.0, 720, 320), 28);
        assert_eq!(region_radius_px(f64::NAN, 1.0, 220, 34), 0);
        assert_eq!(region_radius_px(-5.0, 1.0, 220, 34), 0);
    }
}
