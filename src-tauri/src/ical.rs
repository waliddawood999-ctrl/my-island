// ical — محلّل ICS خالص (بلا شبكة/حالة): VEVENT + التكرار الأساسي RRULE + استخراج روابط الانضمام.
// يدعم: UTC (Z) · TZID بأسماء IANA أو أسماء ويندوز الشائعة أو إزاحة VTIMEZONE · توقيت عائم (محلي) ·
// FREQ=DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL/COUNT/UNTIL/BYDAY(+ترتيب مثل 2TU و-1FR)/BYMONTHDAY/BYMONTH ·
// EXDATE · RECURRENCE-ID (استثناء مفرد) · STATUS:CANCELLED. أحداث «طوال اليوم» تُهمل (ليست اجتماعات).
// لا يُكتب أي شيء على القرص ولا يُسجَّل أي محتوى.
use chrono::{Datelike, Duration, FixedOffset, Local, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc, Weekday};
use chrono_tz::Tz;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, PartialEq)]
pub enum Zone { Utc, Local, Iana(Tz), Fixed(i32) }

#[derive(Clone, Debug, PartialEq)]
pub struct Dt { pub naive: NaiveDateTime, pub zone: Zone, pub all_day: bool }
impl Dt {
    pub fn ms(&self) -> Option<i64> { to_ms(self.naive, &self.zone) }
}

fn resolve<T: TimeZone>(tz: T, n: NaiveDateTime) -> Option<i64> {
    match tz.from_local_datetime(&n) {
        LocalResult::Single(d) => Some(d.timestamp_millis()),
        LocalResult::Ambiguous(a, _) => Some(a.timestamp_millis()),
        // فجوة التوقيت الصيفي: أقرب لحظة صالحة بعدها.
        LocalResult::None => tz.from_local_datetime(&(n + Duration::hours(1))).earliest().map(|d| d.timestamp_millis()),
    }
}

pub fn to_ms(n: NaiveDateTime, z: &Zone) -> Option<i64> {
    match z {
        Zone::Utc => Some(n.and_utc().timestamp_millis()),
        Zone::Fixed(s) => FixedOffset::east_opt(*s)?.from_local_datetime(&n).single().map(|d| d.timestamp_millis()),
        Zone::Local => resolve(Local, n),
        Zone::Iana(tz) => resolve(*tz, n),
    }
}

// ---------- خطوط وخصائص ----------

pub fn unfold(s: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for raw in s.split('\n') {
        let line = raw.trim_end_matches('\r');
        if (line.starts_with(' ') || line.starts_with('\t')) && !out.is_empty() {
            out.last_mut().unwrap().push_str(&line[1..]);
        } else if !line.is_empty() {
            out.push(line.to_string());
        }
    }
    out
}

#[derive(Debug, Clone)]
pub struct Prop { pub name: String, pub params: Vec<(String, String)>, pub value: String }
impl Prop {
    fn param(&self, k: &str) -> Option<&str> { self.params.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str()) }
}

pub fn parse_prop(line: &str) -> Option<Prop> {
    let mut inq = false;
    let mut colon = None;
    for (i, c) in line.char_indices() {
        match c {
            '"' => inq = !inq,
            ':' if !inq => { colon = Some(i); break; }
            _ => {}
        }
    }
    let c = colon?;
    let (head, value) = (&line[..c], &line[c + 1..]);
    let (mut parts, mut cur, mut q) = (Vec::new(), String::new(), false);
    for ch in head.chars() {
        match ch {
            '"' => q = !q,
            ';' if !q => parts.push(std::mem::take(&mut cur)),
            _ => cur.push(ch),
        }
    }
    parts.push(cur);
    let name = parts.remove(0).to_ascii_uppercase();
    let params = parts
        .into_iter()
        .filter_map(|p| p.split_once('=').map(|(k, v)| (k.to_ascii_uppercase(), v.to_string())))
        .collect();
    Some(Prop { name, params, value: value.to_string() })
}

pub fn unescape(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    let mut it = s.chars();
    while let Some(c) = it.next() {
        if c == '\\' {
            match it.next() {
                Some('n') | Some('N') => o.push('\n'),
                Some(x) => o.push(x),
                None => {}
            }
        } else {
            o.push(c);
        }
    }
    o
}

// ---------- المناطق الزمنية ----------

