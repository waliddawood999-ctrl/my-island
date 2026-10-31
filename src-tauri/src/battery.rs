// battery — نسبة الشحن وحالة التوصيل عبر GetSystemPowerStatus (حسب المخطط §7).
// يعمل فقط عند showBattery؛ يحدّث كل 30s أو فور تغيّر حالة التوصيل (فحص رخيص كل 2s).
// battery_status() → {has_battery, percent|null, ac, charging, remaining_min|null, unplug_tip, bt:[{name,percent}]}
// · الحدث battery:update. (L6: الحقول الثلاثة الأخيرة مضافة؛ القديمة كما هي.)
// remaining_min: دقائق حتى النفاد على البطارية (BatteryLifeTime من ويندوز وإلا تقدير من منحنى النسبة)
//   أو حتى الامتلاء أثناء الشحن (تقدير فقط)؛ null = غير معروف.
// unplug_tip: يشحن وفوق/عند 80% ⇒ نصيحة «افصل الشاحن». bt: بطاريات أجهزة BLE المتصلة عبر GATT (خدمة 0x180F).
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

// ==== core:begin (منطق خالص — يُختبر منفصلًا)
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct BtBattery {
    pub name: String,
    pub percent: u8,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct BatteryInfo {
    pub has_battery: bool,
    pub percent: Option<u8>,
    /// موصول بالتيار
    pub ac: bool,
    pub charging: bool,
    /// دقائق متبقية تقديريًا (حتى النفاد أو الامتلاء حسب `charging`)؛ None = غير معروف.
    pub remaining_min: Option<u32>,
    /// نصيحة «افصل الشاحن عند 80%»: تُرفع أثناء الشحن عند 80% فأكثر.
    pub unplug_tip: bool,
    /// بطاريات أجهزة البلوتوث المتصلة التي تُبلغ مستواها (فارغة إن لم يوجد/معطّلة).
    pub bt: Vec<BtBattery>,
}

pub const TIP_PERCENT: u8 = 80;

/// يحوّل حقول SYSTEM_POWER_STATUS الخام (ACLineStatus, BatteryFlag, BatteryLifePercent).
pub fn from_raw(ac_line: u8, flag: u8, pct: u8) -> BatteryInfo {
    let has_battery = flag != 128 && flag != 255 || (flag == 255 && pct <= 100);
    let percent = if has_battery && pct <= 100 { Some(pct) } else { None };
    let charging = has_battery && flag != 255 && flag & 8 != 0;
    BatteryInfo {
        has_battery,
        percent,
        ac: ac_line == 1,
        charging,
        unplug_tip: unplug_tip(percent, charging),
        ..Default::default()
    }
}

pub fn unplug_tip(percent: Option<u8>, charging: bool) -> bool {
    charging && percent.map_or(false, |p| p >= TIP_PERCENT)
}

/// BatteryLifeTime الخام (ثوانٍ؛ 0xFFFFFFFF = مجهول) ⇒ دقائق، فقط على البطارية (غير موصول).
pub fn os_remaining_min(ac: bool, life_secs: u32) -> Option<u32> {
    if ac || life_secs == u32::MAX || life_secs == 0 { return None; }
    Some(((life_secs + 30) / 60).max(1))
}

const WINDOW_SECS: u64 = 30 * 60;
const MIN_SPAN_SECS: u64 = 5 * 60;
const MAX_ESTIMATE_MIN: u32 = 99 * 60;

/// منحنى (زمن، نسبة) لتقدير الوقت المتبقي حين لا يعطيه ويندوز. يُصفَّر عند تغيّر الحالة (توصيل/شحن).
#[derive(Default, Debug)]
pub struct History {
    state: Option<(bool, bool)>,
    samples: VecDeque<(u64, u8)>,
}

impl History {
    /// t بالثواني (أي ساعة رتيبة). عيّنات أقرب من 25s تُتجاهل.
    pub fn push(&mut self, t: u64, pct: u8, ac: bool, charging: bool) {
        if self.state != Some((ac, charging)) {
            self.state = Some((ac, charging));
            self.samples.clear();
        }
        if let Some(&(lt, _)) = self.samples.back() {
            if t < lt + 25 { return; }
        }
        self.samples.push_back((t, pct));
        while let Some(&(ft, _)) = self.samples.front() {
            if t.saturating_sub(ft) > WINDOW_SECS { self.samples.pop_front(); } else { break; }
        }
    }

    /// دقائق حتى النفاد (تفريغ) أو الامتلاء (شحن)؛ تحتاج مدى ≥5 دقائق وتغيّرًا ≥1% باتجاه الحالة.
    pub fn estimate(&self, charging: bool) -> Option<u32> {
        let &(t0, p0) = self.samples.front()?;
        let &(t1, p1) = self.samples.back()?;
        let span = t1.checked_sub(t0)?;
        if span < MIN_SPAN_SECS { return None; }
        let delta = p1 as i32 - p0 as i32;
        let left = if charging {
            if delta < 1 || p1 >= 100 { return None; }
            (100 - p1 as i32) as f64
        } else {
            if delta > -1 { return None; }
            p1 as f64
        };
        let rate = delta.abs() as f64 / span as f64; // % بالثانية
        let min = (left / rate / 60.0).round();
        if !min.is_finite() || min < 1.0 || min > MAX_ESTIMATE_MIN as f64 { return None; }
        Some(min as u32)
    }
}

#[derive(Default)]
struct Shared {
    history: History,
    bt: Vec<BtBattery>,
}

fn shared() -> &'static Mutex<Shared> {
    static S: OnceLock<Mutex<Shared>> = OnceLock::new();
    S.get_or_init(Default::default)
}

