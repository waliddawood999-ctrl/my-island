// الملاحظة + التذكيرات + المؤقّت (حسب المخطط §7/note و§10.2).
// كل البيانات في kv بالبادئة `note:` (ليست إعدادات — state.rs يتجاوزها):
//   note:doc:<folder> → HTML الملاحظة · note:folders → [{id,name}] · note:reminders · note:timer
// خيط جدولة واحد (نبضة كل ثانية على نسخة في الذاكرة) يطلق التنبيه: حدث `island:note` + صوت alertSound.
use chrono::{Duration, Local, NaiveDateTime, TimeZone};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::AppState;

pub const KV_PREFIX: &str = "note:";
const FOLDERS_KEY: &str = "note:folders";
const REMINDERS_KEY: &str = "note:reminders";
const TIMER_KEY: &str = "note:timer";
const DEFAULT_FOLDER: &str = "default";
/// سقف حجم الملاحظة (بايت) — حماية من حقن ضخم.
const MAX_DOC: usize = 2_000_000;
const MAX_REMINDERS: usize = 500;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Folder {
    pub id: String,
    pub name: String,
}

/// تذكير: `at` بالميلي ثانية (epoch)، `repeat` = "daily" | "weekly" | null، `done` بعد إطلاق غير المتكرر.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Reminder {
    pub id: String,
    pub text: String,
    pub at: i64,
    #[serde(default)]
    pub repeat: Option<String>,
    #[serde(default)]
    pub done: bool,
}

/// مؤقّت تنازلي: ينتهي عند `ends_at` (ms) من إجمالي `total_ms`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Timer {
    #[serde(rename = "endsAt")]
    pub ends_at: i64,
    #[serde(rename = "totalMs")]
    pub total_ms: i64,
    #[serde(default)]
    pub label: String,
}

#[derive(Default)]
pub struct NoteState {
    reminders: Mutex<Vec<Reminder>>,
    timer: Mutex<Option<Timer>>,
}

// ---------- منطق خالص (مُختبَر) ----------

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn local_from_ms(ms: i64) -> Option<NaiveDateTime> {
    Local.timestamp_millis_opt(ms).single().map(|d| d.naive_local())
}

fn ms_from_local(n: NaiveDateTime) -> Option<i64> {
    // بعد فجوة التوقيت الصيفي نأخذ أقرب لحظة صالحة.
    Local.from_local_datetime(&n).earliest().map(|d| d.timestamp_millis())
}

/// الموعد التالي لتذكير متكرر بعد `now` بالساعة المحلية (يحفظ ساعة الجدار عبر تغيّر التوقيت الصيفي).
/// repeat غير معروف ⇒ None.
pub fn next_occurrence(at: i64, repeat: &str, now: i64) -> Option<i64> {
    let step = match repeat {
        "daily" => 1,
        "weekly" => 7,
        _ => return None,
    };
    let base = local_from_ms(at)?;
    let mut n = base;
    let mut guard = 0;
    let mut cur = at;
    while cur <= now {
        n = n.checked_add_signed(Duration::days(step))?;
        cur = ms_from_local(n)?;
        guard += 1;
        if guard > 5000 {
            return None;
        }
    }
    Some(cur)
}

/// تنظيف قائمة تذكيرات واردة: نص غير فارغ مقصوص، id فريد، تكرار معروف فقط، سقف العدد.
pub fn sanitize_reminders(list: Vec<Reminder>) -> Vec<Reminder> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for mut r in list {
        r.text = r.text.trim().chars().take(500).collect();
        if r.text.is_empty() || r.id.is_empty() || r.at <= 0 || !seen.insert(r.id.clone()) {
            continue;
        }
        if !matches!(r.repeat.as_deref(), Some("daily") | Some("weekly")) {
            r.repeat = None;
        }
        if r.repeat.is_some() {
            r.done = false;
        }
        out.push(r);
        if out.len() >= MAX_REMINDERS {
            break;
        }
    }
    out
}

/// يطبّق إطلاق الوقت: يعيد (التذكيرات الجديدة، المُطلَقة). المتكرر يتقدّم، وغير المتكرر يُعلَّم done.
/// `late` = تأخر الإطلاق أكثر من دقيقتين عن موعده (التطبيق كان مغلقًا).
pub fn fire_due(list: &[Reminder], now: i64) -> (Vec<Reminder>, Vec<(Reminder, bool)>) {
    let mut out = Vec::with_capacity(list.len());
    let mut fired = Vec::new();
    for r in list {
        let mut r = r.clone();
        if !r.done && r.at <= now {
            let late = now - r.at > 120_000;
            fired.push((r.clone(), late));
            match r.repeat.as_deref().and_then(|p| next_occurrence(r.at, p, now)) {
                Some(next) => r.at = next,
                None => r.done = true,
            }
        }
        out.push(r);
    }
    (out, fired)
}