fn windows_zone(name: &str) -> Option<&'static str> {
    Some(match name {
        "UTC" | "Coordinated Universal Time" => "UTC",
        "GMT Standard Time" => "Europe/London",
        "W. Europe Standard Time" => "Europe/Berlin",
        "Central Europe Standard Time" => "Europe/Budapest",
        "Romance Standard Time" => "Europe/Paris",
        "Central European Standard Time" => "Europe/Warsaw",
        "E. Europe Standard Time" => "Europe/Chisinau",
        "FLE Standard Time" => "Europe/Kiev",
        "GTB Standard Time" => "Europe/Bucharest",
        "Turkey Standard Time" => "Europe/Istanbul",
        "Russian Standard Time" => "Europe/Moscow",
        "Egypt Standard Time" => "Africa/Cairo",
        "South Africa Standard Time" => "Africa/Johannesburg",
        "Arab Standard Time" => "Asia/Riyadh",
        "Arabic Standard Time" => "Asia/Baghdad",
        "Arabian Standard Time" => "Asia/Dubai",
        "Jordan Standard Time" => "Asia/Amman",
        "Middle East Standard Time" => "Asia/Beirut",
        "Israel Standard Time" => "Asia/Jerusalem",
        "Iran Standard Time" => "Asia/Tehran",
        "Pakistan Standard Time" => "Asia/Karachi",
        "India Standard Time" => "Asia/Kolkata",
        "China Standard Time" => "Asia/Shanghai",
        "Singapore Standard Time" => "Asia/Singapore",
        "Tokyo Standard Time" => "Asia/Tokyo",
        "Korea Standard Time" => "Asia/Seoul",
        "AUS Eastern Standard Time" => "Australia/Sydney",
        "New Zealand Standard Time" => "Pacific/Auckland",
        "Eastern Standard Time" => "America/New_York",
        "Central Standard Time" => "America/Chicago",
        "Mountain Standard Time" => "America/Denver",
        "Pacific Standard Time" => "America/Los_Angeles",
        "US Mountain Standard Time" => "America/Phoenix",
        "Alaskan Standard Time" => "America/Anchorage",
        "Hawaiian Standard Time" => "Pacific/Honolulu",
        "Atlantic Standard Time" => "America/Halifax",
        "E. South America Standard Time" => "America/Sao_Paulo",
        "SA Pacific Standard Time" => "America/Bogota",
        _ => return None,
    })
}

fn zone_from(tzid: &str, vtz: &HashMap<String, i32>, default: &Zone) -> Zone {
    let t = tzid.trim_matches('"');
    if t.eq_ignore_ascii_case("UTC") || t == "Z" { return Zone::Utc; }
    if let Ok(z) = t.parse::<Tz>() { return Zone::Iana(z); }
    if let Some(z) = windows_zone(t).and_then(|n| n.parse::<Tz>().ok()) { return Zone::Iana(z); }
    if let Some(s) = vtz.get(t) { return Zone::Fixed(*s); }
    default.clone()
}

/// "+0200" / "-0530" / "+020000" ⇒ ثوانٍ شرقية.
fn parse_offset(s: &str) -> Option<i32> {
    let s = s.trim();
    let (sign, rest) = match s.chars().next()? { '+' => (1, &s[1..]), '-' => (-1, &s[1..]), _ => return None };
    if rest.len() < 4 || !rest.chars().all(|c| c.is_ascii_digit()) { return None; }
    let h: i32 = rest[0..2].parse().ok()?;
    let m: i32 = rest[2..4].parse().ok()?;
    let sec: i32 = if rest.len() >= 6 { rest[4..6].parse().ok()? } else { 0 };
    Some(sign * (h * 3600 + m * 60 + sec))
}

pub fn parse_dt_str(v: &str, tzid: Option<&str>, vtz: &HashMap<String, i32>, default: &Zone) -> Option<Dt> {
    let v = v.trim();
    if v.len() == 8 && v.chars().all(|c| c.is_ascii_digit()) {
        let d = NaiveDate::parse_from_str(v, "%Y%m%d").ok()?;
        return Some(Dt { naive: d.and_time(NaiveTime::MIN), zone: default.clone(), all_day: true });
    }
    let utc = v.ends_with('Z');
    let naive = NaiveDateTime::parse_from_str(v.trim_end_matches('Z'), "%Y%m%dT%H%M%S").ok()?;
    let zone = if utc { Zone::Utc } else if let Some(t) = tzid { zone_from(t, vtz, default) } else { default.clone() };
    Some(Dt { naive, zone, all_day: false })
}

