// meetings — الاجتماعات القادمة من رابط iCal الخاص بالتقويم (ميزة شبكية اختيارية: showMeetings).
// الرابط سرّ: يُحفظ مشفّرًا بـ DPAPI عبر secrets.rs خلف `meetings_key_set/meetings_key_status` — لا يدخل الإعدادات
// ولا kv ولا السجلات ولا رسائل الأخطاء (الأخطاء رموز: http:404 / network / format / unreadable).
// خيط واحد بنبضة 10s: معطّل ⇒ لا جلب ولا حساب. مفعّل ⇒ جلب كل 15 دقيقة (إعادة محاولة بعد دقيقتين عند الفشل)،
// حساب القادم (7 أيام) كل 5 دقائق، وتنبيه قبل 5 دقائق وعند البدء عبر قناة التنبيه نفسها (`island:note` + alertSound).
// الأحداث تُحفظ في الذاكرة فقط (لا قرص). التحليل والتكرار في ical.rs.
use crate::{ical, secrets, state::AppState};
use serde::Serialize;
use serde_json::json;
use std::collections::HashSet;
use std::io::Read;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub const SECRET: &str = "meetings_ical";
const REFRESH_MS: i64 = 15 * 60_000;
const RETRY_MS: i64 = 2 * 60_000;
const RECOMPUTE_MS: i64 = 5 * 60_000;
const HORIZON_MS: i64 = 7 * 86_400_000;
const MAX_ITEMS: usize = 40;
const MAX_BODY: u64 = 8 * 1024 * 1024;
const WARN_MS: i64 = 5 * 60_000;
const START_GRACE_MS: i64 = 90_000;

#[derive(Default)]
struct Inner {
    cal: Option<ical::Calendar>,
    items: Vec<ical::Meeting>,
    fetched_at: Option<i64>,
    tried_at: Option<i64>,
    computed_at: i64,
    error: Option<String>,
    alerted: HashSet<String>,
}

#[derive(Default)]
pub struct MeetingsState { inner: Mutex<Inner> }

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct Snapshot {
    pub configured: bool,
    pub enabled: bool,
    pub items: Vec<ical::Meeting>,
    /// رمز خطأ آخر جلب (http:404 / network / format / unreadable) أو null.
    pub error: Option<String>,
    pub fetched_at: Option<i64>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct KeyStatus { pub set: bool }

pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

/// يقبل https:// أو webcal:// فقط؛ يعيد رابط https نظيفًا.
pub fn normalize_url(input: &str) -> Result<String, String> {
    let t = input.trim();
    let t = match t.get(..9) {
        Some(p) if p.eq_ignore_ascii_case("webcal://") => format!("https://{}", &t[9..]),
        _ => t.to_string(),
    };
    if t.len() > 2048 || t.chars().any(|c| c.is_control()) { return Err("invalid".into()); }
    let u = url::Url::parse(&t).map_err(|_| "invalid".to_string())?;
    if u.scheme() != "https" || u.host_str().is_none() { return Err("https_only".into()); }
    Ok(u.to_string())
}

// ---------- تنبيهات (منطق خالص) ----------

#[derive(Debug, PartialEq)]
pub struct Due { pub id: String, pub title: String, pub start: i64, pub kind: &'static str, pub minutes: i64 }

/// تنبيهات مستحقة الآن ولم تُطلَق: «5» داخل 5 دقائق قبل البدء، «0» عند البدء (حتى 90s بعده).
pub fn due_alerts(items: &[ical::Meeting], alerted: &HashSet<String>, now: i64) -> Vec<Due> {
    let mut out = Vec::new();
    for m in items {
        let until = m.start - now;
        let kind = if until > 0 && until <= WARN_MS { "5" } else if until <= 0 && -until < START_GRACE_MS { "0" } else { continue };
        if alerted.contains(&format!("{}|{kind}", m.id)) { continue; }
        out.push(Due { id: m.id.clone(), title: m.title.clone(), start: m.start, kind, minutes: ((until + 59_999) / 60_000).clamp(1, 5) });
    }
    out
}

pub fn alert_text(d: &Due, lang: &str) -> String {
    let t: String = d.title.chars().take(80).collect();
    let en = lang == "en";
    let t = if t.trim().is_empty() { (if en { "Meeting" } else { "اجتماع" }).to_string() } else { t };
    match (d.kind, en) {
        ("0", false) => format!("يبدأ الآن: «{t}»"),
        ("0", true) => format!("Starting now: “{t}”"),
        (_, true) => format!("“{t}” in {} min", d.minutes),
        (_, false) => match d.minutes {
            1 => format!("اجتماع «{t}» بعد دقيقة"),
            2 => format!("اجتماع «{t}» بعد دقيقتين"),
            n => format!("اجتماع «{t}» بعد {n} دقائق"),
        },
    }
}

// ---------- الجلب ----------

fn fetch(url: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(15)).user_agent("MyIsland/0.2").build();
    let resp = agent.get(url).call().map_err(|e| match e {
        ureq::Error::Status(c, _) => format!("http:{c}"),
        _ => "network".to_string(), // لا نص خطأ ureq: قد يحمل الرابط
    })?;
    let mut s = String::new();
    resp.into_reader().take(MAX_BODY).read_to_string(&mut s).map_err(|_| "unreadable".to_string())?;
    if !s.contains("BEGIN:VCALENDAR") { return Err("format".into()); }
    Ok(s)
}

// ---------- الحالة ----------

fn setting(app: &AppHandle, key: &str) -> Option<serde_json::Value> {
    app.state::<AppState>().settings.lock().unwrap().get(key).cloned()
}
fn data_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.state::<AppState>().data_dir.lock().unwrap().clone()
}
fn enabled(app: &AppHandle) -> bool { setting(app, "showMeetings").and_then(|v| v.as_bool()).unwrap_or(false) }
fn configured(app: &AppHandle) -> bool { data_dir(app).map_or(false, |d| secrets::exists(&d, SECRET)) }

