// hit — اختبار الإصابة للنافذة الرئيسية بلا منطقة نافذة (ARCH: حُذف SetWindowRgn نهائيًا).
// النافذة شفافة ثابتة 800×500 والشكل = ألفا الصفحة (يركّبه DWM بتنعيم كامل). «النقر الشفاف خارج الجسم» = خيط مركون يستطلع موضع المؤشر
// (~60Hz قريبًا من النافذة، ~20Hz بعيدًا) ويقارنه بمستطيل الإصابة الذي تبلّغه الواجهة عبر report_island_rect، ويبدّل
// set_ignore_cursor_events **عند الانتقالات فقط** (النمط المنشور لقوالب أوفرلاي Tauri). لا استدعاء نافذة لكل إطار حركة.
// الخيط يُركن (park) والحبة مخفية (hide()) فلا استهلاك؛ set_hidden(false) يوقظه.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

// PURE-BEGIN
/// هامش الإصابة حول الجزيرة (CSS px): يتسامح مع حافة الجسم المنعَّمة فلا تُفلت نقرة على البكسل الأخير. (كان 10px هامش المنطقة؛ الآن 3.)
pub const HIT_SLOP_CSS: f64 = 3.0;
/// المؤشر خارج النافذة بأكثر من هذه المسافة (فيزيائي) ⇒ استطلاع هادئ.
pub const FAR_MARGIN_PX: i32 = 48;

/// مستطيل مستدير بإحداثيات الشاشة الفيزيائية: (l, t, r, b) نصف مفتوح [l,r)×[t,b) ونصف قطر الزوايا.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HitRect { pub l: i32, pub t: i32, pub r: i32, pub b: i32, pub rad: i32 }

/// مستطيل الجزيرة داخل النافذة (CSS) عند وضع النافذة وحجمها الفيزيائيين: x حسب pillPosition (يسار/منتصف/يمين)، y=0 +
/// امتداد سفلي `below_css` (hoverZone=islandAndBelow). ملتصقة ⇒ يُمدّ الأعلى فوق حافة الشاشة بمقدار نصف القطر فتبقى الزاويتان العلويتان
/// خارج الشاشة والأعلى مسطّحًا (هندسة نوتش، التنعيم المرئي في CSS). `slop_css` يوسّع الأضلاع كلها.
#[allow(clippy::too_many_arguments)]
pub fn hit_rect(attached: bool, align: i8, win: (i32, i32, i32), scale: f64, size: (f64, f64, f64), below_css: f64, slop_css: f64) -> HitRect {
    let (wx, wy, ww) = win;
    let s = if scale > 0.0 { scale } else { 1.0 };
    let ok = |v: f64| if v.is_finite() && v > 0.0 { v } else { 0.0 };
    let (cw, ch, cr) = (ok(size.0), ok(size.1), ok(size.2));
    let slop = (slop_css.max(0.0) * s).round() as i32;
    let pw = (cw * s).round() as i32;
    let ph = ((ch + below_css.max(0.0)) * s).round() as i32;
    let x0 = match align { -1 => 0, 1 => (ww - pw).max(0), _ => ((ww - pw) / 2).max(0) };
    let rad = ((cr * s).min(pw.min((ch * s).round() as i32) as f64 / 2.0)).round() as i32;
    let top = if attached { wy - rad - slop } else { wy - slop };
    HitRect { l: wx + x0 - slop, t: top, r: wx + x0 + pw + slop, b: wy + ph + slop, rad: rad + slop }
}

