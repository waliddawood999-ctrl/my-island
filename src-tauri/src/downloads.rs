// downloads — مراقبة مجلد التنزيلات (حسب المخطط §7/downloads) + تنزيلات Steam.
// notify (ReadDirectoryChangesW) يوقظ الحلقة؛ المسح غير تعاودي. يتتبّع ملفات المتصفحات المؤقتة
// (.crdownload/.part/.opdownload/.partial) والملفات النامية، ويتجاهل .tmp وdownloadsIgnore.
// النسبة: المتصفحات لا تكشف الحجم الكلي ⇒ percent=null (شريط غير محدّد)؛ Steam يعطي نسبة حقيقية.
// خصوصية: محلي بالكامل، لا شبكة، ولا يقرأ إلا أسماء وأحجام الملفات. يعمل فقط عند showDownloads/downloadsInPill.
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
pub struct DownloadItem {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub total: Option<u64>,
    /// 0..100 أو null إن لم يُعرف الكلّي
    pub percent: Option<f32>,
    /// بايت/ث
    pub speed: f64,
    /// "browser" | "steam"
    pub source: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct DoneItem {
    pub name: String,
    pub path: String,
    pub size: u64,
    /// ms منذ epoch
    pub at: i64,
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
pub struct Snapshot {
    pub active: Vec<DownloadItem>,
    pub recent: Vec<DoneItem>,
}

#[derive(Default)]
pub struct DownloadsState {
    pub snapshot: Mutex<Snapshot>,
}

// ───────── منطق خالص (يُختبر منفصلًا) ─────────
// PURE-BEGIN
pub const TEMP_EXTS: [&str; 4] = ["crdownload", "part", "opdownload", "partial"];
const STABLE_PLAIN: f64 = 3.0;
const STABLE_FINAL: f64 = 1.5;

fn ext_of(name: &str) -> String {
    Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}
pub fn is_temp(name: &str) -> bool { TEMP_EXTS.contains(&ext_of(name).as_str()) }

/// يجرّد امتداد المؤقت: "a.pdf.crdownload" → "a.pdf".
pub fn final_name(name: &str) -> String {
    if is_temp(name) {
        if let Some(i) = name.rfind('.') { return name[..i].to_string(); }
    }
    name.to_string()
}

/// تجاهل: .tmp دائمًا، وعناصر downloadsIgnore (".ext" / "*.ext" امتداد، وغيرها جزء من الاسم).
pub fn ignored(name: &str, ignore: &[String]) -> bool {
    let low = name.to_lowercase();
    if ext_of(&low) == "tmp" { return true; }
    ignore.iter().any(|p| {
        let p = p.trim().to_lowercase();
        if p.is_empty() { return false; }
        if let Some(e) = p.strip_prefix("*.").or_else(|| p.strip_prefix('.')) { return ext_of(&low) == e; }
        low.contains(&p)
    })
}

struct Tracked { size: u64, last_growth: f64, last_t: f64, speed: f64, temp: bool }

#[derive(Default)]
pub struct Tracker {
    init: bool,
    prev: HashMap<String, u64>,
    tracked: HashMap<String, Tracked>,
    /// ملفات نهائية ظهرت بعد اختفاء مؤقتها: الاسم → (الحجم، وقت أول ثبات)
    pending: HashMap<String, (u64, f64)>,
}

impl Tracker {
    /// files = (اسم، حجم) لملفات المجلد؛ now = ثوانٍ منطقية. يعيد (الجارية، المكتملة (اسم، حجم)).
    pub fn update(&mut self, files: &[(String, u64)], now: f64, ign: &[String]) -> (Vec<DownloadItem>, Vec<(String, u64)>) {
        let cur: HashMap<String, u64> = files.iter().filter(|(n, _)| !ignored(n, ign)).cloned().collect();
        let mut done: Vec<(String, u64)> = Vec::new();

        // 1) بدء التتبّع: مؤقتات المتصفحات، أو ملف عادي نما منذ المسح السابق.
        if self.init {
            for (n, &sz) in &cur {
                if self.tracked.contains_key(n) { continue; }
                let temp = is_temp(n);
                let grew = self.prev.get(n).map_or(false, |&p| sz > p);
                if temp || grew {
                    self.tracked.insert(n.clone(), Tracked { size: if temp { 0 } else { *self.prev.get(n).unwrap_or(&0) }, last_growth: now, last_t: now, speed: 0.0, temp });
                }
            }
        } else {
            for (n, &sz) in &cur {
                if is_temp(n) { self.tracked.insert(n.clone(), Tracked { size: 0, last_growth: now, last_t: now, speed: 0.0, temp: true }); let _ = sz; }
            }
        }

        // 2) تحديث/إنهاء المتتبَّعة.
        let names: Vec<String> = self.tracked.keys().cloned().collect();
        for n in names {
            match cur.get(&n) {
                Some(&sz) => {
                    let t = self.tracked.get_mut(&n).unwrap();
                    let dt = (now - t.last_t).max(0.001);
                    if sz > t.size {
                        let inst = (sz - t.size) as f64 / dt;
                        t.speed = if t.speed == 0.0 { inst } else { t.speed * 0.5 + inst * 0.5 };
                        t.last_growth = now;
                    } else {
                        t.speed *= 0.5;
                        if t.speed < 1.0 { t.speed = 0.0; }
                    }
                    t.size = sz;
                    t.last_t = now;
                    if !t.temp && now - t.last_growth >= STABLE_PLAIN {
                        done.push((n.clone(), sz));
                        self.tracked.remove(&n);
                    }
                }
                None => {
                    let t = self.tracked.remove(&n).unwrap();
                    if t.temp {
                        // اختفى المؤقت: الاسم النهائي إما بتجريد الامتداد أو أكبر ملف جديد ظهر.
                        let fin = final_name(&n);
                        let pick = if cur.contains_key(&fin) && !is_temp(&fin) { Some(fin) } else {
                            cur.iter().filter(|(k, _)| !is_temp(k) && !self.prev.contains_key(*k))
                                .max_by_key(|(_, v)| **v).map(|(k, _)| k.clone())
                        };
                        if let Some(p) = pick { let sz = cur[&p]; self.pending.insert(p, (sz, now)); }
                    }
                }
            }
        }

        // 3) النهائية المعلّقة: تُعتمد عند ثبات الحجم STABLE_FINAL.
        let pend: Vec<String> = self.pending.keys().cloned().collect();
        for n in pend {
            match cur.get(&n) {
                Some(&sz) => {
                    let e = self.pending.get_mut(&n).unwrap();
                    if sz != e.0 { *e = (sz, now); }
                    else if now - e.1 >= STABLE_FINAL { done.push((n.clone(), sz)); self.pending.remove(&n); }
                }
                None => { self.pending.remove(&n); }
            }
        }

        self.prev = cur.clone();
        self.init = true;

        let mut active: Vec<DownloadItem> = self.tracked.iter().map(|(n, t)| DownloadItem {
            id: format!("f:{n}"),
            name: final_name(n),
            size: t.size,
            total: None,
            percent: None,
            speed: t.speed,
            source: "browser".into(),
        }).collect();
        active.sort_by(|a, b| b.size.cmp(&a.size).then(a.name.cmp(&b.name)));
        (active, done)
    }
}

/// قيمة مفتاح من نص ACF/VDF: "key"  "value".
pub fn vdf_value(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let parts: Vec<&str> = line.split('"').collect();
        // ["", key, ws, value, ""]
        if parts.len() >= 4 && parts[1].eq_ignore_ascii_case(key) { return Some(parts[3].to_string()); }
    }
    None
}

/// مسارات مكتبات Steam من libraryfolders.vdf (يفك \\ المزدوجة).
pub fn library_paths(vdf: &str) -> Vec<String> {
    vdf.lines().filter_map(|l| {
        let p: Vec<&str> = l.split('"').collect();
        if p.len() >= 4 && p[1].eq_ignore_ascii_case("path") { Some(p[3].replace("\\\\", "\\")) } else { None }
    }).collect()
}

/// تنزيل Steam من نص appmanifest: (اسم، منزَّل، مطلوب).
pub fn steam_manifest(acf: &str) -> Option<(String, u64, u64)> {
    let total: u64 = vdf_value(acf, "BytesToDownload")?.parse().ok()?;
    let got: u64 = vdf_value(acf, "BytesDownloaded").and_then(|v| v.parse().ok()).unwrap_or(0);
    Some((vdf_value(acf, "name").unwrap_or_else(|| "Steam".into()), got, total))
}
// PURE-END

// ───────── طبقة التطبيق ─────────

fn setting_bool(app: &AppHandle, k: &str) -> bool {
    app.state::<crate::state::AppState>().settings.lock().unwrap().get(k).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn default_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(|p| PathBuf::from(p).join("Downloads"))
}

fn scan_dir(dir: &Path) -> Vec<(String, u64)> {
    let Ok(rd) = std::fs::read_dir(dir) else { return Vec::new() };
    rd.flatten().filter_map(|e| {
        let md = e.metadata().ok()?;
        md.is_file().then(|| (e.file_name().to_string_lossy().into_owned(), md.len()))
    }).collect()
}

#[cfg(windows)]
fn steam_root() -> Option<PathBuf> {
    use windows::core::w;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let mut buf = [0u16; 520];
    let mut len = (buf.len() * 2) as u32;
    let r = unsafe {
        RegGetValueW(HKEY_CURRENT_USER, w!("Software\\Valve\\Steam"), w!("SteamPath"), RRF_RT_REG_SZ, None,
            Some(buf.as_mut_ptr() as *mut _), Some(&mut len))
    };
    if r.0 != 0 { return None; }
    let n = (len as usize / 2).saturating_sub(1).min(buf.len());
    Some(PathBuf::from(String::from_utf16_lossy(&buf[..n]).replace('/', "\\")))
}
#[cfg(not(windows))]
fn steam_root() -> Option<PathBuf> { None }

/// تنزيلات Steam الجارية: (id, اسم، منزَّل، مطلوب).
fn steam_active() -> Vec<(String, String, u64, u64)> {
    let Some(root) = steam_root() else { return Vec::new() };
    let mut libs = vec![root.to_string_lossy().into_owned()];
    if let Ok(t) = std::fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
        for p in library_paths(&t) { if !libs.contains(&p) { libs.push(p); } }
    }
    let mut out = Vec::new();
    for lib in libs {
        let sa = Path::new(&lib).join("steamapps");
        let Ok(rd) = std::fs::read_dir(sa.join("downloading")) else { continue };
        for e in rd.flatten() {
            if !e.path().is_dir() { continue; }
            let appid = e.file_name().to_string_lossy().into_owned();
            if let Ok(t) = std::fs::read_to_string(sa.join(format!("appmanifest_{appid}.acf"))) {
                if let Some((name, got, total)) = steam_manifest(&t) {
                    if total > 0 { out.push((appid, name, got, total)); }
                }
            }
        }
    }
    out
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

#[tauri::command]
pub fn downloads_list(state: tauri::State<DownloadsState>) -> Snapshot {
    state.snapshot.lock().unwrap().clone()
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || run(app));
}

