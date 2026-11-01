# مخطط بناء Island من الصفر — كل التفاصيل المستخرجة بالهندسة العكسية

> هذا المخطط مبني على فكّ فعلي لإصدار **Island v1.2.8**: استُخرجت الواجهة كاملة من داخل الباينري (13 ملفًا، 1.4MB بعد فك ضغط Brotli)، واستُعيدت أسماء الوحدات، وعقد الـ IPC كاملًا (132 أمرًا)، ومخطط الإعدادات (~110 حقول)، وسكيما قاعدة البيانات حرفيًا.
> الهدف: تبني نسختك الخاصة — بلغتك وهويتك — بنفس المعمارية المُثبتة، لا نسخة كربونية.

---

## 1) المعمارية في صورة واحدة

```
┌─ WebView2 (React + Tailwind) ─────────────┐
│  index.html    الحبة + اللوحة (النافذة الرئيسية) │
│  overlay.html  طبقة التقاط ملء الشاشة           │
│  settings.html نافذة الإعدادات                  │
│  editor.html   محرّر ترميز اللقطات              │
└──────────────┬────────────────────────────┘
        invoke (أوامر) ⬇   ⬆ emit/listen (أحداث)
┌─ Rust (Tauri 2.12) ───────────────────────┐
│  27 وحدة: win, media, ai, agents, license… │
│  SQLite (island.db) + kv للإعدادات والحالة  │
│  Win32/WinRT: SMTC, WASAPI, OCR, DPAPI…    │
└───────────────────────────────────────────┘
```

**لماذا Tauri وليس Electron؟** المثبّت كله 4.5MB والباينري 12MB — لأن WebView2 موجود أصلًا في ويندوز. Electron كان سيجعل الحجم +120MB. ذاكرة التشغيل أيضًا أخف بكثير، وهو حاسم لتطبيق يسكن الشاشة دائمًا.

## 2) المكدّس الدقيق (بالإصدارات المستخرجة)

| الطبقة | الاختيار الأصلي |
|---|---|
| الإطار | Tauri **2.12.0** + wry 0.57 + WebView2 |
| الخلفية | Rust (tokio 1.53)، بُني على `S:\` عند المطوّر |
| الواجهة | **React** (hooks: ‏79 useState في المكوّن الرئيسي وحده) + **Vite** (منفذ dev: ‏1420) + **Tailwind CSS v4** |
| الأيقونات | Lucide (حزمة `lucide-react`) |
| محرّر الملاحظة | **Tiptap** (مبني على ProseMirror) مع إضافة undo/history |
| قاعدة البيانات | SQLite عبر **rusqlite 0.37** — وضع WAL، ‏`synchronous=NORMAL` |
| HTTP | عميلان: **reqwest 0.13** (async + rustls) للبثّ، و**ureq 3.4** (sync) للطلبات السريعة |
| إضافات Tauri | global-shortcut 2.4 · single-instance 2.5 · updater 2.13 · drag 2.1 |
| مكتبات مفتاحية | arboard + clipboard-master (حافظة) · rqrr (QR) · pdf-extract + lopdf (PDF) · zip + cfb (Office) · image + gif · tungstenite (WebSocket لـ OBS) · minisign-verify |
| الخط | خط النظام (Segoe UI) — لا خطوط مضمّنة؛ اللون المميّز `#8ea2ff` (أزرق بنفسجي فاتح) على أسود `#000` وأبيض |

## 3) النوافذ الأربع — المواصفات

