// بديل الميديا الصوتي (حسب المخطط §7/media): أي تطبيق يُصدر صوتًا فعليًا ولا ينشر جلسة GSMTC
// (لعبة، مشغّل محلي بلا SMTC…) يظهر كنشاط «صوت من <التطبيق>» بأيقونته ومستواه — بلا اختراع عنوان/فنان ولا تحكم.
// الاكتشاف حدثي بالكامل (IAudioSessionNotification لإنشاء الجلسات + IAudioSessionEvents لتغيّر الحالة +
// IMMNotificationClient لتبدّل جهاز الإخراج الافتراضي): الخيط ينام على قناة بلا مهلة. قياس الذروة
// (IAudioMeterInformation) يعمل **فقط** أثناء وجود جلسة صوتية نشطة غير مغطّاة بـGSMTC، ويتوقف فور انتفائها.
// خصوصية: نقرأ ذروة المستوى فقط (رقم) — لا التقاط ولا تسجيل صوت.

/// حدّ الذروة الخطية لاعتبار الصوت «حقيقيًا» (~ −40dBFS): يتجاوز ضجيج الجلسات الصامتة المفتوحة.
pub const ON_PEAK: f32 = 0.01;
/// عدد القياسات المتتالية فوق الحدّ قبل إظهار النشاط (يرشّح نغمات الإشعار القصيرة).
const ON_TICKS: u8 = 2;
/// عدد القياسات الصامتة المتتالية قبل إخفاء النشاط (تحمّل توقفات قصيرة بين المقاطع).
const OFF_TICKS: u32 = 12;

/// بوّابة هستيريسيس لقرار «يوجد صوت حقيقي» من تيار قراءات الذروة. نقية وقابلة للاختبار.
#[derive(Default, Debug)]
pub struct Gate {
    on: bool,
    loud: u8,
    quiet: u32,
}

impl Gate {
    /// يغذّي قراءة ذروة جديدة (أعلى جلسة نشطة) ويعيد: هل النشاط ظاهر الآن؟
    pub fn feed(&mut self, peak: f32) -> bool {
        if peak >= ON_PEAK {
            self.loud = self.loud.saturating_add(1);
            self.quiet = 0;
            if self.loud >= ON_TICKS { self.on = true; }
        } else {
            self.loud = 0;
            self.quiet = self.quiet.saturating_add(1);
            if self.quiet >= OFF_TICKS { self.on = false; }
        }
        self.on
    }
    pub fn is_on(&self) -> bool { self.on }
    pub fn quiet_ticks(&self) -> u32 { self.quiet }
    pub fn reset(&mut self) { *self = Gate::default(); }
}

/// فاصل القياس (مللي ثانية): سريع أثناء الصوت أو في أول 30ث من الصمت، ثم يتباطأ لجلسة نشطة صامتة طويلًا.
pub fn interval_ms(gate_on: bool, quiet_ticks: u32) -> u64 {
    if gate_on || quiet_ticks < 200 { 150 } else { 600 }
}

/// اسم ملف التنفيذ بلا مسار ولا امتداد: `C:\\Games\\Foo\\foo.exe` → `foo`.
pub fn exe_stem(path: &str) -> String {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path);
    let lower = file.to_lowercase();
    lower.strip_suffix(".exe").map(str::to_string).unwrap_or(lower)
}

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

/// هل هذا التطبيق الصوتي مغطّى بجلسة GSMTC قائمة (فلا يُكرَّر كنشاط بديل)؟ مطابقة اسم ملف التنفيذ مع الأسماء الودّية
/// لمصادر GSMTC (تساوٍ أو احتواء، بحدّ أدنى 3 أحرف كي لا تتطابق أسماء قصيرة بالصدفة).
pub fn covered_by_gsmtc(exe: &str, gsmtc_names: &[String]) -> bool {
    let e = norm(exe);
    if e.len() < 3 { return false; }
    gsmtc_names.iter().map(|n| norm(n)).any(|n| n.len() >= 3 && (n == e || n.contains(&e) || e.contains(&n)))
}

/// فهرس أعلى قراءة بين المرشّحين (الأعلى ذروةً يمثّل التطبيق المعروض)؛ None إن لم يوجد مرشّح.
pub fn loudest(peaks: &[f32]) -> Option<usize> {
    peaks
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal).then(b.0.cmp(&a.0)))
        .map(|(i, _)| i)
}

#[cfg(windows)]
pub fn start(app: &tauri::AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || win_impl::run(app));
}

#[cfg(windows)]
mod win_impl {
    use super::*;
    use crate::media::{AltActivity, MediaState};
    use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
    use std::time::Duration;
    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::{implement, Interface, BOOL, GUID, PCWSTR, PWSTR};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::*;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    type Res<T> = windows::core::Result<T>;

