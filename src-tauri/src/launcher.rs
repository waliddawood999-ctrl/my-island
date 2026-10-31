// launcher: «اللانشر» — تطبيقات وملفات ومجلدات وروابط ويب بنقرة أو باختصار عالمي (حسب المخطط §7/linkicon).
// الجدول launcher من schema.sql بلا تعديل: `path` = مسار أو رابط (UNIQUE)، `name` الاسم المعروض،
// `icon` = PNG base64 مخصّص/favicon (NULL ⇒ تُجلب أيقونة الصدفة في الواجهة عبر palette_icon)، `position` الترتيب.
// المجموعات والاختصارات في kv (مفاتيح بالبادئة `launcher:` لا تدخل settings_get — انظر state::init_db).
//
// اختبار ذاتي للجزء النقي (فوق خط «طبقة Tauri»): لا يعتمد على tauri.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// بادئة مفاتيح kv الخاصة باللانشر (ليست إعدادات).
pub const KV_PREFIX: &str = "launcher:";
pub const GROUPS_KEY: &str = "launcher:groups";
pub const HOTKEYS_KEY: &str = "launcher:hotkeys";

const ICON_PX: u32 = 64;
const MAX_GROUPS: usize = 50;
const MAX_NAME: usize = 40;
const LINK_SCHEMES: [&str; 6] = ["http", "https", "ftp", "mailto", "tel", "sms"];
const APP_EXT: [&str; 7] = ["exe", "lnk", "bat", "cmd", "msi", "appref-ms", "com"];

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub icon: Option<String>,
    pub position: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Group {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub items: Vec<i64>,
}

// ───────────────────────── الروابط والأنواع ─────────────────────────

/// هل النص رابط بمخطط مسموح؟ (http/https/ftp تتطلب `://`؛ mailto/tel/sms تكفي `:`.)
pub fn is_link(s: &str) -> bool {
    let t = s.trim();
    let Some((scheme, rest)) = t.split_once(':') else { return false };
    let scheme = scheme.to_ascii_lowercase();
    if !LINK_SCHEMES.contains(&scheme.as_str()) {
        return false;
    }
    match scheme.as_str() {
        "http" | "https" | "ftp" => rest.starts_with("//") && rest.len() > 2,
        _ => !rest.is_empty(),
    }
}

/// يطبّع إدخال المستخدم إلى رابط صالح: «example.com» ⇒ https://example.com ؛ المخططات خارج القائمة مرفوضة.
pub fn normalize_link(input: &str) -> Result<String, String> {
    let t = input.trim();
    if t.is_empty() || t.contains(char::is_whitespace) || t.contains('\0') {
        return Err("رابط غير صالح".into());
    }
    let candidate = if let Some((scheme, _)) = t.split_once(':') {
        let low = scheme.to_ascii_lowercase();
        if LINK_SCHEMES.contains(&low.as_str()) {
            t.to_string()
        } else if scheme.chars().all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c)) && t[scheme.len()..].starts_with("://") {
            return Err(format!("المخطط غير مسموح: {low}"));
        } else {
            format!("https://{t}") // host:port
        }
    } else {
        format!("https://{t}")
    };
    if !is_link(&candidate) {
        return Err("رابط غير صالح".into());
    }
    let low = candidate.to_ascii_lowercase();
    if low.starts_with("http") || low.starts_with("ftp") {
        let u = url::Url::parse(&candidate).map_err(|_| "رابط غير صالح".to_string())?;
        let host = u.host_str().unwrap_or("");
        if host.is_empty() || !(host.contains('.') || host == "localhost" || host.contains(':')) {
            return Err("رابط غير صالح".into());
        }
        return Ok(u.to_string());
    }
    Ok(candidate)
}

/// اسم افتراضي لرابط: المضيف بلا www. ، أو العنوان في mailto/tel.
pub fn link_name(link: &str) -> String {
    if let Some(rest) = link.split_once(':').filter(|(s, _)| ["mailto", "tel", "sms"].contains(&s.to_ascii_lowercase().as_str())) {
        return rest.1.split('?').next().unwrap_or("").to_string();
    }
    url::Url::parse(link)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.strip_prefix("www.").unwrap_or(h).to_string()))
        .unwrap_or_else(|| link.to_string())
}

/// نوع العنصر: link | dir | app | file.
pub fn kind_of(path: &str) -> &'static str {
    if is_link(path) {
        return "link";
    }
    let p = Path::new(path);
    if p.is_dir() {
        return "dir";
    }
    let ext = p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    if APP_EXT.contains(&ext.as_str()) || path.to_ascii_lowercase().starts_with("shell:appsfolder") {
        "app"
    } else {
        "file"
    }
}

/// الاسم المعروض لمسار: التطبيقات بلا امتداد، والبقية بالاسم الكامل؛ جذر القرص يعرض مساره.
pub fn name_of(path: &str) -> String {
    let p = Path::new(path);
    let is_app = kind_of(path) == "app";
    let n = if is_app { p.file_stem() } else { p.file_name() };
    n.map(|n| n.to_string_lossy().into_owned()).filter(|s| !s.is_empty()).unwrap_or_else(|| path.to_string())
}

