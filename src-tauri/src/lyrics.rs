// lyrics — كلمات الأغاني من LRCLIB (مجاني بلا مفتاح). حسب المخطط §7/lyrics.
// lyrics_get(artist,title,album,duration): بحث /api/get ثم احتياطي /api/search، رفض نسخ
// remix/live/karaoke/sped-up من العنوان، اختيار الأقرب مدةً، تفضيل syncedLyrics (LRC) ثم plainLyrics.
// النتائج تُخزَّن في kv بمفتاح بصمة (فنان+عنوان+مدة)؛ غياب الشبكة ⇒ offline:true لا خطأ.
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const BASE: &str = "https://lrclib.net/api";
const UA: &str = "MyIsland/0.2 (https://github.com/waliddawood999-ctrl/my-island)";
/// أقصى فرق مدة مقبول (ثوانٍ) بين الأغنية الحالية والنتيجة.
const MAX_DUR_DIFF: f64 = 5.0;
/// مدة صلاحية نتيجة «لا كلمات» في الذاكرة المؤقتة.
const MISS_TTL_SECS: i64 = 7 * 24 * 3600;
pub const CACHE_PREFIX: &str = "lyrics:";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct LyricLine {
    /// ثانية بداية السطر
    pub t: f64,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Lyrics {
    pub found: bool,
    /// true ⇒ lines مؤقّتة (LRC)؛ false ⇒ plain فقط
    pub synced: bool,
    pub instrumental: bool,
    /// تعذّر الوصول للشبكة (لا يُخزَّن)
    pub offline: bool,
    pub lines: Vec<LyricLine>,
    pub plain: String,
}

// ───────── منطق خالص (يُختبر منفصلًا) ─────────
// PURE-BEGIN

/// يحلّل نص LRC إلى أسطر مرتّبة زمنيًا. يتجاهل وسوم الميتاداتا [ar:..] ويدعم عدة طوابع في سطر واحد.
pub fn parse_lrc(src: &str) -> Vec<LyricLine> {
    let mut out: Vec<LyricLine> = Vec::new();
    for raw in src.lines() {
        let mut rest = raw.trim_start();
        let mut stamps: Vec<f64> = Vec::new();
        while rest.starts_with('[') {
            let Some(end) = rest.find(']') else { break };
            let tag = &rest[1..end];
            match parse_stamp(tag) {
                Some(t) => stamps.push(t),
                None => {
                    // وسم ميتاداتا (ar:, ti:, ...) أو غير مفهوم: السطر كله يُهمل إن لم تسبقه طوابع.
                    if stamps.is_empty() { rest = ""; }
                    break;
                }
            }
            rest = &rest[end + 1..];
        }
        if stamps.is_empty() { continue; }
        let text = rest.trim().to_string();
        for t in stamps { out.push(LyricLine { t, text: text.clone() }); }
    }
    out.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));
    out
}

fn parse_stamp(tag: &str) -> Option<f64> {
    // mm:ss | mm:ss.xx | mm:ss:xx
    let mut it = tag.splitn(2, ':');
    let m: f64 = it.next()?.trim().parse::<u32>().ok()? as f64;
    let rest = it.next()?;
    let rest = rest.replace(':', ".");
    let s: f64 = rest.trim().parse().ok()?;
    if !(0.0..60.0 + 1e-9).contains(&s) { return None; }
    Some(m * 60.0 + s)
}

/// أعلام النسخ غير المرغوبة التي يحملها العنوان.
pub fn flags(title: &str) -> u8 {
    let t = title.to_lowercase();
    let has = |w: &str| {
        let mut from = 0;
        while let Some(p) = t[from..].find(w) {
            let s = from + p;
            let e = s + w.len();
            let before = t[..s].chars().next_back().map_or(true, |c| !c.is_alphanumeric());
            let after = t[e..].chars().next().map_or(true, |c| !c.is_alphanumeric());
            if before && after { return true; }
            from = e;
        }
        false
    };
    let mut f = 0u8;
    if has("remix") || has("rmx") { f |= 1; }
    if has("live") { f |= 2; }
    if has("karaoke") { f |= 4; }
    if has("sped up") || has("speed up") || has("sped-up") || has("slowed") || has("nightcore") { f |= 8; }
    f
}

/// يرفض المرشّح إن حمل علمًا لا يحمله العنوان المطلوب.
pub fn rejected(wanted_title: &str, cand_title: &str) -> bool {
    flags(cand_title) & !flags(wanted_title) != 0
}

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

/// تطابق الفنان تساهليًا: تضمّن متبادل بعد التطبيع (يغطي "A, B" و"A & B").
pub fn artist_ok(wanted: &str, cand: &str) -> bool {
    let (w, c) = (norm(wanted), norm(cand));
    if w.is_empty() || c.is_empty() { return true; }
    w.contains(&c) || c.contains(&w)
}

