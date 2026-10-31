// shelf: «الرفّ» — منطقة إسقاط مؤقتة للملفات/المجلدات/النص/صور الحافظة (حسب المخطط §7/shelf).
// الجدول shelf من schema.sql بلا تعديل: `path` = مسار الملف/المجلد (أو ملف داخل <بيانات>/shelf/ للنص
// وصور الحافظة التي ننسخها نحن)، و`icon` = النوع: file | dir | text | image، و`name` = الاسم المعروض.
// السحب إلى الداخل: أحداث tauri://drag-* في الواجهة ⇒ shelf_add. السحب إلى الخارج: OLE أصلي (DoDragDrop
// بكائن بيانات الصدفة CF_HDROP وتأثير COPY فقط كي لا تُنقل الأصول من مكانها).
//
// اختبار ذاتي للجزء النقي (فوق خط «طبقة Tauri»): يعمل على أي Connection في الذاكرة.
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// مجلد الملفات التي ننشئها نحن (نص/صور حافظة) داخل مجلد البيانات.
pub const SHELF_DIR: &str = "shelf";
const THUMB_MAX: u32 = 96;
/// لا نفكّ صورًا أكبر من هذا للمصغّر.
const THUMB_FILE_LIMIT: u64 = 40 * 1024 * 1024;
const PREVIEW_BYTES: usize = 400;

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub kind: String,
    pub created_at: i64,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// طابع يتزايد بصرامة ⇒ ترتيب زمني حتمي حتى في نفس الميلي ثانية.
fn next_ts(conn: &Connection) -> rusqlite::Result<i64> {
    let max: i64 = conn.query_row("SELECT COALESCE(MAX(created_at),0) FROM shelf", [], |r| r.get(0))?;
    Ok(now_ms().max(max + 1))
}

const IMAGE_EXT: [&str; 7] = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico"];

pub fn is_image_path(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// نوع المسار: dir | image | file.
pub fn kind_of(p: &Path) -> &'static str {
    if p.is_dir() {
        "dir"
    } else if is_image_path(p) {
        "image"
    } else {
        "file"
    }
}

/// الاسم المعروض لمسار (الاسم الأخير أو المسار نفسه لجذر قرص).
pub fn name_of(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.to_string_lossy().into_owned())
}

/// اسم عنصر نصي: أول سطر غير فارغ، مقصوص ≤ 40 حرفًا.
pub fn text_name(text: &str) -> String {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let mut s: String = line.chars().take(40).collect();
    if line.chars().count() > 40 {
        s.push('…');
    }
    if s.is_empty() { "نص".into() } else { s }
}

/// إزالة بادئة \\?\ التي يضيفها ويندوز أحيانًا.
pub fn clean_path(s: &str) -> String {
    s.strip_prefix(r"\\?\").unwrap_or(s).to_string()
}

/// يضيف عنصرًا؛ المسار المكرّر (غير حساس لحالة الأحرف) يرتفع للأعلى فقط. يعيد (id, جديد؟).
pub fn add(conn: &Connection, path: &str, kind: &str, name: &str) -> rusqlite::Result<(i64, bool)> {
    let ts = next_ts(conn)?;
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM shelf WHERE lower(path)=lower(?1) LIMIT 1", [path], |r| r.get(0))
        .optional()?;
    if let Some(id) = existing {
        conn.execute("UPDATE shelf SET created_at=?1 WHERE id=?2", params![ts, id])?;
        return Ok((id, false));
    }
    conn.execute(
        "INSERT INTO shelf(path,name,icon,created_at) VALUES(?1,?2,?3,?4)",
        params![path, name, kind, ts],
    )?;
    Ok((conn.last_insert_rowid(), true))
}

/// الأحدث أولًا.
pub fn list_rows(conn: &Connection) -> rusqlite::Result<Vec<Row>> {
    let mut st = conn.prepare(
        "SELECT id,path,COALESCE(name,''),COALESCE(icon,'file'),created_at FROM shelf ORDER BY created_at DESC, id DESC",
    )?;
    let rows = st.query_map([], |r| {
        Ok(Row { id: r.get(0)?, path: r.get(1)?, name: r.get(2)?, kind: r.get(3)?, created_at: r.get(4)? })
    })?;
    rows.collect()
}

pub fn get_row(conn: &Connection, id: i64) -> rusqlite::Result<Option<Row>> {
    Ok(list_rows(conn)?.into_iter().find(|r| r.id == id))
}

/// يحذف الصف ويعيد مساره (لحذف الملف إن كان ملكنا).
pub fn remove(conn: &Connection, id: i64) -> rusqlite::Result<Option<String>> {
    let path: Option<String> = conn.query_row("SELECT path FROM shelf WHERE id=?1", [id], |r| r.get(0)).optional()?;
    conn.execute("DELETE FROM shelf WHERE id=?1", [id])?;
    Ok(path)
}

/// يفرّغ الكل ويعيد المسارات.
pub fn clear(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut st = conn.prepare("SELECT path FROM shelf")?;
    let paths: Vec<String> = st.query_map([], |r| r.get(0))?.flatten().collect();
    drop(st);
    conn.execute("DELETE FROM shelf", [])?;
    Ok(paths)
}

pub fn count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM shelf", [], |r| r.get(0))
}

