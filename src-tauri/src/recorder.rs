// recorder: تسجيل منطقة من الشاشة إلى mp4 (Media Foundation: H.264) أو gif (حسب المخطط §7/recorder) — الجلسة 3.3.
// التدفق: hotkeyRecord/record_begin ⇒ طبقة overlay بغرض "record" (نفس تحديد 3.2) ⇒ record_start(x,y,w,h)
// ⇒ خيط التقاط GDI بإيقاع recordingFps يرسل الإطارات عبر قناة محدودة إلى خيط ترميز (إطار ممتلئ = يُسقَط، فلا يتأخر الزمن)
// ⇒ record_stop يوقف الالتقاط ويُنهي الملف. الحبة تعرض مؤشر تسجيل ومؤقّتًا من حدث record:state.
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, TrySendError},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::Shortcut;

// ───────────────────────── منطق خالص (يُختبر منفصلًا) ─────────────────────────
// BEGIN PURE
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Quality {
    Low,
    Medium,
    High,
}

/// recordingQuality: low | medium | high (غير ذلك ⇒ medium).
pub fn parse_quality(s: &str) -> Quality {
    match s.trim().to_ascii_lowercase().as_str() {
        "low" => Quality::Low,
        "high" => Quality::High,
        _ => Quality::Medium,
    }
}

/// أقرب عدد زوجي (H.264/NV12 يتطلب أبعادًا زوجية).
pub fn even(n: u32) -> u32 {
    n & !1
}

/// معدّل بتات H.264 (bit/s) من الأبعاد والإطارات والجودة، بين 0.5Mbps و40Mbps.
pub fn bitrate(w: u32, h: u32, fps: u32, q: Quality) -> u32 {
    let k = match q {
        Quality::Low => 0.04,
        Quality::Medium => 0.07,
        Quality::High => 0.12,
    };
    ((w as f64 * h as f64 * fps as f64 * k) as u64).clamp(500_000, 40_000_000) as u32
}

/// أبعاد الـgif: أقصى عرض حسب الجودة (480/640/800) مع حفظ النسبة، ولا تكبير.
pub fn gif_dims(w: u32, h: u32, q: Quality) -> (u32, u32) {
    let max_w = match q {
        Quality::Low => 480,
        Quality::Medium => 640,
        Quality::High => 800,
    };
    if w <= max_w {
        return (w.max(1), h.max(1));
    }
    let dh = ((h as u64 * max_w as u64) / w as u64).max(1) as u32;
    (max_w, dh)
}

/// الـgif يُسقَّف عند 20 إطارًا/ث (تأخير الإطار بالسنتي-ثانية، وترميز الألوان ثقيل).
pub fn gif_fps(fps: u32) -> u32 {
    fps.clamp(1, 20)
}

/// تأخير إطار gif بالسنتي-ثانية (أدنى 2 كما تفعل المتصفحات).
pub fn delay_cs(ms: u64) -> u16 {
    (((ms + 5) / 10).max(2)).min(u16::MAX as u64) as u16
}