| النافذة | المواصفات المستنتجة |
|---|---|
| **الرئيسية** (island) | بلا إطار، شفافة، always-on-top، لا تسرق الفوكس (`WS_EX_NOACTIVATE`)، تتوسّع/تنكمش بأنيميشن، تُخفى في الألعاب ملء الشاشة الحصرية، وتُستثنى افتراضيًا من اللقطات/التسجيل (`captureVisible` — عبر `SetWindowDisplayAffinity`) |
| **Overlay** | ملء شاشة الشاشة المستهدفة فوق لقطة مجمّدة (frozen frame) — تحديد منطقة للّقطة/OCR/QR/الألوان؛ لذا «لا تصير سوداء أبدًا» كما في سجل التغييرات |
| **الإعدادات** | نافذة عادية مستقلة بأقسام يسارًا (منذ 1.2.7)، وشارات `جديد منذ X.Y.Z` و`Pro` بجانب الميزات |
| **المحرّر** | نافذة تعديل لقطة: أسهم/مربعات/قلم/نص/تمويه + Undo |

حيل ويندوز المهمة: النافذة الرئيسية تراقب نبض صفحتها (`page_pong` عبر invoke دوري من JS) — إن صمتت الصفحة أعاد الـ watchdog تشغيل التطبيق ذاتيًا وسجّل الحادثة (وحدة `watchdog.rs`). وهناك أمران `take_focus`/`release_focus` للتحكم الدقيق بمن يملك فوكس الكيبورد لحظة بلحظة (سرّ «اللصق مكان المؤشر»).

## 4) عقد الـ IPC الكامل — 132 أمرًا (من الواجهة نفسها)

هذه قائمة الأوامر الحرفية التي تستدعيها الواجهة، مجمّعة بالوحدة:

- **النافذة/النظام:** `set_island_hidden` `through_toggle` `report_island_rect` `report_page_scale` `take_focus` `release_focus` `restart_island` `runs_as_admin` `open_settings` `open_path` `open_captures` `monitors_list` `prtsc_taken`
- **الإعدادات:** `settings_get` `settings_set` `settings_target`
- **الحافظة:** `clip_list` `clip_paste` `clip_pin` `clip_delete` `clip_clear` `clip_set_text` `clip_set_png` `clip_current_text`
- **الرفّ:** `shelf_list` `shelf_add` `shelf_remove` `shelf_clear`
- **اللانشر:** `launcher_list` `launcher_add` `launcher_remove` `launcher_launch` `launcher_pick_icon` `launcher_add_link` `launcher_edit_link` `launcher_link_icon` `launcher_groups_get/set` `launcher_hotkeys_get/set`
- **الميديا:** `media_control` `media_seek` `media_pick` `media_rename` `media_sources` `lyrics_get` · الصوت: `volume_set` `volume_step` `volume_mute_toggle` `mic_toggle` `audio_devices` `audio_inputs` `audio_set_default`
- **الالتقاط:** `capture_region` `capture_start` `capture_cancel` `record_begin` `record_start` `record_stop` `color_pick` `color_patch` `color_history` `editor_open` `editor_image` `editor_save` `upload_image` `pick_sound`
- **AI:** `ai_chat` `ai_run` `ai_cancel` `ai_models` `ai_test` `ai_key_set` `ai_key_status` · المحادثة: `chat_get` `chat_set` · المرفقات: `attach_pick` `attach_paths` `attach_data` `attachments_prune` · الإملاء: `dictate_toggle` `dictate_cancel` `stt_key_set` `stt_key_status` `stt_test`
- **الوكلاء:** `agents_now` `agents_connect` `agents_connections` `agents_answer`
- **الطقس:** `weather_get` `weather_refresh` `weather_search`
- **الملاحظة/التذكيرات/المؤقّت:** `note_get/set` `note_folders_get/set` `reminders_get/set` `timer_get/set`
- **التحكم:** `controls_get/set` `bt_devices` `bt_switch` `power_action` `vpn_chip` `vpn_refresh` `vpn_toggle_now`
- **شريط الأوامر/الملفات:** `palette_apps` `palette_recent` `palette_icon` `files_search` `files_warm` `files_held` `run_shell`
- **الترخيص/التحديث/أخرى:** `license_activate` `license_status` `license_remove` `update_check` `update_install` `news_get` `news_told` `notifications_access` `notifications_request` `obs_state` `obs_password_set/status` `hotkeys_check` `list_item`

