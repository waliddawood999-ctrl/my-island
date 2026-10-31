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
  underTaskbar:boolean,
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
  collapseDelayMs:number,
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
  lyricsInPlayer:boolean,
  lyricsInHome:boolean,
  homePlayer:string,
  liquidSpectrum:boolean,
  downloadsInPill:boolean,
  alertSound:string,
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
  showDownloads:boolean,
  steamDownloads:boolean,
  downloadsDir:string,
  downloadsIgnore:string[],
  obsStatus:boolean,
  obsPort:number,
  agentsStatus:boolean,
  agentsAsk:boolean,
  showPrivacy:boolean,
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
  themeMode:'dark'|'light',
  themeMaterial:'solid'|'glass',
  workspaces:Workspace[],
  weatherCity:string,
  weatherLat:number,
  weatherLon:number,
  weatherUnits:'c'|'f',
  showWeather:boolean,
  weatherAlerts:boolean,
  aiBaseUrl:string,
  aiModels:string[],
  sttBaseUrl:string,
  sttModel:string,
  sttLanguage:string,
  dictatePaste:boolean,
  checkUpdates:boolean,
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
  hoverDelayMs: 250,        // المدى في الأصل: 0..600 خطوة 25
  collapseDelayMs: 350,     // المدى في الأصل: 100..1500 خطوة 50
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
  attentionTracking: true, // «وقتي»: يعمل افتراضيًا ومحلي فقط؛ false = إيقاف كامل بلا مراقبة ولا كتابة
  breakReminders: false,   // تذكير استراحة بعد استخدام متواصل (صريح من المستخدم)
  breakMinutes: 60,        // مدة الاستخدام المتواصل قبل التذكير (دقائق)
  btBatteries: true,       // قسم البطارية: بطاريات أجهزة البلوتوث (BLE/GATT) المتصلة؛ يعمل فقط مع showBattery
  ecoMode: false,          // وضع التوفير اليدوي: يبطّئ الحافظة وتتبّع النافذة ويوقف بلوتوث البطارية وطيف الصوت ويخفض الحركة
  ecoOnBattery: false,     // يفعّل Eco تلقائيًا عند فصل الشاحن ويوقفه عند توصيله (اليدوي يبقى)
  pillWidth: 220,          // عرض الحبة المنكمشة (160..280)
  pillHeight: 34,          // ارتفاعها (28..44)؛ المحتوى (خط/عيون/أيقونات) يتدرج k=ارتفاع/32
  themeMode: 'dark',       // dark = أسود كالمرجع · light = فاتح كالمرجع (كل النوافذ)
  themeMaterial: 'solid',  // solid = مصمت · glass = شفافية مع blur
  eyesEnabled: true,       // عيون التميمة بجانب الساعة في الحبة المنكمشة (تُخفى تلقائيًا مع الميديا/التوفير/الحركة المتوقفة)
  motionLevel: 'full',     // full = نابضة · reduced = مخففة · off = متوقفة (انظر src/motion.ts)
  liveRates: true,         // شريط الأوامر: أسعار عملات حية (open.er-api.com) تُجلب كسولًا عند تحويل عملة وتُخزَّن 12 ساعة؛ false = المضمّنة فقط بلا شبكة
  batteryTip: true,        // قسم البطارية: نصيحة «افصل الشاحن عند 80%» أثناء الشحن
};