/// هل (x,y) داخل المستطيل المستدير؟ الزوايا الأربع دائرية بنصف القطر rad (مستدير حقيقي لا مستطيل).
pub fn inside(rc: HitRect, x: i32, y: i32) -> bool {
    if x < rc.l || x >= rc.r || y < rc.t || y >= rc.b { return false; }
    // مراكز الأقواس الأربعة ثابتة؛ المقارنة على مركز البكسل (x+½, y+½) فلا انحياز نصف بكسل.
    let rad = rc.rad.min((rc.r - rc.l) / 2).min((rc.b - rc.t) / 2).max(0) as f64;
    let (px, py) = (x as f64 + 0.5, y as f64 + 0.5);
    let dx = (rc.l as f64 + rad - px).max(px - (rc.r as f64 - rad)).max(0.0);
    let dy = (rc.t as f64 + rad - py).max(py - (rc.b as f64 - rad)).max(0.0);
    dx * dx + dy * dy <= rad * rad
}

/// قرار التبديل: `cur` = ما طُبِّق سلفًا (None = لم يُطبَّق شيء بعد). يعيد Some(ignore) فقط عند **انتقال** (أو أول تطبيق).
/// `button_down`: زر فأرة مضغوط ⇒ لا نبدّل إلى «تجاهل» أثناء سحب بدأ داخل الجزيرة (يحافظ على التقاط الماوس)؛ الخروج من التجاهل مسموح دائمًا.
pub fn next_ignore(cur: Option<bool>, inside: bool, button_down: bool) -> Option<bool> {
    let want = !inside;
    if want && button_down && cur == Some(false) { return None; }
    if cur == Some(want) { None } else { Some(want) }
}

/// مهلة الاستطلاع: قرب النافذة 16ms (~60Hz)، بعيدًا 50ms، وضع التوفير ضعف ذلك.
pub fn interval_ms(near_window: bool, eco: bool) -> u64 {
    let base = if near_window { 16 } else { 50 };
    if eco { base * 2 } else { base }
}

/// المؤشر قرب مستطيل النافذة (فيزيائي: x,y,w,h) ضمن FAR_MARGIN_PX؟
pub fn near_window(cur: (i32, i32), win: (i32, i32, i32, i32)) -> bool {
    let (x, y, w, h) = win;
    cur.0 >= x - FAR_MARGIN_PX && cur.0 < x + w + FAR_MARGIN_PX && cur.1 >= y - FAR_MARGIN_PX && cur.1 < y + h + FAR_MARGIN_PX
}
// PURE-END

/// مستطيل الإصابة الهدف (CSS px): العرض، الارتفاع، نصف القطر — تحدّثه report_island_rect. mascot يقرؤه أيضًا («فوق الجزيرة»).
static SHAPE: Mutex<(f64, f64, f64)> = Mutex::new((220.0, 34.0, 17.0));
static THREAD: OnceLock<std::thread::Thread> = OnceLock::new();
/// آخر قيمة ignore طُبِّقت (None ⇒ أول تطبيق بعد الإظهار).
static APPLIED: Mutex<Option<bool>> = Mutex::new(None);
static HIDDEN: AtomicBool = AtomicBool::new(false);

pub fn shape() -> (f64, f64, f64) { *SHAPE.lock().unwrap() }

/// الواجهة تبلّغ بمستطيل الإصابة الهدف. لا شيء يُطبَّق هنا: الخيط يقرأه في الدورة التالية.
pub fn set_shape(w: f64, h: f64, radius: f64) {
    let ok = |v: f64| v.is_finite() && v > 0.0;
    if ok(w) && ok(h) { *SHAPE.lock().unwrap() = (w, h, if ok(radius) { radius.min(w.min(h) / 2.0) } else { h / 2.0 }); }
    wake();
}

/// الحبة مخفية (hide()) ⇒ يُركن الخيط؛ إظهارها ⇒ يُوقَظ ويبدأ من تطبيق أول (APPLIED=None).
pub fn set_hidden(hidden: bool) {
    HIDDEN.store(hidden, Ordering::Relaxed);
    if !hidden { *APPLIED.lock().unwrap() = None; wake(); }
}

fn wake() { if let Some(t) = THREAD.get() { t.unpark(); } }

