// AppState: إعدادات الموضع + قاعدة island.db + الإعدادات المدموجة (الخلفية مصدر الحقيقة).
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::{path::PathBuf, sync::Mutex};

/// قيَم الموضع — تطابق مفاتيح monitor / offsetX / offsetY / pillPosition / islandDocking في src/settings.ts.
#[derive(Clone, Copy, Debug)]
pub struct PlacementSettings {
    pub monitor: usize,
    pub offset_x: i32,
    /// إزاحة رأسية عن الحافة العليا (CSS px) — المفتاح offsetY.
    pub offset_y: i32,
    /// -1 يسار · 0 منتصف · 1 يمين — المفتاح pillPosition.
    pub align: i8,
    /// true = ملتصقة بأعلى الشاشة (صفر هامش، offsetY مُهمَل) — المفتاح islandDocking؛ false = عائمة (الافتراضي).
    pub attached: bool,
}

impl Default for PlacementSettings {
    fn default() -> Self {
        Self { monitor: 0, offset_x: 0, offset_y: 0, align: 0, attached: false }
    }
}

/// Shared defaults and validation with the frontend (no parallel hand-written defaults).
fn schema() -> &'static Map<String, Value> {
    static SCHEMA: std::sync::OnceLock<Map<String, Value>> = std::sync::OnceLock::new();
    SCHEMA.get_or_init(|| serde_json::from_str(include_str!("../../src/settingsSchema.json")).expect("settings schema"))
}
pub fn defaults() -> Map<String, Value> {
    schema().iter().filter_map(|(k,r)| r.get("default").map(|v| (k.clone(),v.clone()))).collect()
}
fn valid_value(v: &Value, r: &Value) -> bool {
    if r.get("enum").and_then(Value::as_array).is_some_and(|opts| !opts.contains(v)) { return false; }
    match r.get("type").and_then(Value::as_str).unwrap_or("") {
        "boolean" => v.is_boolean(),
        "number" => v.as_f64().is_some_and(|n| n.is_finite() && (r.get("integer") != Some(&Value::Bool(true)) || n.fract() == 0.0) && r.get("min").and_then(Value::as_f64).is_none_or(|m| n >= m) && r.get("max").and_then(Value::as_f64).is_none_or(|m| n <= m)),
        "string" => v.as_str().is_some_and(|s| s.chars().count() <= r.get("maxLength").and_then(Value::as_u64).unwrap_or(4096) as usize && r.get("pattern").and_then(Value::as_str).is_none_or(|p| match p { "^#[0-9a-fA-F]{6}$" => s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit()), "^\\d{4}-\\d{2}-\\d{2}$" => s.len() == 10 && s.bytes().enumerate().all(|(i,b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() }), _ => false })),
        "array" => v.as_array().is_some_and(|a| a.len() <= r.get("maxItems").and_then(Value::as_u64).unwrap_or(1000) as usize && (r.get("unique") != Some(&Value::Bool(true)) || a.iter().enumerate().all(|(i,x)| !a[..i].contains(x))) && r.get("items").is_none_or(|item| a.iter().all(|x| valid_value(x,item)))),
        "object" => v.as_object().is_some_and(|o| r.get("required").and_then(Value::as_array).is_none_or(|req| req.iter().all(|k| k.as_str().is_some_and(|k| o.contains_key(k)))) && r.get("properties").and_then(Value::as_object).is_none_or(|props| o.iter().all(|(k,x)| props.get(k).is_some_and(|rule| valid_value(x,rule))))),
        _ => false,
    }
}

