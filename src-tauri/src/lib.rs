// هيكل الوحدات — يعكس شجرة الأصل المستعادة من الباينري (27 وحدة)
// فعّل الوحدات مرحلةً مرحلة حسب خطة المخطط (BLUEPRINT.md §11)
pub mod migrate;    // ترحيلات island.db المرقّمة
pub mod attention;  // وقتي: زمن تركيز التطبيقات + تذكير الاستراحة
pub mod state;      // AppState: إعدادات + جلسات + حالة النوافذ
pub mod commands;   // طبقة الأوامر العامة (settings_get/set ...)
pub mod win;        // موضع/إخفاء/فوكس النافذة الرئيسية
pub mod watchdog;   // نبض page_pong وإعادة تحميل الصفحة الصامتة
pub mod clipboard;  // مستمع الحافظة + جدول clips
pub mod autostart;  // مفتاح Run في ريجيستري ويندوز
pub mod media;      // SMTC: ما يُشغَّل الآن + التحكم
pub mod spectrum;   // WASAPI loopback + FFT
// pub mod player_audio;
pub mod lyrics;     // LRCLIB
pub mod downloads;  // مجلد التنزيلات + Steam (مدمج في الملف نفسه)
pub mod battery;    // GetSystemPowerStatus
pub mod capture;    // لقطات منطقة/شاشة + overlay
pub mod recorder;   // Media Foundation (H.264) / GIF
pub mod color;      // منتقي الألوان + السجل
pub mod editor;     // نافذة محرّر اللقطات
pub mod shelf;      // الرفّ: ملفات/نص/صور مؤقتة + سحب أصلي للخارج
pub mod launcher;   // اللانشر: تطبيقات/ملفات/مجلدات/روابط + مجموعات + اختصارات عالمية
pub mod today;      // لوحة اليوم: مواقيت أم القرى + تنبيهات + طقس Open-Meteo
pub mod sysinfo;    // استخدام المعالج/الذاكرة عند الطلب فقط
pub mod audio;      // مستوى الصوت والكتم (IAudioEndpointVolume)
pub mod brightness; // سطوع الابتوب (WMI) عند الطلب
pub mod privacy;    // مؤشر مايك/كاميرا من ConsentStore
pub mod secrets;    // مخزن الأسرار المشفّر بـ DPAPI
pub mod ical;       // محلّل ICS + RRULE + روابط الانضمام (منطق خالص)
pub mod meetings;   // الاجتماعات القادمة من رابط iCal + تنبيهات
pub mod note;       // الملاحظة + التذكيرات + المؤقّت (kv `note:*` + خيط جدولة)
// pub mod ocr;        // Windows.Media.Ocr
// pub mod ai;         // بث SSE لأي OpenAI-compatible
// pub mod attach;     // استخراج نصوص المرفقات محليًا
// pub mod dictation;  // Whisper عند المزوّد
// pub mod agents;     // Claude Code hooks + Codex notify
// pub mod vpn; pub mod controls; pub mod audio; pub mod privacy;
pub mod files;      // فهرس شريط الأوامر (ذاكرة فقط) + تطبيقات + أيقونات
pub mod perf;       // الأداء والتوفير: وضع Eco + استهلاك رام التطبيق
pub mod lazywin;    // نافذتا الإعدادات/المحرّر عند الطلب (تُنشآن عند أول فتح وتُدمَّران عند الإغلاق)
pub mod backdrop;   // زجاج حقيقي (Acrylic عبر DWM) لنافذة main عند themeMaterial=glass
pub mod mascot;     // عيون التميمة: موضع المؤشر الحقيقي (mascot:look)، خيط مركون ما لم يُفعَّل
pub mod rates;      // أسعار العملات الحية لشريط الأوامر (open.er-api.com، كاش 12 ساعة)
pub mod palette;    // اختصار شريط الأوامر + الأخيرة + run_shell
pub mod netspeed;   // سرعتا الشبكة للكبسولة المدمجة (مفتاح showNetSpeed، خيط مركون ما لم يُفعَّل)
// linkicon: مدمج في launcher.rs (favicon الروابط)
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
        .manage(media::MediaState::default())
        .manage(downloads::DownloadsState::default())
        .manage(files::FilesState::default())
        .manage(palette::PaletteState::default())
        .manage(capture::CaptureState::default())
        .manage(recorder::RecorderState::default())
        .manage(color::ColorState::default())
        .manage(editor::EditorState::default())
        .manage(shelf::ShelfState::default())
        .manage(launcher::LauncherState::default())
        .manage(note::NoteState::default())
        .manage(sysinfo::SysState::default())
        .manage(meetings::MeetingsState::default())
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, ev| {
                    if ev.state() != ShortcutState::Pressed { return; }
                    if sc == &toggle {
                        win::toggle_hidden(app);
                    } else if palette::is_palette(app, sc) {
                        palette::open(app);
                    } else if capture::on_shortcut(app, sc) {
                    } else if recorder::on_shortcut(app, sc) {
                    } else if launcher::on_shortcut(app, sc) {
                    } else {
                        color::on_shortcut(app, sc);
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
            win::start_tracker();
            win::start_fullscreen_watch(app.handle().clone());
            if let Some(dir) = dir {
                if let Err(e) = app.state::<state::AppState>().init_db(dir) {
                    eprintln!("تعذّر فتح island.db: {e}");
                } else {
                    clipboard::start(app.handle());
                    media::start(app.handle());
                    spectrum::start(app.handle());
                    downloads::start(app.handle());
                    battery::start(app.handle());
                    attention::start(app.handle());
                    perf::start(app.handle());
                    mascot::start(app.handle());
                    netspeed::start(app.handle());
                    files::start(app.handle());
                    palette::rebind(app.handle());
                    capture::rebind(app.handle());
                    recorder::rebind(app.handle());
                    color::rebind(app.handle());
                    launcher::rebind(app.handle());
                    note::start(app.handle());
                    today::start(app.handle());
                    privacy::start(app.handle());
                    meetings::start(app.handle());
                    // تحديث مسار exe في Run إن كان autostart مفعّلًا (يتتبّع نقل التطبيق).
                    let on = app.state::<state::AppState>().settings.lock().unwrap()
                        .get("autostart").and_then(|v| v.as_bool()).unwrap_or(false);
                    if on { let _ = autostart::apply(true); }
                }
            }
            if let Some(w) = app.get_webview_window(win::MAIN) {
                win::apply_noactivate(&w);
                let _ = w.set_always_on_top(true);
                let _ = w.set_skip_taskbar(true);
            }
            win::position_main(app.handle());
            capture::apply_affinity(app.handle());
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
            commands::take_focus,
            commands::release_focus,
            commands::open_settings,
            commands::monitors_list,
            watchdog::page_pong,
            clipboard::clip_list,
            clipboard::clip_delete,
            clipboard::clip_clear,
            clipboard::clip_pin,
            clipboard::clip_current_text,
            clipboard::clip_set_text,
            clipboard::clip_paste,
            media::media_control,
            media::media_seek,
            media::media_pick,
            media::media_sources,
            media::media_now,
            lyrics::lyrics_get,
            downloads::downloads_list,
            battery::battery_status,
            attention::attention_today,
            attention::attention_clear,
            files::palette_apps,
            files::palette_icon,
            files::files_search,
            files::files_warm,
            files::files_held,
            palette::palette_recent,
            palette::run_shell,
            palette::open_path,
            palette::workspace_open,
            rates::rates_get,
            perf::perf_status,
            perf::perf_ram,
            mascot::mascot_active,
            netspeed::netspeed_active,
            win::island_dock_get,
            backdrop::island_backdrop,
            capture::capture_start,
            capture::capture_frame,
            capture::capture_ready,
            capture::capture_region,
            capture::capture_cancel,
            capture::open_captures,
            capture::prtsc_taken,
            recorder::record_begin,
            recorder::record_start,
            recorder::record_stop,
            recorder::record_status,
            color::color_pick,
            color::color_patch,
            color::color_history,
            editor::editor_open,
            editor::editor_image,
            editor::editor_save,
            shelf::shelf_list,
            shelf::shelf_add,
            shelf::shelf_remove,
            shelf::shelf_clear,
            shelf::shelf_copy,
            shelf::shelf_drag,
            launcher::launcher_list,
            launcher::launcher_add,
            launcher::launcher_remove,
            launcher::launcher_launch,
            launcher::launcher_pick_icon,
            launcher::launcher_add_link,
            launcher::launcher_edit_link,
            launcher::launcher_link_icon,
            launcher::launcher_groups_get,
            launcher::launcher_groups_set,
            launcher::launcher_hotkeys_get,
            launcher::launcher_hotkeys_set,
            note::note_get,
            note::note_set,
            note::note_folders_get,
            note::note_folders_set,
            note::reminders_get,
            note::reminders_set,
            note::timer_get,
            note::timer_set,
            today::today_cities,
            today::today_get,
            today::weather_get,
            sysinfo::sysinfo_get,
            audio::volume_get,
            audio::volume_set,
            audio::volume_step,
            audio::volume_mute_toggle,
            brightness::brightness_get,
            brightness::brightness_set,
            privacy::privacy_status,
            meetings::meetings_key_set,
            meetings::meetings_key_status,
            meetings::meetings_list,
            meetings::meetings_refresh,
            meetings::meetings_join
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
