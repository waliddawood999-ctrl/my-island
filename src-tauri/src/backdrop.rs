// backdrop — حالة شفافية ويندوز + فرض شفافية WebView2. لا خلفية نظامية على الإطلاق: أُزيل SetWindowCompositionAttribute (أكريليك الخلفية)
// بقرار مؤسَّس — وثائق مايكروسوفت: أكريليك الخلفية يُستبدل بلون مصمت عند «تعطيل» النافذة، ونافذتنا WS_EX_NOACTIVATE لا تكون نشطة أبدًا
// (window-vibrancy#139 · PowerToys PR #48281 حذفت SWCA). «الزجاج» سطح مُحاكى مرسوم في الصفحة (docs/GLASS.md · Tier A).
// ARCH: حُذفت منطقة النافذة (SetWindowRgn) كليًا — الشكل = ألفا الصفحة؛ اختبار الإصابة في hit.rs (استطلاع المؤشر).
// `system_transparency`: قراءة «تأثيرات الشفافية» في ويندوز — مطفأ ⇒ تصير الواجهة سطحًا معتمًا بالكامل (لا مؤقّتات هنا؛ الواجهة تسأل عند الحدث).
use tauri::AppHandle;



// ───────── شفافية WebView2 المفروضة (ARCH) ─────────
// DefaultBackgroundColor في WebView2 افتراضيًا أبيض ويُرسم تحت كل بكسل ألفاه صفر؛ وRuntime 145.x كسر الشفافية (WebView2Feedback#5481، أُصلح في 147).
// الآلية (طبقتان، كلاهما يصل فعليًا إلى وحدة تحكم WebView2 في هذه الحزمة):
//  1) متغير البيئة WEBVIEW2_DEFAULT_BACKGROUND_COLOR=00000000 يُضبط في main() قبل إنشاء أي ويب فيو (`apply_transparency_env`) — يتجاوز حتى قيمة
//     خيارات الإنشاء ويسري منذ أول إطار فلا وميض أبيض (توثيق مايكروسوفت: «Setting the color via environment variable solves this issue»).
//  2) بعد إنشاء النوافذ: ICoreWebView2Controller2::put_DefaultBackgroundColor(0,0,0,0) على وحدة تحكم نافذتي main وoverlay ثم قراءة القيمة
//     والتحقق منها (`force_webview_transparent`)؛ عدم التطابق يُسجَّل في stderr ويُعاد الضبط مرة.
// PURE-BEGIN
/// قيمة متغير البيئة (ARGB سداسي عشري) للون شفاف تمامًا.
pub const TRANSPARENT_ENV_VALUE: &str = "00000000";
/// هل اللون (A,R,G,B) شفاف تمامًا؟ المنصة تدعم ألفا 0 أو 255 فقط، فأي ألفا غير صفر ⇒ معتم.
pub fn is_fully_transparent(a: u8, _r: u8, _g: u8, _b: u8) -> bool { a == 0 }
// PURE-END

/// يضبط متغير البيئة قبل إنشاء أي ويب فيو (يُستدعى أول main/run).
pub fn apply_transparency_env() {
    std::env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", TRANSPARENT_ENV_VALUE);
}

/// يفرض DefaultBackgroundColor=(0,0,0,0) على نوافذ الشفافية (main وoverlay) ويتحقق من القيمة المقروءة.
pub fn force_webview_transparent(app: &AppHandle) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        for label in [crate::win::MAIN, "overlay"] {
            let Some(w) = app.get_webview_window(label) else { continue };
            let lbl = label.to_string();
            let _ = w.with_webview(move |wv| unsafe {
                use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Controller2, COREWEBVIEW2_COLOR};
                use windows_core_wv2::Interface;
                let Ok(c2) = wv.controller().cast::<ICoreWebView2Controller2>() else {
                    eprintln!("[backdrop] {lbl}: ICoreWebView2Controller2 غير متاح (Runtime قديم) — يبقى متغير البيئة وحده");
                    return;
                };
                let clear = COREWEBVIEW2_COLOR { A: 0, R: 0, G: 0, B: 0 };
                let mut got = COREWEBVIEW2_COLOR { A: 255, R: 255, G: 255, B: 255 };
                for attempt in 0..2 {
                    let _ = c2.SetDefaultBackgroundColor(clear);
                    if c2.DefaultBackgroundColor(&mut got).is_ok() && is_fully_transparent(got.A, got.R, got.G, got.B) { return; }
                    eprintln!("[backdrop] {lbl}: DefaultBackgroundColor بعد الضبط = ({},{},{},{}) محاولة {attempt}", got.A, got.R, got.G, got.B);
                }
            });
        }
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;
    use windows::core::w;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

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
    fn transparency_guard() {
        assert_eq!(TRANSPARENT_ENV_VALUE, "00000000", "ARGB شفاف تمامًا");
        assert!(is_fully_transparent(0, 0, 0, 0));
        assert!(is_fully_transparent(0, 255, 255, 255), "الألفا وحدها تحكم: أبيض بألفا 0 شفاف");
        assert!(!is_fully_transparent(255, 255, 255, 255), "الافتراضي الأبيض المعتم مرفوض");
        assert!(!is_fully_transparent(255, 0, 0, 0), "أسود معتم (تراجع Runtime 145) مرفوض");
    }
}
