# عقد IPC — الأوامر (132 + المضافة) والأحداث، كما تستدعيها واجهة الأصل حرفيًا

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
net:speed, island:dock,
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

### مضاف في الجلسة 3.3 (editor.rs + recorder.rs + color.rs — حسب المخطط §7/capture وrecorder)
- **أغراض الطبقة:** `FrameInfo` (نتيجة `capture_frame`) يحمل الآن `mode`: `"area"` (لقطة) · `"record"` (اختيار منطقة تسجيل) · `"color"` (عدسة منتقي الألوان). الطبقة نفسها (نافذة `overlay`) تخدم الثلاثة؛ `capture_start` لم يتغيّر (الأوضاع الإضافية تبدأ من `record_begin`/`color_pick`).
- **تعديل على أمر قائم:** `capture_region(x, y, w, h, edit?: bool)` — `edit=true` (الواجهة ترسله عند Shift أثناء الإفلات/Enter) يفتح المحرّر على اللقطة بعد حفظها. يُرفض إن كانت الطبقة الحالية لغرض آخر.
- **المحرّر:** `editor_open(path?)` يفتح نافذة `editor` على صورة (png/jpg/gif/webp/bmp)، وبلا `path` على أحدث PNG في `screenshotDir`؛ `editor_image(path?)` → `{path, image(data-URL)}` للصورة المفتوحة؛ `editor_save(data, mode?)` — `data` = data-URL لـPNG الناتج، `mode`: `"new"` (الافتراضي: `<اسم>_edit.png` في `screenshotDir`) أو `"overwrite"` (فوق الأصل المفتوح إن كان PNG وإلا نسخة جديدة)؛ ينسخ النتيجة للحافظة ويعيد المسار. الحدثان `editor:open` (إلى editor، payload المسار) و`editor:saved` (عام، المسار). الرسم كله في الواجهة (`src/pages/editor/ops.ts`: أسهم/خطوط/مستطيلات/نص/تمويه pixelate/قصّ كقائمة عمليات مع تراجع/إعادة)؛ إغلاق النافذة يخفيها ولا يدمّرها.
- **التسجيل:** `record_begin()` يفتح طبقة تحديد المنطقة (Enter بلا تحديد = الشاشة كاملة) ويُرفض أثناء تسجيل جارٍ؛ `record_start(x, y, w, h)` (من الطبقة، بكسلات فعلية نسبةً لزاوية الشاشة الملتقطة، تُقصّ إلى أبعاد زوجية) يبدأ التسجيل إلى `recordingDir` (الافتراضي `Videos\MyIsland`) باسم `MyIsland_<طابع>.mp4|gif` بحسب `recordFormat`/`recordingFps`(30|60)/`recordingQuality` (**جديد الاستعمال:** `low|medium|high`، الافتراضي `medium`) ويعيد المسار؛ `record_stop()` → مسار الملف النهائي أو `null` إن لم يكن تسجيل جارٍ؛ **أمر جديد:** `record_status()` → `{recording, startedAt, format, path, error}` (لإعادة بناء مؤشر الحبة بعد إعادة تحميل الصفحة). **الحدث:** `record:state` بنفس الشكل (camelCase) عند البدء والإيقاف وعند فشل ذاتي (`error`)؛ الواجهة تحسب المؤقّت من `startedAt`.
- **صيغ التسجيل:** mp4 = Media Foundation `IMFSinkWriter` بـH.264 (برمجي) من إطارات GDI محوَّلة إلى NV12، معدل البتات من الأبعاد×الإطارات×الجودة (0.5–40 Mbps)؛ gif = ترميز NeuQuant مع تصغير بمتوسط الصناديق إلى عرض أقصاه 480/640/800 حسب الجودة وسقف 20 إطارًا/ث، وتأخير كل إطار من الفرق الحقيقي بين زمنين. قناة الإطارات محدودة (3) فالممتلئ يُسقَط ولا يتراكم تأخير.
- **الألوان:** `color_pick(x?, y?)` — بلا وسائط يبدأ وضع المنتقي (نفس طبقة اللقطة بغرض `"color"` + عدسة مكبّرة 11×11، الأسهم تضبط بكسلًا بكسلًا)، وبـ(x,y) (بكسلات فعلية) يقرأ **البكسل من اللقطة المحفوظة في الخلفية** ويسجّله وينسخ HEX ويعيد المدخل؛ `color_patch(hex, format?)` — يضيف/يرفع لونًا في السجل وينسخه بصيغة `"hex"|"rgb"|"hsl"` (نسخ بنقرة)؛ `color_history()` — آخر ≤30 لونًا الأحدث أولًا `[{hex,r,g,b,h,s,l,at}]`، محفوظة في kv بمفتاح `color:history` (لا تظهر في `settings_get`). **الحدث:** `color:picked` (payload المدخل) عند كل نسخ.
- **الاختصارات** (تُعاد ربطها فور تغييرها؛ فارغ = معطّل): `hotkeyRecord` (الافتراضي `Ctrl+Alt+R`، يبدّل بدء/إيقاف) و`hotkeyColor` (الافتراضي `Ctrl+Alt+C`). مفتاح `recordingQuality` أُضيف لـDEFAULTS (`"medium"`).
- **الواجهة:** تبويب «الأدوات» في اللوحة (`ToolsTab.tsx`): لقطة منطقة/شاشة، تسجيل/إيقاف بمؤقّت، منتقي الألوان، تحرير آخر لقطة، مجلد اللقطات، وسجل الألوان بنسخ HEX/RGB/HSL؛ والحبة المنكمشة تعرض نقطة حمراء ومؤقّتًا أثناء التسجيل (نقرها تُوقف)؛ وقسم «الالتقاط والتسجيل» في الإعدادات.

