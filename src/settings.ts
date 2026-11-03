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
  autoHide:boolean,
  hideInFullscreen:boolean,
  through:boolean,
  hoverDelayMs:number,
  captureVisible:boolean,
  showClock:boolean,
  clockFormat:'auto'|'24'|'12',
  clockPosition:'auto'|'free', // auto = الترتيب الحالي · free = الساعة حيث تضعها بـ clockX/clockY
  clockX:number, clockY:number, // مركز الساعة كنسبة 0..100 من عرض/ارتفاع الحبة (الوسط = 50)
  clockScale:number,            // حجم الساعة ٪ (60..180؛ 100 = الأساس)
  eyesAlign:'auto'|'left'|'center'|'right', // محاذاة العيون داخل الحبة
  showBattery:boolean,
  btBatteries:boolean,
  batteryTip:boolean,
  attentionTracking:boolean,
  breakReminders:boolean,
  breakMinutes:number,
  mediaPill:string,
  liquidSpectrum:boolean,
  soundChoice:'chime'|'glass'|'pop'|'bubble'|'bell'|'none', // صوت التنبيه (WebAudio محلي — src/sounds.ts)
  soundVolume:number,             // 0..100
  mascot:string,
  recordFormat:'mp4'|'gif',
  recordingFps:30|60,
  recordingQuality:string,
  screenshotDir:string,
  recordingDir:string,
  clipLimit:number,
  clipExcludedApps:string[],
  pasteOnClick:boolean,
  moduleMedia:boolean,
  moduleShelf:boolean,
  moduleLauncher:boolean,
  showVolume:boolean,
  privacyIndicator:boolean,
  showMeetings:boolean,
  loadAlert:boolean,     // تنبيه حمل معالج مرتفع مستمر 90%+ لمدة 30s يسمّي التطبيق المسبّب؛ مطفأ افتراضيًا (عيّنة كل 5s فقط حين يُفعَّل وخارج Eco)
  meetingLeadMin:number, // «اجتماع قريب» في الكبسولة/البطاقة: دقائق قبل البدء (1..60)
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
  themeMode:'system'|'dark'|'light'|'sun', // sun = نهار/ليل تلقائي بدورة الشمس المحلية
  themePack:string,               // معرّف حزمة الثيم (themePacks.ts) — الافتراضية obsidian
  themePackLight:string,          // حزمة منفصلة للوضع الفاتح ('' = themePack)
  themePackDark:string,           // حزمة منفصلة للوضع الداكن ('' = themePack)
  artBloom:number,                // مقياس إزهار Living Artwork 0..200 (٪؛ 100 = سقوف الرصّة)
  themeTune:Record<string, unknown>, // مخزون التخصيص الشامل (themeTune.ts): أسطح/أحجام/أيقونات/ظل/ضغط/تمرير… ضمن نطاقات مصمَّمة — المفاتيح غير الافتراضية فقط
  themeDisclosure:'basic'|'advanced'|'expert', // مستوى إفصاح قسم المظهر (الخبير يفتح محرر الرموز الخام)
  themeAnim:boolean,              // حركة الغسلة البطيئة (حزم التدرّج) — تعمل فقط والجزيرة مفتوحة وتُطفأ في Eco/تقليل الحركة
  themeCustom:Record<string, unknown>, // خانة الحزمة المخصصة الحيّة (بذور المستخدم ضمن نطاقات مصمَّمة)
  myThemes:Array<Record<string, unknown>>, // رفّ «ثيماتي»: نسخ المستخدم من حزم المصنع (id يبدأ بـ u:)
  accentSource:'pack'|'custom'|'windows'|'wallpaper', // مصدر الأكسنت: بذرة الحزمة · accentColor · أكسنت ويندوز · لون الخلفية الغالب (اختياري وصريح)
  themeMaterial:'solid'|'glass',
  glassTint:number,
  glassStyle:'crystal'|'clear',   // أسلوب الحجاب: مثلّج كثيف / شفاف أخفّ — docs/GLASS.md
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
  panelTabsStyle:'dock'|'labels'|'icons'|'dots'|'hidden',
  backgroundOpacity:number,       // 0.3..1.0
  accentMode:'auto'|'fixed',      // auto = من غلاف الأغنية
  playerLayout:'compact'|'large'|'minimal',
  visualizer:'bars'|'wave'|'off',
  progressStyle:'line'|'shimmer'|'wave'|'liquid'|'dashes',
  showPlaybackTime:boolean, showSourceBadge:boolean, showProgress:boolean, artworkBackdrop:boolean,
  settingsVersion:number,         // ترحيل الإعدادات (appearance.ts::migrateSettings)
  showNetSpeed:boolean,
  workspaces:Workspace[],
  weatherCity:string,             // مدينة الطقس (id من جدول today.rs؛ الافتراضي madinah) — مستقلة عن prayerCity
  weatherUnits:'c'|'f',
  showWeather:boolean,
  showToday:boolean,     // قسم «اليوم» في الرئيسية (هجري + مواقيت صلاة + طقس)
  prayerCity:string,     // معرّف مدينة سعودية من جدول today.rs (riyadh, makkah, ...)
  showCountdowns:boolean,  // «اليوم»: عدّادات أحداث المستخدم (أقرب حدثين)؛ مطفأ ⇒ لا حساب ولا عرض
  countdowns:Array<{id:string,name:string,date:string}>, // [{id,name,date:YYYY-MM-DD}] حتى 12؛ تُخزَّن في kv ضمن الإعدادات
  showWorldClock:boolean,  // «اليوم»: ساعة عالمية مصغّرة لمدينة أو مدينتين؛ مطفأ ⇒ لا حساب ولا عرض
  worldClocks:string[],    // أسماء IANA (حتى 2) من قائمة today.ts::WORLD_CITIES
  prayerAlerts:boolean,  // تنبيه قبل الصلاة 10د وعند دخول الوقت (بصوت alertSound إن ضُبط)
  updateAutoCheck:boolean, // فحص صامت واحد بعد الإقلاع بثوانٍ عن تحديث موقّع (tauri-plugin-updater)؛ لا شيء يظهر عند الغياب/الفشل
  hotkeyToggle:string,
  hotkeyPalette:string,
  hotkeyArea:string,
  hotkeyScreen:string,
  hotkeyColor:string,
  hotkeyRecord:string,
}