/// ينظّف العنوان من لواحق شائعة: "(feat. X)" و"- Remastered 2011" ...
pub fn clean_title(t: &str) -> String {
    let mut s = t.to_string();
    if let Some(p) = s.find(" - ") { s.truncate(p); }
    if let Some(p) = s.find(" (") { s.truncate(p); }
    if let Some(p) = s.find(" [") { s.truncate(p); }
    s.trim().to_string()
}

pub struct Cand {
    pub track: String,
    pub artist: String,
    pub duration: f64,
    pub has_synced: bool,
    pub has_any: bool,
}

/// يختار أقرب مرشّح مدةً بعد الرفض؛ عند التعادل يفضّل المتزامن. None إن لم يصلح أحد.
pub fn pick_closest(title: &str, artist: &str, duration: f64, cands: &[Cand]) -> Option<usize> {
    let mut best: Option<(usize, f64, bool)> = None;
    for (i, c) in cands.iter().enumerate() {
        if !c.has_any || rejected(title, &c.track) || !artist_ok(artist, &c.artist) { continue; }
        let diff = if duration > 0.0 { (c.duration - duration).abs() } else { 0.0 };
        if duration > 0.0 && diff > MAX_DUR_DIFF { continue; }
        let better = match best {
            None => true,
            Some((_, bd, bs)) => diff < bd - 1e-6 || ((diff - bd).abs() <= 1e-6 && c.has_synced && !bs),
        };
        if better { best = Some((i, diff, c.has_synced)); }
    }
    best.map(|b| b.0)
}

/// بصمة التخزين المؤقت: فنان+عنوان+مدة (مقرّبة للثانية).
pub fn fingerprint(artist: &str, title: &str, duration: f64) -> String {
    let key = format!("{}|{}|{}", norm(artist), norm(title), duration.round() as i64);
    let h = Sha256::digest(key.as_bytes());
    let hex: String = h.iter().take(12).map(|b| format!("{b:02x}")).collect();
    format!("{CACHE_PREFIX}{hex}")
}

// PURE-END

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or("").to_string()
}

fn cand_of(v: &Value) -> Cand {
    let synced = !s(v, "syncedLyrics").trim().is_empty();
    let plain = !s(v, "plainLyrics").trim().is_empty();
    let inst = v.get("instrumental").and_then(Value::as_bool).unwrap_or(false);
    Cand {
        track: s(v, "trackName"),
        artist: s(v, "artistName"),
        duration: v.get("duration").and_then(Value::as_f64).unwrap_or(0.0),
        has_synced: synced,
        has_any: synced || plain || inst,
    }
}

fn to_lyrics(v: &Value) -> Lyrics {
    let synced_src = s(v, "syncedLyrics");
    let lines = parse_lrc(&synced_src);
    if !lines.is_empty() {
        return Lyrics { found: true, synced: true, lines, ..Default::default() };
    }
    let plain = s(v, "plainLyrics");
    if !plain.trim().is_empty() {
        return Lyrics { found: true, plain: plain.trim().to_string(), ..Default::default() };
    }
    if v.get("instrumental").and_then(Value::as_bool).unwrap_or(false) {
        return Lyrics { found: true, instrumental: true, ..Default::default() };
    }
    Lyrics::default()
}

enum Net {
    Ok(Value),
    NotFound,
    Offline,
}

fn http_get(agent: &ureq::Agent, path: &str, query: &[(&str, &str)]) -> Net {
    let mut req = agent.get(&format!("{BASE}/{path}")).set("User-Agent", UA);
    for (k, v) in query { req = req.query(k, v); }
    match req.call() {
        Ok(r) => r.into_json::<Value>().map(Net::Ok).unwrap_or(Net::NotFound),
        Err(ureq::Error::Status(_, _)) => Net::NotFound,
        Err(ureq::Error::Transport(_)) => Net::Offline,
    }
}