**الأحداث (Rust → واجهة):** `ai:chunk` (بثّ SSE كلمة-كلمة) `ai:done` `ai:error` · `media:update/cover/bands/level` · `audio:state` · `agents:update/card/ask/ask-done` · `notify:new` · `island:edge/shy/keep/desktop/warn/note` · `mascot:look/sleep` · `cursor:near` · `input:layout/caps` · `vpn:choose` · `update:progress` · `weather:error` · `dictation:error` · `license:changed/needed`

**أنواع بيانات (serde structs) مكشوفة:** `ChatMessage(3)` · `Weather(9): Now(8) Hour(5) Day(7)` · `Lyrics(5)` · `Question(4)` · `Choice(2)` · `IpWho(4)` · `CbrDaily/Rates` · `News(4)` — أي إن الـ API بين الطبقتين typed بالكامل.

## 5) مخطط الإعدادات الكامل (~110 حقول — من بنية الـ Settings في Rust)

```
عام:      autostart, language, monitor, offsetX, underTaskbar, style,
          opacityRest, opacityOpen, opacityThrough, gpuAcceleration
سلوك:     autoHide, showOnDesktop, hideInFullscreen, hideForApps, keepForApps,
          hideForAppsMode, through, hoverDelayMs (0–600، خطوة 25),
          collapseDelayMs (100–1500، خطوة 50), captureVisible
الحبة:    showClock, clockFormat (auto/24/12), showBattery, mediaPill,
          lyricsInPlayer, lyricsInHome, homePlayer, liquidSpectrum,
          alertSound, mascot, character, characterMusic
اختصارات: hotkeyToggle, hotkeyPalette, hotkeyChat, hotkeyDictate, hotkey… (16 اختصارًا:
          Toggle/Area/Screen/Ocr/Clipboard/PlainPaste/Mic/Color/Qr/Palette/
          Record/Chat/Dictate/Through/Vpn + اختصار لكل عنصر لانشر)
التقاط:   recordFormat (mp4/gif), recordingFps (30/60), recordingQuality,
          screenshotDir, recordingDir, uploadService (imgur/imgbb), uploadKey
حافظة:   clipLimit, clipExcludedApps, pasteOnClick
وحدات:    moduleMedia, moduleShelf, moduleLauncher, moduleControls, moduleWeather,
          controlsNet, showVolume, showLayout, showCaps,
          obsStatus, obsPort, agentsStatus, agentsAsk,
          showPrivacy, showVpn, vpnLookupIp, showNotifications, notifyMuted
بحث:     paletteFiles, paletteFolders, searchEngine, searchUrl
طقس:     weatherCity, weatherLat, weatherLon, weatherUnits, showWeather, weatherAlerts
AI:      aiBaseUrl, aiModels, sttBaseUrl, sttModel, sttLanguage, dictatePaste
          (المفاتيح ليست هنا! تُحفظ مشفّرة DPAPI منفصلة: ai_key_set/stt_key_set)
تحديث:   checkUpdates
```
الافتراضيات المعروفة: AI = ‏`https://apinet.cloud/v1` نموذج `gemini-3.8-flash` · STT = ‏Groq ‏`whisper-large-v3-turbo` · ألوان/أصوات التنبيه من ويندوز أو WAV خاص.

**أقسام واجهة الإعدادات (من commands.rs):** ‏`settings / shelf / launcher / media / hotkeyErrors / audio / privacy / vpn / update / capsLock / license / trialOver / news / battery` — تُحفظ كل الإعدادات والحالة في جدول `kv` كـ JSON.

## 6) قاعدة البيانات (حرفيًا من الباينري)

