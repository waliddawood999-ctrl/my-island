// هيكل الوحدات — يعكس شجرة الأصل المستعادة من الباينري (27 وحدة)
// فعّل الوحدات مرحلةً مرحلة حسب خطة المخطط (BLUEPRINT.md §11)
pub mod state;      // AppState: إعدادات + جلسات + حالة النوافذ
pub mod commands;   // طبقة الأوامر العامة (settings_get/set ...)
pub mod win;        // موضع/إخفاء/فوكس النافذة الرئيسية
pub mod watchdog;   // نبض page_pong وإعادة تحميل الصفحة الصامتة
pub mod clipboard;  // مستمع الحافظة + جدول clips
// pub mod media;   // SMTC
// pub mod spectrum;   // WASAPI loopback + FFT
// pub mod player_audio;
// pub mod lyrics;     // LRCLIB
// pub mod downloads;  // + steam.rs لتنزيلات Steam
// pub mod steam;
// pub mod capture;    // لقطات + overlay
// pub mod recorder;   // Media Foundation / GIF
// pub mod ocr;        // Windows.Media.Ocr
// pub mod ai;         // بث SSE لأي OpenAI-compatible
// pub mod attach;     // استخراج نصوص المرفقات محليًا
// pub mod dictation;  // Whisper عند المزوّد
// pub mod agents;     // Claude Code hooks + Codex notify
// pub mod vpn; pub mod controls; pub mod audio; pub mod privacy;
// pub mod files;      // فهرس شريط الأوامر (ذاكرة فقط)
// pub mod linkicon;   // favicon / أيقونة exe
// pub mod drop_target;
// pub mod obs;        // WebSocket محلي
// pub mod license;    // Pro أوفلاين + trialStart
// pub mod updater;    // minisign عبر tauri-plugin-updater

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    // اختصار تبديل الإخفاء الافتراضي (hotkeyToggle يُربط بالإعدادات لاحقًا).
    let toggle = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyI);

    tauri::Builder::default()
        .manage(state::AppState::default())
        .manage(watchdog::WatchdogState::default())
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, ev| {
                    if sc == &toggle && ev.state() == ShortcutState::Pressed {
                        win::toggle_hidden(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            // island.db: ISLAND_DATA_DIR يتجاوز مجلد بيانات التطبيق.
            let dir = std::env::var_os("ISLAND_DATA_DIR")
                .map(std::path::PathBuf::from)
                .or_else(|| app.path().app_data_dir().ok());
            watchdog::start(app.handle(), dir.clone());
            if let Some(dir) = dir {
                if let Err(e) = app.state::<state::AppState>().init_db(dir) {
                    eprintln!("تعذّر فتح island.db: {e}");
                } else {
                    clipboard::start(app.handle());
                }
            }
            if let Some(w) = app.get_webview_window(win::MAIN) {
                win::apply_noactivate(&w);
                let _ = w.set_always_on_top(true);
                let _ = w.set_skip_taskbar(true);
            }
            win::position_main(app.handle());
            if let Err(e) = app.global_shortcut().register(toggle) {
                eprintln!("تعذّر تسجيل Ctrl+Alt+I: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_island_hidden,
            commands::report_island_rect,
            commands::settings_get,
            commands::settings_set,
            watchdog::page_pong,
            clipboard::clip_list,
            clipboard::clip_delete,
            clipboard::clip_clear,
            clipboard::clip_pin,
            clipboard::clip_current_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
