// AppState: إعدادات الموضع + قاعدة island.db + الإعدادات المدموجة (الخلفية مصدر الحقيقة).
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::{path::PathBuf, sync::Mutex};

/// قيَم الموضع — تطابق مفاتيح monitor / offsetX / underTaskbar في src/settings.ts.
#[derive(Clone, Copy, Debug)]
pub struct PlacementSettings {
    pub monitor: usize,
    pub offset_x: i32,
    pub under_taskbar: bool,
}

impl Default for PlacementSettings {
    fn default() -> Self {
        Self { monitor: 0, offset_x: 0, under_taskbar: false }
    }
}

/// مرآة DEFAULTS من src/settings.ts — أبقِهما متطابقتين.
pub fn defaults() -> Map<String, Value> {
    let Value::Object(m) = json!({
        "language": "ar",
        "hoverDelayMs": 250,
        "collapseDelayMs": 350,
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
        "eyesEnabled": true
    }) else { unreachable!() };
    m
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
        let mut merged = defaults();
        {
            let mut st = conn.prepare("SELECT key, value FROM kv").map_err(|e| e.to_string())?;
            let rows = st
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(|e| e.to_string())?;
            for (k, v) in rows.flatten() {
                // ذاكرة كلمات الأغاني المؤقتة (lyrics.rs) ليست إعدادات.
                if k.starts_with(crate::lyrics::CACHE_PREFIX) { continue; }
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
        if let Some(v) = s.get("underTaskbar").and_then(Value::as_bool) { p.under_taskbar = v; }
    }

    /// يحفظ كل مفتاح في kv كـ JSON ويدمجه في الذاكرة؛ يعيد المقطع المطبّق.
    pub fn apply_patch(&self, patch: Map<String, Value>) -> Result<Map<String, Value>, String> {
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
