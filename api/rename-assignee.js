/* global require, module, process */
// /api/rename-assignee.js
// 担当者の名前変更(リネーム)。担当者管理画面からの管理者操作専用。
// home_settingsのfinance_passwordとパスコードを照合し、一致しなければ403にする
// (api/push-admin.jsと同じ作り)。実際の付け替えは、DBの関数 rename_assignee に
// すべて任せる(anon/authenticatedからは直接呼べない関数のため、ここでservice keyを使う)。
const { createClient } = require("@supabase/supabase-js");

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_KEY not set");
  _supabase = createClient(url, key);
  return _supabase;
}

// 連続で間違えた場合の簡易ロック(厳密な対策ではない。インスタンスごとにリセットされうる前提)
const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000;
const failMap = new Map();

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
function checkLock(ip) {
  const entry = failMap.get(ip);
  return !!(entry && entry.lockedUntil && Date.now() < entry.lockedUntil);
}
function recordFail(ip) {
  const entry = failMap.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOCK_THRESHOLD) {
    entry.lockedUntil = Date.now() + LOCK_DURATION_MS;
    entry.count = 0;
  }
  failMap.set(ip, entry);
}
function recordSuccess(ip) { failMap.delete(ip); }

async function verifyPasscode(passcode) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("home_settings").select("value").eq("id", "finance_password").single();
  if (error) throw error;
  const saved = data?.value?.password;
  if (!saved) return false; // 未設定なら誰も入れない(安全側)
  return typeof passcode === "string" && passcode === saved;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (checkLock(ip)) {
    return res.status(403).json({ error: "しばらく時間をおいてから、もう一度お試しください" });
  }

  const body = req.body || {};
  const { passcode, oldName, newName } = body;

  if (typeof oldName !== "string" || !oldName.trim() || typeof newName !== "string" || !newName.trim()) {
    return res.status(400).json({ error: "名前を正しく指定してください" });
  }

  try {
    const ok = await verifyPasscode(passcode);
    if (!ok) {
      recordFail(ip);
      return res.status(403).json({ error: "パスコードが違います" });
    }
    recordSuccess(ip);

    const supabase = getSupabase();
    const { error } = await supabase.rpc("rename_assignee", { p_old_name: oldName.trim(), p_new_name: newName.trim() });
    if (error) {
      // rename_assignee関数の中のraise exception(SQLSTATE P0001)は、そのまま画面に出してよい日本語文
      const safe = error.code === "P0001";
      console.error("[rename-assignee] error:", error.message);
      return res.status(safe ? 400 : 500).json({ error: safe ? error.message : "変更に失敗しました" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[rename-assignee] error:", err.message);
    return res.status(500).json({ error: "変更に失敗しました" });
  }
};
