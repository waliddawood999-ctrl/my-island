// capture: لقطة منطقة / شاشة كاملة (حسب المخطط §7/capture).
// التدفق: اختصار ⇒ GDI يلتقط الشاشة تحت المؤشر (قبل إظهار الطبقة) ⇒ الصورة المجمّدة تُخزَّن هنا
// وتُعرض في نافذة overlay ⇒ الواجهة ترسل capture_region(x,y,w,h) بالبكسلات الفعلية ⇒ PNG + حافظة.
use serde::Serialize;
use std::{str::FromStr, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::state::AppState;

const OVERLAY: &str = "overlay";
/// مهلة انتظار جاهزية الطبقة (ms) قبل إسقاط اللقطة المعلّقة.
const READY_TIMEOUT_MS: u64 = 3000;

// ───────────────────────── منطق خالص (يُختبر منفصلًا) ─────────────────────────
// BEGIN PURE

/// يقصّ مستطيلًا (قد يكون سالب الأبعاد من السحب العكسي أو خارج الحدود) على حدود صورة w×h.
/// يعيد (x, y, w, h) أو None إن كان الناتج أصغر من 1×1.
pub fn clamp_rect(x: i64, y: i64, w: i64, h: i64, img_w: u32, img_h: u32) -> Option<(u32, u32, u32, u32)> {
    let (x0, x1) = if w < 0 { (x + w, x) } else { (x, x + w) };
    let (y0, y1) = if h < 0 { (y + h, y) } else { (y, y + h) };
    let x0 = x0.clamp(0, img_w as i64);
    let x1 = x1.clamp(0, img_w as i64);
    let y0 = y0.clamp(0, img_h as i64);
    let y1 = y1.clamp(0, img_h as i64);
    if x1 - x0 < 1 || y1 - y0 < 1 {
        return None;
    }
    Some((x0 as u32, y0 as u32, (x1 - x0) as u32, (y1 - y0) as u32))
}

/// اسم الملف: MyIsland_YYYY-MM-DD_HH-MM-SS-mmm.png
pub fn file_name(y: u16, mo: u16, d: u16, h: u16, mi: u16, s: u16, ms: u16) -> String {
    format!("MyIsland_{y:04}-{mo:02}-{d:02}_{h:02}-{mi:02}-{s:02}-{ms:03}.png")
}

/// يختار الشاشة التي تحوي النقطة (px,py) من قائمة (x,y,w,h)؛ وإلا الأولى (None إن لا شاشات).
pub fn monitor_at(rects: &[(i32, i32, u32, u32)], px: i32, py: i32) -> Option<usize> {
    if rects.is_empty() {
        return None;
    }
    rects
        .iter()
        .position(|&(x, y, w, h)| px >= x && py >= y && px < x + w as i32 && py < y + h as i32)
        .or(Some(0))
}

/// BGRA (GDI) ⇒ RGB.
pub fn bgra_to_rgb(src: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(src.len() / 4 * 3);
    for px in src.chunks_exact(4) {
        out.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    out
}
// END PURE

// ───────────────────────── الحالة ─────────────────────────

/// لقطة شاشة مجمّدة (RGB) مع هندسة الشاشة الفعلية.
pub(crate) struct Frame {
    pub(crate) rgb: Vec<u8>,
    pub(crate) w: u32,
    pub(crate) h: u32,
    /// موضع الشاشة الملتقطة على سطح المكتب الافتراضي (بكسلات فعلية).
    pub(crate) x: i32,
    pub(crate) y: i32,
    scale: f64,
    index: usize,
    /// data-URL لـPNG سريع الضغط تعرضه الطبقة.
    data_url: String,
    /// هل طلبت الواجهة الإظهار (capture_ready)؟
    shown: bool,
    id: u64,
    /// غرض الطبقة: "area" (لقطة) · "record" (منطقة تسجيل — 3.3) · "color" (منتقي ألوان — 3.3).
    mode: &'static str,
}

#[derive(Default)]
pub struct CaptureState {
    frame: Mutex<Option<Frame>>,
    area: Mutex<Option<Shortcut>>,
    screen: Mutex<Option<Shortcut>>,
    seq: Mutex<u64>,
    /// يمنع بدء التقاط ثانٍ أثناء الأول.
    busy: Mutex<bool>,
}

#[derive(Serialize, Clone)]
pub struct FrameInfo {
    pub image: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale: f64,
    pub index: usize,
    /// "area" | "record" | "color" — الطبقة تغيّر سلوكها حسبه.
    pub mode: &'static str,
}

#[derive(Serialize, Clone)]
pub struct Saved {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub mode: &'static str,
}

// ───────────────────────── الاختصارات ─────────────────────────

pub(crate) fn setting_str(app: &AppHandle, key: &str) -> String {
    app.state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .get(key)
        .and_then(|v| v.as_str().map(|s| s.trim().to_string()))
        .unwrap_or_default()
}

pub(crate) fn bind(app: &AppHandle, slot: &Mutex<Option<Shortcut>>, key: &str, other: Option<Shortcut>) {
    let want = setting_str(app, key);
    let gs = app.global_shortcut();
    let mut cur = slot.lock().unwrap();
    if let Some(old) = cur.take() {
        let _ = gs.unregister(old);
    }
    if want.is_empty() {
        return;
    }
    match Shortcut::from_str(&want) {
        Ok(sc) if Some(sc) == other => eprintln!("اختصار الالتقاط «{want}» ({key}) مكرّر — أُهمل"),
        Ok(sc) => match gs.register(sc) {
            Ok(()) => *cur = Some(sc),
            Err(e) => eprintln!("تعذّر تسجيل اختصار الالتقاط «{want}» ({key}): {e}"),
        },
        Err(e) => eprintln!("اختصار الالتقاط غير صالح «{want}» ({key}): {e}"),
    }
}

/// يعيد تسجيل hotkeyArea وhotkeyScreen من الإعدادات (فارغ/غير صالح = معطّل).
/// يمكن ضبط أيٍّ منهما على «PrintScreen» لاعتراض زر Print Screen.
pub fn rebind(app: &AppHandle) {
    let st = app.state::<CaptureState>();
    bind(app, &st.area, "hotkeyArea", None);
    let area = *st.area.lock().unwrap();
    bind(app, &st.screen, "hotkeyScreen", area);
}

/// ينفّذ الاختصار إن كان لوحدة الالتقاط؛ يعيد true إذا عالجه.
pub fn on_shortcut(app: &AppHandle, sc: &Shortcut) -> bool {
    let st = app.state::<CaptureState>();
    if st.area.lock().unwrap().as_ref() == Some(sc) {
        start(app, "area");
        return true;
    }
    if st.screen.lock().unwrap().as_ref() == Some(sc) {
        start(app, "screen");
        return true;
    }
    false
}

// ───────────────────────── المجلدات والإعدادات ─────────────────────────

#[cfg(windows)]
fn pictures_dir() -> Option<std::path::PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Pictures, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    unsafe {
        let p = SHGetKnownFolderPath(&FOLDERID_Pictures, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s.map(std::path::PathBuf::from)
    }
    .or_else(|| std::env::var_os("USERPROFILE").map(|u| std::path::PathBuf::from(u).join("Pictures")))
}
#[cfg(not(windows))]
fn pictures_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").map(|u| std::path::PathBuf::from(u).join("Pictures"))
}

/// screenshotDir أو Pictures\MyIsland.
pub(crate) fn screenshot_dir(app: &AppHandle) -> std::path::PathBuf {
    let s = setting_str(app, "screenshotDir");
    if !s.is_empty() {
        return s.into();
    }
    pictures_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join("MyIsland")
}

/// captureVisible: غياب المفتاح = الحبة مستثناة من اللقطات (المخطط §4: الافتراضي).
fn capture_visible(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .get("captureVisible")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// يطبّق captureVisible على الحبة عبر SetWindowDisplayAffinity (WDA_EXCLUDEFROMCAPTURE).
pub fn apply_affinity(app: &AppHandle) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
        };
        if let Some(w) = app.get_webview_window(crate::win::MAIN) {
            if let Ok(h) = w.hwnd() {
                let aff = if capture_visible(app) { WDA_NONE } else { WDA_EXCLUDEFROMCAPTURE };
                unsafe {
                    let _ = SetWindowDisplayAffinity(HWND(h.0), aff);
                }
            }
        }
    }
    #[cfg(not(windows))]
    let _ = app;
}

