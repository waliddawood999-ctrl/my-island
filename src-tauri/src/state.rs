// AppState: إعدادات الموضع الافتراضية الآن (الجلسة 0.2 تربطها بجدول kv) + حالة نافذة الحبة.
use std::sync::Mutex;

/// قيَم الموضع — تطابق مفاتيح monitor / offsetX / underTaskbar في src/settings.ts.
#[derive(Clone, Copy, Debug)]
pub struct PlacementSettings {
    pub monitor: usize,
    pub offset_x: i32,
    pub under_taskbar: bool,
}

impl Default for PlacementSettings {
    fn default() -> Self {
        Self { monitor: 0, offset_x: 0, under_taskbar: false }
    }
}

#[derive(Default)]
pub struct AppState {
    pub placement: Mutex<PlacementSettings>,
    pub hidden: Mutex<bool>,
    /// آخر مستطيل للحبة أبلغت عنه الواجهة (بوحدات CSS: عرض، ارتفاع).
    pub island_size: Mutex<(f64, f64)>,
}