#[cfg(windows)]
fn cursor_and_button() -> Option<((i32, i32), bool)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe {
        GetCursorPos(&mut p).ok()?;
        let down = (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 | GetAsyncKeyState(VK_RBUTTON.0 as i32) as u16) & 0x8000 != 0;
        Some(((p.x, p.y), down))
    }
}
#[cfg(not(windows))]
fn cursor_and_button() -> Option<((i32, i32), bool)> { None }

/// دورة واحدة: يعيد true إن كان المؤشر قرب النافذة (يحدّد المهلة التالية).
fn tick(app: &AppHandle) -> bool {
    let Some(w) = app.get_webview_window(crate::win::MAIN) else { return false };
    let Some((cur, down)) = cursor_and_button() else { return false };
    let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) else { return false };
    let scale = w.scale_factor().unwrap_or(1.0);
    let (align, attached, below) = {
        let st = app.state::<crate::state::AppState>();
        let (a, at) = { let pl = st.placement.lock().unwrap(); (pl.align, pl.attached) };
        let z = st.settings.lock().unwrap().get("hoverZone").and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
        (a, at, if z == "islandAndBelow" { 24.0 } else { 0.0 })
    };
    let rc = hit_rect(attached, align, (p.x, p.y, s.width as i32), scale, shape(), below, HIT_SLOP_CSS);
    let mut applied = APPLIED.lock().unwrap();
    if let Some(v) = next_ignore(*applied, inside(rc, cur.0, cur.1), down) {
        if w.set_ignore_cursor_events(v).is_ok() { *applied = Some(v); }
    }
    near_window(cur, (p.x, p.y, s.width as i32, s.height as i32))
}

/// يُنشئ الخيط المركون. لا يعمل شيء والحبة مخفية.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    let h = std::thread::spawn(move || {
        loop {
            if HIDDEN.load(Ordering::Relaxed) { std::thread::park(); continue; }
            let near = tick(&app);
            std::thread::sleep(std::time::Duration::from_millis(interval_ms(near, crate::perf::eco())));
        }
    });
    let _ = THREAD.set(h.thread().clone());
}

#[cfg(test)]
mod tests {
    use super::*;

    // نافذة 800×500 عند (560,0) بمقياس 1؛ حبة 220×34 منتصفًا ⇒ x0=290 داخل النافذة.
    const WIN: (i32, i32, i32) = (560, 0, 800);
    const PILL: (f64, f64, f64) = (220.0, 34.0, 17.0);

    #[test]
    fn rect_floating_center_has_slop_and_below_zone() {
        let r = hit_rect(false, 0, WIN, 1.0, PILL, 0.0, 3.0);
        assert_eq!((r.l, r.t, r.r, r.b, r.rad), (560 + 290 - 3, -3, 560 + 290 + 220 + 3, 34 + 3, 20));
        let z = hit_rect(false, 0, WIN, 1.0, PILL, 24.0, 0.0);
        assert_eq!(z.b, 58, "hoverZone=islandAndBelow يضيف 24px سفلية");
        assert_eq!(hit_rect(false, -1, WIN, 1.0, PILL, 0.0, 0.0).l, 560, "pillPosition=left");
        assert_eq!(hit_rect(false, 1, WIN, 1.0, PILL, 0.0, 0.0).r, 560 + 800, "pillPosition=right");
    }

    #[test]
    fn rect_attached_extends_above_screen_edge() {
        let r = hit_rect(true, 0, WIN, 1.0, PILL, 0.0, 0.0);
        assert_eq!(r.t, -17, "ملتصقة: يمتد فوق الحافة بنصف القطر فتبقى الزاويتان العلويتان خارج الشاشة");
        assert!(inside(r, 560 + 400, 0), "الصف العلوي من الشاشة داخل الجسم (ملاصق لا زاوية مقصوصة)");
        assert!(inside(r, 560 + 290, 0), "الزاوية العلوية اليسرى ملتصقة: مربّعة عند y=0");
    }