// ───────────────────────── الالتقاط (GDI) ─────────────────────────

/// يلتقط مستطيلًا بالبكسلات الفعلية من سطح المكتب الافتراضي ⇒ RGB.
#[cfg(windows)]
pub(crate) fn grab_bgra(x: i32, y: i32, w: u32, h: u32) -> Result<Vec<u8>, String> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, SRCCOPY,
    };
    unsafe {
        let screen = GetDC(None);
        if screen.is_invalid() {
            return Err("GetDC فشل".into());
        }
        let mem = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, w as i32, h as i32);
        let old = SelectObject(mem, bmp.into());
        let blt = BitBlt(mem, 0, 0, w as i32, h as i32, Some(screen), x, y, SRCCOPY | CAPTUREBLT);
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w as i32,
                biHeight: -(h as i32), // من الأعلى للأسفل
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buf = vec![0u8; (w as usize) * (h as usize) * 4];
        let lines = GetDIBits(
            mem,
            bmp,
            0,
            h,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );
        SelectObject(mem, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        blt.map_err(|e| format!("BitBlt فشل: {e}"))?;
        if lines == 0 {
            return Err("GetDIBits فشل".into());
        }
        Ok(buf)
    }
}
#[cfg(not(windows))]
pub(crate) fn grab_bgra(_x: i32, _y: i32, _w: u32, _h: u32) -> Result<Vec<u8>, String> {
    Err("الالتقاط يتطلب ويندوز".into())
}

