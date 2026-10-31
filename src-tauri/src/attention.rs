// attention — «وقتي»: زمن تركيز كل تطبيق أمامي اليوم + تذكير استراحة (حسب طلب L5).
// الخصوصية: محلي فقط (جدول attention_daily من الترحيل 001)، يُخزَّن اسم ملف exe فقط —
// لا عناوين نوافذ ولا محتوى ولا شبكة. attentionTracking=false ⇒ لا قراءة للنافذة الأمامية ولا كتابة.
// العدّ يتوقف حين يخمل المستخدم أكثر من 60s (GetLastInputInfo). الاستراحة: استخدام متواصل
// (خمول < 5 دقائق بين الأنشطة) يبلغ breakMinutes ⇒ الحدث attention:break.
use serde::Serialize;
use std::collections::HashMap;

// ==== core:begin (منطق خالص بلا Tauri/Win32 — يُختبر منفصلًا)
pub const TICK_SECS: u64 = 2;
/// خمول يتجاوز هذا يوقف العدّ.
pub const IDLE_PAUSE_SECS: u64 = 60;
/// خمول بهذا الطول يُعدّ استراحة فعلية ويصفّر عدّاد الاستخدام المتواصل.
pub const BREAK_RESET_IDLE_SECS: u64 = 300;
pub const FLUSH_SECS: u64 = 30;
/// وضع التوفير: نبضة أبطأ لقراءة النافذة الأمامية والخمول.
pub const ECO_TICK_SECS: u64 = 10;
pub const RETENTION_DAYS: i64 = 30;
pub const TOP_N: usize = 8;
pub const MIN_BREAK_MIN: u64 = 5;
pub const MAX_BREAK_MIN: u64 = 240;
pub const DEFAULT_BREAK_MIN: u64 = 60;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cfg {
    pub track: bool,
    pub breaks: bool,
    pub break_secs: u64,
}

pub fn break_secs_from_minutes(m: Option<u64>) -> u64 {
    m.unwrap_or(DEFAULT_BREAK_MIN).clamp(MIN_BREAK_MIN, MAX_BREAK_MIN) * 60
}

/// اسم الملف التنفيذي → مفتاح مطبّع ("C:\\x\\Chrome.EXE" ⇒ "chrome").
pub fn app_key(exe: &str) -> Option<String> {
    let base = exe.rsplit(['\\', '/']).next()?.trim();
    let stem = match base.to_lowercase().strip_suffix(".exe") {
        Some(s) => s.to_string(),
        None => base.to_lowercase(),
    };
    if stem.is_empty() { None } else { Some(stem) }
}

#[derive(Default)]
pub struct Tracker {
    pending: HashMap<(String, String), u64>,
    continuous: u64,
}

impl Tracker {
    /// تقدّم الزمن dt ثانية. idle = ثواني منذ آخر إدخال، app = التطبيق الأمامي (None = تطبيقنا/غير معروف).
    /// يعيد Some(دقائق) عند استحقاق تذكير الاستراحة.
    pub fn tick(&mut self, dt: u64, idle: u64, app: Option<&str>, day: &str, cfg: &Cfg) -> Option<u64> {
        if idle >= BREAK_RESET_IDLE_SECS || !cfg.breaks { self.continuous = 0; }
        if idle > IDLE_PAUSE_SECS { return None; }
        if cfg.track {
            if let Some(a) = app {
                *self.pending.entry((day.to_string(), a.to_string())).or_default() += dt;
            }
        }
        if cfg.breaks {
            self.continuous += dt;
            if self.continuous >= cfg.break_secs {
                self.continuous = 0;
                return Some(cfg.break_secs / 60);
            }
        }
        None
    }
    pub fn has_pending(&self) -> bool { !self.pending.is_empty() }
    pub fn continuous(&self) -> u64 { self.continuous }
    pub fn take_pending(&mut self) -> Vec<(String, String, u64)> {
        self.pending.drain().map(|((d, a), s)| (d, a, s)).collect()
    }
}