/// BGRA (GDI، من الأعلى للأسفل) ⇒ NV12 (BT.601 مدى محدود) بأبعاد زوجية w×h.
pub fn bgra_to_nv12(bgra: &[u8], w: usize, h: usize) -> Vec<u8> {
    let mut out = vec![0u8; w * h * 3 / 2];
    let (yp, uv) = out.split_at_mut(w * h);
    for y in 0..h {
        for x in 0..w {
            let i = (y * w + x) * 4;
            let (b, g, r) = (bgra[i] as i32, bgra[i + 1] as i32, bgra[i + 2] as i32);
            yp[y * w + x] = (((66 * r + 129 * g + 25 * b + 128) >> 8) + 16) as u8;
        }
    }
    for y in (0..h).step_by(2) {
        for x in (0..w).step_by(2) {
            let (mut r, mut g, mut b) = (0i32, 0i32, 0i32);
            for (dy, dx) in [(0, 0), (0, 1), (1, 0), (1, 1)] {
                let i = ((y + dy) * w + x + dx) * 4;
                b += bgra[i] as i32;
                g += bgra[i + 1] as i32;
                r += bgra[i + 2] as i32;
            }
            let (r, g, b) = (r / 4, g / 4, b / 4);
            let o = (y / 2) * w + x;
            uv[o] = ((((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128).clamp(0, 255)) as u8;
            uv[o + 1] = ((((112 * r - 94 * g - 18 * b + 128) >> 8) + 128).clamp(0, 255)) as u8;
        }
    }
    out
}

/// تصغير BGRA ⇒ RGBA بمتوسط الصناديق (box filter) من w×h إلى dw×dh.
pub fn downscale_bgra_to_rgba(src: &[u8], w: usize, h: usize, dw: usize, dh: usize) -> Vec<u8> {
    let mut out = vec![255u8; dw * dh * 4];
    for dy in 0..dh {
        let y0 = dy * h / dh;
        let y1 = (((dy + 1) * h) / dh).max(y0 + 1).min(h);
        for dx in 0..dw {
            let x0 = dx * w / dw;
            let x1 = (((dx + 1) * w) / dw).max(x0 + 1).min(w);
            let (mut r, mut g, mut b, mut n) = (0u32, 0u32, 0u32, 0u32);
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = (y * w + x) * 4;
                    b += src[i] as u32;
                    g += src[i + 1] as u32;
                    r += src[i + 2] as u32;
                    n += 1;
                }
            }
            let o = (dy * dw + dx) * 4;
            out[o] = (r / n) as u8;
            out[o + 1] = (g / n) as u8;
            out[o + 2] = (b / n) as u8;
        }
    }
    out
}
// END PURE

// ───────────────────────── الحالة ─────────────────────────

struct Active {
    stop: Arc<AtomicBool>,
    started_at: u64,
    format: &'static str,
    handle: JoinHandle<Result<String, String>>,
}

#[derive(Default)]
pub struct RecorderState {
    shortcut: Mutex<Option<Shortcut>>,
    active: Mutex<Option<Active>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecordState {
    pub recording: bool,
    /// وقت البدء (ms منذ epoch) — الواجهة تحسب المؤقّت منه.
    pub started_at: u64,
    pub format: &'static str,
    pub path: Option<String>,
    pub error: Option<String>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn emit_state(app: &AppHandle, s: RecordState) {
    let _ = app.emit("record:state", s);
}

// ───────────────────────── الاختصار والإعدادات ─────────────────────────

/// يعيد تسجيل hotkeyRecord (فارغ/غير صالح = معطّل).
pub fn rebind(app: &AppHandle) {
    let st = app.state::<RecorderState>();
    crate::capture::bind(app, &st.shortcut, "hotkeyRecord", None);
}

/// hotkeyRecord يبدّل: أثناء التسجيل ⇒ إيقاف، وإلا ⇒ تحضير (اختيار منطقة).
pub fn on_shortcut(app: &AppHandle, sc: &Shortcut) -> bool {
    let st = app.state::<RecorderState>();
    let mine = st.shortcut.lock().unwrap().as_ref() == Some(sc);
    if !mine {
        return false;
    }
    if st.active.lock().unwrap().is_some() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = record_stop(app).await;
        });
    } else {
        crate::capture::start(app, "record");
    }
    true
}

#[cfg(windows)]
fn videos_dir() -> Option<std::path::PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Videos, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    unsafe {
        let p = SHGetKnownFolderPath(&FOLDERID_Videos, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s.map(std::path::PathBuf::from)
    }
    .or_else(|| std::env::var_os("USERPROFILE").map(|u| std::path::PathBuf::from(u).join("Videos")))
}
#[cfg(not(windows))]
fn videos_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").map(|u| std::path::PathBuf::from(u).join("Videos"))
}

/// recordingDir أو Videos\MyIsland.
fn recording_dir(app: &AppHandle) -> std::path::PathBuf {
    let s = crate::capture::setting_str(app, "recordingDir");
    if !s.is_empty() {
        return s.into();
    }
    videos_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join("MyIsland")
}

