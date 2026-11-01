// today — لوحة «اليوم»: مواقيت الصلاة محليًا (طريقة أم القرى) + تنبيهاتها + طقس Open-Meteo.
// المواقيت حساب فلكي بلا شبكة لمدينة من جدول سعودي مضمّن (كلها UTC+3 بلا توقيت صيفي).
// أم القرى: الفجر 18.5° · الشروق/المغرب بزاوية 0.833° · العصر ظلّ ×1 · العشاء = المغرب + 90د (120د في رمضان).
// رمضان يُكشف بتقويم هجري جدولي (±يوم)؛ التاريخ الهجري المعروض نفسه يأتي من الواجهة عبر Intl أم القرى.
// الأوامر: today_cities · today_get · weather_get — الحدث: island:note بنوع "prayer" (يعيد استعمال تنبيه الحبة + alertSound).
// الطقس الشبكي اختياري: لا يُجلب إلا عند showWeather (افتراضيًا معطّل) — AGENTS §7.
use crate::state::AppState;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const TZ_HOURS: f64 = 3.0;
const TZ_MS: i64 = 3 * 3_600_000;
const DAY_MS: i64 = 86_400_000;
const SOON_MS: i64 = 10 * 60_000;
/// نافذة الإطلاق بعد الموعد: أبعد من ذلك يُعدّ فائتًا (نوم الجهاز) فلا يُنبَّه.
const FIRE_WINDOW_MS: i64 = 90_000;
const WEATHER_TTL_MS: i64 = 15 * 60_000;
pub const DEFAULT_CITY: &str = "riyadh";

pub struct City {
    pub id: &'static str,
    pub ar: &'static str,
    pub en: &'static str,
    pub lat: f64,
    pub lon: f64,
}

pub const CITIES: &[City] = &[
    City { id: "riyadh", ar: "الرياض", en: "Riyadh", lat: 24.7136, lon: 46.6753 },
    City { id: "makkah", ar: "مكة المكرمة", en: "Makkah", lat: 21.3891, lon: 39.8579 },
    City { id: "madinah", ar: "المدينة المنورة", en: "Madinah", lat: 24.4672, lon: 39.6111 },
    City { id: "jeddah", ar: "جدة", en: "Jeddah", lat: 21.4858, lon: 39.1925 },
    City { id: "dammam", ar: "الدمام", en: "Dammam", lat: 26.4207, lon: 50.0888 },
    City { id: "khobar", ar: "الخبر", en: "Al Khobar", lat: 26.2172, lon: 50.1971 },
    City { id: "taif", ar: "الطائف", en: "Taif", lat: 21.2703, lon: 40.4158 },
    City { id: "tabuk", ar: "تبوك", en: "Tabuk", lat: 28.3838, lon: 36.5550 },
    City { id: "buraidah", ar: "بريدة", en: "Buraidah", lat: 26.3260, lon: 43.9750 },
    City { id: "abha", ar: "أبها", en: "Abha", lat: 18.2164, lon: 42.5053 },
    City { id: "khamis", ar: "خميس مشيط", en: "Khamis Mushait", lat: 18.3000, lon: 42.7333 },
    City { id: "hail", ar: "حائل", en: "Hail", lat: 27.5114, lon: 41.7208 },
    City { id: "jazan", ar: "جازان", en: "Jazan", lat: 16.8892, lon: 42.5511 },
    City { id: "najran", ar: "نجران", en: "Najran", lat: 17.4917, lon: 44.1322 },
    City { id: "hofuf", ar: "الأحساء", en: "Al-Ahsa", lat: 25.3648, lon: 49.5870 },
    City { id: "jubail", ar: "الجبيل", en: "Jubail", lat: 27.0046, lon: 49.6460 },
    City { id: "yanbu", ar: "ينبع", en: "Yanbu", lat: 24.0895, lon: 38.0618 },
    City { id: "baha", ar: "الباحة", en: "Al Baha", lat: 20.0129, lon: 41.4677 },
    City { id: "sakaka", ar: "سكاكا", en: "Sakaka", lat: 29.9697, lon: 40.2064 },
    City { id: "arar", ar: "عرعر", en: "Arar", lat: 30.9753, lon: 41.0381 },
];