/// مفاتيح إعدادات أُزيلت ميزاتها؛ تُحذف عند فتح القاعدة ولا تعود للواجهة.
pub const OBSOLETE_KEYS: &[&str] = &[ // + مفاتيح بلا واجهة ولا مستهلك (ARCH-UI): تُحذف من kv عند الإقلاع
    "agentsAsk", "agentsStatus", "aiBaseUrl", "aiModels", "character", "characterMusic", "checkUpdates", "controlsNet", "dictatePaste", "gpuAcceleration", "hideForApps", "hideForAppsMode", "homePlayer", "hotkeyChat", "hotkeyClipboard", "hotkeyDictate", "hotkeyMic", "hotkeyOcr", "hotkeyPlainPaste", "hotkeyQr", "hotkeyThrough", "hotkeyVpn", "keepForApps", "moduleControls", "moduleWeather", "notifyMuted", "obsPort", "obsStatus", "opacityThrough", "showCaps", "showLayout", "showNotifications", "showOnDesktop", "showPrivacy", "showVpn", "sttBaseUrl", "sttLanguage", "sttModel", "uploadKey", "uploadService", "vpnLookupIp", "weatherAlerts", "weatherLat", "weatherLon",
    "hotkeyToggle", "browserTabMode", "underTaskbar", "lyricsInHome", "lyricsInPlayer", "collapseDelayMs", "animSpeed", "springStyle", "glassBlur", "glassSaturation"];
// glassBlur/glassSaturation: منزلقا تمويه/تشبّع وهميان (لا أثر على ويندوز) — حُذفا نهائيًا مع إزالة SWCA؛ يُنظَّف kv القديم عند الفتح (docs/GLASS.md).

/// ترحيل T03 في kv (idempotent): springStyle ⇒ motionPreset (snappy⇒snappy وغيره⇒calm مع ارتداد النمط) · animSpeed(50..150) ⇒ motionSpeed(0.5..2)
/// · reduceMotion من bool إلى "always"|"system". المفاتيح القديمة تُحذف بعده (OBSOLETE_KEYS). يطابق منطق src/islandMotion.ts.
pub fn migrate_t03(conn: &Connection) {
    let get = |k: &str| -> Option<Value> {
        conn.query_row("SELECT value FROM kv WHERE key = ?1", [k], |r| r.get::<_, String>(0)).ok().and_then(|v| serde_json::from_str(&v).ok())
    };
    let put = |k: &str, v: Value| {
        let _ = conn.execute("INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v.to_string()));
    };
    if get("motionPreset").is_none() {
        if let Some(Value::String(st)) = get("springStyle") {
            let snappy = st == "snappy";
            put("motionPreset", json!(if snappy { "snappy" } else { "calm" }));
            put("motionBounce", json!(if snappy { 0.15 } else { 0.1 }));
        }
    }
    if get("motionSpeed").is_none() {
        if let Some(n) = get("animSpeed").and_then(|v| v.as_f64()) {
            put("motionSpeed", json!((n / 100.0).clamp(0.5, 2.0)));
        }
    }
    if let Some(Value::Bool(b)) = get("reduceMotion") {
        put("reduceMotion", json!(if b { "always" } else { "system" }));
    }
}

/// Accept only schema keys with valid ranges, enums and nested values.
pub fn filter_patch(patch: Map<String, Value>) -> Map<String, Value> {
    let mut ok = Map::new();
    for (k,v) in patch {
        if schema().get(&k).is_some_and(|r| valid_value(&v,r)) { ok.insert(k,v); }
    }
    ok
}

pub struct AppState {
    pub settings_write: Mutex<()>,
    pub placement: Mutex<PlacementSettings>,
    pub hidden: Mutex<bool>,
    /// آخر مستطيل للحبة أبلغت عنه الواجهة (بوحدات CSS: عرض، ارتفاع).
    pub island_size: Mutex<(f64, f64)>,
    /// اتصال island.db (WAL). None إن تعذّر الفتح (نعمل بالافتراضيات فقط).
    pub db: Mutex<Option<Connection>>,
    /// الإعدادات المدموجة: DEFAULTS ثم kv.
    pub settings: Mutex<Map<String, Value>>,
    /// مجلد بيانات التطبيق (island.db وclips/ فيه) — يُضبط في init_db.
    pub data_dir: Mutex<Option<PathBuf>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            settings_write: Mutex::new(()),
            placement: Mutex::default(),
            hidden: Mutex::default(),
            island_size: Mutex::default(),
            db: Mutex::new(None),
            settings: Mutex::new(defaults()),
            data_dir: Mutex::new(None),
        }
    }
}