fn setting_u32(app: &AppHandle, key: &str, default: u32) -> u32 {
    app.state::<crate::state::AppState>()
        .settings
        .lock()
        .unwrap()
        .get(key)
        .and_then(|v| v.as_u64())
        .map(|n| n as u32)
        .unwrap_or(default)
}

// ───────────────────────── الترميز ─────────────────────────

/// إطار خام (BGRA من الأعلى للأسفل) مع زمنه بـms منذ بدء التسجيل.
type Raw = (Vec<u8>, u64);

/// ترميز gif: إطار واحد معلّق ينتظر الإطار التالي ليُحسب تأخيره من الفرق الحقيقي بين الزمنين.
fn encode_gif(
    rx: std::sync::mpsc::Receiver<Raw>,
    path: &str,
    (w, h): (u32, u32),
    (dw, dh): (u32, u32),
    fps: u32,
) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| format!("تعذّر إنشاء {path}: {e}"))?;
    let mut enc = gif::Encoder::new(std::io::BufWriter::new(file), dw as u16, dh as u16, &[])
        .map_err(|e| e.to_string())?;
    enc.set_repeat(gif::Repeat::Infinite).map_err(|e| e.to_string())?;
    let default_ms = 1000 / fps.max(1) as u64;
    let make = |bgra: &[u8], delay: u16| {
        let mut rgba = downscale_bgra_to_rgba(bgra, w as usize, h as usize, dw as usize, dh as usize);
        let mut f = gif::Frame::from_rgba_speed(dw as u16, dh as u16, &mut rgba, 10);
        f.delay = delay;
        f
    };
    let mut pending: Option<(Vec<u8>, u64)> = None;
    for (bgra, at) in rx.iter() {
        if let Some((pb, pat)) = pending.take() {
            enc.write_frame(&make(&pb, delay_cs(at.saturating_sub(pat)))).map_err(|e| e.to_string())?;
        }
        pending = Some((bgra, at));
    }
    if let Some((pb, _)) = pending {
        enc.write_frame(&make(&pb, delay_cs(default_ms))).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
fn encode_mp4(
    rx: std::sync::mpsc::Receiver<Raw>,
    path: &str,
    (w, h): (u32, u32),
    fps: u32,
    bitrate: u32,
) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Media::MediaFoundation::*;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    let pack = |a: u32, b: u32| ((a as u64) << 32) | b as u64;
    let e = |what: &str, err: windows::core::Error| format!("{what}: {err}");
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        MFStartup(MF_VERSION, MFSTARTUP_FULL).map_err(|x| e("MFStartup", x))?;
        // يضمن MFShutdown حتى عند الخطأ.
        struct Shutdown;
        impl Drop for Shutdown {
            fn drop(&mut self) {
                unsafe {
                    let _ = MFShutdown();
                }
            }
        }
        let _sd = Shutdown;

        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let writer = MFCreateSinkWriterFromURL(PCWSTR(wide.as_ptr()), None, None)
            .map_err(|x| e("MFCreateSinkWriterFromURL", x))?;

        let out = MFCreateMediaType().map_err(|x| e("MFCreateMediaType", x))?;
        out.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video).map_err(|x| e("major", x))?;
        out.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264).map_err(|x| e("subtype", x))?;
        out.SetUINT32(&MF_MT_AVG_BITRATE, bitrate).map_err(|x| e("bitrate", x))?;
        out.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32).map_err(|x| e("interlace", x))?;
        out.SetUINT64(&MF_MT_FRAME_SIZE, pack(w, h)).map_err(|x| e("size", x))?;
        out.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1)).map_err(|x| e("rate", x))?;
        out.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack(1, 1)).map_err(|x| e("par", x))?;
        let stream = writer.AddStream(&out).map_err(|x| e("AddStream", x))?;

        // الإدخال NV12 (من الأعلى للأسفل بلا غموض اتجاه) فلا يحتاج الكاتب محوّل ألوان.
        let inp = MFCreateMediaType().map_err(|x| e("MFCreateMediaType", x))?;
        inp.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video).map_err(|x| e("major", x))?;
        inp.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_NV12).map_err(|x| e("subtype", x))?;
        inp.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32).map_err(|x| e("interlace", x))?;
        inp.SetUINT64(&MF_MT_FRAME_SIZE, pack(w, h)).map_err(|x| e("size", x))?;
        inp.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1)).map_err(|x| e("rate", x))?;
        inp.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack(1, 1)).map_err(|x| e("par", x))?;
        writer.SetInputMediaType(stream, &inp, None).map_err(|x| e("SetInputMediaType", x))?;
        writer.BeginWriting().map_err(|x| e("BeginWriting", x))?;

        let duration = (10_000_000u64 / fps.max(1) as u64) as i64;
        for (bgra, at) in rx.iter() {
            let nv12 = bgra_to_nv12(&bgra, w as usize, h as usize);
            let buf = MFCreateMemoryBuffer(nv12.len() as u32).map_err(|x| e("MFCreateMemoryBuffer", x))?;
            let mut p: *mut u8 = std::ptr::null_mut();
            buf.Lock(&mut p, None, None).map_err(|x| e("Lock", x))?;
            std::ptr::copy_nonoverlapping(nv12.as_ptr(), p, nv12.len());
            buf.Unlock().map_err(|x| e("Unlock", x))?;
            buf.SetCurrentLength(nv12.len() as u32).map_err(|x| e("SetCurrentLength", x))?;
            let sample = MFCreateSample().map_err(|x| e("MFCreateSample", x))?;
            sample.AddBuffer(&buf).map_err(|x| e("AddBuffer", x))?;
            sample.SetSampleTime(at as i64 * 10_000).map_err(|x| e("SetSampleTime", x))?;
            sample.SetSampleDuration(duration).map_err(|x| e("SetSampleDuration", x))?;
            writer.WriteSample(stream, &sample).map_err(|x| e("WriteSample", x))?;
        }
        writer.Finalize().map_err(|x| e("Finalize", x))?;
    }
    Ok(())
}
#[cfg(not(windows))]
fn encode_mp4(
    _rx: std::sync::mpsc::Receiver<Raw>,
    _path: &str,
    _dims: (u32, u32),
    _fps: u32,
    _bitrate: u32,
) -> Result<(), String> {
    Err("تسجيل mp4 يتطلب ويندوز".into())
}