/// مدة ISO8601: P1W · P1D · PT1H30M · PT45M …
pub fn parse_duration(s: &str) -> Option<Duration> {
    let s = s.trim();
    let (neg, s) = match s.strip_prefix('-') { Some(r) => (true, r), None => (false, s.strip_prefix('+').unwrap_or(s)) };
    let s = s.strip_prefix('P')?;
    let (mut total, mut num, mut in_time) = (0i64, String::new(), false);
    for c in s.chars() {
        match c {
            'T' => in_time = true,
            '0'..='9' => num.push(c),
            'W' | 'D' | 'H' | 'M' | 'S' => {
                let n: i64 = num.parse().ok()?;
                num.clear();
                total += match (c, in_time) {
                    ('W', _) => n * 604_800,
                    ('D', _) => n * 86_400,
                    ('H', true) => n * 3600,
                    ('M', true) => n * 60,
                    ('S', true) => n,
                    _ => return None,
                };
            }
            _ => return None,
        }
    }
    Some(Duration::seconds(if neg { -total } else { total }))
}

// ---------- RRULE ----------

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Freq { Daily, Weekly, Monthly, Yearly }

#[derive(Clone, Debug, PartialEq)]
pub struct Rule {
    pub freq: Freq,
    pub interval: u32,
    pub count: Option<u32>,
    /// (التاريخ/الوقت، UTC؟، تاريخ فقط؟)
    pub until: Option<(NaiveDateTime, bool, bool)>,
    pub by_day: Vec<(Option<i32>, Weekday)>,
    pub by_month_day: Vec<i32>,
    pub by_month: Vec<u32>,
}

fn weekday_of(s: &str) -> Option<Weekday> {
    Some(match s {
        "MO" => Weekday::Mon, "TU" => Weekday::Tue, "WE" => Weekday::Wed, "TH" => Weekday::Thu,
        "FR" => Weekday::Fri, "SA" => Weekday::Sat, "SU" => Weekday::Sun,
        _ => return None,
    })
}

pub fn parse_rrule(s: &str) -> Option<Rule> {
    let mut r = Rule { freq: Freq::Daily, interval: 1, count: None, until: None, by_day: vec![], by_month_day: vec![], by_month: vec![] };
    let mut have_freq = false;
    for part in s.split(';') {
        let (k, v) = part.split_once('=')?;
        match k.to_ascii_uppercase().as_str() {
            "FREQ" => {
                r.freq = match v.to_ascii_uppercase().as_str() {
                    "DAILY" => Freq::Daily, "WEEKLY" => Freq::Weekly, "MONTHLY" => Freq::Monthly, "YEARLY" => Freq::Yearly,
                    _ => return None, // HOURLY/MINUTELY… غير مدعومة ⇒ يُعامل الحدث كمفرد
                };
                have_freq = true;
            }
            "INTERVAL" => r.interval = v.parse::<u32>().ok()?.max(1),
            "COUNT" => r.count = Some(v.parse().ok()?),
            "UNTIL" => {
                let t = v.trim();
                r.until = if t.len() == 8 {
                    Some((NaiveDate::parse_from_str(t, "%Y%m%d").ok()?.and_hms_opt(23, 59, 59)?, false, true))
                } else {
                    Some((NaiveDateTime::parse_from_str(t.trim_end_matches('Z'), "%Y%m%dT%H%M%S").ok()?, t.ends_with('Z'), false))
                };
            }
            "BYDAY" => {
                for d in v.split(',') {
                    let d = d.trim();
                    if d.len() < 2 { return None; }
                    let (pre, wd) = d.split_at(d.len() - 2);
                    let ord = if pre.is_empty() { None } else { Some(pre.trim_start_matches('+').parse::<i32>().ok()?) };
                    r.by_day.push((ord, weekday_of(&wd.to_ascii_uppercase())?));
                }
            }
            "BYMONTHDAY" => r.by_month_day = v.split(',').filter_map(|x| x.trim().parse().ok()).collect(),
            "BYMONTH" => r.by_month = v.split(',').filter_map(|x| x.trim().parse().ok()).collect(),
            _ => {} // WKST/BYSETPOS/BYHOUR…: تُتجاهل
        }
    }
    if have_freq { Some(r) } else { None }
}

fn days_in_month(y: i32, m: u32) -> u32 {
    let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    (NaiveDate::from_ymd_opt(ny, nm, 1).unwrap() - NaiveDate::from_ymd_opt(y, m, 1).unwrap()).num_days() as u32
}

fn day_matches_by(r: &Rule, d: NaiveDate) -> bool {
    let dim = days_in_month(d.year(), d.month());
    r.by_day.iter().any(|(ord, wd)| {
        *wd == d.weekday()
            && match ord {
                None => true,
                Some(n) if *n > 0 => ((d.day() - 1) / 7 + 1) as i32 == *n,
                Some(n) => ((dim - d.day()) / 7 + 1) as i32 == -*n,
            }
    })
}