/// يحوّل أمر timer_set إلى مؤقّت: ثوانٍ موجبة ≤ 24 ساعة.
pub fn make_timer(seconds: f64, label: &str, now: i64) -> Option<Timer> {
    if !seconds.is_finite() || seconds < 1.0 || seconds > 86_400.0 {
        return None;
    }
    let total = (seconds * 1000.0).round() as i64;
    Some(Timer { ends_at: now + total, total_ms: total, label: label.trim().chars().take(100).collect() })
}

/// تنظيف مجلدات: اسم غير فارغ، id فريد، والافتراضي "default" يبقى أولًا إن وُجد.
pub fn sanitize_folders(list: Vec<Folder>) -> Vec<Folder> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for mut f in list {
        f.name = f.name.trim().chars().take(60).collect();
        if f.name.is_empty() || f.id.is_empty() || !is_safe_id(&f.id) || !seen.insert(f.id.clone()) {
            continue;
        }
        out.push(f);
    }
    out
}

fn is_safe_id(id: &str) -> bool {
    id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn doc_key(folder: &str) -> String {
    format!("{KV_PREFIX}doc:{folder}")
}

// ---------- تخزين ----------

fn with_db<T>(state: &AppState, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let g = state.db.lock().unwrap();
    let conn = g.as_ref().ok_or_else(|| "قاعدة البيانات غير متاحة".to_string())?;
    f(conn).map_err(|e| e.to_string())
}

fn kv_get(state: &AppState, key: &str) -> Option<String> {
    with_db(state, |c| c.query_row("SELECT value FROM kv WHERE key=?1", [key], |r| r.get::<_, String>(0)).optional())
        .ok()
        .flatten()
}

fn kv_set(state: &AppState, key: &str, value: &str) -> Result<(), String> {
    with_db(state, |c| {
        c.execute(
            "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )
        .map(|_| ())
    })
}

fn kv_del(state: &AppState, key: &str) -> Result<(), String> {
    with_db(state, |c| c.execute("DELETE FROM kv WHERE key=?1", [key]).map(|_| ()))
}

fn folder_ok(folder: &str) -> Result<(), String> {
    if is_safe_id(folder) && !folder.is_empty() { Ok(()) } else { Err("معرّف مجلد غير صالح".into()) }
}

fn load_reminders(state: &AppState) -> Vec<Reminder> {
    let raw: Vec<Reminder> = kv_get(state, REMINDERS_KEY).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    sanitize_reminders(raw)
}

fn load_timer(state: &AppState) -> Option<Timer> {
    kv_get(state, TIMER_KEY).and_then(|s| serde_json::from_str(&s).ok())
}

fn save_reminders(state: &AppState, list: &[Reminder]) -> Result<(), String> {
    kv_set(state, REMINDERS_KEY, &serde_json::to_string(list).map_err(|e| e.to_string())?)
}

fn save_timer(state: &AppState, t: &Option<Timer>) -> Result<(), String> {
    match t {
        Some(t) => kv_set(state, TIMER_KEY, &serde_json::to_string(t).map_err(|e| e.to_string())?),
        None => kv_del(state, TIMER_KEY),
    }
}

// ---------- الأوامر ----------

/// نص ملاحظة المجلد (HTML من Tiptap)؛ فارغ إن لم تُكتب بعد. folder الافتراضي "default".
#[tauri::command]
pub fn note_get(state: State<AppState>, folder: Option<String>) -> Result<String, String> {
    let f = folder.unwrap_or_else(|| DEFAULT_FOLDER.into());
    folder_ok(&f)?;
    Ok(kv_get(&state, &doc_key(&f)).unwrap_or_default())
}

#[tauri::command]
pub fn note_set(state: State<AppState>, folder: Option<String>, html: String) -> Result<(), String> {
    let f = folder.unwrap_or_else(|| DEFAULT_FOLDER.into());
    folder_ok(&f)?;
    if html.len() > MAX_DOC {
        return Err("الملاحظة أكبر من الحد المسموح".into());
    }
    kv_set(&state, &doc_key(&f), &html)
}

#[tauri::command]
pub fn note_folders_get(state: State<AppState>) -> Vec<Folder> {
    let raw: Vec<Folder> = kv_get(&state, FOLDERS_KEY).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    sanitize_folders(raw)
}

/// يحفظ قائمة المجلدات؛ ملاحظات المجلدات المحذوفة (غير default) تُحذف.
#[tauri::command]
pub fn note_folders_set(state: State<AppState>, folders: Vec<Folder>) -> Result<Vec<Folder>, String> {
    let new = sanitize_folders(folders);
    let old: Vec<Folder> = kv_get(&state, FOLDERS_KEY).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    kv_set(&state, FOLDERS_KEY, &serde_json::to_string(&new).map_err(|e| e.to_string())?)?;
    for f in sanitize_folders(old) {
        if f.id != DEFAULT_FOLDER && !new.iter().any(|n| n.id == f.id) {
            let _ = kv_del(&state, &doc_key(&f.id));
        }
    }
    Ok(new)
}

#[tauri::command]
pub fn reminders_get(note: State<NoteState>) -> Vec<Reminder> {
    note.reminders.lock().unwrap().clone()
}

#[tauri::command]
pub fn reminders_set(app: AppHandle, list: Vec<Reminder>) -> Result<Vec<Reminder>, String> {
    let clean = sanitize_reminders(list);
    let st = app.state::<AppState>();
    save_reminders(&st, &clean)?;
    *app.state::<NoteState>().reminders.lock().unwrap() = clean.clone();
    let _ = app.emit("reminders:changed", clean.len());
    Ok(clean)
}

#[tauri::command]
pub fn timer_get(note: State<NoteState>) -> Option<Timer> {
    note.timer.lock().unwrap().clone()
}

/// بدء مؤقّت: `seconds` (1..86400) وتسمية اختيارية. seconds=null ⇒ إلغاء المؤقّت الجاري.
#[tauri::command]
pub fn timer_set(app: AppHandle, seconds: Option<f64>, label: Option<String>) -> Result<Option<Timer>, String> {
    let t = match seconds {
        None => None,
        Some(s) => Some(make_timer(s, label.as_deref().unwrap_or(""), now_ms()).ok_or("مدة المؤقّت غير صالحة (ثانية إلى 24 ساعة)")?),
    };
    save_timer(&app.state::<AppState>(), &t)?;
    *app.state::<NoteState>().timer.lock().unwrap() = t.clone();
    let _ = app.emit("timer:changed", t.clone());
    Ok(t)
}

// ---------- الجدولة والتنبيه ----------

/// يحمّل التذكيرات والمؤقّت ويبدأ خيط النبضة. يُستدعى بعد init_db.
pub fn start(app: &AppHandle) {
    let st = app.state::<AppState>();
    let ns = app.state::<NoteState>();
    *ns.reminders.lock().unwrap() = load_reminders(&st);
    // مؤقّت انتهى والتطبيق مغلق: يُسقَط بصمت (التذكير المتأخر وحده يُطلَق عند الإقلاع).
    let t = load_timer(&st).filter(|t| t.ends_at > now_ms());
    let _ = save_timer(&st, &t);
    *ns.timer.lock().unwrap() = t;
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        tick(&app, now_ms());
    });
}