fn recompute(g: &mut Inner, now: i64) {
    g.items = g.cal.as_ref().map_or_else(Vec::new, |c| ical::upcoming(c, now, now + HORIZON_MS, MAX_ITEMS));
    g.computed_at = now;
    let live: HashSet<&str> = g.items.iter().map(|m| m.id.as_str()).collect();
    g.alerted.retain(|k| k.rsplit_once('|').map_or(false, |(id, _)| live.contains(id)));
}

fn snapshot(app: &AppHandle) -> Snapshot {
    let en = enabled(app);
    let g = app.state::<MeetingsState>().inner.lock().unwrap().snap_parts();
    Snapshot { configured: configured(app), enabled: en, items: if en { g.0 } else { vec![] }, error: g.1, fetched_at: g.2 }
}
impl Inner {
    fn snap_parts(&self) -> (Vec<ical::Meeting>, Option<String>, Option<i64>) { (self.items.clone(), self.error.clone(), self.fetched_at) }
}

fn publish(app: &AppHandle) { let _ = app.emit("meetings:update", snapshot(app)); }

fn clear(app: &AppHandle) {
    let ms = app.state::<MeetingsState>();
    let had = {
        let mut g = ms.inner.lock().unwrap();
        let had = g.cal.is_some() || !g.items.is_empty() || g.error.is_some();
        *g = Inner::default();
        had
    };
    if had { publish(app); }
}

fn refresh(app: &AppHandle) -> Result<(), String> {
    let dir = data_dir(app).ok_or("not_configured")?;
    let url = secrets::get(&dir, SECRET).ok_or("not_configured")?;
    let ms = app.state::<MeetingsState>();
    let now = now_ms();
    ms.inner.lock().unwrap().tried_at = Some(now);
    let res = fetch(&url);
    {
        let mut g = ms.inner.lock().unwrap();
        match &res {
            Ok(body) => {
                g.cal = Some(ical::parse_calendar(body));
                g.fetched_at = Some(now);
                g.error = None;
                recompute(&mut g, now);
            }
            Err(e) => g.error = Some(e.clone()), // نُبقي آخر قائمة ناجحة
        }
    }
    publish(app);
    res.map(|_| ())
}

fn tick(app: &AppHandle) {
    if !enabled(app) || !configured(app) { clear(app); return; }
    let ms = app.state::<MeetingsState>();
    let now = now_ms();
    let (need_fetch, need_recompute) = {
        let g = ms.inner.lock().unwrap();
        let wait = if g.error.is_some() { RETRY_MS } else { REFRESH_MS };
        (g.tried_at.map_or(true, |t| now - t >= wait), g.cal.is_some() && now - g.computed_at >= RECOMPUTE_MS)
    };
    if need_fetch {
        let _ = refresh(app);
    } else if need_recompute {
        recompute(&mut ms.inner.lock().unwrap(), now);
        publish(app);
    }
    let lang = setting(app, "language").and_then(|v| v.as_str().map(String::from)).unwrap_or_else(|| "ar".into());
    let due = {
        let mut g = ms.inner.lock().unwrap();
        let d = due_alerts(&g.items, &g.alerted, now);
        for x in &d { g.alerted.insert(format!("{}|{}", x.id, x.kind)); }
        d
    };
    for d in due {
        crate::note::alert(app, json!({ "kind": "reminder", "id": format!("meeting:{}", d.id), "text": alert_text(&d, &lang), "at": d.start, "late": false }));
    }
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(10));
        tick(&app);
    });
}

// ---------- الأوامر ----------

#[tauri::command]
pub fn meetings_key_status(app: AppHandle) -> KeyStatus { KeyStatus { set: configured(&app) } }