impl AppState {
    /// يفتح island.db في dir، ينفّذ schema.sql، ويدمج kv فوق الافتراضيات.
    pub fn init_db(&self, dir: PathBuf) -> Result<(), String> {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut conn = Connection::open(dir.join("island.db")).map_err(|e| e.to_string())?;
        conn.execute_batch(include_str!("../schema.sql")).map_err(|e| e.to_string())?;
        crate::migrate::run(&mut conn, crate::migrate::MIGRATIONS).map_err(|e| e.to_string())?;
        // ترحيل: مفاتيح أُزيلت ميزاتها (وضع تبويب المتصفح، «تحت شريط المهام»، كلمات الأغاني + ذاكرتها) تُحذف من kv مرة واحدة/دائمًا (idempotent).
        migrate_t03(&conn); // قبل الحذف: يقرأ القيم القديمة ويكتب المفاتيح الجديدة
        for k in OBSOLETE_KEYS { let _ = conn.execute("DELETE FROM kv WHERE key = ?1", [k]); }
        let _ = conn.execute("DELETE FROM kv WHERE key LIKE 'lyrics:%'", []);
        let mut merged = defaults();
        {
            let mut st = conn.prepare("SELECT key, value FROM kv").map_err(|e| e.to_string())?;
            let rows = st
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(|e| e.to_string())?;
            for (k, v) in rows.flatten() {
                // الأخيرة في شريط الأوامر (palette.rs) ليست إعدادات.
                if k == crate::palette::RECENT_KEY { continue; }
                // سجل الألوان (color.rs) ليس إعدادًا.
                if k == crate::color::HISTORY_KEY { continue; }
                // مجموعات واختصارات اللانشر (launcher.rs) ليست إعدادات.
                if k.starts_with(crate::launcher::KV_PREFIX) { continue; }
                // الملاحظة والتذكيرات والمؤقّت (note.rs) ليست إعدادات.
                if k.starts_with(crate::note::KV_PREFIX) { continue; }
                // كاش أسعار العملات (rates.rs) ليس إعدادًا.
                if k == crate::rates::KV_KEY { continue; }
                if let Ok(val) = serde_json::from_str::<Value>(&v) {
                    if schema().get(&k).is_some_and(|r| valid_value(&val,r)) { merged.insert(k, val); }
                }
            }
        }
        self.sync_placement(&merged);
        *self.settings.lock().unwrap() = merged;
        *self.db.lock().unwrap() = Some(conn);
        *self.data_dir.lock().unwrap() = Some(dir);
        Ok(())
    }

    /// يحدّث PlacementSettings من الإعدادات المدموجة.
    pub fn sync_placement(&self, s: &Map<String, Value>) {
        let mut p = self.placement.lock().unwrap();
        if let Some(v) = s.get("monitor").and_then(Value::as_u64) { p.monitor = v as usize; }
        if let Some(v) = s.get("offsetX").and_then(Value::as_i64) { p.offset_x = v as i32; }
        if let Some(v) = s.get("offsetY").and_then(Value::as_i64) { p.offset_y = (v as i32).clamp(0, 60); }
        if let Some(v) = s.get("pillPosition").and_then(Value::as_str) { p.align = match v { "left" => -1, "right" => 1, _ => 0 }; }
        if let Some(v) = s.get("islandDocking").and_then(Value::as_str) { p.attached = v == "attached"; }
    }

