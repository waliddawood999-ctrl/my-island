// SMTC (حسب المخطط §7/media): جلسات GlobalSystemMediaTransportControls + غلاف base64.
// خيط مخصّص يستطلع كل ثانية ويُوقَظ فورًا من SessionsChanged/CurrentSessionChanged/
// MediaPropertiesChanged/PlaybackInfoChanged/TimelinePropertiesChanged.
// أحداث: media:update (بيانات + موضع كل ثانية أثناء التشغيل)، media:cover (غلاف data-URL).
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone, Default, PartialEq, Debug)]
pub struct MediaInfo {
    /// هل توجد جلسة ميديا (وإلا تبقى الحبة على شكلها)
    pub session: bool,
    /// معرّف المصدر (AUMID) والاسم الودّي
    pub source: String,
    pub source_name: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// بالثواني
    pub duration: f64,
    pub position: f64,
    pub playing: bool,
    pub can_prev: bool,
    pub can_next: bool,
    pub can_seek: bool,
    /// نوع المصدر: "gsmtc" (جلسة ميديا حقيقية) أو "audio" (نشاط صوتي بديل بلا جلسة — لا بيانات وصفية ولا تحكم)؛ فارغ = لا جلسة.
    pub kind: String,
}

pub const KIND_GSMTC: &str = "gsmtc";
pub const KIND_AUDIO: &str = "audio";

#[derive(Serialize, Clone)]
pub struct MediaSource {
    pub id: String,
    pub name: String,
}

/// نشاط صوتي حقيقي من تطبيق بلا جلسة GSMTC (تكتبه audiosess.rs، وتقرؤه حلقة الميديا لتقرّر العرض).
#[derive(Clone, Debug, PartialEq, Default)]
pub struct AltActivity {
    pub pid: u32,
    /// اسم ملف التنفيذ بلا امتداد (مفتاح الهوية)
    pub exe: String,
    /// الاسم الظاهر للمستخدم
    pub name: String,
    /// أيقونة التطبيق كـ data-URL أو None
    pub icon: Option<String>,
}

#[derive(Default)]
pub struct MediaState {
    /// نشاط بديل حاليّ (None = لا شيء؛ القياس متوقف حينها)
    pub alt: Mutex<Option<AltActivity>>,
    /// المصدر المختار يدويًا (None = جلسة النظام الحالية)
    pub picked: Mutex<Option<String>>,
    pub info: Mutex<MediaInfo>,
    pub cover: Mutex<Option<String>>,
    pub sources: Mutex<Vec<MediaSource>>,
    #[cfg(windows)]
    pub wake: Mutex<Option<std::sync::mpsc::Sender<()>>>,
}

/// اسم ودّي من AUMID: "Spotify.exe" → Spotify، "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic" → ZuneMusic.
pub fn friendly_name(id: &str) -> String {
    let base = id.rsplit('!').next().unwrap_or(id);
    let base = base.strip_suffix(".exe").or_else(|| base.strip_suffix(".EXE")).unwrap_or(base);
    let base = base.rsplit('.').next().unwrap_or(base);
    if base.is_empty() { id.to_string() } else { base.to_string() }
}

/// الثواني ← ثواني آمنة (NaN/سالب → 0)
fn secs(v: f64) -> f64 { if v.is_finite() && v > 0.0 { v } else { 0.0 } }

pub use crate::mediasel::{resolve, select_session, Candidate, Playback, Resolution};

pub fn start(app: &AppHandle) {
    #[cfg(windows)]
    win_impl::start(app.clone());
    #[cfg(not(windows))]
    let _ = app;
}

#[derive(Serialize)]
pub struct NowPlaying {
    pub info: MediaInfo,
    /// data-URL للغلاف أو null
    pub cover: Option<String>,
}

/// اللقطة الحالية — تستعملها الواجهة عند التركيب قبل وصول أول حدث.
#[tauri::command]
pub fn media_now(state: State<MediaState>) -> NowPlaying {
    NowPlaying { info: state.info.lock().unwrap().clone(), cover: state.cover.lock().unwrap().clone() }
}

#[tauri::command]
pub fn media_sources(state: State<MediaState>) -> Vec<MediaSource> {
    state.sources.lock().unwrap().clone()
}