```sql
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
CREATE TABLE clips(    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, text TEXT,
  image_path TEXT, thumb TEXT, width INTEGER, height INTEGER,
  hash TEXT NOT NULL UNIQUE,          -- بصمة تمنع التكرار
  pinned INTEGER NOT NULL DEFAULT 0, source TEXT, created_at INTEGER NOT NULL);
CREATE TABLE shelf(    id INTEGER PRIMARY KEY, path TEXT NOT NULL, … );
CREATE TABLE launcher( id INTEGER PRIMARY KEY, path TEXT, name TEXT, icon TEXT,
                       position INTEGER);   -- + ON CONFLICT(path) DO NOTHING
CREATE TABLE kv(       key TEXT PRIMARY KEY, value TEXT NOT NULL);
```
صور الحافظة ملفات على القرص (و`thumb` مصغّر base64)، والنص وحده في DB. استثناء نسخ مديري كلمات المرور عبر أعلام ويندوز الرسمية: `ExcludeClipboardContentFromMonitorProcessing` و`CanIncludeInClipboardHistory` + قائمة تطبيقات مستثناة يدوية (`clipExcludedApps`).

## 7) الوحدات — كيف بُنيت وكيف تبنيها

**الملفات المصدرية الأصلية (27):** `lib, commands, win, ai, agents, license, updater, watchdog, capture, recorder, ocr, dictation, media, player_audio, spectrum, lyrics, downloads, steam, obs, vpn, controls, audio, privacy, files, linkicon, attach, drop_target` (+ `state::AppState`).