/// هل التاريخ `d` من نتائج القاعدة (بعد بداية السلسلة `s`)؟
fn rule_matches(r: &Rule, s: NaiveDate, d: NaiveDate) -> bool {
    if d < s { return false; }
    if !r.by_month.is_empty() && !r.by_month.contains(&d.month()) { return false; }
    let dim = days_in_month(d.year(), d.month()) as i32;
    let md_ok = |r: &Rule| r.by_month_day.iter().any(|x| *x == d.day() as i32 || *x == d.day() as i32 - dim - 1);
    match r.freq {
        Freq::Daily => {
            (d - s).num_days() % r.interval as i64 == 0 && (r.by_day.is_empty() || day_matches_by(r, d))
        }
        Freq::Weekly => {
            let mon = |x: NaiveDate| x - Duration::days(x.weekday().num_days_from_monday() as i64);
            let weeks = (mon(d) - mon(s)).num_days() / 7;
            weeks % r.interval as i64 == 0
                && if r.by_day.is_empty() { d.weekday() == s.weekday() } else { r.by_day.iter().any(|(_, w)| *w == d.weekday()) }
        }
        Freq::Monthly => {
            let months = (d.year() - s.year()) as i64 * 12 + d.month() as i64 - s.month() as i64;
            months % r.interval as i64 == 0
                && if !r.by_month_day.is_empty() { md_ok(r) } else if !r.by_day.is_empty() { day_matches_by(r, d) } else { d.day() == s.day() }
        }
        Freq::Yearly => {
            let years = (d.year() - s.year()) as i64;
            let month_ok = if r.by_month.is_empty() { d.month() == s.month() } else { true };
            years % r.interval as i64 == 0
                && month_ok
                && if !r.by_month_day.is_empty() { md_ok(r) } else if !r.by_day.is_empty() { day_matches_by(r, d) } else { d.day() == s.day() }
        }
    }
}

// ---------- الأحداث ----------

#[derive(Clone, Debug)]
pub struct Event {
    pub uid: String,
    pub summary: String,
    pub start: Dt,
    pub end: Option<Dt>,
    pub duration: Option<Duration>,
    pub rule: Option<Rule>,
    pub exdates: Vec<i64>,
    pub recurrence_id: Option<i64>,
    pub cancelled: bool,
    pub location: String,
    /// نصوص قد تحوي رابط اجتماع: LOCATION/DESCRIPTION/URL/CONFERENCE/…
    pub texts: Vec<String>,
}

#[derive(Default, Debug)]
pub struct Calendar { pub events: Vec<Event> }

fn parse_offset_map(lines: &[String]) -> (HashMap<String, i32>, Option<String>) {
    let mut map = HashMap::new();
    let (mut in_tz, mut sub): (bool, Option<String>) = (false, None);
    let mut cur_id: Option<String> = None;
    let mut wr: Option<String> = None;
    for l in lines {
        let Some(p) = parse_prop(l) else { continue };
        match (p.name.as_str(), p.value.as_str()) {
            ("BEGIN", "VTIMEZONE") => { in_tz = true; cur_id = None; }
            ("END", "VTIMEZONE") => { in_tz = false; sub = None; }
            ("BEGIN", s @ ("STANDARD" | "DAYLIGHT")) if in_tz => sub = Some(s.to_string()),
            ("END", "STANDARD" | "DAYLIGHT") if in_tz => sub = None,
            ("TZID", v) if in_tz && sub.is_none() => cur_id = Some(v.trim_matches('"').to_string()),
            ("TZOFFSETTO", v) if in_tz => {
                if let (Some(id), Some(off)) = (&cur_id, parse_offset(v)) {
                    // STANDARD يتقدّم على DAYLIGHT؛ وإلا نأخذ أول قيمة.
                    if sub.as_deref() == Some("STANDARD") || !map.contains_key(id) { map.insert(id.clone(), off); }
                }
            }
            ("X-WR-TIMEZONE", v) => wr = Some(v.to_string()),
            _ => {}
        }
    }
    (map, wr)
}

