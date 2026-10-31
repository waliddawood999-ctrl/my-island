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

### مضاف في الجلسة 1.2
clip_paste(id) → "pasted" | "clipboard" — يضع العنصر (نص أو صورة PNG) في حافظة ويندوز؛ وإن كانت pasteOnClick مفعّلة (الافتراضي مفعّلة عند غياب المفتاح) يستعيد آخر نافذة تطبيق غير نافذتنا (يتتبّعها خيط كل 100ms) ويرسل Ctrl+V بـSendInput ثم يعيد الحبة بلا فوكس. "clipboard" = بقي في الحافظة فقط (الخيار معطّل أو الهدف يعمل كمسؤول/UIPI أو لا نافذة سابقة) ⇒ الواجهة تعرض «لُصق في الحافظة».
take_focus() · release_focus() — تعطيل/إعادة WS_EX_NOACTIVATE؛ تُستعملان لحقل بحث تبويب الحافظة فقط (onFocus/onBlur)؛ release_focus يردّ الفوكس لآخر نافذة تطبيق. لا أحداث جديدة.

### مضاف في الجلسة 1.3
open_settings() — يُظهر نافذة settings ويمنحها الفوكس (نافذة عادية)؛ إغلاقها يخفيها فقط (CloseRequested ⇒ hide) · monitors_list() → [{index, name, width, height, primary}] بنفس فهرس `monitor` في win::position_main.
settings_set لمفتاح `autostart` يكتب/يحذف قيمة MyIsland في HKCU\...\Run (autostart.rs). لا أحداث جديدة: تبديل `language` يصل كل النوافذ عبر settings:changed ويعيد رسمها.

### مضاف في الجلسة 2.1 (media.rs — حسب المخطط §7/media)
- `media_control(action: "play"|"pause"|"toggle"|"next"|"prev")` → bool (قبِلها التطبيق) · `media_seek(seconds: f64)` → bool · `media_sources()` → `[{id(AUMID), name}]` · `media_pick(id: string|null)` — اختيار المصدر؛ null = جلسة النظام الحالية (يرجع تلقائيًا للحالية إن اختفى المصدر المختار).
- **أمر جديد غير مذكور في العقد الأصلي:** `media_now()` → `{info: MediaInfo, cover: string|null}` — لقطة فورية تستعملها الواجهة عند التركيب قبل أول حدث. (`media_rename` مؤجَّل.)
- `media:update` (payload: `MediaInfo` = `{session, source, source_name, title, artist, album, duration(ث), position(ث), playing, can_prev, can_next, can_seek}`) — عند أي تغيير، والموضع كل ثانية أثناء التشغيل؛ `session:false` = لا جلسة (الحبة تبقى على شكلها).
- `media:cover` (payload: data-URL للغلاف أو `null` عند تغيّر المسار قبل وصول الغلاف الجديد).
- الإعدادات: `moduleMedia` (الافتراضي مفعّل عند غياب المفتاح؛ إطفاؤه يوقف النشر ويعيد `session:false`)، `mediaPill`: `"off"`/`"clock"` = تبقى الساعة في الحبة، أي قيمة أخرى أو غياب المفتاح = عنوان متحرك (عنوان — فنان) أثناء التشغيل فقط.

### مضاف في الجلسة 2.2 (spectrum.rs — حسب المخطط §7/spectrum)
- `media:bands` (payload: `number[32]` بقيم 0..1) — طيف لوغاريتمي (~40Hz–16kHz) من WASAPI loopback لجهاز الإخراج الافتراضي الحالي (يُعاد فتحه تلقائيًا عند تبدّل الجهاز)، تنعيم هجوم سريع/انحسار أبطأ، بمعدّل ~30fps. لا أمر جديد.
- شروط البث: جلسة ميديا `playing` **و** `liquidSpectrum === true` (الافتراضي عند غياب المفتاح = معطّل) **و** الحبة غير مخفية. عند انتفاء أي شرط يتوقف الالتقاط كليًا خلال ≤ ~0.3s ويُرسل إطار أصفار أخيرًا (كي تهدأ الواجهة) ثم لا شيء.
- المستهلك (2.3): `src/pages/island/Liquid.tsx` يشترك في `media:bands` فقط حين `moduleMedia && liquidSpectrum`، ويُوقظ حلقة rAF عند كل إطار. لا أوامر ولا أحداث جديدة في 2.3.
- الخصوصية: لا يُسجَّل ولا يُحفظ أي صوت؛ العيّنات تُحلَّل لحظيًا في الذاكرة.