fn mono_secs() -> u64 {
    static T0: OnceLock<std::time::Instant> = OnceLock::new();
    T0.get_or_init(std::time::Instant::now).elapsed().as_secs()
}

/// يكمّل القراءة الخام بالوقت المتبقي (ويندوز ثم التقدير) وبطاريات البلوتوث المخزّنة.
fn enrich(mut b: BatteryInfo, life_secs: u32, record: bool) -> BatteryInfo {
    let mut sh = shared().lock().unwrap();
    if let (true, Some(p)) = (b.has_battery, b.percent) {
        if record { sh.history.push(mono_secs(), p, b.ac, b.charging); }
        b.remaining_min = os_remaining_min(b.ac, life_secs).or_else(|| sh.history.estimate(b.charging));
    }
    b.bt = sh.bt.clone();
    b
}
// ==== core:end

#[cfg(windows)]
pub fn read_raw() -> (BatteryInfo, u32) {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() {
        return (BatteryInfo::default(), u32::MAX);
    }
    (from_raw(s.ACLineStatus, s.BatteryFlag, s.BatteryLifePercent), s.BatteryLifeTime)
}
#[cfg(not(windows))]
pub fn read_raw() -> (BatteryInfo, u32) { (BatteryInfo::default(), u32::MAX) }

/// لقطة كاملة (ويندوز + الوقت المتبقي + بلوتوث المخزّن). record=true يضيف عيّنة لمنحنى التقدير.
fn snapshot(record: bool) -> BatteryInfo {
    let (b, life) = read_raw();
    enrich(b, life, record)
}

#[tauri::command]
pub fn battery_status() -> BatteryInfo { snapshot(false) }

/// بطاريات أجهزة BLE المتصلة عبر خدمة Battery (GATT 0x180F / خاصية 0x2A19).
/// أجهزة البلوتوث الكلاسيكي (HFP/A2DP) التي لا تعرض خدمة GATT لا تظهر هنا.
#[cfg(windows)]
mod bt {
    use super::BtBattery;
    use windows::{
        Devices::Bluetooth::{
            BluetoothConnectionStatus, BluetoothLEDevice,
            GenericAttributeProfile::{GattCharacteristicUuids, GattCommunicationStatus, GattServiceUuids},
        },
        Devices::Enumeration::DeviceInformation,
        Storage::Streams::DataReader,
        Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
    };

