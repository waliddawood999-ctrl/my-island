// editor: نافذة محرّر اللقطات (حسب المخطط §7/capture) — الجلسة 3.3.
// الرسم كله في الواجهة (canvas)؛ هذه الوحدة تفتح النافذة، تقرأ الصورة، وتحفظ النتيجة (PNG) + تنسخها للحافظة.
use serde::Serialize;
use std::{path::Path, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub const EDITOR: &str = "editor";

#[derive(Default)]
pub struct EditorState {
    /// مسار الصورة المفتوحة حاليًا (الأصل الذي يستبدله «حفظ فوق الأصل»).
    pending: Mutex<Option<String>>,
}

#[derive(Serialize, Clone)]
pub struct EditorImage {
    pub path: String,
    /// data-URL للصورة الأصلية كما هي.
    pub image: String,
}

// ───────────────────────── منطق خالص (يُختبر منفصلًا) ─────────────────────────
// BEGIN PURE
/// نوع MIME من امتداد الملف (None = ليس صورة يفتحها المحرّر).
pub fn mime_for(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

/// جسم base64 من data-URL لـPNG؛ None لغير ذلك.
pub fn png_payload(data_url: &str) -> Option<&str> {
    data_url.strip_prefix("data:image/png;base64,")
}

/// اسم النسخة المعدّلة: X.png ⇒ X_edit.png (وغير ذلك ⇒ X_edit.png بعد حذف الامتداد).
pub fn edit_name(file_name: &str) -> String {
    let stem = match file_name.rfind('.') {
        Some(i) if i > 0 => &file_name[..i],
        _ => file_name,
    };
    format!("{stem}_edit.png")
}
// END PURE

fn b64_encode(b: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(b)
}

/// أحدث PNG في مجلد اللقطات.
fn newest_capture(app: &AppHandle) -> Option<String> {
    let dir = crate::capture::screenshot_dir(app);
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| e.path().extension().map(|x| x.eq_ignore_ascii_case("png")).unwrap_or(false))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .max_by_key(|(t, _)| *t)
        .map(|(_, p)| p.to_string_lossy().into_owned())
}

/// يفتح نافذة المحرّر على صورة (يُستدعى من اللقطة بـShift ومن editor_open).
pub fn open_path(app: &AppHandle, path: &str) {
    *app.state::<EditorState>().pending.lock().unwrap() = Some(path.to_string());
    // نافذة جديدة تقرأ المعلّق عند تحميلها (editor_image)؛ الموجودة تُبلَّغ بالحدث.
    if let Some((_, false)) = crate::lazywin::open(app, &crate::lazywin::EDITOR) {
        let _ = app.emit_to(EDITOR, "editor:open", path.to_string());
    }
}

/// editor_open(path?) — يفتح المحرّر على `path`، وبدونه على أحدث لقطة في screenshotDir.
#[tauri::command]
pub async fn editor_open(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let path = match path {
        Some(p) if !p.is_empty() => p,
        _ => newest_capture(&app).ok_or("لا لقطات لفتحها")?,
    };
    if mime_for(&path).is_none() {
        return Err("ليست صورة مدعومة".into());
    }
    if !Path::new(&path).is_file() {
        return Err(format!("الملف غير موجود: {path}"));
    }
    open_path(&app, &path);
    Ok(())
}

/// editor_image(path?) — الصورة المفتوحة (أو `path`) كـdata-URL لترسمها نافذة المحرّر.
#[tauri::command]
pub fn editor_image(app: AppHandle, path: Option<String>) -> Result<EditorImage, String> {
    let path = match path {
        Some(p) if !p.is_empty() => p,
        _ => app
            .state::<EditorState>()
            .pending
            .lock()
            .unwrap()
            .clone()
            .ok_or("لا صورة مفتوحة")?,
    };
    let mime = mime_for(&path).ok_or("ليست صورة مدعومة")?;
    let bytes = std::fs::read(&path).map_err(|e| format!("تعذّرت القراءة: {e}"))?;
    Ok(EditorImage { image: format!("data:{mime};base64,{}", b64_encode(&bytes)), path })
}

/// editor_save(data, mode?) — `data` = data-URL لـPNG الناتج؛ mode: "new" (الافتراضي: ملف جديد
/// «…_edit.png» في screenshotDir) أو "overwrite" (فوق الأصل المفتوح). ينسخ النتيجة للحافظة ويعيد المسار.
#[tauri::command]
pub async fn editor_save(app: AppHandle, data: String, mode: Option<String>) -> Result<String, String> {
    use base64::Engine;
    let body = png_payload(&data).ok_or("البيانات ليست PNG")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(body)
        .map_err(|e| format!("base64: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
            .map_err(|e| format!("PNG غير صالح: {e}"))?;
        let original = app.state::<EditorState>().pending.lock().unwrap().clone();
        let overwrite = mode.as_deref() == Some("overwrite");
        let target = match (overwrite, original.as_deref()) {
            // الاستبدال فقط لملف PNG موجود (غير ذلك ⇒ نسخة جديدة كي لا نكتب PNG بامتداد آخر).
            (true, Some(p)) if Path::new(p).is_file() && mime_for(p) == Some("image/png") => p.to_string(),
            _ => {
                let dir = crate::capture::screenshot_dir(&app);
                std::fs::create_dir_all(&dir).map_err(|e| format!("تعذّر إنشاء {}: {e}", dir.display()))?;
                dir.join(edit_name(&crate::capture::stamp_ext("png"))).to_string_lossy().into_owned()
            }
        };
        std::fs::write(&target, &bytes).map_err(|e| e.to_string())?;
        let rgb = img.to_rgb8();
        crate::capture::copy_to_clipboard(rgb.as_raw(), rgb.width(), rgb.height());
        let _ = app.emit("editor:saved", target.clone());
        Ok(target)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mimes() {
        assert_eq!(mime_for("C:\\a\\b.PNG"), Some("image/png"));
        assert_eq!(mime_for("x.jpeg"), Some("image/jpeg"));
        assert_eq!(mime_for("x.txt"), None);
        assert_eq!(mime_for("noext"), None);
    }

    #[test]
    fn payload_and_names() {
        assert_eq!(png_payload("data:image/png;base64,AAA"), Some("AAA"));
        assert_eq!(png_payload("data:image/jpeg;base64,AAA"), None);
        assert_eq!(edit_name("MyIsland_2026.png"), "MyIsland_2026_edit.png");
        assert_eq!(edit_name("photo.jpg"), "photo_edit.png");
        assert_eq!(edit_name("raw"), "raw_edit.png");
    }
}
