// backdrop — الزجاج الحقيقي لنافذة main: تمويه ما خلف الجزيرة على سطح المكتب (Acrylic) بتركيب نظام التشغيل (DWM).
// آلية واحدة لكل البناءات (≥ 17134، ويندوز 10 وما بعده): SetWindowCompositionAttribute(ACCENT_ENABLE_ACRYLICBLURBEHIND) بصبغة ABGR تُشتق من
// glassTint (0–80): ألفا = 0.28 + 0.0075·t (الافتراضي 45 ⇒ 0.62)، والفاتح +0.04 بسقف 0.92 — البلور من النظام والصبغة منّا وحدنا.
// (سابقًا ≥22621 كان يستعمل DWMSBT_TRANSIENTWINDOW: أكريليك النظام يضيف طبقة luminosity/تفتيح خاصة به لا تُضبط، تتراكب مع صبغة CSS فيغسل اللون.)
// أقدم/فشل أي نداء ⇒ يُبتلع بصمت ويعود "none" (الواجهة تبقى على الزجاج داخل الصفحة). لا خيوط ولا مؤقّتات: نداءات عند التغيّر فقط.
// T03: نافذة main بحجم ثابت شفاف؛ «شكل الجزيرة» = منطقة النافذة (SetWindowRgn) بمقاس الهدف (حبة/لمحة/لوحة) تُضبط عبر report_island_rect
// قبل نموّ الحركة وبعد انكماشها: خارجها شفاف ويمرّر الماوس (اختبار إصابة حقيقي بلا استطلاع). الأكريليك يُطبَّق على المنطقة نفسها بعد الاستقرار،
// وتُسقَط صبغته (لا المنطقة) عند تغيّر الهدف. نافذتا overlay والإعدادات/المحرّر خارج النطاق عمدًا.
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

/// أسلوب الزجاج (كلاهما أكريليك أصلي؛ يختلفان بخريطة ألفا الصبغة فقط): Frosted مثلّج بتظليل أقوى · Clear تظليل خفيف.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Style {
    Frosted,
    Clear,
}

impl Style {
    /// "clear" ⇒ Clear؛ غير ذلك (بما فيه المجهول) ⇒ Frosted.
    pub fn parse(s: &str) -> Style {
        if s == "clear" { Style::Clear } else { Style::Frosted }
    }
}

/// ألفا الصبغة حسب الأسلوب والثيم وglassTint (0–80):
///  Frosted: داكن 0.28 + 0.0075·t · فاتح min(0.32 + 0.0075·t, 0.92)  (كما كان تمامًا)
///  Clear:   داكن 0.10 + 0.0050·t · فاتح min(0.14 + 0.0050·t, 0.60)
pub fn style_alpha(style: Style, light: bool, tint: u32) -> f64 {
    let t = tint.min(80) as f64;
    match (style, light) {
        (Style::Frosted, false) => 0.28 + 0.0075 * t,
        (Style::Frosted, true) => (0.32 + 0.0075 * t).min(0.92),
        (Style::Clear, false) => 0.10 + 0.0050 * t,
        (Style::Clear, true) => (0.14 + 0.0050 * t).min(0.60),
    }
}

/// ألفا صبغة الأكريليك على ويندوز 10 من glassTint: خريطة خطية 0.28 + 0.0075·t (0 ⇒ 0.28 تمويه شبه صافٍ بصبغة خفيفة · 45 ⇒ 0.62 ·
/// 80 ⇒ 0.88)؛ الفاتح +0.04 بسقف 0.92 (يبقى البلور ظاهرًا: لا يبلغ مصمتًا أبدًا).
pub fn win10_alpha(light: bool, tint: u32) -> f64 {
    let a = 0.28 + 0.0075 * tint.min(80) as f64;
    if light { (a + 0.04).min(0.92) } else { a }
}