struct Job {
    gx: i32,
    gy: i32,
    w: u32,
    h: u32,
    format: &'static str,
    fps: u32,
    quality: Quality,
    path: String,
}

/// خيط التقاط الإطارات (الخيط الذي يُنتظر في record_stop).
fn capture_loop(app: AppHandle, job: Job, stop: Arc<AtomicBool>) -> Result<String, String> {
    // الطبقة اختفت للتو؛ امهل المركّب لحظة كي لا تظهر في أول إطار.
    std::thread::sleep(Duration::from_millis(180));
    crate::capture::apply_affinity(&app);
    let (tx, rx) = sync_channel::<Raw>(3);
    let path = job.path.clone();
    let (w, h, fps, q) = (job.w, job.h, job.fps, job.quality);
    let enc = std::thread::spawn(move || {
        if job.format == "gif" {
            let f = gif_fps(fps);
            encode_gif(rx, &path, (w, h), gif_dims(w, h, q), f)
        } else {
            encode_mp4(rx, &path, (w, h), fps, bitrate(w, h, fps, q))
        }
    });
    let fps_run = if job.format == "gif" { gif_fps(fps) } else { fps.max(1) };
    let interval = Duration::from_millis((1000 / fps_run as u64).max(1));
    let start = Instant::now();
    let mut next = start;
    let mut err: Option<String> = None;
    while !stop.load(Ordering::Relaxed) {
        match crate::capture::grab_bgra(job.gx, job.gy, job.w, job.h) {
            Ok(buf) => {
                let at = start.elapsed().as_millis() as u64;
                match tx.try_send((buf, at)) {
                    Ok(()) | Err(TrySendError::Full(_)) => {} // ممتلئ ⇒ أسقط الإطار
                    Err(TrySendError::Disconnected(_)) => break, // المرمّز فشل
                }
            }
            Err(e) => {
                err = Some(e);
                break;
            }
        }
        next += interval;
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else {
            next = now; // تأخرنا: لا نلاحق
        }
    }
    drop(tx);
    let enc_res = enc.join().map_err(|_| "خيط الترميز انهار".to_string())?;
    if let Some(e) = err {
        return Err(e);
    }
    enc_res?;
    Ok(job.path)
}