/// كما grab_bgra لكن RGB.
fn grab(x: i32, y: i32, w: u32, h: u32) -> Result<Vec<u8>, String> {
    grab_bgra(x, y, w, h).map(|b| bgra_to_rgb(&b))
}

#[cfg(windows)]
fn cursor_pos() -> (i32, i32) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe {
        let _ = GetCursorPos(&mut p);
    }
    (p.x, p.y)
}
#[cfg(not(windows))]
fn cursor_pos() -> (i32, i32) {
    (0, 0)
}

/// طابع الوقت لأسماء الملفات بامتداد مختلف (التسجيل: mp4/gif).
pub(crate) fn stamp_ext(ext: &str) -> String {
    let s = stamp();
    format!("{}.{ext}", s.trim_end_matches(".png"))
}

#[cfg(windows)]
fn stamp() -> String {
    use windows::Win32::System::SystemInformation::GetLocalTime;
    let t = unsafe { GetLocalTime() };
    file_name(t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, t.wMilliseconds)
}
#[cfg(not(windows))]
fn stamp() -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("MyIsland_{ms}.png")
}

struct Shot {
    rgb: Vec<u8>,
    w: u32,
    h: u32,
    x: i32,
    y: i32,
    scale: f64,
    index: usize,
}

/// يلتقط الشاشة تحت المؤشر (بعد تطبيق captureVisible).
fn grab_monitor(app: &AppHandle) -> Result<Shot, String> {
    apply_affinity(app);
    let mons = app.available_monitors().map_err(|e| e.to_string())?;
    let rects: Vec<_> = mons
        .iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .collect();
    let (cx, cy) = cursor_pos();
    let index = monitor_at(&rects, cx, cy).ok_or("لا شاشات")?;
    let (x, y, w, h) = rects[index];
    let rgb = grab(x, y, w, h)?;
    Ok(Shot { rgb, w, h, x, y, scale: mons[index].scale_factor(), index })
}