    #[test]
    fn rect_scales_with_dpi_and_clamps_bad_input() {
        let r = hit_rect(false, 0, (0, 0, 1200), 1.5, PILL, 0.0, 0.0);
        assert_eq!((r.r - r.l, r.b - r.t, r.rad), (330, 51, 26));
        let bad = hit_rect(false, 0, WIN, 0.0, (f64::NAN, -5.0, 9.0), 0.0, -3.0);
        assert!(bad.r <= bad.l + 1 && bad.b <= bad.t + 1, "مقاس غير صالح ⇒ مستطيل فارغ لا انفجار");
    }

    #[test]
    fn inside_is_a_real_rounded_rect() {
        let r = hit_rect(false, 0, WIN, 1.0, PILL, 0.0, 0.0); // l=850,t=0,r=1070,b=34,rad=17
        assert!(inside(r, 960, 17), "الوسط");
        assert!(inside(r, 850 + 17, 0), "حافة علوية عند بداية الاستقامة");
        assert!(!inside(r, 850, 0), "الزاوية العلوية اليسرى المستديرة خارج");
        assert!(!inside(r, 1069, 33), "الزاوية السفلية اليمنى المستديرة خارج");
        assert!(inside(r, 850, 17), "منتصف الحافة اليسرى (قمة القوس) داخل");
        assert!(!inside(r, 849, 17) && !inside(r, 1070, 17) && !inside(r, 960, 34) && !inside(r, 960, -1), "خارج الأضلاع");
        assert!(!inside(r, 560 + 100, 100), "داخل النافذة الشفافة خارج الجزيرة ⇒ ليس إصابة (يمرّر الماوس)");
    }

    #[test]
    fn toggles_only_on_transitions() {
        assert_eq!(next_ignore(None, false, false), Some(true), "أول تطبيق خارج الجسم ⇒ تجاهل");
        assert_eq!(next_ignore(None, true, false), Some(false), "أول تطبيق داخل الجسم ⇒ لا تجاهل");
        assert_eq!(next_ignore(Some(true), false, false), None, "خارج وما زال خارجًا: لا استدعاء نافذة");
        assert_eq!(next_ignore(Some(false), true, false), None, "داخل وما زال داخلًا: لا استدعاء");
        assert_eq!(next_ignore(Some(true), true, false), Some(false), "دخول ⇒ يُلتقط الماوس");
        assert_eq!(next_ignore(Some(false), false, false), Some(true), "خروج ⇒ تمرير الماوس");
        // سلسلة مؤشر تعبر الجسم: عدد الاستدعاءات = عدد الانتقالات (2) لا عدد العيّنات (6)
        let mut cur = None;
        let mut calls = 0;
        for inside_now in [false, false, true, true, true, false] {
            if let Some(v) = next_ignore(cur, inside_now, false) { cur = Some(v); calls += 1; }
        }
        assert_eq!(calls, 3, "أول تطبيق + دخول + خروج");
        assert_eq!(cur, Some(true));
    }

    #[test]
    fn drag_that_leaves_the_island_keeps_capture() {
        assert_eq!(next_ignore(Some(false), false, true), None, "زر مضغوط أثناء الخروج ⇒ لا تبديل إلى تجاهل");
        assert_eq!(next_ignore(Some(false), false, false), Some(true), "بعد رفع الزر يُبدَّل");
        assert_eq!(next_ignore(Some(true), true, true), Some(false), "الدخول بزر مضغوط مسموح (إسقاط ملفات على الجزيرة)");
    }

    #[test]
    fn polls_fast_near_slow_far_and_halves_in_eco() {
        assert_eq!(interval_ms(true, false), 16);
        assert!(interval_ms(false, false) >= 3 * interval_ms(true, false));
        assert_eq!(interval_ms(true, true), 32);
        let win = (560, 0, 800, 500);
        assert!(near_window((1000, 100), win));
        assert!(near_window((520, -20), win), "ضمن هامش 48px حول النافذة");
        assert!(!near_window((100, 800), win));
    }
}