/// هل الملف داخل <بيانات>/shelf (أي ننشئه نحن ويُحذف معه)؟
pub fn is_owned(data_dir: &Path, p: &Path) -> bool {
    p.starts_with(data_dir.join(SHELF_DIR))
}

/// يحذف الملف إن كان ملكنا فقط — ملفات المستخدم الأصلية لا تُمسّ أبدًا.
pub fn cleanup_owned(data_dir: &Path, paths: &[String]) {
    for p in paths {
        let p = Path::new(p);
        if is_owned(data_dir, p) {
            let _ = std::fs::remove_file(p);
        }
    }
}

/// مصغّر PNG ≤96px (base64) لصورة على القرص، أو None إن تعذّر/كبرت.
pub fn make_thumb(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > THUMB_FILE_LIMIT {
        return None;
    }
    let img = image::ImageReader::open(path).ok()?.with_guessed_format().ok()?.decode().ok()?.to_rgba8();
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 {
        return None;
    }
    let scale = (THUMB_MAX as f64 / w.max(h) as f64).min(1.0);
    let (tw, th) = (((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1));
    let small = image::imageops::thumbnail(&img, tw, th);
    let mut buf = std::io::Cursor::new(Vec::new());
    small.write_to(&mut buf, image::ImageFormat::Png).ok()?;
    use base64::Engine;
    Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}

/// أول ~400 بايت من ملف نصي كمعاينة.
pub fn text_preview(path: &Path) -> Option<String> {
    use std::io::Read;
    let mut buf = vec![0u8; PREVIEW_BYTES];
    let n = std::fs::File::open(path).ok()?.read(&mut buf).ok()?;
    buf.truncate(n);
    Some(String::from_utf8_lossy(&buf).into_owned())
}

/// اسم ملف جديد داخل مجلد الرفّ (طابع + عدّاد) بالامتداد المطلوب.
pub fn owned_file_name(ts: i64, ext: &str) -> String {
    format!("{ts}.{ext}")
}

// ==== طبقة Tauri + ويندوز ====

use crate::state::AppState;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// ذاكرة المصغّرات: المسار ⇒ (بصمة mtime+الحجم، المصغّر).
#[derive(Default)]
pub struct ShelfState {
    thumbs: Mutex<HashMap<String, (u128, Option<String>)>>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ShelfItem {
    pub id: i64,
    pub path: String,
    pub name: String,
    /// file | dir | text | image
    pub kind: String,
    /// الحجم بالبايت (ملفات فقط؛ المجلد null).
    pub size: Option<u64>,
    /// الملف/المجلد لم يعد موجودًا على القرص.
    pub missing: bool,
    /// مصغّر PNG base64 للصور.
    pub thumb: Option<String>,
    /// أول سطور النص لعناصر text.
    pub preview: Option<String>,
    pub created_at: i64,
}

fn with_db<T>(state: &AppState, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let g = state.db.lock().unwrap();
    let conn = g.as_ref().ok_or("قاعدة البيانات غير متاحة")?;
    f(conn).map_err(|e| e.to_string())
}

fn data_dir(state: &AppState) -> Result<PathBuf, String> {
    state.data_dir.lock().unwrap().clone().ok_or_else(|| "مجلد البيانات غير متاح".to_string())
}

fn shelf_dir(state: &AppState) -> Result<PathBuf, String> {
    let d = data_dir(state)?.join(SHELF_DIR);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn build_item(shelf: &ShelfState, row: Row) -> ShelfItem {
    let p = Path::new(&row.path);
    let meta = std::fs::metadata(p).ok();
    let missing = meta.is_none();
    let size = meta.as_ref().filter(|m| m.is_file()).map(|m| m.len());
    let mut thumb = None;
    if row.kind == "image" && !missing {
        let stamp = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0)
            ^ ((size.unwrap_or(0) as u128) << 64);
        let mut cache = shelf.thumbs.lock().unwrap();
        match cache.get(&row.path) {
            Some((s, t)) if *s == stamp => thumb = t.clone(),
            _ => {
                thumb = make_thumb(p);
                cache.insert(row.path.clone(), (stamp, thumb.clone()));
            }
        }
    }
    let preview = if row.kind == "text" && !missing { text_preview(p) } else { None };
    ShelfItem {
        id: row.id,
        path: row.path,
        name: row.name,
        kind: row.kind,
        size,
        missing,
        thumb,
        preview,
        created_at: row.created_at,
    }
}

fn items_of(app: &AppHandle, ids: Option<&[i64]>) -> Result<Vec<ShelfItem>, String> {
    let state = app.state::<AppState>();
    let shelf = app.state::<ShelfState>();
    let rows = with_db(&state, list_rows)?;
    Ok(rows
        .into_iter()
        .filter(|r| ids.map_or(true, |ids| ids.contains(&r.id)))
        .map(|r| build_item(&shelf, r))
        .collect())
}

fn changed(app: &AppHandle) {
    let n = with_db(&app.state::<AppState>(), count).unwrap_or(0);
    let _ = app.emit("shelf:changed", n);
}

/// shelf_list() → عناصر الرفّ الأحدث أولًا (مع مصغّرات الصور ومعاينة النص).
#[tauri::command]
pub async fn shelf_list(app: AppHandle) -> Result<Vec<ShelfItem>, String> {
    items_of(&app, None)
}

fn add_paths(state: &AppState, paths: &[String]) -> Result<Vec<i64>, String> {
    let mut ids = Vec::new();
    for raw in paths {
        let p = PathBuf::from(clean_path(raw.trim()));
        if !p.exists() {
            continue;
        }
        let s = p.to_string_lossy().into_owned();
        let (id, _) = with_db(state, |c| add(c, &s, kind_of(&p), &name_of(&p)))?;
        ids.push(id);
    }
    Ok(ids)
}

fn add_text(state: &AppState, text: &str) -> Result<i64, String> {
    let ts = now_ms();
    let file = shelf_dir(state)?.join(owned_file_name(ts, "txt"));
    std::fs::write(&file, text).map_err(|e| e.to_string())?;
    let s = file.to_string_lossy().into_owned();
    Ok(with_db(state, |c| add(c, &s, "text", &text_name(text)))?.0)
}

#[cfg(windows)]
fn add_image_rgba(state: &AppState, w: u32, h: u32, rgba: Vec<u8>) -> Result<i64, String> {
    let ts = now_ms();
    let img = image::RgbaImage::from_raw(w, h, rgba).ok_or("حجم بكسلات الصورة لا يطابق أبعادها")?;
    let file = shelf_dir(state)?.join(owned_file_name(ts, "png"));
    img.save_with_format(&file, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    let s = file.to_string_lossy().into_owned();
    Ok(with_db(state, |c| add(c, &s, "image", &format!("image-{ts}.png")))?.0)
}

/// من حافظة ويندوز: ملفات منسوخة ⇒ مساراتها، وإلا صورة ⇒ ملف PNG عندنا، وإلا نص.
#[cfg(windows)]
fn add_from_clipboard(state: &AppState) -> Result<Vec<i64>, String> {
    let mut last = String::from("الحافظة فارغة");
    for _ in 0..5 {
        let mut cb = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                last = e.to_string();
                std::thread::sleep(std::time::Duration::from_millis(40));
                continue;
            }
        };
        if let Ok(files) = cb.get().file_list() {
            let paths: Vec<String> = files.iter().map(|p| p.to_string_lossy().into_owned()).collect();
            let ids = add_paths(state, &paths)?;
            if !ids.is_empty() {
                return Ok(ids);
            }
        }
        if let Ok(img) = cb.get_image() {
            return Ok(vec![add_image_rgba(state, img.width as u32, img.height as u32, img.bytes.into_owned())?]);
        }
        if let Ok(t) = cb.get_text() {
            if !t.trim().is_empty() {
                return Ok(vec![add_text(state, &t)?]);
            }
        }
        last = "الحافظة لا تحوي ملفات أو صورة أو نصًا".into();
        break;
    }
    Err(last)
}

/// shelf_add(paths?, text?, clipboard?) → العناصر المضافة (أو التي ارتفعت إن كانت مكرّرة).
/// `paths`: ملفات/مجلدات (من إفلات المستكشف) · `text`: نص حر · `clipboard=true`: ما في حافظة ويندوز الآن.
#[tauri::command]
pub async fn shelf_add(
    app: AppHandle,
    paths: Option<Vec<String>>,
    text: Option<String>,
    clipboard: Option<bool>,
) -> Result<Vec<ShelfItem>, String> {
    let state = app.state::<AppState>();
    let mut ids = Vec::new();
    if let Some(p) = paths.as_ref() {
        ids.extend(add_paths(&state, p)?);
    }
    if let Some(t) = text.as_ref().filter(|t| !t.trim().is_empty()) {
        ids.push(add_text(&state, t)?);
    }
    if clipboard.unwrap_or(false) {
        #[cfg(windows)]
        ids.extend(add_from_clipboard(&state)?);
        #[cfg(not(windows))]
        return Err("الحافظة متاحة على ويندوز فقط".into());
    }
    let out = items_of(&app, Some(&ids))?;
    changed(&app);
    Ok(out)
}

/// shelf_remove(id) — يزيل العنصر (وملفه إن كان ملكنا؛ الأصل لا يُمسّ).
#[tauri::command]
pub fn shelf_remove(app: AppHandle, id: i64) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(p) = with_db(&state, |c| remove(c, id))? {
        cleanup_owned(&data_dir(&state)?, &[p]);
    }
    changed(&app);
    Ok(())
}

