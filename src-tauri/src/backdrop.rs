// backdrop — شكل نافذة main (المنطقة) + حالة شفافية ويندوز. لا خلفية نظامية على الإطلاق: أُزيل SetWindowCompositionAttribute (أكريليك الخلفية)
// بقرار مؤسَّس — وثائق مايكروسوفت: أكريليك الخلفية يُستبدل بلون مصمت عند «تعطيل» النافذة، ونافذتنا WS_EX_NOACTIVATE لا تكون نشطة أبدًا
// (window-vibrancy#139 · PowerToys PR #48281 حذفت SWCA). «الزجاج» الآن سطح مُحاكى مرسوم في الصفحة (docs/GLASS.md · Tier A).
// T03: نافذة main بحجم ثابت شفاف؛ «شكل الجزيرة» = منطقة النافذة (SetWindowRgn) بمقاس الهدف (حبة/لمحة/لوحة) تُضبط عبر report_island_rect
// قبل نموّ الحركة وبعد انكماشها: خارجها شفاف ويمرّر الماوس (اختبار إصابة حقيقي بلا استطلاع). نافذتا overlay والإعدادات/المحرّر خارج النطاق عمدًا.
// `system_transparency`: قراءة «تأثيرات الشفافية» في ويندوز — مطفأ ⇒ تصير الواجهة سطحًا معتمًا بالكامل (لا مؤقّتات هنا؛ الواجهة تسأل عند الحدث).
use tauri::AppHandle;
#[cfg(windows)]
use tauri::Manager;

// PURE-BEGIN
/// نصف قطر المنطقة بالبكسل الفيزيائي، محصور بنصف أصغر بُعد (كبسولة كاملة كحدّ أقصى).
pub fn region_radius_px(radius_css: f64, scale: f64, w: u32, h: u32) -> i32 {
    let r = if radius_css.is_finite() && radius_css > 0.0 { radius_css } else { 0.0 } * if scale > 0.0 { scale } else { 1.0 };
    r.min(w.min(h) as f64 / 2.0).round() as i32
}

/// أعلى المنطقة (y) داخل النافذة: عائمة ⇒ 0 (زوايا علوية دائرية مرئية)؛ ملتصقة ⇒ -rad: ينزاح مستطيل الزوايا فوق حافة النافذة فتُقصّ
/// الزاويتان العلويتان خارجها ويبقى الأعلى مربّعًا ملاصقًا للشاشة والأسفل دائريًا (هندسة نوتش) — بلا صور.
pub fn region_top(attached: bool, rad_px: i32) -> i32 { if attached { -rad_px.max(0) } else { 0 } }

/// هامش المنطقة حول الجزيرة (CSS px). المنطقة أحادية البت (قصّ ثنائي بلا تنعيم) فكانت تقصّ حافة CSS المنعَّمة إلى سلّم بكسلات؛ الآن
/// تتسع المنطقة بهذا الهامش من اليمين/اليسار/الأسفل (ومن الأعلى حين ملتصقة) فلا تلمس حافة الجزيرة المرسومة (AA في الصفحة) ويتسع
/// ظلها الناعم. الثمن: حلقة بعرض الهامش حول الجزيرة تلتقط الماوس (شفافة الرسم) — 10px.
pub const EDGE_PAD_CSS: f64 = 10.0;

/// مستطيل المنطقة (l, t, r, b, قطر الإهليلج) بالبكسل الفيزيائي داخل النافذة: مستطيل الجزيرة (x0, عرض pw, ارتفاع ph، نصف قطر rad) موسَّعًا بـpad،
/// وزواياه بنصف القطر rad+pad (منحنى إزاحة متوازٍ لزاوية الجزيرة فيحيط بها بالتساوي). عائمة: الأعلى عند 0 (حافة النافذة)؛ ملتصقة: يُزاح
/// فوق الحافة بمقدار rad+pad فتُقصّ الزاويتان العلويتان خارج النافذة ويبقى أعلى الجزيرة مربّعًا ملاصقًا للشاشة (هندسة نوتش).
pub fn region_rect(attached: bool, x0: i32, pw: i32, ph: i32, rad: i32, pad: i32) -> (i32, i32, i32, i32, i32) {
    let (pad, rad) = (pad.max(0), rad.max(0));
    let top = if attached { -(rad + pad) } else { 0 };
    (x0 - pad, top, x0 + pw + pad + 1, ph + pad + 1, (rad + pad) * 2)
}
// PURE-END