| الوحدة | كيف تعمل في الأصل | وصفة البناء |
|---|---|---|
| **media** | جلسات SMTC ‏(WinRT `GlobalSystemMediaTransportControls`) + غلاف كصورة | crate `windows` — اشترك في SessionsChanged، والغلاف عبر `IRandomAccessStream` |
| **spectrum / player_audio** | التقاط WASAPI loopback من جهاز الإخراج الفعلي (لا الافتراضي — لذا يعمل مع المكسّرات) + FFT | `IAudioClient` loopback + FFT بـ rustfft؛ أرسل `media:bands` بمعدّل ~30fps |
| **lyrics** | LRCLIB ‏(`/api/get` بمطابقة فنان/عنوان/ألبوم/مدة) مع رفض نسخ remix/live/karaoke/sped-up من العنوان واختيار الأقرب مدةً؛ synced LRC أو plain | API مجاني بلا مفتاح؛ User-Agent بصيغة `Island/1.2.8 (…)` |
| ~~**downloads**~~ **(أُزيلت من منتجنا — INSERT F)** | مراقبة مجلد التنزيلات + ملفات مؤقتة للمتصفحات (.part/.crdownload…) + حذف `.tmp` من الحساب + قائمة تجاهل | `ReadDirectoryChangesW`/notify + منطق حالة لكل متصفح؛ Steam: فكّ `libraryfolders.vdf` ومراقبة `steamapps/downloading` |
| **agents** | حقن hooks في `~/.claude/settings.json` (مع نسخة احتياطية بجانبه) وتعيين `notify=[…]` في `~/.codex/config.toml` مع تمرير أي notify سابق؛ الأحداث عبر ملفات/خطاف محلي، والإجابة عن أسئلة Claude Code من البطاقة (`agents_answer`: verdict + answers) | حافظ على JSON/TOML سليمين وادمج لا تستبدل؛ اختبر على حساب وهمي أولًا |
| **dictation** | تسجيل من المايك المختار → multipart إلى `/audio/transcriptions` عند مزوّد STT → لصق اختياري مكان المؤشر (`dictatePaste`) | لا تعرّف محلي؛ التسجيل لا يُحفظ بعد التعرّف |
| **ai** | POST ‏`/chat/completions` ببث SSE: اقرأ `choices/0/delta/content` وابث `ai:chunk`؛ الصور تُصغّر وتُرسل vision (حتى 3)، والمستندات تُستخرج محليًا: PDF ‏(pdf-extract) وWord/Excel/PowerPoint ‏(zip+XML / cfb للقديم) ثم تُرسل نصًا | أي مزوّد OpenAI-compatible؛ `ai_models` يجلب `/models` لقائمة اختيار |
| **capture/ocr** | لقطة مجمّدة ‏Windows.Graphics.Capture أو GDI → overlay للتحديد → قصّ؛ OCR بمحرّكات ويندوز EN+RU مدموجة سطرًا بسطر من إحداثيات الأسطر | WinRT `Windows.Media.Ocr` — مجاني ومحلي بالكامل |
| **recorder** | Media Foundation ‏H.264 ‏(30/60fps، جودتان) أو GIF (crate `gif`) — **بلا صوت** | MF Sink Writer؛ GIF عبر تجميع إطارات مصغّرة |
| **vpn** | كشف عمليات (Happ, v2RayTun, Karing, WARP, Mullvad, PIA, Windscribe, OpenVPN) + قراءة `rasphone.pbk` + تبديل كلٍّ عبر واجهته/CLI؛ الدولة والـIP من `ipwho.is` (و`api.country.is` احتياطي) | لكل عميل طريقة تبديل مختلفة — ابدأ بـ WARP وOpenVPN واتصالات ويندوز |
| **controls** | Wi-Fi/Ethernet وBluetooth (أجهزة مقترنة + بطارياتها + اتصال بضغطة) وثيم داكن وطاقة (قفل/نوم/إعادة/إيقاف بتأكيد مزدوج) | WinRT Radios + `netsh`/خدمات؛ الثيم من الريجيستري `AppsUseLightTheme` |
| **privacy** | مؤشرا مايك/كاميرا من مفاتيح CapabilityAccessManager في الريجيستري + كتم كل المايكات (لا الافتراضي فقط) | راقب `ConsentStore\microphone/webcam` ‏LastUsedTime |
| **files/palette** | فهرس ملفات/مجلدات في الذاكرة فقط (لا يُحفظ)، تطبيقات من Start Menu + تطبيقات Store ‏(AUMID في كود media)، ملفات أخيرة، حاسبة تعبيرات، محوّل وحدات (وحدات: cm/in/ft/yd/mm/km/mi/mg/kg/lb/oz/ml/gal/ms/min/wk + أحجام بيانات kb/mb/gb/tb + سرعات kmh/mph) وعملات من `cbr-xml-daily.ru/daily_json.js`، بحث ويب (Google/Yandex/Bing/DDG/Brave/Ecosia/مخصص)، مؤقّت وتذكير بلغة طبيعية، و`>` لتنفيذ shell ‏(cmd/PowerShell؛ ‏Ctrl+Enter فتح المجلد، ‏Ctrl+Shift+Enter كمسؤول) | محلّل أوامر محلي بترتيب أولويات؛ التذكيرات بصيغة «… غدًا 9» و«كل يوم 23:00» و«بعد 20 دقيقة» تحتاج parser زمني للغتك |
| **linkicon** | أيقونة رابط اللانشر: favicon الموقع أو أيقونة الـ exe؛ ‏User-Agent خاص `Island/1.2.8 (Windows; launcher icon)` | بروتوكولات مسموحة فقط: http/https/ftp/mailto/tel/sms… |
| **license** | انظر §9 | |
| **watchdog** | نبض `page_pong` من JS؛ صمت الصفحة → إعادة تشغيل ذاتية + سجل | مؤقّت Rust يقارن آخر pong |

## 8) «السائل» — سرّ المنتج البصري

