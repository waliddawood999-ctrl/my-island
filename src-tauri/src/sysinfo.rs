// sysinfo — استخدام المعالج والذاكرة. لا خيط ولا مؤقّت في الخلفية: القياس يحدث فقط
// عند استدعاء `sysinfo_get` (الواجهة تستدعيه كل ~2s وهي مفتوحة على قسم «النظام» فقط)
// ⇒ كلفة صفر عند إغلاق اللوحة.
// sysinfo_get() → {cpu: 0..100, mem_used, mem_total, mem_percent: 0..100}
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct SysInfo {
    pub cpu: f32,
    pub mem_used: u64,
    pub mem_total: u64,
    pub mem_percent: f32,
}

/// (idle, kernel, user) بوحدات 100ns؛ kernel في ويندوز يشمل idle.
pub type Times = (u64, u64, u64);

/// نسبة استخدام المعالج بين عيّنتين (0..100).
pub fn cpu_percent(prev: Times, cur: Times) -> f32 {
    let idle = cur.0.saturating_sub(prev.0);
    let total = cur.1.saturating_sub(prev.1) + cur.2.saturating_sub(prev.2);
    if total == 0 { return 0.0; }
    ((1.0 - idle as f64 / total as f64) * 100.0).clamp(0.0, 100.0) as f32
}

/// هل تُمنع عيّنة النظام الآن؟ (Eco فقط.)
pub fn sample_blocked(eco: bool) -> bool { eco }

pub fn mem_percent(used: u64, total: u64) -> f32 {
    if total == 0 { 0.0 } else { (used as f64 / total as f64 * 100.0).clamp(0.0, 100.0) as f32 }
}

#[derive(Default)]
pub struct SysState {
    last: Mutex<Option<(Instant, Times)>>,
}

#[cfg(windows)]
pub fn times() -> Option<Times> {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::GetSystemTimes;
    let (mut i, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
    unsafe { GetSystemTimes(Some(&mut i), Some(&mut k), Some(&mut u)).ok()?; }
    let q = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
    Some((q(i), q(k), q(u)))
}
#[cfg(not(windows))]
pub fn times() -> Option<Times> { None }

#[cfg(windows)]
fn memory() -> (u64, u64) {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut m = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    if unsafe { GlobalMemoryStatusEx(&mut m) }.is_err() { return (0, 0); }
    (m.ullTotalPhys.saturating_sub(m.ullAvailPhys), m.ullTotalPhys)
}
#[cfg(not(windows))]
fn memory() -> (u64, u64) { (0, 0) }

#[tauri::command]
pub async fn sysinfo_get(state: tauri::State<'_, SysState>) -> Result<SysInfo, String> {
    // وضع التوفير يوقف أخذ العيّنات فعليًا (لا قراءة GetSystemTimes ولا GlobalMemoryStatusEx ولا نوم 200ms).
    if sample_blocked(crate::perf::eco()) { return Err("eco".into()); }
    let cur = times();
    let prev = *state.last.lock().unwrap();
    let cpu = match (cur, prev) {
        // عيّنة سابقة حديثة (<5s): الفرق بينها وبين الآن.
        (Some(c), Some((at, p))) if at.elapsed() < Duration::from_secs(5) => cpu_percent(p, c),
        // أول قياس بعد غياب: خط أساس ثم عيّنة بعد 200ms كي لا يُحسب متوسط فترة طويلة.
        (Some(c), _) => {
            std::thread::sleep(Duration::from_millis(200));
            times().map_or(0.0, |n| cpu_percent(c, n))
        }
        _ => 0.0,
    };
    *state.last.lock().unwrap() = times().map(|t| (Instant::now(), t));
    let (used, total) = memory();
    Ok(SysInfo { cpu, mem_used: used, mem_total: total, mem_percent: mem_percent(used, total) })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cpu() {
        // 50% خمول: kernel(+idle) زاد 100 منها idle 50، user زاد 0 ⇒ 50%
        assert_eq!(cpu_percent((0, 0, 0), (50, 100, 0)), 50.0);
        assert_eq!(cpu_percent((0, 0, 0), (0, 100, 100)), 100.0);
        assert_eq!(cpu_percent((10, 10, 10), (10, 10, 10)), 0.0);
        assert!(cpu_percent((100, 100, 100), (0, 0, 0)) == 0.0);
    }
    #[test]
    fn eco_blocks_sampling() {
        assert!(sample_blocked(true));
        assert!(!sample_blocked(false));
    }
    #[test]
    fn mem() {
        assert_eq!(mem_percent(50, 200), 25.0);
        assert_eq!(mem_percent(1, 0), 0.0);
    }
}
