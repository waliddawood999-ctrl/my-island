// مخطط الإعدادات الكامل — مستعاد من بنية Settings في Island v1.2.8
// المفاتيح (ai/stt) ليست هنا: تُحفظ مشفّرة DPAPI عبر ai_key_set / stt_key_set
/** مساحة عمل لشريط الأوامر: تُفتح كل عناصرها (تطبيق/مجلد/ملف كمسار، أو رابط http(s)) دفعة واحدة. */
export interface Workspace { id:string, name:string, items:string[] }

export type MotionLevelSetting = 'full'|'reduced'|'off';

export interface Settings {
  autostart:boolean,
  language:string,
  monitor:number,
  offsetX:number,
  style:string,
  opacityRest:number,
  opacityOpen:number,
  opacityThrough:number,
  gpuAcceleration:boolean,
  autoHide:boolean,
  showOnDesktop:boolean,
  hideInFullscreen:boolean,
  hideForApps:string[],
  keepForApps:string[],
  hideForAppsMode:string,
  through:boolean,
  hoverDelayMs:number,
  captureVisible:boolean,
  showClock:boolean,
  clockFormat:'auto'|'24'|'12',
  showBattery:boolean,
  btBatteries:boolean,
  batteryTip:boolean,
  attentionTracking:boolean,
  breakReminders:boolean,
  breakMinutes:number,
  mediaPill:string,
  homePlayer:string,
  liquidSpectrum:boolean,
  soundChoice:'chime'|'glass'|'pop'|'bubble'|'bell'|'none', // صوت التنبيه (WebAudio محلي — src/sounds.ts)
  soundVolume:number,             // 0..100
  mascot:string,
  character:string,
  characterMusic:string,
  recordFormat:'mp4'|'gif',
  recordingFps:30|60,
  recordingQuality:string,
  screenshotDir:string,
  recordingDir:string,
  uploadService:'none'|'imgur'|'imgbb',
  uploadKey:string,
  clipLimit:number,
  clipExcludedApps:string[],
  pasteOnClick:boolean,
  moduleMedia:boolean,
  moduleShelf:boolean,
  moduleLauncher:boolean,
  moduleControls:boolean,
  moduleWeather:boolean,
  controlsNet:string,
  showVolume:boolean,
  showLayout:boolean,
  showCaps:boolean,
  obsStatus:boolean,
  obsPort:number,
  agentsStatus:boolean,
  agentsAsk:boolean,
  showPrivacy:boolean,
  privacyIndicator:boolean,
  showMeetings:boolean,
  loadAlert:boolean,     // تنبيه حمل معالج مرتفع مستمر 90%+ لمدة 30s يسمّي التطبيق المسبّب؛ مطفأ افتراضيًا (عيّنة كل 5s فقط حين يُفعَّل وخارج Eco)
  meetingLeadMin:number, // «اجتماع قريب» في الكبسولة/البطاقة: دقائق قبل البدء (1..60)
  showVpn:boolean,
  vpnLookupIp:boolean,
  showNotifications:boolean,
  notifyMuted:string[],
  paletteFiles:boolean,
  paletteFolders:boolean,
  searchEngine:string,
  searchUrl:string,
  liveRates:boolean,
  ecoMode:boolean,
  ecoOnBattery:boolean,
  motionLevel:MotionLevelSetting,
  eyesEnabled:boolean,
  pillWidth:number,
  pillHeight:number,
  themeMode:'system'|'dark'|'light',
  themeMaterial:'solid'|'glass',
  glassTint:number,
  glassBlur:number,               // مهجور (T04): بلا أثر على ويندوز (CSS backdrop-filter لا يرى سطح المكتب)؛ يبقى للتوافق مع kv/الاستيراد
  glassSaturation:number,         // مهجور (T04): كـglassBlur
  glassStyle:'crystal'|'clear',   // أسلوب الزجاج: بلوري (Liquid Glass) / شفاف — docs/GLASS.md
  accentColor:string,             // لون التمييز #rrggbb
  borderStrength:number,          // قوة الحدود 0..100 (50 = افتراضي)
  shadowStrength:number,          // قوة الظلال 0..100 (50 = افتراضي)
  cornerStyle:'rounded'|'extra',  // استدارة البطاقات والأزرار
  fontScale:number,               // مقياس الخط 90..120 (٪)
  density:'comfortable'|'compact',
  pillRadius:number,              // نصف قطر الحبة 0..22 (0 = كبسولة كاملة تلقائيًا)
  offsetY:number,                 // إزاحة رأسية عن الحافة العليا 0..60
  pillPosition:'center'|'left'|'right',
  islandDocking:'floating'|'attached', // وضع التموضع: عائمة (هامش offsetY) أو ملتصقة بأعلى الشاشة (صفر هامش، زوايا علوية مسطّحة)
  motionPreset:'calm'|'snappy'|'bouncy'|'boringNotch'|'cultUi', // نوع الحركة (islandMotion.ts) — يحلّ محلّ springStyle
  motionSpeed:number,             // 0.5..2.0 (يحلّ محلّ animSpeed ٪)
  motionBounce:number,            // 0..0.40؛ الإغلاق دائمًا بلا ارتداد
  reduceMotion:'system'|'always'|'never', // تقليل الحركة (كان bool: true⇒always، false⇒system)
  // ── T03: حالات الجزيرة (حبة/لمحة/لوحة)
  peekWidth:number, peekHeight:number, peekRadius:number,
  panelWidth:number, panelHeight:number, panelRadius:number,
  hoverZone:'island'|'islandAndBelow',
  peekWheelCycle:boolean,
  peekCardOrder:string[],         // ترتيب لمحات: تبديل مرتّب من player|today|weather|timer
  panelWheelPaging:boolean,
  panelTabsStyle:'labels'|'icons'|'dots'|'hidden',
  backgroundOpacity:number,       // 0.3..1.0
  accentMode:'auto'|'fixed',      // auto = من غلاف الأغنية
  playerLayout:'compact'|'large'|'minimal',
  visualizer:'bars'|'wave'|'off',
  showPlaybackTime:boolean, showSourceBadge:boolean, showProgress:boolean, artworkBackdrop:boolean,
  settingsVersion:number,         // ترحيل الإعدادات (appearance.ts::migrateSettings)
  showNetSpeed:boolean,
  workspaces:Workspace[],
  weatherCity:string,             // مدينة الطقس (id من جدول today.rs؛ الافتراضي madinah) — مستقلة عن prayerCity
  weatherLat:number,
  weatherLon:number,
  weatherUnits:'c'|'f',
  showWeather:boolean,
  weatherAlerts:boolean,
  showToday:boolean,     // قسم «اليوم» في الرئيسية (هجري + مواقيت صلاة + طقس)
  prayerCity:string,     // معرّف مدينة سعودية من جدول today.rs (riyadh, makkah, ...)
  showCountdowns:boolean,  // «اليوم»: عدّادات أحداث المستخدم (أقرب حدثين)؛ مطفأ ⇒ لا حساب ولا عرض
  countdowns:Array<{id:string,name:string,date:string}>, // [{id,name,date:YYYY-MM-DD}] حتى 12؛ تُخزَّن في kv ضمن الإعدادات
  showWorldClock:boolean,  // «اليوم»: ساعة عالمية مصغّرة لمدينة أو مدينتين؛ مطفأ ⇒ لا حساب ولا عرض
  worldClocks:string[],    // أسماء IANA (حتى 2) من قائمة today.ts::WORLD_CITIES
  prayerAlerts:boolean,  // تنبيه قبل الصلاة 10د وعند دخول الوقت (بصوت alertSound إن ضُبط)
  aiBaseUrl:string,
  aiModels:string[],
  sttBaseUrl:string,
  sttModel:string,
  sttLanguage:string,
  dictatePaste:boolean,
  checkUpdates:boolean,
  updateAutoCheck:boolean, // فحص صامت واحد بعد الإقلاع بثوانٍ عن تحديث موقّع (tauri-plugin-updater)؛ لا شيء يظهر عند الغياب/الفشل
  hotkeyToggle:string,
  hotkeyPalette:string,
  hotkeyChat:string,
  hotkeyDictate:string,
  hotkeyArea:string,
  hotkeyScreen:string,
  hotkeyOcr:string,
  hotkeyClipboard:string,
  hotkeyPlainPaste:string,
  hotkeyMic:string,
  hotkeyColor:string,
  hotkeyQr:string,
  hotkeyRecord:string,
  hotkeyThrough:string,
  hotkeyVpn:string
}