pub(crate) fn encode_png(rgb: &[u8], w: u32, h: u32, fast: bool) -> Result<Vec<u8>, String> {
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};
    use image::{ExtendedColorType, ImageEncoder};
    let mut out = Vec::new();
    let (c, f) = if fast {
        (CompressionType::Fast, FilterType::Sub)
    } else {
        (CompressionType::Default, FilterType::Adaptive)
    };
    PngEncoder::new_with_quality(&mut out, c, f)
        .write_image(rgb, w, h, ExtendedColorType::Rgb8)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// يحفظ PNG في screenshotDir وينسخ الصورة للحافظة فورًا. يعيد المسار.
fn save_and_copy(app: &AppHandle, rgb: &[u8], w: u32, h: u32) -> Result<String, String> {
    let dir = screenshot_dir(app);
    std::fs::create_dir_all(&dir).map_err(|e| format!("تعذّر إنشاء {}: {e}", dir.display()))?;
    let path = dir.join(stamp());
    std::fs::write(&path, encode_png(rgb, w, h, false)?).map_err(|e| e.to_string())?;
    copy_to_clipboard(rgb, w, h);
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(windows)]
pub(crate) fn copy_to_clipboard(rgb: &[u8], w: u32, h: u32) {
    let mut rgba = Vec::with_capacity(rgb.len() / 3 * 4);
    for p in rgb.chunks_exact(3) {
        rgba.extend_from_slice(&[p[0], p[1], p[2], 255]);
    }
    match arboard::Clipboard::new() {
        Ok(mut cb) => {
            if let Err(e) = cb.set_image(arboard::ImageData {
                width: w as usize,
                height: h as usize,
                bytes: std::borrow::Cow::Owned(rgba),
            }) {
                eprintln!("تعذّر نسخ اللقطة للحافظة: {e}");
            }
        }
        Err(e) => eprintln!("تعذّر فتح الحافظة: {e}"),
    }
}
#[cfg(not(windows))]
pub(crate) fn copy_to_clipboard(_rgb: &[u8], _w: u32, _h: u32) {}

// ───────────────────────── التدفق ─────────────────────────

pub(crate) fn hide_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(OVERLAY) {
        let _ = w.hide();
    }
    let _ = app.emit_to(OVERLAY, "capture:end", ());
}

pub(crate) fn cancel(app: &AppHandle) {
    finish(app);
}

fn finish(app: &AppHandle) {
    let st = app.state::<CaptureState>();
    *st.frame.lock().unwrap() = None;
    *st.busy.lock().unwrap() = false;
    hide_overlay(app);
}

