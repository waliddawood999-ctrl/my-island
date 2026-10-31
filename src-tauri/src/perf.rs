// perf — «الأداء والتوفير»: وضع التوفير (Eco) + قياس استهلاك الرام لعمليات التطبيق نفسه.
// Eco = مفتاح `ecoMode` يدوي، أو تلقائي عند العمل على البطارية إن فُعّل `ecoOnBattery` (قراءة battery::read_raw كل 10s
// فقط ما دام المفتاح مفعّلًا). اليدوي يبقى مفعّلًا في الحالتين. الوحدات الأخرى تقرأ perf::eco() (ذرّية بلا قفل) لتبطّئ نفسها:
// الحافظة، تتبّع النافذة الأمامية (win/attention)، فحص بلوتوث البطارية، طيف الصوت. الحركة تُخفَّض في الواجهة (src/motion.ts).
// القياس: perf_ram يُستدعى من نافذة الإعدادات فقط وهي ظاهرة؛ بلا حالة ولا خيط ⇒ صفر كلفة عند إغلاقها.
use crate::state::AppState;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

static ECO: AtomicBool = AtomicBool::new(false);

/// هل وضع التوفير فعّال الآن؟ (قراءة رخيصة للخيوط الخلفية.)
pub fn eco() -> bool {
    ECO.load(Ordering::Relaxed)
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct EcoStatus {
    pub eco: bool,
    /// "manual" | "battery" | null
    pub reason: Option<&'static str>,
    /// null = غير معروف أو غير مقيس (ecoOnBattery مطفأ / جهاز بلا بطارية)
    #[serde(rename = "onBattery")]
    pub on_battery: Option<bool>,
}

// PURE-BEGIN
/// قرار Eco: اليدوي يغلب دائمًا ويبقى في الحالتين؛ وإلا يتبع البطارية إن طُلب ذلك وكان الجهاز على البطارية فعلًا.
pub fn decide(manual: bool, on_battery_pref: bool, on_battery: Option<bool>) -> (bool, Option<&'static str>) {
    if manual {
        (true, Some("manual"))
    } else if on_battery_pref && on_battery == Some(true) {
        (true, Some("battery"))
    } else {
        (false, None)
    }
}

/// خلاصة عملية للقياس (مفصولة عن sysinfo كي يُختبر المنطق).
#[derive(Clone, Debug, PartialEq)]
pub struct Proc {
    pub pid: u32,
    pub parent: Option<u32>,
    pub name: String,
    pub mem: u64,
    pub cpu: f32,
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
pub struct RamSnapshot {
    /// بايت: العملية الرئيسية + WebView2
    pub total: u64,
    pub main: u64,
    pub webview: u64,
    #[serde(rename = "webviewCount")]
    pub webview_count: usize,
    /// نسبة المعالج لمجموع هذه العمليات (100 = نواة كاملة)
    pub cpu: f32,
    /// true إن تجاوز المعالج العتبة (وإلا خامل)
    pub active: bool,
}

const ACTIVE_CPU: f32 = 1.5;
const WEBVIEW_EXE: &str = "msedgewebview2.exe";

/// عملية التطبيق + أحفاد msedgewebview2.exe فقط (الأحفاد الآخرون — كتطبيقات أطلقها المستخدم — لا يُحتسبون).
pub fn summarize(procs: &[Proc], me: u32) -> RamSnapshot {
    let mut snap = RamSnapshot::default();
    // مجموعة أحفاد me (لأن عمليات WebView2 الفرعية (renderer/gpu) أبناء المتصفّح لا أبناؤنا المباشرون)
    let mut ours: std::collections::HashSet<u32> = std::collections::HashSet::from([me]);
    loop {
        let before = ours.len();
        for p in procs {
            if let Some(par) = p.parent {
                if ours.contains(&par) && p.pid != me {
                    ours.insert(p.pid);
                }
            }
        }
        if ours.len() == before {
            break;
        }
    }
    for p in procs.iter().filter(|p| ours.contains(&p.pid)) {
        if p.pid == me {
            snap.main += p.mem;
            snap.cpu += p.cpu;
        } else if p.name.eq_ignore_ascii_case(WEBVIEW_EXE) {
            snap.webview += p.mem;
            snap.webview_count += 1;
            snap.cpu += p.cpu;
        }
    }
    snap.total = snap.main + snap.webview;
    snap.active = snap.cpu >= ACTIVE_CPU;
    snap
}
// PURE-END

fn read_status(app: &AppHandle) -> EcoStatus {
    let st = app.state::<AppState>();
    let (manual, pref) = {
        let s = st.settings.lock().unwrap();
        let b = |k: &str| s.get(k).and_then(|v| v.as_bool()).unwrap_or(false);
        (b("ecoMode"), b("ecoOnBattery"))
    };
    // قراءة البطارية فقط حين يلزم قرارها (لا ecoMode يدوي ولا يوجد ما يمنع القراءة الرخيصة)
    let on_battery = if pref {
        let (info, _) = crate::battery::read_raw();
        info.has_battery.then_some(!info.ac)
    } else {
        None
    };
    let (eco, reason) = decide(manual, pref, on_battery);
    EcoStatus { eco, reason, on_battery }
}

static LAST: std::sync::Mutex<Option<EcoStatus>> = std::sync::Mutex::new(None);

/// يعيد الحساب ويبثّ `perf:eco` عند أي تغيّر. يُستدعى عند تغيّر الإعدادات وكل 10s من الخيط الخلفي.
pub fn recompute(app: &AppHandle) -> EcoStatus {
    let now = read_status(app);
    ECO.store(now.eco, Ordering::Relaxed);
    let mut last = LAST.lock().unwrap();
    if last.as_ref() != Some(&now) {
        *last = Some(now.clone());
        let _ = app.emit("perf:eco", &now);
    }
    now
}

/// خيط خفيف: كل 10 ثوانٍ يعيد الحساب (قراءة نظام واحدة فقط حين يكون ecoOnBattery مفعّلًا).
pub fn start(app: &AppHandle) {
    recompute(app);
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(10));
        recompute(&app);
    });
}

