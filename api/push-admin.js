/* global require, module, process */
// /api/push-admin.js
// プッシュ通知の宛先管理(管理者専用)。一覧取得・ON/OFF切替・削除・テスト送信を行う。
// home_settingsのfinance_passwordとパスコードを照合し、一致しなければ403にする。
// 送信の共通処理(VAPID設定・1件送信・エラー種別分け)はapi/_pushLib.jsに切り出し、
// analyze.js(電話通知)と共用している(第8弾テーマ26-5)。
const { createClient } = require("@supabase/supabase-js");
const { PushAdminError, ensureVapidConfigured, sendPushToOne } = require("./_pushLib");

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

// 1件へテスト送信する。410/404(端末が無効)はenabled=falseに戻す。
// 送信本体・エラー種別分けはapi/_pushLib.jsのsendPushToOne()を使う(push-admin.js固有の
// テスト文面・無効化処理だけをここで渡す。挙動は切り出し前と同じ)。
async function sendTestToOne(sub) {
  return sendPushToOne(
    sub,
    { title: "IGUMI管理システム", body: "テスト通知です。これが届けば設定は正常です。", url: "/" },
    {},
    async (id) => {
      await getSupabase()
        .from("push_subscriptions")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("id", id);
    }
  );
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
  const { passcode, action } = body;

  try {
    const ok = await verifyPasscode(passcode);
    if (!ok) {
      recordFail(ip);
      return res.status(403).json({ error: "パスコードが違います" });
    }
    recordSuccess(ip);

    const supabase = getSupabase();

    if (action === "toggle") {
      const { id, enabled } = body;
      if (!id || typeof enabled !== "boolean") {
        return res.status(400).json({ error: "指定が不正です" });
      }
      const { error } = await supabase
        .from("push_subscriptions")
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return res.status(400).json({ error: "idが必要です" });
      const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === "test") {
      let targets = [];
      if (body.id) {
        const { data, error } = await supabase.from("push_subscriptions").select("*").eq("id", body.id).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: "端末が見つかりません" });
        targets = [data];
      } else if (body.staff_name) {
        const { data, error } = await supabase
          .from("push_subscriptions")
          .select("*")
          .eq("staff_name", body.staff_name)
          .eq("enabled", true);
        if (error) throw error;
        targets = data || [];
      } else {
        return res.status(400).json({ error: "idまたはstaff_nameを指定してください" });
      }
      if (!targets.length) return res.status(400).json({ error: "対象の端末がありません" });

      ensureVapidConfigured();
      const results = await Promise.all(targets.map(sendTestToOne));
      return res.status(200).json({ ok: true, results });
    }

    // デフォルト(action省略 または "list"): 一覧取得。endpoint・p256dh・authは返さない。
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, staff_name, device_label, enabled, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return res.status(200).json({ ok: true, subscriptions: data || [] });
  } catch (err) {
    if (err instanceof PushAdminError) {
      // あらかじめ安全な日本語文だけを用意したエラー。種類をそのまま画面に返してよい。
      console.error("[push-admin] push admin error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    // それ以外(DBエラー等)は、生のメッセージを画面には出さない。
    console.error("[push-admin] error:", err.message);
    return res.status(500).json({ error: "操作に失敗しました" });
  }
};