/// شكل الجزيرة الهدف (CSS px): العرض، الارتفاع، نصف القطر. تحدّثه report_island_rect.
static SHAPE: std::sync::Mutex<(f64, f64, f64)> = std::sync::Mutex::new((220.0, 34.0, 17.0));

/// شكل الجزيرة الحالي (عرض، ارتفاع، نصف قطر) بالـCSS px — mascot يحسب عليه «فوق الحبة»/القرب (النافذة ثابتة وأكبر منها).
pub fn shape() -> (f64, f64, f64) { *SHAPE.lock().unwrap() }

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
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn, HRGN};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    /// «تأثيرات الشفافية» في إعدادات ويندوز (Personalize\\EnableTransparency): 0 ⇒ مطفأة. غياب القيمة ⇒ مفعّلة.
    pub fn transparency_enabled() -> bool {
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

    /// المنطقة = مستطيل الجزيرة الهدف (مستدير) داخل النافذة الثابتة: x حسب pillPosition (يسار/منتصف/يمين)، y=0، + امتداد سفلي
    /// حين hoverZone=islandAndBelow. تُحوَّل CSS→فيزيائي بمعامل DPI.
    pub fn apply_region(app: &AppHandle) -> Option<(i32, i32, i32)> {
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
            let (l, t, rr, b, e) = region_rect(attached, x0, pw, ph, rad, (EDGE_PAD_CSS * scale).round() as i32);
            let rgn: HRGN = CreateRoundRectRgn(l, t, rr, b, e, e);
            if rgn.is_invalid() || SetWindowRgn(h, Some(rgn), true) == 0 { return None; }
            Some((pw, ph, rad))
        }
    }
}

/// هل «تأثيرات الشفافية» مفعّلة في ويندوز؟ الواجهة تسأل عند التحميل وعند أول تفاعل (بلا مؤقّتات)؛ غير ويندوز ⇒ true.
/// false ⇒ السطح المُحاكى يصير معتمًا بالكامل (docs/GLASS.md).
#[tauri::command]
pub fn system_transparency() -> bool {
    #[cfg(windows)]
    { imp::transparency_enabled() }
    #[cfg(not(windows))]
    { true }
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
    fn region_is_padded_and_concentric() {
        // عائمة 100%: جزيرة 220×34 عند x0=290، rad=17، pad=10
        assert_eq!(region_rect(false, 290, 220, 34, 17, 10), (280, 0, 521, 45, 54));
        // ملتصقة: الأعلى فوق الحافة بـrad+pad
        assert_eq!(region_rect(true, 290, 220, 34, 17, 10), (280, -27, 521, 45, 54));
        // pad=0 ⇒ السلوك السابق حرفيًا
        assert_eq!(region_rect(false, 290, 220, 34, 17, 0), (290, 0, 511, 35, 34));
        assert_eq!(region_rect(true, 290, 220, 34, 17, 0).1, region_top(true, 17));
        // قوس زاوية المنطقة (مركزه ينزاح بـpad أفقيًا فقط للسفلية) يحوي قوس الجزيرة: مركز السفلي-الأيسر للمنطقة = (l+rad+pad, b-1-(rad+pad)) = (x0+rad, ph-rad)
        let (l, _, _, b, e) = region_rect(false, 290, 220, 34, 17, 10);
        assert_eq!((l + e / 2, b - 1 - e / 2), (290 + 17, 34 - 17));
        assert_eq!(region_rect(false, 0, 100, 40, -3, -5), (0, 0, 101, 41, 0), "قيم سالبة تُحصر");
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
