-- island.db — نفس سكيما الأصل (rusqlite / SQLite, WAL)
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS clips(
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,            -- text | image | file
  text TEXT,
  image_path TEXT,               -- الصور ملفات على القرص
  thumb TEXT,                    -- مصغّر base64
  width INTEGER, height INTEGER,
  hash TEXT NOT NULL UNIQUE,     -- منع التكرار
  pinned INTEGER NOT NULL DEFAULT 0,
  source TEXT,                   -- التطبيق المصدر
  created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS shelf(
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  name TEXT, icon TEXT, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS launcher(
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,     -- ON CONFLICT(path) DO NOTHING
  name TEXT, icon TEXT,
  position INTEGER NOT NULL DEFAULT 0);

-- كل شيء آخر: إعدادات، ملاحظة، تذكيرات، حالة ترخيص (JSON)
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
