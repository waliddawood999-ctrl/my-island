// backdrop — الزجاج الحقيقي لنافذة main: تمويه ما خلف الجزيرة على سطح المكتب (Acrylic) بتركيب نظام التشغيل (DWM).
// ويندوز 11 (build ≥ 22621): DWMWA_SYSTEMBACKDROP_TYPE = DWMSBT_TRANSIENTWINDOW (Acrylic) + وضع داكن/فاتح للصبغة.
// ويندوز 10 (≥ 17134): SetWindowCompositionAttribute(ACCENT_ENABLE_ACRYLICBLURBEHIND) بصبغة ABGR بنفس شفافية الزجاج الحالي (0.62/0.66).
// أقدم/فشل أي نداء ⇒ يُبتلع بصمت ويعود "none" (الواجهة تبقى على الزجاج داخل الصفحة). لا خيوط ولا مؤقّتات: نداءات عند التغيّر فقط.
// المنطقة (SetWindowRgn) كبسولة مستديرة بحجم النافذة كي لا يظهر مستطيل التمويه خارج الحبة؛ لذلك تُسقَط الخلفية قبل أي تغيير حجم
// (win::resize_to_island) وتعيد الواجهة طلبها بعد استقرار الحركة. نافذتا overlay والإعدادات/المحرّر خارج النطاق عمدًا.
use tauri::{AppHandle, Manager};

// PURE-BEGIN
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    None,
    Win11,
    Win10,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::None => "none",
            Mode::Win11 => "win11",
            Mode::Win10 => "win10",
        }
    }
}

/// الآلية حسب رقم بناء ويندوز: SystemBackdrop الرسمي من 22621 (11 22H2)، وAcrylic عبر SWCA من 17134 (10 1803).
pub fn mode_for_build(build: u32) -> Mode {
    if build >= 22621 {
        Mode::Win11
    } else if build >= 17134 {
        Mode::Win10
    } else {
        Mode::None
    }
}

/// صبغة ويندوز 10 بصيغة ABGR (0xAABBGGRR): داكن = أسود بشفافية الزجاج 0.62، فاتح = #eceff3 بـ0.66 (كما --island-bg).
pub fn tint_abgr(light: bool) -> u32 {
    let (r, g, b, a) = if light { (236u32, 239u32, 243u32, 0.66f64) } else { (0, 0, 0, 0.62) };
    (((a * 255.0).round() as u32) << 24) | (b << 16) | (g << 8) | r
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
    use windows::Win32::Graphics::Dwm::{DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn, HRGN};
    use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    use windows::Win32::UI::Controls::MARGINS;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    /// المطبَّق حاليًا على main: (المفتاح، الآلية). None = لا خلفية.
    static CUR: Mutex<Option<(Key, Mode)>> = Mutex::new(None);
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

    unsafe fn dwm_i32(h: HWND, attr: i32, v: i32) -> bool {
        DwmSetWindowAttribute(h, DWMWINDOWATTRIBUTE(attr), &v as *const _ as *const c_void, 4).is_ok()
    }

    /// يزيل أي خلفية/منطقة. آمن عند النداء المتكرر.
    unsafe fn clear(h: HWND, mode: Mode) {
        match mode {
            Mode::Win11 => {
                let _ = dwm_i32(h, 38, 1); // DWMSBT_NONE
                let _ = DwmExtendFrameIntoClientArea(h, &MARGINS::default());
            }
            Mode::Win10 => {
                let _ = set_accent(h, 0, 0); // ACCENT_DISABLED
            }
            Mode::None => {}
        }
        let _ = SetWindowRgn(h, None, true);
    }

    pub fn drop_for_resize(app: &AppHandle) {
        let mut cur = CUR.lock().unwrap();
        let Some((_, mode)) = cur.take() else { return };
        if let Some(w) = app.get_webview_window(crate::win::MAIN) {
            if let Ok(h) = w.hwnd() {
                unsafe { clear(HWND(h.0), mode) };
            }
        }
    }

    pub fn apply(app: &AppHandle, glass: bool, light: bool, radius_css: f64) -> Mode {
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
            if let Some((k, m)) = *cur {
                if k == key {
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
                Mode::Win11 => {
                    dwm_i32(h, 20, if light { 0 } else { 1 }) // DWMWA_USE_IMMERSIVE_DARK_MODE: صبغة الأكريليك تتبع الثيم
                        & dwm_i32(h, 33, 1) // DWMWA_WINDOW_CORNER_PREFERENCE = DONOTROUND (المنطقة تتكفّل بالاستدارة)
                        & DwmExtendFrameIntoClientArea(h, &MARGINS { cxLeftWidth: -1, cxRightWidth: -1, cyTopHeight: -1, cyBottomHeight: -1 }).is_ok()
                        & dwm_i32(h, 38, 3) // DWMWA_SYSTEMBACKDROP_TYPE = DWMSBT_TRANSIENTWINDOW (Acrylic)
                }
                Mode::Win10 => set_accent(h, 4, tint_abgr(light)), // ACCENT_ENABLE_ACRYLICBLURBEHIND
                Mode::None => false,
            };
            if !ok {
                clear(h, target);
                return Mode::None;
            }
            *cur = Some((key, target));
            target
        }
    }
}

#[cfg(windows)]
pub use imp::drop_for_resize;

#[cfg(not(windows))]
pub fn drop_for_resize(_app: &AppHandle) {}

/// الواجهة تطلب/تزيل الزجاج الحقيقي وتتلقى الآلية الفعلية ("none" = غير مدعوم/فشل ⇒ الزجاج داخل الصفحة).
/// radius = نصف قطر سطح الحبة بـCSS px (الارتفاع/2 منكمشة، 28 مفتوحة، 24 شريط الأوامر).
#[tauri::command]
pub fn island_backdrop(app: AppHandle, glass: bool, light: bool, radius: f64) -> &'static str {
    #[cfg(windows)]
    {
        imp::apply(&app, glass, light, radius).as_str()
    }
    #[cfg(not(windows))]
    {
        let _ = (app, glass, light, radius);
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
        assert_eq!(mode_for_build(22000), Mode::Win10, "ويندوز 11 21H2: SystemBackdrop غير مدعوم رسميًا ⇒ SWCA");
        assert_eq!(mode_for_build(22621), Mode::Win11);
        assert_eq!(mode_for_build(26100), Mode::Win11);
    }

    #[test]
    fn tint_follows_theme_with_current_glass_alphas() {
        let d = tint_abgr(false);
        assert_eq!(d >> 24, 158, "0.62·255");
        assert_eq!(d & 0x00ff_ffff, 0, "أسود");
        let l = tint_abgr(true);
        assert_eq!(l >> 24, 168, "0.66·255");
        // ABGR: R في البايت الأدنى
        assert_eq!((l & 0xff, (l >> 8) & 0xff, (l >> 16) & 0xff), (236, 239, 243));
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
