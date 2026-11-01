// sysdepth — عمق مراقبة النظام لتبويب «النظام» فقط: استخدام GPU، درجات الحرارة (CPU/SSD حيث يتيحها ويندوز)، قدرة تقريبية،
// أعلى تطبيق استهلاكًا للمعالج، + تنبيه حمل مرتفع مستمر (30s) يسمّي التطبيق المسبّب عبر نظام التنبيهات القائم (note::alert).
//
// • `sysdepth_get` بلا حالة ولا خيط: يُستدعى من الواجهة كل ~3s وتبويب النظام مفتوح فقط (كـ perf_ram) ⇒ صفر كلفة عند إغلاقه.
//   في Eco يرجع Err("eco") بلا أي قراءة (انظر docs/IPC.md §Eco).
// • المصادر (ما يتيحه ويندوز فقط، ولا يُستبدل ما يغيب بقيمة وهمية — يعود null والواجهة تعرض «—»):
//     GPU%          ← عدّاد PDH «GPU Engine(*)\Utilization Percentage» (WDDM 2.0+، ويندوز 10 1709+): مجموع كل محرّك لكل
//                      (محوّل، نوع محرّك) ثم الأعلى — كما يفعل مدير المهام.
//     حرارة CPU/نظام ← عدّاد PDH «Thermal Zone Information(*)\Temperature» (كلفن): أسخن منطقة حرارية ACPI. كثير من الأجهزة
//                      (خصوصًا المكتبية) لا تكشف مناطق حرارية ⇒ null. ليست حرارة نواة دقيقة.
//     حرارة SSD     ← Get-StorageReliabilityCounter (PowerShell، تخزين مؤقّت 60s، خيط منفصل)؛ تحتاج غالبًا قرص NVMe/SATA يدعمها.
//     حرارة GPU     ← **لا يتيحها ويندوز** بلا SDK المورّد (NVML/ADLX): تبقى null دائمًا ولا نستدعي أدوات مورّدين.
//     القدرة        ← عدّاد PDH «Energy Meter(*)\Power» (ميلي واط، حزمة المعالج RAPL على العتاد الداعم فقط) ⇒ تقريبية أو null.
//     أعلى تطبيق    ← sysinfo: مجموع نسب المعالج لكل اسم exe (عملياتنا وSystem/Idle مستثناة) ÷ عدد الأنوية.
use serde::Serialize;
use std::collections::HashMap;

use crate::attention::app_key;
use crate::perf::{our_pids, Proc};

