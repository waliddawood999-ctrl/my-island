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