pub fn add_seconds(conn: &mut rusqlite::Connection, rows: &[(String, String, u64)]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for (d, a, s) in rows {
        tx.execute(
            "INSERT INTO attention_daily(day,app,seconds) VALUES(?1,?2,?3)
             ON CONFLICT(day,app) DO UPDATE SET seconds = seconds + excluded.seconds",
            (d, a, *s as i64),
        )?;
    }
    tx.commit()
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct AppTime { pub app: String, pub seconds: u64 }

pub fn top_for_day(conn: &rusqlite::Connection, day: &str, limit: usize) -> rusqlite::Result<(u64, Vec<AppTime>)> {
    let total: i64 = conn.query_row("SELECT COALESCE(SUM(seconds),0) FROM attention_daily WHERE day=?1", [day], |r| r.get(0))?;
    let mut st = conn.prepare("SELECT app, seconds FROM attention_daily WHERE day=?1 AND seconds>0 ORDER BY seconds DESC, app LIMIT ?2")?;
    let apps = st
        .query_map((day, limit as i64), |r| Ok(AppTime { app: r.get(0)?, seconds: r.get::<_, i64>(1)? as u64 }))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok((total as u64, apps))
}

pub fn prune_before(conn: &rusqlite::Connection, cutoff_day: &str) -> rusqlite::Result<usize> {
    conn.execute("DELETE FROM attention_daily WHERE day < ?1", [cutoff_day])
}
// ==== core:end

#[derive(Serialize, Clone, Debug)]
pub struct AttentionSnap {
    pub enabled: bool,
    pub total: u64,
    pub apps: Vec<AppTime>,
    pub day: String,
}

fn today() -> String { chrono::Local::now().format("%Y-%m-%d").to_string() }

fn snapshot(app: &tauri::AppHandle) -> AttentionSnap {
    use tauri::Manager;
    let st = app.state::<crate::state::AppState>();
    let enabled = st.settings.lock().unwrap().get("attentionTracking").and_then(|v| v.as_bool()).unwrap_or(true);
    let day = today();
    let (total, apps) = {
        let g = st.db.lock().unwrap();
        g.as_ref().and_then(|c| top_for_day(c, &day, TOP_N).ok()).unwrap_or((0, vec![]))
    };
    AttentionSnap { enabled, total, apps, day }
}

/// أعلى تطبيقات اليوم. معطّل ⇒ enabled:false (الواجهة تخفي القسم).
#[tauri::command]
pub fn attention_today(app: tauri::AppHandle) -> AttentionSnap { snapshot(&app) }

/// يمسح كل بيانات «وقتي» المخزّنة (زر خصوصية في الإعدادات).
#[tauri::command]
pub fn attention_clear(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    {
        let st = app.state::<crate::state::AppState>();
        let g = st.db.lock().unwrap();
        if let Some(c) = g.as_ref() {
            c.execute("DELETE FROM attention_daily", []).map_err(|e| e.to_string())?;
        }
    }
    let _ = app.emit("attention:update", snapshot(&app));
    Ok(())
}

#[cfg(windows)]
mod sys {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    /// ثواني منذ آخر إدخال (لوحة/فأرة) على مستوى الجلسة.
    pub fn idle_secs() -> u64 {
        unsafe {
            let mut li = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
            if !GetLastInputInfo(&mut li).as_bool() { return 0; }
            (GetTickCount().wrapping_sub(li.dwTime) / 1000) as u64
        }
    }

    /// ملف exe لعملية النافذة الأمامية؛ None إن كانت عمليتنا أو لا نافذة أو تعذّر الوصول.
    pub fn foreground_exe() -> Option<String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() { return None; }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 || pid == std::process::id() { return None; }
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(h);
            r.ok()?;
            Some(String::from_utf16_lossy(&buf[..len as usize]))
        }
    }
}
#[cfg(not(windows))]
mod sys {
    pub fn idle_secs() -> u64 { 0 }
    pub fn foreground_exe() -> Option<String> { None }
}