// ───────────────────────── الأوامر ─────────────────────────

/// record_begin() — تحضير: يفتح طبقة تحديد المنطقة (نفس 3.2). Enter بلا تحديد = الشاشة كاملة.
#[tauri::command]
pub fn record_begin(app: AppHandle) -> Result<(), String> {
    if app.state::<RecorderState>().active.lock().unwrap().is_some() {
        return Err("التسجيل جارٍ".into());
    }
    crate::capture::start(&app, "record");
    Ok(())
}

/// record_start(x,y,w,h) — من الطبقة (بكسلات فعلية نسبةً لزاوية الشاشة الملتقطة): يبدأ التسجيل
/// إلى recordingDir بصيغة recordFormat وrecordingFps وrecordingQuality. يعيد مسار الملف الجاري.
#[tauri::command]
pub fn record_start(app: AppHandle, x: i64, y: i64, w: i64, h: i64) -> Result<String, String> {
    let st = app.state::<RecorderState>();
    if st.active.lock().unwrap().is_some() {
        crate::capture::cancel(&app);
        return Err("التسجيل جارٍ".into());
    }
    let f = crate::capture::take_frame(&app, "record")?;
    let (cx, cy, cw, ch) = crate::capture::clamp_rect(x, y, w, h, f.w, f.h).ok_or("منطقة فارغة")?;
    let (cw, ch) = (even(cw), even(ch));
    if cw < 2 || ch < 2 {
        return Err("المنطقة صغيرة جدًا للتسجيل".into());
    }
    let format: &'static str = if crate::capture::setting_str(&app, "recordFormat") == "gif" { "gif" } else { "mp4" };
    let fps = if setting_u32(&app, "recordingFps", 30) >= 60 { 60 } else { 30 };
    let quality = parse_quality(&crate::capture::setting_str(&app, "recordingQuality"));
    let dir = recording_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| format!("تعذّر إنشاء {}: {e}", dir.display()))?;
    let path = dir.join(crate::capture::stamp_ext(format)).to_string_lossy().into_owned();
    let job = Job { gx: f.x + cx as i32, gy: f.y + cy as i32, w: cw, h: ch, format, fps, quality, path: path.clone() };
    let stop = Arc::new(AtomicBool::new(false));
    let (a2, s2) = (app.clone(), stop.clone());
    let handle = std::thread::spawn(move || {
        let r = capture_loop(a2.clone(), job, s2);
        // انتهاء ذاتي (خطأ التقاط/ترميز) ⇒ حرّر الحالة وأبلغ الواجهة.
        if let Err(e) = &r {
            let taken = {
                let st = a2.state::<RecorderState>();
                let mut g = st.active.lock().unwrap();
                if g.as_ref().map(|a| !a.stop.load(Ordering::Relaxed)).unwrap_or(false) { g.take() } else { None }
            };
            if let Some(act) = taken {
                emit_state(
                    &a2,
                    RecordState { recording: false, started_at: 0, format: act.format, path: None, error: Some(e.clone()) },
                );
            }
        }
        r
    });
    let started_at = now_ms();
    *st.active.lock().unwrap() = Some(Active { stop, started_at, format, handle });
    emit_state(&app, RecordState { recording: true, started_at, format, path: Some(path.clone()), error: None });
    Ok(path)
}

