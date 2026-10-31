// طبقة الأوامر العامة — الأسماء حرفيًا من docs/IPC.md.
use crate::{state::AppState, win};
use serde_json::{Map, Value};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub fn set_island_hidden(app: AppHandle, hidden: bool) {
    win::set_hidden(&app, hidden);
}

/// الواجهة تبلّغ بأبعاد الحبة (CSS px).
#[tauri::command]
pub fn report_island_rect(app: AppHandle, state: State<AppState>, width: f64, height: f64) {
    *state.island_size.lock().unwrap() = (width, height);
    win::resize_to_island(&app, width, height);
}

/// الإعدادات المدموجة (DEFAULTS + kv) — الخلفية مصدر الحقيقة.
#[tauri::command]
pub fn settings_get(state: State<AppState>) -> Map<String, Value> {
    state.settings.lock().unwrap().clone()
}

/// يحفظ مقطعًا جزئيًا من الإعدادات في kv ويبث settings:changed بالمقطع.
#[tauri::command]
pub fn settings_set(app: AppHandle, state: State<AppState>, patch: Map<String, Value>) -> Result<(), String> {
    let applied = state.apply_patch(patch)?;
    if applied.keys().any(|k| matches!(k.as_str(), "monitor" | "offsetX" | "underTaskbar")) {
        win::position_main(&app);
    }
    if applied.contains_key("hotkeyPalette") {
        crate::palette::rebind(&app);
    }
    if applied.keys().any(|k| matches!(k.as_str(), "hotkeyArea" | "hotkeyScreen")) {
        crate::capture::rebind(&app);
    }
    if applied.contains_key("captureVisible") {
        crate::capture::apply_affinity(&app);
    }
    if applied.keys().any(|k| matches!(k.as_str(), "paletteFiles" | "paletteFolders")) {
        crate::files::files_warm(app.clone());
    }
    if let Some(on) = applied.get("autostart").and_then(Value::as_bool) {
        crate::autostart::apply(on)?;
    }
    let _ = app.emit("settings:changed", applied);
    Ok(())
}

/// الحبة تأخذ فوكس الكيبورد (حقل البحث فقط) — الاستثناء الوحيد من WS_EX_NOACTIVATE.
#[tauri::command]
pub fn take_focus(app: AppHandle) {
    win::take_focus(&app);
}

/// تعيد NOACTIVATE وتردّ الفوكس لآخر نافذة تطبيق كانت أمامية.
/// restore=false (شريط الأوامر عند فقدان الفوكس لتطبيق آخر): NOACTIVATE فقط بلا ردّ فوكس.
#[tauri::command]
pub fn release_focus(app: AppHandle, restore: Option<bool>) {
    if restore == Some(false) {
        win::drop_focus(&app);
    } else {
        win::release_focus(&app);
    }
}

/// يفتح نافذة الإعدادات (يُظهرها ويمنحها الفوكس — هي نافذة عادية لا NOACTIVATE).
#[tauri::command]
pub fn open_settings(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[derive(Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
    /// موضع الشاشة بالبكسلات الفعلية في سطح المكتب الافتراضي.
    pub x: i32,
    pub y: i32,
    /// معامل DPI لهذه الشاشة (1.0 = 100%).
    pub scale: f64,
}

/// الشاشات بترتيب الفهرس نفسه الذي يستعمله monitor في win::position_main.
#[tauri::command]
pub fn monitors_list(app: AppHandle) -> Vec<MonitorInfo> {
    let primary = app.primary_monitor().ok().flatten().map(|m| (m.position().x, m.position().y));
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(index, m)| MonitorInfo {
            index,
            name: m.name().cloned().unwrap_or_default(),
            width: m.size().width,
            height: m.size().height,
            primary: primary == Some((m.position().x, m.position().y)),
            x: m.position().x,
            y: m.position().y,
            scale: m.scale_factor(),
        })
        .collect()
}