/// صبغة الأكريليك بصيغة ABGR (0xAABBGGRR): داكن = أسود، فاتح Frosted = #eceff3، فاتح Clear = #ffffff؛ ألفا من style_alpha.
pub fn tint_abgr(style: Style, light: bool, tint: u32) -> u32 {
    let (r, g, b) = match (style, light) {
        (_, false) => (0u32, 0u32, 0u32),
        (Style::Frosted, true) => (236, 239, 243),
        (Style::Clear, true) => (255, 255, 255),
    };
    (((style_alpha(style, light, tint) * 255.0).round() as u32) << 24) | (b << 16) | (g << 8) | r
}

/// نصف قطر المنطقة بالبكسل الفيزيائي، محصور بنصف أصغر بُعد (كبسولة كاملة كحدّ أقصى).
pub fn region_radius_px(radius_css: f64, scale: f64, w: u32, h: u32) -> i32 {
    let r = if radius_css.is_finite() && radius_css > 0.0 { radius_css } else { 0.0 } * if scale > 0.0 { scale } else { 1.0 };
    r.min(w.min(h) as f64 / 2.0).round() as i32
}

/// أعلى المنطقة (y) داخل النافذة: عائمة ⇒ 0 (زوايا علوية دائرية مرئية)؛ ملتصقة ⇒ -rad: ينزاح مستطيل الزوايا فوق حافة النافذة فتُقصّ
/// الزاويتان العلويتان خارجها ويبقى الأعلى مربّعًا ملاصقًا للشاشة والأسفل دائريًا (هندسة نوتش) — بلا صور.
pub fn region_top(attached: bool, rad_px: i32) -> i32 { if attached { -rad_px.max(0) } else { 0 } }

/// الطلب المطبَّق سابقًا (لتجنّب نداءات مكرّرة): (زجاج، فاتح، عرض، ارتفاع، نصف قطر). الأسلوب وglassTint خارج المفتاح عمدًا: تغيّرهما بنفس الهندسة ⇒ set_accent فقط (بلا مسح فلا وميض).
pub type Key = (bool, bool, u32, u32, i32);
// PURE-END

/// شكل الجزيرة الهدف (CSS px): العرض، الارتفاع، نصف القطر. تحدّثه report_island_rect.
static SHAPE: std::sync::Mutex<(f64, f64, f64)> = std::sync::Mutex::new((220.0, 34.0, 17.0));

/// يضبط شكل الجزيرة الهدف ويطبّق المنطقة على النافذة الثابتة (ويندوز) — الواجهة تستدعيه قبل النمو وبعد الانكماش فقط.
pub fn set_shape(app: &AppHandle, w: f64, h: f64, radius: f64) {
    let ok = |v: f64| v.is_finite() && v > 0.0;
    if ok(w) && ok(h) { *SHAPE.lock().unwrap() = (w, h, if ok(radius) { radius.min(w.min(h) / 2.0) } else { h / 2.0 }); }
    refresh_shape(app);
}

