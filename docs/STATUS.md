# حالة المشروع
- المرحلة الحالية: 0 — الجلسة 0.1 اكتملت (بناءً وتحققًا جزئيًا — انظر أدناه)
- اكتمل: الهندسة العكسية + المخطط + IPC + AGENTS/CLAUDE + PROMPTS + هيكل أولي.
  الجلسة 0.1: `win.rs` (WS_EX_NOACTIVATE + TOOLWINDOW، موضع أعلى المنتصف حسب monitor/offsetX/underTaskbar بقيَم افتراضية في `state.rs`، إخفاء/إظهار ناعم بلا تنشيط)، `commands.rs` (`set_island_hidden`, `report_island_rect`)، اختصار Ctrl+Alt+I في `lib.rs`، مكوّن الحبة `src/pages/island/Pill.tsx` (ساعة HH:MM حيّة عبر i()).
  تمهيد مطلوب لـ0.1 لأن 0.0 لم تُنفَّذ: `Cargo.toml`/`build.rs`/`main.rs`/`capabilities`/أيقونات، و`vite.config.ts` (مدخل index فقط)/`tsconfig.json`/`index.html`، وتثبيت npm (plugin-react ثُبّت على ^4 لتوافق vite 6).
- تحقق فعليًا: `npm run build` ناجح، `tsc --noEmit` نظيف، وكود Rust (win/commands/lib) يمر `cargo check` لهدف `x86_64-pc-windows-gnu` (على نسخة مؤقتة بلا tauri-plugin-updater وبـwindres وهمي لأن بيئة Linux بلا مترجم C لويندوز).
- لم يُتحقق منه (يحتاج ويندوز فعليًا): قبول 0.1 البصري — الحبة أعلى المنتصف، Notepad لا يفقد الفوكس، الاختصار يُخفي/يُظهر. شغّل `npm run tauri dev` وتحقق.
- متبقٍ من 0.0 (لم يُنفَّذ، غير مطلوب لـ0.1): صفحات overlay/settings/editor ومداخل rollup لها، و`src-tauri/Cargo.toml` لم يُبنَ بالكامل على ويندوز بعد. `watchdog.rs` غير موجود (معلّق في lib.rs للجلسة 0.3).
- ملاحظة: tauri-build المتاح للإصدار 2.x هو 2.7 (لا يوجد 2.12 لهذه الحزمة؛ tauri نفسه 2.12).
- التالي: برومبت 0.2
- آخر خطأ معروف: لا شيء