export const DEFAULTS: Partial<Settings> = {
  language: "ar",
  hoverDelayMs: 250,        // مهلة فتح اللمحة (0..800 خطوة 50)
  clockFormat: "auto",
  aiBaseUrl: "https://api.groq.com/openai/v1",
  sttBaseUrl: "https://api.groq.com/openai/v1",
  sttModel: "whisper-large-v3-turbo",
  recordingFps: 30,
  recordFormat: "mp4",
  hotkeyPalette: "Alt+Space", // فارغ = شريط الأوامر معطّل
  hotkeyArea: "Ctrl+Alt+A",   // لقطة منطقة؛ فارغ = معطّل؛ "PrintScreen" يعترض زر Print Screen
  hotkeyScreen: "Ctrl+Alt+S", // لقطة الشاشة كاملة (تحت المؤشر)
  hotkeyRecord: "Ctrl+Alt+R", // تسجيل منطقة (يبدّل بدء/إيقاف)؛ فارغ = معطّل
  hotkeyColor: "Ctrl+Alt+C",  // منتقي الألوان؛ فارغ = معطّل
  recordingQuality: "medium", // low | medium | high
  checkUpdates: true,
  updateAutoCheck: true,
  attentionTracking: true, // «وقتي»: يعمل افتراضيًا ومحلي فقط؛ false = إيقاف كامل بلا مراقبة ولا كتابة
  breakReminders: false,   // تذكير استراحة بعد استخدام متواصل (صريح من المستخدم)
  breakMinutes: 60,        // مدة الاستخدام المتواصل قبل التذكير (دقائق)
  btBatteries: true,       // قسم البطارية: بطاريات أجهزة البلوتوث (BLE/GATT) المتصلة؛ يعمل فقط مع showBattery
  ecoMode: false,          // وضع التوفير اليدوي: يبطّئ الحافظة وتتبّع النافذة ويوقف بلوتوث البطارية وطيف الصوت ويخفض الحركة
  ecoOnBattery: false,     // يفعّل Eco تلقائيًا عند فصل الشاحن ويوقفه عند توصيله (اليدوي يبقى)
  pillWidth: 220,          // عرض الحبة المنكمشة (160..280)
  pillHeight: 34,          // ارتفاعها (28..44)؛ المحتوى (خط/عيون/أيقونات) يتدرج k=ارتفاع/32
  themeMode: 'system',     // system = يتبع النظام · dark · light (كل النوافذ)
  themeMaterial: 'glass',  // solid = مصمت · glass = شفافية مع blur (الافتراضي زجاجي)
  glassTint: 45,           // قوة تظليل الزجاج 0..80 (٪) — لا أثر إلا مع themeMaterial=glass؛ ويندوز 11: صبغة الصفحة · ويندوز 10: ألفا الأكريليك
  glassBlur: 24,           // تمويه طبقة الزجاج CSS بالبكسل 0..40 (css.glass من المرجع) — مستقل عن الزجاج الأصلي؛ لا أثر إلا مع themeMaterial=glass؛ Eco يحدّه بـ8
  glassStyle: 'crystal',   // crystal = زجاج بلوري · clear = زجاج شفاف
  accentColor: '#4fd1c5',
  borderStrength: 50,
  shadowStrength: 50,
  cornerStyle: 'rounded',
  fontScale: 100,
  density: 'comfortable',
  pillRadius: 0,           // 0 = كبسولة كاملة (نصف الارتفاع)
  offsetY: 0,
  pillPosition: 'center',
  islandDocking: 'floating',
  motionPreset: 'calm',
  motionSpeed: 1,
  motionBounce: 0.1,
  reduceMotion: 'system',
  peekWidth: 460, peekHeight: 148, peekRadius: 30,
  panelWidth: 520, panelHeight: 290, panelRadius: 34,
  hoverZone: 'island',
  peekWheelCycle: true,
  peekCardOrder: ['player', 'today', 'weather', 'timer'],
  panelWheelPaging: true,
  panelTabsStyle: 'icons',
  backgroundOpacity: 1,
  accentMode: 'auto',
  playerLayout: 'compact',
  visualizer: 'bars',
  showPlaybackTime: true, showSourceBadge: true, showProgress: true, artworkBackdrop: true,
  settingsVersion: 3,
  glassSaturation: 180,    // تشبّع طبقة الزجاج CSS 100..200 (٪)؛ Eco يجعله 100
  showNetSpeed: false,     // سرعتا الشبكة (تحميل/رفع) في الكبسولة المدمجة؛ القراءة من عدّادات ويندوز فقط أثناء التفعيل (netspeed_active)
  eyesEnabled: true,       // عيون التميمة بجانب الساعة في الحبة المنكمشة (تُخفى تلقائيًا مع الميديا/التوفير/الحركة المتوقفة)
  motionLevel: 'full',     // full = نابضة · reduced = مخففة · off = متوقفة (انظر src/motion.ts)
  liveRates: true,         // شريط الأوامر: أسعار عملات حية (open.er-api.com) تُجلب كسولًا عند تحويل عملة وتُخزَّن 12 ساعة؛ false = المضمّنة فقط بلا شبكة
  batteryTip: true,        // قسم البطارية: نصيحة «افصل الشاحن عند 80%» أثناء الشحن
  loadAlert: false,
  meetingLeadMin: 15,    // «اجتماع قريب» في الكبسولة/البطاقة: دقائق قبل البدء (1..60)؛ يعمل فقط مع showMeetings
  showToday: true,       // محلي بلا شبكة؛ الطقس نفسه خلف showWeather (افتراضيًا معطّل)
  prayerCity: "riyadh",
  weatherCity: "madinah",
  soundChoice: "chime",
  soundVolume: 70,
  prayerAlerts: true,
  showCountdowns: true,
  countdowns: [],
  showWorldClock: false,
  worldClocks: [],
};