    enum Msg {
        /// جلسة جديدة أو تغيّرت حالة جلسة: أعد المسح
        Rescan,
        /// تبدّل جهاز الإخراج الافتراضي: أعد الربط
        Rebind,
    }

    // ─── مستمعو COM: كلها ترسل إشارة للخيط فقط (لا عمل داخل نداء COM) ───

    #[implement(IAudioSessionEvents)]
    struct SessEvents {
        tx: Sender<Msg>,
    }

    #[allow(non_snake_case)]
    impl IAudioSessionEvents_Impl for SessEvents_Impl {
        fn OnDisplayNameChanged(&self, _n: &PCWSTR, _c: *const GUID) -> Res<()> { Ok(()) }
        fn OnIconPathChanged(&self, _n: &PCWSTR, _c: *const GUID) -> Res<()> { Ok(()) }
        fn OnSimpleVolumeChanged(&self, _v: f32, _m: BOOL, _c: *const GUID) -> Res<()> { Ok(()) }
        fn OnChannelVolumeChanged(&self, _n: u32, _a: *const f32, _ch: u32, _c: *const GUID) -> Res<()> { Ok(()) }
        fn OnGroupingParamChanged(&self, _g: *const GUID, _c: *const GUID) -> Res<()> { Ok(()) }
        fn OnStateChanged(&self, _s: AudioSessionState) -> Res<()> {
            let _ = self.tx.send(Msg::Rescan);
            Ok(())
        }
        fn OnSessionDisconnected(&self, _r: AudioSessionDisconnectReason) -> Res<()> {
            let _ = self.tx.send(Msg::Rescan);
            Ok(())
        }
    }

    #[implement(IAudioSessionNotification)]
    struct SessNotif {
        tx: Sender<Msg>,
    }

    #[allow(non_snake_case)]
    impl IAudioSessionNotification_Impl for SessNotif_Impl {
        fn OnSessionCreated(&self, _new: windows::core::Ref<'_, IAudioSessionControl>) -> Res<()> {
            let _ = self.tx.send(Msg::Rescan);
            Ok(())
        }
    }

    #[implement(IMMNotificationClient)]
    struct DevNotif {
        tx: Sender<Msg>,
    }

    #[allow(non_snake_case)]
    impl IMMNotificationClient_Impl for DevNotif_Impl {
        fn OnDeviceStateChanged(&self, _id: &PCWSTR, _s: DEVICE_STATE) -> Res<()> { Ok(()) }
        fn OnDeviceAdded(&self, _id: &PCWSTR) -> Res<()> { Ok(()) }
        fn OnDeviceRemoved(&self, _id: &PCWSTR) -> Res<()> { Ok(()) }
        fn OnDefaultDeviceChanged(&self, flow: EDataFlow, role: ERole, _id: &PCWSTR) -> Res<()> {
            if flow == eRender && role == eConsole {
                let _ = self.tx.send(Msg::Rebind);
            }
            Ok(())
        }
        fn OnPropertyValueChanged(&self, _id: &PCWSTR, _k: &windows::Win32::Foundation::PROPERTYKEY) -> Res<()> { Ok(()) }
    }

    // ─── الجلسات المتتبَّعة ───

    struct Tracked {
        key: String,
        ctrl: IAudioSessionControl2,
        events: IAudioSessionEvents,
        pid: u32,
        /// مسار exe (للأيقونة) واسم الملف بلا امتداد (للهوية والتغطية)
        path: String,
        exe: String,
        display: String,
        system: bool,
    }

    struct Bound {
        mgr: IAudioSessionManager2,
        notif: IAudioSessionNotification,
        tracked: Vec<Tracked>,
    }

    impl Drop for Bound {
        fn drop(&mut self) {
            unsafe {
                let _ = self.mgr.UnregisterSessionNotification(&self.notif);
                for t in self.tracked.drain(..) {
                    let _ = t.ctrl.UnregisterAudioSessionNotification(&t.events);
                }
            }
        }
    }

    unsafe fn pwstr_to_string(p: PWSTR) -> String {
        if p.is_null() { return String::new(); }
        let s = p.to_string().unwrap_or_default();
        CoTaskMemFree(Some(p.0 as *const _));
        s
    }

    unsafe fn exe_path(pid: u32) -> String {
        if pid == 0 { return String::new(); }
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
        let mut buf = [0u16; 520];
        let mut len = buf.len() as u32;
        let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(h);
        if r.is_ok() { String::from_utf16_lossy(&buf[..len as usize]) } else { String::new() }
    }