// ───────────────────────────── منطق خالص (يُختبر بلا ويندوز) ─────────────────────────────

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TopApp {
    pub name: String,
    /// % من مجموع المعالج (0..100)
    pub cpu: f32,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct Temps {
    /// أسخن منطقة حرارية (°م) — تقريب لحرارة المعالج/النظام
    pub cpu: Option<f32>,
    /// دائمًا null على ويندوز بلا SDK المورّد (موثّق)
    pub gpu: Option<f32>,
    pub ssd: Option<f32>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct Depth {
    pub gpu: Option<f32>,
    pub temps: Temps,
    /// واط تقريبًا (حزمة المعالج)
    pub power_w: Option<f32>,
    pub top: Option<TopApp>,
}

/// مفتاح (محوّل، نوع المحرّك) من اسم نسخة «GPU Engine»: `pid_123_luid_0x0_0x1_phys_0_eng_2_engtype_3D`.
fn gpu_group(name: &str) -> Option<String> {
    let l = name.find("luid_")?;
    let luid = name[l..].split("_phys").next()?;
    let t = name.find("engtype_")?;
    Some(format!("{luid}|{}", &name[t + 8..]))
}

/// استخدام GPU من نسخ العدّاد: يُجمع لكل (محوّل، نوع محرّك) ثم يؤخذ الأعلى ويُحصَر 0..100. لا نسخ صالحة ⇒ None.
pub fn gpu_percent(items: &[(String, f64)]) -> Option<f32> {
    let mut by: HashMap<String, f64> = HashMap::new();
    for (name, v) in items {
        if !v.is_finite() || *v < 0.0 { continue; }
        if let Some(k) = gpu_group(name) { *by.entry(k).or_insert(0.0) += v; }
    }
    by.values().cloned().fold(None, |m: Option<f64>, x| Some(m.map_or(x, |y| y.max(x)))).map(|v| v.clamp(0.0, 100.0) as f32)
}

/// أسخن منطقة حرارية من قيم كلفن؛ المقبول 1..125 °م فقط (القيم الصفرية/الشاذة تُهمل). لا قيمة صالحة ⇒ None.
pub fn thermal_celsius(kelvin: &[f64]) -> Option<f32> {
    kelvin
        .iter()
        .map(|k| k - 273.15)
        .filter(|c| c.is_finite() && *c >= 1.0 && *c <= 125.0)
        .fold(None, |m: Option<f64>, c| Some(m.map_or(c, |y| y.max(c))))
        .map(|c| (c * 10.0).round() as f32 / 10.0)
}

/// قدرة حزمة المعالج بالواط من نسخ «Energy Meter» (ميلي واط): نسخ الحزمة (اسمها يحوي PKG) فقط وتُجمع؛ لا شيء ⇒ None.
pub fn package_watts(items: &[(String, f64)]) -> Option<f32> {
    let mut sum = 0.0;
    let mut any = false;
    for (name, mw) in items {
        if name.to_ascii_uppercase().contains("PKG") && mw.is_finite() && *mw >= 0.0 {
            sum += mw;
            any = true;
        }
    }
    if !any { return None; }
    Some(((sum / 1000.0) * 10.0).round() as f32 / 10.0)
}

/// ناتج PowerShell لحرارة SSD (رقم لكل قرص): الأعلى بين 1..120؛ لا شيء صالح ⇒ None.
pub fn parse_ssd_temp(out: &str) -> Option<f32> {
    out.lines()
        .filter_map(|l| l.trim().parse::<f32>().ok())
        .filter(|t| t.is_finite() && *t >= 1.0 && *t <= 120.0)
        .fold(None, |m: Option<f32>, t| Some(m.map_or(t, |y| y.max(t))))
}

const IGNORED_APPS: [&str; 3] = ["system idle process", "idle", "system"];

/// أعلى تطبيق استهلاكًا للمعالج: تُجمع عمليات الاسم نفسه (متصفح بعشرات العمليات = تطبيق واحد)، تُستثنى عملياتنا وSystem/Idle،
/// ثم تُقسم على عدد الأنوية لنسبة من مجموع المعالج. أقل من `min_pct` ⇒ None (لا معنى لتسمية خامل).
pub fn top_app(procs: &[Proc], me: u32, ncpu: f32, min_pct: f32) -> Option<TopApp> {
    let ours = our_pids(procs, me);
    let n = ncpu.max(1.0);
    let mut by: HashMap<String, f32> = HashMap::new();
    for p in procs {
        if ours.contains(&p.pid) || !p.cpu.is_finite() { continue; }
        let Some(key) = app_key(&p.name) else { continue };
        if IGNORED_APPS.contains(&key.as_str()) { continue; }
        *by.entry(key).or_insert(0.0) += p.cpu.max(0.0);
    }
    by.into_iter()
        .map(|(name, c)| TopApp { name, cpu: (c / n).clamp(0.0, 100.0) })
        .filter(|a| a.cpu >= min_pct)
        .max_by(|a, b| a.cpu.partial_cmp(&b.cpu).unwrap_or(std::cmp::Ordering::Equal).then_with(|| b.name.cmp(&a.name)))
}

// ── تنبيه الحمل المرتفع المستمر ──
/// عتبة المعالج الكلّي (%).
pub const LOAD_THRESHOLD: f32 = 90.0;
/// عيّنات متتالية فوق العتبة (كل 5s) ⇒ 30 ثانية.
pub const LOAD_SAMPLES: u32 = 6;
pub const LOAD_SAMPLE_SECS: u64 = 5;
/// بعد التنبيه: صمت 10 دقائق (120 عيّنة) كي لا يتكرر.
pub const LOAD_COOLDOWN_SAMPLES: u32 = 120;

#[derive(Default, Debug, PartialEq)]
pub struct LoadWatch {
    streak: u32,
    cooldown: u32,
}

impl LoadWatch {
    /// عيّنة جديدة؛ true = أطلق التنبيه الآن (30s متواصلة ≥ العتبة وخارج فترة الصمت).
    pub fn step(&mut self, cpu: f32) -> bool {
        if self.cooldown > 0 {
            self.cooldown -= 1;
            self.streak = 0;
            return false;
        }
        if cpu.is_finite() && cpu >= LOAD_THRESHOLD { self.streak += 1; } else { self.streak = 0; }
        if self.streak >= LOAD_SAMPLES {
            self.streak = 0;
            self.cooldown = LOAD_COOLDOWN_SAMPLES;
            true
        } else {
            false
        }
    }
    /// بدأت سلسلة ارتفاع للتوّ (للتقاط خط أساس العمليات).
    pub fn just_started(&self) -> bool { self.streak == 1 }
    pub fn active(&self) -> bool { self.streak > 0 }
    pub fn reset(&mut self) { self.streak = 0; }
}

pub fn alert_text(app: Option<&TopApp>, total_cpu: f32, ar: bool) -> String {
    let total = total_cpu.round() as i64;
    match (app, ar) {
        (Some(a), true) => format!("حمل مرتفع منذ 30 ثانية: {} يستهلك {}% من المعالج", a.name, a.cpu.round() as i64),
        (Some(a), false) => format!("High load for 30s: {} is using {}% of the CPU", a.name, a.cpu.round() as i64),
        (None, true) => format!("حمل مرتفع منذ 30 ثانية: المعالج عند {total}%"),
        (None, false) => format!("High load for 30s: CPU at {total}%"),
    }
}

// ───────────────────────────── ويندوز: PDH + SSD + الخيط ─────────────────────────────
#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::PCWSTR;
    use windows::Win32::System::Performance::*;

    fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }

    /// استعلام PDH بعدّادات اختيارية؛ يُغلق عند الإسقاط.
    pub struct Query {
        q: PDH_HQUERY,
        gpu: Option<PDH_HCOUNTER>,
        thermal: Option<PDH_HCOUNTER>,
        power: Option<PDH_HCOUNTER>,
    }

    impl Query {
        pub fn open() -> Option<Query> {
            unsafe {
                let mut q = PDH_HQUERY::default();
                if PdhOpenQueryW(PCWSTR::null(), 0, &mut q) != 0 { return None; }
                let add = |path: &str| -> Option<PDH_HCOUNTER> {
                    let p = wide(path);
                    let mut c = PDH_HCOUNTER::default();
                    if PdhAddEnglishCounterW(q, PCWSTR(p.as_ptr()), 0, &mut c) == 0 { Some(c) } else { None }
                };
                Some(Query {
                    q,
                    gpu: add("\\GPU Engine(*)\\Utilization Percentage"),
                    thermal: add("\\Thermal Zone Information(*)\\Temperature"),
                    power: add("\\Energy Meter(*)\\Power"),
                })
            }
        }
        pub fn collect(&self) -> bool { unsafe { PdhCollectQueryData(self.q) == 0 } }

        /// (اسم النسخة، قيمة) لكل نسخة صالحة في عدّاد حرفي.
        fn read(&self, c: Option<PDH_HCOUNTER>) -> Vec<(String, f64)> {
            let Some(c) = c else { return Vec::new() };
            unsafe {
                let (mut size, mut count) = (0u32, 0u32);
                let r = PdhGetFormattedCounterArrayW(c, PDH_FMT_DOUBLE, &mut size, &mut count, None);
                if r != PDH_MORE_DATA || size == 0 { return Vec::new(); }
                // محاذاة 8 بايت: مخزن u64.
                let mut buf = vec![0u64; (size as usize).div_ceil(8)];
                let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
                let r = PdhGetFormattedCounterArrayW(c, PDH_FMT_DOUBLE, &mut size, &mut count, Some(items));
                if r != 0 { return Vec::new(); }
                let mut out = Vec::with_capacity(count as usize);
                for n in 0..count as usize {
                    let it = &*items.add(n);
                    // CStatus 0 = VALID_DATA، 1 = NEW_DATA
                    if it.FmtValue.CStatus > 1 || it.szName.is_null() { continue; }
                    out.push((it.szName.to_string().unwrap_or_default(), it.FmtValue.Anonymous.doubleValue));
                }
                out
            }
        }
        pub fn gpu(&self) -> Option<f32> { gpu_percent(&self.read(self.gpu)) }
        pub fn thermal(&self) -> Option<f32> {
            let v: Vec<f64> = self.read(self.thermal).into_iter().map(|(_, k)| k).collect();
            thermal_celsius(&v)
        }
        pub fn power(&self) -> Option<f32> { package_watts(&self.read(self.power)) }
    }

    impl Drop for Query {
        fn drop(&mut self) { unsafe { let _ = PdhCloseQuery(self.q); } }
    }

    // ── حرارة SSD: PowerShell بطيء (~1s) ⇒ خيط منفصل وتخزين مؤقّت 60s؛ الاستدعاء الأول يعيد None ثم تصل القيمة ──
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    struct Ssd { at: Option<Instant>, val: Option<f32>, busy: bool }
    static SSD: Mutex<Ssd> = Mutex::new(Ssd { at: None, val: None, busy: false });
    const SSD_TTL: Duration = Duration::from_secs(60);
    const SSD_SCRIPT: &str = "Get-PhysicalDisk | Get-StorageReliabilityCounter | ForEach-Object { $_.Temperature }";

    pub fn ssd_cached() -> Option<f32> {
        let mut g = SSD.lock().unwrap();
        let stale = g.at.map_or(true, |t| t.elapsed() >= SSD_TTL);
        if stale && !g.busy {
            g.busy = true;
            std::thread::spawn(|| {
                use std::os::windows::process::CommandExt;
                let out = std::process::Command::new("powershell")
                    .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", SSD_SCRIPT])
                    .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
                    .output()
                    .ok()
                    .filter(|o| o.status.success())
                    .and_then(|o| parse_ssd_temp(&String::from_utf8_lossy(&o.stdout)));
                let mut g = SSD.lock().unwrap();
                g.val = out;
                g.at = Some(Instant::now());
                g.busy = false;
            });
        }
        g.val
    }
}

