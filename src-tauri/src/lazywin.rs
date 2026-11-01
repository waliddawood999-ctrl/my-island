// lazywin — نافذتا الإعدادات والمحرّر تُنشآن عند أول طلب فعلي فقط (لا عند الإقلاع) وتُدمَّران عند الإغلاق،
// فلا تبقى عملية عرض WebView2 لكلٍّ منهما حيّة في الخمول. النوافذ تبقى أربعًا (main + overlay + settings + editor) لكن اثنتين منها عند الطلب.
// إن كانت النافذة موجودة تُعرض وتُركَّز فقط. الإنشاء مخفيًا ثم الإظهار عند اكتمال تحميل الصفحة ⇒ لا وميض فارغ.
// يجب ألا يُنادى `open` من الخيط الرئيسي (بناء نافذة هناك يتجمّد على ويندوز): الأوامر المستدعية async أو من خيط خلفي.
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub struct Spec {
    pub label: &'static str,
    pub url: &'static str,
    pub title: &'static str,
    pub width: f64,
    pub height: f64,
}

pub const SETTINGS: Spec = Spec { label: "settings", url: "settings.html", title: "Settings", width: 880.0, height: 620.0 };
pub const EDITOR: Spec = Spec { label: "editor", url: "editor.html", title: "Editor", width: 900.0, height: 640.0 };

fn show(w: &WebviewWindow) {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
}

/// يعرض النافذة ويركّزها؛ يُنشئها أولًا إن لم تكن موجودة. يعيد (النافذة، هل أُنشئت الآن). None عند تعذّر الإنشاء (يُبتلع).
pub fn open(app: &AppHandle, spec: &Spec) -> Option<(WebviewWindow, bool)> {
    if let Some(w) = app.get_webview_window(spec.label) {
        show(&w);
        return Some((w, false));
    }
    let built = WebviewWindowBuilder::new(app, spec.label, WebviewUrl::App(spec.url.into()))
        .title(spec.title)
        .inner_size(spec.width, spec.height)
        .visible(false)
        .on_page_load(|w, p| {
            if p.event() == PageLoadEvent::Finished {
                show(&w);
            }
        })
        .build();
    match built {
        Ok(w) => Some((w, true)),
        Err(e) => {
            // سباق نقرتين متتاليتين: الثانية تجد النافذة موجودة الآن.
            if let Some(w) = app.get_webview_window(spec.label) {
                return Some((w, false));
            }
            eprintln!("تعذّر إنشاء نافذة {}: {e}", spec.label);
            None
        }
    }
}