fn build_event(props: &[Prop], vtz: &HashMap<String, i32>, default: &Zone) -> Option<Event> {
    let get = |n: &str| props.iter().find(|p| p.name == n);
    let dt = |p: &Prop| parse_dt_str(&p.value, p.param("TZID"), vtz, default);
    let start = dt(get("DTSTART")?)?;
    let end = get("DTEND").and_then(dt);
    let duration = get("DURATION").and_then(|p| parse_duration(&p.value));
    let rule = get("RRULE").and_then(|p| parse_rrule(&p.value));
    let start_time = start.naive.time();
    // EXDATE/RECURRENCE-ID بتاريخ فقط ⇒ وقت بداية الحدث في منطقته.
    let to_inst = |p: &Prop, v: &str| -> Option<i64> {
        let d = parse_dt_str(v, p.param("TZID"), vtz, default)?;
        if d.all_day { to_ms(d.naive.date().and_time(start_time), &start.zone) } else { d.ms() }
    };
    let mut exdates = Vec::new();
    for p in props.iter().filter(|p| p.name == "EXDATE") {
        for v in p.value.split(',') {
            if let Some(ms) = to_inst(p, v) { exdates.push(ms); }
        }
    }
    let recurrence_id = get("RECURRENCE-ID").and_then(|p| to_inst(p, &p.value));
    let text = |n: &str| get(n).map(|p| unescape(&p.value)).unwrap_or_default();
    let mut texts = vec![text("LOCATION"), text("DESCRIPTION"), text("URL"), text("X-ALT-DESC"), text("CONFERENCE")];
    for n in ["X-GOOGLE-CONFERENCE", "X-MICROSOFT-SKYPETEAMSMEETINGURL", "X-MICROSOFT-ONLINEMEETINGEXTERNALLINK"] { texts.push(text(n)); }
    Some(Event {
        uid: get("UID").map(|p| p.value.trim().to_string()).unwrap_or_default(),
        summary: text("SUMMARY").trim().to_string(),
        start,
        end,
        duration,
        rule,
        exdates,
        recurrence_id,
        cancelled: get("STATUS").map_or(false, |p| p.value.trim().eq_ignore_ascii_case("CANCELLED")),
        location: text("LOCATION").trim().to_string(),
        texts,
    })
}

pub fn parse_calendar(src: &str) -> Calendar {
    let lines = unfold(src);
    let (vtz, wr) = parse_offset_map(&lines);
    let default = wr.map(|n| zone_from(&n, &vtz, &Zone::Local)).unwrap_or(Zone::Local);
    let mut cal = Calendar::default();
    let mut cur: Option<Vec<Prop>> = None;
    let mut depth = 0u32; // مكوّنات متداخلة داخل VEVENT (VALARM…)
    for l in &lines {
        let Some(p) = parse_prop(l) else { continue };
        match (p.name.as_str(), cur.is_some()) {
            ("BEGIN", false) if p.value == "VEVENT" => { cur = Some(Vec::new()); depth = 0; }
            ("BEGIN", true) => depth += 1,
            ("END", true) if depth > 0 => depth -= 1,
            ("END", true) if p.value == "VEVENT" => {
                if let Some(ev) = build_event(cur.as_ref().unwrap(), &vtz, &default) { cal.events.push(ev); }
                cur = None;
            }
            (_, true) if depth == 0 => cur.as_mut().unwrap().push(p),
            _ => {}
        }
    }
    cal
}

// ---------- روابط الانضمام ----------

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Join { pub provider: &'static str, pub url: String }

fn provider_of_host(host: &str) -> Option<&'static str> {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    let is = |d: &str| h == d || h.ends_with(&format!(".{d}"));
    if is("zoom.us") || is("zoom.com") || is("zoomgov.com") { Some("zoom") }
    else if h == "meet.google.com" { Some("meet") }
    else if is("teams.microsoft.com") || is("teams.live.com") { Some("teams") }
    else if is("webex.com") { Some("webex") }
    else { None }
}

/// رابط https لمزوّد اجتماعات معروف فقط (يُفكّ غلاف Outlook SafeLinks).
pub fn join_of_url(raw: &str) -> Option<Join> {
    let u = url::Url::parse(raw.trim()).ok()?;
    if u.scheme() != "https" { return None; }
    let host = u.host_str()?.to_ascii_lowercase();
    if host.ends_with("safelinks.protection.outlook.com") {
        let inner = u.query_pairs().find(|(k, _)| k == "url")?.1.into_owned();
        let j = join_of_url(&inner)?;
        return Some(j);
    }
    provider_of_host(&host).map(|provider| Join { provider, url: u.to_string() })
}

pub fn find_join<S: AsRef<str>>(texts: &[S]) -> Option<Join> {
    for t in texts {
        let t = t.as_ref().replace("&amp;", "&");
        let mut rest = t.as_str();
        while let Some(i) = rest.find("https://") {
            let tail = &rest[i..];
            let end = tail.find(|c: char| c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'' | ')' | ']' | '\\')).unwrap_or(tail.len());
            let cand = tail[..end].trim_end_matches(|c: char| matches!(c, '.' | ',' | ';' | ':' | '!'));
            if let Some(j) = join_of_url(cand) { return Some(j); }
            rest = &tail[8.min(tail.len())..];
        }
    }
    None
}