/// عيّنتا معالج بين `sleep_ms` ⇒ أعلى تطبيق (stateless؛ تُحرَّر كل الموارد عند الخروج).
fn sample_top_after<F: FnOnce()>(between: F) -> Option<TopApp> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let kind = ProcessRefreshKind::nothing().with_cpu();
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
    between();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
    let procs: Vec<Proc> = sys
        .processes()
        .iter()
        .map(|(pid, p): (&Pid, &sysinfo::Process)| Proc {
            pid: pid.as_u32(),
            parent: p.parent().map(|x| x.as_u32()),
            name: p.name().to_string_lossy().into_owned(),
            mem: 0,
            cpu: p.cpu_usage(),
        })
        .collect();
    let ncpu = std::thread::available_parallelism().map_or(1, |n| n.get()) as f32;
    top_app(&procs, std::process::id(), ncpu, 1.0)
}

#[cfg(windows)]
fn measure() -> Depth {
    let q = win::Query::open();
    if let Some(q) = &q { q.collect(); }
    // الفاصل بين العيّنتين (250ms) مشترك: عدّادات المعدّل في PDH وcpu_usage للعمليات تحتاجه.
    let top = sample_top_after(|| std::thread::sleep(std::time::Duration::from_millis(250)));
    let (mut gpu, mut cpu_t, mut power) = (None, None, None);
    if let Some(q) = &q {
        if q.collect() {
            gpu = q.gpu();
            cpu_t = q.thermal();
            power = q.power();
        }
    }
    Depth { gpu, temps: Temps { cpu: cpu_t, gpu: None, ssd: win::ssd_cached() }, power_w: power, top }
}
#[cfg(not(windows))]
fn measure() -> Depth {
    Depth { top: sample_top_after(|| std::thread::sleep(std::time::Duration::from_millis(250))), ..Depth::default() }
}