من فكّ مكوّن `Liquid` ‏(87KB JS):
- الرندر **SVG** لا WebGL: مسارات تُبنى بـ `createElementNS` وتتحدّث كل إطار بـ `requestAnimationFrame`.
- تأثير الـ **Gooey**: فلتر SVG ‏(Gaussian blur + color-matrix بقناة ألفا عالية التباين) يجعل الأشكال المنفصلة «تلتحم» كمعدن سائل — هذه هي «الفيروسيّالية» كلها بلا محرّك فيزياء ثقيل.
- الحافة السفلية: نقاط/نتوءات (spikes) بارتفاعات من **نطاقات FFT** الحقيقية، ملوّنة باللون الغالب من غلاف الألبوم (يُستخرج عبر canvas 2d بـ `willReadFrequently`).
- سلوكيات: تمدّد نحو المؤشر، قطرة تنفصل عند حدث سعيد، «ترهّل» عند غياب المستخدم (مع `mascot:sleep`)، وتنقيط عند مطر الطقس الحقيقي.
- الشخصيات الـ25 (4 فئات: Island/Characters/Creatures/Things): مخلوقات SVG إجرائية بمكوّن واحد (`id` + `mood`) وحالات مزاجية (انتباه، أكل، نوم، رقص مع الموسيقى…) وعيون تتبع المؤشر الحقيقي؛ بعضها خرائط بكسل نصية (`XXXX` grids). الحرّة منها 3 فقط.

## 9) المال: Pro والتحديث

**الترخيص (`license.rs`):** حالة `{pro, trialDaysLeft, serial}` في `kv`؛ التجربة 14 يومًا من `trialStart` محليًا ثم `trialOver`. التفعيل **أوفلاين 100%**: فحص صيغة/بصمة داخلية للمفتاح (رسائل الخطأ: «هذا ليس مفتاح Island Pro» / «المفتاح لا يناسب: تأكد أنه نُسخ كاملًا») — بلا خادم إطلاقًا. الشراء عبر lava.top (منتج `53729bb9-…` ودعم `3871177473`). درس مزدوج لنسختك: بساطة قصوى وتكلفة صفر… ومفتاح مسرّب واحد = Pro للجميع بلا إبطال ممكن.

**التحديث:** Tauri Updater + توقيع **minisign/Ed25519**؛ الـ endpoint: ‏`releases/latest/download/latest.json` على GitHub؛ فحص عند الإقلاع + كل 6 ساعات؛ المفتاح العام داخل الباينري (استخرجناه: يبدأ `RWRJIhhlcfw5pmL…`). لاحظ الفرق: هذا توقيع للتحديثات فقط — **المثبّت نفسه بلا Authenticode**، فاستثمر في شهادة توقيع ويندوز لنسختك من اليوم الأول (SmartScreen).

**المزوّدون الجاهزون (من واجهة الإعدادات نفسها):**

| الخدمة | Base URL | النموذج الافتراضي | مجاني؟ |
|---|---|---|---|
| Groq | api.groq.com/openai/v1 | qwen/qwen3.8-27b | نعم ~1000 طلب/يوم، صور، ونفس المفتاح للإملاء |
| Google Gemini | generativelanguage.googleapis.com/v1beta/openai | gemini-3.8-flash | نعم (AI Studio) |
| OpenRouter | openrouter.ai/api/v1 | openrouter/free | نعم 50 طلب/يوم |
| DeepSeek | api.deepseek.com/v1 | deepseek-flash | مدفوع رخيص |
| Polza.ai | api.polza.ai/api/v1 | google/gemini-3.8-flash | بوابة بالروبل |
| OmniRoute | localhost:20128/v1 | auto | بوابتك المحلية |
| APINET | apinet.cloud/v1 | gemini-3.8-flash | بوابة بالروبل (وهي الافتراضي!) |

STT: ‏Groq Whisper ‏`whisper-large-v3-turbo` (افتراضي) · Gemini · ‏OpenAI ‏`gpt-4o-mini-transcribe`.

**مصادر البيانات المجانية:** طقس MET Norway ‏`locationforecast/2.0/complete` + بحث مدينة Nominatim + مناطق زمنية GeoNames · كلمات LRCLIB · عملات بنك روسيا · ‏IP من ipwho.is.

## 10) نسختك أنت — بلغتك وطريقتك

