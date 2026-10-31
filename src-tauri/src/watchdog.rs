// watchdog: نبض page_pong من صفحة main — صمت > 6 ثوانٍ = إعادة تحميل الـ webview؛
// فشل إعادة التحميل مرتين متتاليتين = إعادة تشغيل العملية. كل حادثة سطر في crash-log.txt.
use std::{
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

use crate::win;

const SILENCE: Duration = Duration::from_secs(6);
const TICK: Duration = Duration::from_secs(1);
/// حوادث متتالية بلا pong بينها: الأولى والثانية إعادة تحميل، الثالثة إعادة تشغيل العملية.
const MAX_RELOADS: u32 = 2;

pub struct WatchdogState {
    last_pong: Mutex<Instant>,
    /// إعادة تحميلات متتالية لم يصلها pong بعدها.
    failed_reloads: AtomicU32,
    log_dir: Mutex<Option<PathBuf>>,
}

impl Default for WatchdogState {
    fn default() -> Self {
        Self {
            last_pong: Mutex::new(Instant::now()),
            failed_reloads: AtomicU32::new(0),
            log_dir: Mutex::new(None),
        }
    }
}

impl WatchdogState {
    fn pong(&self) {
        *self.last_pong.lock().unwrap() = Instant::now();
        self.failed_reloads.store(0, Ordering::SeqCst);
    }

    /// يعيد بدء عدّاد الصمت (مهلة سماح بعد إعادة التحميل) دون تصفير عدّاد الفشل.
    fn grace(&self) {
        *self.last_pong.lock().unwrap() = Instant::now();
    }

    fn log(&self, reason: &str) {
        let Some(dir) = self.log_dir.lock().unwrap().clone() else { return };
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("crash-log.txt")) {
            let _ = writeln!(f, "{} | {}", utc_stamp(), reason);
        }
    }
}

/// نبضة الصفحة — تستدعيها واجهة main كل ثانيتين.
#[tauri::command]
pub fn page_pong(state: tauri::State<WatchdogState>) {
    state.pong();
}

/// يبدأ المراقب في خيط مستقل. dir = مجلد البيانات (حيث crash-log.txt).
pub fn start(app: &AppHandle, dir: Option<PathBuf>) {
    let st = app.state::<WatchdogState>();
    *st.log_dir.lock().unwrap() = dir;
    st.grace();
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(TICK);
        let st = app.state::<WatchdogState>();
        let silent = st.last_pong.lock().unwrap().elapsed();
        if silent <= SILENCE {
            continue;
        }
        let n = st.failed_reloads.load(Ordering::SeqCst);
        if n >= MAX_RELOADS {
            st.log(&format!("page_pong صامت {}s بعد {n} إعادتي تحميل فاشلتين — إعادة تشغيل العملية", silent.as_secs()));
            app.restart();
        }
        st.failed_reloads.fetch_add(1, Ordering::SeqCst);
        match app.get_webview_window(win::MAIN).map(|w| w.reload()) {
            Some(Ok(())) => st.log(&format!("page_pong صامت {}s — أُعيد تحميل webview النافذة main (محاولة {})", silent.as_secs(), n + 1)),
            other => st.log(&format!("page_pong صامت {}s — فشلت إعادة التحميل: {:?}", silent.as_secs(), other.map(|r| r.err()))),
        }
        st.grace();
    });
}

/// "YYYY-MM-DD HH:MM:SS UTC" بلا اعتماديات إضافية.
fn utc_stamp() -> String {
    let s = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, rem) = (s.div_euclid(86400), s.rem_euclid(86400));
    // civil-from-days (Howard Hinnant)
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + (m <= 2) as i64;
    format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02} UTC", rem / 3600, rem % 3600 / 60, rem % 60)
}
