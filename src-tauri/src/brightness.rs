// brightness — سطوع شاشة الابتوب الداخلية عبر WMI (root/wmi: WmiMonitorBrightness[Methods]).
// متاح فقط على الأجهزة التي تعرض الصنف (ابتوب)؛ سطح المكتب/الشاشات الخارجية ⇒ available:false والواجهة تخفي المنزلق.
// يُنفَّذ عند الطلب فقط عبر powershell مخفي (لا خيط، لا استطلاع). الرقم مُقيَّد 0..100 قبل بنائه في الأمر.
// brightness_get() → {available, level 0..100} · brightness_set(level) → نفسه.
use serde::Serialize;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct Brightness {
    pub available: bool,
    pub level: u8,
}

/// يحلّل ناتج powershell (رقم وحيد) ⇒ None إن لم يكن 0..100.
pub fn parse_level(out: &str) -> Option<u8> {
    let v: u32 = out.trim().parse().ok()?;
    if v <= 100 { Some(v as u8) } else { None }
}

pub fn set_script(level: u8) -> String {
    format!(
        "Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods | \
         Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{{Timeout=[uint32]1;Brightness=[byte]{}}} | Out-Null",
        level.min(100)
    )
}

const GET_SCRIPT: &str =
    "(Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness";

#[cfg(windows)]
fn ps(script: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .ok()?;
    if !out.status.success() { return None; }
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}
#[cfg(not(windows))]
fn ps(_script: &str) -> Option<String> { None }

fn read() -> Brightness {
    match ps(GET_SCRIPT).and_then(|o| parse_level(&o)) {
        Some(level) => Brightness { available: true, level },
        None => Brightness::default(),
    }
}

#[tauri::command]
pub async fn brightness_get() -> Brightness { read() }

#[tauri::command]
pub async fn brightness_set(level: f64) -> Result<Brightness, String> {
    let l = if level.is_nan() { 0.0 } else { level.clamp(0.0, 100.0) }.round() as u8;
    ps(&set_script(l)).ok_or_else(|| "brightness unavailable".to_string())?;
    Ok(Brightness { available: true, level: l })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parse() {
        assert_eq!(parse_level("73\r\n"), Some(73));
        assert_eq!(parse_level(""), None);
        assert_eq!(parse_level("abc"), None);
        assert_eq!(parse_level("250"), None);
    }
    #[test]
    fn script() {
        assert!(set_script(40).contains("Brightness=[byte]40"));
        assert!(set_script(255).contains("Brightness=[byte]100"));
    }
}