export const DEFAULTS: Partial<Settings> = {
  language: "ar",
  hoverDelayMs: 250,        // مهلة فتح اللمحة (0..800 خطوة 50)
  clockFormat: "auto",
  clockPosition: "auto",
  clockX: 50,
  clockY: 50,
  clockScale: 100,
  eyesAlign: "auto",
  recordingFps: 30,
  recordFormat: "mp4",
  hotkeyPalette: "Alt+Space", // فارغ = شريط الأوامر معطّل
  hotkeyArea: "Ctrl+Alt+A",   // لقطة منطقة؛ فارغ = معطّل؛ "PrintScreen" يعترض زر Print Screen
  hotkeyScreen: "Ctrl+Alt+S", // لقطة الشاشة كاملة (تحت المؤشر)
  hotkeyRecord: "Ctrl+Alt+R", // تسجيل منطقة (يبدّل بدء/إيقاف)؛ فارغ = معطّل
  hotkeyColor: "Ctrl+Alt+C",  // منتقي الألوان؛ فارغ = معطّل
  recordingQuality: "medium", // low | medium | high
  updateAutoCheck: true,
  attentionTracking: true, // «وقتي»: يعمل افتراضيًا ومحلي فقط؛ false = إيقاف كامل بلا مراقبة ولا كتابة
  breakReminders: false,   // تذكير استراحة بعد استخدام متواصل (صريح من المستخدم)
  breakMinutes: 60,        // مدة الاستخدام المتواصل قبل التذكير (دقائق)
  btBatteries: true,       // قسم البطارية: بطاريات أجهزة البلوتوث (BLE/GATT) المتصلة؛ يعمل فقط مع showBattery
  ecoMode: false,          // وضع التوفير اليدوي: يبطّئ الحافظة وتتبّع النافذة ويوقف بلوتوث البطارية وطيف الصوت ويخفض الحركة
  ecoOnBattery: false,     // يفعّل Eco تلقائيًا عند فصل الشاحن ويوقفه عند توصيله (اليدوي يبقى)
  pillWidth: 220,          // عرض الحبة المنكمشة (160..280)
  pillHeight: 34,          // ارتفاعها (28..44)؛ المحتوى (خط/عيون/أيقونات) يتدرج k=ارتفاع/32
  themeMode: 'dark',     // dark · light (القيمتان القديمتان system/sun تُحلّان إلى وضع النظام الحالي)
  themePack: 'obsidian',   // الحزمة الافتراضية الرائدة (أزرق أردوازي)
  themePackLight: 'ivory',
  themePackDark: 'noir-gold',
  accentSource: 'pack',
  themeAnim: true,
  themeTune: {},
  themeDisclosure: 'basic',
  themeCustom: {},
  myThemes: [],
  artBloom: 60,
  themeMaterial: 'glass',  // solid = مصمت · glass = زجاج مُحاكى (سطح ملوّن شبه شفاف مرسوم في الصفحة — docs/GLASS.md)
  glassTint: 45,           // شدة الحجاب 0..80 — لون/عتامة سطح الزجاج المُحاكى (يحدّد --glass-a)؛ لا أثر إلا مع themeMaterial=glass
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
  panelTabsStyle: 'dock',
  backgroundOpacity: 1,
  accentMode: 'auto',
  playerLayout: 'compact',
  visualizer: 'bars',
  progressStyle: 'line',
  showPlaybackTime: true, showSourceBadge: true, showProgress: true, artworkBackdrop: true,
  settingsVersion: 4,
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