### مضاف في الجلسة 2.4
lyrics_get(artist: String, title: String, album?: String, duration: f64 ثوانٍ) → `Lyrics { found, synced, instrumental, offline, lines: [{t: ثوانٍ, text}], plain }` — LRCLIB (`/api/get` ثم `/api/search` احتياطيًا)، يرفض remix/live/karaoke/sped-up التي لا يحملها العنوان المطلوب ويختار الأقرب مدةً (≤5s)، يفضّل syncedLyrics ثم plainLyrics. لا شبكة ⇒ `offline:true` بلا خطأ. التخزين المؤقت في kv بمفتاح `lyrics:<بصمة فنان+عنوان+مدة>` (يُستثنى من settings_get؛ نتيجة «لا كلمات» تنتهي بعد 7 أيام، والمفقودة شبكيًا لا تُخزَّن). لا أحداث جديدة.

### مضاف في الجلسة 2.5 (downloads.rs + battery.rs — حسب المخطط §7/downloads)
- `downloads_list()` → `{active: DownloadItem[], recent: DoneItem[]}` — **أمر جديد غير مذكور في العقد الأصلي** (لقطة فورية عند تركيب الواجهة قبل أول حدث). `battery_status()` → `{has_battery, percent|null, ac, charging}` — أمر جديد أيضًا.
- `downloads:update` (payload: `{active, recent}`؛ `DownloadItem = {id, name, size(بايت), total|null, percent|null, speed(بايت/ث), source:"browser"|"steam"}`، `DoneItem = {name, path, size, at(ms)}`) — عند أي تغيّر، بحد أقصى ~1/ث. `downloads:done` (payload: `DoneItem`) — عند اكتمال ملف: اختفى مؤقت المتصفح وثبت حجم الملف النهائي ≥1.5s، أو ملف نامٍ ثبت حجمه ≥3s، أو اختفى تنزيل Steam بعد ≥95%. **حدث جديد:** `battery:update` (payload: نفس `battery_status`) — كل 30s أو فور تغيّر التوصيل، وفقط حين `showBattery`.
- المراقبة: notify (ReadDirectoryChangesW) على `downloadsDir` (الافتراضي `%USERPROFILE%\Downloads`) غير تعاودي؛ المؤقتات `.crdownload/.part/.opdownload/.partial`؛ يُتجاهل `.tmp` وعناصر `downloadsIgnore` (`.ext`/`*.ext` امتداد، وغيرها جزء من الاسم)؛ `steamDownloads` يقرأ `steamapps/downloading` + `appmanifest_*.acf` (نسبة حقيقية من BytesDownloaded/BytesToDownload). **لا مسح ولا مراقبة إلا حين `showDownloads` أو `downloadsInPill`** (الافتراضي معطّلان). المتصفحات لا تكشف الحجم الكلي ⇒ `percent:null` (شريط غير محدّد + الحجم والسرعة)؛ Steam فقط له نسبة.
- الواجهة: `showDownloads` ⇒ قسم في تبويب «الرئيسية»؛ `downloadsInPill` ⇒ الحبة تعرض أكبر تنزيل جارٍ (`⬇ 45%` إن عُرفت النسبة وإلا الحجم) بدل العنوان/الساعة؛ `showBattery` ⇒ نسبة البطارية في اللوحة وفي الحبة (لا شيء على أجهزة بلا بطارية).