/// يعيد تطبيق المنطقة من الشكل المخزَّن (بعد تغيّر DPI/الشاشة/الموضع/hoverZone).
pub fn refresh_shape(app: &AppHandle) {
    #[cfg(windows)]
    imp::apply_region(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use std::sync::{Mutex, OnceLock};
    use windows::core::{s, w, BOOL};
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn, HRGN};
    use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    /// المطبَّق حاليًا على main: (المفتاح، الآلية). None = لا خلفية.
    static CUR: Mutex<Option<(Key, Mode, (Style, u32))>> = Mutex::new(None);
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

    /// «تأثيرات الشفافية» في إعدادات ويندوز (Personalize\\EnableTransparency): 0 ⇒ لا أكريليك (احتياط مصبوغ في الواجهة). غياب القيمة ⇒ مفعّل.
    fn transparency_enabled() -> bool {
        unsafe {
            let mut v: u32 = 1;
            let mut len = std::mem::size_of::<u32>() as u32;
            let r = RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
                w!("EnableTransparency"),
                RRF_RT_REG_DWORD,
                None,
                Some(&mut v as *mut u32 as *mut c_void),
                Some(&mut len),
            );
            r.0 != 0 || v != 0
        }
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

    /// المنطقة = مستطيل الجزيرة الهدف (مستدير) داخل النافذة الثابتة: x حسب pillPosition (يسار/منتصف/يمين)، y=0، + امتداد سفلي
    /// حين hoverZone=islandAndBelow. تُحوَّل CSS→فيزيائي بمعامل DPI.
    pub fn apply_region(app: &AppHandle) -> Option<(i32, i32, i32)> {
        use tauri::Manager;
        let w = app.get_webview_window(crate::win::MAIN)?;
        let h = HWND(w.hwnd().ok()?.0);
        let scale = w.scale_factor().unwrap_or(1.0);
        let (cw, ch, cr) = *SHAPE.lock().unwrap();
        let (align, attached, below) = {
            let st = app.state::<crate::state::AppState>();
            let (a, at) = { let p = st.placement.lock().unwrap(); (p.align, p.attached) };
            let z = st.settings.lock().unwrap().get("hoverZone").and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
            (a, at, if z == "islandAndBelow" { 24.0 } else { 0.0 })
        };
        unsafe {
            let mut r = RECT::default();
            GetWindowRect(h, &mut r).ok()?;
            let ww = (r.right - r.left).max(0);
            let (pw, ph) = ((cw * scale).round() as i32, ((ch + below) * scale).round() as i32);
            let x0 = match align { -1 => 0, 1 => (ww - pw).max(0), _ => ((ww - pw) / 2).max(0) };
            let rad = region_radius_px(cr, scale, pw as u32, (ch * scale) as u32);
            let rgn: HRGN = CreateRoundRectRgn(x0, region_top(attached, rad), x0 + pw + 1, ph + 1, rad * 2, rad * 2);
            if rgn.is_invalid() || SetWindowRgn(h, Some(rgn), true) == 0 { return None; }
            Some((pw, ph, rad))
        }
    }

    pub fn apply(app: &AppHandle, glass: bool, light: bool, radius_css: f64, style: Style, tint: u32) -> Mode {
        let Some(w) = app.get_webview_window(crate::win::MAIN) else { return Mode::None };
        let Ok(h) = w.hwnd() else { return Mode::None };
        let h = HWND(h.0);
        let target = if glass && transparency_enabled() { mode_for_build(build_number()) } else { Mode::None };
        let mut cur = CUR.lock().unwrap();
        // المنطقة تُطبَّق دائمًا (اختبار الإصابة)؛ الأكريليك فوقها فقط.
        let Some((pw, ph, rad)) = apply_region(app) else { return Mode::None };
        let _ = radius_css;
        let key: Key = (glass, light, pw as u32, ph as u32, rad);
        unsafe {
            if let Some((k, m, t)) = *cur {
                if k == key {
                    // نفس الهندسة/الثيم: تغيّر glassTint وحده ⇒ تحديث صبغة ويندوز 10 فقط (بلا مسح فلا وميض أثناء سحب المنزلق).
                    if m == Mode::Win10 && t != (style, tint) {
                        if set_accent(h, 4, tint_abgr(style, light, tint)) {
                            *cur = Some((k, m, (style, tint)));
                        }
                    }
                    return m;
                }
                clear(h, m); // تغيّر الطلب: ابدأ بلا صبغة قديمة
                *cur = None;
            }
            if target == Mode::None {
                return Mode::None;
            }
            let ok = match target {
                Mode::Win10 => set_accent(h, 4, tint_abgr(style, light, tint)), // ACCENT_ENABLE_ACRYLICBLURBEHIND
                Mode::None => false,
            };
            if !ok {
                clear(h, target);
                return Mode::None;
            }
            *cur = Some((key, target, (style, tint)));
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
pub fn island_backdrop(app: AppHandle, glass: bool, light: bool, radius: f64, tint: f64, style: Option<String>) -> &'static str {
    #[cfg(windows)]
    {
        imp::apply(&app, glass, light, radius, Style::parse(style.as_deref().unwrap_or("frosted")), clamp_tint(tint)).as_str()
    }
    #[cfg(not(windows))]
    {
        let _ = (app, glass, light, radius, tint, style);
        Mode::None.as_str()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docking_region_top() {
        assert_eq!(region_top(false, 17), 0, "عائمة: الزوايا العلوية داخل النافذة (مرئية)");
        assert_eq!(region_top(true, 17), -17, "ملتصقة: الزوايا العلوية فوق الحافة فتُقصّ");
        assert_eq!(region_top(true, 0), 0);
        assert_eq!(region_top(true, -5), 0, "قيمة سالبة لا تُنتج إزاحة معكوسة");
    }

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
        let d = tint_abgr(Style::Frosted, false, 45);
        assert_eq!(d >> 24, 157, "round(0.6175·255)");
        assert_eq!(d & 0x00ff_ffff, 0, "أسود");
        let l = tint_abgr(Style::Frosted, true, 45);
        assert_eq!(l >> 24, 168, "round(0.6575·255)");
        // ABGR: R في البايت الأدنى
        assert_eq!((l & 0xff, (l >> 8) & 0xff, (l >> 16) & 0xff), (236, 239, 243));
        assert!(tint_abgr(Style::Frosted, false, 80) >> 24 > tint_abgr(Style::Frosted, false, 10) >> 24, "التظليل الأقوى ألفا أعلى");
    }

    #[test]
    fn style_alpha_maps_both_styles_with_caps() {
        // Frosted = الخريطة القديمة حرفيًا
        for t in 0..=80u32 {
            assert!((style_alpha(Style::Frosted, false, t) - win10_alpha(false, t)).abs() < 1e-12);
            assert!((style_alpha(Style::Frosted, true, t) - win10_alpha(true, t)).abs() < 1e-12);
        }
        assert!((style_alpha(Style::Clear, false, 0) - 0.10).abs() < 1e-12);
        assert!((style_alpha(Style::Clear, false, 25) - 0.225).abs() < 1e-12);
        assert!((style_alpha(Style::Clear, false, 80) - 0.50).abs() < 1e-12);
        assert!((style_alpha(Style::Clear, true, 0) - 0.14).abs() < 1e-12);
        assert!((style_alpha(Style::Clear, true, 80) - 0.54).abs() < 1e-12);
        for t in 0..=80u32 {
            let (d, l) = (style_alpha(Style::Clear, false, t), style_alpha(Style::Clear, true, t));
            assert!(l <= 0.60 && l >= d, "سقف الفاتح 0.60 وهو ≥ الداكن");
            assert!(d < style_alpha(Style::Frosted, false, t) && l < style_alpha(Style::Frosted, true, t), "Clear دائمًا أخفّ من Frosted");
            if t > 0 {
                assert!(d > style_alpha(Style::Clear, false, t - 1) && l >= style_alpha(Style::Clear, true, t - 1), "رتيب");
            }
        }
        assert!((style_alpha(Style::Clear, true, 200) - style_alpha(Style::Clear, true, 80)).abs() < 1e-12, "tint فوق 80 يُحصر");
    }

    #[test]
    fn clear_abgr_packing_and_colours() {
        let d = tint_abgr(Style::Clear, false, 25);
        assert_eq!(d >> 24, 57, "round(0.225·255)");
        assert_eq!(d & 0x00ff_ffff, 0, "داكن = أسود");
        let l = tint_abgr(Style::Clear, true, 25);
        assert_eq!(l >> 24, 68, "round(0.265·255)");
        assert_eq!(l & 0x00ff_ffff, 0x00ff_ffff, "فاتح Clear = أبيض");
        let f = tint_abgr(Style::Frosted, true, 25);
        assert_eq!((f & 0xff, (f >> 8) & 0xff, (f >> 16) & 0xff), (236, 239, 243), "فاتح Frosted = #eceff3");
    }

    #[test]
    fn style_parse_defaults_to_frosted() {
        assert_eq!(Style::parse("clear"), Style::Clear);
        assert_eq!(Style::parse("frosted"), Style::Frosted);
        assert_eq!(Style::parse("whatever"), Style::Frosted);
        assert_eq!(Style::parse(""), Style::Frosted);
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
