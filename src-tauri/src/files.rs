// files: تطبيقات قائمة ابدأ + أيقونات + فهرس ملفات/مجلدات خفيف في الذاكرة فقط (حسب المخطط §7/files-palette).
// الفهرس لا يُحفظ على القرص أبدًا، ويُبنى بخيط منخفض الأولوية يتمهّل بين الدفعات كي لا يحرق المعالج.
// المنطق الخالص (مسح/تقييم/بحث) منفصل عن Win32 كي يُختبر على أي نظام.
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// سقف عناصر الفهرس (حماية الذاكرة).
const MAX_ENTRIES: usize = 200_000;
/// أقصى عمق تعاودي للفهرس.
const MAX_DEPTH: usize = 6;
/// إعادة مسح تدريجية كل 10 دقائق.
const REFRESH: Duration = Duration::from_secs(600);

#[derive(Serialize, Clone, Debug)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct FileHit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Held {
    pub ready: bool,
    pub building: bool,
    pub files: usize,
    pub folders: usize,
}

struct Entry {
    name: String,
    lc: String,
    path: String,
    is_dir: bool,
}

#[derive(Default)]
pub struct FilesState {
    apps: Mutex<Option<Vec<AppEntry>>>,
    /// جذر ⇒ عناصره (يُستبدل جذرًا جذرًا فيصير الفهرس صالحًا تدريجيًا).
    index: Mutex<HashMap<String, Vec<Entry>>>,
    building: AtomicBool,
    ready: AtomicBool,
    icons: Mutex<HashMap<String, Option<String>>>,
}

// ───────────────────────── المنطق الخالص ─────────────────────────

/// تطبيع للمطابقة: حروف صغيرة + إزالة التشكيل وتوحيد الألف والياء والتاء المربوطة.
pub fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(*c as u32, 0x064B..=0x065F | 0x0670 | 0x0640))
        .flat_map(|c| match c {
            'أ' | 'إ' | 'آ' => vec!['ا'],
            'ى' => vec!['ي'],
            'ة' => vec!['ه'],
            c => c.to_lowercase().collect::<Vec<_>>(),
        })
        .collect()
}

/// تقييم اسم مقابل رموز الاستعلام؛ None = لا تطابق (يجب أن تظهر كل الرموز).
pub fn score(lc: &str, tokens: &[String]) -> Option<i32> {
    if tokens.is_empty() {
        return None;
    }
    let mut total = 0;
    for t in tokens {
        let s = if lc == t {
            100
        } else if lc.starts_with(t.as_str()) {
            80
        } else if lc.split(|c: char| !c.is_alphanumeric()).any(|w| w.starts_with(t.as_str())) {
            60
        } else if lc.contains(t.as_str()) {
            40
        } else {
            return None;
        };
        total += s;
    }
    // الأقصر أولًا عند التعادل.
    Some(total * 10 - (lc.chars().count().min(200) as i32) / 4)
}

pub fn tokens_of(q: &str) -> Vec<String> {
    norm(q).split_whitespace().map(str::to_string).collect()
}

fn search_entries<'a>(
    all: impl Iterator<Item = &'a Entry>,
    q: &str,
    limit: usize,
    files: bool,
    dirs: bool,
) -> Vec<FileHit> {
    let toks = tokens_of(q);
    let mut hits: Vec<(i32, &Entry)> = all
        .filter(|e| if e.is_dir { dirs } else { files })
        .filter_map(|e| score(&e.lc, &toks).map(|s| (s, e)))
        .collect();
    hits.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.name.len().cmp(&b.1.name.len())));
    hits.into_iter()
        .take(limit)
        .map(|(_, e)| FileHit { name: e.name.clone(), path: e.path.clone(), is_dir: e.is_dir })
        .collect()
}

fn env_path(k: &str) -> Option<PathBuf> {
    std::env::var_os(k).map(PathBuf::from).filter(|p| !p.as_os_str().is_empty())
}