fn run(app: AppHandle) {
    use notify::{RecursiveMode, Watcher};
    let t0 = Instant::now();
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let mut watcher: Option<notify::RecommendedWatcher> = None;
    let mut watched: Option<PathBuf> = None;
    let mut tracker = Tracker::default();
    let mut recent: Vec<DoneItem> = Vec::new();
    let mut steam_prev: HashMap<String, (u64, f64, String, u64)> = HashMap::new();
    let mut steam_speed: HashMap<String, f64> = HashMap::new();
    let mut last_steam = -10.0f64;
    let mut steam_items: Vec<DownloadItem> = Vec::new();
    let mut last_emit = Snapshot::default();

    loop {
        let show = setting_bool(&app, "showDownloads") || setting_bool(&app, "downloadsInPill");
        if !show {
            // معطّل: لا مراقبة ولا مسح؛ نفرّغ اللقطة مرة واحدة.
            drop(watcher.take()); watched = None; tracker = Tracker::default(); steam_prev.clear(); steam_items.clear();
            if last_emit != Snapshot::default() {
                recent.clear();
                last_emit = Snapshot::default();
                *app.state::<DownloadsState>().snapshot.lock().unwrap() = last_emit.clone();
                let _ = app.emit("downloads:update", &last_emit);
            }
            let _ = rx.recv_timeout(Duration::from_secs(1));
            while rx.try_recv().is_ok() {}
            continue;
        }

        let (dir, ignore) = {
            let st = app.state::<crate::state::AppState>();
            let s = st.settings.lock().unwrap();
            let d = s.get("downloadsDir").and_then(|v| v.as_str()).filter(|v| !v.trim().is_empty()).map(PathBuf::from).or_else(default_dir);
            let ig: Vec<String> = s.get("downloadsIgnore").and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
            (d, ig)
        };
        let want_steam = setting_bool(&app, "steamDownloads");

        if watched != dir {
            drop(watcher.take());
            tracker = Tracker::default();
            if let Some(d) = &dir {
                let tx2 = tx.clone();
                if let Ok(mut w) = notify::recommended_watcher(move |_r: notify::Result<notify::Event>| { let _ = tx2.send(()); }) {
                    if w.watch(d, RecursiveMode::NonRecursive).is_ok() { watcher = Some(w); }
                }
            }
            watched = dir.clone();
        }

        let now = t0.elapsed().as_secs_f64();
        let files = dir.as_deref().map(scan_dir).unwrap_or_default();
        let (mut active, done) = tracker.update(&files, now, &ignore);

        for (name, size) in done {
            let path = dir.as_ref().map(|d| d.join(&name).to_string_lossy().into_owned()).unwrap_or_default();
            let it = DoneItem { name, path, size, at: now_ms() };
            let _ = app.emit("downloads:done", &it);
            recent.insert(0, it);
        }

        if want_steam {
            if now - last_steam >= 2.0 {
                last_steam = now;
                let cur = steam_active();
                steam_items.clear();
                let mut seen = HashSet::new();
                for (id, name, got, total) in cur {
                    seen.insert(id.clone());
                    let speed = match steam_prev.get(&id) {
                        Some((pg, pt, _, _)) if got >= *pg && now > *pt => {
                            let inst = (got - pg) as f64 / (now - pt);
                            let old = *steam_speed.get(&id).unwrap_or(&inst);
                            old * 0.5 + inst * 0.5
                        }
                        _ => 0.0,
                    };
                    steam_speed.insert(id.clone(), speed);
                    steam_prev.insert(id.clone(), (got, now, name.clone(), total));
                    steam_items.push(DownloadItem {
                        id: format!("steam:{id}"), name, size: got, total: Some(total),
                        percent: Some((got as f64 / total as f64 * 100.0).min(100.0) as f32), speed, source: "steam".into(),
                    });
                }
                // اختفى من downloading بعد أن تجاوز 95% ⇒ اكتمل.
                let gone: Vec<String> = steam_prev.keys().filter(|k| !seen.contains(*k)).cloned().collect();
                for id in gone {
                    if let Some((got, _, name, total)) = steam_prev.remove(&id) {
                        steam_speed.remove(&id);
                        if total > 0 && got as f64 / total as f64 >= 0.95 {
                            let it = DoneItem { name, path: String::new(), size: total, at: now_ms() };
                            let _ = app.emit("downloads:done", &it);
                            recent.insert(0, it);
                        }
                    }
                }
            }
            active.extend(steam_items.iter().cloned());
        } else {
            steam_prev.clear(); steam_items.clear();
        }
        recent.truncate(8);

        let snap = Snapshot { active, recent: recent.clone() };
        if snap != last_emit {
            *app.state::<DownloadsState>().snapshot.lock().unwrap() = snap.clone();
            let _ = app.emit("downloads:update", &snap);
            last_emit = snap;
        }

        // خامل: انتظر notify حتى 4s؛ نشط: 1s. حدّ أدنى ثانية بين مسحين (تخفيف أعاصير الأحداث).
        let wait = if last_emit.active.is_empty() { 4 } else { 1 };
        let _ = rx.recv_timeout(Duration::from_secs(wait));
        std::thread::sleep(Duration::from_millis(if last_emit.active.is_empty() { 300 } else { 0 }));
        let spent = t0.elapsed().as_secs_f64() - now;
        if spent < 1.0 { std::thread::sleep(Duration::from_secs_f64(1.0 - spent)); }
        while rx.try_recv().is_ok() {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn f(v: &[(&str, u64)]) -> Vec<(String, u64)> { v.iter().map(|(n, s)| (n.to_string(), *s)).collect() }

    #[test]
    fn names_and_ignore() {
        assert_eq!(final_name("a.pdf.crdownload"), "a.pdf");
        assert_eq!(final_name("a.pdf"), "a.pdf");
        assert!(is_temp("x.PART") && !is_temp("x.tmp"));
        assert!(ignored("x.tmp", &[]));
        assert!(ignored("setup.iso", &[".iso".into()]));
        assert!(ignored("My Draft.docx", &["draft".into()]));
        assert!(!ignored("a.zip", &["*.iso".into()]));
    }

    #[test]
    fn chrome_flow_rename_to_final() {
        let mut t = Tracker::default();
        let ig: Vec<String> = vec![];
        t.update(&f(&[("old.txt", 5)]), 0.0, &ig);
        let (a, d) = t.update(&f(&[("old.txt", 5), ("Unconfirmed 1.crdownload", 1000)]), 1.0, &ig);
        assert_eq!(a.len(), 1); assert!(d.is_empty());
        let (a, _) = t.update(&f(&[("old.txt", 5), ("Unconfirmed 1.crdownload", 5000)]), 2.0, &ig);
        assert_eq!(a[0].size, 5000); assert!(a[0].speed > 0.0);
        // الاكتمال: المؤقت يختفي وملف جديد يظهر.
        let (a, d) = t.update(&f(&[("old.txt", 5), ("movie.mp4", 9000)]), 3.0, &ig);
        assert!(a.is_empty() && d.is_empty());
        let (_, d) = t.update(&f(&[("old.txt", 5), ("movie.mp4", 9000)]), 4.0, &ig);
        assert!(d.is_empty());
        let (_, d) = t.update(&f(&[("old.txt", 5), ("movie.mp4", 9000)]), 4.6, &ig);
        assert_eq!(d, vec![("movie.mp4".to_string(), 9000)]);
        let (_, d) = t.update(&f(&[("old.txt", 5), ("movie.mp4", 9000)]), 6.0, &ig);
        assert!(d.is_empty());
    }

    #[test]
    fn firefox_part_and_cancel() {
        let mut t = Tracker::default();
        let ig: Vec<String> = vec![];
        t.update(&f(&[]), 0.0, &ig);
        t.update(&f(&[("a.zip.part", 10)]), 1.0, &ig);
        // إلغاء: يختفي بلا ملف نهائي ⇒ لا done
        let (a, d) = t.update(&f(&[]), 2.0, &ig);
        assert!(a.is_empty() && d.is_empty());
        t.update(&f(&[("b.zip.part", 10)]), 3.0, &ig);
        t.update(&f(&[("b.zip", 10)]), 4.0, &ig);
        let (_, d) = t.update(&f(&[("b.zip", 10)]), 5.6, &ig);
        assert_eq!(d, vec![("b.zip".to_string(), 10)]);
    }

    #[test]
    fn growing_plain_file_and_tmp_ignored() {
        let mut t = Tracker::default();
        let ig: Vec<String> = vec![];
        t.update(&f(&[("big.bin", 100)]), 0.0, &ig);
        let (a, _) = t.update(&f(&[("big.bin", 200), ("z.tmp", 1)]), 1.0, &ig);
        assert_eq!(a.len(), 1);
        t.update(&f(&[("big.bin", 300), ("z.tmp", 9)]), 2.0, &ig);
        let (a, d) = t.update(&f(&[("big.bin", 300)]), 4.0, &ig);
        assert_eq!(a.len(), 1); assert!(d.is_empty());
        let (a, d) = t.update(&f(&[("big.bin", 300)]), 5.1, &ig);
        assert!(a.is_empty());
        assert_eq!(d, vec![("big.bin".to_string(), 300)]);
    }

    #[test]
    fn steam_parsing() {
        let acf = "\"AppState\"\n{\n\t\"appid\"\t\t\"730\"\n\t\"name\"\t\t\"Counter-Strike 2\"\n\t\"BytesToDownload\"\t\t\"1000\"\n\t\"BytesDownloaded\"\t\t\"250\"\n}";
        assert_eq!(steam_manifest(acf), Some(("Counter-Strike 2".into(), 250, 1000)));
        let vdf = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"D:\\\\Games\"\n\t}\n}";
        assert_eq!(library_paths(vdf), vec!["C:\\Program Files (x86)\\Steam", "D:\\Games"]);
    }
}