pub fn city_by_id(id: &str) -> &'static City {
    CITIES.iter().find(|c| c.id == id).unwrap_or(&CITIES[0])
}

// ---------- تقويم ميلادي (Hinnant) ----------

/// أيام منذ 1970-01-01 لتاريخ مدني.
pub fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// الشهر الهجري (1..12) بتقويم جدولي (خوارزمية الكويت) ليوم بعدد أيام منذ 1970 — تقريب ±يوم.
pub fn hijri_month_tabular(days: i64) -> i64 {
    let jdn = days + 2_440_588;
    let mut l = jdn - 1_948_440 + 10_632;
    let n = (l - 1) / 10_631;
    l = l - 10_631 * n + 354;
    let j = ((10_985 - l) / 5_316) * ((50 * l) / 17_719) + (l / 5_670) * ((43 * l) / 15_238);
    l = l - ((30 - j) / 15) * ((17_719 * j) / 50) - (j / 16) * ((15_238 * j) / 43) + 29;
    (24 * l) / 709
}

// ---------- المواقيت ----------

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Times {
    /// ساعات محلية (UTC+3) من منتصف ليل اليوم المدني
    pub fajr: f64,
    pub sunrise: f64,
    pub dhuhr: f64,
    pub asr: f64,
    pub maghrib: f64,
    pub isha: f64,
}

fn rad(d: f64) -> f64 { d.to_radians() }
fn deg(r: f64) -> f64 { r.to_degrees() }
fn fix(a: f64, b: f64) -> f64 { a - b * (a / b).floor() }

/// (ميل الشمس بالدرجات، معادلة الزمن بالساعات) عند اليوم اليولياني jd.
fn sun_position(jd: f64) -> (f64, f64) {
    let d = jd - 2_451_545.0;
    let g = fix(357.529 + 0.985_600_28 * d, 360.0);
    let q = fix(280.459 + 0.985_647_36 * d, 360.0);
    let l = fix(q + 1.915 * rad(g).sin() + 0.020 * rad(2.0 * g).sin(), 360.0);
    let e = 23.439 - 0.000_000_36 * d;
    let ra = fix(deg((rad(e).cos() * rad(l).sin()).atan2(rad(l).cos())) / 15.0, 24.0);
    let eqt = q / 15.0 - ra;
    let eqt = if eqt > 12.0 { eqt - 24.0 } else if eqt < -12.0 { eqt + 24.0 } else { eqt };
    let decl = deg((rad(e).sin() * rad(l).sin()).asin());
    (decl, eqt)
}

/// الزمن (ساعات) الذي تبلغ فيه الشمس زاوية -angle تحت الأفق؛ before=true ⇒ قبل الظهر.
fn angle_time(angle: f64, dhuhr: f64, lat: f64, decl: f64, before: bool) -> f64 {
    let x = (-rad(angle).sin() - rad(decl).sin() * rad(lat).sin()) / (rad(decl).cos() * rad(lat).cos());
    let t = deg(x.clamp(-1.0, 1.0).acos()) / 15.0;
    if before { dhuhr - t } else { dhuhr + t }
}

