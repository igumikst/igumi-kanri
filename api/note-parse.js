/* global process */
// /api/note-parse.js
// 現調ノートの文字を受け取り、AIで分解したJSON(下書きの材料)を返す。
// 本体は _noteParseCore.js。単価表への当てはめ・金額の計算は、画面側のプログラムで行う。
// 時間の上限は vercel.json の functions["api/note-parse.js"].maxDuration(60秒)。
import { createHash, timingSafeEqual } from "node:crypto";
import { parseNote, NoteParseError, NOTE_PARSE_DEFAULT_MODEL } from "./_noteParseCore.js";

// ---- 不正利用対策(guard) ----
// 1) 回数制限: task-notify.js・push-subscribe.js と同じやり方(同じIPから1時間に20件まで)。
//    合言葉の確認より先に数えるので、合言葉の総当たりも止まる。
//    ※ 数はサーバーのメモリに持つため、Vercel のインスタンス(サーバーの入れ物)ごとの目安になる
// 2) 合言葉: 画面から送る専用の言葉を、ヘッダー x-note-passphrase で受け取り、
//    Vercel の環境変数 NOTE_PARSE_PASSPHRASE と照らし合わせる(値はコードにもリポジトリにも書かない)。
//    環境変数が無いときは、誰も使えないようにする(閉じた状態で失敗させる)。
//    画面は encodeURIComponent した値を送る(日本語の合言葉でも送れるように)。
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT_MAX = 20;
export const PASSPHRASE_HEADER = "x-note-passphrase";
const rateMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const hits = (rateMap.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateMap.set(ip, hits);
  return hits.length <= RATE_LIMIT_MAX;
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// 長さの違いで手がかりを与えないよう、両方をハッシュにしてから比べる
const digest = s => createHash("sha256").update(String(s), "utf8").digest();
function passphraseMatches(given, expected) {
  return timingSafeEqual(digest(given), digest(expected));
}

function guard(req) {
  if (!checkRateLimit(getClientIp(req))) {
    return { ok: false, status: 429, error: "しばらく時間をおいてから、もう一度お試しください(1時間あたりの回数の上限です)" };
  }
  const expected = process.env.NOTE_PARSE_PASSPHRASE;
  if (!expected) return { ok: false, status: 503, error: "ノート見積作成の合言葉が、まだ設定されていません(管理者に連絡してください)" };
  let given = req.headers[PASSPHRASE_HEADER];
  if (typeof given !== "string" || !given) return { ok: false, status: 401, error: "合言葉を入力してください" };
  try { given = decodeURIComponent(given); } catch { return { ok: false, status: 401, error: "合言葉が違います" }; }
  if (!passphraseMatches(given, expected)) return { ok: false, status: 401, error: "合言葉が違います" };
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", `Content-Type, ${PASSPHRASE_HEADER}`);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const g = guard(req);
  if (!g.ok) return res.status(g.status).json({ ok: false, error: g.error, code: g.status === 401 ? "passphrase" : undefined });

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