    unsafe fn bind(tx: &Sender<Msg>) -> Res<Bound> {
        let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let dev = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let mgr: IAudioSessionManager2 = dev.Activate(CLSCTX_ALL, None)?;
        let notif: IAudioSessionNotification = SessNotif { tx: tx.clone() }.into();
        mgr.RegisterSessionNotification(&notif)?;
        let mut b = Bound { mgr, notif, tracked: Vec::new() };
        rescan(&mut b, tx);
        Ok(b)
    }

    /// يوافق المتتبَّعات مع الجلسات الحالية: يسجّل أحداث الجديدة ويحرّر المنتهية.
    unsafe fn rescan(b: &mut Bound, tx: &Sender<Msg>) {
        let Ok(en) = b.mgr.GetSessionEnumerator() else { return };
        let n = en.GetCount().unwrap_or(0);
        let mut present: Vec<String> = Vec::new();
        for i in 0..n {
            let Ok(c1) = en.GetSession(i) else { continue };
            let Ok(c2) = c1.cast::<IAudioSessionControl2>() else { continue };
            let key = c2.GetSessionInstanceIdentifier().map(|p| pwstr_to_string(p)).unwrap_or_default();
            if key.is_empty() { continue; }
            present.push(key.clone());
            if b.tracked.iter().any(|t| t.key == key) { continue; }
            let events: IAudioSessionEvents = SessEvents { tx: tx.clone() }.into();
            let _ = c2.RegisterAudioSessionNotification(&events);
            let pid = c2.GetProcessId().unwrap_or(0);
            let path = exe_path(pid);
            let display = c2.GetDisplayName().map(|p| pwstr_to_string(p)).unwrap_or_default();
            b.tracked.push(Tracked {
                key,
                pid,
                exe: exe_stem(&path),
                path,
                display,
                system: c2.IsSystemSoundsSession() == windows::Win32::Foundation::S_OK,
                ctrl: c2,
                events,
            });
        }
        let (keep, drop): (Vec<_>, Vec<_>) = b.tracked.drain(..).partition(|t| present.contains(&t.key));
        for t in drop {
            let _ = t.ctrl.UnregisterAudioSessionNotification(&t.events);
        }
        b.tracked = keep;
    }

    fn enabled(app: &AppHandle) -> bool {
        app.state::<crate::state::AppState>()
            .settings
            .lock()
            .unwrap()
            .get("moduleMedia")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    }

    /// أسماء مصادر GSMTC الحالية (تكتبها حلقة media.rs) لاستبعاد التطبيقات المغطّاة.
    fn gsmtc_names(app: &AppHandle) -> Vec<String> {
        app.state::<MediaState>().sources.lock().unwrap().iter().map(|s| s.name.clone()).collect()
    }

    fn set_alt(app: &AppHandle, next: Option<AltActivity>) {
        let st = app.state::<MediaState>();
        {
            let mut cur = st.alt.lock().unwrap();
            if *cur == next { return; }
            *cur = next;
        }
        // أيقظ حلقة الميديا لإعادة القرار (GSMTC أم بديل)
        let tx = st.wake.lock().unwrap().clone();
        if let Some(tx) = tx {
            let _ = tx.send(());
        }
    }

    fn display_name(t: &Tracked) -> String {
        // اسم عرض الجلسة إن كان نصًا فعليًا (لا مرجع مورد "@…")، وإلا اسم ملف التنفيذ
        let d = t.display.trim();
        if !d.is_empty() && !d.starts_with('@') { d.to_string() } else if !t.exe.is_empty() { t.exe.clone() } else { format!("PID {}", t.pid) }
    }

    /// أيقونة exe كـ data-URL على خيط قصير مستقل (SHGetFileInfo يريد STA؛ خيطنا MTA).
    fn icon_for(app: &AppHandle, path: &str) -> Option<String> {
        if path.is_empty() { return None; }
        let dir = app.state::<crate::state::AppState>().data_dir.lock().unwrap().clone().map(|d| d.join("icons"));
        let p = path.to_string();
        std::thread::spawn(move || crate::files::icon_cached(&p, dir.as_deref()))
            .join()
            .ok()
            .flatten()
            .map(|b64| format!("data:image/png;base64,{b64}"))
    }

    fn handle(msg: Result<Msg, RecvTimeoutError>, bound: &mut Option<Bound>, tx: &Sender<Msg>) -> bool {
        match msg {
            Ok(Msg::Rescan) => {
                if let Some(b) = bound.as_mut() { unsafe { rescan(b, tx) }; }
                true
            }
            Ok(Msg::Rebind) => { *bound = None; true }
            Err(RecvTimeoutError::Timeout) => true,
            Err(RecvTimeoutError::Disconnected) => false,
        }
    }