fn read_cfg(app: &tauri::AppHandle) -> Cfg {
    use tauri::Manager;
    let st = app.state::<crate::state::AppState>();
    let s = st.settings.lock().unwrap();
    Cfg {
        track: s.get("attentionTracking").and_then(|v| v.as_bool()).unwrap_or(true),
        breaks: s.get("breakReminders").and_then(|v| v.as_bool()).unwrap_or(false),
        break_secs: break_secs_from_minutes(s.get("breakMinutes").and_then(|v| v.as_u64())),
    }
}

fn flush(app: &tauri::AppHandle, tr: &mut Tracker) {
    use tauri::{Emitter, Manager};
    let rows = tr.take_pending();
    if rows.is_empty() { return; }
    {
        let st = app.state::<crate::state::AppState>();
        let mut g = st.db.lock().unwrap();
        if let Some(c) = g.as_mut() {
            if let Err(e) = add_seconds(c, &rows) { eprintln!("attention: تعذّر الحفظ: {e}"); }
        }
    }
    let _ = app.emit("attention:update", snapshot(app));
}

pub fn start(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    let app = app.clone();
    // حذف ما تجاوز مدة الاحتفاظ مرة عند الإقلاع.
    {
        let cutoff = (chrono::Local::now() - chrono::Duration::days(RETENTION_DAYS)).format("%Y-%m-%d").to_string();
        if let Some(c) = app.state::<crate::state::AppState>().db.lock().unwrap().as_ref() {
            let _ = prune_before(c, &cutoff);
        }
    }
    std::thread::spawn(move || {
        let mut tr = Tracker::default();
        let mut since_flush = 0u64;
        let mut last = std::time::Instant::now();
        loop {
            let tick = if crate::perf::eco() { ECO_TICK_SECS } else { TICK_SECS };
            std::thread::sleep(std::time::Duration::from_secs(tick));
            // الزمن الفعلي المنقضي (يُسقَّف كي لا يُحتسب سكون الجهاز/التعليق).
            let dt = last.elapsed().as_secs().clamp(1, tick * 2);
            last = std::time::Instant::now();
            let cfg = read_cfg(&app);
            if !cfg.track && !cfg.breaks {
                // إيقاف كامل: لا نقرأ النافذة ولا الخمول؛ نفرغ ما جُمع قبل الإيقاف فقط.
                flush(&app, &mut tr);
                tr.tick(0, u64::MAX, None, "", &cfg);
                since_flush = 0;
                continue;
            }
            let idle = sys::idle_secs();
            let key = if cfg.track { sys::foreground_exe().and_then(|e| app_key(&e)) } else { None };
            if let Some(min) = tr.tick(dt, idle, key.as_deref(), &today(), &cfg) {
                let _ = app.emit("attention:break", min);
            }
            since_flush += dt;
            if since_flush >= FLUSH_SECS || !cfg.track {
                since_flush = 0;
                flush(&app, &mut tr);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    const D: &str = "2026-10-31";
    fn cfg(track: bool, breaks: bool, mins: u64) -> Cfg { Cfg { track, breaks, break_secs: mins * 60 } }

    #[test]
    fn app_key_normalizes() {
        assert_eq!(app_key(r"C:\Program Files\Google\Chrome.EXE").as_deref(), Some("chrome"));
        assert_eq!(app_key("notepad.exe").as_deref(), Some("notepad"));
        assert_eq!(app_key("/usr/bin/Code").as_deref(), Some("code"));
        assert_eq!(app_key(".exe"), None);
        assert_eq!(app_key(""), None);
    }

    #[test]
    fn counts_only_while_active() {
        let mut t = Tracker::default();
        let c = cfg(true, false, 60);
        for _ in 0..10 { t.tick(2, 0, Some("chrome"), D, &c); }     // 20s نشط
        for _ in 0..10 { t.tick(2, 61, Some("chrome"), D, &c); }    // خمول >60 ⇒ لا عدّ
        for _ in 0..5 { t.tick(2, 60, Some("code"), D, &c); }       // 60 بالضبط ⇒ ما زال نشطًا
        let mut rows = t.take_pending();
        rows.sort();
        assert_eq!(rows, vec![(D.into(), "chrome".into(), 20), (D.into(), "code".into(), 10)]);
        assert!(!t.has_pending());
    }

    #[test]
    fn own_app_or_unknown_not_attributed_and_tracking_off_records_nothing() {
        let mut t = Tracker::default();
        t.tick(2, 0, None, D, &cfg(true, false, 60));
        assert!(!t.has_pending());
        t.tick(2, 0, Some("chrome"), D, &cfg(false, true, 60));
        assert!(!t.has_pending(), "الإيقاف الكامل للتتبّع لا يسجّل أي تطبيق");
    }

    #[test]
    fn day_rollover_splits_rows() {
        let mut t = Tracker::default();
        let c = cfg(true, false, 60);
        t.tick(2, 0, Some("a"), "2026-10-31", &c);
        t.tick(2, 0, Some("a"), "2026-11-01", &c);
        assert_eq!(t.take_pending().len(), 2);
    }

    #[test]
    fn break_fires_after_continuous_use_and_rearms() {
        let mut t = Tracker::default();
        let c = cfg(false, true, 1); // دقيقة = 30 نبضة×2s
        let mut fired = 0;
        for n in 1..=60 { if t.tick(2, 0, None, D, &c) == Some(1) { fired += 1; assert_eq!(n % 30, 0); } }
        assert_eq!(fired, 2);
    }

    #[test]
    fn short_idle_pauses_but_long_idle_resets_break_counter() {
        let c = cfg(false, true, 1);
        let mut t = Tracker::default();
        for _ in 0..20 { t.tick(2, 0, None, D, &c); }  // 40s
        for _ in 0..50 { t.tick(2, 120, None, D, &c); } // خمول 2 د: يوقف العدّ لكن لا يصفّر
        assert_eq!(t.continuous(), 40);
        t.tick(2, 0, None, D, &c);
        assert_eq!(t.continuous(), 42);
        t.tick(2, 300, None, D, &c); // استراحة حقيقية
        assert_eq!(t.continuous(), 0);
    }

    #[test]
    fn breaks_off_never_fires_and_keeps_counter_zero() {
        let mut t = Tracker::default();
        let c = cfg(true, false, 1);
        for _ in 0..100 { assert_eq!(t.tick(2, 0, Some("x"), D, &c), None); }
        assert_eq!(t.continuous(), 0);
    }

    #[test]
    fn break_minutes_clamped() {
        assert_eq!(break_secs_from_minutes(None), 3600);
        assert_eq!(break_secs_from_minutes(Some(1)), 300);
        assert_eq!(break_secs_from_minutes(Some(45)), 2700);
        assert_eq!(break_secs_from_minutes(Some(9999)), 240 * 60);
    }

    #[test]
    fn db_roundtrip_top_prune() {
        let mut c = rusqlite::Connection::open_in_memory().unwrap();
        crate::migrate::run(&mut c, crate::migrate::MIGRATIONS).unwrap();
        add_seconds(&mut c, &[(D.into(), "chrome".into(), 100), (D.into(), "code".into(), 300), ("2026-10-01".into(), "old".into(), 9)]).unwrap();
        add_seconds(&mut c, &[(D.into(), "chrome".into(), 250)]).unwrap(); // تراكم
        let (total, apps) = top_for_day(&c, D, 8).unwrap();
        assert_eq!(total, 650);
        assert_eq!(apps, vec![AppTime { app: "chrome".into(), seconds: 350 }, AppTime { app: "code".into(), seconds: 300 }]);
        assert_eq!(top_for_day(&c, D, 1).unwrap().1.len(), 1);
        assert_eq!(prune_before(&c, "2026-10-15").unwrap(), 1);
        assert_eq!(top_for_day(&c, "2026-10-01", 8).unwrap().0, 0);
    }
}
