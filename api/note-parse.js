/* global process */
// /api/note-parse.js
// 現調ノートの文字を受け取り、AIで分解したJSON(下書きの材料)を返す。
// 本体は _noteParseCore.js。単価表への当てはめ・金額の計算は、画面側のプログラムで行う。
// 時間の上限は vercel.json の functions["api/note-parse.js"].maxDuration(60秒)。
import { parseNote, NoteParseError, NOTE_PARSE_DEFAULT_MODEL } from "./_noteParseCore.js";
import { getClientIp, createRateLimiter, verifyNotePassphrase } from "./_notePassphraseLib.js";

// ---- 不正利用対策(guard) ----
// 1) 回数制限: task-notify.js・push-subscribe.js と同じやり方(同じIPから1時間に20件まで)。
//    合言葉の確認より先に数えるので、合言葉の総当たりも止まる。
//    ※ 数はサーバーのメモリに持つため、Vercel のインスタンス(サーバーの入れ物)ごとの目安になる
// 2) 合言葉(見積作成パスワード): 画面から送る言葉をヘッダー x-note-passphrase で受け取り、
//    public.server_secrets に保存したハッシュ(scrypt)と照らし合わせる(_notePassphraseLib.js)。
//    合言葉は設定画面からマスターキーで設定する(api/note-passphrase.js)。マスターキーではここは通らない。
//    未設定のときは、誰も使えない(503)。画面は encodeURIComponent した値を送る(日本語の合言葉でも送れるように)。
export const PASSPHRASE_HEADER = "x-note-passphrase";
const rateLimit = createRateLimiter({ max: 20, windowMs: 60 * 60 * 1000 });

async function guard(req) {
  if (!rateLimit(getClientIp(req))) {
    return { ok: false, status: 429, error: "しばらく時間をおいてから、もう一度お試しください(1時間あたりの回数の上限です)" };
  }
  let given = req.headers[PASSPHRASE_HEADER];
  if (typeof given !== "string" || !given) return { ok: false, status: 401, error: "合言葉を入力してください" };
  try { given = decodeURIComponent(given); } catch { return { ok: false, status: 401, error: "合言葉が違います" }; }
  let result;
  try { result = await verifyNotePassphrase(given); } catch (e) {
    console.error("[note-parse] passphrase check failed:", e?.message);
    return { ok: false, status: 503, error: "合言葉を確認できませんでした。時間をおいてもう一度お試しください" };
  }
  if (result === "unset") return { ok: false, status: 503, code: "unset", error: "見積作成パスワードが、まだ設定されていません(設定画面で設定してください)" };
  if (result !== "ok") return { ok: false, status: 401, code: "passphrase", error: "合言葉が違います" };
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", `Content-Type, ${PASSPHRASE_HEADER}`);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const g = await guard(req);
  if (!g.ok) return res.status(g.status).json({ ok: false, error: g.error, code: g.code });

  try {
    const { text } = req.body || {};
    const model = process.env.NOTE_PARSE_MODEL || NOTE_PARSE_DEFAULT_MODEL;
    const { draft, meta } = await parseNote({ text, model });
    return res.status(200).json({ ok: true, draft, meta });
  } catch (e) {
    // ノートの中身はログに出さない(個人情報を残さないため)
    console.error("[note-parse] error:", e?.status, e?.message);
    const status = e instanceof NoteParseError ? e.status : 500;
    return res.status(status).json({ ok: false, error: e instanceof NoteParseError ? e.message : "予期しないエラーが発生しました" });
  }
}