    fn init_winrt() {
        thread_local!(static DONE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) });
        DONE.with(|d| {
            if !d.get() {
                unsafe { let _ = RoInitialize(RO_INIT_MULTITHREADED); }
                d.set(true);
            }
        });
    }

    fn read_one(info: &DeviceInformation) -> Option<BtBattery> {
        let dev = BluetoothLEDevice::FromIdAsync(&info.Id().ok()?).ok()?.get().ok()?;
        let name = dev.Name().ok().map(|n| n.to_string()).filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| "Bluetooth".to_string());
        let svcs = dev.GetGattServicesForUuidAsync(GattServiceUuids::Battery().ok()?).ok()?.get().ok()?;
        if svcs.Status().ok()? != GattCommunicationStatus::Success { return None; }
        for svc in svcs.Services().ok()? {
            let chars = match svc.GetCharacteristicsForUuidAsync(GattCharacteristicUuids::BatteryLevel().ok()?).and_then(|o| o.get()) {
                Ok(c) if c.Status().ok() == Some(GattCommunicationStatus::Success) => c,
                _ => continue,
            };
            for ch in chars.Characteristics().ok()? {
                let Ok(r) = ch.ReadValueAsync().and_then(|o| o.get()) else { continue };
                if r.Status().ok() != Some(GattCommunicationStatus::Success) { continue; }
                let Ok(rd) = r.Value().and_then(|v| DataReader::FromBuffer(&v)) else { continue };
                if let Ok(pct) = rd.ReadByte() {
                    if pct <= 100 { return Some(BtBattery { name, percent: pct }); }
                }
            }
        }
        None
    }

    /// كل الأجهزة المتصلة التي تُبلغ نسبة بطارية. قد يستغرق ثوانٍ — يُستدعى من خيط خلفي فقط.
    pub fn read_all() -> Vec<BtBattery> {
        init_winrt();
        let mut out: Vec<BtBattery> = vec![];
        let Ok(sel) = BluetoothLEDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected) else { return out };
        let Ok(infos) = DeviceInformation::FindAllAsyncAqsFilter(&sel).and_then(|o| o.get()) else { return out };
        for info in &infos {
            if let Some(b) = read_one(&info) {
                if !out.contains(&b) { out.push(b); }
            }
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }
}
#[cfg(not(windows))]
mod bt {
    pub fn read_all() -> Vec<super::BtBattery> { vec![] }
}

/// فترة تحديث بطاريات البلوتوث (الاتصال بالأجهزة ليس رخيصًا).
const BT_REFRESH_SECS: u64 = 300;

