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

/// مرآة DEFAULTS من src/settings.ts — أبقِهما متطابقتين.
pub fn defaults() -> Map<String, Value> {
    let Value::Object(m) = json!({
        "language": "ar",
        "hoverDelayMs": 250,
        "clockFormat": "auto",
        "aiBaseUrl": "https://api.groq.com/openai/v1",
        "sttBaseUrl": "https://api.groq.com/openai/v1",
        "sttModel": "whisper-large-v3-turbo",
        "recordingFps": 30,
        "recordFormat": "mp4",
        "hotkeyPalette": "Alt+Space",
        "hotkeyArea": "Ctrl+Alt+A",
        "hotkeyScreen": "Ctrl+Alt+S",
        "hotkeyRecord": "Ctrl+Alt+R",
        "hotkeyColor": "Ctrl+Alt+C",
        "recordingQuality": "medium",
        "checkUpdates": true,
        "attentionTracking": true,
        "breakReminders": false,
        "breakMinutes": 60,
        "btBatteries": true,
        "batteryTip": true,
        "liveRates": true,
        "ecoMode": false,
        "ecoOnBattery": false,
        "motionLevel": "full",
        "eyesEnabled": true,
        "pillWidth": 220,
        "pillHeight": 34,
        "themeMode": "system",
        "themeMaterial": "glass",
        "glassStyle": "crystal",
        "accentColor": "#4fd1c5",
        "borderStrength": 50,
        "shadowStrength": 50,
        "cornerStyle": "rounded",
        "fontScale": 100,
        "density": "comfortable",
        "pillRadius": 0,
        "offsetY": 0,
        "pillPosition": "center",
        "islandDocking": "floating",
        "motionPreset": "calm",
        "motionSpeed": 1.0,
        "motionBounce": 0.1,
        "reduceMotion": "system",
        "peekWidth": 460,
        "peekHeight": 148,
        "peekRadius": 30,
        "panelWidth": 520,
        "panelHeight": 290,
        "panelRadius": 34,
        "hoverZone": "island",
        "peekWheelCycle": true,
        "peekCardOrder": ["player", "today", "weather", "timer"],
        "panelWheelPaging": true,
        "panelTabsStyle": "icons",
        "backgroundOpacity": 1.0,
        "accentMode": "auto",
        "playerLayout": "compact",
        "visualizer": "bars",
        "showPlaybackTime": true,
        "showSourceBadge": true,
        "showProgress": true,
        "artworkBackdrop": true,
        "glassTint": 45,
        "browserTabMode": false,
        "showNetSpeed": false,
        "meetingLeadMin": 15,
        "loadAlert": false,
        "showToday": true,
        "prayerCity": "riyadh",
        "weatherCity": "madinah",
        "soundChoice": "chime",
        "soundVolume": 70,
        "prayerAlerts": true,
        "updateAutoCheck": true,
        "settingsVersion": 3,
        "showCountdowns": true,
        "countdowns": [],
        "showWorldClock": false,
        "worldClocks": []
    }) else { unreachable!() };
    m
}

/// مفاتيح إعدادات أُزيلت ميزاتها؛ تُحذف عند فتح القاعدة ولا تعود للواجهة.
pub const OBSOLETE_KEYS: &[&str] = &["browserTabMode", "underTaskbar", "lyricsInHome", "lyricsInPlayer", "collapseDelayMs", "animSpeed", "springStyle", "glassBlur", "glassSaturation"];
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

/// مفاتيح واجهة Settings في src/settings.ts التي لا افتراضي لها في DEFAULTS — (المفتاح، نوع JSON). uploadKey مستثنى عمدًا (الأسرار لا تدخل الإعدادات).
const EXTRA_KEYS: &[(&str, &str)] = &[
    ("autostart", "bool"), ("monitor", "number"), ("offsetX", "number"), ("style", "string"),
    ("opacityRest", "number"), ("opacityOpen", "number"), ("opacityThrough", "number"),
    ("gpuAcceleration", "bool"), ("autoHide", "bool"), ("showOnDesktop", "bool"), ("hideInFullscreen", "bool"),
    ("hideForApps", "array"), ("keepForApps", "array"), ("hideForAppsMode", "string"), ("through", "bool"),
    ("captureVisible", "bool"), ("showClock", "bool"), ("showBattery", "bool"), ("mediaPill", "string"),
    ("homePlayer", "string"), ("liquidSpectrum", "bool"), ("mascot", "string"), ("character", "string"),
    ("characterMusic", "string"), ("screenshotDir", "string"), ("recordingDir", "string"), ("uploadService", "string"),
    ("clipLimit", "number"), ("clipExcludedApps", "array"), ("pasteOnClick", "bool"),
    ("moduleMedia", "bool"), ("moduleShelf", "bool"), ("moduleLauncher", "bool"), ("moduleControls", "bool"), ("moduleWeather", "bool"),
    ("controlsNet", "string"), ("showVolume", "bool"), ("showLayout", "bool"), ("showCaps", "bool"),
    ("obsStatus", "bool"), ("obsPort", "number"), ("agentsStatus", "bool"), ("agentsAsk", "bool"),
    ("showPrivacy", "bool"), ("privacyIndicator", "bool"), ("showMeetings", "bool"),
    ("showVpn", "bool"), ("vpnLookupIp", "bool"), ("showNotifications", "bool"), ("notifyMuted", "array"),
    ("paletteFiles", "bool"), ("paletteFolders", "bool"), ("searchEngine", "string"), ("searchUrl", "string"),
    ("workspaces", "array"), ("weatherLat", "number"), ("weatherLon", "number"), ("weatherUnits", "string"),
    ("showWeather", "bool"), ("weatherAlerts", "bool"), ("aiModels", "array"), ("sttLanguage", "string"), ("dictatePaste", "bool"),
    ("hotkeyToggle", "string"), ("hotkeyChat", "string"), ("hotkeyDictate", "string"), ("hotkeyOcr", "string"),
    ("hotkeyClipboard", "string"), ("hotkeyPlainPaste", "string"), ("hotkeyMic", "string"), ("hotkeyQr", "string"),
    ("hotkeyThrough", "string"), ("hotkeyVpn", "string"),
];

fn json_kind(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "bool",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// يرشّح مقطع إعدادات مفتاحًا مفتاحًا: يُبقي المعروف (DEFAULTS + EXTRA_KEYS) بنفس نوع JSON فقط.
/// ما فيه ':' (kv مشترك مع بيانات أخرى) أو المجهول أو سيّئ النوع يُسقَط ويُسجَّل بـ eprintln! دون رفض بقية المقطع.
pub fn filter_patch(patch: Map<String, Value>) -> Map<String, Value> {
    let defs = defaults();
    let mut ok = Map::new();
    for (k, v) in patch {
        let want = if k.contains(':') {
            eprintln!("settings: مفتاح مرفوض (يحوي ':'): {k}");
            continue;
        } else if let Some(d) = defs.get(&k) {
            json_kind(d)
        } else if let Some((_, t)) = EXTRA_KEYS.iter().find(|(n, _)| *n == k) {
            *t
        } else {
            eprintln!("settings: مفتاح غير معروف أُسقط: {k}");
            continue;
        };
        if want != json_kind(&v) {
            eprintln!("settings: {k} أُسقط (النوع {} بدل {want})", json_kind(&v));
            continue;
        }
        ok.insert(k, v);
    }
    ok
}

pub struct AppState {
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
                    merged.insert(k, val);
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
        if let Some(conn) = self.db.lock().unwrap().as_mut() {
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
