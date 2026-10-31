// color: منتقي الألوان (حسب المخطط §7/capture) — الجلسة 3.3.
// التدفق: hotkeyColor/color_pick() ⇒ نفس لقطة الشاشة المجمّدة لطبقة overlay بغرض "color"
// (عدسة مكبّرة في الواجهة) ⇒ النقر يستدعي color_pick(x,y) فيُقرأ البكسل من اللقطة المحفوظة هنا
// (لا من الواجهة) ⇒ يُحفظ في السجل (kv) ويُنسخ HEX للحافظة.
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::Shortcut;

use crate::state::AppState;

/// مفتاح kv لسجل الألوان — ليس إعدادًا (انظر state::init_db).
pub const HISTORY_KEY: &str = "color:history";
const MAX: usize = 30;

// ───────────────────────── منطق خالص (يُختبر منفصلًا) ─────────────────────────
// BEGIN PURE
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ColorEntry {
    pub hex: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub h: u16,
    pub s: u8,
    pub l: u8,
    /// وقت آخر نسخ (ms منذ epoch).
    pub at: u64,
}

/// RGB ⇒ HSL (H 0..359، S وL نسب مئوية صحيحة).
pub fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (u16, u8, u8) {
    let (rf, gf, bf) = (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0);
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let l = (max + min) / 2.0;
    let d = max - min;
    if d == 0.0 {
        return (0, 0, (l * 100.0).round() as u8);
    }
    let s = d / (1.0 - (2.0 * l - 1.0).abs());
    let h = if max == rf {
        ((gf - bf) / d).rem_euclid(6.0)
    } else if max == gf {
        (bf - rf) / d + 2.0
    } else {
        (rf - gf) / d + 4.0
    } * 60.0;
    ((h.round() as u16) % 360, (s * 100.0).round() as u8, (l * 100.0).round() as u8)
}

/// "#RGB" أو "#RRGGBB" (مع/بدون #) ⇒ (r,g,b).
pub fn parse_hex(s: &str) -> Option<(u8, u8, u8)> {
    let t = s.trim().trim_start_matches('#');
    let v = |a: &str| u8::from_str_radix(a, 16).ok();
    match t.len() {
        3 => {
            let d: Vec<u8> = t.chars().map(|c| v(&c.to_string()).map(|n| n * 17)).collect::<Option<_>>()?;
            Some((d[0], d[1], d[2]))
        }
        6 if t.is_ascii() => Some((v(&t[0..2])?, v(&t[2..4])?, v(&t[4..6])?)),
        _ => None,
    }
}

pub fn make_entry(r: u8, g: u8, b: u8, at: u64) -> ColorEntry {
    let (h, s, l) = rgb_to_hsl(r, g, b);
    ColorEntry { hex: format!("#{r:02X}{g:02X}{b:02X}"), r, g, b, h, s, l, at }
}

/// نص اللون بالصيغة المطلوبة: "hex" (الافتراضي) · "rgb" · "hsl".
pub fn format_color(e: &ColorEntry, fmt: &str) -> String {
    match fmt {
        "rgb" => format!("rgb({}, {}, {})", e.r, e.g, e.b),
        "hsl" => format!("hsl({}, {}%, {}%)", e.h, e.s, e.l),
        _ => e.hex.clone(),
    }
}

/// يضيف لونًا في رأس السجل (المكرّر بنفس HEX يُرفع للأعلى) ويقصّ على MAX.
pub fn push_history(mut list: Vec<ColorEntry>, e: ColorEntry, max: usize) -> Vec<ColorEntry> {
    list.retain(|x| x.hex != e.hex);
    list.insert(0, e);
    list.truncate(max);
    list
}

/// بكسل (x,y) من مصفوفة RGB بعرض w وارتفاع h؛ None خارج الحدود.
pub fn pixel_rgb(rgb: &[u8], w: u32, h: u32, x: i64, y: i64) -> Option<(u8, u8, u8)> {
    if x < 0 || y < 0 || x >= w as i64 || y >= h as i64 {
        return None;
    }
    let i = ((y as usize) * (w as usize) + x as usize) * 3;
    Some((*rgb.get(i)?, *rgb.get(i + 1)?, *rgb.get(i + 2)?))
}
// END PURE

// ───────────────────────── الحالة والاختصار ─────────────────────────

#[derive(Default)]
pub struct ColorState {
    shortcut: Mutex<Option<Shortcut>>,
}

/// يعيد تسجيل hotkeyColor (فارغ/غير صالح = معطّل).
pub fn rebind(app: &AppHandle) {
    let st = app.state::<ColorState>();
    crate::capture::bind(app, &st.shortcut, "hotkeyColor", None);
}

/// ينفّذ الاختصار إن كان للألوان؛ يعيد true إذا عالجه.
pub fn on_shortcut(app: &AppHandle, sc: &Shortcut) -> bool {
    let st = app.state::<ColorState>();
    let mine = st.shortcut.lock().unwrap().as_ref() == Some(sc);
    if mine {
        crate::capture::start(app, "color");
    }
    mine
}

// ───────────────────────── السجل (kv) ─────────────────────────