/// يختار مصدر الميديا (AUMID من media_sources)؛ null/فارغ = جلسة النظام الحالية.
#[tauri::command]
pub fn media_pick(state: State<MediaState>, id: Option<String>) {
    *state.picked.lock().unwrap() = id.filter(|s| !s.is_empty());
    #[cfg(windows)]
    if let Some(tx) = state.wake.lock().unwrap().as_ref() {
        let _ = tx.send(());
    }
}

/// action: play | pause | toggle | next | prev — يرجع true إن قبلها التطبيق.
#[tauri::command]
pub async fn media_control(state: State<'_, MediaState>, action: String) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let picked = state.picked.lock().unwrap().clone();
        let alt = state.alt.lock().unwrap().is_some();
        let r = tauri::async_runtime::spawn_blocking(move || win_impl::control(picked, alt, &action))
            .await
            .map_err(|e| e.to_string())??;
        if let Some(tx) = state.wake.lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
        Ok(r)
    }
    #[cfg(not(windows))]
    {
        let _ = (state, action);
        Err("windows only".into())
    }
}

/// ينقل موضع التشغيل (ثوانٍ).
#[tauri::command]
pub async fn media_seek(state: State<'_, MediaState>, seconds: f64) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let picked = state.picked.lock().unwrap().clone();
        let alt = state.alt.lock().unwrap().is_some();
        let secs = secs(seconds);
        let r = tauri::async_runtime::spawn_blocking(move || win_impl::seek(picked, alt, secs))
            .await
            .map_err(|e| e.to_string())??;
        if let Some(tx) = state.wake.lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
        Ok(r)
    }
    #[cfg(not(windows))]
    {
        let _ = (state, seconds);
        Err("windows only".into())
    }
}

#[cfg(windows)]
mod win_impl {
    use super::*;
    use std::sync::mpsc::{channel, Receiver, Sender};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tauri::Manager;
    use windows::{
        Foundation::TypedEventHandler,
        Media::Control::{
            GlobalSystemMediaTransportControlsSession as Session,
            GlobalSystemMediaTransportControlsSessionManager as GsmtcManager,
            GlobalSystemMediaTransportControlsSessionMediaProperties as Props,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as PStatus,
        },
        Storage::Streams::DataReader,
        Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
    };

    const TICKS: f64 = 10_000_000.0; // 100ns
    const MAX_COVER: u64 = 6 * 1024 * 1024;