fn tick(app: &AppHandle, now: i64) {
    let ns = app.state::<NoteState>();
    // 1) التذكيرات
    let fired = {
        let mut g = ns.reminders.lock().unwrap();
        if g.iter().any(|r| !r.done && r.at <= now) {
            let (next, fired) = fire_due(&g, now);
            *g = next;
            let _ = save_reminders(&app.state::<AppState>(), &g);
            fired
        } else {
            Vec::new()
        }
    };
    for (r, late) in &fired {
        alert(app, json!({ "kind": "reminder", "id": r.id, "text": r.text, "at": r.at, "late": late }));
    }
    if !fired.is_empty() {
        let n = ns.reminders.lock().unwrap().len();
        let _ = app.emit("reminders:changed", n);
    }
    // 2) المؤقّت
    let done = {
        let mut g = ns.timer.lock().unwrap();
        match g.as_ref() {
            Some(t) if t.ends_at <= now => g.take(),
            _ => None,
        }
    };
    if let Some(t) = done {
        let _ = save_timer(&app.state::<AppState>(), &None);
        alert(app, json!({ "kind": "timer", "id": "timer", "text": t.label, "at": t.ends_at, "late": false }));
        let _ = app.emit("timer:changed", Option::<Timer>::None);
    }
}

/// تنبيه: حدث island:note للواجهة + صوت alertSound إن ضُبط (غير فارغ ولا "off").
fn alert(app: &AppHandle, payload: Value) {
    let _ = app.emit("island:note", payload);
    let sound = app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .get("alertSound")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    play_sound(&sound);
}

