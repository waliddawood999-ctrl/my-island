// rates — أسعار العملات الحية لشريط الأوامر (3.1): open.er-api.com (مجاني بلا مفتاح)، تُخزَّن 12 ساعة في kv
// بالمفتاح `rates:cache`. الجلب كسول: لا يحدث إلا حين تكتب تحويل عملة في الشريط (طلب صريح من المستخدم)
// ويُعطَّل كليًا بـ liveRates=false. غياب الشبكة ⇒ آخر نسخة مخزّنة (stale) وإلا null فتسقط الواجهة على المضمّنة.
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, time::Duration};
use tauri::{AppHandle, Manager};

pub const KV_KEY: &str = "rates:cache";
const TTL_MS: i64 = 12 * 3600 * 1000;
const URL: &str = "https://open.er-api.com/v6/latest/USD";
const UA: &str = "MyIsland/0.2 (https://github.com/waliddawood999-ctrl/my-island)";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Cached {
    /// وحدات العملة لكل 1 دولار (مفاتيح بحروف صغيرة)
    pub rates: BTreeMap<String, f64>,
    /// وقت الجلب (ms)
    pub fetched: i64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct RatesInfo {
    pub rates: BTreeMap<String, f64>,
    pub updated: i64,
    /// "cache" = ضمن 12 ساعة · "live" = جُلبت الآن · "stale" = فشل الجلب فاستُعملت نسخة أقدم
    pub source: &'static str,
}

// PURE-BEGIN
/// هل النسخة المخزّنة ما زالت صالحة؟
pub fn is_fresh(fetched: i64, now: i64) -> bool {
    fetched <= now && now - fetched < TTL_MS
}

/// يستخلص جدول الأسعار من استجابة open.er-api.com؛ يرفض الاستجابة الناقصة أو الفاسدة.
pub fn parse_response(v: &Value) -> Option<BTreeMap<String, f64>> {
    if v.get("result").and_then(Value::as_str) != Some("success") {
        return None;
    }
    let obj = v.get("rates")?.as_object()?;
    let mut out = BTreeMap::new();
    for (k, val) in obj {
        let Some(n) = val.as_f64() else { continue };
        if n.is_finite() && n > 0.0 && k.len() == 3 && k.chars().all(|c| c.is_ascii_alphabetic()) {
            out.insert(k.to_lowercase(), n);
        }
    }
    // سلامة: الدولار = 1 وعدد معقول من العملات
    (out.get("usd").copied() == Some(1.0) && out.len() >= 20).then_some(out)
}
// PURE-END

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn load(st: &AppState) -> Option<Cached> {
    let g = st.db.lock().unwrap();
    let conn = g.as_ref()?;
    conn.query_row("SELECT value FROM kv WHERE key=?1", [KV_KEY], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

fn save(st: &AppState, c: &Cached) {
    let g = st.db.lock().unwrap();
    if let Some(conn) = g.as_ref() {
        let _ = conn.execute(
            "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (KV_KEY, serde_json::to_string(c).unwrap_or_default()),
        );
    }
}

fn fetch() -> Option<BTreeMap<String, f64>> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(5))
        .timeout(Duration::from_secs(8))
        .build();
    let v: Value = agent.get(URL).set("User-Agent", UA).call().ok()?.into_json().ok()?;
    parse_response(&v)
}

/// الأسعار الحالية لكل 1 دولار. `liveRates=false` ⇒ null بلا أي طلب. null أيضًا إن لا شبكة ولا نسخة مخزّنة.
#[tauri::command]
pub async fn rates_get(app: AppHandle) -> Result<Option<RatesInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<AppState>();
        let on = st.settings.lock().unwrap().get("liveRates").and_then(Value::as_bool).unwrap_or(true);
        if !on {
            return None;
        }
        let now = now_ms();
        let cached = load(&st);
        if let Some(c) = cached.as_ref().filter(|c| is_fresh(c.fetched, now)) {
            return Some(RatesInfo { rates: c.rates.clone(), updated: c.fetched, source: "cache" });
        }
        match fetch() {
            Some(rates) => {
                save(&st, &Cached { rates: rates.clone(), fetched: now });
                Some(RatesInfo { rates, updated: now, source: "live" })
            }
            None => cached.map(|c| RatesInfo { rates: c.rates, updated: c.fetched, source: "stale" }),
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample(n: usize) -> Value {
        let mut r = serde_json::Map::new();
        r.insert("USD".into(), json!(1));
        r.insert("SAR".into(), json!(3.75));
        for i in 0..n { r.insert(format!("X{}{}", (b'A' + (i / 26) as u8) as char, (b'A' + (i % 26) as u8) as char), json!(1.5 + i as f64)); }
        json!({ "result": "success", "rates": r })
    }

    #[test]
    fn fresh_window_is_12h() {
        assert!(is_fresh(0, 12 * 3600 * 1000 - 1));
        assert!(!is_fresh(0, 12 * 3600 * 1000));
        assert!(!is_fresh(100, 50), "وقت مستقبلي غير صالح");
    }

    #[test]
    fn parses_valid_response_lowercased() {
        let m = parse_response(&sample(30)).unwrap();
        assert_eq!(m["usd"], 1.0);
        assert_eq!(m["sar"], 3.75);
        assert!(m.len() >= 30);
    }

    #[test]
    fn rejects_bad_responses() {
        assert!(parse_response(&json!({ "result": "error" })).is_none());
        assert!(parse_response(&sample(3)).is_none(), "عدد قليل");
        let mut bad = sample(30);
        bad["rates"]["USD"] = json!(2);
        assert!(parse_response(&bad).is_none(), "الدولار ≠ 1");
        let mut neg = sample(30);
        neg["rates"]["SAR"] = json!(-3);
        let m = parse_response(&neg).unwrap();
        assert!(!m.contains_key("sar"), "قيمة سالبة تُهمل");
    }

    #[test]
    fn cache_roundtrips_json() {
        let c = Cached { rates: [("usd".to_string(), 1.0)].into(), fetched: 5 };
        let s = serde_json::to_string(&c).unwrap();
        assert_eq!(serde_json::from_str::<Cached>(&s).unwrap(), c);
    }
}