ما يجعل بناء نسختك أسرع مما تظن: المطوّر نفسه بنى اللغتين بحيلة بسيطة — دالة `i(روسي، إنجليزي)` inline في كل نص بالواجهة، واللغة تُختار من الإعدادات (`language`). لنسختك:

1. **عربي أولًا بنفس الحيلة:** ‏`i('نصّك العربي', 'English')` — لا ملفات ترجمة منفصلة في البداية، وسرعة تطوير قصوى.
2. **RTL:** الحبة واللوحة متناظرة أصلًا (توسّط علوي)، لكن النصوص الطويلة والملاحظة وشريط الأوامر يحتاجون `dir=auto` وتجربة عربية حقيقية: parser التذكيرات («ذكّرني أتصل بأمي بكرة 9») هو أثمن ما ستبنيه بنفسك — الأصل بناه للروسية/الإنجليزية فقط.
3. **هوية بصرية:** الأصل: أسود + `#8ea2ff`. اختر لونك وخطّك (خط عربي مثل IBM Plex Sans Arabic أو Tajawal يُضمّن اختياريًا — الأصل اكتفى بخط النظام).
4. **تمييز فوري محتمل:** مزوّدو AI يهمّون جمهورك، أصوات تنبيه، تكاملات محلية — المعمارية كلها وحدات (`ISLAND_DISABLE` عند الأصل يثبت أن الوحدات قابلة للفصل والتبديل فعلًا).
5. **تجنّب أخطاءه:** لا توقيع Authenticode، ترخيص بلا خادم، واسم/أيقونة تغيّرا بعد الإطلاق (أيقونة 1.2.8 جديدة) — ثبّت هويتك وشهادتك من أول إصدار.

## 11) خطة تنفيذ مرحلية (فريق من شخص واحد)

| المرحلة | المحتوى | مؤشر النجاح |
|---|---|---|
| **0 — الهيكل** (أيام) | Tauri 2 + React/Vite/Tailwind، نافذة حبة ثابتة أعلى الشاشة بلا فوكس، إخفاء/إظهار، single-instance | حبة سوداء حية لا تعيق الكتابة |
| **1 — اللوحة** (أسبوع) | توسّع بالهوفر، تبويبات، حافظة (جدول clips + لصق مكان المؤشر)، إعدادات kv | لصق فعلي داخل تطبيق آخر |
| **2 — الحياة** (أسبوع) | ميديا SMTC + ساعة/بطارية + تنزيلات + سائل SVG gooey بطيف WASAPI | الحبة «حية» كموسيقى وتتحرك |
| **3 — الأدوات** (أسبوعان) | شريط أوامر (تطبيقات/حاسبة/محوّل/بحث)، لقطات + محرّر، رفّ ملفات، لانشر، ملاحظة Tiptap وتذكيرات | بديل يومي حقيقي لأدواتك الحالية |
| **4 — الذكاء** (أسبوع) | AI ببثّ SSE + مرفقات محلية الاستخراج + إملاء Whisper + أدوات نص (تخطيط/حالات/Base64/JSON/QR/ألوان/OCR) | محادثة وإملاء يعملان بمفتاح مجاني |
| **5 — الاحتراف** (أسبوع) | طقس، VPN/تحكم، OBS/Steam، وكلاء، ترخيص + تحديث موقّع + مثبّت NSIS | إصدار 1.0 قابل للبيع |

## 12) أين تجد كل شيء (ملفات الفحص المحفوظة)

في `~/workspace/reverse-engineering/island/`:
- `REPORT.md` — تقرير الجولة الأولى.
- `frontend/` — **الواجهة المستخرجة كاملة** (React minified: island/settings/overlay/editor + Liquid + CSS) — مرجعك الأول لأي تفصيلة واجهة.
- `extracted/island.exe` + مكونات NSIS، و`latest.json` و`strings-all.txt`.
- تنبيه: الكود minified لكنه مقروء؛ أسماء الدوال مضغوطة، أما النصوص والثوابت والبنى فحرفية.