### مضاف في الجلسة 3.4 (shelf.rs — حسب المخطط §7/shelf)
- **التخزين:** جدول `shelf` من schema.sql بلا تعديل: `path` مسار الملف/المجلد، `icon` = النوع `file|dir|text|image`، `name` الاسم المعروض. النص وصور الحافظة يُحفظان كملفات داخل `<بيانات>/shelf/` (تُحذف مع العنصر؛ ملفات المستخدم الأصلية لا تُحذف ولا تُنقل أبدًا). المسار المكرّر يرتفع للأعلى فقط. تبقى العناصر بعد إعادة التشغيل (island.db).
- `shelf_list()` → `[{id, path, name, kind, size|null, missing, thumb(base64 PNG ≤96px للصور)|null, preview(نص)|null, created_at}]` الأحدث أولًا؛ `missing=true` إن حُذف الملف الأصلي.
- `shelf_add(paths?: string[], text?: string, clipboard?: bool)` → العناصر المضافة. `paths` ملفات/مجلدات (إفلات المستكشف) · `text` نص حر · `clipboard=true` يأخذ ما في حافظة ويندوز (ملفات منسوخة ثم صورة ثم نص). يبثّ `shelf:changed`.
- `shelf_remove(id)` · `shelf_clear()` — كلاهما يبثّ `shelf:changed`.
- **أمران جديدان غير مذكورين في العقد الأصلي:** `shelf_copy(id, mode?: "item"|"path")` — النص ينسخ نصًا، صورة الحافظة صورة، وغيرها كملف يُلصق في المستكشف (OleSetClipboard بكائن الصدفة CF_HDROP)، و`"path"` ينسخ المسار نصًا · `shelf_drag(ids: number[])` — يبدأ سحبًا أصليًا (DoDragDrop، تأثير COPY فقط) على الخيط الرئيسي نحو أي تطبيق/مجلد ويعود فورًا.
- **أحداث جديدة:** `shelf:changed` (payload: عدد العناصر) · `shelf:drag-end` (payload: `"copy"|"cancel"`).
- **السحب إلى الداخل:** أحداث Tauri الأصلية `tauri://drag-enter/leave/drop` على نافذة main: الدخول يفتح اللوحة على تبويب الرفّ، الإفلات في أي مكان من النافذة (الحبة أو اللوحة) يستدعي `shelf_add({paths})` فورًا ثم تنكمش بعد ~2.5s إن لم يدخل المؤشر.
- **الواجهة:** تبويب «الرفّ (n)» (`ShelfTab.tsx` + `useShelf.ts`): مصغّرات للصور وأيقونات الصدفة (`palette_icon`) للباقي + الاسم والحجم، نقرة تفتح (`open_path`؛ عنصر نص = نسخه)، سحب فوق عنصر (> 6px) ⇒ `shelf_drag`، نقر يمنى: نسخ / نسخ المسار / إظهار في المجلد (`run_shell` بوضع folder) / إزالة، وأزرار «من الحافظة» و«تفريغ».
- **الإعداد:** `moduleShelf` (غياب المفتاح = مفعّل؛ false يُخفي التبويب ويعطّل الإفلات).

### مضاف في الجلسة 3.5 (launcher.rs — حسب المخطط §7/linkicon)
- **التخزين:** جدول `launcher` من schema.sql بلا تعديل: `path` مسار أو رابط (UNIQUE؛ المكرّر بلا اعتبار لحالة الأحرف يُتجاهل)، `name` الاسم، `icon` = PNG base64 ≤64px مخصّص أو favicon (NULL ⇒ الواجهة تجلب أيقونة الصدفة عبر `palette_icon`)، `position` الترتيب. **المجموعات والاختصارات في kv** بمفتاحين `launcher:groups` و`launcher:hotkeys` (بادئة `launcher:` لا تدخل `settings_get`). كلها تبقى بعد إعادة التشغيل.
- `launcher_list()` → `[{id, path, name, kind: "app"|"file"|"dir"|"link", icon|null, missing}]` بترتيب العرض.
- `launcher_add(paths?: string[], pick?: "app"|"file"|"folder")` → العناصر **المضافة** فقط. `pick` يفتح منتقي ويندوز الأصلي (IFileOpenDialog، متعدد الاختيار؛ الإلغاء ⇒ `[]`). يبثّ `launcher:changed`.
- `launcher_remove(id)` — يحذف العنصر ويزيله من المجموعات والاختصارات (ويفكّ تسجيل الاختصار).
- `launcher_launch(id)` — يفتح بالتطبيق الافتراضي عبر `run_shell(mode=open)` (نفس مسار شريط الأوامر، ويُسجَّل في الأخيرة)؛ مسار محذوف ⇒ خطأ «المسار لم يعد موجودًا».
- `launcher_pick_icon(id, reset?: bool)` → العنصر المحدّث أو `null` عند إلغاء المنتقي. صورة png/jpg/ico/bmp/gif/webp ⇒ تُصغَّر إلى ≤64px؛ `reset=true` يعيد الأيقونة الافتراضية.
- `launcher_add_link(url, name?)` → العنصر. يُطبَّع الرابط (`example.com` ⇒ `https://example.com/`) والمخططات المسموحة فقط: http/https/ftp/mailto/tel/sms (غيرها خطأ). المكرّر خطأ. **favicon يُجلب تلقائيًا في الخلفية** (صفحة الموقع ثم `/favicon.ico`، User-Agent `MyIsland/0.3 (Windows; launcher icon)`، مهلة 8s، لا اتصال إلا بالموقع نفسه وبعد إضافة المستخدم للرابط) ثم يبثّ `launcher:changed`.
- `launcher_edit_link(id, url?, name?)` → العنصر. `url` للروابط فقط (يمسح الأيقونة ويجلب favicon الجديد)، و`name` يصلح لأي عنصر (إعادة تسمية).
- `launcher_link_icon(url, id?)` → favicon كـPNG base64 أو `null`؛ مع `id` يُحفظ للعنصر (تحديث يدوي).
- `launcher_groups_get()` → `[{id, name, items:[itemId…]}]` بترتيب المجموعات وترتيب العناصر داخلها؛ العنصر خارج أي مجموعة = «غير مصنّف». `launcher_groups_set(groups)` يستبدل الكل (إنشاء/إعادة تسمية/ترتيب/نقل عناصر) بعد التنظيف (اسم ≤40، معرّفات فريدة، عنصر واحد في مجموعة واحدة، ≤50 مجموعة) ويعيد النسخة المعتمدة.
- `launcher_hotkeys_get()` → `{"<itemId>": "Ctrl+Alt+1"}`. `launcher_hotkeys_set(id, hotkey)` → الخريطة الكاملة؛ فارغ = إزالة؛ يشترط معدّلًا (Ctrl/Alt/Shift/Super) + مفتاحًا، ويرفض ما استُعمل لعنصر آخر أو سبقه تطبيق آخر عالميًا (القديم لا يُكسر قبل نجاح الجديد). الاختصارات تُسجَّل عند الإقلاع وتعمل عالميًا، والضغط يُطلق العنصر دون إظهار الحبة.
- **حدث جديد:** `launcher:changed` (payload: عدد العناصر) عند أي تغيير في العناصر/المجموعات/الاختصارات/الأيقونات.
- **الواجهة:** تبويب «اللانشر» (`LauncherTab.tsx` + `useLauncher.ts` + منطق خالص `launcherGroups.ts`): بحث سريع أعلى التبويب (Enter يطلق أول نتيجة)، شبكة أيقونات كبيرة (92px) مقسّمة بمجموعات، نقرة تُطلق، سحب بالمؤشر (HTML5 DnD لا يصلح مع drag-drop في Tauri) لنقل عنصر بين المجموعات أو قبل عنصر آخر وترتيب المجموعات من مقبض ⠿ مع تمرير تلقائي عند الحافة، نقر يمنى (فتح/إعادة تسمية/اختصار/أيقونة/إظهار في المجلد/إزالة)، وزر «إضافة» (تطبيق/ملف/مجلد/رابط). حقول الإدخال تستعمل `take_focus/release_focus`.
- **الإعداد:** `moduleLauncher` (غياب المفتاح = مفعّل؛ false يُخفي التبويب ويفكّ تسجيل كل الاختصارات فورًا عبر `settings_set`).

