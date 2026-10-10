/* global require, module, process */
// /api/push-admin.js
// プッシュ通知の宛先管理(管理者専用)。一覧取得・ON/OFF切替・削除・テスト送信を行う。
// home_settingsのfinance_passwordとパスコードを照合し、一致しなければ403にする。
const { createClient } = require("@supabase/supabase-js");

let webpush = null;
let webpushLoadError = null;
try {
  webpush = require("web-push");
} catch (err) {
  webpushLoadError = err;
}

// 画面・ログに出してよい「原因の種類」だけを運ぶエラー。秘密鍵・endpoint・鍵の値は含めない。
class PushAdminError extends Error {}

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

// 前後の空白・改行・引用符を取り除く(Vercelの環境変数への貼り付け時の混入対策)
function cleanEnvValue(v) {
  if (typeof v !== "string") return "";
  return v.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function ensureVapidConfigured() {
  if (webpushLoadError) {
    throw new PushAdminError("web-pushの読み込みに失敗しました(サーバー側の設定を確認してください)");
  }

  const subject = cleanEnvValue(process.env.VAPID_SUBJECT);
  const publicKey = cleanEnvValue(process.env.VITE_VAPID_PUBLIC_KEY);
  const privateKey = cleanEnvValue(process.env.VAPID_PRIVATE_KEY);

  if (!subject || !publicKey || !privateKey) {
    throw new PushAdminError("VAPID未設定(VAPID_PRIVATE_KEY・VITE_VAPID_PUBLIC_KEY・VAPID_SUBJECTのいずれかが空です)");
  }
  if (!/^(mailto:|https:)/i.test(subject)) {
    throw new PushAdminError("VAPID連絡先の形式エラー(VAPID_SUBJECTはmailto:またはhttps:で始まる必要があります)");
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    throw new PushAdminError("VAPID鍵の形式エラー(公開鍵・秘密鍵の値に余分な文字が混ざっていないか確認してください)");
  }
}

// 1件へテスト送信する。410/404(端末が無効)はenabled=falseに戻す。
async function sendTestToOne(sub) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        title: "IGUMI管理システム",
        body: "テスト通知です。これが届けば設定は正常です。",
        url: "/",
      })
    );
    return { id: sub.id, success: true };
  } catch (err) {
    const statusCode = err?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await getSupabase()
        .from("push_subscriptions")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("id", sub.id);
      return { id: sub.id, success: false, deactivated: true, error: `送信先が無効でした(ステータス: ${statusCode})。端末を無効にしました` };
    }
    if (typeof statusCode === "number") {
      console.error("[push-admin] send error status:", statusCode);
      return { id: sub.id, success: false, deactivated: false, error: `送信先がエラーを返しました(ステータス: ${statusCode})` };
    }
    console.error("[push-admin] send error category:", err?.name || "unknown");
    return { id: sub.id, success: false, deactivated: false, error: "送信できませんでした(その他のエラー)" };
  }
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