#[cfg(windows)]
fn play_sound(sound: &str) {
    use windows::core::HSTRING;
    use windows::Win32::Media::Audio::{PlaySoundW, SND_ALIAS, SND_ASYNC, SND_FILENAME, SND_NODEFAULT};
    let s = sound.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("off") || s.eq_ignore_ascii_case("none") {
        return;
    }
    let beep = || unsafe {
        let _ = PlaySoundW(&HSTRING::from("SystemAsterisk"), None, SND_ALIAS | SND_ASYNC);
    };
    // PlaySound يقبل WAV فقط؛ مسار غير موجود/غير مدعوم ⇒ نغمة النظام الافتراضية احتياطًا.
    if s.eq_ignore_ascii_case("default") || s.eq_ignore_ascii_case("beep") || !std::path::Path::new(s).is_file() {
        beep();
    } else if !unsafe { PlaySoundW(&HSTRING::from(s), None, SND_FILENAME | SND_ASYNC | SND_NODEFAULT) }.as_bool() {
        beep();
    }
}

#[cfg(not(windows))]
fn play_sound(_sound: &str) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(id: &str, text: &str, at: i64, repeat: Option<&str>) -> Reminder {
        Reminder { id: id.into(), text: text.into(), at, repeat: repeat.map(String::from), done: false }
    }

    #[test]
    fn sanitize_drops_bad_and_dupes() {
        let l = sanitize_reminders(vec![
            r("a", "  اتصل بأمي ", 10, None),
            r("a", "مكرر", 20, None),
            r("b", "   ", 10, None),
            r("c", "x", 0, None),
            r("d", "ok", 5, Some("yearly")),
        ]);
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].text, "اتصل بأمي");
        assert_eq!(l[1].repeat, None);
    }

    #[test]
    fn fire_marks_done_or_advances() {
        let day = 86_400_000;
        let now = 10 * day;
        let list = vec![
            r("once", "مرة", now - 1000, None),
            r("daily", "يوميًا", now - 1000, Some("daily")),
            r("later", "لاحقًا", now + 5000, None),
        ];
        let (next, fired) = fire_due(&list, now);
        assert_eq!(fired.len(), 2);
        assert!(next[0].done);
        assert!(!next[1].done && next[1].at > now && next[1].at - now <= day + 3_700_000);
        assert!(!next[2].done && next[2].at == now + 5000);
        // لا إطلاق ثانٍ لنفس الوقت
        let (_, again) = fire_due(&next, now);
        assert!(again.is_empty());
    }

    #[test]
    fn late_flag_after_two_minutes() {
        let (_, f) = fire_due(&[r("a", "x", 1000, None)], 1000 + 130_000);
        assert!(f[0].1);
        let (_, f) = fire_due(&[r("a", "x", 1000, None)], 1000 + 5_000);
        assert!(!f[0].1);
    }

    #[test]
    fn weekly_advances_in_week_steps() {
        let week = 7 * 86_400_000;
        let at = 20 * 86_400_000;
        let n = next_occurrence(at, "weekly", at + 3 * week + 5).unwrap();
        assert!(n > at + 3 * week && n - (at + 3 * week) <= week + 3_700_000);
        assert_eq!(next_occurrence(at, "monthly", at + 1), None);
    }

    #[test]
    fn timer_bounds() {
        assert!(make_timer(0.0, "", 0).is_none());
        assert!(make_timer(90_000.0, "", 0).is_none());
        let t = make_timer(90.0, " شاي ", 1000).unwrap();
        assert_eq!((t.ends_at, t.total_ms, t.label.as_str()), (91_000, 90_000, "شاي"));
    }

    #[test]
    fn folders_sanitized() {
        let f = |id: &str, n: &str| Folder { id: id.into(), name: n.into() };
        let l = sanitize_folders(vec![f("default", "عام"), f("a/b", "bad"), f("x", " "), f("default", "dup"), f("w1", "عمل")]);
        assert_eq!(l.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), vec!["default", "w1"]);
    }

    #[test]
    fn doc_key_prefix_matches() {
        assert!(doc_key("w1").starts_with(KV_PREFIX));
        assert!(folder_ok("../x").is_err());
    }
}
