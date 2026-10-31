// battery — نسبة الشحن وحالة التوصيل عبر GetSystemPowerStatus (حسب المخطط §7).
// يعمل فقط عند showBattery؛ يحدّث كل 30s أو فور تغيّر حالة التوصيل (فحص رخيص كل 2s).
// battery_status() → {has_battery, percent|null, ac, charging} · الحدث battery:update.
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct BatteryInfo {
    pub has_battery: bool,
    pub percent: Option<u8>,
    /// موصول بالتيار
    pub ac: bool,
    pub charging: bool,
}

/// يحوّل حقول SYSTEM_POWER_STATUS الخام (ACLineStatus, BatteryFlag, BatteryLifePercent).
pub fn from_raw(ac_line: u8, flag: u8, pct: u8) -> BatteryInfo {
    let has_battery = flag != 128 && flag != 255 || (flag == 255 && pct <= 100);
    BatteryInfo {
        has_battery,
        percent: if has_battery && pct <= 100 { Some(pct) } else { None },
        ac: ac_line == 1,
        charging: has_battery && flag != 255 && flag & 8 != 0,
    }
}

#[cfg(windows)]
pub fn read() -> BatteryInfo {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() {
        return BatteryInfo::default();
    }
    from_raw(s.ACLineStatus, s.BatteryFlag, s.BatteryLifePercent)
}
#[cfg(not(windows))]
pub fn read() -> BatteryInfo { BatteryInfo::default() }

#[tauri::command]
pub fn battery_status() -> BatteryInfo { read() }

pub fn start(app: &AppHandle) {
    use tauri::{Emitter, Manager};
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last: Option<BatteryInfo> = None;
        let mut since = std::time::Instant::now();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let on = app.state::<crate::state::AppState>().settings.lock().unwrap()
                .get("showBattery").and_then(|v| v.as_bool()).unwrap_or(false);
            if !on { last = None; continue; }
            let now = read();
            let ac_changed = last.as_ref().map_or(true, |l| l.ac != now.ac || l.has_battery != now.has_battery);
            if ac_changed || since.elapsed().as_secs() >= 30 {
                since = std::time::Instant::now();
                if last.as_ref() != Some(&now) { let _ = app.emit("battery:update", &now); }
                last = Some(now);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn raw() {
        assert_eq!(from_raw(1, 8 | 1, 80), BatteryInfo { has_battery: true, percent: Some(80), ac: true, charging: true });
        assert_eq!(from_raw(0, 1, 55), BatteryInfo { has_battery: true, percent: Some(55), ac: false, charging: false });
        assert!(!from_raw(1, 128, 255).has_battery);
    }
}
