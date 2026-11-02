// اختيار جلسة الميديا (منطق نقي بلا اعتماديات — حسب المخطط §7/media): يُختبر على قوائم جلسات وهمية.
// يستعمله media.rs فقط؛ لا WinRT ولا Tauri هنا كي تعمل الاختبارات على أي نظام (rustc --test).

/// حالة تشغيل جلسة كما تراها منطق الاختيار. `Other` = متوقفة/مغلقة/مجهولة (بما فيها فشل جلب PlaybackInfo).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Playback { Playing, Paused, Other }

/// ما يلزم لترتيب جلسة GSMTC — بيانات خالصة بلا أي استدعاء WinRT كي يُختبر الاختيار على قوائم وهمية.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Candidate {
    pub id: String,
    pub playback: Playback,
    /// `LastUpdatedTime` للخط الزمني (100ns منذ 1601)؛ None = لا خط زمني أو فشل جلبه.
    pub timeline_at: Option<i64>,
    /// هل هي جلسة النظام الحالية (`GetCurrentSession`) — كاسر تعادل أخير فقط.
    pub is_system_current: bool,
}

/// قرار العرض: جلسة GSMTC (فهرسها) · نشاط صوتي بديل (audiosess) · لا شيء.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Resolution { Session(usize), Audio, Nothing }

/// يختار الجلسة الفعّالة من **كل** الجلسات (لا جلسة النظام الحالية فقط). منطق نقي موثّق:
/// 1. المصدر المختار يدويًا (`picked`) إن وُجد بين الجلسات يغلب كل شيء.
/// 2. وإلا الترتيب التنازلي بالمفتاح: (قيد التشغيل؟) ثم (حداثة الخط الزمني؛ غيابه = الأقدم) ثم (جلسة النظام الحالية)
///    ثم الأسبق في القائمة (حتمية). أي مفتاح أعلى يغلب ما بعده.
pub fn select_session(cands: &[Candidate], picked: &Option<String>) -> Option<usize> {
    if let Some(id) = picked {
        if let Some(i) = cands.iter().position(|c| &c.id == id) {
            return Some(i);
        }
    }
    cands
        .iter()
        .enumerate()
        .max_by_key(|(i, c)| (c.playback == Playback::Playing, c.timeline_at.unwrap_or(i64::MIN), c.is_system_current, std::cmp::Reverse(*i)))
        .map(|(i, _)| i)
}