/// مواقيت يوم مدني (days = أيام منذ 1970 بتوقيت UTC+3) لإحداثيات المدينة.
pub fn compute_times(days: i64, lat: f64, lon: f64) -> Times {
    let jd0 = days as f64 + 2_440_587.5; // منتصف الليل UT
    let solar_noon_jd = |t_local: f64| jd0 + (t_local - TZ_HOURS) / 24.0;
    // تقريب أول ثم تحسين: الشمس عند الظهر المحلي الفعلي.
    let mut dhuhr = 12.0 + TZ_HOURS - lon / 15.0;
    let mut eqt = sun_position(solar_noon_jd(dhuhr)).1;
    for _ in 0..2 {
        dhuhr = 12.0 + TZ_HOURS - lon / 15.0 - eqt;
        eqt = sun_position(solar_noon_jd(dhuhr)).1;
    }
    dhuhr = 12.0 + TZ_HOURS - lon / 15.0 - eqt;
    // الفجر/الشروق/المغرب: الشمس عند أوقاتها لا عند الظهر.
    let at = |guess: f64| sun_position(solar_noon_jd(guess));
    let (d_fajr, _) = at(dhuhr - 6.0);
    let (d_set, _) = at(dhuhr + 6.0);
    let fajr = angle_time(18.5, dhuhr, lat, d_fajr, true);
    let sunrise = angle_time(0.833, dhuhr, lat, at(dhuhr - 6.0).0, true);
    let sunset = angle_time(0.833, dhuhr, lat, d_set, false);
    // العصر: ظلّ الشيء = ظلّه عند الظهر + طوله.
    let (d_asr, _) = at(dhuhr + 3.5);
    let asr_alt = deg((1.0 / (1.0 + (lat - d_asr).abs().to_radians().tan())).atan());
    let asr = angle_time(-asr_alt, dhuhr, lat, d_asr, false);
    let isha_gap = if hijri_month_tabular(days) == 9 { 120.0 } else { 90.0 } / 60.0;
    Times { fajr, sunrise, dhuhr, asr, maghrib: sunset, isha: sunset + isha_gap }
}

pub const IDS: [&str; 6] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

fn times_arr(t: &Times) -> [f64; 6] { [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha] }

/// ساعة محلية → epoch ms مقرّبًا لأقرب دقيقة.
fn at_ms(days: i64, hours: f64) -> i64 {
    let minutes = (hours * 60.0).round() as i64;
    days * DAY_MS + minutes * 60_000 - TZ_MS
}