/// جذور قائمة ابدأ ومجلدات سطح المكتب (الثابتة للنظام ثم المستخدم).
pub fn app_roots() -> Vec<PathBuf> {
    let mut v = vec![];
    if let Some(p) = env_path("PROGRAMDATA") {
        v.push(p.join("Microsoft/Windows/Start Menu/Programs"));
    }
    if let Some(p) = env_path("APPDATA") {
        v.push(p.join("Microsoft/Windows/Start Menu/Programs"));
    }
    if let Some(p) = env_path("PUBLIC") {
        v.push(p.join("Desktop"));
    }
    if let Some(p) = env_path("USERPROFILE") {
        v.push(p.join("Desktop"));
        v.push(p.join("OneDrive/Desktop"));
    }
    v
}

/// يمسح الجذور بحثًا عن اختصارات/برامج؛ يزيل التكرار بالاسم (الأول يفوز).
pub fn scan_apps(roots: &[PathBuf]) -> Vec<AppEntry> {
    let mut seen = HashSet::new();
    let mut out = vec![];
    for root in roots {
        let mut stack = vec![(root.clone(), 0usize)];
        while let Some((dir, depth)) = stack.pop() {
            let Ok(rd) = std::fs::read_dir(&dir) else { continue };
            for e in rd.flatten() {
                let p = e.path();
                let Ok(ft) = e.file_type() else { continue };
                if ft.is_dir() {
                    if depth < 5 {
                        stack.push((p, depth + 1));
                    }
                    continue;
                }
                let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
                if !matches!(ext.as_str(), "lnk" | "exe" | "url" | "appref-ms") {
                    continue;
                }
                let Some(name) = p.file_stem().and_then(|x| x.to_str()).map(str::to_string) else { continue };
                let lname = name.to_lowercase();
                if lname.contains("uninstall") || lname.starts_with("unins") || lname.contains("إلغاء تثبيت") {
                    continue;
                }
                if !seen.insert(norm(&name)) {
                    continue;
                }
                let path = p.to_string_lossy().to_string();
                out.push(AppEntry { id: path.to_lowercase(), name, path });
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// جذور الفهرس: مجلدات المستخدم المعتادة فقط (لا نمسح القرص كله).
pub fn index_roots() -> Vec<PathBuf> {
    let Some(home) = env_path("USERPROFILE").or_else(|| env_path("HOME")) else { return vec![] };
    let mut v = vec![];
    for d in ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"] {
        let p = home.join(d);
        if p.is_dir() {
            v.push(p);
        }
        let od = home.join("OneDrive").join(d);
        if od.is_dir() {
            v.push(od);
        }
    }
    v
}

fn skip_dir(name: &str) -> bool {
    let l = name.to_ascii_lowercase();
    name.starts_with('.')
        || name.starts_with('$')
        || matches!(
            l.as_str(),
            "node_modules" | "target" | "appdata" | "__pycache__" | "venv" | "site-packages" | "windows" | "system volume information"
        )
}

#[cfg(windows)]
fn is_hidden(md: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    md.file_attributes() & (0x2 | 0x4) != 0 // HIDDEN | SYSTEM
}
#[cfg(not(windows))]
fn is_hidden(_md: &std::fs::Metadata) -> bool {
    false
}

/// يمسح جذرًا واحدًا. `pause` يُستدعى كل دفعة لإبقاء المعالج هادئًا؛ `budget` سقف العناصر المتبقي.
fn walk_root(root: &Path, budget: &mut usize, pause: &mut dyn FnMut()) -> Vec<Entry> {
    let mut out = vec![];
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    let mut n = 0usize;
    while let Some((dir, depth)) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            if *budget == 0 {
                return out;
            }
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            let Some(name) = e.file_name().to_str().map(str::to_string) else { continue };
            if name.starts_with('.') {
                continue;
            }
            if let Ok(md) = e.metadata() {
                if is_hidden(&md) {
                    continue;
                }
            }
            let is_dir = ft.is_dir();
            if is_dir && skip_dir(&name) {
                continue;
            }
            let path = e.path();
            if is_dir && depth + 1 < MAX_DEPTH {
                stack.push((path.clone(), depth + 1));
            }
            out.push(Entry { lc: norm(&name), name, path: path.to_string_lossy().to_string(), is_dir });
            *budget -= 1;
            n += 1;
            if n % 300 == 0 {
                pause();
            }
        }
    }
    out
}

// ───────────────────────── الحالة والخيوط ─────────────────────────

fn want(app: &AppHandle) -> (bool, bool) {
    let s = app.state::<AppState>();
    let s = s.settings.lock().unwrap();
    // غياب المفتاح = مفعّل (الفهرس محلي بالكامل في الذاكرة ولا شبكة فيه).
    let f = s.get("paletteFiles").and_then(|v| v.as_bool()).unwrap_or(true);
    let d = s.get("paletteFolders").and_then(|v| v.as_bool()).unwrap_or(true);
    (f, d)
}

/// مسح كامل تدريجي؛ يُهمل إن كان هناك مسح جارٍ.
fn rebuild(app: &AppHandle) {
    let st = app.state::<FilesState>();
    if st.building.swap(true, Ordering::SeqCst) {
        return;
    }
    let (f, d) = want(app);
    if !f && !d {
        st.index.lock().unwrap().clear();
        st.ready.store(false, Ordering::SeqCst);
        st.building.store(false, Ordering::SeqCst);
        return;
    }
    let mut budget = MAX_ENTRIES;
    let roots = index_roots();
    let keep: HashSet<String> = roots.iter().map(|r| r.to_string_lossy().to_string()).collect();
    for root in &roots {
        let mut pause = || std::thread::sleep(Duration::from_millis(4));
        let entries = walk_root(root, &mut budget, &mut pause);
        st.index.lock().unwrap().insert(root.to_string_lossy().to_string(), entries);
        st.ready.store(true, Ordering::SeqCst); // صالح تدريجيًا جذرًا بعد جذر
        std::thread::sleep(Duration::from_millis(30));
    }
    st.index.lock().unwrap().retain(|k, _| keep.contains(k));
    st.ready.store(true, Ordering::SeqCst);
    st.building.store(false, Ordering::SeqCst);
}

fn spawn_rebuild(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || rebuild(&app));
}

