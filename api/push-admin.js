/* global require, module, process */
// /api/push-admin.js
// プッシュ通知の宛先管理(管理者専用)。今回は一覧取得の骨組みだけ。
// ON/OFFの切り替えは第8弾テーマ26-4で追加する。
// home_settingsのfinance_passwordとパスコードを照合し、一致しなければ403にする。
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
  if (entry && entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return true;
  }
  return false;
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

function recordSuccess(ip) {
  failMap.delete(ip);
}

async function verifyPasscode(passcode) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("home_settings")
    .select("value")
    .eq("id", "finance_password")
    .single();
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

  const { passcode } = req.body || {};

  try {
    const ok = await verifyPasscode(passcode);
    if (!ok) {
      recordFail(ip);
      return res.status(403).json({ error: "パスコードが違います" });
    }
    recordSuccess(ip);

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, staff_name, device_label, enabled, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return res.status(200).json({ ok: true, subscriptions: data || [] });
  } catch (err) {
    console.error("[push-admin] error:", err.message);
    return res.status(500).json({ error: "取得に失敗しました" });
  }
};
