// طبقة الأوامر العامة — الأسماء حرفيًا من docs/IPC.md.
use crate::{state::AppState, win};
use serde_json::{Map, Value};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn set_island_hidden(app: AppHandle, hidden: bool) {
    win::set_hidden(&app, hidden);
}

/// الواجهة تبلّغ بشكل الجزيرة الهدف (CSS px؛ radius اختياري): تضبط منطقة النافذة الثابتة — لا تغيّر حجم النافذة.
#[tauri::command]
pub fn report_island_rect(app: AppHandle, state: State<AppState>, width: f64, height: f64, radius: Option<f64>) {
    *state.island_size.lock().unwrap() = (width, height);
    win::resize_to_island(&app, width, height, radius);
}

/// الإعدادات المدموجة (DEFAULTS + kv) — الخلفية مصدر الحقيقة.
#[tauri::command]
pub fn settings_get(state: State<AppState>) -> Map<String, Value> {
    state.settings.lock().unwrap().clone()
}

/// يحفظ مقطعًا جزئيًا من الإعدادات في kv ويبث settings:changed بالمقطع.
#[tauri::command]
pub fn settings_set(app: AppHandle, state: State<AppState>, patch: Map<String, Value>) -> Result<(), String> {
    let _write = state.settings_write.lock().unwrap();
    let validated = crate::state::filter_patch(patch.clone());
    if validated.len() != patch.len() { return Err("Invalid settings values".into()); }
    let old_autostart = state.settings.lock().unwrap().get("autostart").and_then(Value::as_bool).unwrap_or(false);
    let autostart = validated.get("autostart").and_then(Value::as_bool);
    if let Some(on) = autostart { crate::autostart::apply(on)?; }
    let applied = match state.apply_patch(validated) {
        Ok(p) => p,
        Err(e) => {
            if autostart.is_some() {
                if let Err(rollback) = crate::autostart::apply(old_autostart) { return Err(format!("{e}; autostart rollback failed: {rollback}")); }
            }
            return Err(e);
        }
    };
    if applied.keys().any(|k| matches!(k.as_str(), "monitor" | "offsetX" | "offsetY" | "pillPosition" | "islandDocking" | "hoverZone")) {
        win::position_main(&app);
    }
    if applied.contains_key("hideInFullscreen") {
        crate::fullscreen::recheck(&app);
    }
    if applied.contains_key("hotkeyPalette") {
        crate::palette::rebind(&app);
    }
    if applied.keys().any(|k| matches!(k.as_str(), "hotkeyArea" | "hotkeyScreen")) {
        crate::capture::rebind(&app);
    }
    if applied.contains_key("hotkeyRecord") {
        crate::recorder::rebind(&app);
    }
    if applied.contains_key("hotkeyColor") {
        crate::color::rebind(&app);
    }
    if applied.contains_key("moduleLauncher") {
        crate::launcher::rebind(&app);
    }
    if applied.contains_key("captureVisible") {
        crate::capture::apply_affinity(&app);
    }
    if applied.keys().any(|k| matches!(k.as_str(), "paletteFiles" | "paletteFolders")) {
        crate::files::files_warm(app.clone());
    }
    if applied.keys().any(|k| matches!(k.as_str(), "ecoMode" | "ecoOnBattery")) {
        crate::perf::recompute(&app);
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

/// ينهي عملية التطبيق كاملة بنظافة (app.exit يمرّ بدورة الإغلاق العادية فتُحرَّر الاختصارات وتُغلق النوافذ). لا يمسّ autostart.
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}

/// يفتح نافذة الإعدادات (تُنشأ عند أول طلب ثم تُعرض وتُركَّز؛ هي نافذة عادية لا NOACTIVATE). async كي لا يُبنى الـwebview على الخيط الرئيسي.
#[tauri::command]
pub async fn open_settings(app: AppHandle) {
    let _ = crate::lazywin::open(&app, &crate::lazywin::SETTINGS);
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

