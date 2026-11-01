// قائمة الأوامر = generate_handler! في src/lib.rs حرفيًا. وجود AppManifest يجعل كل أمر يحتاج إذن allow-<الأمر> في capabilities/*.json،
// فأي أمر جديد يُضاف هنا وفي ملف capability للنافذة التي تستدعيه (وإلا يرفضه Tauri وقت التشغيل).
const COMMANDS: &[&str] = &[
    "set_island_hidden", "report_island_rect", "settings_get", "settings_set", "take_focus", "release_focus",
    "open_settings", "app_quit", "monitors_list", "page_pong",
    "clip_list", "clip_delete", "clip_clear", "clip_pin", "clip_current_text", "clip_set_text", "clip_paste",
    "media_control", "media_seek", "media_pick", "media_sources", "media_now",
    "battery_status", "attention_today", "attention_clear",
    "palette_apps", "palette_icon", "files_search", "files_warm", "files_held",
    "palette_recent", "run_shell", "open_path", "workspace_open",
    "rates_get", "perf_status", "perf_ram", "mascot_active", "netspeed_active", "island_backdrop",
    "capture_start", "capture_frame", "capture_ready", "capture_region", "capture_cancel", "open_captures", "prtsc_taken",
    "record_begin", "record_start", "record_stop", "record_status",
    "color_pick", "color_patch", "color_history",
    "editor_open", "editor_image", "editor_save",
    "shelf_list", "shelf_add", "shelf_remove", "shelf_clear", "shelf_copy", "shelf_drag",
    "launcher_list", "launcher_add", "launcher_remove", "launcher_launch", "launcher_pick_icon", "launcher_add_link",
    "launcher_edit_link", "launcher_link_icon", "launcher_groups_get", "launcher_groups_set",
    "launcher_hotkeys_get", "launcher_hotkeys_set",
    "note_get", "note_set", "note_folders_get", "note_folders_set", "reminders_get", "reminders_set", "timer_get", "timer_set",
    "today_cities", "today_get", "weather_get", "sysinfo_get", "sysdepth_get",
    "volume_get", "volume_set", "volume_step", "volume_mute_toggle", "brightness_get", "brightness_set", "privacy_status",
    "meetings_key_set", "meetings_key_status", "meetings_list", "meetings_refresh", "meetings_join",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