### مضاف في الجلسة 3.6 (note.rs — حسب المخطط §7/note و§10.2)
التخزين كله في `kv` بالبادئة `note:` (لا تدخل `settings_get`): `note:doc:<مجلد>` · `note:folders` · `note:reminders` · `note:timer`.
- `note_get(folder?: string="default")` → HTML الملاحظة (ناتج Tiptap: عناوين/قوائم/روابط/مهام `ul[data-type=taskList]` بـ`data-checked`) أو `""`. `note_set(folder?, html)` يحفظ (سقف 2MB؛ معرّف المجلد `[A-Za-z0-9_-]{1,64}`). الواجهة تحفظ تلقائيًا بعد 700ms من آخر كتابة (debounce) وفورًا عند فقدان الفوكس/تبديل المجلد/إخفاء الصفحة/إغلاق اللوحة (فك تركيب المحرّر).
- `note_folders_get()` → `[{id,name}]` (فارغ ⇒ الواجهة تعرض المجلد الافتراضي `default` باسم «عام») · `note_folders_set(folders)` → القائمة بعد التنظيف؛ ملاحظات المجلدات المحذوفة (غير `default`) تُحذف.
- `reminders_get()` → `[{id, text, at(ms epoch), repeat: null|"daily"|"weekly", done}]` · `reminders_set(list)` → القائمة بعد التنظيف (نص غير فارغ، id فريد، تكرار معروف فقط، ≤500) ويبثّ `reminders:changed`. التكرار يتقدّم بالساعة المحلية (لا يتأثر بتغيّر التوقيت الصيفي). غير المتكرر يُعلَّم `done:true` بعد إطلاقه ويبقى في القائمة؛ تذكير فات وقته والتطبيق مغلق يُطلَق عند الإقلاع التالي بـ`late:true`.
- `timer_get()` → `{endsAt(ms), totalMs, label}` أو `null` · `timer_set(seconds?: number|null, label?: string)` → المؤقّت؛ `seconds` من 1 إلى 86400، و`null` يلغي الجاري. يُحفَظ في kv؛ مؤقّت انتهى والتطبيق مغلق يُسقَط بصمت.
- **الجدولة:** خيط واحد بنبضة 1s على نسخة في الذاكرة (لا استعلام DB في الراحة). عند الاستحقاق: **`island:note`** (payload: `{kind:"reminder"|"timer", id, text, at, late}`) + صوت `alertSound`.
- **`alertSound`** (إعداد موجود): فارغ/غير مضبوط/`off`/`none` ⇒ صامت · `default`/`beep` ⇒ نغمة النظام (SystemAsterisk) · مسار ملف `.wav` موجود ⇒ يُشغَّل (PlaySound)؛ مسار غير صالح ⇒ النغمة الافتراضية. (`pick_sound` لم يُنفَّذ بعد ⇒ يُضبط من وحدة التحكم: `__TAURI_INTERNALS__.invoke('settings_set',{patch:{alertSound:'default'}})`.)
- **أحداث جديدة:** `reminders:changed` (payload: عدد التذكيرات) · `timer:changed` (payload: المؤقّت أو `null`).
- **الواجهة:** تبويب «ملاحظة» (`NoteTab.tsx`، يُحمَّل كسولًا) بثلاثة أقسام: ملاحظة Tiptap (StarterKit + TaskList/TaskItem، شريط أدوات، مجلدات بإعادة تسمية بنقرتين، Ctrl+نقر يفتح الرابط) · تذكيرات (إدخال لغة طبيعية + معاينة قابلة للتعديل: النص/الوقت/التكرار + قائمة مع تعديل/حذف) · مؤقّت (دقائق/ثوانٍ + مسبقات). `useNote.ts` (الخطافات) و`reminderParse.ts` (المحلل العربي النقي). تنبيه الحبة: نص التذكير بجرس في حبة 340×36 حتى النقر أو 10s؛ المؤقّت يظهر في الحبة المنكمشة حين يتبقى ≤60s.
- **المحلل العربي (`parseReminder(text, now)`):** يفهم «ذكّرني/نبّهني» + يوم (اليوم، بكرة/غدًا، بعد بكرة، أيام الأسبوع مع «القادم») + ساعة («9»، «9:30»، «الساعة ٩ ونصف»، «5 إلا ربع»، «9ص»، صباحًا/مساءً/ظهرًا/عصرًا/ليلًا، «العصر» وحدها) + نسبي («بعد ساعتين»، «بعد نصف ساعة»، «بعد ساعة ونصف»، «بعد 3 أيام») + تكرار («كل يوم»، «كل يوم جمعة»، «كل أسبوع»، يوميًا). أرقام عربية-هندية تُقبل. ساعة بلا فترة: اليوم ⇒ أقرب حدوث مستقبلي، يوم لاحق ⇒ 7–11 صباحًا و12 ظهرًا و1–6 مساءً؛ يوم بلا ساعة ⇒ 09:00.