pub fn start(app: &AppHandle) {
    use tauri::{Emitter, Manager};
    let get = |app: &AppHandle, k: &str, d: bool| {
        app.state::<crate::state::AppState>().settings.lock().unwrap()
            .get(k).and_then(|v| v.as_bool()).unwrap_or(d)
    };
    let a1 = app.clone();
    std::thread::spawn(move || {
        let app = a1;
        let mut last: Option<BatteryInfo> = None;
        let mut since = std::time::Instant::now();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            if !get(&app, "showBattery", false) { last = None; continue; }
            let now = snapshot(true);
            let ac_changed = last.as_ref().map_or(true, |l| l.ac != now.ac || l.has_battery != now.has_battery);
            if ac_changed || since.elapsed().as_secs() >= 30 {
                since = std::time::Instant::now();
                if last.as_ref() != Some(&now) { let _ = app.emit("battery:update", &now); }
                last = Some(now);
            }
        }
    });
    // بلوتوث: خيط منفصل (القراءة بطيئة)؛ معطّل ⇒ لا اتصال بأي جهاز ويُفرَّغ المخزّن.
    let a2 = app.clone();
    std::thread::spawn(move || {
        let app = a2;
        let mut was_on = false;
        let mut next = std::time::Instant::now();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let on = get(&app, "showBattery", false) && get(&app, "btBatteries", true);
            if !on {
                if was_on {
                    was_on = false;
                    let had = !std::mem::take(&mut shared().lock().unwrap().bt).is_empty();
                    if had { let _ = app.emit("battery:update", &snapshot(false)); }
                }
                continue;
            }
            if !was_on { was_on = true; next = std::time::Instant::now() + std::time::Duration::from_secs(3); }
            if std::time::Instant::now() < next { continue; }
            next = std::time::Instant::now() + std::time::Duration::from_secs(BT_REFRESH_SECS);
            let list = bt::read_all();
            let changed = {
                let mut sh = shared().lock().unwrap();
                let c = sh.bt != list;
                sh.bt = list;
                c
            };
            if changed { let _ = app.emit("battery:update", &snapshot(false)); }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn info(ac: bool, charging: bool, pct: u8) -> BatteryInfo {
        BatteryInfo { has_battery: true, percent: Some(pct), ac, charging, unplug_tip: unplug_tip(Some(pct), charging), ..Default::default() }
    }

    #[test]
    fn raw() {
        assert_eq!(from_raw(1, 8 | 1, 80), info(true, true, 80));
        assert_eq!(from_raw(0, 1, 55), info(false, false, 55));
        assert!(!from_raw(1, 128, 255).has_battery);
    }

    #[test]
    fn tip_only_when_charging_at_or_above_80() {
        assert!(from_raw(1, 8, 80).unplug_tip);
        assert!(from_raw(1, 8, 97).unplug_tip);
        assert!(!from_raw(1, 8, 79).unplug_tip);
        assert!(!from_raw(1, 1, 100).unplug_tip, "موصول لكن لا يشحن (ممتلئ)");
        assert!(!from_raw(0, 1, 90).unplug_tip, "على البطارية");
        assert!(!from_raw(1, 128, 255).unplug_tip);
    }

    #[test]
    fn os_time_remaining() {
        assert_eq!(os_remaining_min(false, 3600), Some(60));
        assert_eq!(os_remaining_min(false, 89), Some(1));
        assert_eq!(os_remaining_min(false, u32::MAX), None);
        assert_eq!(os_remaining_min(true, 3600), None);
        assert_eq!(os_remaining_min(false, 0), None);
    }

    #[test]
    fn discharge_estimate_from_slope() {
        let mut h = History::default();
        // 1% كل 3 دقائق: 80% ← 77% خلال 9 دقائق ⇒ 77% تحتاج 231 د
        for (k, p) in [80u8, 79, 78, 77].iter().enumerate() { h.push(k as u64 * 180, *p, false, false); }
        assert_eq!(h.estimate(false), Some(231));
        assert_eq!(h.estimate(true), None, "اتجاه معاكس");
    }

    #[test]
    fn charge_estimate_to_full() {
        let mut h = History::default();
        for (k, p) in [50u8, 52, 54, 56].iter().enumerate() { h.push(k as u64 * 120, *p, true, true); } // 1% / 60s
        assert_eq!(h.estimate(true), Some(44)); // 44% متبقية بمعدل 1%/د
        assert_eq!(h.estimate(false), None);
    }

    #[test]
    fn estimate_needs_span_and_change() {
        let mut h = History::default();
        h.push(0, 80, false, false);
        assert_eq!(h.estimate(false), None, "عيّنة واحدة");
        h.push(100, 79, false, false);
        assert_eq!(h.estimate(false), None, "مدى < 5 دقائق");
        let mut f = History::default();
        f.push(0, 80, false, false); f.push(600, 80, false, false);
        assert_eq!(f.estimate(false), None, "لا تغيّر");
    }

    #[test]
    fn state_change_resets_history_and_close_samples_ignored() {
        let mut h = History::default();
        h.push(0, 80, false, false); h.push(10, 70, false, false); // الثانية أقرب من 25s ⇒ تُهمَل
        assert_eq!(h.samples.len(), 1);
        h.push(400, 78, false, false);
        h.push(800, 90, true, true); // وُصِّل الشاحن ⇒ يُصفَّر
        assert_eq!(h.samples.len(), 1);
        assert_eq!(h.estimate(true), None);
    }

    #[test]
    fn old_samples_fall_out_of_window() {
        let mut h = History::default();
        for k in 0..100u64 { h.push(k * 60, 100 - (k / 10) as u8, false, false); }
        let (ft, _) = *h.samples.front().unwrap();
        let (lt, _) = *h.samples.back().unwrap();
        assert!(lt - ft <= WINDOW_SECS);
    }

    #[test]
    fn enrich_merges_bt_and_prefers_os_time() {
        shared().lock().unwrap().bt = vec![BtBattery { name: "Mouse".into(), percent: 64 }];
        let b = enrich(info(false, false, 50), 7200, true);
        assert_eq!(b.remaining_min, Some(120));
        assert_eq!(b.bt, vec![BtBattery { name: "Mouse".into(), percent: 64 }]);
        let d = enrich(BatteryInfo::default(), u32::MAX, true); // لا بطارية (مكتبي): لا وقت، البلوتوث يبقى
        assert_eq!(d.remaining_min, None);
        assert_eq!(d.bt.len(), 1);
        shared().lock().unwrap().bt.clear();
    }
}
