-- 001: وقتي (attention.rs) — ثواني التركيز لكل تطبيق أمامي في اليوم المحلي.
-- محلي فقط: اسم ملف exe بلا عناوين نوافذ ولا محتوى. يُحتفظ بـ30 يومًا.
CREATE TABLE IF NOT EXISTS attention_daily(
  day TEXT NOT NULL,             -- YYYY-MM-DD بالتوقيت المحلي
  app TEXT NOT NULL,             -- اسم الملف التنفيذي بلا .exe (مطبّع لحروف صغيرة)
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, app));