/// يُدفَّأ الفهرس بعد الإقلاع بقليل ثم يُحدَّث دوريًا (يتوقف تلقائيًا إن عُطّل paletteFiles وpaletteFolders).
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(4));
        let mut last = Instant::now() - REFRESH;
        loop {
            let (f, d) = want(&app);
            if (f || d) && last.elapsed() >= REFRESH {
                rebuild(&app);
                last = Instant::now();
            } else if !f && !d {
                let st = app.state::<FilesState>();
                if st.ready.load(Ordering::SeqCst) {
                    st.index.lock().unwrap().clear();
                    st.ready.store(false, Ordering::SeqCst);
                }
            }
            std::thread::sleep(Duration::from_secs(5));
        }
    });
}

// ───────────────────────── الأوامر ─────────────────────────

/// تطبيقات قائمة ابدأ + سطح المكتب (تُمسح مرة وتُخزَّن؛ refresh=true يعيد المسح).
#[tauri::command]
pub async fn palette_apps(app: AppHandle, refresh: Option<bool>) -> Result<Vec<AppEntry>, String> {
    if refresh != Some(true) {
        if let Some(v) = app.state::<FilesState>().apps.lock().unwrap().as_ref() {
            return Ok(v.clone());
        }
    }
    let list = tauri::async_runtime::spawn_blocking(|| scan_apps(&app_roots()))
        .await
        .map_err(|e| e.to_string())?;
    *app.state::<FilesState>().apps.lock().unwrap() = Some(list.clone());
    Ok(list)
}

/// يدفّئ الفهرس الآن في خيط خلفي (يعود فورًا).
#[tauri::command]
pub fn files_warm(app: AppHandle) {
    spawn_rebuild(&app);
}

/// حالة الفهرس المحتفَظ به في الذاكرة.
#[tauri::command]
pub fn files_held(app: AppHandle) -> Held {
    let st = app.state::<FilesState>();
    let idx = st.index.lock().unwrap();
    let (mut files, mut folders) = (0, 0);
    for e in idx.values().flatten() {
        if e.is_dir { folders += 1 } else { files += 1 }
    }
    Held { ready: st.ready.load(Ordering::SeqCst), building: st.building.load(Ordering::SeqCst), files, folders }
}

