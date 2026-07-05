// 一回限りのDBマイグレーション（finance_folders 年月カラム追加）
const { createClient } = require("@supabase/supabase-js");

const SQL = `
ALTER TABLE finance_folders
  ADD COLUMN IF NOT EXISTS folder_type text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS year_num integer,
  ADD COLUMN IF NOT EXISTS month_num integer;
UPDATE finance_folders SET folder_type = 'normal' WHERE folder_type IS NULL;
`;

const MIGRATE_TOKEN = "finance-ym-migrate-20260705";

module.exports = async (req, res) => {
  const key = req.headers["x-migrate-key"] || req.query.key;
  if (key !== MIGRATE_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (dbUrl) {
    try {
      const postgres = require("postgres");
      const sql = postgres(dbUrl, { ssl: "require", max: 1 });
      await sql.unsafe(SQL);
      await sql.end();
      return res.status(200).json({ ok: true, method: "postgres" });
    } catch (e) {
      console.error("postgres migration failed:", e);
      return res.status(500).json({ error: e.message, method: "postgres" });
    }
  }

  // POSTGRES_URL が無い場合: Supabase RPC exec_sql があれば使う
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: "missing SUPABASE_URL or SUPABASE_SERVICE_KEY" });
  }

  const supabase = createClient(url, serviceKey);
  const { error } = await supabase.rpc("exec_sql", { query: SQL });
  if (error) {
    return res.status(500).json({
      error: error.message,
      hint: "POSTGRES_URL または exec_sql RPC が必要です。Supabase SQL Editor で手動実行してください。",
    });
  }
  return res.status(200).json({ ok: true, method: "rpc" });
};
