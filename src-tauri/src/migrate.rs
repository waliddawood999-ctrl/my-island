// ترحيلات island.db المرقّمة (AGENTS.md §6): schema.sql هو الأساس (user_version 0)،
// وكل تغيير سكيما لاحق ملف `migrations/NNN_*.sql` يُسجَّل هنا ويُنفَّذ مرة واحدة بترتيبه.
use rusqlite::Connection;

/// (رقم الترحيل، نصه). الأرقام متصاعدة بلا فجوات؛ لا تعدّل ترحيلًا منفَّذًا — أضف جديدًا.
pub const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/001_attention.sql")),
];

/// يشغّل الترحيلات التي رقمها أكبر من PRAGMA user_version، كلٌّ في معاملة، ويعيد الإصدار النهائي.
pub fn run(conn: &mut Connection, list: &[(i64, &str)]) -> rusqlite::Result<i64> {
    let mut ver: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (n, sql) in list {
        if *n <= ver { continue; }
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute_batch(&format!("PRAGMA user_version = {n}"))?;
        tx.commit()?;
        ver = *n;
    }
    Ok(ver)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runs_once_in_order_and_is_idempotent() {
        let mut c = Connection::open_in_memory().unwrap();
        let list = [(1, "CREATE TABLE a(x)"), (2, "CREATE TABLE b(x)")];
        assert_eq!(run(&mut c, &list).unwrap(), 2);
        // إعادة التشغيل لا تنفّذ شيئًا (وإلا فشل CREATE TABLE بلا IF NOT EXISTS)
        assert_eq!(run(&mut c, &list).unwrap(), 2);
        let list3 = [(1, "CREATE TABLE a(x)"), (2, "CREATE TABLE b(x)"), (3, "CREATE TABLE c(x)")];
        assert_eq!(run(&mut c, &list3).unwrap(), 3);
    }
    #[test]
    fn failed_migration_rolls_back_and_keeps_version() {
        let mut c = Connection::open_in_memory().unwrap();
        assert!(run(&mut c, &[(1, "CREATE TABLE a(x)"), (2, "CREATE TABLE b(x); BOGUS SQL")]).is_err());
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 1);
        assert!(c.prepare("SELECT 1 FROM b").is_err());
    }
    #[test]
    fn real_attention_migration_applies() {
        let mut c = Connection::open_in_memory().unwrap();
        assert_eq!(run(&mut c, MIGRATIONS).unwrap(), MIGRATIONS.last().unwrap().0);
        c.execute("INSERT INTO attention_daily(day,app,seconds) VALUES('2026-01-01','x',5)", []).unwrap();
    }
}