fn load(app: &AppHandle) -> Vec<ColorEntry> {
    let st = app.state::<AppState>();
    let g = st.db.lock().unwrap();
    let Some(conn) = g.as_ref() else { return vec![] };
    conn.query_row("SELECT value FROM kv WHERE key=?1", [HISTORY_KEY], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, list: &[ColorEntry]) {
    let st = app.state::<AppState>();
    let g = st.db.lock().unwrap();
    if let Some(conn) = g.as_ref() {
        let _ = conn.execute(
            "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (HISTORY_KEY, serde_json::to_string(list).unwrap_or_else(|_| "[]".into())),
        );
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(windows)]
fn copy_text(text: &str) {
    match arboard::Clipboard::new() {
        Ok(mut cb) => {
            if let Err(e) = cb.set_text(text.to_string()) {
                eprintln!("تعذّر نسخ اللون: {e}");
            }
        }
        Err(e) => eprintln!("تعذّر فتح الحافظة: {e}"),
    }
}
#[cfg(not(windows))]
fn copy_text(_text: &str) {}

/// يسجّل اللون في السجل وينسخه بالصيغة المطلوبة ويبث color:picked.
fn commit(app: &AppHandle, e: ColorEntry, fmt: &str) -> ColorEntry {
    let list = push_history(load(app), e.clone(), MAX);
    save(app, &list);
    copy_text(&format_color(&e, fmt));
    let _ = app.emit("color:picked", e.clone());
    e
}

// ───────────────────────── الأوامر ─────────────────────────

/// color_pick() بلا وسائط ⇒ يبدأ وضع المنتقي (طبقة + عدسة). color_pick(x,y) (من الطبقة، بالبكسلات
/// الفعلية نسبةً لزاوية الشاشة الملتقطة) ⇒ يقرأ البكسل من اللقطة المحفوظة ويسجّله وينسخ HEX.
#[tauri::command]
pub fn color_pick(app: AppHandle, x: Option<i64>, y: Option<i64>) -> Result<Option<ColorEntry>, String> {
    let (Some(x), Some(y)) = (x, y) else {
        crate::capture::start(&app, "color");
        return Ok(None);
    };
    let f = crate::capture::take_frame(&app, "color")?;
    let (r, g, b) = pixel_rgb(&f.rgb, f.w, f.h, x, y).ok_or("خارج حدود الشاشة")?;
    Ok(Some(commit(&app, make_entry(r, g, b, now_ms()), "hex")))
}

/// يضيف/يرفع لونًا في السجل وينسخه بصيغة `format` ("hex"|"rgb"|"hsl"، الافتراضي hex) — نسخ بنقرة.
#[tauri::command]
pub fn color_patch(app: AppHandle, hex: String, format: Option<String>) -> Result<ColorEntry, String> {
    let (r, g, b) = parse_hex(&hex).ok_or("لون غير صالح")?;
    Ok(commit(&app, make_entry(r, g, b, now_ms()), format.as_deref().unwrap_or("hex")))
}

/// آخر الألوان (≤30) الأحدث أولًا.
#[tauri::command]
pub fn color_history(app: AppHandle) -> Vec<ColorEntry> {
    load(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hsl_known_values() {
        assert_eq!(rgb_to_hsl(255, 0, 0), (0, 100, 50));
        assert_eq!(rgb_to_hsl(0, 255, 0), (120, 100, 50));
        assert_eq!(rgb_to_hsl(0, 0, 255), (240, 100, 50));
        assert_eq!(rgb_to_hsl(255, 255, 255), (0, 0, 100));
        assert_eq!(rgb_to_hsl(0, 0, 0), (0, 0, 0));
        assert_eq!(rgb_to_hsl(128, 128, 128), (0, 0, 50));
        assert_eq!(rgb_to_hsl(142, 162, 255), (229, 100, 78));
    }

    #[test]
    fn hex_roundtrip_and_formats() {
        assert_eq!(parse_hex("#8ea2ff"), Some((0x8e, 0xa2, 0xff)));
        assert_eq!(parse_hex("f0c"), Some((255, 0, 204)));
        assert_eq!(parse_hex("zzz"), None);
        assert_eq!(parse_hex("#12345"), None);
        let e = make_entry(142, 162, 255, 1);
        assert_eq!(e.hex, "#8EA2FF");
        assert_eq!(format_color(&e, "hex"), "#8EA2FF");
        assert_eq!(format_color(&e, "rgb"), "rgb(142, 162, 255)");
        assert_eq!(format_color(&e, "hsl"), "hsl(229, 100%, 78%)");
    }

    #[test]
    fn history_dedup_order_cap() {
        let a = make_entry(1, 2, 3, 1);
        let b = make_entry(4, 5, 6, 2);
        let l = push_history(push_history(vec![], a.clone(), 3), b.clone(), 3);
        assert_eq!(l[0].hex, b.hex);
        let l = push_history(l, make_entry(1, 2, 3, 9), 3);
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].hex, a.hex);
        assert_eq!(l[0].at, 9);
        let l = push_history(l, make_entry(7, 7, 7, 3), 2);
        assert_eq!(l.len(), 2);
    }

    #[test]
    fn pixel_lookup() {
        // 2×2: أحمر، أخضر / أزرق، أبيض
        let px = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255];
        assert_eq!(pixel_rgb(&px, 2, 2, 0, 0), Some((255, 0, 0)));
        assert_eq!(pixel_rgb(&px, 2, 2, 1, 0), Some((0, 255, 0)));
        assert_eq!(pixel_rgb(&px, 2, 2, 0, 1), Some((0, 0, 255)));
        assert_eq!(pixel_rgb(&px, 2, 2, 1, 1), Some((255, 255, 255)));
        assert_eq!(pixel_rgb(&px, 2, 2, 2, 0), None);
        assert_eq!(pixel_rgb(&px, 2, 2, -1, 0), None);
    }
}