/// يبدأ الالتقاط: mode = "area" (طبقة تحديد) أو "screen" (حفظ فوري لكامل الشاشة تحت المؤشر).
pub(crate) fn start(app: &AppHandle, mode: &'static str) {
    {
        let st = app.state::<CaptureState>();
        let mut busy = st.busy.lock().unwrap();
        if *busy {
            return;
        }
        *busy = true;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let res = (|| -> Result<(), String> {
            let shot = grab_monitor(&app)?;
            if mode == "screen" {
                let path = save_and_copy(&app, &shot.rgb, shot.w, shot.h)?;
                let _ = app.emit(
                    "capture:saved",
                    Saved { path, width: shot.w, height: shot.h, mode },
                );
                return Ok(());
            }
            let png = encode_png(&shot.rgb, shot.w, shot.h, true)?;
            let data_url = format!(
                "data:image/png;base64,{}",
                base64_encode(&png)
            );
            let st = app.state::<CaptureState>();
            let id = {
                let mut s = st.seq.lock().unwrap();
                *s += 1;
                *s
            };
            *st.frame.lock().unwrap() = Some(Frame {
                rgb: shot.rgb,
                w: shot.w,
                h: shot.h,
                x: shot.x,
                y: shot.y,
                scale: shot.scale,
                index: shot.index,
                data_url,
                shown: false,
                id,
                mode,
            });
            // الطبقة تُوضع على الشاشة الملتقطة بالبكسلات الفعلية (موضع ثم حجم ثم موضع: DPI مختلف لكل شاشة).
            if let Some(w) = app.get_webview_window(OVERLAY) {
                let _ = w.set_position(PhysicalPosition::new(shot.x, shot.y));
                let _ = w.set_size(PhysicalSize::new(shot.w, shot.h));
                let _ = w.set_position(PhysicalPosition::new(shot.x, shot.y));
                let _ = w.set_always_on_top(true);
            }
            let _ = app.emit_to(OVERLAY, "capture:start", id);
            // إن لم تصبح الطبقة جاهزة خلال المهلة نُسقط اللقطة (الصفحة معطّلة).
            let app2 = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(READY_TIMEOUT_MS));
                let st = app2.state::<CaptureState>();
                let stale = st.frame.lock().unwrap().as_ref().map(|f| f.id == id && !f.shown).unwrap_or(false);
                if stale {
                    eprintln!("الطبقة لم تصبح جاهزة خلال {READY_TIMEOUT_MS}ms — أُلغي الالتقاط");
                    finish(&app2);
                }
            });
            Ok(())
        })();
        if let Err(e) = res {
            eprintln!("فشل الالتقاط: {e}");
            finish(&app);
        } else if mode == "screen" {
            *app.state::<CaptureState>().busy.lock().unwrap() = false;
        }
    });
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

// ───────────────────────── الأوامر ─────────────────────────

/// capture_start(mode?: "area"|"screen") — الافتراضي "area".
#[tauri::command]
pub fn capture_start(app: AppHandle, mode: Option<String>) {
    start(&app, if mode.as_deref() == Some("screen") { "screen" } else { "area" });
}

/// اللقطة المجمّدة الحالية (تستدعيه الطبقة بعد capture:start)، أو None.
#[tauri::command]
pub fn capture_frame(state: tauri::State<CaptureState>) -> Option<FrameInfo> {
    state.frame.lock().unwrap().as_ref().map(|f| FrameInfo {
        image: f.data_url.clone(),
        width: f.w,
        height: f.h,
        x: f.x,
        y: f.y,
        scale: f.scale,
        index: f.index,
        mode: f.mode,
    })
}