/// shelf_clear() — يفرّغ الرفّ كله.
#[tauri::command]
pub fn shelf_clear(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let paths = with_db(&state, clear)?;
    cleanup_owned(&data_dir(&state)?, &paths);
    changed(&app);
    Ok(())
}

fn row_of(app: &AppHandle, id: i64) -> Result<Row, String> {
    with_db(&app.state::<AppState>(), |c| get_row(c, id))?.ok_or_else(|| "العنصر غير موجود".to_string())
}

/// shelf_copy(id, mode?) — mode: "item" (افتراضي: النص نصًا، صورة الحافظة صورة، وغيرها كملف يلصق في المستكشف)
/// أو "path" (المسار نصًا).
#[tauri::command]
pub fn shelf_copy(app: AppHandle, id: i64, mode: Option<String>) -> Result<(), String> {
    let row = row_of(&app, id)?;
    let path = PathBuf::from(&row.path);
    if !path.exists() {
        return Err("الملف لم يعد موجودًا".into());
    }
    #[cfg(windows)]
    {
        let state = app.state::<AppState>();
        let owned = is_owned(&data_dir(&state)?, &path);
        if mode.as_deref() == Some("path") {
            return clipboard_text(&row.path);
        }
        match row.kind.as_str() {
            "text" => clipboard_text(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?),
            "image" if owned => {
                let img = image::open(&path).map_err(|e| e.to_string())?.to_rgba8();
                retry_clipboard(|cb| {
                    cb.set_image(arboard::ImageData {
                        width: img.width() as usize,
                        height: img.height() as usize,
                        bytes: std::borrow::Cow::Borrowed(img.as_raw()),
                    })
                })
            }
            _ => ole::copy_files(&app, vec![path]),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (mode, path);
        Err("النسخ متاح على ويندوز فقط".into())
    }
}

#[cfg(windows)]
fn retry_clipboard(mut f: impl FnMut(&mut arboard::Clipboard) -> Result<(), arboard::Error>) -> Result<(), String> {
    let mut last = String::new();
    for _ in 0..6 {
        match arboard::Clipboard::new().map_err(|e| e.to_string()).and_then(|mut cb| f(&mut cb).map_err(|e| e.to_string())) {
            Ok(()) => return Ok(()),
            Err(e) => last = e,
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    }
    Err(last)
}

#[cfg(windows)]
fn clipboard_text(t: &str) -> Result<(), String> {
    retry_clipboard(|cb| cb.set_text(t.to_string()))
}

/// shelf_drag(ids) — يبدأ سحبًا أصليًا (OLE) للعناصر نحو أي تطبيق/مجلد؛ تأثير COPY فقط.
/// تستدعيه الواجهة حين يتحرك المؤشر وهو مضغوط فوق عنصر. يعود فورًا؛ `shelf:drag-end` (payload: "copy"|"cancel")
/// يُبثّ عند انتهاء السحب.
#[tauri::command]
pub fn shelf_drag(app: AppHandle, ids: Vec<i64>) -> Result<(), String> {
    let rows = with_db(&app.state::<AppState>(), list_rows)?;
    let paths: Vec<PathBuf> = rows
        .into_iter()
        .filter(|r| ids.contains(&r.id))
        .map(|r| PathBuf::from(r.path))
        .filter(|p| p.exists())
        .collect();
    if paths.is_empty() {
        return Err("لا عناصر صالحة للسحب".into());
    }
    #[cfg(windows)]
    {
        ole::start_drag(&app, paths)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, paths);
        Err("السحب متاح على ويندوز فقط".into())
    }
}

#[cfg(windows)]
mod ole {
    //! كائن بيانات الصدفة (CF_HDROP + IDList) + مصدر إسقاط بسيط. كل شيء على خيط الواجهة الرئيسي
    //! (STA): DoDragDrop وOleSetClipboard يحتاجان خيطًا بحلقة رسائل.
    use std::path::PathBuf;
    use std::sync::mpsc;
    use tauri::{AppHandle, Emitter};
    use windows::core::{implement, BOOL, HRESULT, PCWSTR};
    use windows::Win32::Foundation::{DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS, S_OK};
    use windows::Win32::System::Com::{CoTaskMemFree, IDataObject};
    use windows::Win32::System::Ole::{
        DoDragDrop, IDropSource, IDropSource_Impl, OleFlushClipboard, OleInitialize, OleSetClipboard, DROPEFFECT,
        DROPEFFECT_COPY, DROPEFFECT_NONE,
    };
    use windows::Win32::System::SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS};
    use windows::Win32::UI::Shell::Common::ITEMIDLIST;
    use windows::Win32::UI::Shell::{SHCreateDataObject, SHParseDisplayName};

    #[implement(IDropSource)]
    struct DropSource;

    #[allow(non_snake_case)]
    impl IDropSource_Impl for DropSource_Impl {
        fn QueryContinueDrag(&self, fescapepressed: BOOL, grfkeystate: MODIFIERKEYS_FLAGS) -> HRESULT {
            if fescapepressed.as_bool() {
                DRAGDROP_S_CANCEL
            } else if grfkeystate.0 & MK_LBUTTON.0 == 0 {
                DRAGDROP_S_DROP
            } else {
                S_OK
            }
        }
        fn GiveFeedback(&self, _effect: DROPEFFECT) -> HRESULT {
            DRAGDROP_S_USEDEFAULTCURSORS
        }
    }

    fn data_object(paths: &[PathBuf]) -> Result<IDataObject, String> {
        let mut pidls: Vec<*mut ITEMIDLIST> = Vec::new();
        for p in paths {
            let w: Vec<u16> = p.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect();
            let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
            unsafe { SHParseDisplayName(PCWSTR(w.as_ptr()), None, &mut pidl, 0, None) }
                .map_err(|e| format!("SHParseDisplayName: {e}"))?;
            pidls.push(pidl);
        }
        let consts: Vec<*const ITEMIDLIST> = pidls.iter().map(|p| *p as *const ITEMIDLIST).collect();
        let r: windows::core::Result<IDataObject> = unsafe { SHCreateDataObject(None, Some(&consts), None) };
        for p in pidls {
            unsafe { CoTaskMemFree(Some(p as *const _)) };
        }
        r.map_err(|e| format!("SHCreateDataObject: {e}"))
    }

    /// يشغّل f على الخيط الرئيسي وينتظر نتيجته.
    fn on_main<T: Send + 'static>(app: &AppHandle, f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
        let (tx, rx) = mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(f());
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(5)).map_err(|_| "انتهت مهلة الخيط الرئيسي".to_string())
    }

    pub fn copy_files(app: &AppHandle, paths: Vec<PathBuf>) -> Result<(), String> {
        on_main(app, move || {
            unsafe {
                let _ = OleInitialize(None);
            }
            let obj = data_object(&paths)?;
            unsafe { OleSetClipboard(&obj) }.map_err(|e| format!("OleSetClipboard: {e}"))?;
            // يُبقي البيانات في الحافظة بعد خروجنا من الخيط.
            let _ = unsafe { OleFlushClipboard() };
            Ok(())
        })?
    }

    /// لا ننتظر انتهاء السحب: الحلقة الأصلية تعمل على الخيط الرئيسي بعد عودة الأمر.
    pub fn start_drag(app: &AppHandle, paths: Vec<PathBuf>) -> Result<(), String> {
        let handle = app.clone();
        app.run_on_main_thread(move || {
            unsafe {
                let _ = OleInitialize(None);
            }
            let outcome = data_object(&paths).and_then(|obj| {
                let src: IDropSource = DropSource.into();
                let mut effect = DROPEFFECT_NONE;
                let hr = unsafe { DoDragDrop(&obj, &src, DROPEFFECT_COPY, &mut effect) };
                if hr == DRAGDROP_S_DROP && effect != DROPEFFECT_NONE { Ok("copy") } else { Ok("cancel") }
            });
            let _ = handle.emit("shelf:drag-end", outcome.unwrap_or("cancel"));
        })
        .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(include_str!("../schema.sql")).unwrap();
        c
    }

    #[test]
    fn add_list_order_dedupe_and_persist() {
        let c = db();
        let (a, new_a) = add(&c, "C:\\a.txt", "file", "a.txt").unwrap();
        let (b, _) = add(&c, "C:\\b.png", "image", "b.png").unwrap();
        let (_, new_dup) = add(&c, "c:\\A.TXT", "file", "a.txt").unwrap(); // نفس المسار بحالة مختلفة
        assert!(new_a && !new_dup);
        assert_eq!(count(&c).unwrap(), 2);
        // التكرار رفع a للأعلى
        let rows = list_rows(&c).unwrap();
        assert_eq!(rows.iter().map(|r| r.id).collect::<Vec<_>>(), vec![a, b]);
        assert_eq!(rows[0].kind, "file");
    }

    #[test]
    fn persists_across_reopen_and_clear_remove() {
        let dir = std::env::temp_dir().join(format!("shelf-test-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("island.db");
        {
            let c = Connection::open(&file).unwrap();
            c.execute_batch(include_str!("../schema.sql")).unwrap();
            for n in ["1", "2", "3"] {
                add(&c, &format!("/x/{n}"), "file", n).unwrap();
            }
        }
        let c = Connection::open(&file).unwrap(); // «إعادة تشغيل»
        let rows = list_rows(&c).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].name, "3");
        assert_eq!(remove(&c, rows[1].id).unwrap().as_deref(), Some("/x/2"));
        assert_eq!(count(&c).unwrap(), 2);
        assert_eq!(clear(&c).unwrap().len(), 2);
        assert_eq!(count(&c).unwrap(), 0);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn kinds_names_and_owned() {
        assert_eq!(kind_of(Path::new("/no/such/photo.JPG")), "image");
        assert_eq!(kind_of(Path::new("/no/such/doc.pdf")), "file");
        assert_eq!(kind_of(&std::env::temp_dir()), "dir");
        assert_eq!(name_of(Path::new("/a/b/c.txt")), "c.txt");
        assert_eq!(text_name("\n  مرحبا بالعالم\nسطر ثانٍ"), "مرحبا بالعالم");
        assert_eq!(text_name("   "), "نص");
        assert_eq!(text_name(&"x".repeat(60)).chars().count(), 41);
        assert_eq!(clean_path(r"\\?\C:\a"), r"C:\a");
        let d = Path::new("/data");
        assert!(is_owned(d, Path::new("/data/shelf/1.txt")));
        assert!(!is_owned(d, Path::new("/home/u/shelf/1.txt")));
    }

    #[test]
    fn cleanup_only_touches_owned_files() {
        let base = std::env::temp_dir().join(format!("shelf-own-{}", now_ms()));
        std::fs::create_dir_all(base.join(SHELF_DIR)).unwrap();
        let mine = base.join(SHELF_DIR).join("1.txt");
        let user = base.join("user.txt");
        std::fs::write(&mine, "x").unwrap();
        std::fs::write(&user, "x").unwrap();
        cleanup_owned(&base, &[mine.to_string_lossy().into(), user.to_string_lossy().into()]);
        assert!(!mine.exists() && user.exists());
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn thumb_for_png() {
        let base = std::env::temp_dir().join(format!("shelf-th-{}", now_ms()));
        std::fs::create_dir_all(&base).unwrap();
        let p = base.join("a.png");
        image::RgbaImage::from_pixel(300, 150, image::Rgba([255, 0, 0, 255])).save(&p).unwrap();
        assert!(make_thumb(&p).is_some());
        assert!(make_thumb(&base.join("none.png")).is_none());
        let _ = std::fs::remove_dir_all(base);
    }
}