### مضاف في L5 (attention.rs — «وقتي» وتذكير الاستراحة)
- **التخزين:** جدول `attention_daily(day, app, seconds)` بالترحيل المرقّم `src-tauri/migrations/001_attention.sql` (يُنفَّذ عبر `migrate.rs` و`PRAGMA user_version`؛ schema.sql لم يتغيّر). محلي فقط، اسم ملف exe بلا `.exe` وبحروف صغيرة، بلا عناوين نوافذ، يُحتفظ بـ30 يومًا (يُحذف الأقدم عند الإقلاع).
- **القياس:** نبضة 2s؛ التطبيق الأمامي (عمليتنا لا تُحتسب) يُضاف له الزمن فقط إن كان الخمول (`GetLastInputInfo`) ≤ 60s. التفريغ إلى DB كل 30s. `attentionTracking=false` ⇒ لا قراءة للنافذة الأمامية ولا كتابة (وإن كان `breakReminders` مفعّلًا يُقرأ الخمول وحده).
- **الاستراحة:** يتراكم زمن الاستخدام المتواصل (يتوقف بين 60s و5min خمول، ويُصفَّر عند خمول ≥ 5 دقائق)؛ عند بلوغ `breakMinutes` يُبثّ `attention:break` ثم يُعاد العدّ من الصفر.
- `attention_today()` → `{enabled, total(ثوانٍ), apps:[{app, seconds}] (أعلى 8، تنازليًا), day}`. `attention_clear()` يمسح الجدول كله ويبثّ `attention:update`.
- **أحداث جديدة:** `attention:update` (payload: نفس لقطة `attention_today`، بعد كل تفريغ فيه جديد) · `attention:break` (payload: الدقائق).
- **إعدادات جديدة (src/settings.ts):** `attentionTracking` (افتراضي true) · `breakReminders` (افتراضي false — إشعار صريح بموافقة المستخدم) · `breakMinutes` (افتراضي 60، يُحصر بين 5 و240).
- **الواجهة:** `AttentionSection.tsx` في عمود اليمين من «الرئيسية» (أعلى 4 تطبيقات بأشرطة)، وتنبيه الاستراحة يمرّ بشريط تنبيه الحبة (أيقونة فنجان) عبر `useNoteAlert`. قسم «وقتي والاستراحة» في الإعدادات (يوضّح الخصوصية صراحةً + زر مسح).

### مضاف في L6 (battery.rs — توسعة 2.5، أوامرها القائمة دون تغيير؛ حقول مضافة فقط)
- `battery_status()` وحمولة `battery:update` صارا: `{has_battery, percent|null, ac, charging, remaining_min|null, unplug_tip, bt:[{name, percent}]}` (الأربعة الأولى كما كانت).
- **`remaining_min`:** دقائق حتى النفاد على البطارية (`BatteryLifeTime` من ويندوز إن كان معروفًا، وإلا تقدير من ميل النسبة على نافذة ≤30 د تحتاج مدى ≥5 د وتغيّر ≥1%) أو حتى الامتلاء أثناء الشحن (تقدير الميل فقط)؛ `null` = غير معروف. ينقطع المنحنى عند تغيّر حالة التوصيل/الشحن.
- **`unplug_tip`:** `true` حين يشحن ونسبته ≥ 80 (لا موصول-ممتلئ ولا على البطارية). النص «افصل الشاحن عند 80%» تعرضه الواجهة.
- **`bt`:** أجهزة BLE المتصلة التي تعرض خدمة Battery (GATT 0x180F، خاصية 0x2A19) عبر `Windows.Devices.Bluetooth`؛ خيط منفصل يقرأها بعد 3s من التفعيل ثم كل 5 دقائق، ويُفرَّغ المخزّن (بلا اتصال بأي جهاز) عند إيقاف `showBattery` أو `btBatteries`. **حدّ معروف:** أجهزة البلوتوث الكلاسيكي (HFP/A2DP) التي لا تعرض GATT Battery لا تظهر.
- **إعدادات جديدة (src/settings.ts):** `batteryTip` (افتراضي true) · `btBatteries` (افتراضي true؛ الاثنان تعملان فقط مع `showBattery`).
- **الواجهة:** `BatterySection.tsx` في عمود يمين «الرئيسية» (النسبة + «المتبقي ≈ / حتى الامتلاء ≈» + النصيحة + قائمة البلوتوث)، وجهاز مكتبي بلا بطارية يعرض قائمة البلوتوث فقط؛ مفتاحا الإعدادات في قسم «الميديا والمظهر».

