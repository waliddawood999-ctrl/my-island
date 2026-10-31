// clipboard: مستمع حافظة ويندوز + تخزين clips في island.db (حسب المخطط §6/§7) — خلفية فقط.
// نص ⇒ kind=text · صورة ⇒ PNG في <بيانات>/clips/ + مصغّر base64 (PNG ≤96px) + الأبعاد.
// البصمة sha256 UNIQUE: التكرار يحدّث created_at فقط فيصعد العنصر للأعلى.
//
// اختبار ذاتي (أمثلة — الدوال النقية أدناه تعمل على أي Connection):
//   let c = Connection::open_in_memory()?; c.execute_batch(include_str!("../schema.sql"))?;
//   insert_text(&c, "مرحبا", None, 100)?; insert_text(&c, "مرحبا", None, 100)?;  // لا يتكرر
//   assert_eq!(list(&c)?.len(), 1);
//   pin(&c, id, true)?; clear(&c)?;  // المثبّت يبقى
//   // الحدّ: insert_text ×5 مع limit=3 ⇒ 3 عناصر (الأقدم غير المثبّت يُحذف)
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// الحدّ الافتراضي إن لم يُضبط clipLimit.
pub const DEFAULT_LIMIT: usize = 200;
const THUMB_MAX: u32 = 96;

