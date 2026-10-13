/* global process */
// /api/note-parse.js
// 現調ノートの文字を受け取り、AIで分解したJSON(下書きの材料)を返す。
// 本体は _noteParseCore.js。単価表への当てはめ・金額の計算は、画面側のプログラムで行う。
// 時間の上限は vercel.json の functions["api/note-parse.js"].maxDuration(60秒)。
import { parseNote, NoteParseError, NOTE_PARSE_DEFAULT_MODEL } from "./_noteParseCore.js";

// 不正利用対策(合言葉・回数制限)を入れる場所。【本番デプロイの前に中身を入れる】
// 今はテストのため、必ず通す。入れるときは、次の2つをここに足す:
//  - 合言葉: リクエストのヘッダーと、環境変数の合言葉を照らし合わせる
//  - 回数制限: task-notify.js と同じ形(同じIPから1時間に○件まで)
// 通さないときは { ok: false, status: 401 または 429, error: "日本語のメッセージ" } を返す。
function guard(req) {
  void req;
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const g = guard(req);
  if (!g.ok) return res.status(g.status || 403).json({ ok: false, error: g.error || "利用できません" });

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
