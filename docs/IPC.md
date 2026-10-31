# عقد IPC — الأوامر (132) والأحداث، كما تستدعيها واجهة الأصل حرفيًا

## أوامر Tauri (invoke)
النافذة: set_island_hidden, through_toggle, report_island_rect,
report_page_scale, take_focus, release_focus, restart_island,
runs_as_admin, open_settings, open_path, open_captures, monitors_list,
prtsc_taken
إعدادات: settings_get, settings_set, settings_target
نبض: page_pong
حافظة: clip_list, clip_paste, clip_pin, clip_delete, clip_clear,
clip_set_text, clip_set_png, clip_current_text
رفّ: shelf_list, shelf_add, shelf_remove, shelf_clear
لانشر: launcher_list, launcher_add, launcher_remove, launcher_launch,
launcher_pick_icon, launcher_add_link, launcher_edit_link,
launcher_link_icon, launcher_groups_get, launcher_groups_set,
launcher_hotkeys_get, launcher_hotkeys_set
ميديا: media_control, media_seek, media_pick, media_rename,
media_sources, lyrics_get
صوت: volume_set, volume_step, volume_mute_toggle, mic_toggle,
audio_devices, audio_inputs, audio_set_default
التقاط: capture_region, capture_start, capture_cancel, record_begin,
record_start, record_stop, color_pick, color_patch, color_history,
editor_open, editor_image, editor_save, upload_image, pick_sound
AI: ai_chat, ai_run, ai_cancel, ai_models, ai_test, ai_key_set,
ai_key_status, chat_get, chat_set, attach_pick, attach_paths,
attach_data, attachments_prune, dictate_toggle, dictate_cancel,
stt_key_set, stt_key_status, stt_test
وكلاء: agents_now, agents_connect, agents_connections, agents_answer
طقس: weather_get, weather_refresh, weather_search
ملاحظة: note_get, note_set, note_folders_get, note_folders_set,
reminders_get, reminders_set, timer_get, timer_set
تحكم: controls_get, controls_set, bt_devices, bt_switch, power_action,
vpn_chip, vpn_refresh, vpn_toggle_now
أوامر/ملفات: palette_apps, palette_recent, palette_icon, files_search,
files_warm, files_held, run_shell
أخرى: license_activate, license_status, license_remove, update_check,
update_install, news_get, news_told, notifications_access,
notifications_request, obs_state, obs_password_set,
obs_password_status, hotkeys_check, list_item

> الأمران set_island_hidden(hidden: bool) وreport_island_rect(width, height بـ CSS px) مُنفَّذان في الجلسة 0.1 (commands.rs).

## أحداث (emit/listen)
ai:chunk, ai:done, ai:error, media:update, media:cover, media:bands,
media:level, audio:state, downloads:update, downloads:done,
agents:update, agents:card, agents:ask, agents:ask-done, notify:new,
island:edge, island:shy, island:keep, island:desktop, island:warn,
island:note, mascot:look, mascot:sleep, cursor:near, input:layout,
input:caps, vpn:choose, update:progress, weather:error,
dictation:error, license:changed, license:needed

### مضاف في الجلسة 0.1
island:hidden (الخلفية → main، payload: bool) — يشغّل التلاشي الناعم قبل إخفاء/بعد إظهار النافذة

### مضاف في الجلسة 0.2
settings:changed (الخلفية → كل النوافذ، payload: كائن المقطع المحفوظ فقط) — يُبث بعد كل settings_set
settings_get() → كائن الإعدادات المدموجة (DEFAULTS + kv) · settings_set(patch: كائن جزئي) → يحفظ كل مفتاح في kv كـ JSON

### مضاف في الجلسة 0.3
page_pong() — نبضة من صفحة main كل ثانيتين؛ الخلفية (watchdog.rs) تعيد تحميل webview بعد صمت > 6s (وتعيد تشغيل العملية بعد إعادتي تحميل فاشلتين) وتسجّل في crash-log.txt بمجلد البيانات
debug_freeze — ليس أمر Tauri: زر واجهة في وضع التطوير فقط (import.meta.env.DEV) يوقف النبض لاختبار المراقب

### مضاف في الجلسة 1.1
clip_list() → مصفوفة {id, kind, text, image_path, thumb(base64 PNG ≤96px), width, height, pinned, source, created_at(ms)} — المثبّتة أولًا ثم الأحدث · clip_delete(id) · clip_clear() (غير المثبّتة وملفات صورها) · clip_pin(id, pinned: bool) · clip_current_text() → نص أو null
الباقي من أوامر الحافظة (clip_paste / clip_set_text / clip_set_png) مؤجَّل لجلسات لاحقة. لا أحداث جديدة. المستمع (clipboard.rs) يعمل في خيط خلفي، يتجاهل نسخ ExcludeClipboardContentFromMonitorProcessing / CanIncludeInClipboardHistory=0 وclipExcludedApps، ويطبّق clipLimit (الافتراضي 200).