/// (المعرّف، epoch ms) لكل المواقيت: ست لليوم ثم فجر الغد.
pub fn schedule(days: i64, city: &City) -> Vec<(&'static str, i64)> {
    let t = compute_times(days, city.lat, city.lon);
    let mut v: Vec<(&'static str, i64)> = IDS.iter().zip(times_arr(&t)).map(|(id, h)| (*id, at_ms(days, h))).collect();
    let tm = compute_times(days + 1, city.lat, city.lon);
    v.push(("fajr", at_ms(days + 1, tm.fajr)));
    v
}

pub fn civil_days(now_ms: i64) -> i64 { (now_ms + TZ_MS).div_euclid(DAY_MS) }

// ---------- التنبيهات ----------

fn is_prayer(id: &str) -> bool { id != "sunrise" }

/// التنبيهات المستحقة الآن: ("soon"|"now", المعرّف، موعد الصلاة). نافذة قصيرة بعد الموعد فقط.
pub fn due_alerts(sched: &[(&'static str, i64)], now: i64) -> Vec<(&'static str, &'static str, i64)> {
    let mut out = Vec::new();
    for (id, at) in sched {
        if !is_prayer(id) { continue; }
        if now >= at - SOON_MS && now < at - SOON_MS + FIRE_WINDOW_MS { out.push(("soon", *id, *at)); }
        if now >= *at && now < at + FIRE_WINDOW_MS { out.push(("now", *id, *at)); }
    }
    out
}

pub fn prayer_name(id: &str, ar: bool) -> &'static str {
    match (id, ar) {
        ("fajr", true) => "الفجر", ("fajr", false) => "Fajr",
        ("sunrise", true) => "الشروق", ("sunrise", false) => "Sunrise",
        ("dhuhr", true) => "الظهر", ("dhuhr", false) => "Dhuhr",
        ("asr", true) => "العصر", ("asr", false) => "Asr",
        ("maghrib", true) => "المغرب", ("maghrib", false) => "Maghrib",
        ("isha", true) => "العشاء", ("isha", false) => "Isha",
        _ => "",
    }
}

pub fn alert_text(kind: &str, id: &str, ar: bool) -> String {
    let n = prayer_name(id, ar);
    match (kind, ar) {
        ("soon", true) => format!("{n} بعد 10 دقائق"),
        ("soon", false) => format!("{n} in 10 minutes"),
        (_, true) => format!("حان وقت صلاة {n}"),
        (_, false) => format!("It's time for {n}"),
    }
}

fn setting(app: &AppHandle, key: &str) -> Option<Value> {
    app.state::<AppState>().settings.lock().unwrap().get(key).cloned()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn city_setting(app: &AppHandle) -> &'static City {
    let id = setting(app, "prayerCity").and_then(|v| v.as_str().map(String::from)).unwrap_or_else(|| DEFAULT_CITY.into());
    city_by_id(&id)
}

/// خيط التنبيه: كل 5ث؛ يعمل فقط عند showToday وprayerAlerts (الافتراضي كلاهما true).
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut fired: HashSet<(&'static str, i64)> = HashSet::new();
        loop {
            std::thread::sleep(Duration::from_secs(5));
            let on = setting(&app, "showToday").and_then(|v| v.as_bool()).unwrap_or(true)
                && setting(&app, "prayerAlerts").and_then(|v| v.as_bool()).unwrap_or(true);
            if !on { continue; }
            let now = now_ms();
            let sched = schedule(civil_days(now), city_setting(&app));
            for (kind, id, at) in due_alerts(&sched, now) {
                if !fired.insert((kind, at)) { continue; }
                let ar = setting(&app, "language").and_then(|v| v.as_str().map(|s| s != "en")).unwrap_or(true);
                crate::note::alert(&app, json!({ "kind": "prayer", "id": format!("prayer-{id}-{kind}"), "text": alert_text(kind, id, ar), "at": at, "late": false }));
            }
            fired.retain(|(_, at)| *at > now - DAY_MS);
        }
    });
}

// ---------- الأوامر ----------