    /// يحفظ كل مفتاح في kv كـ JSON ويدمجه في الذاكرة؛ يعيد المقطع المطبّق.
    pub fn apply_patch(&self, patch: Map<String, Value>) -> Result<Map<String, Value>, String> {
        let patch = filter_patch(patch);
        if patch.is_empty() { return Ok(patch); }
        {
            let mut db = self.db.lock().unwrap();
            let conn = db.as_mut().ok_or("Settings storage is unavailable")?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            for (k, v) in &patch {
                tx.execute(
                    "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (k, v.to_string()),
                )
                .map_err(|e| e.to_string())?;
            }
            tx.commit().map_err(|e| e.to_string())?;
        }
        let mut s = self.settings.lock().unwrap();
        for (k, v) in &patch { s.insert(k.clone(), v.clone()); }
        self.sync_placement(&s);
        Ok(patch)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch(v: Value) -> Map<String, Value> {
        let Value::Object(m) = v else { panic!("object expected") };
        m
    }

    #[test]
    fn shared_schema_defaults_and_bounds() {
        assert_eq!(filter_patch(defaults()), defaults());
        for bad in [json!({"motionSpeed":999}), json!({"pillWidth":-1}), json!({"themeMode":"invalid"}), json!({"monitor":0.5}), json!({"workspaces":["wrong"]}), json!({"themeTune":{"pillScale":999}}), json!({"fx":{}})] { assert!(filter_patch(patch(bad)).is_empty()); }
    }
    #[test]
    fn unavailable_storage_never_claims_success() {
        let s = AppState::default();
        assert!(s.apply_patch(patch(json!({"language":"en"}))).is_err());
        assert_eq!(s.settings.lock().unwrap().get("language"),Some(&json!("ar")));
    }
    #[test]
    fn persistence_round_trip_and_invalid_stored_values() {
        let dir = std::env::temp_dir().join(format!("island-settings-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let s = AppState::default(); s.init_db(dir.clone()).unwrap();
        s.apply_patch(patch(json!({"language":"en","clockScale":120}))).unwrap();
        s.db.lock().unwrap().as_ref().unwrap().execute("INSERT OR REPLACE INTO kv(key,value) VALUES('motionSpeed','999')",[]).unwrap();
        let next = AppState::default(); next.init_db(dir.clone()).unwrap();
        let got = next.settings.lock().unwrap();
        assert_eq!(got.get("language"),Some(&json!("en")));
        assert_eq!(got.get("clockScale"),Some(&json!(120)));
        assert_eq!(got.get("motionSpeed"),Some(&json!(1)));
        drop(got); drop(next); drop(s); let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn valid_patch_passes() {
        let p = patch(json!({ "language": "en", "hoverDelayMs": 300, "motionSpeed": 1.5, "ecoMode": true, "peekCardOrder": ["player"], "monitor": 1, "workspaces": [] }));
        assert_eq!(filter_patch(p.clone()), p);
        assert!(filter_patch(Map::new()).is_empty());
    }

    #[test]
    fn unknown_key_dropped_others_kept() {
        let f = filter_patch(patch(json!({ "language": "ar", "evil": 1 })));
        assert_eq!(f, patch(json!({ "language": "ar" })));
    }

    #[test]
    fn colon_keys_dropped() {
        assert!(filter_patch(patch(json!({ "palette:recent": "[]", "note:body": "x" }))).is_empty());
        let f = filter_patch(patch(json!({ "palette:recent": "[]", "language": "en" })));
        assert_eq!(f, patch(json!({ "language": "en" })));
    }

    #[test]
    fn wrong_type_dropped() {
        for p in [
            json!({ "hoverDelayMs": "250" }),
            json!({ "ecoMode": 1 }),
            json!({ "peekCardOrder": "player" }),
            json!({ "autostart": "yes" }),
            json!({ "language": null }),
        ] {
            assert!(filter_patch(patch(p)).is_empty());
        }
        let f = filter_patch(patch(json!({ "ecoMode": 1, "monitor": 2 })));
        assert_eq!(f, patch(json!({ "monitor": 2 })));
    }

    #[test]
    fn secrets_not_settable() {
        assert!(filter_patch(patch(json!({ "uploadKey": "k" }))).is_empty());
    }
}

