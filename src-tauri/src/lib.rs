// هيكل الوحدات — يعكس شجرة الأصل المستعادة من الباينري (27 وحدة)
// فعّل الوحدات مرحلةً مرحلة حسب خطة المخطط (BLUEPRINT.md §11)
pub mod state;      // AppState: إعدادات + جلسات + حالة النوافذ
pub mod commands;   // طبقة الأوامر العامة (settings_get/set ...)
pub mod win;        // موضع/إخفاء/فوكس النافذة الرئيسية
pub mod watchdog;   // نبض page_pong وإعادة التشغيل الذاتية
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
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // .invoke_handler(tauri::generate_handler![ ... 132 أمرًا: docs/IPC.md ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