#[derive(Serialize)]
pub struct CityInfo { pub id: &'static str, pub ar: &'static str, pub en: &'static str }

#[tauri::command]
pub fn today_cities() -> Vec<CityInfo> {
    CITIES.iter().map(|c| CityInfo { id: c.id, ar: c.ar, en: c.en }).collect()
}

#[derive(Serialize)]
pub struct PrayerAt { pub id: &'static str, pub at: i64 }

#[derive(Serialize)]
pub struct TodayInfo {
    pub city: CityInfo,
    /// ست أوقات اليوم ثم فجر الغد (epoch ms)
    pub prayers: Vec<PrayerAt>,
    /// بداية يوم المدينة التالي (epoch ms) — تُعاد القراءة بعده
    pub next_day_at: i64,
}

#[tauri::command]
pub fn today_get(app: AppHandle) -> TodayInfo {
    let c = city_setting(&app);
    let days = civil_days(now_ms());
    TodayInfo {
        city: CityInfo { id: c.id, ar: c.ar, en: c.en },
        prayers: schedule(days, c).into_iter().map(|(id, at)| PrayerAt { id, at }).collect(),
        next_day_at: (days + 1) * DAY_MS - TZ_MS,
    }
}

// ---------- الطقس (Open-Meteo، بلا مفتاح) ----------

#[derive(Serialize, Clone, Debug, Default)]
pub struct Weather {
    /// false ⇒ الميزة معطّلة (showWeather) أو لا بيانات
    pub enabled: bool,
    pub offline: bool,
    pub temp: f64,
    pub feels: f64,
    pub humidity: f64,
    pub wind: f64,
    /// رمز WMO
    pub code: i64,
    pub is_day: bool,
    /// "c" | "f"
    pub units: String,
    pub city: String,
    pub fetched_at: i64,
    /// سبب الفشل إن وُجد (dns/connect/timeout/http_NNN/parse/eco) — الواجهة تعرض حالة خطأ واضحة؛ فارغ = سليم.
    pub error: String,
}

static CACHE: Mutex<Option<(String, Weather)>> = Mutex::new(None);

/// وضع التوفير يوقف الجلب الدوري للطقس: الشبكة مسموحة خارج Eco، أو داخله فقط بطلب صريح (`refresh=true`).
pub fn weather_net_allowed(eco: bool, force: bool) -> bool { !eco || force }

fn parse_weather(v: &Value, units: &str, city: &str, now: i64) -> Option<Weather> {
    let c = v.get("current")?;
    Some(Weather {
        enabled: true,
        offline: false,
        temp: c.get("temperature_2m")?.as_f64()?,
        feels: c.get("apparent_temperature").and_then(Value::as_f64).unwrap_or_default(),
        humidity: c.get("relative_humidity_2m").and_then(Value::as_f64).unwrap_or_default(),
        wind: c.get("wind_speed_10m").and_then(Value::as_f64).unwrap_or_default(),
        code: c.get("weather_code").and_then(Value::as_i64).unwrap_or(0),
        is_day: c.get("is_day").and_then(Value::as_i64).unwrap_or(1) == 1,
        units: units.into(),
        city: city.into(),
        fetched_at: now,
        error: String::new(),
    })
}

/// يصنّف خطأ ureq إلى رمز قصير للواجهة (بلا نصوص النظام).
fn classify(e: &ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, _) => format!("http_{code}"),
        ureq::Error::Transport(t) => match t.kind() {
            ureq::ErrorKind::Dns => "dns".into(),
            ureq::ErrorKind::ConnectionFailed | ureq::ErrorKind::ProxyConnect => "connect".into(),
            _ if t.to_string().to_ascii_lowercase().contains("timed out") => "timeout".into(),
            _ => "network".into(),
        },
    }
}

fn fetch_once(c: &City, units: &str) -> Result<Weather, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(6))
        .timeout(Duration::from_secs(10))
        .user_agent("MyIsland/1.0")
        .build();
    let fahrenheit = units == "f";
    let r = agent
        .get("https://api.open-meteo.com/v1/forecast")
        .query("latitude", &c.lat.to_string())
        .query("longitude", &c.lon.to_string())
        .query("current", "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m")
        .query("temperature_unit", if fahrenheit { "fahrenheit" } else { "celsius" })
        .query("wind_speed_unit", if fahrenheit { "mph" } else { "kmh" })
        .query("timezone", "auto")
        .call()
        .map_err(|e| classify(&e))?;
    let v = r.into_json::<Value>().map_err(|_| "parse".to_string())?;
    parse_weather(&v, units, c.id, now_ms()).ok_or_else(|| "parse".to_string())
}

/// محاولة ثم إعادة واحدة بعد 700ms لأعطال النقل العابرة (لا تُعاد أخطاء HTTP/التحليل).
fn fetch_weather(c: &City, units: &str) -> Result<Weather, String> {
    match fetch_once(c, units) {
        Err(e) if !e.starts_with("http_") && e != "parse" => {
            std::thread::sleep(Duration::from_millis(700));
            fetch_once(c, units)
        }
        r => r,
    }
}

/// مدينة الطقس: weatherCity (الافتراضي المدينة المنورة) — مستقلة عن prayerCity حتى لا تمسّ مواقيت الصلاة.
fn weather_city(app: &AppHandle) -> &'static City {
    let id = setting(app, "weatherCity").and_then(|v| v.as_str().map(String::from)).unwrap_or_else(|| "madinah".into());
    city_by_id(&id)
}