/// إزالة بادئة \\?\ التي يضيفها ويندوز أحيانًا.
pub fn clean_path(s: &str) -> String {
    s.strip_prefix(r"\\?\").unwrap_or(s).to_string()
}

pub fn clamp_name(s: &str) -> String {
    s.trim().chars().take(MAX_NAME).collect()
}

// ───────────────────────── أيقونات الروابط ─────────────────────────

fn attr_value(tag: &str, name: &str) -> Option<String> {
    let low = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(pos) = low[from..].find(name) {
        let at = from + pos;
        let before_ok = at == 0 || low.as_bytes()[at - 1].is_ascii_whitespace();
        let rest = tag[at + name.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let v = rest[1..].trim_start();
            return Some(match v.chars().next() {
                Some(q @ ('"' | '\'')) => v[1..].split(q).next().unwrap_or("").to_string(),
                _ => v.split(|c: char| c.is_whitespace() || c == '>').next().unwrap_or("").to_string(),
            });
        }
        from = at + name.len();
    }
    None
}

/// عناوين أيقونات الصفحة من وسوم `<link rel="…icon…" href>` بترتيب ظهورها (SVG مستبعد: لا يُفكّ).
pub fn extract_icon_hrefs(html: &str, base: &url::Url) -> Vec<url::Url> {
    let low = html.to_ascii_lowercase();
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(pos) = low[from..].find("<link") {
        let start = from + pos;
        let end = low[start..].find('>').map(|e| start + e).unwrap_or(low.len());
        let tag = &html[start..end];
        from = end.max(start + 5);
        let rel = attr_value(tag, "rel").unwrap_or_default().to_ascii_lowercase();
        if !rel.split_whitespace().any(|r| r.contains("icon")) {
            continue;
        }
        let Some(href) = attr_value(tag, "href").filter(|h| !h.is_empty()) else { continue };
        let Ok(u) = base.join(&href) else { continue };
        let path = u.path().to_ascii_lowercase();
        if !matches!(u.scheme(), "http" | "https") || path.ends_with(".svg") || out.contains(&u) {
            continue;
        }
        out.push(u);
    }
    out
}

/// يفكّ صورة (png/jpg/ico/gif/bmp/webp) ويعيدها PNG مربّع ≤ 64px كـbase64.
pub fn png_icon_from_bytes(bytes: &[u8]) -> Option<String> {
    use base64::Engine;
    let img = image::load_from_memory(bytes).ok()?;
    let small = img.thumbnail(ICON_PX, ICON_PX);
    let mut buf = std::io::Cursor::new(Vec::new());
    small.write_to(&mut buf, image::ImageFormat::Png).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}

// ───────────────────────── قاعدة البيانات ─────────────────────────

pub fn list_rows(conn: &Connection) -> rusqlite::Result<Vec<Row>> {
    let mut st = conn.prepare("SELECT id,path,COALESCE(name,''),icon,position FROM launcher ORDER BY position, id")?;
    let rows = st.query_map([], |r| {
        Ok(Row { id: r.get(0)?, path: r.get(1)?, name: r.get(2)?, icon: r.get(3)?, position: r.get(4)? })
    })?;
    rows.collect()
}

pub fn get_row(conn: &Connection, id: i64) -> rusqlite::Result<Option<Row>> {
    conn.query_row("SELECT id,path,COALESCE(name,''),icon,position FROM launcher WHERE id=?1", [id], |r| {
        Ok(Row { id: r.get(0)?, path: r.get(1)?, name: r.get(2)?, icon: r.get(3)?, position: r.get(4)? })
    })
    .optional()
}

/// يضيف عنصرًا في آخر القائمة؛ المسار المكرّر (بلا اعتبار لحالة الأحرف) يعيد None ولا يغيّر شيئًا.
pub fn add(conn: &Connection, path: &str, name: &str) -> rusqlite::Result<Option<i64>> {
    let dup: Option<i64> =
        conn.query_row("SELECT id FROM launcher WHERE lower(path)=lower(?1) LIMIT 1", [path], |r| r.get(0)).optional()?;
    if dup.is_some() {
        return Ok(None);
    }
    let pos: i64 = conn.query_row("SELECT COALESCE(MAX(position),-1)+1 FROM launcher", [], |r| r.get(0))?;
    let n = conn.execute(
        "INSERT INTO launcher(path,name,icon,position) VALUES(?1,?2,NULL,?3) ON CONFLICT(path) DO NOTHING",
        params![path, name, pos],
    )?;
    Ok((n > 0).then(|| conn.last_insert_rowid()))
}

pub fn remove(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    Ok(conn.execute("DELETE FROM launcher WHERE id=?1", [id])? > 0)
}

pub fn set_icon(conn: &Connection, id: i64, icon: Option<&str>) -> rusqlite::Result<()> {
    conn.execute("UPDATE launcher SET icon=?1 WHERE id=?2", params![icon, id])?;
    Ok(())
}

pub fn set_name(conn: &Connection, id: i64, name: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE launcher SET name=?1 WHERE id=?2", params![name, id])?;
    Ok(())
}

/// يغيّر المسار/الرابط ويمسح الأيقونة؛ يفشل إن كان مكرّرًا لعنصر آخر.
pub fn set_path(conn: &Connection, id: i64, path: &str) -> Result<(), String> {
    let dup: Option<i64> = conn
        .query_row("SELECT id FROM launcher WHERE lower(path)=lower(?1) AND id<>?2 LIMIT 1", params![path, id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if dup.is_some() {
        return Err("الرابط موجود مسبقًا".into());
    }
    conn.execute("UPDATE launcher SET path=?1, icon=NULL WHERE id=?2", params![path, id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ───────────────────────── المجموعات والاختصارات ─────────────────────────

/// ينظّف المجموعات: أسماء مقصوصة، معرّفات فريدة، عناصر موجودة فقط وكل عنصر في مجموعة واحدة (الأولى).
pub fn sanitize_groups(groups: Vec<Group>, valid: &HashSet<i64>) -> Vec<Group> {
    let mut seen_items: HashSet<i64> = HashSet::new();
    let mut seen_ids: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for (n, g) in groups.into_iter().take(MAX_GROUPS).enumerate() {
        let mut id = g.id.trim().to_string();
        if id.is_empty() || seen_ids.contains(&id) {
            id = format!("g{}-{}", n, seen_ids.len());
            while seen_ids.contains(&id) {
                id.push('x');
            }
        }
        seen_ids.insert(id.clone());
        let name = clamp_name(&g.name);
        let items = g.items.into_iter().filter(|i| valid.contains(i) && seen_items.insert(*i)).collect();
        out.push(Group { id, name: if name.is_empty() { "—".into() } else { name }, items });
    }
    out
}

/// اختصار صالح لتسجيل عالمي: أجزاء مفصولة بـ+ ، آخرها مفتاح وقبله معدّل واحد على الأقل.
pub fn has_modifier(s: &str) -> bool {
    let parts: Vec<String> = s.split('+').map(|p| p.trim().to_ascii_lowercase()).collect();
    parts.len() >= 2
        && parts.iter().all(|p| !p.is_empty())
        && parts[..parts.len() - 1].iter().any(|p| {
            matches!(p.as_str(), "ctrl" | "control" | "alt" | "option" | "shift" | "super" | "win" | "meta" | "cmd" | "command" | "cmdorctrl" | "commandorcontrol")
        })
}

/// يُسقط الاختصارات اليتيمة (عنصر محذوف) والفارغة.
pub fn prune_hotkeys(map: HashMap<String, String>, valid: &HashSet<i64>) -> HashMap<String, String> {
    map.into_iter()
        .filter(|(k, v)| !v.trim().is_empty() && k.parse::<i64>().map(|i| valid.contains(&i)).unwrap_or(false))
        .collect()
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
    fn links_normalize_and_reject() {
        assert_eq!(normalize_link("example.com").unwrap(), "https://example.com/");
        assert_eq!(normalize_link(" https://www.Example.com/a?b=1 ").unwrap(), "https://www.example.com/a?b=1");
        assert_eq!(normalize_link("localhost:3000").unwrap(), "https://localhost:3000/");
        assert_eq!(normalize_link("mailto:a@b.co").unwrap(), "mailto:a@b.co");
        assert!(normalize_link("javascript://alert(1)").is_err());
        assert!(normalize_link("file:///C:/x").is_err());
        assert!(normalize_link("ssh://host").is_err());
        assert!(normalize_link("not a url").is_err());
        assert!(normalize_link("").is_err());
        assert!(normalize_link("http://").is_err());
        assert!(normalize_link("justword").is_err());
    }

    #[test]
    fn link_detection_and_names() {
        assert!(is_link("https://a.b") && is_link("MAILTO:x@y.z") && is_link("tel:+123"));
        assert!(!is_link("C:\\Windows") && !is_link("https:") && !is_link("javascript:alert(1)"));
        assert_eq!(link_name("https://www.github.com/x"), "github.com");
        assert_eq!(link_name("mailto:me@x.com?subject=1"), "me@x.com");
        assert_eq!(kind_of("https://x.com"), "link");
    }

    #[test]
    fn kinds_and_names() {
        let d = std::env::temp_dir();
        assert_eq!(kind_of(d.to_str().unwrap()), "dir");
        assert_eq!(kind_of("C:/x/Notepad.EXE"), "app");
        assert_eq!(kind_of("C:/x/readme.txt"), "file");
        assert_eq!(name_of("C:/x/Notepad.exe"), "Notepad");
        assert_eq!(name_of("C:/x/readme.txt"), "readme.txt");
        assert_eq!(clean_path(r"\\?\C:\a"), r"C:\a");
    }

    #[test]
    fn rows_add_order_dedupe_remove() {
        let c = db();
        let a = add(&c, "C:/a.exe", "A").unwrap().unwrap();
        let b = add(&c, "https://x.com/", "x").unwrap().unwrap();
        assert!(add(&c, "c:/A.EXE", "again").unwrap().is_none()); // مكرّر بحالة أحرف مختلفة
        let rows = list_rows(&c).unwrap();
        assert_eq!(rows.iter().map(|r| r.id).collect::<Vec<_>>(), vec![a, b]);
        assert!(rows[1].position > rows[0].position);
        set_icon(&c, b, Some("AAAA")).unwrap();
        assert_eq!(get_row(&c, b).unwrap().unwrap().icon.as_deref(), Some("AAAA"));
        set_name(&c, b, "موقعي").unwrap();
        assert_eq!(get_row(&c, b).unwrap().unwrap().name, "موقعي");
        // تعديل المسار يمسح الأيقونة ويرفض المكرّر
        assert!(set_path(&c, b, "C:/A.exe").is_err());
        set_path(&c, b, "https://y.com/").unwrap();
        let r = get_row(&c, b).unwrap().unwrap();
        assert_eq!((r.path.as_str(), r.icon), ("https://y.com/", None));
        assert!(remove(&c, a).unwrap() && !remove(&c, a).unwrap());
        assert_eq!(list_rows(&c).unwrap().len(), 1);
        // الموضع لا يُعاد استعماله بعد الحذف ⇒ العنصر التالي في آخر القائمة
        let n = add(&c, "C:/n.exe", "N").unwrap().unwrap();
        assert_eq!(list_rows(&c).unwrap().last().unwrap().id, n);
    }

    #[test]
    fn persists_across_reopen() {
        let dir = std::env::temp_dir().join(format!("launcher-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("island.db");
        {
            let c = Connection::open(&f).unwrap();
            c.execute_batch(include_str!("../schema.sql")).unwrap();
            add(&c, "C:/a.exe", "A").unwrap();
            c.execute("INSERT INTO kv(key,value) VALUES(?1,?2)", params![GROUPS_KEY, "[{\"id\":\"g1\",\"name\":\"عمل\",\"items\":[1]}]"]).unwrap();
        }
        let c = Connection::open(&f).unwrap();
        c.execute_batch(include_str!("../schema.sql")).unwrap();
        assert_eq!(list_rows(&c).unwrap().len(), 1);
        let v: String = c.query_row("SELECT value FROM kv WHERE key=?1", [GROUPS_KEY], |r| r.get(0)).unwrap();
        let g: Vec<Group> = serde_json::from_str(&v).unwrap();
        assert_eq!(g[0].items, vec![1]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn icon_hrefs_extracted() {
        let base = url::Url::parse("https://site.com/dir/page").unwrap();
        let html = r#"<html><head><LINK rel="stylesheet" href="/a.css">
          <link rel='shortcut icon' href='/fav.ico'>
          <link href="icon.svg" rel="icon">
          <link rel="apple-touch-icon" sizes="180x180" href=https://cdn.x.com/t.png>
          <link rel="icon" href="/fav.ico"></head>"#;
        let h = extract_icon_hrefs(html, &base);
        assert_eq!(
            h.iter().map(|u| u.as_str()).collect::<Vec<_>>(),
            vec!["https://site.com/fav.ico", "https://cdn.x.com/t.png"]
        );
        assert!(extract_icon_hrefs("<p>no links</p>", &base).is_empty());
    }

    #[test]
    fn png_icon_roundtrip() {
        use base64::Engine;
        let img = image::RgbaImage::from_pixel(200, 100, image::Rgba([255, 0, 0, 255]));
        let mut buf = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img).write_to(&mut buf, image::ImageFormat::Png).unwrap();
        let b64 = png_icon_from_bytes(&buf.into_inner()).unwrap();
        let out = image::load_from_memory(&base64::engine::general_purpose::STANDARD.decode(b64).unwrap()).unwrap();
        assert!(out.width() <= ICON_PX && out.height() <= ICON_PX && out.width() == ICON_PX);
        assert!(png_icon_from_bytes(b"not an image").is_none());
    }

    #[test]
    fn groups_sanitized() {
        let valid: HashSet<i64> = [1, 2, 3].into();
        let g = |id: &str, name: &str, items: Vec<i64>| Group { id: id.into(), name: name.into(), items };
        let out = sanitize_groups(
            vec![g("a", "  عمل  ", vec![1, 9, 2]), g("a", "", vec![2, 3, 3]), g("", "x", vec![1])],
            &valid,
        );
        assert_eq!(out[0].name, "عمل");
        assert_eq!(out[0].items, vec![1, 2]); // 9 غير موجود
        assert_eq!(out[1].items, vec![3]); // 2 سبق في مجموعة أولى، 3 مكرّر
        assert_eq!(out[1].name, "—");
        assert!(out[2].items.is_empty()); // 1 سبق
        let ids: HashSet<_> = out.iter().map(|g| g.id.clone()).collect();
        assert_eq!(ids.len(), 3); // المعرّفات المكرّرة/الفارغة أُعيد توليدها
    }

    #[test]
    fn hotkey_rules() {
        assert!(has_modifier("Ctrl+Alt+1") && has_modifier("shift+F5"));
        assert!(!has_modifier("F5") && !has_modifier("A") && !has_modifier("Ctrl+") && !has_modifier(""));
        let valid: HashSet<i64> = [1].into();
        let m: HashMap<String, String> =
            [("1".into(), "Ctrl+1".into()), ("2".into(), "Ctrl+2".into()), ("x".into(), "Ctrl+3".into()), ("1".into(), "Ctrl+1".into())].into();
        let p = prune_hotkeys(m, &valid);
        assert_eq!(p.len(), 1);
        assert!(prune_hotkeys([("1".into(), " ".into())].into(), &valid).is_empty());
    }
}

// ───────────────────────── طبقة Tauri ─────────────────────────
use std::{str::FromStr, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::state::AppState;

#[derive(Default)]
pub struct LauncherState {
    /// الاختصارات المسجّلة فعلًا: اختصار ⇒ id العنصر.
    bound: Mutex<HashMap<Shortcut, i64>>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Item {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub kind: &'static str,
    pub icon: Option<String>,
    pub missing: bool,
}

fn item_of(r: Row) -> Item {
    let kind = kind_of(&r.path);
    let missing = match kind {
        "link" => false,
        _ if r.path.to_ascii_lowercase().starts_with("shell:") => false,
        _ => !Path::new(&r.path).exists(),
    };
    Item { id: r.id, path: r.path, name: r.name, kind, icon: r.icon, missing }
}

fn with_db<T>(state: &AppState, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let g = state.db.lock().unwrap();
    let conn = g.as_ref().ok_or_else(|| "قاعدة البيانات غير متاحة".to_string())?;
    f(conn).map_err(|e| e.to_string())
}

fn kv_get(state: &AppState, key: &str) -> Option<String> {
    with_db(state, |c| c.query_row("SELECT value FROM kv WHERE key=?1", [key], |r| r.get::<_, String>(0)).optional())
        .ok()
        .flatten()
}

fn kv_set(state: &AppState, key: &str, value: &str) -> Result<(), String> {
    with_db(state, |c| {
        c.execute(
            "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )
        .map(|_| ())
    })
}

fn valid_ids(state: &AppState) -> Result<HashSet<i64>, String> {
    with_db(state, |c| Ok(list_rows(c)?.into_iter().map(|r| r.id).collect()))
}

fn load_groups(state: &AppState) -> Vec<Group> {
    let raw: Vec<Group> = kv_get(state, GROUPS_KEY).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    sanitize_groups(raw, &valid_ids(state).unwrap_or_default())
}

fn load_hotkeys(state: &AppState) -> HashMap<String, String> {
    let raw: HashMap<String, String> = kv_get(state, HOTKEYS_KEY).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    prune_hotkeys(raw, &valid_ids(state).unwrap_or_default())
}

fn changed(app: &AppHandle) {
    let n = with_db(&app.state::<AppState>(), |c| c.query_row("SELECT COUNT(*) FROM launcher", [], |r| r.get::<_, i64>(0))).unwrap_or(0);
    let _ = app.emit("launcher:changed", n);
}

/// moduleLauncher (غياب المفتاح = مفعّل).
fn enabled(app: &AppHandle) -> bool {
    app.state::<AppState>().settings.lock().unwrap().get("moduleLauncher").and_then(|v| v.as_bool()).unwrap_or(true)
}

fn item_by_id(app: &AppHandle, id: i64) -> Result<Item, String> {
    with_db(&app.state::<AppState>(), |c| get_row(c, id))?.map(item_of).ok_or_else(|| "العنصر غير موجود".to_string())
}

// ───────────────────────── الاختصارات العالمية ─────────────────────────

/// يعيد تسجيل كل اختصارات اللانشر من kv (الوحدة معطّلة ⇒ لا شيء). يُستدعى عند الإقلاع وعند تغيير moduleLauncher.
pub fn rebind(app: &AppHandle) {
    let st = app.state::<LauncherState>();
    let gs = app.global_shortcut();
    let mut bound = st.bound.lock().unwrap();
    for (sc, _) in bound.drain() {
        let _ = gs.unregister(sc);
    }
    if !enabled(app) {
        return;
    }
    for (id, key) in load_hotkeys(&app.state::<AppState>()) {
        let Ok(id) = id.parse::<i64>() else { continue };
        match Shortcut::from_str(key.trim()) {
            Ok(sc) => match gs.register(sc) {
                Ok(()) => {
                    bound.insert(sc, id);
                }
                Err(e) => eprintln!("تعذّر تسجيل اختصار اللانشر «{key}»: {e}"),
            },
            Err(e) => eprintln!("اختصار لانشر غير صالح «{key}»: {e}"),
        }
    }
}

/// معالج الاختصارات العام: إن كان الاختصار لعنصر لانشر يُطلقه ويعيد true.
pub fn on_shortcut(app: &AppHandle, sc: &Shortcut) -> bool {
    let id = app.state::<LauncherState>().bound.lock().unwrap().get(sc).copied();
    let Some(id) = id else { return false };
    if let Err(e) = launch(app, id) {
        eprintln!("تعذّر إطلاق عنصر اللانشر {id}: {e}");
    }
    true
}

// ───────────────────────── الإطلاق ─────────────────────────

fn launch(app: &AppHandle, id: i64) -> Result<(), String> {
    let item = item_by_id(app, id)?;
    if item.missing {
        return Err("المسار لم يعد موجودًا".into());
    }
    crate::palette::run_shell(app.clone(), item.path, Some("open".into()), Some(item.name))
}

// ───────────────────────── منتقي الملفات (Win32) ─────────────────────────

#[cfg(windows)]
fn pick_dialog(owner: isize, mode: &str) -> Vec<String> {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{
        FileOpenDialog, IFileOpenDialog, FOS_ALLOWMULTISELECT, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
    };

    let run = || -> windows::core::Result<Vec<String>> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let dlg: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
            let mut opts = dlg.GetOptions()? | FOS_FORCEFILESYSTEM;
            let filters: Vec<COMDLG_FILTERSPEC> = match mode {
                "folder" => {
                    opts |= FOS_PICKFOLDERS | FOS_ALLOWMULTISELECT;
                    vec![]
                }
                "app" => {
                    opts |= FOS_ALLOWMULTISELECT;
                    vec![
                        COMDLG_FILTERSPEC { pszName: w!("Apps"), pszSpec: w!("*.exe;*.lnk;*.bat;*.cmd;*.msi;*.appref-ms") },
                        COMDLG_FILTERSPEC { pszName: w!("All files"), pszSpec: w!("*.*") },
                    ]
                }
                "icon" => vec![
                    COMDLG_FILTERSPEC { pszName: w!("Images"), pszSpec: w!("*.png;*.jpg;*.jpeg;*.ico;*.bmp;*.gif;*.webp") },
                    COMDLG_FILTERSPEC { pszName: w!("All files"), pszSpec: w!("*.*") },
                ],
                _ => {
                    opts |= FOS_ALLOWMULTISELECT;
                    vec![COMDLG_FILTERSPEC { pszName: w!("All files"), pszSpec: w!("*.*") }]
                }
            };
            dlg.SetOptions(opts)?;
            if !filters.is_empty() {
                dlg.SetFileTypes(&filters)?;
            }
            // إلغاء المستخدم يرجع خطأ (HRESULT_FROM_WIN32(ERROR_CANCELLED)) ⇒ قائمة فارغة.
            dlg.Show(if owner != 0 { Some(HWND(owner as *mut _)) } else { None })?;
            let res = dlg.GetResults()?;
            let mut out = Vec::new();
            for k in 0..res.GetCount()? {
                let it = res.GetItemAt(k)?;
                let name = it.GetDisplayName(SIGDN_FILESYSPATH)?;
                let s = PCWSTR(name.0).to_string().unwrap_or_default();
                CoTaskMemFree(Some(name.0 as *const _));
                if !s.is_empty() {
                    out.push(s);
                }
            }
            Ok(out)
        }
    };
    run().unwrap_or_default()
}

#[cfg(not(windows))]
fn pick_dialog(_owner: isize, _mode: &str) -> Vec<String> {
    Vec::new()
}

fn main_hwnd(app: &AppHandle) -> isize {
    #[cfg(windows)]
    {
        if let Some(w) = app.get_webview_window(crate::win::MAIN) {
            if let Ok(h) = w.hwnd() {
                return h.0 as isize;
            }
        }
    }
    let _ = app;
    0
}

async fn pick_files(app: &AppHandle, mode: &'static str) -> Result<Vec<String>, String> {
    let owner = main_hwnd(app);
    tauri::async_runtime::spawn_blocking(move || pick_dialog(owner, mode)).await.map_err(|e| e.to_string())
}

// ───────────────────────── favicon ─────────────────────────

const UA: &str = "MyIsland/0.3 (Windows; launcher icon)";

fn http_get(url: &str, limit: u64) -> Option<Vec<u8>> {
    use std::io::Read;
    let resp = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(8))
        .redirects(4)
        .build()
        .get(url)
        .set("User-Agent", UA)
        .call()
        .ok()?;
    let mut buf = Vec::new();
    resp.into_reader().take(limit).read_to_end(&mut buf).ok()?;
    Some(buf)
}

/// favicon الموقع كـPNG base64: وسوم الصفحة أولًا ثم /favicon.ico. لا شيء لروابط غير http(s).
/// شبكة صريحة بطلب المستخدم فقط (إضافة/تحديث رابط).
pub fn fetch_favicon(link: &str) -> Option<String> {
    let base = url::Url::parse(link).ok().filter(|u| matches!(u.scheme(), "http" | "https"))?;
    let mut cands: Vec<url::Url> = Vec::new();
    if let Some(html) = http_get(link, 300 * 1024) {
        cands.extend(extract_icon_hrefs(&String::from_utf8_lossy(&html), &base));
    }
    if let Ok(u) = base.join("/favicon.ico") {
        if !cands.contains(&u) {
            cands.push(u);
        }
    }
    cands.into_iter().take(5).find_map(|u| http_get(u.as_str(), 512 * 1024).and_then(|b| png_icon_from_bytes(&b)))
}

/// يجلب favicon في الخلفية ويحفظه للعنصر ثم يبثّ launcher:changed.
fn spawn_favicon(app: &AppHandle, id: i64, link: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let l = link.clone();
        let icon = tauri::async_runtime::spawn_blocking(move || fetch_favicon(&l)).await.ok().flatten();
        let Some(icon) = icon else { return };
        let st = app.state::<AppState>();
        // العنصر قد يكون حُذف/عُدّل رابطه أثناء الجلب.
        let still = with_db(&st, |c| get_row(c, id)).ok().flatten().map(|r| r.path == link).unwrap_or(false);
        if still && with_db(&st, |c| set_icon(c, id, Some(&icon))).is_ok() {
            changed(&app);
        }
    });
}

// ───────────────────────── الأوامر ─────────────────────────

/// launcher_list() → كل العناصر بالترتيب: [{id, path, name, kind: app|file|dir|link, icon(base64 PNG)|null, missing}].
#[tauri::command]
pub fn launcher_list(app: AppHandle) -> Result<Vec<Item>, String> {
    Ok(with_db(&app.state::<AppState>(), list_rows)?.into_iter().map(item_of).collect())
}

fn add_paths(app: &AppHandle, paths: &[String]) -> Result<Vec<Item>, String> {
    let st = app.state::<AppState>();
    let mut out = Vec::new();
    for raw in paths {
        let p = clean_path(raw.trim());
        if p.is_empty() || (!p.to_ascii_lowercase().starts_with("shell:") && !Path::new(&p).exists()) {
            continue;
        }
        let name = name_of(&p);
        if let Some(id) = with_db(&st, |c| add(c, &p, &name))? {
            out.push(item_by_id(app, id)?);
        }
    }
    Ok(out)
}

/// launcher_add(paths?, pick?) — `paths` مسارات جاهزة، أو `pick`: "app" | "file" | "folder" يفتح منتقي ويندوز (إلغاء ⇒ فارغ).
/// يعيد العناصر المضافة فقط (المكرّر يُتجاهل) ويبثّ launcher:changed.
#[tauri::command]
pub async fn launcher_add(app: AppHandle, paths: Option<Vec<String>>, pick: Option<String>) -> Result<Vec<Item>, String> {
    let mut all = paths.unwrap_or_default();
    if let Some(mode) = pick.as_deref() {
        let mode: &'static str = match mode {
            "app" => "app",
            "folder" | "dir" => "folder",
            "file" => "file",
            other => return Err(format!("pick غير معروف: {other}")),
        };
        all.extend(pick_files(&app, mode).await?);
    }
    let out = add_paths(&app, &all)?;
    if !out.is_empty() {
        changed(&app);
    }
    Ok(out)
}

/// launcher_remove(id) — يحذف العنصر واختصاره وعضويته في المجموعات.
#[tauri::command]
pub fn launcher_remove(app: AppHandle, id: i64) -> Result<(), String> {
    let st = app.state::<AppState>();
    with_db(&st, |c| remove(c, id))?;
    let valid = valid_ids(&st)?;
    let groups = sanitize_groups(load_groups(&st), &valid);
    kv_set(&st, GROUPS_KEY, &serde_json::to_string(&groups).unwrap_or_else(|_| "[]".into()))?;
    let hk = prune_hotkeys(load_hotkeys(&st), &valid);
    kv_set(&st, HOTKEYS_KEY, &serde_json::to_string(&hk).unwrap_or_else(|_| "{}".into()))?;
    rebind(&app);
    changed(&app);
    Ok(())
}

/// launcher_launch(id) — يفتح التطبيق/الملف/المجلد/الرابط بالتطبيق الافتراضي (نفس مسار open في run_shell).
#[tauri::command]
pub fn launcher_launch(app: AppHandle, id: i64) -> Result<(), String> {
    launch(&app, id)
}

/// launcher_pick_icon(id, reset?) — منتقي صورة (png/jpg/ico/bmp/gif/webp) ⇒ أيقونة مخصّصة 64px؛ reset=true يعيد الافتراضية.
/// يعيد العنصر المحدّث، أو null عند إلغاء المنتقي.
#[tauri::command]
pub async fn launcher_pick_icon(app: AppHandle, id: i64, reset: Option<bool>) -> Result<Option<Item>, String> {
    item_by_id(&app, id)?;
    let st = app.state::<AppState>();
    if reset.unwrap_or(false) {
        with_db(&st, |c| set_icon(c, id, None))?;
    } else {
        let Some(file) = pick_files(&app, "icon").await?.into_iter().next() else { return Ok(None) };
        let bytes = std::fs::read(&file).map_err(|e| e.to_string())?;
        let png = png_icon_from_bytes(&bytes).ok_or_else(|| "الصورة غير مدعومة".to_string())?;
        with_db(&st, |c| set_icon(c, id, Some(&png)))?;
    }
    changed(&app);
    item_by_id(&app, id).map(Some)
}

/// launcher_add_link(url, name?) — يضيف رابط ويب (http/https/ftp/mailto/tel/sms)؛ favicon يُجلب تلقائيًا في الخلفية
/// ويبثّ launcher:changed عند وصوله. رابط مكرّر ⇒ خطأ.
#[tauri::command]
pub fn launcher_add_link(app: AppHandle, url: String, name: Option<String>) -> Result<Item, String> {
    let link = normalize_link(&url)?;
    let nm = name.map(|n| clamp_name(&n)).filter(|n| !n.is_empty()).unwrap_or_else(|| clamp_name(&link_name(&link)));
    let id = with_db(&app.state::<AppState>(), |c| add(c, &link, &nm))?.ok_or_else(|| "الرابط موجود مسبقًا".to_string())?;
    spawn_favicon(&app, id, link);
    changed(&app);
    item_by_id(&app, id)
}

/// launcher_edit_link(id, url?, name?) — تعديل رابط (يمسح الأيقونة ويجلب favicon الجديد) و/أو الاسم؛ الاسم يصلح لأي عنصر.
#[tauri::command]
pub fn launcher_edit_link(app: AppHandle, id: i64, url: Option<String>, name: Option<String>) -> Result<Item, String> {
    let st = app.state::<AppState>();
    let cur = item_by_id(&app, id)?;
    if let Some(u) = url.as_deref().filter(|u| !u.trim().is_empty()) {
        if cur.kind != "link" {
            return Err("الرابط يُعدَّل للروابط فقط".into());
        }
        let link = normalize_link(u)?;
        if link != cur.path {
            {
                let g = st.db.lock().unwrap();
                let c = g.as_ref().ok_or_else(|| "قاعدة البيانات غير متاحة".to_string())?;
                set_path(c, id, &link)?;
            }
            spawn_favicon(&app, id, link);
        }
    }
    if let Some(n) = name.map(|n| clamp_name(&n)).filter(|n| !n.is_empty()) {
        with_db(&st, |c| set_name(c, id, &n))?;
    }
    changed(&app);
    item_by_id(&app, id)
}

/// launcher_link_icon(url, id?) — favicon الموقع كـPNG base64 (أو null). مع id يُحفظ أيضًا للعنصر (تحديث الأيقونة).
#[tauri::command]
pub async fn launcher_link_icon(app: AppHandle, url: String, id: Option<i64>) -> Result<Option<String>, String> {
    let link = normalize_link(&url)?;
    let l = link.clone();
    let icon = tauri::async_runtime::spawn_blocking(move || fetch_favicon(&l)).await.map_err(|e| e.to_string())?;
    if let (Some(id), Some(icon)) = (id, icon.as_deref()) {
        let st = app.state::<AppState>();
        if with_db(&st, |c| get_row(c, id))?.map(|r| r.path == link).unwrap_or(false) {
            with_db(&st, |c| set_icon(c, id, Some(icon)))?;
            changed(&app);
        }
    }
    Ok(icon)
}

/// launcher_groups_get() → [{id, name, items:[itemId…]}] بترتيب المجموعات؛ العناصر خارج أي مجموعة تعرضها الواجهة أولًا.
#[tauri::command]
pub fn launcher_groups_get(app: AppHandle) -> Vec<Group> {
    load_groups(&app.state::<AppState>())
}

/// launcher_groups_set(groups) — يستبدل كل المجموعات (إنشاء/إعادة تسمية/ترتيب/نقل عناصر) بعد التنظيف؛ يعيد النسخة المحفوظة.
#[tauri::command]
pub fn launcher_groups_set(app: AppHandle, groups: Vec<Group>) -> Result<Vec<Group>, String> {
    let st = app.state::<AppState>();
    let clean = sanitize_groups(groups, &valid_ids(&st)?);
    kv_set(&st, GROUPS_KEY, &serde_json::to_string(&clean).map_err(|e| e.to_string())?)?;
    changed(&app);
    Ok(clean)
}

/// launcher_hotkeys_get() → {"<itemId>": "Ctrl+Alt+1"}.
#[tauri::command]
pub fn launcher_hotkeys_get(app: AppHandle) -> HashMap<String, String> {
    load_hotkeys(&app.state::<AppState>())
}

/// launcher_hotkeys_set(id, hotkey) — يربط اختصارًا عالميًا بالعنصر (فارغ = إزالة). يشترط معدّلًا واحدًا على الأقل،
/// ويرفض المكرّر أو ما سبقه تطبيق آخر؛ يعيد الخريطة الكاملة ويبثّ launcher:changed.
#[tauri::command]
pub fn launcher_hotkeys_set(app: AppHandle, id: i64, hotkey: String) -> Result<HashMap<String, String>, String> {
    let st = app.state::<AppState>();
    item_by_id(&app, id)?;
    let key = hotkey.trim().to_string();
    let mut map = load_hotkeys(&st);
    let ls = app.state::<LauncherState>();
    let gs = app.global_shortcut();
    let mut bound = ls.bound.lock().unwrap();
    let old: Option<(Shortcut, i64)> = bound.iter().find(|(_, v)| **v == id).map(|(k, v)| (*k, *v));

    if key.is_empty() {
        if let Some((sc, _)) = old {
            let _ = gs.unregister(sc);
            bound.remove(&sc);
        }
        map.remove(&id.to_string());
    } else {
        if !has_modifier(&key) {
            return Err("الاختصار يحتاج Ctrl أو Alt أو Shift أو Win مع مفتاح".into());
        }
        let sc = Shortcut::from_str(&key).map_err(|e| format!("اختصار غير صالح: {e}"))?;
        if let Some(other) = bound.get(&sc).filter(|o| **o != id) {
            return Err(format!("الاختصار مستعمل لعنصر آخر ({other})"));
        }
        if old.map(|(o, _)| o) != Some(sc) {
            // لا نكسر القديم قبل نجاح الجديد.
            gs.register(sc).map_err(|e| format!("تعذّر تسجيل الاختصار (مستعمل في مكان آخر؟): {e}"))?;
            if let Some((o, _)) = old {
                let _ = gs.unregister(o);
                bound.remove(&o);
            }
            bound.insert(sc, id);
        }
        map.insert(id.to_string(), key);
    }
    drop(bound);
    kv_set(&st, HOTKEYS_KEY, &serde_json::to_string(&map).map_err(|e| e.to_string())?)?;
    changed(&app);
    Ok(map)
}
