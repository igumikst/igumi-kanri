// エラーを日本語の分かりやすい文に変換する共通関数(第8弾テーマ14)。
// 画面の見せ方は今まで通り alert() のまま: describeError() が返す文字列を
// そのまま alert() に渡す想定(①何が起きたか ②どうすればいいか ③詳細、の3段)。
//
// 対象は「Postgres/Storageなどの生エラーに日本語を被せる」箇所だけ。
// バリデーション文(「タイトルを入力してください」等)やファイル取り込みの
// 既存の日本語エラー(parseEst.js等)は、この関数を通さずそのまま表示する。

// Postgresのエラーコードでの判定を優先する(メッセージの文字列より壊れにくい)
const CODE_REASONS = {
  "23505": { reason: "すでに同じ内容のデータが登録されています。", how: "内容を確認してから、もう一度お試しください。" },
  "23514": { reason: "入力できない値が含まれています。", how: "入力内容を確認してください。" },
  "42501": { reason: "この操作を行う権限がありません。", how: "担当の方に確認してください。" },
};

// 23503(外部キー制約)は、挿入側(参照先が無い)と削除側(参照されていて消せない)で
// 言うべきことが違うので、メッセージの中身で振り分ける
function fkReason(message) {
  if (/is still referenced from table/i.test(message)) {
    return { reason: "関連するデータがあるため、削除・変更できません。", how: "先に関連するデータを確認してください。" };
  }
  return { reason: "関連するデータが見つかりません。", how: "画面を更新してから、もう一度お試しください。" };
}

// エラーコードが無いもの(fetchの失敗やStorageのエラーなど)は、メッセージ文字列で補助判定する
function reasonFromMessage(message) {
  if (!message) return null;
  if (/Failed to fetch|NetworkError|network error|ERR_NETWORK|ERR_INTERNET/i.test(message)) {
    return { reason: "通信に失敗しました。", how: "ネットワーク接続を確認して、もう一度お試しください。" };
  }
  if (/payload too large|exceeded the maximum allowed size|request entity too large/i.test(message)) {
    return { reason: "ファイルの容量が大きすぎます。", how: "ファイルを小さくしてから、もう一度お試しください。" };
  }
  if (/resource already exists|duplicate/i.test(message)) {
    return { reason: "すでに同じファイルが保存されています。", how: "少し時間をおいてから、もう一度お試しください。" };
  }
  return null;
}

/**
 * @param {unknown} error - Supabase/fetchなどから受け取った生のエラー
 * @param {string} [action] - 何をしようとしていたか(例: "保存"・"明細の保存"・"削除")。省略可
 * @returns {string} alert()にそのまま渡せる、①何が起きたか ②どうすればいいか ③詳細、の3段の文字列
 */
export function describeError(error, action) {
  const message = (error && (error.message || error.error_description)) || String(error ?? "") || "不明なエラー";
  const code = error?.code;

  const known = (code && CODE_REASONS[code]) || (code === "23503" ? fkReason(message) : null) || reasonFromMessage(message);
  const { reason, how } = known || { reason: "想定外のエラーです。", how: "下の詳細を、そのまま伝えてください。" };

  const prefix = action ? `${action}に失敗しました。` : "";
  return `${prefix}${reason}\n${how}\n\n詳細: ${message}`;
}

/**
 * describeError()と同じ3段の文を、通信(fetch)・外部APIからの生エラー向けに作る
 * (第8弾テーマ14・段階5-A)。Postgresのエラーコードは前提にせず、メッセージ文字列だけで
 * 判定する。英語の生メッセージ(「Method not allowed」やAPI側のエラー文など)が来ても、
 * 先頭は必ず日本語の説明にし、元の文字列は「詳細」としてそのまま残す。
 * @param {unknown} error - fetchの例外、またはAPIが返したエラー文字列
 * @param {string} [action] - 何をしようとしていたか(例: "送信"・"自動修正の実行")。省略可
 * @returns {string} describeError()と同じ形の、①何が起きたか②どうすればいいか③詳細の文字列
 */
export function describeApiError(error, action) {
  const message = (error && (error.message || error.error_description)) || String(error ?? "") || "不明なエラー";
  const { reason, how } = reasonFromMessage(message) || { reason: "操作が正しく完了しませんでした。", how: "もう一度お試しください。改善しない場合は、下の詳細を伝えてください。" };
  const prefix = action ? `${action}に失敗しました。` : "";
  return `${prefix}${reason}\n${how}\n\n詳細: ${message}`;
}
