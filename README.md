# Island Clone — Starter
هيكل بداية لبناء نسختك من Dynamic Island لويندوز، مبني على الهندسة العكسية
لـ Island v1.2.8 (Tauri 2 + Rust + React). المخطط الكامل:
../reverse-engineering/island/BLUEPRINT.md

## البنية
- src-tauri/        خلفية Rust: tauri.conf.json + schema.sql + وحدات src/
- src/settings.ts   مخطط الإعدادات الكامل (~110 حقول) بأنواع TypeScript
- src/i18n.ts       دالة اللغتين inline على طريقة الأصل: i(ar, en)
- src/pages/        أربع صفحات Vite: island / overlay / settings / editor
- docs/IPC.md       عقد الأوامر والأحداث الكامل (132 أمرًا)
- docs/BLUEPRINT.md المخطط الكامل (داخل المشروع الآن — مرجع الوكيل الأول)
- AGENTS.md         تعليمات الوكيل الدائمة (يقرؤها Codex تلقائيًا)
- PROMPTS.md        برومبتات المرحلتين 0 و1 جاهزة للصق بالترتيب

## قبل البناء (على جهاز ويندوز)
1. ثبّت Rust + Node + WebView2 + أدوات VS Build Tools
2. npm install  ثم  npm run tauri dev
هذا الهيكل كُتب كمرجع بداية ولم يُبنَ/يُختبَر على ويندوز داخل بيئة التحليل.