    fn init_winrt() {
        thread_local!(static DONE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) });
        DONE.with(|d| {
            if !d.get() {
                unsafe { let _ = RoInitialize(RO_INIT_MULTITHREADED); }
                d.set(true);
            }
        });
    }

    fn aumid(s: &Session) -> String {
        s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default()
    }

    fn list_sessions(mgr: &GsmtcManager) -> Vec<Session> {
        mgr.GetSessions().map(|l| l.into_iter().collect()).unwrap_or_default()
    }

    /// يبني مرشّحي الاختيار من كل الجلسات (قراءة PlaybackInfo/Timeline رخيصة؛ الفشل = مرتبة أدنى لا إسقاط).
    fn candidates(mgr: &GsmtcManager, sessions: &[Session]) -> Vec<Candidate> {
        let current = mgr.GetCurrentSession().ok().map(|s| aumid(&s));
        sessions
            .iter()
            .map(|s| {
                let id = aumid(s);
                let playback = match s.GetPlaybackInfo().and_then(|pb| pb.PlaybackStatus()) {
                    Ok(PStatus::Playing) => Playback::Playing,
                    Ok(PStatus::Paused) => Playback::Paused,
                    _ => Playback::Other,
                };
                let timeline_at = s
                    .GetTimelineProperties()
                    .and_then(|t| t.LastUpdatedTime())
                    .ok()
                    .map(|t| t.UniversalTime)
                    .filter(|t| *t > 0);
                let is_system_current = current.as_deref() == Some(id.as_str());
                Candidate { id, playback, timeline_at, is_system_current }
            })
            .collect()
    }

    /// الجلسة الفعّالة الآن لأوامر التحكم: نفس منطق الحلقة. `None` = لا جلسة GSMTC (أو القرار للبديل الصوتي الذي لا يُتحكَّم به).
    fn pick_session(mgr: &GsmtcManager, picked: &Option<String>, alt_present: bool) -> Option<Session> {
        let sessions = list_sessions(mgr);
        match resolve(&candidates(mgr, &sessions), picked, alt_present) {
            Resolution::Session(i) => sessions.into_iter().nth(i),
            _ => None,
        }
    }

    fn manager() -> Result<GsmtcManager, String> {
        init_winrt();
        GsmtcManager::RequestAsync().and_then(|o| o.get()).map_err(|e| e.to_string())
    }

    pub fn control(picked: Option<String>, alt: bool, action: &str) -> Result<bool, String> {
        let s = pick_session(&manager()?, &picked, alt).ok_or("no media session")?;
        let op = match action {
            "play" => s.TryPlayAsync(),
            "pause" => s.TryPauseAsync(),
            "toggle" => s.TryTogglePlayPauseAsync(),
            "next" => s.TrySkipNextAsync(),
            "prev" => s.TrySkipPreviousAsync(),
            other => return Err(format!("unknown action: {other}")),
        };
        op.and_then(|o| o.get()).map_err(|e| e.to_string())
    }

    pub fn seek(picked: Option<String>, alt: bool, seconds: f64) -> Result<bool, String> {
        let s = pick_session(&manager()?, &picked, alt).ok_or("no media session")?;
        s.TryChangePlaybackPositionAsync((seconds * TICKS) as i64)
            .and_then(|o| o.get())
            .map_err(|e| e.to_string())
    }

    fn now_ticks() -> i64 {
        // DateTime ويندوز: 100ns منذ 1601-01-01
        let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
        (d.as_secs() as i64 + 11_644_473_600) * 10_000_000 + (d.subsec_nanos() / 100) as i64
    }

    fn read_info(s: &Session, props: &Option<Props>) -> MediaInfo {
        let source = aumid(s);
        let mut m = MediaInfo { session: true, kind: KIND_GSMTC.into(), source_name: friendly_name(&source), source, ..Default::default() };
        if let Some(p) = props {
            m.title = p.Title().map(|h| h.to_string()).unwrap_or_default();
            m.artist = p.Artist().map(|h| h.to_string()).unwrap_or_default();
            m.album = p.AlbumTitle().map(|h| h.to_string()).unwrap_or_default();
        }
        let mut rate = 1.0;
        if let Ok(pb) = s.GetPlaybackInfo() {
            m.playing = pb.PlaybackStatus().map(|st| st == PStatus::Playing).unwrap_or(false);
            if let Ok(r) = pb.PlaybackRate().and_then(|r| r.Value()) {
                if r > 0.0 { rate = r; }
            }
            if let Ok(c) = pb.Controls() {
                m.can_prev = c.IsPreviousEnabled().unwrap_or(false);
                m.can_next = c.IsNextEnabled().unwrap_or(false);
                m.can_seek = c.IsPlaybackPositionEnabled().unwrap_or(false);
            }
        }
        if let Ok(tl) = s.GetTimelineProperties() {
            let start = tl.StartTime().map(|t| t.Duration).unwrap_or(0);
            let end = tl.EndTime().map(|t| t.Duration).unwrap_or(0);
            let pos = tl.Position().map(|t| t.Duration).unwrap_or(0);
            m.duration = secs((end - start) as f64 / TICKS);
            let mut p = secs((pos - start) as f64 / TICKS);
            if m.playing {
                if let Ok(last) = tl.LastUpdatedTime() {
                    let dt = (now_ticks() - last.UniversalTime) as f64 / TICKS;
                    if dt > 0.0 && dt < 6.0 * 3600.0 { p += dt * rate; }
                }
            }
            if m.duration > 0.0 && p > m.duration { p = m.duration; }
            m.position = (p * 10.0).round() / 10.0;
        }
        m
    }

    /// يقرأ المصغّرة من GSMTC (`Thumbnail`): يعيد (بصمة البايتات الخام، data-URI) — الـURI فقط إن اختلفت البصمة عن `prev` (لا ترميز/بث بلا تغيّر).
    /// المتصفحات (Brave/Chrome/Edge) تعيد أولًا أيقونة التطبيق البديلة ثم تصل صورة الفيديو لاحقًا ⇒ لذلك نعيد القراءة (انظر حلقة run).
    fn read_cover(p: &Props, prev: u64) -> Option<(u64, Option<String>)> {
        use base64::Engine;
        use std::hash::{Hash, Hasher};
        let r = p.Thumbnail().ok()?;
        let stream = r.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()?;
        if size == 0 || size > MAX_COVER {
            return None;
        }
        let input = stream.GetInputStreamAt(0).ok()?;
        let reader = DataReader::CreateDataReader(&input).ok()?;
        reader.LoadAsync(size as u32).ok()?.get().ok()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).ok()?;
        let mut h = std::collections::hash_map::DefaultHasher::new();
        buf.hash(&mut h);
        let hash = h.finish();
        if hash == prev {
            return Some((hash, None));
        }
        let mime = stream
            .ContentType()
            .map(|h| h.to_string())
            .ok()
            .filter(|m| m.starts_with("image/"))
            .unwrap_or_else(|| "image/jpeg".into());
        Some((hash, Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(buf)))))
    }

    /// اشتراكات أحداث **كل** جلسة (لا المختارة فقط): تحوّل جلسة غير مختارة من متوقفة إلى تعمل يُوقظ إعادة الاختيار فورًا.
    struct Sub {
        session: Session,
        tokens: (i64, i64, i64),
    }

    fn subscribe(s: &Session, tx: &Sender<()>) -> Option<(i64, i64, i64)> {
        let (a, b, c) = (tx.clone(), tx.clone(), tx.clone());
        let t1 = s.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| { let _ = a.send(()); Ok(()) })).ok()?;
        let t2 = s.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| { let _ = b.send(()); Ok(()) })).ok()?;
        let t3 = s.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| { let _ = c.send(()); Ok(()) })).ok()?;
        Some((t1, t2, t3))
    }

    fn unsubscribe(sub: Sub) {
        let _ = sub.session.RemoveMediaPropertiesChanged(sub.tokens.0);
        let _ = sub.session.RemovePlaybackInfoChanged(sub.tokens.1);
        let _ = sub.session.RemoveTimelinePropertiesChanged(sub.tokens.2);
    }

    /// مفتاح الجلسة في خريطة الاشتراكات: AUMID، ومع التكرار (نفس التطبيق بجلستين) يُلحَق ترتيب الظهور.
    fn sub_keys(ids: &[String]) -> Vec<String> {
        let mut seen: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        ids.iter()
            .map(|id| {
                let n = seen.entry(id.as_str()).or_insert(0);
                *n += 1;
                if *n == 1 { id.clone() } else { format!("{id}#{n}") }
            })
            .collect()
    }

    /// يوافق الاشتراكات مع الجلسات الحالية: يشترك بالجديدة ويلغي المنتهية (SessionsChanged يوقظ هذه الدالة).
    fn reconcile(subs: &mut std::collections::HashMap<String, Sub>, sessions: &[Session], ids: &[String], tx: &Sender<()>) {
        let keys = sub_keys(ids);
        let stale: Vec<String> = subs.keys().filter(|k| !keys.contains(k)).cloned().collect();
        for k in stale {
            if let Some(old) = subs.remove(&k) { unsubscribe(old); }
        }
        for (k, s) in keys.into_iter().zip(sessions) {
            if !subs.contains_key(&k) {
                if let Some(tokens) = subscribe(s, tx) {
                    subs.insert(k, Sub { session: s.clone(), tokens });
                }
            }
        }
    }

    pub fn start(app: AppHandle) {
        let (tx, rx) = channel::<()>();
        *app.state::<MediaState>().wake.lock().unwrap() = Some(tx.clone());
        std::thread::spawn(move || run(app, tx, rx));
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

    fn run(app: AppHandle, tx: Sender<()>, rx: Receiver<()>) {
        init_winrt();
        let mgr = loop {
            match GsmtcManager::RequestAsync().and_then(|o| o.get()) {
                Ok(m) => break m,
                Err(e) => {
                    eprintln!("SMTC غير متاح: {e}");
                    std::thread::sleep(Duration::from_secs(5));
                }
            }
        };
        {
            let a = tx.clone();
            let _ = mgr.SessionsChanged(&TypedEventHandler::new(move |_, _| { let _ = a.send(()); Ok(()) }));
            let b = tx.clone();
            let _ = mgr.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| { let _ = b.send(()); Ok(()) }));
        }
        let st = app.state::<MediaState>();
        let mut last = MediaInfo::default();
        let mut last_key = String::new();
        let mut cover_hash = 0u64; // بصمة آخر مصغّرة أُرسلت
        let mut since = 0u32; // دورات منذ آخر تغيّر مسار
        let mut subs: std::collections::HashMap<String, Sub> = std::collections::HashMap::new();

        loop {
            let mut info = MediaInfo::default();
            let mut props: Option<Props> = None;
            let on = enabled(&app);
            if on {
                // تعداد كل الجلسات + اشتراك أحداث لكل جلسة؛ لا استطلاع: الحلقة تنام حتى يوقظها حدث (انظر نهاية الحلقة).
                let sessions = list_sessions(&mgr);
                let ids: Vec<String> = sessions.iter().map(aumid).collect();
                reconcile(&mut subs, &sessions, &ids, &tx);
                *st.sources.lock().unwrap() = ids.iter().map(|id| MediaSource { name: friendly_name(id), id: id.clone() }).collect();
                let picked = st.picked.lock().unwrap().clone();
                let alt = st.alt.lock().unwrap().clone();
                match resolve(&candidates(&mgr, &sessions), &picked, alt.is_some()) {
                    Resolution::Session(i) => {
                        let s = &sessions[i];
                        props = s.TryGetMediaPropertiesAsync().and_then(|o| o.get()).ok();
                        info = read_info(s, &props);
                    }
                    Resolution::Audio | Resolution::Nothing => {}
                }
            } else {
                for (_, old) in subs.drain() { unsubscribe(old); }
                st.sources.lock().unwrap().clear();
            }

            // الغلاف (المصغّرة الحقيقية من GSMTC لكل مصدر): عند تغيّر المسار/الفيديو يُصفَّر ثم يُعاد قراءته كل دورة (~1ث) لأول 20 دورة ثم كل 5 دورات؛
            // أي بايتات جديدة (مثلًا وصول صورة الفيديو بعد أيقونة المتصفح البديلة) تستبدل الغلاف وتُبثّ media:cover. بلا مصغّرة ⇒ لا غلاف (الواجهة تعرض بديلًا).
            let key = if info.session { format!("{}|{}|{}|{}", info.source, info.title, info.artist, info.album) } else { String::new() };
            if key != last_key {
                last_key = key;
                since = 0;
                cover_hash = 0;
                if st.cover.lock().unwrap().take().is_some() {
                    let _ = app.emit("media:cover", Option::<String>::None);
                }
            } else {
                since = since.saturating_add(1);
            }
            if info.session && (since < 20 || since % 5 == 0) {
                if let Some((hash, uri)) = props.as_ref().and_then(|p| read_cover(p, cover_hash)) {
                    cover_hash = hash;
                    if let Some(c) = uri {
                        *st.cover.lock().unwrap() = Some(c.clone());
                        let _ = app.emit("media:cover", Some(c));
                    }
                }
            }

            let ticking = on && info.session && ((info.playing && info.kind == KIND_GSMTC) || since < 20);
            if info != last {
                *st.info.lock().unwrap() = info.clone();
                let _ = app.emit("media:update", &info);
                last = info;
            }

            // لا خمول مكلف: ثانية واحدة فقط أثناء تشغيل جلسة (موضع حي) أو في نافذة الغلاف بعد تغيّر المسار؛
            // وإلا ننام على القناة بلا مهلة حتى يوقظنا حدث (SessionsChanged/خصائص/تشغيل/اختيار/بديل صوتي).
            // وحدة الميديا المعطّلة تتحقق من مفتاحها كل 5ث فقط (لا نشر ولا اشتراكات حينها).
            if ticking {
                let _ = rx.recv_timeout(Duration::from_millis(1000));
            } else if on {
                if rx.recv().is_err() { return; }
            } else {
                let _ = rx.recv_timeout(Duration::from_secs(5));
            }
            while rx.try_recv().is_ok() {}
        }
    }
}