### مضاف في الجلسة 3.1 (files.rs + palette.rs — حسب المخطط §7/files-palette)
- **الطبقة:** شريط الأوامر طبقة داخل نافذة `main` (لا نافذة خامسة — القاعدة 1): الحبة تتمدد إلى 640×440 وتأخذ الفوكس عند الفتح فقط (`take_focus`) وتعيده عند الإغلاق (`release_focus`).
- **الاختصار:** `hotkeyPalette` (الافتراضي `Alt+Space`، فارغ = معطّل؛ يُعاد تسجيله فور تغييره عبر `settings_set`). الضغط يُظهر الحبة إن كانت مخفية ثم يبثّ **`palette:open`** (payload `{wasHidden: bool}`) إلى `main` — الحدث **يبدّل**: مفتوح ⇒ يغلق ويعيد الفوكس، وwasHidden=true ⇒ تُعاد إخفاء الحبة عند الإغلاق.
- `palette_apps(refresh?: bool)` → `[{id, name, path}]` — اختصارات/برامج Start Menu (ProgramData + AppData) وسطح المكتب (المستخدم والعام + OneDrive)، بلا مكرر بالاسم وبلا uninstall؛ تُمسح مرة وتُخزَّن (refresh=true يعيد المسح).
- `palette_icon(path)` → base64 PNG (32px) أو null — SHGetFileInfo + GDI، مخزّنة في الذاكرة وفي `<بيانات>/icons/<sha256>.png` (تُبطَل بتغيّر mtime المصدر).
- `palette_recent()` → `[{path, name, count, last(ms)}]` الأحدث أولًا (≤40) — محلية في kv بمفتاح `palette:recent` (لا تظهر في settings_get). تُسجَّل عند `run_shell` إن مُرّر `name`.
- `files_warm()` يدفّئ الفهرس بخيط خلفي ويعود فورًا (يُستدعى تلقائيًا بعد الإقلاع بـ4s ثم كل 10 دقائق، وعند فتح الشريط، وعند تغيير paletteFiles/paletteFolders). الفهرس **في الذاكرة فقط** (لا يُكتب على القرص): مجلدات المستخدم (Desktop/Documents/Downloads/Pictures/Music/Videos + OneDrive) بعمق ≤6 وسقف 200k عنصر، يتجاوز المخفي/النظامي/`.git`/`node_modules`/AppData، ويتمهّل 4ms كل 300 عنصر كي لا يحرق المعالج.
- `files_search(query, limit?=8)` → `[{name, path, is_dir}]` — يحترم `paletteFiles`/`paletteFolders` (غياب المفتاح = مفعّل)؛ أقل من حرفين ⇒ فارغ.
- `files_held()` → `{ready, building, files, folders}` — **تفسير:** حالة الفهرس المحتفَظ به في الذاكرة (اسم العقد الأصلي غير موثّق أكثر).
- `run_shell(target, mode?, name?)` — `mode`: `"open"` (افتراضي: تطبيق/ملف/مسار/رابط/`shell:`/`ms-settings:` عبر ShellExecute) · `"folder"` (إظهار في المستكشف) · `"admin"` (runas) · `"shell"` (أمر: `cmd /k …` أو `ps …`/`powershell …` ⇒ PowerShell -NoExit) · `"admin-shell"`. تُعيد الحبة NOACTIVATE دون ردّ الفوكس كي يظفر الهدف الجديد به.
- `open_path(path)` — فتح بالتطبيق الافتراضي (run_shell بوضع open بلا تسجيل في الأخيرة).
- **تعديل على أمر قائم:** `release_focus(restore?: bool)` — `restore=false` يعيد NOACTIVATE فقط بلا ردّ الفوكس (إغلاق الشريط بعد إطلاق هدف أو بعد نقر المستخدم تطبيقًا آخر). الاستدعاء بلا وسيط كما كان.
- **بادئات الشريط:** `>` أمر شل (Ctrl+Shift+Enter كمسؤول، `>ps …` PowerShell) · `?` بحث ويب مباشر · `=` فرض حاسبة · Enter فتح · Ctrl+Enter إظهار في المجلد · Ctrl+Shift+Enter كمسؤول. بحث الويب (`searchEngine`: google|yandex|bing|ddg|brave|ecosia|custom، و`searchUrl` يحوي `{q}`) يُعرض عند عدم وجود نتيجة محلية أو بالبادئة `?`، ويفتح المتصفح الافتراضي بـEnter فقط (لا طلب خفي).
- الحاسبة والمحوّل منطق واجهة محلي (`src/pages/island/palette/`): عملات بمعدلات ثابتة `RATES_PER_USD` في `convert.ts` (محدّثة يدويًا؛ لا شبكة) + وحدات طول/كتلة/حجم/زمن/بيانات/سرعة/حرارة.

