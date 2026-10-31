// الطيف (حسب المخطط §7/spectrum): التقاط WASAPI loopback من جهاز الإخراج الفعلي الحالي
// + FFT (rustfft) إلى 32 نطاقًا لوغاريتميًا 0..1 → الحدث media:bands بمعدّل ~30fps.
// يعمل فقط عند: جلسة ميديا تعمل + liquidSpectrum مفعّل + الحبة ظاهرة؛ غير ذلك لا التقاط إطلاقًا.
// خصوصية: لا يُسجَّل ولا يُحفظ أي صوت — العيّنات تُحلَّل لحظيًا في الذاكرة وتُهمل.
use tauri::AppHandle;

pub const BANDS: usize = 32;

/// تنعيم: هجوم سريع وانحسار أبطأ.
pub fn smooth(prev: f32, new: f32) -> f32 {
    if new > prev { prev + (new - prev) * 0.6 } else { prev + (new - prev) * 0.18 }
}

/// حدود النطاقات اللوغاريتمية (فهارس bins) بين ~40Hz و~16kHz؛ كل نطاق ≥ bin واحد.
pub fn band_edges(sample_rate: f32, fft_len: usize) -> [usize; BANDS + 1] {
    let bin_hz = sample_rate / fft_len as f32;
    let (lo, hi) = (40.0f32, (16000.0f32).min(sample_rate / 2.0 - 1.0));
    let mut e = [0usize; BANDS + 1];
    let mut prev = ((lo / bin_hz).round() as usize).max(1);
    e[0] = prev;
    for i in 1..=BANDS {
        let f = lo * (hi / lo).powf(i as f32 / BANDS as f32);
        let b = ((f / bin_hz).round() as usize).max(prev + 1).min(fft_len / 2);
        e[i] = b;
        prev = b;
    }
    e
}

/// يحوّل أطياف السعة إلى نطاقات مُطبَّعة 0..1 (مقياس dB: -70..-10).
pub fn bands_from_spectrum(mag: &[f32], edges: &[usize; BANDS + 1], out: &mut [f32; BANDS]) {
    for b in 0..BANDS {
        let (a, z) = (edges[b].min(mag.len()), edges[b + 1].min(mag.len()).max(edges[b].min(mag.len()) + 1));
        let mut peak = 0.0f32;
        for &m in &mag[a..z.min(mag.len())] { peak = peak.max(m); }
        let db = 20.0 * peak.max(1e-9).log10();
        out[b] = ((db + 70.0) / 60.0).clamp(0.0, 1.0);
    }
}

