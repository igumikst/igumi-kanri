/* global require, module, process */
// /api/push-subscribe.js
// プッシュ通知の端末登録(本人がセルフサービスで行う。管理者パスコードは不要)。
// push_subscriptionsはanon/authenticatedから一切触れない設計のため、
// このサーバー関数だけがservice keyで読み書きする(第8弾テーマ26-3)。
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

const MAX_LEN = { endpoint: 500, p256dh: 200, auth: 200, staff_name: 50, device_label: 50 };

// 簡易レート制限(厳密な対策ではない。サーバーレス関数のインスタンスごとにリセットされうる
// 前提の、簡単な乱用防止)。同一IPから1時間に20件まで。
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const hits = (rateMap.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateMap.set(ip, hits);
  return hits.length <= RATE_LIMIT_MAX;
}

function isValidString(v, maxLen) {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "しばらく時間をおいてから、もう一度お試しください" });
  }

  const body = req.body || {};

  try {
    const supabase = getSupabase();

    // 状態確認(自分のendpointだけを問い合わせる。パスコード不要)
    if (body.action === "status") {
      const { endpoint } = body;
      if (!isValidString(endpoint, MAX_LEN.endpoint)) {
        return res.status(400).json({ error: "endpointが不正です" });
      }
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("enabled")
        .eq("endpoint", endpoint)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ registered: !!data, enabled: !!data?.enabled });
    }

    // 新規登録・端末情報の更新
    const { endpoint, keys, staff_name, device_label } = body;
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;

    if (!isValidString(endpoint, MAX_LEN.endpoint)) return res.status(400).json({ error: "endpointが不正です" });
    if (!isValidString(p256dh, MAX_LEN.p256dh)) return res.status(400).json({ error: "p256dhが不正です" });
    if (!isValidString(auth, MAX_LEN.auth)) return res.status(400).json({ error: "authが不正です" });
    if (!isValidString(staff_name, MAX_LEN.staff_name)) return res.status(400).json({ error: "お名前を選んでください" });
    if (device_label != null && !isValidString(device_label, MAX_LEN.device_label)) {
      return res.status(400).json({ error: "device_labelが不正です" });
    }

    // 既存行があるかを先に確認する。あれば p256dh・auth・device_label・updated_at だけ更新し、
    // enabled・staff_nameは絶対に変更しない(登録直後のON化や名前の差し替えを防ぐ)。
    const { data: existing, error: selErr } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      const { error: updErr } = await supabase
        .from("push_subscriptions")
        .update({
          p256dh,
          auth,
          device_label: device_label ? device_label.trim() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("endpoint", endpoint);
      if (updErr) throw updErr;
      return res.status(200).json({ ok: true, updated: true });
    }

    // 新規登録は必ずenabled=false(クライアントからenabledを受け取っても一切見ない)
    const { error: insErr } = await supabase.from("push_subscriptions").insert([{
      endpoint,
      p256dh,
      auth,
      staff_name: staff_name.trim(),
      device_label: device_label ? device_label.trim() : null,
      enabled: false,
    }]);
    if (insErr) throw insErr;
    return res.status(200).json({ ok: true, updated: false });
  } catch (err) {
    console.error("[push-subscribe] error:", err.message);
    return res.status(500).json({ error: "登録に失敗しました" });
  }
};