/// يحفظ رابط iCal مشفّرًا (https/webcal فقط)؛ نص فارغ ⇒ يحذف السرّ ويمسح الذاكرة.
#[tauri::command]
pub fn meetings_key_set(app: AppHandle, url: String) -> Result<KeyStatus, String> {
    let dir = data_dir(&app).ok_or("not_ready")?;
    if url.trim().is_empty() {
        secrets::delete(&dir, SECRET)?;
        clear(&app);
        return Ok(KeyStatus { set: false });
    }
    secrets::set(&dir, SECRET, &normalize_url(&url)?)?;
    *app.state::<MeetingsState>().inner.lock().unwrap() = Inner::default(); // جلب جديد فورًا عند النبضة/التحديث
    publish(&app);
    Ok(KeyStatus { set: true })
}

#[tauri::command]
pub fn meetings_list(app: AppHandle) -> Snapshot { snapshot(&app) }

/// جلب فوري (زر التحديث / بعد حفظ الرابط). يعيد اللقطة حتى عند فشل الجلب (الرمز في `error`).
#[tauri::command]
pub async fn meetings_refresh(app: AppHandle) -> Result<Snapshot, String> {
    if enabled(&app) && configured(&app) { let _ = refresh(&app); }
    Ok(snapshot(&app))
}

/// يفتح رابط الانضمام بالمتصفح/التطبيق الافتراضي — لروابط https لمزوّدي الاجتماعات المعروفين فقط.
#[tauri::command]
pub fn meetings_join(app: AppHandle, url: String) -> Result<(), String> {
    let j = ical::join_of_url(&url).ok_or("unsupported")?;
    crate::palette::open_path(app, j.url)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(id: &str, start: i64) -> ical::Meeting {
        ical::Meeting { id: id.into(), title: "Sync".into(), start, end: start + 1, location: String::new(), join: None, recurring: false }
    }

    #[test]
    fn url_normalization() {
        assert_eq!(normalize_url("  webcal://calendar.example.com/a.ics ").unwrap(), "https://calendar.example.com/a.ics");
        assert_eq!(normalize_url("HTTPS://x.test/p?private=abc").unwrap(), "https://x.test/p?private=abc");
        assert!(normalize_url("http://x.test/a.ics").is_err());
        assert!(normalize_url("file:///etc/passwd").is_err());
        assert!(normalize_url("javascript:alert(1)").is_err());
        assert!(normalize_url("https://x.test/a\nb").is_err());
        assert!(normalize_url(&format!("https://x.test/{}", "a".repeat(2100))).is_err());
        assert!(normalize_url("").is_err());
    }

    #[test]
    fn alert_windows_and_dedupe() {
        let now = 1_000_000_000;
        let items = vec![m("far", now + 20 * 60_000), m("soon", now + 4 * 60_000 + 10), m("starting", now - 20_000), m("late", now - 120_000)];
        let d = due_alerts(&items, &HashSet::new(), now);
        assert_eq!(d.iter().map(|x| (x.id.as_str(), x.kind)).collect::<Vec<_>>(), vec![("soon", "5"), ("starting", "0")]);
        assert_eq!(d[0].minutes, 5);
        let mut done: HashSet<String> = HashSet::new();
        done.insert("soon|5".into());
        let d2 = due_alerts(&items, &done, now);
        assert_eq!(d2.len(), 1);
        // بعد الإطلاق «5» يبقى «0» مستحقًا لاحقًا
        let d3 = due_alerts(&items[1..2], &done, now + 4 * 60_000 + 10);
        assert_eq!(d3[0].kind, "0");
        // اقترب جدًا: دقيقة واحدة
        assert_eq!(due_alerts(&[m("x", now + 30_000)], &HashSet::new(), now)[0].minutes, 1);
    }

    #[test]
    fn alert_texts() {
        let d = |kind, minutes, title: &str| Due { id: "i".into(), title: title.into(), start: 0, kind, minutes };
        assert_eq!(alert_text(&d("5", 5, "فريق"), "ar"), "اجتماع «فريق» بعد 5 دقائق");
        assert_eq!(alert_text(&d("5", 1, "فريق"), "ar"), "اجتماع «فريق» بعد دقيقة");
        assert_eq!(alert_text(&d("5", 2, "فريق"), "ar"), "اجتماع «فريق» بعد دقيقتين");
        assert_eq!(alert_text(&d("0", 0, "فريق"), "ar"), "يبدأ الآن: «فريق»");
        assert_eq!(alert_text(&d("5", 3, "Sync"), "en"), "“Sync” in 3 min");
        assert_eq!(alert_text(&d("0", 0, ""), "en"), "Starting now: “Meeting”");
        assert_eq!(alert_text(&d("0", 0, &"x".repeat(200)), "en").chars().count(), "Starting now: “”".chars().count() + 80);
    }
}
