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
}

#[derive(Serialize, Clone)]
pub struct MediaSource {
    pub id: String,
    pub name: String,
}

#[derive(Default)]
pub struct MediaState {
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
        let r = tauri::async_runtime::spawn_blocking(move || win_impl::control(picked, &action))
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
        let secs = secs(seconds);
        let r = tauri::async_runtime::spawn_blocking(move || win_impl::seek(picked, secs))
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

    fn pick_session(mgr: &GsmtcManager, picked: &Option<String>) -> Option<Session> {
        if let Some(id) = picked {
            if let Ok(list) = mgr.GetSessions() {
                for s in &list {
                    if &aumid(&s) == id {
                        return Some(s);
                    }
                }
            }
        }
        mgr.GetCurrentSession().ok()
    }

    fn manager() -> Result<GsmtcManager, String> {
        init_winrt();
        GsmtcManager::RequestAsync().and_then(|o| o.get()).map_err(|e| e.to_string())
    }

    pub fn control(picked: Option<String>, action: &str) -> Result<bool, String> {
        let s = pick_session(&manager()?, &picked).ok_or("no media session")?;
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

    pub fn seek(picked: Option<String>, seconds: f64) -> Result<bool, String> {
        let s = pick_session(&manager()?, &picked).ok_or("no media session")?;
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
        let mut m = MediaInfo { session: true, source_name: friendly_name(&source), source, ..Default::default() };
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

    fn read_cover(p: &Props) -> Option<String> {
        use base64::Engine;
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
        let mime = stream
            .ContentType()
            .map(|h| h.to_string())
            .ok()
            .filter(|m| m.starts_with("image/"))
            .unwrap_or_else(|| "image/jpeg".into());
        Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(buf)))
    }

    /// اشتراكات أحداث الجلسة المختارة (تُستبدل عند تغيّر الجلسة).
    struct Sub {
        id: String,
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
        let mut cover_tries = 0u8;
        let mut sub: Option<Sub> = None;

        loop {
            let mut info = MediaInfo::default();
            let mut props: Option<Props> = None;
            if enabled(&app) {
                // قائمة المصادر
                let mut list = Vec::new();
                if let Ok(all) = mgr.GetSessions() {
                    for s in &all {
                        let id = aumid(&s);
                        list.push(MediaSource { name: friendly_name(&id), id });
                    }
                }
                *st.sources.lock().unwrap() = list;
                let picked = st.picked.lock().unwrap().clone();
                if let Some(s) = pick_session(&mgr, &picked) {
                    let id = aumid(&s);
                    if sub.as_ref().map(|x| x.id != id).unwrap_or(true) {
                        if let Some(old) = sub.take() { unsubscribe(old); }
                        sub = subscribe(&s, &tx).map(|tokens| Sub { id: id.clone(), session: s.clone(), tokens });
                    }
                    props = s.TryGetMediaPropertiesAsync().and_then(|o| o.get()).ok();
                    info = read_info(&s, &props);
                } else if let Some(old) = sub.take() {
                    unsubscribe(old);
                }
            } else {
                if let Some(old) = sub.take() { unsubscribe(old); }
                st.sources.lock().unwrap().clear();
            }

            // الغلاف: عند تغيّر المسار، مع إعادة محاولة قصيرة إن تأخّر وصوله
            let key = if info.session { format!("{}|{}|{}|{}", info.source, info.title, info.artist, info.album) } else { String::new() };
            if key != last_key {
                last_key = key;
                cover_tries = 0;
                if st.cover.lock().unwrap().take().is_some() {
                    let _ = app.emit("media:cover", Option::<String>::None);
                }
            }
            if info.session && cover_tries < 6 && st.cover.lock().unwrap().is_none() {
                cover_tries += 1;
                if let Some(c) = props.as_ref().and_then(read_cover) {
                    *st.cover.lock().unwrap() = Some(c.clone());
                    let _ = app.emit("media:cover", Some(c));
                }
            }

            if info != last {
                *st.info.lock().unwrap() = info.clone();
                let _ = app.emit("media:update", &info);
                last = info;
            }

            // ننتظر حدث SMTC أو ثانية (لموضع التشغيل الحي)
            let _ = rx.recv_timeout(Duration::from_millis(1000));
            while rx.try_recv().is_ok() {}
        }
    }
}