### مضاف في الجلسة 3.2 (capture.rs + طبقة overlay — حسب المخطط §7/capture)
- **التدفق:** الاختصار/الأمر ⇒ GDI (`BitBlt|CAPTUREBLT`) يلتقط **الشاشة تحت المؤشر** بالبكسلات الفعلية قبل إظهار أي شيء ⇒ الصورة المجمّدة تبقى في الخلفية وتُرسل للطبقة ⇒ نافذة `overlay` تُوضع على مستطيل تلك الشاشة بالبكسلات الفعلية (موضع/حجم/موضع لتفادي انزياح DPI المختلف) ⇒ الواجهة ترسم الصورة ثم تستدعي `capture_ready` فتُظهَر الطبقة وتأخذ الفوكس (لا وميض). إن لم تصبح جاهزة خلال 3s تُسقط اللقطة.
- `capture_start(mode?: "area"|"screen")` — الافتراضي `"area"`. `"screen"` يحفظ كامل الشاشة تحت المؤشر فورًا بلا طبقة. يُتجاهل الاستدعاء إن كان التقاط جارٍ.
- `capture_region(x, y, w, h)` → مسار PNG — **بالبكسلات الفعلية نسبةً لزاوية الشاشة الملتقطة** (الواجهة تضرب بكسلات CSS في عرض الصورة الطبيعي ÷ المعروض فتصح الأبعاد رغم اختلاف DPI)؛ يقبل w/h سالبين ويقصّ على الحدود؛ يخفي الطبقة أولًا ثم يحفظ PNG في `screenshotDir` (الافتراضي `Pictures\MyIsland` عبر SHGetKnownFolderPath) باسم `MyIsland_YYYY-MM-DD_HH-MM-SS-mmm.png` وينسخ الصورة للحافظة فورًا.
- `capture_cancel()` — يلغي بلا حفظ ولا نسخ. **أوامر جديدة غير مذكورة في العقد الأصلي:** `capture_frame()` → `{image(data-URL PNG), width, height, x, y, scale, index}|null` (الطبقة تسحب اللقطة الحالية) و`capture_ready()` (الطبقة جاهزة للإظهار).
- `open_captures()` — يفتح `screenshotDir` (يُنشأ إن غاب). `prtsc_taken()` — يبدأ لقطة منطقة كأن `hotkeyArea` ضُغط (لمن يمرّر Print Screen من طبقة أخرى).
- **الأحداث:** `capture:start` (إلى overlay، payload معرّف اللقطة) · `capture:end` (إلى overlay عند الإخفاء) · `capture:saved` (عام، payload `{path, width, height, mode:"area"|"screen"}`) بعد الحفظ والنسخ.
- **الاختصارات:** `hotkeyArea` (الافتراضي `Ctrl+Alt+A`) و`hotkeyScreen` (الافتراضي `Ctrl+Alt+S`)؛ فارغ = معطّل؛ تُعاد ربطها فور تغييرها عبر `settings_set`. **اعتراض Print Screen اختياري:** اضبط أيًّا منهما على `PrintScreen` (لا مفتاح إعداد جديد).
- `captureVisible` (غياب المفتاح = الحبة مستثناة من اللقطات): يُطبَّق بـ`SetWindowDisplayAffinity` (`WDA_EXCLUDEFROMCAPTURE`/`WDA_NONE`) على نافذة main عند الإقلاع وعند تغيير المفتاح وقبل كل التقاط.
- **تعديل على أمر قائم:** `monitors_list()` يعيد الآن أيضًا `x, y` (موضع الشاشة بالبكسلات الفعلية) و`scale` (معامل DPI) إضافةً للحقول السابقة.
- **واجهة التحديد:** صورة مجمّدة ملء الشاشة مع تعتيم، سحب لتحديد المنطقة وتسمية حية `العرض × الارتفاع` بالبكسلات الفعلية، إفلات الفأرة أو Enter يؤكّد، Esc أو زر يمين يلغي، مساحة < 4px تُتجاهل.