/// بحث في الفهرس باحترام paletteFiles/paletteFolders.
#[tauri::command]
pub fn files_search(app: AppHandle, query: String, limit: Option<usize>) -> Vec<FileHit> {
    let (f, d) = want(&app);
    if (!f && !d) || query.trim().chars().count() < 2 {
        return vec![];
    }
    let st = app.state::<FilesState>();
    if !st.ready.load(Ordering::SeqCst) && !st.building.load(Ordering::SeqCst) {
        spawn_rebuild(&app); // أول بحث قبل التدفئة
    }
    let idx = st.index.lock().unwrap();
    search_entries(idx.values().flatten(), &query, limit.unwrap_or(8).min(50), f, d)
}

/// أيقونة ملف/اختصار كـ PNG base64 (تُخزَّن مؤقتًا في الذاكرة وفي <بيانات>/icons).
#[tauri::command]
pub async fn palette_icon(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let key = path.to_lowercase();
    if let Some(v) = app.state::<FilesState>().icons.lock().unwrap().get(&key) {
        return Ok(v.clone());
    }
    let dir = app.state::<AppState>().data_dir.lock().unwrap().clone().map(|d| d.join("icons"));
    let p2 = path.clone();
    let res = tauri::async_runtime::spawn_blocking(move || icon_cached(&p2, dir.as_deref()))
        .await
        .map_err(|e| e.to_string())?;
    app.state::<FilesState>().icons.lock().unwrap().insert(key, res.clone());
    Ok(res)
}

pub(crate) fn icon_cached(path: &str, dir: Option<&Path>) -> Option<String> {
    use base64::Engine;
    use sha2::{Digest, Sha256};
    let b64 = |b: &[u8]| base64::engine::general_purpose::STANDARD.encode(b);
    let file = dir.map(|d| {
        let h: String = Sha256::digest(path.to_lowercase().as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
        d.join(format!("{h}.png"))
    });
    if let Some(f) = &file {
        if let Ok(bytes) = std::fs::read(f) {
            let fresh = match (std::fs::metadata(path).and_then(|m| m.modified()), std::fs::metadata(f).and_then(|m| m.modified())) {
                (Ok(src), Ok(cache)) => src <= cache,
                _ => true,
            };
            if fresh {
                return Some(b64(&bytes));
            }
        }
    }
    let png = extract_icon_png(path)?;
    if let Some(f) = &file {
        if let Some(d) = f.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        let _ = std::fs::write(f, &png);
    }
    Some(b64(&png))
}

#[cfg(not(windows))]
fn extract_icon_png(_path: &str) -> Option<Vec<u8>> {
    None
}

/// SHGetFileInfo → HICON → بكسلات BGRA (من اللون، وقناع الشفافية للأيقونات القديمة) → PNG.
#[cfg(windows)]
fn extract_icon_png(path: &str) -> Option<Vec<u8>> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, HBITMAP,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};

    unsafe fn bits(dc: windows::Win32::Graphics::Gdi::HDC, bm: HBITMAP, w: i32, h: i32) -> Option<Vec<u8>> {
        let mut bi = BITMAPINFO::default();
        bi.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h, // من الأعلى للأسفل
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        };
        let mut buf = vec![0u8; (w * h * 4) as usize];
        let n = GetDIBits(dc, bm, 0, h as u32, Some(buf.as_mut_ptr() as *mut _), &mut bi, DIB_RGB_COLORS);
        (n != 0).then_some(buf)
    }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut sfi = SHFILEINFOW::default();
        let r = SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut sfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if r == 0 || sfi.hIcon.is_invalid() {
            return None;
        }
        let mut ii = ICONINFO::default();
        let got = GetIconInfo(sfi.hIcon, &mut ii).is_ok();
        let mut result = None;
        if got && !ii.hbmColor.is_invalid() {
            let mut bmp = BITMAP::default();
            GetObjectW(ii.hbmColor.into(), std::mem::size_of::<BITMAP>() as i32, Some(&mut bmp as *mut _ as *mut _));
            let (w, h) = (bmp.bmWidth, bmp.bmHeight);
            if w > 0 && h > 0 {
                let dc = CreateCompatibleDC(None);
                if let Some(mut px) = bits(dc, ii.hbmColor, w, h) {
                    if px.chunks(4).all(|p| p[3] == 0) {
                        // أيقونة بلا قناع ألفا: الشفافية من القناع (أسود = معتم).
                        let mask = if ii.hbmMask.is_invalid() { None } else { bits(dc, ii.hbmMask, w, h) };
                        for (i, p) in px.chunks_mut(4).enumerate() {
                            let opaque = mask.as_ref().map_or(true, |m| m[i * 4] == 0);
                            p[3] = if opaque { 255 } else { 0 };
                        }
                    }
                    for p in px.chunks_mut(4) {
                        p.swap(0, 2); // BGRA → RGBA
                    }
                    if let Some(img) = image::RgbaImage::from_raw(w as u32, h as u32, px) {
                        let mut out = std::io::Cursor::new(Vec::new());
                        if img.write_to(&mut out, image::ImageFormat::Png).is_ok() {
                            result = Some(out.into_inner());
                        }
                    }
                }
                let _ = DeleteDC(dc);
            }
        }
        if !ii.hbmColor.is_invalid() {
            let _ = DeleteObject(ii.hbmColor.into());
        }
        if !ii.hbmMask.is_invalid() {
            let _ = DeleteObject(ii.hbmMask.into());
        }
        let _ = DestroyIcon(sfi.hIcon);
        result
    }
}

