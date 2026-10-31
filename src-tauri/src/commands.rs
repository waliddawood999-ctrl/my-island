// طبقة الأوامر العامة — الأسماء حرفيًا من docs/IPC.md.
use crate::{state::AppState, win};
use tauri::{AppHandle, State};

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