/// القراءات العميقة لتبويب النظام. Eco ⇒ Err("eco") بلا أي قراءة.
#[tauri::command]
pub async fn sysdepth_get() -> Result<Depth, String> {
    if crate::sysinfo::sample_blocked(crate::perf::eco()) { return Err("eco".into()); }
    tauri::async_runtime::spawn_blocking(measure).await.map_err(|e| e.to_string())
}

// ───────────────────────────── خيط تنبيه الحمل (اختياري، مطفأ افتراضيًا) ─────────────────────────────
/// يعمل فقط مع `loadAlert=true` وخارج Eco؛ وإلا ينام 10s بين فحوص الإعداد بلا قراءة نظام (كخيط today). عيّنة كل 5s.
pub fn start(app: &tauri::AppHandle) {
    use tauri::Manager;
    let app = app.clone();
    std::thread::spawn(move || {
        let mut watch = LoadWatch::default();
        let mut prev: Option<crate::sysinfo::Times> = None;
        let mut base: Option<sysinfo::System> = None;
        loop {
            let on = app
                .state::<crate::state::AppState>()
                .settings
                .lock()
                .unwrap()
                .get("loadAlert")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if !on || crate::perf::eco() {
                watch.reset();
                prev = None;
                base = None;
                std::thread::sleep(std::time::Duration::from_secs(10));
                continue;
            }
            std::thread::sleep(std::time::Duration::from_secs(LOAD_SAMPLE_SECS));
            let cur = crate::sysinfo::times();
            let cpu = match (prev, cur) {
                (Some(p), Some(c)) => crate::sysinfo::cpu_percent(p, c),
                _ => 0.0,
            };
            prev = cur;
            let fire = watch.step(cpu);
            if watch.just_started() {
                // بداية سلسلة ارتفاع: خط أساس للعمليات؛ cpu_usage عند التنبيه يعكس متوسط الـ30s كلها.
                use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
                let mut s = System::new();
                s.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cpu());
                base = Some(s);
            } else if !watch.active() && !fire {
                base = None; // انكسرت السلسلة: حرّر الذاكرة
            }
            if fire {
                use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate};
                let top = base.take().and_then(|mut s| {
                    s.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cpu());
                    let procs: Vec<Proc> = s
                        .processes()
                        .iter()
                        .map(|(pid, p): (&Pid, &sysinfo::Process)| Proc {
                            pid: pid.as_u32(),
                            parent: p.parent().map(|x| x.as_u32()),
                            name: p.name().to_string_lossy().into_owned(),
                            mem: 0,
                            cpu: p.cpu_usage(),
                        })
                        .collect();
                    let ncpu = std::thread::available_parallelism().map_or(1, |n| n.get()) as f32;
                    top_app(&procs, std::process::id(), ncpu, 1.0)
                });
                let ar = app
                    .state::<crate::state::AppState>()
                    .settings
                    .lock()
                    .unwrap()
                    .get("language")
                    .and_then(|v| v.as_str().map(|s| s != "en"))
                    .unwrap_or(true);
                let now = crate::meetings::now_ms();
                crate::note::alert(
                    &app,
                    serde_json::json!({ "kind": "reminder", "id": format!("load:{now}"), "text": alert_text(top.as_ref(), cpu, ar), "at": now, "late": false }),
                );
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn it(n: &str, v: f64) -> (String, f64) { (n.to_string(), v) }
    fn p(pid: u32, parent: Option<u32>, name: &str, cpu: f32) -> Proc { Proc { pid, parent, name: name.into(), mem: 0, cpu } }

    #[test]
    fn gpu_sums_per_engine_then_takes_max() {
        let v = vec![
            it("pid_10_luid_0x00000000_0x0000AAAA_phys_0_eng_0_engtype_3D", 30.0),
            it("pid_11_luid_0x00000000_0x0000AAAA_phys_0_eng_0_engtype_3D", 25.0),
            it("pid_10_luid_0x00000000_0x0000AAAA_phys_0_eng_3_engtype_VideoDecode", 80.0),
            it("pid_12_luid_0x00000000_0x0000BBBB_phys_0_eng_0_engtype_3D", 12.0),
        ];
        assert_eq!(gpu_percent(&v), Some(80.0)); // VideoDecode (80) > 3D المجمّع (55) > محوّل ثانٍ (12)
        let v2 = vec![it("pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D", 70.0), it("pid_2_luid_0x0_0x1_phys_0_eng_1_engtype_3D", 60.0)];
        assert_eq!(gpu_percent(&v2), Some(100.0)); // يُحصَر
    }

    #[test]
    fn gpu_ignores_junk_and_empty() {
        assert_eq!(gpu_percent(&[]), None);
        assert_eq!(gpu_percent(&[it("weird_name", 50.0), it("pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D", f64::NAN)]), None);
        assert_eq!(gpu_percent(&[it("pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D", -5.0)]), None);
    }

    #[test]
    fn thermal_picks_hottest_valid_zone() {
        assert_eq!(thermal_celsius(&[300.15, 318.15, 0.0]), Some(45.0));
        assert_eq!(thermal_celsius(&[0.0, 273.15, 500.0]), None); // صفر/خارج النطاق يُهمل
        assert_eq!(thermal_celsius(&[]), None);
        assert_eq!(thermal_celsius(&[f64::NAN, 310.65]), Some(37.5));
    }

    #[test]
    fn power_uses_package_meters_only() {
        let v = vec![it("RAPL_Package0_PKG", 12_500.0), it("RAPL_Package0_CORE", 8_000.0), it("RAPL_Package0_DRAM", 1_000.0)];
        assert_eq!(package_watts(&v), Some(12.5));
        assert_eq!(package_watts(&[it("RAPL_Package0_CORE", 5.0)]), None);
        assert_eq!(package_watts(&[]), None);
        assert_eq!(package_watts(&[it("rapl_package0_pkg", 2_000.0), it("RAPL_Package1_PKG", 3_000.0)]), Some(5.0));
    }

    #[test]
    fn ssd_parse() {
        assert_eq!(parse_ssd_temp("38\r\n41\r\n"), Some(41.0));
        assert_eq!(parse_ssd_temp("\r\n"), None);
        assert_eq!(parse_ssd_temp("abc\n0\n300\n"), None);
        assert_eq!(parse_ssd_temp(" 36 \n"), Some(36.0));
    }

    #[test]
    fn top_app_groups_processes_and_excludes_ours() {
        let me = 100;
        let procs = vec![
            p(100, None, "my-island.exe", 90.0),
            p(101, Some(100), "msedgewebview2.exe", 80.0), // ابن عمليتنا
            p(1, None, "System Idle Process", 800.0),
            p(2, None, "System", 40.0),
            p(10, None, "chrome.exe", 60.0),
            p(11, Some(10), "chrome.exe", 60.0),
            p(12, Some(10), "Chrome.EXE", 40.0),
            p(20, None, "game.exe", 150.0),
        ];
        // chrome = 160/8 = 20 · game = 150/8 = 18.75
        assert_eq!(top_app(&procs, me, 8.0, 1.0), Some(TopApp { name: "chrome".into(), cpu: 20.0 }));
    }

    #[test]
    fn top_app_none_when_idle_and_clamps() {
        assert_eq!(top_app(&[p(1, None, "a.exe", 0.4)], 999, 4.0, 1.0), None);
        assert_eq!(top_app(&[], 999, 4.0, 1.0), None);
        assert_eq!(top_app(&[p(1, None, "a.exe", 900.0)], 999, 4.0, 1.0).map(|a| a.cpu), Some(100.0));
        assert_eq!(top_app(&[p(1, None, "a.exe", f32::NAN)], 999, 4.0, 1.0), None);
        // ncpu=0 لا يقسم على صفر
        assert_eq!(top_app(&[p(1, None, "a.exe", 50.0)], 999, 0.0, 1.0).map(|a| a.cpu), Some(50.0));
    }

    #[test]
    fn load_alert_needs_30s_sustained_and_cools_down() {
        let mut w = LoadWatch::default();
        for _ in 0..5 { assert!(!w.step(95.0)); }
        assert!(w.step(95.0)); // السادسة = 30s
        // صمت: 120 عيّنة لا إطلاق مهما كان الحمل
        for _ in 0..120 { assert!(!w.step(100.0)); }
        // بعد الصمت يبدأ العدّ من جديد
        for _ in 0..5 { assert!(!w.step(100.0)); }
        assert!(w.step(100.0));
    }

    #[test]
    fn load_alert_resets_on_dip() {
        let mut w = LoadWatch::default();
        for _ in 0..5 { w.step(99.0); }
        assert!(!w.step(40.0)); // انخفاض يكسر السلسلة
        assert!(!w.active());
        for _ in 0..5 { assert!(!w.step(99.0)); }
        assert!(w.step(99.0));
    }

    #[test]
    fn load_alert_boundary_and_nan() {
        let mut w = LoadWatch::default();
        for _ in 0..5 { w.step(LOAD_THRESHOLD); }
        assert!(w.step(LOAD_THRESHOLD)); // = العتبة تُحتسب
        let mut w2 = LoadWatch::default();
        for _ in 0..10 { assert!(!w2.step(f32::NAN)); }
        for _ in 0..10 { assert!(!w2.step(89.9)); }
    }

    #[test]
    fn load_watch_start_marker() {
        let mut w = LoadWatch::default();
        w.step(95.0);
        assert!(w.just_started());
        w.step(95.0);
        assert!(!w.just_started());
    }

    #[test]
    fn alert_texts() {
        let a = TopApp { name: "chrome".into(), cpu: 61.6 };
        assert_eq!(alert_text(Some(&a), 97.0, true), "حمل مرتفع منذ 30 ثانية: chrome يستهلك 62% من المعالج");
        assert_eq!(alert_text(Some(&a), 97.0, false), "High load for 30s: chrome is using 62% of the CPU");
        assert_eq!(alert_text(None, 97.4, false), "High load for 30s: CPU at 97%");
        assert_eq!(alert_text(None, 97.4, true), "حمل مرتفع منذ 30 ثانية: المعالج عند 97%");
    }
}