// ---------- التوسيع ----------

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub location: String,
    pub join: Option<Join>,
    pub recurring: bool,
}

fn ev_duration_ms(ev: &Event) -> i64 {
    let ms = if let (Some(e), Some(s)) = (ev.end.as_ref().and_then(|e| e.ms()), ev.start.ms()) { e - s }
    else { ev.duration.map_or(0, |d| d.num_milliseconds()) };
    ms.max(0)
}

/// بدايات التكرار (ms) التي ينتهي عندها الحدث بعد `from` وتبدأ قبل `to`.
fn expand_rule(ev: &Event, r: &Rule, from: i64, to: i64, dur: i64) -> Vec<i64> {
    let zone = &ev.start.zone;
    let (s_date, t) = (ev.start.naive.date(), ev.start.naive.time());
    let Some(end_date) = Utc.timestamp_millis_opt(to).single().map(|d| d.date_naive() + Duration::days(1)) else { return vec![] };
    if (end_date - s_date).num_days() > 40_000 { return vec![]; }
    let until_ms = r.until.and_then(|(n, utc, _)| to_ms(n, if utc { &Zone::Utc } else { zone }));
    let (mut out, mut n, mut d) = (Vec::new(), 0u32, s_date);
    while d <= end_date {
        if rule_matches(r, s_date, d) {
            if let Some(ms) = to_ms(d.and_time(t), zone) {
                n += 1;
                if r.count.map_or(false, |c| n > c) { break; }
                if until_ms.map_or(false, |u| ms > u) { break; }
                if ms >= to { break; }
                if ms + dur > from || (dur == 0 && ms >= from) { out.push(ms); }
            }
        }
        d += Duration::days(1);
    }
    out
}