/// record_stop() — يوقف التسجيل ويُنهي الملف؛ يعيد مساره (None إن لم يكن تسجيل جارٍ).
#[tauri::command]
pub async fn record_stop(app: AppHandle) -> Result<Option<String>, String> {
    let act = app.state::<RecorderState>().active.lock().unwrap().take();
    let Some(act) = act else { return Ok(None) };
    act.stop.store(true, Ordering::Relaxed);
    let format = act.format;
    let res = tauri::async_runtime::spawn_blocking(move || act.handle.join())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "خيط التسجيل انهار".to_string())?;
    match res {
        Ok(path) => {
            emit_state(&app, RecordState { recording: false, started_at: 0, format, path: Some(path.clone()), error: None });
            Ok(Some(path))
        }
        Err(e) => {
            emit_state(&app, RecordState { recording: false, started_at: 0, format, path: None, error: Some(e.clone()) });
            Err(e)
        }
    }
}

/// record_status() — حالة التسجيل الحالية (لإعادة بناء الواجهة بعد إعادة تحميل الصفحة).
#[tauri::command]
pub fn record_status(app: AppHandle) -> RecordState {
    match app.state::<RecorderState>().active.lock().unwrap().as_ref() {
        Some(a) => RecordState { recording: true, started_at: a.started_at, format: a.format, path: None, error: None },
        None => RecordState { recording: false, started_at: 0, format: "mp4", path: None, error: None },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quality_and_bitrate() {
        assert_eq!(parse_quality("HIGH"), Quality::High);
        assert_eq!(parse_quality("low"), Quality::Low);
        assert_eq!(parse_quality("whatever"), Quality::Medium);
        let lo = bitrate(1920, 1080, 30, Quality::Low);
        let hi = bitrate(1920, 1080, 30, Quality::High);
        assert!(lo < hi);
        assert_eq!(bitrate(16, 16, 30, Quality::Low), 500_000);
        assert_eq!(bitrate(7680, 4320, 60, Quality::High), 40_000_000);
    }

    #[test]
    fn dims_and_delays() {
        assert_eq!(even(1081), 1080);
        assert_eq!(gif_dims(1920, 1080, Quality::Medium), (640, 360));
        assert_eq!(gif_dims(300, 200, Quality::High), (300, 200));
        assert_eq!(gif_fps(60), 20);
        assert_eq!(gif_fps(15), 15);
        assert_eq!(delay_cs(33), 3);
        assert_eq!(delay_cs(1), 2);
        assert_eq!(delay_cs(1000), 100);
    }

    #[test]
    fn nv12_known_colors() {
        // 2×2 أبيض ⇒ Y=235 (مدى محدود) وUV=128؛ أسود ⇒ Y=16.
        let white = [255u8; 16];
        let o = bgra_to_nv12(&white, 2, 2);
        assert_eq!(o.len(), 6);
        assert!(o[..4].iter().all(|&y| y == 235));
        assert_eq!((o[4], o[5]), (128, 128));
        let mut black = [0u8; 16];
        for p in black.chunks_exact_mut(4) {
            p[3] = 255;
        }
        assert!(bgra_to_nv12(&black, 2, 2)[..4].iter().all(|&y| y == 16));
        // أحمر نقي (BGRA = 0,0,255): V عالٍ وU منخفض.
        let red = [0, 0, 255, 255].repeat(4);
        let o = bgra_to_nv12(&red, 2, 2);
        assert!(o[5] > 200 && o[4] < 110);
    }

    #[test]
    fn downscale_averages_and_swaps() {
        // 2×1: أحمر BGRA(0,0,255) وأزرق BGRA(255,0,0) ⇒ 1×1 متوسطهما RGBA(127,0,127).
        let src = [0, 0, 255, 255, 255, 0, 0, 255];
        let o = downscale_bgra_to_rgba(&src, 2, 1, 1, 1);
        assert_eq!(o, vec![127, 0, 127, 255]);
        // نفس الحجم ⇒ تبديل القنوات فقط.
        let o = downscale_bgra_to_rgba(&src, 2, 1, 2, 1);
        assert_eq!(o, vec![255, 0, 0, 255, 0, 0, 255, 255]);
    }
}