### مضاف في L7 (شريط الأوامر: أسعار حية، مساحات عمل، مؤقّت سريع — توسعة 3.1)
- `rates_get()` → `{rates: {usd:1, sar:3.75, …}, updated(ms), source: "cache"|"live"|"stale"} | null` (`rates.rs`) — أسعار كل عملة لكل 1 دولار من `open.er-api.com/v6/latest/USD`، بمفاتيح حروف صغيرة. تُخزَّن في kv بالمفتاح `rates:cache` (لا يظهر في `settings_get`) وتبقى صالحة **12 ساعة**؛ بعدها يُجلب من جديد، وعند فشل الجلب تُعاد النسخة القديمة بـ`source:"stale"`، ولا نسخة ⇒ `null` فتسقط الواجهة على الأسعار المضمّنة (`RATES_PER_USD` في `convert.ts`، «تقريبية Jun-2025»). **الجلب كسول وصريح:** الواجهة تستدعيه مرة لكل فتحة للشريط وفقط عند كتابة تحويل عملة؛ `liveRates=false` ⇒ `null` فورًا بلا أي طلب شبكة. الاستجابة تُرفض إن لم تكن `result:"success"` أو بلا `usd=1` أو أقل من 20 عملة.
- `workspace_open(id)` → `{opened, failed:[…]}` (`palette.rs`) — يفتح كل عناصر مساحة العمل `id` من الإعداد `workspaces` بترتيبها (فاصل 150ms) عبر ShellExecute `open`؛ الحبة تعود NOACTIVATE دون ردّ الفوكس. العناصر: مسار تطبيق/مجلد/ملف أو رابط `http(s)` فقط (مخططات `file:`/`javascript:`/`ftp:` وأي `://` غير http(s) تُرفض عند التنظيف)؛ حدود: 20 مساحة × 20 عنصرًا، الاسم ≤60 حرفًا.
- **إعدادان جديدان:** `liveRates` (افتراضي `true`) · `workspaces: [{id, name, items:string[]}]` (يُحرَّران من الإعدادات ▸ «شريط الأوامر»).
- **الشريط:** اسم مساحة العمل (أو `ws اسم` / `مساحة اسم`؛ البادئة وحدها تسرد الكل) ⇒ نتيجة واحدة «مساحة عمل: X» تفتح كل عناصرها بـEnter. `timer 25` / `مؤقت 25` (دقائق افتراضيًا؛ `90s` `1.5h` `10 دقائق`، + تسمية اختيارية بعد الرقم/الوحدة، المدى 1ث–24س) ⇒ نتيجة «مؤقّت 25m» تستدعي `timer_set(seconds,label)` القائم (3.6) وتغلق الشريط؛ لا أمر IPC جديد.

### مضاف في L8 (الأداء والتوفير — `perf.rs` + `src/motion.ts`)
- **إعدادات جديدة:** `ecoMode` (يدوي، افتراضي `false`) · `ecoOnBattery` (افتراضي `false`) · `motionLevel`: `"full"|"reduced"|"off"` (افتراضي `full`). قسم «الأداء والتوفير» في الإعدادات.
- `perf_status()` → `{eco: bool, reason: "manual"|"battery"|null, onBattery: bool|null}` — الحالة الفعلية لوضع التوفير. **القرار:** `ecoMode` ⇒ مفعّل (`manual`) دائمًا، شاحنًا موصولًا أو لا (اليدوي يبقى في الحالتين)؛ وإلا إن كان `ecoOnBattery` والجهاز بلا شاحن (من `battery::read_raw`، أي وحدة البطارية 2.5) ⇒ مفعّل (`battery`) ويتوقف تلقائيًا عند توصيل الشاحن. أجهزة بلا بطارية ⇒ `onBattery:null`. يُعاد حسابه فور تغيّر `ecoMode`/`ecoOnBattery` وكل 10s (قراءة نظام واحدة فقط حين يكون `ecoOnBattery` مفعّلًا).
- **حدث `perf:eco`** (payload = نفس شكل `perf_status`) يُبثّ عند أي تغيّر فقط.
- `perf_ram()` → `{total, main, webview, webviewCount, cpu, active}` بالبايت (Working Set) — **عمليات التطبيق نفسه فقط:** العملية الرئيسية + أحفاد `msedgewebview2.exe` لها (لا تُحتسب تطبيقات أطلقها المستخدم من الشريط ولا WebView2 لتطبيقات أخرى). `cpu` = مجموع نسبة معالج هذه العمليات (100 = نواة)، و`active` = `cpu ≥ 1.5`. **بلا حالة ولا خيط:** عيّنتان sysinfo بينهما 250ms ثم يُحرَّر كل شيء؛ تُستدعى من نافذة الإعدادات فقط كل 2s وهي ظاهرة (`visibilityState`) وتتوقف بإخفائها/إغلاقها ⇒ صفر كلفة. قيد: Working Set يحتسب صفحات مشتركة بين عمليات WebView2 فقد يختلف المجموع قليلًا عن مدير المهام.
- **ما يفعله Eco (فعليًا في الكود):** الحافظة: تأخير معالجة كل تغيّر 1s (`ECO_CLIP_DELAY_MS`) · تتبّع النافذة الأمامية: متتبّع هدف اللصق 100→300ms وفحص ملء الشاشة 500→1500ms ونبضة «وقتي» 2→10s · بلوتوث البطارية: فحص GATT متوقف (وتُفرَّغ القائمة المخزّنة) · طيف الصوت (2.2): الالتقاط متوقف · الحركة: `full` تُخفَّض إلى `reduced` (ولا يُرفع `off`). **غير موجود بعد في المستودع:** تحديث الطقس (L1) وقسم النظام (L3) — لم تُبنَ وحداتهما، فلا شيء يُوقَف الآن؛ عند بنائهما تقرأ `perf::eco()` (ذرّية بلا قفل).
- **الحركة:** `src/motion.ts` نقطة التحكّم الوحيدة — `setMotionLevel`/`resolveMotion`/`useMotionLevel`/`useEco`؛ `useSettings` يطبّقها في النوافذ الأربع (و`data-motion` على `<html>` لـCSS). انظر docs/MOTION.md «مستويات الحركة».