    pub fn run(app: AppHandle) {
        unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
        let (tx, rx): (Sender<Msg>, Receiver<Msg>) = channel();
        // مستمع تبدّل الجهاز الافتراضي (يُسجَّل مرة واحدة طوال عمر الخيط)
        let en: Option<IMMDeviceEnumerator> = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok() };
        let dev_cb: IMMNotificationClient = DevNotif { tx: tx.clone() }.into();
        if let Some(e) = en.as_ref() { unsafe { let _ = e.RegisterEndpointNotificationCallback(&dev_cb); } }

        let mut bound: Option<Bound> = None;
        let mut gate = Gate::default();
        let mut shown: Option<(u32, String)> = None; // (pid, exe) المعروض حاليًا
        let mut last_level = -1.0f32;

        loop {
            if !enabled(&app) {
                // الوحدة معطّلة: لا ربط ولا قياس؛ فحص المفتاح كل 5ث فقط
                bound = None;
                gate.reset();
                if shown.take().is_some() { set_alt(&app, None); }
                if !handle(rx.recv_timeout(Duration::from_secs(5)), &mut bound, &tx) { return; }
                continue;
            }
            if bound.is_none() {
                match unsafe { bind(&tx) } {
                    Ok(b) => bound = Some(b),
                    Err(e) => {
                        eprintln!("audiosess: {e}");
                        if !handle(rx.recv_timeout(Duration::from_secs(5)), &mut bound, &tx) { return; }
                        continue;
                    }
                }
            }
            let names = gsmtc_names(&app);
            let me = std::process::id();
            let b = bound.as_ref().unwrap();
            // مرشّحو القياس: جلسات حالتها «نشطة» (تيار مفتوح) غير النظام/نحن/المغطّاة بـGSMTC
            let active: Vec<&Tracked> = b
                .tracked
                .iter()
                .filter(|t| !t.system && t.pid != me && !covered_by_gsmtc(&t.exe, &names))
                .filter(|t| unsafe { t.ctrl.GetState() }.map(|s| s == AudioSessionStateActive).unwrap_or(false))
                .collect();

            if active.is_empty() {
                // لا مرشّح ⇒ لا قياس إطلاقًا؛ ننام على القناة بلا مهلة حتى حدث جلسة/جهاز
                gate.reset();
                if shown.take().is_some() {
                    set_alt(&app, None);
                    let _ = app.emit("media:level", 0.0f32);
                    last_level = -1.0;
                }
                if !handle(rx.recv().map_err(|_| RecvTimeoutError::Disconnected), &mut bound, &tx) { return; }
                continue;
            }

            // جلسة GSMTC حقيقية تعمل الآن ⇒ هي العرض (resolve) فلا قياس؛ فحص خفيف كل 2ث لحين توقفها
            let gs_playing = {
                let i = app.state::<MediaState>().info.lock().unwrap().clone();
                i.session && i.kind == crate::media::KIND_GSMTC && i.playing
            };
            if gs_playing {
                gate.reset();
                if shown.take().is_some() {
                    set_alt(&app, None);
                    let _ = app.emit("media:level", 0.0f32);
                    last_level = -1.0;
                }
                if !handle(rx.recv_timeout(Duration::from_secs(2)), &mut bound, &tx) { return; }
                continue;
            }

            let peaks: Vec<f32> = active
                .iter()
                .map(|t| unsafe { t.ctrl.cast::<IAudioMeterInformation>().and_then(|m| m.GetPeakValue()) }.unwrap_or(0.0))
                .collect();
            let top = loudest(&peaks).unwrap_or(0);
            let peak = peaks.get(top).copied().unwrap_or(0.0);
            if gate.feed(peak) {
                let t = active[top];
                let id = (t.pid, t.exe.clone());
                if shown.as_ref() != Some(&id) {
                    let alt = AltActivity { pid: t.pid, exe: t.exe.clone(), name: display_name(t), icon: icon_for(&app, &t.path) };
                    shown = Some(id);
                    set_alt(&app, Some(alt));
                }
                let lvl = ((peak.clamp(0.0, 1.0).sqrt()) * 20.0).round() / 20.0; // منحنى مسموع، خطوات 0.05
                if (lvl - last_level).abs() > f32::EPSILON {
                    last_level = lvl;
                    let _ = app.emit("media:level", lvl);
                }
            } else if shown.take().is_some() {
                set_alt(&app, None);
                let _ = app.emit("media:level", 0.0f32);
                last_level = -1.0;
            }
            let wait = Duration::from_millis(interval_ms(gate.is_on(), gate.quiet_ticks()));
            if !handle(rx.recv_timeout(wait), &mut bound, &tx) { return; }
        }
    }
}