/// الاجتماعات التي لم تنتهِ بعد `from` وتبدأ قبل `to` مرتّبة بالبداية (حدّ أقصى `max`).
pub fn upcoming(cal: &Calendar, from: i64, to: i64, max: usize) -> Vec<Meeting> {
    let overridden: HashSet<(String, i64)> =
        cal.events.iter().filter_map(|e| e.recurrence_id.map(|r| (e.uid.clone(), r))).collect();
    let mut out: Vec<Meeting> = Vec::new();
    let mut seen: HashSet<(String, i64)> = HashSet::new();
    for ev in &cal.events {
        if ev.start.all_day || ev.cancelled { continue; }
        let Some(s0) = ev.start.ms() else { continue };
        let dur = ev_duration_ms(ev);
        let starts = match &ev.rule {
            Some(r) => expand_rule(ev, r, from, to, dur),
            None => vec![s0],
        };
        for s in starts {
            if ev.recurrence_id.is_none() && (ev.exdates.contains(&s) || overridden.contains(&(ev.uid.clone(), s))) { continue; }
            let e = s + dur;
            let ended = if dur > 0 { e <= from } else { s < from };
            if ended || s >= to { continue; }
            if !seen.insert((ev.uid.clone(), s)) { continue; }
            out.push(Meeting {
                id: format!("{}@{}", ev.uid, s),
                title: ev.summary.clone(),
                start: s,
                end: e,
                location: ev.location.clone(),
                join: find_join(&ev.texts),
                recurring: ev.rule.is_some() || ev.recurrence_id.is_some(),
            });
        }
    }
    out.sort_by_key(|m| m.start);
    out.truncate(max);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> i64 {
        NaiveDate::from_ymd_opt(y, mo, d).unwrap().and_hms_opt(h, mi, 0).unwrap().and_utc().timestamp_millis()
    }
    fn wrap(ev: &str) -> String { format!("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n{ev}END:VCALENDAR\r\n") }
    const DAY: i64 = 86_400_000;

    #[test]
    fn single_utc_event_and_fold() {
        let c = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20260310T090000Z\r\nDTEND:20260310T100000Z\r\nSUMMARY:Sprint\r\n  planning\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, ms(2026, 3, 10, 0, 0), ms(2026, 3, 20, 0, 0), 10);
        assert_eq!(u.len(), 1);
        assert_eq!(u[0].title, "Sprint planning");
        assert_eq!(u[0].start, ms(2026, 3, 10, 9, 0));
        assert_eq!(u[0].end, ms(2026, 3, 10, 10, 0));
        // انتهى ⇒ لا يظهر
        assert!(upcoming(&c, ms(2026, 3, 10, 10, 0), ms(2026, 3, 20, 0, 0), 10).is_empty());
        // جارٍ الآن ⇒ يظهر
        assert_eq!(upcoming(&c, ms(2026, 3, 10, 9, 30), ms(2026, 3, 20, 0, 0), 10).len(), 1);
    }

    #[test]
    fn tzid_iana_and_windows_names() {
        let c = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=Europe/Berlin:20260115T090000\r\nDTEND;TZID=Europe/Berlin:20260115T100000\r\nSUMMARY:x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:b\r\nDTSTART;TZID=Eastern Standard Time:20260115T090000\r\nDTEND;TZID=Eastern Standard Time:20260115T100000\r\nSUMMARY:y\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, ms(2026, 1, 1, 0, 0), ms(2026, 2, 1, 0, 0), 10);
        assert_eq!(u[0].start, ms(2026, 1, 15, 8, 0)); // برلين شتاءً UTC+1
        assert_eq!(u[1].start, ms(2026, 1, 15, 14, 0)); // نيويورك شتاءً UTC-5
    }

    #[test]
    fn vtimezone_fixed_offset_fallback() {
        let c = parse_calendar(&wrap("BEGIN:VTIMEZONE\r\nTZID:Custom Zone\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0300\r\nTZOFFSETTO:+0300\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:z\r\nDTSTART;TZID=Custom Zone:20260301T120000\r\nDTEND;TZID=Custom Zone:20260301T130000\r\nSUMMARY:z\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, 0, ms(2027, 1, 1, 0, 0), 10);
        assert_eq!(u[0].start, ms(2026, 3, 1, 9, 0));
    }

    #[test]
    fn daily_dst_keeps_local_wall_clock() {
        // يوميًا 09:00 برلين: قبل التحوّل (28/3/2026) UTC+1، بعده UTC+2.
        let c = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:d\r\nDTSTART;TZID=Europe/Berlin:20260325T090000\r\nDTEND;TZID=Europe/Berlin:20260325T093000\r\nRRULE:FREQ=DAILY;COUNT=6\r\nSUMMARY:daily\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, ms(2026, 3, 24, 0, 0), ms(2026, 4, 30, 0, 0), 20);
        assert_eq!(u.len(), 6);
        assert_eq!(u[0].start, ms(2026, 3, 25, 8, 0));
        assert_eq!(u[5].start, ms(2026, 3, 30, 7, 0));
    }

    #[test]
    fn weekly_byday_interval_count_until_exdate() {
        let c = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:w\r\nDTSTART:20260302T100000Z\r\nDTEND:20260302T110000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5\r\nEXDATE:20260304T100000Z\r\nSUMMARY:w\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, 0, ms(2027, 1, 1, 0, 0), 50);
        // 2/3 Mon, 4/3 Wed(مستثنى), 16/3 Mon, 18/3 Wed, 30/3 Mon  (COUNT=5 يشمل المستثنى)
        let days: Vec<i64> = u.iter().map(|m| (m.start - ms(2026, 3, 2, 10, 0)) / DAY).collect();
        assert_eq!(days, vec![0, 14, 16, 28]);
        let c2 = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:u\r\nDTSTART:20260302T100000Z\r\nDTEND:20260302T110000Z\r\nRRULE:FREQ=WEEKLY;UNTIL=20260316T100000Z\r\nSUMMARY:u\r\nEND:VEVENT\r\n"));
        assert_eq!(upcoming(&c2, 0, ms(2027, 1, 1, 0, 0), 50).len(), 3); // 2/3 و9/3 و16/3
    }

    #[test]
    fn monthly_ordinals_and_yearly() {
        let c = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:m\r\nDTSTART:20260113T100000Z\r\nDTEND:20260113T110000Z\r\nRRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3\r\nSUMMARY:m\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:l\r\nDTSTART:20260130T100000Z\r\nDTEND:20260130T110000Z\r\nRRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3\r\nSUMMARY:l\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:y\r\nDTSTART:20250605T100000Z\r\nDTEND:20250605T110000Z\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:y\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, ms(2026, 1, 1, 0, 0), ms(2026, 12, 31, 0, 0), 50);
        let by = |t: &str| u.iter().filter(|m| m.title == t).map(|m| m.start).collect::<Vec<_>>();
        assert_eq!(by("m"), vec![ms(2026, 1, 13, 10, 0), ms(2026, 2, 10, 10, 0), ms(2026, 3, 10, 10, 0)]);
        assert_eq!(by("l"), vec![ms(2026, 1, 30, 10, 0), ms(2026, 2, 27, 10, 0), ms(2026, 3, 27, 10, 0)]);
        assert_eq!(by("y"), vec![ms(2026, 6, 5, 10, 0)]);
    }

    #[test]
    fn override_cancelled_and_allday() {
        let c = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:r\r\nDTSTART:20260302T100000Z\r\nDTEND:20260302T110000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:orig\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:r\r\nRECURRENCE-ID:20260303T100000Z\r\nDTSTART:20260303T150000Z\r\nDTEND:20260303T160000Z\r\nSUMMARY:moved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:c\r\nDTSTART:20260302T120000Z\r\nDTEND:20260302T130000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:cancelled\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:ad\r\nDTSTART;VALUE=DATE:20260302\r\nSUMMARY:holiday\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, ms(2026, 3, 1, 0, 0), ms(2026, 3, 10, 0, 0), 50);
        let t: Vec<(&str, i64)> = u.iter().map(|m| (m.title.as_str(), m.start)).collect();
        assert_eq!(t, vec![("orig", ms(2026, 3, 2, 10, 0)), ("moved", ms(2026, 3, 3, 15, 0)), ("orig", ms(2026, 3, 4, 10, 0))]);
    }

    #[test]
    fn valarm_is_ignored_and_duration_used() {
        let c = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:v\r\nDTSTART:20260302T100000Z\r\nDURATION:PT1H30M\r\nSUMMARY:v\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nSUMMARY:alarm\r\nEND:VALARM\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, 0, ms(2027, 1, 1, 0, 0), 5);
        assert_eq!(u[0].title, "v");
        assert_eq!(u[0].end - u[0].start, 90 * 60_000);
    }

    #[test]
    fn rrule_parse_and_durations() {
        assert!(parse_rrule("FREQ=HOURLY").is_none());
        assert!(parse_rrule("COUNT=3").is_none());
        let r = parse_rrule("FREQ=MONTHLY;BYDAY=+2TU,-1FR;BYMONTHDAY=1,-1").unwrap();
        assert_eq!(r.by_day, vec![(Some(2), Weekday::Tue), (Some(-1), Weekday::Fri)]);
        assert_eq!(r.by_month_day, vec![1, -1]);
        assert_eq!(parse_duration("P1W").unwrap().num_days(), 7);
        assert_eq!(parse_duration("PT45M").unwrap().num_minutes(), 45);
        assert!(parse_duration("garbage").is_none());
    }

    #[test]
    fn join_links() {
        let z = "اجتماع\\nJoin: https://us02web.zoom.us/j/123456?pwd=abc.\\nthanks";
        assert_eq!(find_join(&[unescape(z)]).unwrap().provider, "zoom");
        assert_eq!(find_join(&["https://meet.google.com/abc-defg-hij"]).unwrap().provider, "meet");
        assert_eq!(find_join(&["<a href=\"https://teams.microsoft.com/l/meetup-join/19%3a…&amp;x=1\">j</a>"]).unwrap().provider, "teams");
        assert_eq!(find_join(&["https://acme.webex.com/meet/room"]).unwrap().provider, "webex");
        // SafeLinks
        let sl = "https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fus02web.zoom.us%2Fj%2F99&data=x";
        assert_eq!(find_join(&[sl]).unwrap().url, "https://us02web.zoom.us/j/99");
        // مرفوض: نطاق مزيّف/نص مجاور/ليس https
        assert!(find_join(&["https://zoom.us.evil.com/j/1"]).is_none());
        assert!(find_join(&["https://evilzoom.us/j/1"]).is_none());
        assert!(find_join(&["http://zoom.us/j/1"]).is_none());
        assert!(find_join(&["see https://example.com/zoom.us"]).is_none());
        assert!(join_of_url("javascript:alert(1)").is_none());
        // أول رابط غير مدعوم لا يمنع الثاني
        assert_eq!(find_join(&["https://example.com/x https://zoom.us/j/5"]).unwrap().provider, "zoom");
    }

    #[test]
    fn join_attached_to_meeting_and_sorted_capped() {
        let c = parse_calendar(&wrap("BEGIN:VEVENT\r\nUID:2\r\nDTSTART:20260302T120000Z\r\nDTEND:20260302T130000Z\r\nSUMMARY:second\r\nLOCATION:https://meet.google.com/aaa-bbbb-ccc\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20260302T100000Z\r\nDTEND:20260302T110000Z\r\nSUMMARY:first\r\nEND:VEVENT\r\n"));
        let u = upcoming(&c, ms(2026, 3, 1, 0, 0), ms(2026, 3, 9, 0, 0), 1);
        assert_eq!(u.len(), 1);
        assert_eq!(u[0].title, "first");
        assert!(u[0].join.is_none());
        let u2 = upcoming(&c, ms(2026, 3, 1, 0, 0), ms(2026, 3, 9, 0, 0), 5);
        assert_eq!(u2[1].join.as_ref().unwrap().provider, "meet");
    }
}