### مضاف: عيون التميمة (mascot)
- `mascot_active(active: bool)` — الواجهة (`Eyes.tsx`) تفعّل/توقف تتبّع المؤشر. **الخيط مركون (`park`) ما لم يكن مفعّلًا** ⇒ صفر استهلاك في Hidden (ملء الشاشة/الحبة مخفية/Eco/الحركة متوقفة/`eyesEnabled` مطفأ) وحين لا تكون الساعة هي المعروضة (ميديا/تنبيه/مؤقّت/تنزيل/تسجيل/لوحة مفتوحة).
- **حدث `mascot:look`** (الخلفية → main، payload `{x, y, over, near}`): `x,y` = موضع المؤشر الحقيقي (`GetCursorPos`) في إحداثيات صفحة main بـCSS px (مقرَّبة لخطوتين، قد تكون سالبة/خارج النافذة) · `over` = المؤشر فوق الحبة (انضغاط سعيد) · `near` = ضمن 240px من مركز الحبة (هستيريسيس حتى 272px). يُبثّ عند التغيّر فقط؛ بين عيّنتين بعيدتين (نوم) لا يُبثّ شيء. استطلاع: 50ms قريبًا، 400ms بعيدًا (قراءة نظام واحدة بلا JS).
- الإعداد `eyesEnabled` (افتراضيه `true`) — قسم «الميديا والمظهر» في الإعدادات.

### مضاف: الزجاج الحقيقي (backdrop)
- `island_backdrop(glass: bool, light: bool, radius: f64, tint: f64) → "none"|"win11"|"win10"` — أمر داخلي من `Pill` (عبر `useBackdrop`) لنافذة **main فقط**. `glass=true` ⇒ Acrylic حقيقي خلف النافذة بصبغة تتبع `light`، مع منطقة (SetWindowRgn) كبسولية بنصف قطر `radius` (CSS px؛ الارتفاع/2 منكمشة · 28 مفتوحة · 24 شريط الأوامر)؛ `glass=false` ⇒ إزالة كاملة. الناتج = الآلية الفعلية؛ `"none"` = غير مدعوم/فشل (يُبتلع بصمت) فتبقى الواجهة على الزجاج داخل الصفحة. بلا حدث ولا خيط ولا مؤقّت. `report_island_rect` يُسقط الخلفية قبل تغيير الحجم (المنطقة بحجم النافذة)، والواجهة تعيد الطلب بعد استقرار الحركة.

### مضاف: رام أدق + نوافذ كسولة (بلا أوامر جديدة)
- `perf_ram()` — نفس الأمر والشكل + حقل `metric`: `"private"` = **Private Working Set** (`GetProcessMemoryInfo` بـ`PROCESS_MEMORY_COUNTERS_EX2`؛ لا تُحسب الصفحات المشتركة بين عمليات WebView2 مكررة) · `"mixed"` = بعض العمليات رجعت لـWorking Set لتعذّر قراءتها · `"working"` = Working Set كاملًا (ويندوز < 1809/صلاحيات). يُقرأ لعمليات شجرة التطبيق المحتسبة فقط (الرئيسية + WebView2 الأحفاد).
- `open_settings()` / `editor_open(path?)` (وقدَم `editor::open_path` من الالتقاط): **نفس الأسماء والسلوك المرئي**، لكن النافذتان لا تُنشآن عند الإقلاع — تُنشآن عند أول طلب ثم تُعرضان وتُركَّزان فقط إن وُجدتا، وتُدمَّران فعليًا عند الإغلاق. النوافذ أربع في التطبيق: `main` و`overlay` من `tauri.conf.json`، و`settings` و`editor` عند الطلب (`lazywin.rs`). الأمران async.
- **تحديث (glassTint):** المعامل الرابع `tint` = إعداد `glassTint` (0–80، يُحصَر؛ غير صالح ⇒ 45) ويُستعمل لصبغة **ويندوز 10** فقط: ألفا الأكريليك = `0.28 + 0.0075·tint` (45 ⇒ 0.62 كالسابق)، والفاتح +0.04 بسقف 0.92؛ تغيّره وحده يحدّث الصبغة دون مسح الخلفية (لا وميض أثناء سحب المنزلق). **ويندوز 11:** يتجاهله — الصبغة في CSS من `--glass-tint`. لا أوامر/أحداث أخرى جديدة.

