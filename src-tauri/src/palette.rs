// palette: اختصار شريط الأوامر + الأخيرة + تنفيذ/فتح (حسب المخطط §7/files-palette).
// الواجهة (Pill) تملك الطبقة؛ هذه الوحدة تفتح/تبدّل عبر الحدث palette:open وتنفّذ run_shell/open_path.
use serde::{Deserialize, Serialize};
use std::{str::FromStr, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::{state::AppState, win};

/// مفتاح kv للأخيرة — لا يُحمَّل ضمن الإعدادات (انظر state::init_db).
pub const RECENT_KEY: &str = "palette:recent";
const RECENT_MAX: usize = 40;

#[derive(Default)]
pub struct PaletteState {
    shortcut: Mutex<Option<Shortcut>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Recent {
    pub path: String,
    pub name: String,
    pub count: u32,
    pub last: i64,
}

// ───────────────────────── الاختصار ─────────────────────────

/// يقرأ hotkeyPalette (فارغ/غير صالح = معطّل) ويسجّله بدل القديم.
pub fn rebind(app: &AppHandle) {
    let want = app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .get("hotkeyPalette")
        .and_then(|v| v.as_str().map(|s| s.trim().to_string()))
        .unwrap_or_default();
    let st = app.state::<PaletteState>();
    let gs = app.global_shortcut();
    let mut cur = st.shortcut.lock().unwrap();
    if let Some(old) = cur.take() {
        let _ = gs.unregister(old);
    }
    if want.is_empty() {
        return;
    }
    match Shortcut::from_str(&want) {
        Ok(sc) => match gs.register(sc) {
            Ok(()) => *cur = Some(sc),
            Err(e) => eprintln!("تعذّر تسجيل اختصار شريط الأوامر «{want}»: {e}"),
        },
        Err(e) => eprintln!("اختصار شريط الأوامر غير صالح «{want}»: {e}"),
    }
}

pub fn is_palette(app: &AppHandle, sc: &Shortcut) -> bool {
    app.state::<PaletteState>().shortcut.lock().unwrap().as_ref() == Some(sc)
}

/// يفتح الشريط (أو يُغلقه إن كان مفتوحًا — القرار في الواجهة): يُظهر الحبة إن كانت مخفية ويرسل palette:open.
pub fn open(app: &AppHandle) {
    let was_hidden = *app.state::<AppState>().hidden.lock().unwrap();
    if was_hidden {
        win::set_hidden(app, false);
    }
    let _ = app.emit_to(win::MAIN, "palette:open", serde_json::json!({ "wasHidden": was_hidden }));
}

// ───────────────────────── الأخيرة ─────────────────────────

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// منطق خالص: يسجّل استعمالًا ويعيد القائمة مرتبة بالأحدث، مقصوصة.
pub fn bump(mut list: Vec<Recent>, path: &str, name: &str, at: i64) -> Vec<Recent> {
    let key = path.to_lowercase();
    if let Some(r) = list.iter_mut().find(|r| r.path.to_lowercase() == key) {
        r.count += 1;
        r.last = at;
        r.name = name.to_string();
    } else {
        list.push(Recent { path: path.to_string(), name: name.to_string(), count: 1, last: at });
    }
    list.sort_by(|a, b| b.last.cmp(&a.last));
    list.truncate(RECENT_MAX);
    list
}

fn load_recent(app: &AppHandle) -> Vec<Recent> {
    let st = app.state::<AppState>();
    let g = st.db.lock().unwrap();
    let Some(conn) = g.as_ref() else { return vec![] };
    conn.query_row("SELECT value FROM kv WHERE key=?1", [RECENT_KEY], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_recent(app: &AppHandle, list: &[Recent]) {
    let st = app.state::<AppState>();
    let g = st.db.lock().unwrap();
    if let Some(conn) = g.as_ref() {
        let _ = conn.execute(
            "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (RECENT_KEY, serde_json::to_string(list).unwrap_or_else(|_| "[]".into())),
        );
    }
}

/// الأخيرة/الأكثر استخدامًا (محلية في kv)، الأحدث أولًا.
#[tauri::command]
pub fn palette_recent(app: AppHandle) -> Vec<Recent> {
    load_recent(&app)
}

// ───────────────────────── التنفيذ ─────────────────────────

/// (برنامج، وسيطات) لتنفيذ أمر شل: `ps …`/`powershell …` ⇒ PowerShell، وغير ذلك cmd؛ النافذة تبقى مفتوحة لعرض الناتج.
pub fn shell_invocation(cmd: &str) -> (String, String) {
    let c = cmd.trim();
    let lower = c.to_lowercase();
    for p in ["powershell ", "pwsh ", "ps "] {
        if lower.starts_with(p) {
            return ("powershell.exe".into(), format!("-NoExit -Command {}", &c[p.len()..]));
        }
    }
    ("cmd.exe".into(), format!("/k {c}"))
}

/// وسيطات explorer لإظهار مسار في مجلده (مجلد ⇒ يُفتح مباشرة).
pub fn folder_args(path: &str, is_dir: bool) -> String {
    if is_dir { format!("\"{path}\"") } else { format!("/select,\"{path}\"") }
}

/// الأهداف المسموحة لـ open: مسارات، shell:، ms-settings:، http(s)/mailto. (أمر النظام الحر يمر عبر mode="shell" فقط.)
pub fn open_target_ok(t: &str) -> bool {
    let t = t.trim();
    !t.is_empty() && !t.contains('\0') && !t.contains('\n')
}

#[cfg(windows)]
fn shell_execute(verb: &str, file: &str, params: Option<&str>) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let w = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    let (v, f) = (w(verb), w(file));
    let p = params.map(w);
    let r = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(v.as_ptr()),
            PCWSTR(f.as_ptr()),
            p.as_ref().map_or(PCWSTR::null(), |p| PCWSTR(p.as_ptr())),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if (r.0 as isize) > 32 { Ok(()) } else { Err(format!("ShellExecute فشل ({})", r.0 as isize)) }
}
#[cfg(not(windows))]
fn shell_execute(_verb: &str, _file: &str, _params: Option<&str>) -> Result<(), String> {
    Err("التنفيذ متاح على ويندوز فقط".into())
}

/// ينفّذ طلبًا من الشريط. mode: "open" (افتراضي: تطبيق/ملف/مسار/رابط) · "folder" (إظهار في مجلده)
/// · "admin" (تشغيل كمسؤول) · "shell" (أمر cmd/PowerShell) · "admin-shell" (الأمر كمسؤول). يمرّر الفوكس للهدف (لا يعيده للنافذة السابقة).
/// إن مُرّر name يُسجَّل الاستعمال في الأخيرة (للتطبيقات والملفات).
#[tauri::command]
pub fn run_shell(app: AppHandle, target: String, mode: Option<String>, name: Option<String>) -> Result<(), String> {
    if !open_target_ok(&target) {
        return Err("هدف فارغ".into());
    }
    win::drop_focus(&app); // الحبة تعود NOACTIVATE دون سحب الفوكس من الهدف الجديد
    let mode = mode.unwrap_or_else(|| "open".into());
    let is_dir = std::path::Path::new(&target).is_dir();
    let res = match mode.as_str() {
        "open" => shell_execute("open", target.trim(), None),
        "admin" => shell_execute("runas", target.trim(), None),
        "folder" => shell_execute("open", "explorer.exe", Some(&folder_args(target.trim(), is_dir))),
        "shell" | "admin-shell" => {
            let (exe, args) = shell_invocation(&target);
            shell_execute(if mode == "admin-shell" { "runas" } else { "open" }, &exe, Some(&args))
        }
        other => Err(format!("mode غير معروف: {other}")),
    };
    if res.is_ok() && matches!(mode.as_str(), "open" | "admin") {
        if let Some(n) = name.filter(|n| !n.is_empty()) {
            let list = bump(load_recent(&app), target.trim(), &n, now_ms());
            save_recent(&app, &list);
        }
    }
    res
}

/// يفتح مسارًا/رابطًا بالتطبيق الافتراضي (نفس open في run_shell، بلا تسجيل في الأخيرة).
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    run_shell(app, path, Some("open".into()), None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bump_counts_dedupes_and_orders() {
        let l = bump(vec![], "C:/A.lnk", "A", 10);
        let l = bump(l, "C:/B.lnk", "B", 20);
        let l = bump(l, "c:/a.lnk", "A", 30); // نفس المسار بحالة أحرف مختلفة
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].name, "A");
        assert_eq!(l[0].count, 2);
        assert_eq!(l[1].name, "B");
    }

    #[test]
    fn bump_truncates() {
        let mut l = vec![];
        for i in 0..(RECENT_MAX + 5) {
            l = bump(l, &format!("p{i}"), "x", i as i64);
        }
        assert_eq!(l.len(), RECENT_MAX);
        assert_eq!(l[0].path, format!("p{}", RECENT_MAX + 4)); // الأحدث أولًا
    }

    #[test]
    fn shell_invocation_picks_shell() {
        assert_eq!(shell_invocation("dir /b"), ("cmd.exe".into(), "/k dir /b".into()));
        assert_eq!(shell_invocation("ps Get-Date"), ("powershell.exe".into(), "-NoExit -Command Get-Date".into()));
        assert_eq!(shell_invocation("PowerShell ls").0, "powershell.exe");
    }

    #[test]
    fn folder_args_selects_files_only() {
        assert_eq!(folder_args("C:\\x\\a.txt", false), "/select,\"C:\\x\\a.txt\"");
        assert_eq!(folder_args("C:\\x", true), "\"C:\\x\"");
        assert!(!open_target_ok("  "));
        assert!(open_target_ok("shell:Downloads"));
    }
}