/// يبحث على الشبكة: get(كامل) ← get(عنوان منظّف بلا ألبوم) ← search؛ يُرجع (النتيجة، offline).
fn fetch(artist: &str, title: &str, album: &str, duration: f64) -> Lyrics {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(5))
        .timeout(Duration::from_secs(8))
        .build();
    let dur = format!("{}", duration.round() as i64);
    let accept = |v: &Value| -> bool {
        let c = cand_of(v);
        c.has_any && !rejected(title, &c.track) && artist_ok(artist, &c.artist)
            && (duration <= 0.0 || (c.duration - duration).abs() <= MAX_DUR_DIFF)
    };
    let mut attempts: Vec<Vec<(&str, String)>> = Vec::new();
    let mut full = vec![("track_name", title.to_string()), ("artist_name", artist.to_string())];
    if !album.is_empty() { full.push(("album_name", album.to_string())); }
    if duration > 0.0 { full.push(("duration", dur.clone())); }
    attempts.push(full);
    let ct = clean_title(title);
    if ct != title || !album.is_empty() {
        let mut a = vec![("track_name", ct.clone()), ("artist_name", artist.to_string())];
        if duration > 0.0 { a.push(("duration", dur.clone())); }
        attempts.push(a);
    }
    for a in &attempts {
        let q: Vec<(&str, &str)> = a.iter().map(|(k, v)| (*k, v.as_str())).collect();
        match http_get(&agent, "get", &q) {
            Net::Ok(v) if accept(&v) => return to_lyrics(&v),
            Net::Offline => return Lyrics { offline: true, ..Default::default() },
            _ => {}
        }
    }
    let q = [("track_name", ct.as_str()), ("artist_name", artist)];
    match http_get(&agent, "search", &q) {
        Net::Ok(Value::Array(arr)) => {
            let cands: Vec<Cand> = arr.iter().map(cand_of).collect();
            match pick_closest(title, artist, duration, &cands) {
                Some(i) => to_lyrics(&arr[i]),
                None => Lyrics::default(),
            }
        }
        Net::Offline => Lyrics { offline: true, ..Default::default() },
        _ => Lyrics::default(),
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn cache_get(st: &AppState, key: &str) -> Option<Lyrics> {
    let guard = st.db.lock().unwrap();
    let conn = guard.as_ref()?;
    let raw: String = conn.query_row("SELECT value FROM kv WHERE key=?1", [key], |r| r.get(0)).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    let l: Lyrics = serde_json::from_value(v.get("v")?.clone()).ok()?;
    let ts = v.get("ts").and_then(Value::as_i64).unwrap_or(0);
    if !l.found && now_secs() - ts > MISS_TTL_SECS { return None; }
    Some(l)
}

fn cache_put(st: &AppState, key: &str, l: &Lyrics) {
    if let Some(conn) = st.db.lock().unwrap().as_ref() {
        let val = serde_json::json!({ "v": l, "ts": now_secs() }).to_string();
        let _ = conn.execute(
            "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, val),
        );
    }
}

/// كلمات الأغنية الحالية. لا يرمي خطأ لغياب الشبكة: يرجع Lyrics{offline:true}.
#[tauri::command]
pub async fn lyrics_get(app: AppHandle, artist: String, title: String, album: Option<String>, duration: f64) -> Result<Lyrics, String> {
    if title.trim().is_empty() { return Ok(Lyrics::default()); }
    let album = album.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<AppState>();
        let key = fingerprint(&artist, &title, duration);
        if let Some(hit) = cache_get(&st, &key) { return hit; }
        let res = fetch(artist.trim(), title.trim(), album.trim(), duration);
        if !res.offline { cache_put(&st, &key, &res); }
        res
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lrc_basic_and_multi_stamps() {
        let l = parse_lrc("[ar:X]\n[00:12.50]hello\n[00:05.00][01:00.25]chorus\n[bad]x\n[00:30]\n");
        assert_eq!(l.len(), 4);
        assert_eq!(l[0], LyricLine { t: 5.0, text: "chorus".into() });
        assert_eq!(l[1].t, 12.5);
        assert_eq!(l[2], LyricLine { t: 30.0, text: "".into() });
        assert_eq!(l[3].t, 60.25);
    }

    #[test]
    fn reject_variants() {
        assert!(rejected("Song", "Song (Sped Up)"));
        assert!(rejected("Song", "Song - Live at X"));
        assert!(rejected("Song", "Song (Karaoke Version)"));
        assert!(rejected("Song", "Song (DJ Remix)"));
        assert!(!rejected("Song", "Song"));
        assert!(!rejected("Song (Live)", "Song - Live"));
        assert!(!rejected("Alive", "Alive")); // "live" داخل كلمة لا يُحتسب
        assert!(!rejected("Live Forever", "Live Forever"));
    }

    #[test]
    fn closest_duration_wins_and_prefers_synced() {
        let c = |t: &str, d: f64, syn: bool| Cand { track: t.into(), artist: "A".into(), duration: d, has_synced: syn, has_any: true };
        let v = vec![c("S (Remix)", 200.0, true), c("S", 207.0, true), c("S", 201.0, false), c("S", 201.0, true)];
        assert_eq!(pick_closest("S", "A", 200.0, &v), Some(3));
        assert_eq!(pick_closest("S", "A", 100.0, &v), None); // كلها خارج النافذة
        assert_eq!(pick_closest("S", "Other", 200.0, &v), None);
    }

    #[test]
    fn fingerprint_stable() {
        let a = fingerprint("The Artist", "Song!", 200.4);
        assert_eq!(a, fingerprint("the artist", "song", 199.6));
        assert_ne!(a, fingerprint("the artist", "song", 230.0));
        assert!(a.starts_with("lyrics:"));
    }

    #[test]
    fn clean() {
        assert_eq!(clean_title("Song - Remastered 2011"), "Song");
        assert_eq!(clean_title("Song (feat. X)"), "Song");
    }
}