/// القرار النهائي بين GSMTC والبديل الصوتي: الاختيار اليدوي وأي جلسة GSMTC قيد التشغيل يغلبان البديل؛
/// البديل يظهر فقط حين لا جلسة تعمل فعلًا (لا جلسة، أو الفعّالة متوقفة) ويوجد صوت حقيقي من تطبيق بلا جلسة.
pub fn resolve(cands: &[Candidate], picked: &Option<String>, alt_present: bool) -> Resolution {
    let manual = picked.as_ref().map(|id| cands.iter().any(|c| &c.id == id)).unwrap_or(false);
    match select_session(cands, picked) {
        Some(i) if manual || cands[i].playback == Playback::Playing || !alt_present => Resolution::Session(i),
        _ if alt_present => Resolution::Audio,
        Some(i) => Resolution::Session(i),
        None => Resolution::Nothing,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(id: &str, playback: Playback, at: Option<i64>, cur: bool) -> Candidate {
        Candidate { id: id.into(), playback, timeline_at: at, is_system_current: cur }
    }
    const NONE: Option<String> = None;

    #[test]
    fn empty_list_is_nothing_or_audio() {
        assert_eq!(resolve(&[], &NONE, false), Resolution::Nothing);
        assert_eq!(resolve(&[], &NONE, true), Resolution::Audio);
    }

    #[test]
    fn browser_only_regression() {
        // مسار المتصفح الشغال حاليًا: جلسة واحدة تُختار دائمًا، وبوجود بديل صوتي تبقى هي (تعمل) ولا يغلبها البديل.
        let l = [c("Chrome", Playback::Playing, Some(100), true)];
        assert_eq!(select_session(&l, &NONE), Some(0));
        assert_eq!(resolve(&l, &NONE, false), Resolution::Session(0));
        assert_eq!(resolve(&l, &NONE, true), Resolution::Session(0));
        // متصفح متوقف مؤقتًا بلا بديل: يبقى معروضًا (متوقفًا) كما اليوم
        let p = [c("Chrome", Playback::Paused, Some(100), true)];
        assert_eq!(resolve(&p, &NONE, false), Resolution::Session(0));
    }

    #[test]
    fn app_only_session() {
        let l = [c("Spotify.exe", Playback::Playing, Some(5), false)];
        // حتى لو لم تكن «جلسة النظام الحالية» تُختار (هذا عين الخلل المبلَّغ)
        assert_eq!(select_session(&l, &NONE), Some(0));
    }

    #[test]
    fn concurrent_playing_wins_over_current_and_paused() {
        let l = [
            c("Chrome", Playback::Paused, Some(900), true),    // جلسة النظام الحالية لكنها متوقفة
            c("VLC", Playback::Playing, Some(100), false),     // تعمل فعلًا
        ];
        assert_eq!(select_session(&l, &NONE), Some(1));
    }

    #[test]
    fn concurrent_playing_most_recent_timeline_wins() {
        let l = [
            c("Chrome", Playback::Playing, Some(100), true),
            c("Spotify", Playback::Playing, Some(500), false),
            c("Edge", Playback::Playing, Some(300), false),
        ];
        assert_eq!(select_session(&l, &NONE), Some(1));
    }

    #[test]
    fn full_tie_prefers_system_current_then_first() {
        let l = [c("A", Playback::Playing, Some(7), false), c("B", Playback::Playing, Some(7), true)];
        assert_eq!(select_session(&l, &NONE), Some(1));
        let l2 = [c("A", Playback::Playing, Some(7), false), c("B", Playback::Playing, Some(7), false)];
        assert_eq!(select_session(&l2, &NONE), Some(0));
    }

    #[test]
    fn failed_properties_session_is_not_dropped() {
        // PlaybackInfo فشل (Other) والخط الزمني فشل (None): تبقى مرشّحة وتُختار إن كانت الوحيدة…
        let only = [c("Game.exe", Playback::Other, None, true)];
        assert_eq!(resolve(&only, &NONE, false), Resolution::Session(0));
        // …وتخسر أمام جلسة سليمة تعمل
        let mixed = [c("Game.exe", Playback::Other, None, true), c("Chrome", Playback::Playing, Some(1), false)];
        assert_eq!(select_session(&mixed, &NONE), Some(1));
    }

    #[test]
    fn session_without_timeline_ranks_below_dated_one_of_same_status() {
        let l = [c("NoTimeline", Playback::Playing, None, true), c("Dated", Playback::Playing, Some(1), false)];
        assert_eq!(select_session(&l, &NONE), Some(1));
        // وإن تساوى الجميع بلا خط زمني فجلسة النظام ثم الأسبق
        let l2 = [c("X", Playback::Playing, None, false), c("Y", Playback::Playing, None, true)];
        assert_eq!(select_session(&l2, &NONE), Some(1));
    }

    #[test]
    fn manual_pick_beats_everything_and_falls_back_when_gone() {
        let l = [c("Chrome", Playback::Playing, Some(900), true), c("VLC", Playback::Paused, None, false)];
        assert_eq!(select_session(&l, &Some("VLC".into())), Some(1));
        assert_eq!(resolve(&l, &Some("VLC".into()), true), Resolution::Session(1)); // يدوي يغلب البديل الصوتي
        assert_eq!(select_session(&l, &Some("Gone".into())), Some(0)); // المختار اختفى ⇒ تلقائي
    }

    #[test]
    fn audio_fallback_only_when_nothing_is_actually_playing() {
        let paused = [c("Chrome", Playback::Paused, Some(1), true)];
        assert_eq!(resolve(&paused, &NONE, true), Resolution::Audio);
        let playing = [c("Chrome", Playback::Playing, Some(1), true)];
        assert_eq!(resolve(&playing, &NONE, true), Resolution::Session(0));
        assert_eq!(resolve(&[], &NONE, true), Resolution::Audio);
    }
}