#[derive(Serialize, Clone, Debug)]
pub struct Clip {
    pub id: i64,
    pub kind: String,
    pub text: Option<String>,
    pub image_path: Option<String>,
    pub thumb: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub pinned: bool,
    pub source: Option<String>,
    pub created_at: i64,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// طابع زمني يتزايد بصرامة كي يكون الترتيب حتميًا حتى في نفس الميلي ثانية.
fn next_ts(conn: &Connection) -> rusqlite::Result<i64> {
    let max: i64 = conn.query_row("SELECT COALESCE(MAX(created_at),0) FROM clips", [], |r| r.get(0))?;
    Ok(now_ms().max(max + 1))
}

/// الأقدم غير المثبّت يُحذف حتى يصير العدد ≤ limit؛ ملفات صوره تُحذف.
fn enforce_limit(conn: &Connection, limit: usize) -> rusqlite::Result<()> {
    let limit = if limit == 0 { DEFAULT_LIMIT } else { limit };
    loop {
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM clips", [], |r| r.get(0))?;
        if n as usize <= limit {
            return Ok(());
        }
        let victim: Option<(i64, Option<String>)> = conn
            .query_row(
                "SELECT id, image_path FROM clips WHERE pinned=0 ORDER BY created_at ASC, id ASC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let Some((id, path)) = victim else { return Ok(()) }; // الكل مثبّت
        conn.execute("DELETE FROM clips WHERE id=?1", [id])?;
        if let Some(p) = path {
            let _ = std::fs::remove_file(p);
        }
    }
}

/// يخزّن نصًا. true = عنصر جديد، false = مكرّر (رُفع للأعلى فقط).
pub fn insert_text(conn: &Connection, text: &str, source: Option<&str>, limit: usize) -> rusqlite::Result<bool> {
    let hash = hex(&Sha256::digest(text.as_bytes()));
    let ts = next_ts(conn)?;
    let bumped = conn.execute("UPDATE clips SET created_at=?1 WHERE hash=?2", params![ts, hash])?;
    if bumped > 0 {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO clips(kind,text,hash,source,created_at) VALUES('text',?1,?2,?3,?4)",
        params![text, hash, source, ts],
    )?;
    enforce_limit(conn, limit)?;
    Ok(true)
}

/// يخزّن صورة RGBA خام. الصورة تُحفظ PNG في dir/clips/<hash>.png (لا تُكتب إن وُجد التكرار).
pub fn insert_image(
    conn: &Connection,
    dir: &Path,
    width: u32,
    height: u32,
    rgba: &[u8],
    source: Option<&str>,
    limit: usize,
) -> Result<bool, String> {
    let mut h = Sha256::new();
    h.update(width.to_le_bytes());
    h.update(height.to_le_bytes());
    h.update(rgba);
    let hash = hex(&h.finalize());
    let ts = next_ts(conn).map_err(|e| e.to_string())?;
    let bumped = conn
        .execute("UPDATE clips SET created_at=?1 WHERE hash=?2", params![ts, hash])
        .map_err(|e| e.to_string())?;
    if bumped > 0 {
        return Ok(false);
    }
    let img = image::RgbaImage::from_raw(width, height, rgba.to_vec()).ok_or("حجم بكسلات الصورة لا يطابق أبعادها")?;
    let clips_dir = dir.join("clips");
    std::fs::create_dir_all(&clips_dir).map_err(|e| e.to_string())?;
    let path = clips_dir.join(format!("{}.png", &hash[..24]));
    img.save_with_format(&path, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    // مصغّر: PNG ≤96px بعد الحفاظ على النسبة، ثم base64.
    let (tw, th) = if width >= height {
        (THUMB_MAX.min(width), ((height as f64 * THUMB_MAX.min(width) as f64 / width as f64).round() as u32).max(1))
    } else {
        (((width as f64 * THUMB_MAX.min(height) as f64 / height as f64).round() as u32).max(1), THUMB_MAX.min(height))
    };
    let small = image::imageops::thumbnail(&img, tw, th);
    let mut buf = std::io::Cursor::new(Vec::new());
    small.write_to(&mut buf, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    use base64::Engine;
    let thumb_b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    conn.execute(
        "INSERT INTO clips(kind,image_path,thumb,width,height,hash,source,created_at) VALUES('image',?1,?2,?3,?4,?5,?6,?7)",
        params![path.to_string_lossy(), thumb_b64, width, height, hash, source, ts],
    )
    .map_err(|e| e.to_string())?;
    enforce_limit(conn, limit).map_err(|e| e.to_string())?;
    Ok(true)
}

/// المثبّتة أولًا ثم الأحدث.
pub fn list(conn: &Connection) -> rusqlite::Result<Vec<Clip>> {
    let mut st = conn.prepare(
        "SELECT id,kind,text,image_path,thumb,width,height,pinned,source,created_at FROM clips \
         ORDER BY pinned DESC, created_at DESC, id DESC",
    )?;
    let rows = st.query_map([], |r| {
        Ok(Clip {
            id: r.get(0)?,
            kind: r.get(1)?,
            text: r.get(2)?,
            image_path: r.get(3)?,
            thumb: r.get(4)?,
            width: r.get(5)?,
            height: r.get(6)?,
            pinned: r.get::<_, i64>(7)? != 0,
            source: r.get(8)?,
            created_at: r.get(9)?,
        })
    })?;
    rows.collect()
}

pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let path: Option<Option<String>> =
        conn.query_row("SELECT image_path FROM clips WHERE id=?1", [id], |r| r.get(0)).optional()?;
    conn.execute("DELETE FROM clips WHERE id=?1", [id])?;
    if let Some(Some(p)) = path {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

/// يمسح غير المثبّتة (وملفات صورها).
pub fn clear(conn: &Connection) -> rusqlite::Result<()> {
    let mut st = conn.prepare("SELECT image_path FROM clips WHERE pinned=0 AND image_path IS NOT NULL")?;
    let paths: Vec<String> = st.query_map([], |r| r.get(0))?.flatten().collect();
    drop(st);
    conn.execute("DELETE FROM clips WHERE pinned=0", [])?;
    for p in paths {
        let _ = std::fs::remove_file(PathBuf::from(p));
    }
    Ok(())
}

pub fn pin(conn: &Connection, id: i64, pinned: bool) -> rusqlite::Result<()> {
    conn.execute("UPDATE clips SET pinned=?1 WHERE id=?2", params![pinned as i64, id])?;
    Ok(())
}

/// هل اسم العملية ضمن clipExcludedApps؟ (غير حساس للحالة، مع/بدون .exe)
pub fn is_excluded(source: &str, excluded: &[String]) -> bool {
    let norm = |s: &str| s.trim().to_lowercase().trim_end_matches(".exe").to_string();
    let src = norm(source);
    !src.is_empty() && excluded.iter().any(|e| !norm(e).is_empty() && norm(e) == src)
}

// ==== طبقة Tauri + ويندوز (لا اختبار وحدة لها خارج ويندوز) ====

use crate::state::AppState;
use tauri::{AppHandle, Manager, State};

fn limit_from(state: &AppState) -> usize {
    state
        .settings
        .lock()
        .unwrap()
        .get("clipLimit")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_LIMIT)
}

fn excluded_from(state: &AppState) -> Vec<String> {
    state
        .settings
        .lock()
        .unwrap()
        .get("clipExcludedApps")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

fn with_db<T>(state: &AppState, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let g = state.db.lock().unwrap();
    let conn = g.as_ref().ok_or("قاعدة البيانات غير متاحة")?;
    f(conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clip_list(state: State<AppState>) -> Result<Vec<Clip>, String> {
    with_db(&state, list)
}

#[tauri::command]
pub fn clip_delete(state: State<AppState>, id: i64) -> Result<(), String> {
    with_db(&state, |c| delete(c, id))
}

#[tauri::command]
pub fn clip_clear(state: State<AppState>) -> Result<(), String> {
    with_db(&state, clear)
}

#[tauri::command]
pub fn clip_pin(state: State<AppState>, id: i64, pinned: bool) -> Result<(), String> {
    with_db(&state, |c| pin(c, id, pinned))
}

/// النص الحالي في حافظة ويندوز (None إن لم يكن نصًا).
#[tauri::command]
pub fn clip_current_text() -> Option<String> {
    #[cfg(windows)]
    {
        arboard::Clipboard::new().ok()?.get_text().ok()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// يضع نصًا في حافظة ويندوز بلا لصق (نسخ نتيجة/RGB من الإجراءات الذكية). يمرّ عبر المستمع كأي نسخ فيظهر في السجل.
#[tauri::command]
pub fn clip_set_text(text: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let mut last = String::new();
        for _ in 0..6 {
            match arboard::Clipboard::new().and_then(|mut cb| cb.set_text(text.clone())) {
                Ok(()) => return Ok(()),
                Err(e) => last = e.to_string(),
            }
            std::thread::sleep(std::time::Duration::from_millis(40));
        }
        Err(last)
    }
    #[cfg(not(windows))]
    {
        let _ = text;
        Err("النسخ متاح على ويندوز فقط".into())
    }
}

/// يضع عنصرًا في حافظة ويندوز ثم (إن كانت pasteOnClick مفعّلة، والافتراضي مفعّلة) يلصقه في
/// آخر نافذة تطبيق سابقة بـCtrl+V. يعيد "pasted" أو "clipboard" (بقي في الحافظة فقط:
/// pasteOnClick معطّلة أو الهدف يعمل كمسؤول أو لا نافذة سابقة) — الواجهة تعرض تلميح «لُصق في الحافظة».
#[tauri::command]
pub fn clip_paste(app: AppHandle, state: State<AppState>, id: i64) -> Result<String, String> {
    let c = with_db(&state, |conn| {
        list(conn).map(|v| v.into_iter().find(|c| c.id == id))
    })?
    .ok_or("العنصر غير موجود")?;
    #[cfg(windows)]
    {
        set_windows_clipboard(&c)?;
        let paste = state
            .settings
            .lock()
            .unwrap()
            .get("pasteOnClick")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        if paste && crate::win::paste_into_previous(&app) {
            return Ok("pasted".into());
        }
        Ok("clipboard".into())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, c);
        Err("اللصق متاح على ويندوز فقط".into())
    }
}

#[cfg(windows)]
fn set_windows_clipboard(c: &Clip) -> Result<(), String> {
    let mut last = String::new();
    for _ in 0..6 {
        let r = (|| -> Result<(), String> {
            let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
            match c.kind.as_str() {
                "text" => cb.set_text(c.text.clone().unwrap_or_default()).map_err(|e| e.to_string()),
                "image" => {
                    let path = c.image_path.as_ref().ok_or("مسار الصورة مفقود")?;
                    let img = image::open(path).map_err(|e| e.to_string())?.to_rgba8();
                    cb.set_image(arboard::ImageData {
                        width: img.width() as usize,
                        height: img.height() as usize,
                        bytes: std::borrow::Cow::Owned(img.into_raw()),
                    })
                    .map_err(|e| e.to_string())
                }
                k => Err(format!("نوع غير مدعوم للصق: {k}")),
            }
        })();
        match r {
            Ok(()) => return Ok(()),
            Err(e) => last = e,
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    }
    Err(last)
}

/// وضع التوفير: تأخير معالجة تغيّر الحافظة (ms).
pub const ECO_CLIP_DELAY_MS: u64 = 1000;

/// يبدأ مستمع الحافظة في خيط مستقل (ويندوز فقط).
pub fn start(app: &AppHandle) {
    #[cfg(windows)]
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let r = clipboard_master::Master::new(win_impl::Handler { app }).and_then(|mut m| m.run());
            if let Err(e) = r {
                eprintln!("مستمع الحافظة توقّف: {e}");
            }
        });
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod win_impl {
    use super::*;
    use clipboard_master::{CallbackResult, ClipboardHandler};
    use windows::core::{w, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HGLOBAL};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    pub struct Handler {
        pub app: AppHandle,
    }

    impl ClipboardHandler for Handler {
        fn on_clipboard_change(&mut self) -> CallbackResult {
            // وضع التوفير: رصد أبطأ — نمهل الحدث ثانية فتُقرأ آخر حالة مرة واحدة بدل كل تغيّر متتابع.
            if crate::perf::eco() {
                std::thread::sleep(std::time::Duration::from_millis(ECO_CLIP_DELAY_MS));
            }
            capture(&self.app);
            CallbackResult::Next
        }
        fn on_clipboard_error(&mut self, e: std::io::Error) -> CallbackResult {
            eprintln!("خطأ مستمع الحافظة: {e}");
            CallbackResult::Next
        }
    }

    /// نسخ مُعلَّم من ويندوز بالاستثناء (مديرو كلمات المرور).
    fn flagged_private() -> bool {
        unsafe {
            let ex = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
            if ex != 0 && IsClipboardFormatAvailable(ex).is_ok() {
                return true;
            }
            let ci = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
            if ci != 0 && IsClipboardFormatAvailable(ci).is_ok() && OpenClipboard(None).is_ok() {
                let mut deny = false;
                if let Ok(h) = GetClipboardData(ci) {
                    let g = HGLOBAL(h.0);
                    if GlobalSize(g) >= 4 {
                        let p = GlobalLock(g);
                        if !p.is_null() {
                            deny = *(p as *const u32) == 0; // DWORD 0 = لا تُدرَج في السجل
                            let _ = GlobalUnlock(g);
                        }
                    }
                }
                let _ = CloseClipboard();
                return deny;
            }
        }
        false
    }

    /// اسم ملف عملية النافذة الأمامية وقت النسخ (مثل "notepad.exe").
    fn foreground_process() -> Option<String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(h);
            r.ok()?;
            let full = String::from_utf16_lossy(&buf[..len as usize]);
            full.rsplit(['\\', '/']).next().map(str::to_string)
        }
    }

    enum Content {
        Text(String),
        Image(usize, usize, Vec<u8>),
    }

    /// قراءة بإعادة محاولة قصيرة (التطبيق المصدر قد يقفل الحافظة لحظات).
    fn read_content() -> Option<Content> {
        for _ in 0..6 {
            if let Ok(mut cb) = arboard::Clipboard::new() {
                if let Ok(t) = cb.get_text() {
                    if !t.trim().is_empty() {
                        return Some(Content::Text(t));
                    }
                }
                if let Ok(img) = cb.get_image() {
                    return Some(Content::Image(img.width, img.height, img.bytes.into_owned()));
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(40));
        }
        None
    }

    fn capture(app: &AppHandle) {
        if flagged_private() {
            return;
        }
        let state = app.state::<AppState>();
        let source = foreground_process();
        if let Some(s) = &source {
            if is_excluded(s, &excluded_from(&state)) {
                return;
            }
        }
        let Some(content) = read_content() else { return };
        let limit = limit_from(&state);
        let dir = state.data_dir.lock().unwrap().clone();
        let g = state.db.lock().unwrap();
        let Some(conn) = g.as_ref() else { return };
        let res = match content {
            Content::Text(t) => insert_text(conn, &t, source.as_deref(), limit).map_err(|e| e.to_string()),
            Content::Image(w, h, bytes) => match dir {
                Some(d) => insert_image(conn, &d, w as u32, h as u32, &bytes, source.as_deref(), limit),
                None => Err("مجلد البيانات غير متاح".into()),
            },
        };
        if let Err(e) = res {
            eprintln!("تعذّر تخزين عنصر الحافظة: {e}");
        }
    }
}
