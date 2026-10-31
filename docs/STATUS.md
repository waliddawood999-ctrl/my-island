# حالة المشروع
- المرحلة الحالية: 0 — الجلسة 0.1 مكتملة برمجيًا (القبول البصري على ويندوز لم يُجرَّب بعد)
- اكتمل: الهندسة العكسية + المخطط + IPC + AGENTS/CLAUDE + PROMPTS؛ 0.0 (Vite/React/Tailwind/Tauri بأربع صفحات)؛
  0.1: `win.rs` (WS_EX_NOACTIVATE + TOOLWINDOW، موضع أعلى المنتصف حسب monitor/offsetX/underTaskbar بقيَم افتراضية في `state.rs`، إخفاء/إظهار ناعم بلا تنشيط)، `commands.rs` (`set_island_hidden`, `report_island_rect`)، اختصار Ctrl+Alt+I في `lib.rs`، مكوّن الحبة `src/pages/island/Pill.tsx` (أسود 200×32 بساعة HH:MM عبر i()). حدث جديد `island:hidden` مسجّل في docs/IPC.md.
- تحقق فعليًا: `npm run build` و`tsc --noEmit` ناجحان؛ `cargo check --target x86_64-pc-windows-gnu` ناجح بلا تحذيرات (على Linux بـwindres وهمي لأن البيئة بلا أدوات ويندوز؛ `cargo check` الأصلي يفشل هنا لغياب gtk/webkit فقط).
- لم يُتحقق منه (يحتاج ويندوز): الحبة ظاهرة أعلى المنتصف، Notepad لا يفقد الفوكس عند الكتابة/النقر، Ctrl+Alt+I يُخفي ويُظهر. شغّل `npm run tauri dev`.
- ملاحظات: النافذة تُقاس على حجم الحبة عبر report_island_rect (لوحة 720×480 في 0.2 ستغيّر ذلك)؛ tauri-plugin-updater مؤجّل للمرحلة 5؛ `watchdog` معلّق للجلسة 0.3.
- التالي: برومبت 0.2
- آخر خطأ معروف: لا شيء
