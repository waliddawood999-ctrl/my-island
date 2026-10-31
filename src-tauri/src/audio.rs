// audio — مستوى صوت جهاز الإخراج الافتراضي وكتمه عبر IAudioEndpointVolume (حسب المخطط §7/audio).
// أوامر: volume_get / volume_set(level 0..1) / volume_step(delta) / volume_mute_toggle
// كلها تعيد {available, volume 0..1, muted} وتبثّ الحدث audio:state بعد كل تغيير.
// لا خيط خلفي: كل شيء عند الطلب.
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct VolumeState {
    pub available: bool,
    pub volume: f32,
    pub muted: bool,
}

pub fn clamp01(v: f32) -> f32 { if v.is_nan() { 0.0 } else { v.clamp(0.0, 1.0) } }

#[cfg(windows)]
fn endpoint() -> Result<windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume, String> {
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    unsafe {
        // قد يكون الخيط مهيّأً مسبقًا بنمط آخر؛ النتيجة تُهمل ويبقى COM صالحًا.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        let dev = en.GetDefaultAudioEndpoint(eRender, eConsole).map_err(|e| e.to_string())?;
        dev.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
fn read(ep: &windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume) -> VolumeState {
    unsafe {
        VolumeState {
            available: true,
            volume: clamp01(ep.GetMasterVolumeLevelScalar().unwrap_or(0.0)),
            muted: ep.GetMute().map(|b| b.as_bool()).unwrap_or(false),
        }
    }
}

#[cfg(windows)]
fn with<F: FnOnce(&windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume) -> Result<(), String>>(f: F) -> Result<VolumeState, String> {
    let ep = endpoint()?;
    f(&ep)?;
    Ok(read(&ep))
}
#[cfg(not(windows))]
fn with<F: FnOnce(&()) -> Result<(), String>>(_f: F) -> Result<VolumeState, String> { Ok(VolumeState::default()) }

fn announce(app: &AppHandle, r: Result<VolumeState, String>) -> Result<VolumeState, String> {
    if let Ok(s) = &r { let _ = app.emit("audio:state", s); }
    r
}

#[tauri::command]
pub fn volume_get() -> VolumeState {
    #[cfg(windows)]
    { endpoint().map(|e| read(&e)).unwrap_or_default() }
    #[cfg(not(windows))]
    { VolumeState::default() }
}

#[tauri::command]
pub fn volume_set(app: AppHandle, level: f32) -> Result<VolumeState, String> {
    let level = clamp01(level);
    #[cfg(windows)]
    let r = with(|ep| unsafe {
        ep.SetMasterVolumeLevelScalar(level, std::ptr::null()).map_err(|e| e.to_string())?;
        // رفع الصوت يفكّ الكتم تلقائيًا كما يفعل ويندوز.
        if level > 0.0 { let _ = ep.SetMute(false, std::ptr::null()); }
        Ok(())
    });
    #[cfg(not(windows))]
    let r = with(|_| { let _ = level; Ok(()) });
    announce(&app, r)
}

#[tauri::command]
pub fn volume_step(app: AppHandle, delta: f32) -> Result<VolumeState, String> {
    let cur = volume_get();
    volume_set(app, clamp01(cur.volume + delta))
}

#[tauri::command]
pub fn volume_mute_toggle(app: AppHandle) -> Result<VolumeState, String> {
    #[cfg(windows)]
    let r = with(|ep| unsafe {
        let m = ep.GetMute().map_err(|e| e.to_string())?.as_bool();
        ep.SetMute(!m, std::ptr::null()).map_err(|e| e.to_string())
    });
    #[cfg(not(windows))]
    let r = with(|_| Ok(()));
    announce(&app, r)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clamp() {
        assert_eq!(clamp01(1.5), 1.0);
        assert_eq!(clamp01(-0.2), 0.0);
        assert_eq!(clamp01(f32::NAN), 0.0);
        assert_eq!(clamp01(0.42), 0.42);
    }
}