/// الطقس الحالي لمدينة weatherCity. معطّل (enabled:false) ما لم يُفعَّل showWeather؛ غياب الشبكة ⇒ offline:true.
/// يُخزَّن 15 دقيقة في الذاكرة (لكل مدينة+وحدات)؛ refresh=true يتجاوزه.
#[tauri::command]
pub async fn weather_get(app: AppHandle, refresh: Option<bool>) -> Result<Weather, String> {
    if !setting(&app, "showWeather").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Ok(Weather::default());
    }
    let city = weather_city(&app);
    let units = match setting(&app, "weatherUnits").and_then(|v| v.as_str().map(String::from)).as_deref() {
        Some("f") => "f",
        _ => "c",
    };
    let key = format!("{}:{units}", city.id);
    let force = refresh.unwrap_or(false);
    let net = weather_net_allowed(crate::perf::eco(), force);
    tauri::async_runtime::spawn_blocking(move || {
        if !net {
            // Eco: لا شبكة — آخر قيمة مخزّنة لنفس المدينة/الوحدات إن وُجدت (أيًّا كان عمرها) وإلا «لا بيانات».
            return match CACHE.lock().unwrap().as_ref() {
                Some((k, w)) if *k == key => w.clone(),
                _ => Weather { enabled: true, error: "eco".into(), units: units.into(), city: city.id.into(), ..Weather::default() },
            };
        }
        if !force {
            if let Some((k, w)) = CACHE.lock().unwrap().as_ref() {
                if *k == key && now_ms() - w.fetched_at < WEATHER_TTL_MS { return w.clone(); }
            }
        }
        match fetch_weather(city, units) {
            Ok(w) => {
                *CACHE.lock().unwrap() = Some((key, w.clone()));
                w
            }
            // فشل: آخر قيمة سليمة لنفس المدينة/الوحدات (مع سبب الخطأ ليُنبَّه المستخدم أنها قديمة) وإلا حالة خطأ صريحة.
            Err(e) => match CACHE.lock().unwrap().as_ref() {
                Some((k, w)) if *k == key => Weather { error: e, ..w.clone() },
                _ => Weather { enabled: true, offline: true, error: e, units: units.into(), city: city.id.into(), ..Weather::default() },
            },
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hm(h: f64) -> (i64, i64) {
        let m = (h * 60.0).round() as i64;
        (m / 60, m % 60)
    }

    #[test]
    fn civil_days_known() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2000, 3, 1), 11_017);
        assert_eq!(days_from_civil(2024, 1, 1), 19_723);
    }

    #[test]
    fn tabular_ramadan() {
        // 1 رمضان 1445 ≈ 2024-03-11 ، 1 شوال ≈ 2024-04-10
        assert_eq!(hijri_month_tabular(days_from_civil(2024, 3, 15)), 9);
        assert_eq!(hijri_month_tabular(days_from_civil(2024, 4, 5)), 9);
        assert_eq!(hijri_month_tabular(days_from_civil(2024, 4, 20)), 10);
        assert_eq!(hijri_month_tabular(days_from_civil(2024, 2, 1)), 7);
    }

    #[test]
    fn order_and_plausible_all_cities_all_year() {
        for c in CITIES {
            for d in (0..365).step_by(7) {
                let t = compute_times(days_from_civil(2025, 1, 1) + d, c.lat, c.lon);
                let a = times_arr(&t);
                for w in a.windows(2) { assert!(w[0] < w[1], "{} day {d}: {a:?}", c.id); }
                assert!(t.fajr > 2.5 && t.isha < 22.5, "{} day {d}: {a:?}", c.id);
            }
        }
    }

    #[test]
    fn makkah_reference_days() {
        // مرجع تقريبي لجداول أم القرى لمكة: 21 مارس (اعتدال) الظهر ≈ 12:25، الشروق ≈ 6:20، المغرب ≈ 18:30 (±4د).
        let c = city_by_id("makkah");
        let t = compute_times(days_from_civil(2025, 3, 21), c.lat, c.lon);
        let near = |h: f64, want: (i64, i64)| { let (a, b) = hm(h); ((a * 60 + b) - (want.0 * 60 + want.1)).abs() <= 6 };
        assert!(near(t.dhuhr, (12, 25)), "dhuhr {:?}", hm(t.dhuhr));
        assert!(near(t.sunrise, (6, 20)), "sunrise {:?}", hm(t.sunrise));
        assert!(near(t.maghrib, (18, 31)), "maghrib {:?}", hm(t.maghrib));
        // العشاء = المغرب + 90د خارج رمضان (21 مارس 2025 رمضان! فنفحص يومًا آخر)
        let t2 = compute_times(days_from_civil(2025, 6, 21), c.lat, c.lon);
        assert!((t2.isha - t2.maghrib - 1.5).abs() < 1e-9);
        let t3 = compute_times(days_from_civil(2025, 3, 10), c.lat, c.lon);
        assert!((t3.isha - t3.maghrib - 2.0).abs() < 1e-9);
    }

    #[test]
    fn at_ms_uses_riyadh_offset() {
        // منتصف ليل 1970-01-01 محليًا = 21:00 UTC من اليوم السابق
        assert_eq!(at_ms(0, 0.0), -TZ_MS);
        assert_eq!(civil_days(-TZ_MS), 0);
        assert_eq!(civil_days(-TZ_MS - 1), -1);
    }

    #[test]
    fn schedule_has_tomorrow_fajr_and_sorted() {
        let s = schedule(days_from_civil(2025, 5, 5), city_by_id("riyadh"));
        assert_eq!(s.len(), 7);
        assert_eq!(s[6].0, "fajr");
        for w in s.windows(2) { assert!(w[0].1 < w[1].1); }
    }

    #[test]
    fn alerts_soon_and_now_within_window_only() {
        let s = vec![("fajr", 1_000_000_000i64), ("sunrise", 1_000_000_000 + 5_000_000)];
        let at = 1_000_000_000;
        assert!(due_alerts(&s, at - SOON_MS - 1).is_empty());
        assert_eq!(due_alerts(&s, at - SOON_MS), vec![("soon", "fajr", at)]);
        assert_eq!(due_alerts(&s, at - SOON_MS + 60_000), vec![("soon", "fajr", at)]);
        assert!(due_alerts(&s, at - SOON_MS + FIRE_WINDOW_MS).is_empty());
        assert_eq!(due_alerts(&s, at), vec![("now", "fajr", at)]);
        assert!(due_alerts(&s, at + FIRE_WINDOW_MS).is_empty());
        // الشروق ليس صلاة فلا تنبيه
        assert!(due_alerts(&s, at + 5_000_000).is_empty());
    }

    #[test]
    fn alert_texts() {
        assert_eq!(alert_text("soon", "asr", true), "العصر بعد 10 دقائق");
        assert_eq!(alert_text("now", "isha", false), "It's time for Isha");
    }

    #[test]
    fn weather_parse() {
        let v = json!({"current": {"temperature_2m": 31.4, "apparent_temperature": 33.0, "relative_humidity_2m": 20, "wind_speed_10m": 12.5, "weather_code": 1, "is_day": 1}});
        let w = parse_weather(&v, "c", "riyadh", 5).unwrap();
        assert_eq!((w.temp, w.code, w.is_day, w.enabled), (31.4, 1, true, true));
        assert!(parse_weather(&json!({}), "c", "x", 0).is_none());
    }

    #[test]
    fn eco_blocks_periodic_weather_only() {
        assert!(weather_net_allowed(false, false));
        assert!(weather_net_allowed(false, true));
        assert!(!weather_net_allowed(true, false));
        assert!(weather_net_allowed(true, true)); // طلب صريح من المستخدم يمرّ
    }

    #[test]
    fn unknown_city_falls_back() {
        assert_eq!(city_by_id("nope").id, "riyadh");
    }
}