#[tauri::command]
pub fn perf_status(app: AppHandle) -> EcoStatus {
    recompute(&app)
}

/// استهلاك رام التطبيق الآن (عملياته فقط). stateless: عيّنتان بينهما 250ms لحساب المعالج، ثم يُحرَّر كل شيء.
#[tauri::command]
pub async fn perf_ram() -> Result<RamSnapshot, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
        let kind = ProcessRefreshKind::nothing().with_memory().with_cpu();
        let mut sys = System::new();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
        std::thread::sleep(std::time::Duration::from_millis(250));
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
        let procs: Vec<Proc> = sys
            .processes()
            .iter()
            .map(|(pid, p): (&Pid, &sysinfo::Process)| Proc {
                pid: pid.as_u32(),
                parent: p.parent().map(|x| x.as_u32()),
                name: p.name().to_string_lossy().into_owned(),
                mem: p.memory(),
                cpu: p.cpu_usage(),
            })
            .collect();
        summarize(&procs, std::process::id())
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_wins_in_both_battery_states() {
        assert_eq!(decide(true, false, None), (true, Some("manual")));
        assert_eq!(decide(true, true, Some(true)), (true, Some("manual")));
        assert_eq!(decide(true, true, Some(false)), (true, Some("manual")), "التوصيل بالشاحن لا يُطفئ اليدوي");
    }

    #[test]
    fn battery_follows_plug_state() {
        assert_eq!(decide(false, true, Some(true)), (true, Some("battery")));
        assert_eq!(decide(false, true, Some(false)), (false, None), "توصيل الشاحن يوقف التلقائي");
        assert_eq!(decide(false, true, None), (false, None), "جهاز بلا بطارية");
        assert_eq!(decide(false, false, Some(true)), (false, None), "ecoOnBattery مطفأ");
    }

    fn p(pid: u32, parent: Option<u32>, name: &str, mem: u64, cpu: f32) -> Proc {
        Proc { pid, parent, name: name.into(), mem, cpu }
    }

    #[test]
    fn summarize_counts_only_own_tree_webview() {
        let procs = vec![
            p(100, Some(1), "my-island.exe", 50, 0.2),
            p(200, Some(100), "msedgewebview2.exe", 80, 0.1), // متصفح WebView2
            p(201, Some(200), "msedgewebview2.exe", 40, 0.3), // renderer (حفيد)
            p(202, Some(200), "msedgewebview2.exe", 30, 0.0), // gpu
            p(300, Some(100), "notepad.exe", 999, 50.0),      // أطلقه المستخدم عبر الشريط: لا يُحتسب
            p(400, Some(1), "msedgewebview2.exe", 777, 9.0),  // WebView2 لتطبيق آخر: لا يُحتسب
            p(500, Some(1), "chrome.exe", 5000, 80.0),
        ];
        let s = summarize(&procs, 100);
        assert_eq!(s.main, 50);
        assert_eq!(s.webview, 150);
        assert_eq!(s.webview_count, 3);
        assert_eq!(s.total, 200);
        assert!((s.cpu - 0.6).abs() < 1e-4);
        assert!(!s.active);
    }

    #[test]
    fn active_when_cpu_over_threshold_and_survives_parent_cycles() {
        let procs = vec![p(1, Some(2), "my-island.exe", 10, 2.0), p(2, Some(1), "msedgewebview2.exe", 5, 0.0)];
        let s = summarize(&procs, 1);
        assert!(s.active);
        assert_eq!(s.total, 15);
        assert_eq!(summarize(&[], 1), RamSnapshot::default());
    }
}