pub fn start(app: &AppHandle) {
    #[cfg(windows)]
    win_impl::start(app.clone());
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod win_impl {
    use super::*;
    use rustfft::{num_complex::Complex, FftPlanner};
    use std::time::{Duration, Instant};
    use tauri::{Emitter, Manager};
    use windows::{
        core::PWSTR,
        Win32::Media::Audio::*,
        Win32::System::Com::*,
    };

    const FFT_LEN: usize = 2048;

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || run(app));
    }

    /// شروط الالتقاط: ميديا تعمل + liquidSpectrum + الحبة غير مخفية.
    fn wanted(app: &AppHandle) -> bool {
        let playing = {
            let m = app.state::<crate::media::MediaState>();
            let i = m.info.lock().unwrap();
            i.session && i.playing
        };
        if !playing { return false; }
        let st = app.state::<crate::state::AppState>();
        let on = st.settings.lock().unwrap().get("liquidSpectrum").and_then(|v| v.as_bool()).unwrap_or(false);
        let hidden = *st.hidden.lock().unwrap();
        on && !hidden
    }

    fn run(app: AppHandle) {
        unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
        loop {
            if wanted(&app) {
                // يعود عند انتفاء الشرط أو تغيّر جهاز الإخراج أو خطأ؛ الحلقة تعيد المحاولة.
                if let Err(e) = capture(&app) { eprintln!("spectrum: {e}"); std::thread::sleep(Duration::from_secs(1)); }
            } else {
                std::thread::sleep(Duration::from_millis(250));
            }
        }
    }

    unsafe fn default_device(en: &IMMDeviceEnumerator) -> windows::core::Result<(IMMDevice, String)> {
        let dev = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let id: PWSTR = dev.GetId()?;
        let s = id.to_string().unwrap_or_default();
        CoTaskMemFree(Some(id.0 as *const _));
        Ok((dev, s))
    }

    fn capture(app: &AppHandle) -> Result<(), String> {
        unsafe { capture_inner(app).map_err(|e| e.to_string()) }
    }

    unsafe fn capture_inner(app: &AppHandle) -> windows::core::Result<()> {
        let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let (dev, dev_id) = default_device(&en)?;
        let client: IAudioClient = dev.Activate(CLSCTX_ALL, None)?;
        let fmt = client.GetMixFormat()?;
        let (ch, rate, bits, tag) = ((*fmt).nChannels as usize, (*fmt).nSamplesPerSec as f32, (*fmt).wBitsPerSample, (*fmt).wFormatTag);
        // IEEE float (3) مباشرة أو WAVE_FORMAT_EXTENSIBLE (0xFFFE) — الغالب float32 في وضع المشاركة.
        let is_float = tag == 3 || (tag == 0xFFFE && bits == 32);
        let res = client.Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK, 2_000_000, 0, fmt, None);
        CoTaskMemFree(Some(fmt as *const _));
        res?;
        let cap: IAudioCaptureClient = client.GetService()?;
        client.Start()?;

        let fft = FftPlanner::<f32>::new().plan_fft_forward(FFT_LEN);
        let window: Vec<f32> = (0..FFT_LEN).map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (FFT_LEN as f32 - 1.0)).cos()).collect();
        let edges = band_edges(rate, FFT_LEN);
        let mut ring = vec![0f32; FFT_LEN];
        let mut filled = 0usize;
        let mut buf = vec![Complex { re: 0f32, im: 0f32 }; FFT_LEN];
        let mut mag = vec![0f32; FFT_LEN / 2];
        let mut cur = [0f32; BANDS];
        let mut raw = [0f32; BANDS];
        let tick = Duration::from_millis(33);
        let mut next = Instant::now() + tick;
        let mut check = Instant::now();

        let result = loop {
            // استنزاف الحزم المتاحة إلى حلقة العيّنات (مزيج أحادي) — لا تُحفظ في أي مكان آخر.
            loop {
                let n = cap.GetNextPacketSize()?;
                if n == 0 { break; }
                let mut data = std::ptr::null_mut();
                let (mut frames, mut flags) = (0u32, 0u32);
                cap.GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;
                let silent = flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0;
                for f in 0..frames as usize {
                    let mut v = 0f32;
                    if !silent && ch > 0 {
                        for c in 0..ch {
                            v += if is_float { *(data as *const f32).add(f * ch + c) }
                                 else { *(data as *const i16).add(f * ch + c) as f32 / 32768.0 };
                        }
                        v /= ch as f32;
                    }
                    ring[filled % FFT_LEN] = v;
                    filled += 1;
                }
                cap.ReleaseBuffer(frames)?;
            }
            let now = Instant::now();
            if now >= next {
                next = now + tick;
                if filled >= FFT_LEN {
                    let start = filled % FFT_LEN;
                    for i in 0..FFT_LEN {
                        buf[i] = Complex { re: ring[(start + i) % FFT_LEN] * window[i], im: 0.0 };
                    }
                    fft.process(&mut buf);
                    for i in 0..FFT_LEN / 2 { mag[i] = buf[i].norm() * 4.0 / FFT_LEN as f32; }
                    bands_from_spectrum(&mag, &edges, &mut raw);
                } else {
                    raw = [0.0; BANDS];
                }
                for b in 0..BANDS { cur[b] = smooth(cur[b], raw[b]); }
                let _ = app.emit("media:bands", cur.to_vec());
            }
            // فحص الشروط وجهاز الإخراج كل ~300ms: الإيقاف يُنهي الالتقاط كليًا.
            if check.elapsed() >= Duration::from_millis(300) {
                check = Instant::now();
                if !wanted(app) { break Ok(()); }
                if let Ok((_, id)) = default_device(&en) { if id != dev_id { break Ok(()); } }
            }
            std::thread::sleep(Duration::from_millis(8));
        };
        let _ = client.Stop();
        // إشارة أخيرة بالصفر كي تهدأ الواجهة فورًا
        let _ = app.emit("media:bands", vec![0f32; BANDS]);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn edges_monotonic() {
        let e = band_edges(48000.0, 2048);
        for i in 0..BANDS { assert!(e[i + 1] > e[i]); }
    }
    #[test]
    fn tone_lands_in_expected_band() {
        // نغمة 1kHz عند 48kHz
        let (n, rate) = (2048usize, 48000.0f32);
        let mut p = rustfft::FftPlanner::<f32>::new();
        let fft = p.plan_fft_forward(n);
        let mut buf: Vec<_> = (0..n).map(|i| rustfft::num_complex::Complex { re: (2.0 * std::f32::consts::PI * 1000.0 * i as f32 / rate).sin() * (0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (n as f32 - 1.0)).cos()), im: 0.0 }).collect();
        fft.process(&mut buf);
        let mag: Vec<f32> = buf[..n / 2].iter().map(|c| c.norm() * 4.0 / n as f32).collect();
        let e = band_edges(rate, n);
        let mut out = [0f32; BANDS];
        bands_from_spectrum(&mag, &e, &mut out);
        let k = (1000.0 / (rate / n as f32)).round() as usize;
        let band = (0..BANDS).find(|&b| e[b] <= k && k < e[b + 1]).unwrap();
        let top = out.iter().cloned().enumerate().fold((0, 0.0), |a, (i, v)| if v > a.1 { (i, v) } else { a }).0;
        assert_eq!(top, band);
        assert!(out[band] > 0.5);
        assert!(out[0] < 0.1 && out[BANDS - 1] < 0.1);
    }
    #[test]
    fn smoothing_attack_faster_than_release() {
        assert!(smooth(0.0, 1.0) > 1.0 - smooth(1.0, 0.0));
    }
}
