// طبقة الأوامر العامة — الأسماء حرفيًا من docs/IPC.md.
use crate::{state::AppState, win};
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, State};

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
    let _ = app.emit("settings:changed", applied);
    Ok(())
}