### مضاف: جلسة الإبهار — سرعتا الشبكة (netspeed) ووضع تبويب المتصفح (dock)
- `netspeed_active(active: bool)` — الواجهة (`useNetSpeed`، من `Pill`) تفعّل/توقف قياس سرعتي الشبكة. **الخيط مركون (`park`) ما لم يكن مفعّلًا** (إعداد `showNetSpeed` = false افتراضيًا، ويُركَن أيضًا والحبة مخفية) ⇒ صفر قراءة وصفر بثّ عند الإطفاء. القراءة من عدّادات ويندوز المحلية (sysinfo/GetIfTable2) بلا شبكة خارجية؛ تتباطأ إلى 3s في Eco (1s عادةً). وحدة `netspeed.rs`.
- **حدث `net:speed`** (الخلفية → main، payload `{down, up}` بايت/ث مقرَّبة لخطوة 1KB/ث): يُبثّ عند تغيّر القيمة المقرَّبة فقط. تتجاهل الواجهات loopback/pseudo.
- `island_dock_get() → {active, browser, strip, inset}` — حالة وضع تبويب المتصفح الحالية (تُسأل عند إقلاع/إعادة تحميل صفحة main لأن الحدث يُبثّ عند التغيّر فقط). `win.rs`.
- **حدث `island:dock`** (الخلفية → main، payload `{active, browser, strip, inset}`؛ `active=false` ⇒ العودة للوضع العائم الطبيعي): يُحسب في خيط fullscreen-watch **القائم** (لا خيط جديد) فقط حين `browserTabMode` مفعّل وخارج Eco؛ الشروط: النافذة الأمامية ليست لنا، exe ∈ {chrome, msedge, brave, firefox, vivaldi}، النافذة مكبَّرة (`IsZoomed`)، وحدودها تشمل مركز الحبة أفقيًا وتبدأ عند أعلى الشاشة. نافذتنا الأمامية ⇒ لا تغيير. أي غموض ⇒ `active=false`. الواجهة تتحقق من الحمولة (`sanitizeDock`) وتعتبر أي قيمة مشوّهة وضعًا طبيعيًا.
- إعدادات جديدة (في `src/settings.ts` و`state.rs::defaults`): `browserTabMode` (false)، `showNetSpeed` (false).
- ثوابت الشريط لكل متصفح (CSS px عند DPI 100%): chrome/edge/brave = 41 (حيّز علوي 6)، firefox/vivaldi = 40 (حيّز 5) — `win.rs::BROWSERS`، تقديرية وتُعاير على ويندوز (قائمة القبول في STATUS.md).

### مضاف في L1 — لوحة «اليوم» (today.rs)
- `today_cities()` → `[{id, ar, en}]` (20 مدينة سعودية مضمّنة الإحداثيات) · `today_get()` → `{city:{id,ar,en}, prayers:[{id,at(ms epoch)}], next_day_at}`؛ `prayers` = fajr, sunrise, dhuhr, asr, maghrib, isha لليوم المدني ثم **فجر الغد** (سابع عنصر). المدينة من إعداد `prayerCity` (الافتراضي `riyadh`). الحساب محلي بلا شبكة، طريقة أم القرى (الفجر 18.5° · العشاء = المغرب+90د و120د في رمضان — رمضان بتقويم جدولي ±يوم)، واليوم المدني بتوقيت UTC+3 لا بتوقيت الجهاز. التاريخ الهجري يُعرض من الواجهة بـ`Intl` تقويم `islamic-umalqura` (بلا أمر).
- `weather_get(refresh?: bool)` → `{enabled, offline, temp, feels, humidity, wind, code(WMO), is_day, units:"c"|"f", city, fetched_at}` من Open-Meteo (`api.open-meteo.com/v1/forecast` بلا مفتاح) لمدينة `prayerCity`. **اختياري صريح:** `showWeather` معطّل افتراضيًا ⇒ يرجع `{enabled:false}` بلا أي طلب شبكي؛ غياب الشبكة ⇒ `offline:true` دون خطأ؛ تخزين مؤقت في الذاكرة 15 دقيقة. الاسم مأخوذ من العقد الأصلي، والمصدر هنا Open-Meteo بدل MET Norway (`weather_refresh`/`weather_search` غير منفّذين بعد؛ `refresh=true` يغني عن الأول).
- **`island:note`** صار يحمل أيضًا `kind:"prayer"` (تنبيه الصلاة: قبل 10 دقائق «العصر بعد 10 دقائق» وعند الدخول «حان وقت صلاة العصر») بصوت `alertSound` نفسه. خيط التنبيه كل 5s، نافذة إطلاق 90s بعد الموعد (الفائت بسبب نوم الجهاز لا يُنبَّه)، والشروق بلا تنبيه.
- **إعدادات جديدة (src/settings.ts + state.rs):** `showToday` (افتراضي true) · `prayerCity` (`riyadh`) · `prayerAlerts` (true) — إضافةً لاستعمال `showWeather` و`weatherUnits` و`alertSound` الموجودة؛ كلها في قسم «اليوم والصلاة» بنافذة الإعدادات.

### مضاف في L2 — إجراءات الحافظة الذكية
- `clip_set_text(text)` (من العقد الأصلي، نُفِّذ الآن في clipboard.rs) — يضع نصًا في حافظة ويندوز **بلا لصق**؛ يمرّ عبر المستمع كأي نسخ فيظهر في السجل. لا تغيير في التخزين أو `clip_*` الأخرى.
- الكشف في الواجهة فقط (`src/clipActions.ts`، أنماط صريحة، `npm run test:clip`): رابط (`http(s)://` أو `www.`) ← «فتح» عبر `open_path` · جوال (`+<8..15>`، `00…`، `05XXXXXXXX`، `9665XXXXXXXX`؛ يقبل الأرقام العربية والفواصل) ← «مراسلة واتساب» (`https://wa.me/<digits>`) · لون `#rgb/#rgba/#rrggbb/#rrggbbaa` ← «نسخ RGB» · تعبير حسابي مركّب (محلّل الحاسبة الآمن نفسه، بلا تواريخ ولا أرقام مجردة) ← «= النتيجة» + «نسخ النتيجة» · نص فيه حروف ← «ترجمة» (`translate.google.com/?sl=auto&tl=<en إن غلب العربي وإلا ar>&text=…`، ≤1500 حرف). الأولوية: رابط > لون > جوال > حساب > نص. فتح الروابط/الترجمة بنقرة صريحة من المستخدم فقط.