// ───────────────────────── اختبارات ─────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("mi_files_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn norm_arabic_and_case() {
        assert_eq!(norm("أَحمد"), "احمد");
        assert_eq!(norm("مدرسة"), "مدرسه");
        assert_eq!(norm("Chrome"), "chrome");
    }

    #[test]
    fn scoring_prefers_exact_then_prefix_then_word() {
        let t = tokens_of("note");
        let ex = score("note", &t).unwrap();
        let pre = score("notepad", &t).unwrap();
        let word = score("my note app", &t).unwrap();
        let sub = score("footnotes", &t).unwrap();
        assert!(ex > pre && pre > word && word > sub);
        assert!(score("calc", &t).is_none());
        // كل الرموز مطلوبة
        assert!(score("visual studio code", &tokens_of("studio code")).is_some());
        assert!(score("visual studio code", &tokens_of("studio vim")).is_none());
    }

    #[test]
    fn scan_apps_dedupes_and_skips_uninstall() {
        let r = tmp("apps");
        std::fs::create_dir_all(r.join("Sub")).unwrap();
        std::fs::write(r.join("Notepad.lnk"), b"").unwrap();
        std::fs::write(r.join("Sub/notepad.lnk"), b"").unwrap(); // مكرر بالاسم
        std::fs::write(r.join("Sub/Uninstall Foo.lnk"), b"").unwrap();
        std::fs::write(r.join("Sub/Readme.txt"), b"").unwrap();
        std::fs::write(r.join("Sub/Paint.exe"), b"").unwrap();
        let apps = scan_apps(&[r.clone()]);
        let names: Vec<_> = apps.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(apps.len(), 2, "{names:?}");
        assert!(names.contains(&"Paint") && names.iter().any(|n| n.eq_ignore_ascii_case("notepad")));
        let _ = std::fs::remove_dir_all(r);
    }

    #[test]
    fn walk_and_search_respect_filters_and_limits() {
        let r = tmp("idx");
        std::fs::create_dir_all(r.join("Projects/alpha")).unwrap();
        std::fs::create_dir_all(r.join("node_modules/x")).unwrap();
        std::fs::create_dir_all(r.join(".git")).unwrap();
        std::fs::write(r.join("Projects/alpha/report-final.pdf"), b"").unwrap();
        std::fs::write(r.join("node_modules/x/report-hidden.js"), b"").unwrap();
        let mut budget = 1000;
        let mut pauses = 0;
        let e = walk_root(&r, &mut budget, &mut || pauses += 1);
        assert!(e.iter().all(|x| !x.path.contains("node_modules/x/") && !x.path.contains(".git")));
        let all = search_entries(e.iter(), "report", 10, true, true);
        assert_eq!(all.len(), 1);
        assert!(!all[0].is_dir);
        // مجلدات فقط
        let dirs = search_entries(e.iter(), "alpha", 10, false, true);
        assert_eq!(dirs.len(), 1);
        assert!(dirs[0].is_dir);
        // ملفات فقط لا ترى المجلدات
        assert!(search_entries(e.iter(), "alpha", 10, true, false).is_empty());
        // سقف الميزانية
        let mut b2 = 2;
        assert_eq!(walk_root(&r, &mut b2, &mut || {}).len(), 2);
        let _ = std::fs::remove_dir_all(r);
    }
}