/// الطبقة رسمت الصورة ⇒ أظهرها وامنحها الفوكس (لتلتقط Esc/Enter).
#[tauri::command]
pub fn capture_ready(app: AppHandle, state: tauri::State<CaptureState>) {
    {
        let mut g = state.frame.lock().unwrap();
        match g.as_mut() {
            Some(f) => f.shown = true,
            None => return,
        }
    }
    if let Some(w) = app.get_webview_window(OVERLAY) {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// يلتقط المنطقة (x,y,w,h بالبكسلات الفعلية نسبةً لزاوية الشاشة الملتقطة) ويحفظ PNG وينسخ للحافظة.
/// يعيد مسار الملف. الطبقة تُخفى قبل المعالجة.
#[tauri::command]
pub async fn capture_region(app: AppHandle, x: i64, y: i64, w: i64, h: i64, edit: Option<bool>) -> Result<String, String> {
    let st = app.state::<CaptureState>();
    if st.frame.lock().unwrap().as_ref().map(|f| f.mode != "area").unwrap_or(false) {
        return Err("الطبقة الحالية ليست للقطة منطقة".into());
    }
    let frame = st.frame.lock().unwrap().take();
    *st.busy.lock().unwrap() = false;
    hide_overlay(&app);
    let Some(f) = frame else { return Err("لا لقطة مجمّدة".into()) };
    let (cx, cy, cw, ch) = clamp_rect(x, y, w, h, f.w, f.h).ok_or("منطقة فارغة")?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut crop = Vec::with_capacity((cw * ch * 3) as usize);
        for row in cy..cy + ch {
            let s = ((row * f.w + cx) * 3) as usize;
            crop.extend_from_slice(&f.rgb[s..s + (cw * 3) as usize]);
        }
        let path = save_and_copy(&app, &crop, cw, ch)?;
        let _ = app.emit("capture:saved", Saved { path: path.clone(), width: cw, height: ch, mode: "area" });
        if edit.unwrap_or(false) {
            crate::editor::open_path(&app, &path);
        }
        Ok(path)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// يستلم اللقطة المجمّدة لغرض `mode` ("record"/"color") ويخفي الطبقة؛ خطأ إن لم يطابق الغرض.
pub(crate) fn take_frame(app: &AppHandle, mode: &str) -> Result<Frame, String> {
    let st = app.state::<CaptureState>();
    let mut g = st.frame.lock().unwrap();
    match g.as_ref() {
        Some(f) if f.mode == mode => {}
        Some(_) => return Err("الطبقة الحالية لغرض آخر".into()),
        None => return Err("لا لقطة مجمّدة".into()),
    }
    let f = g.take().unwrap();
    drop(g);
    *st.busy.lock().unwrap() = false;
    hide_overlay(app);
    Ok(f)
}

/// يلغي الالتقاط: لا حفظ ولا نسخ.
#[tauri::command]
pub fn capture_cancel(app: AppHandle) {
    finish(&app);
}

/// يفتح مجلد اللقطات (يُنشأ إن لم يوجد).
#[tauri::command]
pub fn open_captures(app: AppHandle) -> Result<(), String> {
    let dir = screenshot_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    crate::palette::open_path(app, dir.to_string_lossy().into_owned())
}

/// ضغطة Print Screen (إن مرّرتها أي طبقة أخرى) ⇒ لقطة منطقة، كأن hotkeyArea ضُغط.
/// الاعتراض المباشر اختياري: اضبط hotkeyArea أو hotkeyScreen على «PrintScreen».
#[tauri::command]
pub fn prtsc_taken(app: AppHandle) {
    start(&app, "area");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_basic_and_reverse_drag() {
        assert_eq!(clamp_rect(10, 20, 100, 50, 1920, 1080), Some((10, 20, 100, 50)));
        // سحب من اليمين-الأسفل إلى اليسار-الأعلى
        assert_eq!(clamp_rect(110, 70, -100, -50, 1920, 1080), Some((10, 20, 100, 50)));
    }

    #[test]
    fn clamp_edges_and_empty() {
        assert_eq!(clamp_rect(-5, -5, 20, 20, 100, 100), Some((0, 0, 15, 15)));
        assert_eq!(clamp_rect(90, 90, 50, 50, 100, 100), Some((90, 90, 10, 10)));
        assert_eq!(clamp_rect(10, 10, 0, 5, 100, 100), None);
        assert_eq!(clamp_rect(200, 200, 5, 5, 100, 100), None);
    }

    #[test]
    fn names_and_monitors() {
        assert_eq!(file_name(2026, 1, 2, 3, 4, 5, 6), "MyIsland_2026-01-02_03-04-05-006.png");
        let m = [(0, 0, 1920, 1080), (1920, 0, 2560, 1440), (-1280, 0, 1280, 1024)];
        assert_eq!(monitor_at(&m, 100, 100), Some(0));
        assert_eq!(monitor_at(&m, 2000, 10), Some(1));
        assert_eq!(monitor_at(&m, -10, 5), Some(2));
        assert_eq!(monitor_at(&m, 9999, 9999), Some(0));
        assert_eq!(monitor_at(&[], 0, 0), None);
    }

    #[test]
    fn bgra_swaps_channels() {
        assert_eq!(bgra_to_rgb(&[1, 2, 3, 255, 4, 5, 6, 255]), vec![3, 2, 1, 6, 5, 4]);
    }
}