### مضاف في L3 (sysinfo.rs + audio.rs + brightness.rs + privacy.rs — حسب المخطط §7/audio وprivacy)
- `sysinfo_get()` → `{cpu 0..100, mem_used, mem_total, mem_percent}`. **لا خيط خلفي**: القياس عند الاستدعاء فقط (الواجهة تستدعيه كل ~2s وقسم «النظام» مفتوح) ⇒ كلفة صفر عند إغلاق اللوحة؛ أول قياس بعد غياب >5s يأخذ خط أساس ثم عيّنة بعد 200ms.
- `volume_get()` · `volume_set(level 0..1)` · `volume_step(delta)` · `volume_mute_toggle()` → `{available, volume 0..1, muted}` (جهاز الإخراج الافتراضي، IAudioEndpointVolume)؛ كل تغيير يبثّ **`audio:state`** بالحمولة نفسها. رفع المستوى فوق 0 يفكّ الكتم. `showVolume` (افتراضيه مفعّل) يخفي المنزلق فقط.
- `brightness_get()` → `{available, level 0..100}` · `brightness_set(level)` (WMI `WmiMonitorBrightness[Methods]` عبر powershell مخفي، عند الطلب فقط؛ الحفظ عند إفلات المنزلق). `available:false` (سطح مكتب/شاشة خارجية) ⇒ الواجهة تخفي المنزلق.
- `privacy_status()` → `{mic, cam}` · حدث **`privacy:update`** (نفس الحمولة، عند التغيّر فقط). المصدر: قراءة ريجيستري `HKCU\...\CapabilityAccessManager\ConsentStore\{microphone,webcam}` (+`NonPackaged`)؛ قيد الاستخدام = `LastUsedTimeStart>0 && LastUsedTimeStop==0`. فحص كل 3s **فقط** عند `privacyIndicator` مفعّلًا والحبة ظاهرة (مخفية/مطفأة ⇒ لا قراءة). لا التقاط ولا تسجيل ولا شبكة.
- إعداد جديد: **`privacyIndicator`** (bool، افتراضيه معطّل) في `settings.ts`. الواجهة: تبويب «النظام» (`SystemSection.tsx`) + نقطة في الحبة (برتقالية = ميكروفون، خضراء = كاميرا) + قسم «النظام والخصوصية» في الإعدادات.

### مضاف في L4 (secrets.rs + ical.rs + meetings.rs — حسب AGENTS §5 وBLUEPRINT §7)
ميزة شبكية **اختيارية**: `showMeetings` (bool، افتراضيه معطّل). الرابط سرّ لا يدخل الإعدادات ولا kv ولا السجلات ولا رسائل الأخطاء.
- `meetings_key_set(url)` → `{set}`: يقبل `https://` أو `webcal://` فقط (≤2048 حرفًا، بلا محارف تحكم)، يحفظه مشفّرًا DPAPI في `<بيانات>/secrets/meetings_ical.bin` (وحدة `secrets.rs` العامة لباقي `*_key_set`)؛ نص فارغ ⇒ يحذف السرّ ويمسح الذاكرة. أخطاء: `https_only` / `invalid`. · `meetings_key_status()` → `{set}` (لا يعيد الرابط أبدًا).
- `meetings_list()` → `{configured, enabled, items:[{id,title,start,end(ms),location,join:{provider:"zoom"|"meet"|"teams"|"webex",url}|null,recurring}], error, fetched_at}` · `meetings_refresh()` (جلب فوري) → اللقطة نفسها · `meetings_join(url)` يفتح الرابط بالتطبيق الافتراضي **لروابط https لمزوّدي الاجتماعات المعروفين فقط** (zoom.us/zoom.com/zoomgov.com · meet.google.com · teams.microsoft.com/teams.live.com · webex.com، مع فكّ SafeLinks) وإلا `unsupported`.
- حدث جديد **`meetings:update`** (حمولته اللقطة نفسها) عند كل جلب/إعادة حساب/مسح.
- رموز `error`: `http:<code>` · `network` · `format` · `unreadable` (لا تحمل الرابط).
- **الجدولة:** خيط 10s؛ معطّل أو بلا رابط ⇒ لا جلب ولا حساب (وتُمسح الذاكرة). مفعّل ⇒ جلب كل 15 دقيقة (إعادة محاولة بعد دقيقتين عند الفشل ويُبقى آخر نجاح)، وحساب الـ7 أيام القادمة كل 5 دقائق. الأحداث في الذاكرة فقط.
- **التنبيه:** قبل 5 دقائق وعند البدء (≤90s) مرة واحدة لكل اجتماع عبر القناة نفسها **`island:note`** (`kind:"reminder"`، `id:"meeting:<id>"`) فتظهر في الحبة وبصوت `alertSound`؛ النص حسب `language`. (تغيير ظهور فقط: `note::alert` صارت `pub(crate)`.)
- **ICS:** VEVENT؛ UTC وTZID (IANA وأسماء ويندوز الشائعة وإزاحة VTIMEZONE) والعائم؛ RRULE: DAILY/WEEKLY/MONTHLY/YEARLY مع INTERVAL/COUNT/UNTIL/BYDAY(+2TU/-1FR)/BYMONTHDAY/BYMONTH؛ EXDATE؛ RECURRENCE-ID؛ يُهمل CANCELLED وأحداث طوال اليوم. الرابط يُستخرج من LOCATION/DESCRIPTION/URL/X-ALT-DESC/CONFERENCE/X-GOOGLE-CONFERENCE/…
- **الواجهة:** تبويب «الاجتماعات» (`MeetingsTab.tsx`، يظهر فقط مع `showMeetings`): مجموعات اليوم/غدًا/تاريخ، «الآن» للجاري، زر «انضمام» لكل اجتماع بلا ارتباط ⇒ لا زر؛ وقسم «الاجتماعات» في الإعدادات (حقل كلمة مرور لا يعرض القيمة المحفوظة + حفظ/حذف).
