/* global require, module, process */
// /api/_pushLib.js
// プッシュ通知送信の共通部品(第8弾テーマ26-4bのpush-admin.jsから切り出し、
// テーマ26-5でanalyze.jsとpush-admin.jsの両方から使う)。
// module.exportsにハンドラ関数を置いていないため、Vercelの独立したURLルートにはならない
// (api/analyze.jsと同じ、内部モジュールとしての位置づけ)。
//
// 秘密鍵・endpoint・認証鍵の値は、ここでもログ・戻り値のどちらにも出さない
// (エラーの「種類」とHTTPステータスコードだけを返す)。

let webpush = null;
let webpushLoadError = null;
try {
  webpush = require("web-push");
} catch (err) {
  webpushLoadError = err;
}

// 画面・ログに出してよい「原因の種類」だけを運ぶエラー。
class PushAdminError extends Error {}

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

// 1件へ送信する。410/404(端末が無効)はdeactivate(id)を呼んで無効化を委ねる
// (呼び出し元がそれぞれ自分のSupabaseクライアントで無効化するため、ここでは行わない)。
async function sendPushToOne(sub, payload, options, deactivate) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      options || {}
    );
    return { id: sub.id, success: true };
  } catch (err) {
    const statusCode = err?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      if (deactivate) {
        try {
          await deactivate(sub.id);
        } catch (deactivateErr) {
          console.error("[_pushLib] deactivate failed:", deactivateErr.message);
        }
      }
      return { id: sub.id, success: false, deactivated: true, error: `送信先が無効でした(ステータス: ${statusCode})。端末を無効にしました` };
    }
    if (typeof statusCode === "number") {
      console.error("[_pushLib] send error status:", statusCode);
      return { id: sub.id, success: false, deactivated: false, error: `送信先がエラーを返しました(ステータス: ${statusCode})` };
    }
    console.error("[_pushLib] send error category:", err?.name || "unknown");
    return { id: sub.id, success: false, deactivated: false, error: "送信できませんでした(その他のエラー)" };
  }
}

module.exports = { PushAdminError, cleanEnvValue, ensureVapidConfigured, sendPushToOne };
