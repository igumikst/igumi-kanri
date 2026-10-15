// /api/note-passphrase.js
// 「見積作成パスワード」(ノート見積作成の合言葉)の状態確認・設定・解除の受け口。
// 設定・変更・解除は、すべてマスターキー(財務ページのパスワード)で行う(「今の合言葉」での変更はできない)。
// 合言葉の値・ハッシュは、返さない・ログに出さない。
//
// POST {action:"status"}                              → { ok, configured, updated_at }
// POST {action:"set", masterKey, newPassphrase}        → 新しい合言葉を保存(最初の設定・変更・忘れたときの再設定)
// POST {action:"clear", masterKey}                     → 合言葉を消す(以後、ノート見積作成は誰も使えない)
//
// 回数制限: 同じIPから1時間に20件まで(マスターキーの照合より先に数える)。
// マスターキーを5回続けて間違えたら、そのIPを10分ロック(push-admin.js と同じ)。
import {
  getClientIp, createRateLimiter, createFailLock, verifyMasterKey, sameText,
  getNotePassphraseStatus, setNotePassphrase, clearNotePassphrase, PASSPHRASE_MIN_LENGTH,
} from "./_notePassphraseLib.js";

const rateLimit = createRateLimiter({ max: 20, windowMs: 60 * 60 * 1000 });
const masterLock = createFailLock({ threshold: 5, lockMs: 10 * 60 * 1000 });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const ip = getClientIp(req);
  if (!rateLimit(ip)) return res.status(429).json({ ok: false, error: "しばらく時間をおいてから、もう一度お試しください(1時間あたりの回数の上限です)" });

  const { action, masterKey, newPassphrase } = req.body || {};
  try {
    if (action === "status") {
      const s = await getNotePassphraseStatus();
      return res.status(200).json({ ok: true, ...s });
    }
    if (action !== "set" && action !== "clear") return res.status(400).json({ ok: false, error: "action が正しくありません" });

    if (masterLock.isLocked(ip)) return res.status(429).json({ ok: false, error: "マスターキーを続けて間違えたため、10分間使えません" });
    if (!(await verifyMasterKey(masterKey))) {
      masterLock.fail(ip);
      return res.status(403).json({ ok: false, error: "マスターキー(財務ページのパスワード)が違います" });
    }
    masterLock.success(ip);

    if (action === "clear") {
      await clearNotePassphrase();
      return res.status(200).json({ ok: true, configured: false });
    }
    const next = typeof newPassphrase === "string" ? newPassphrase.trim() : "";
    if (next.length < PASSPHRASE_MIN_LENGTH) return res.status(400).json({ ok: false, error: `合言葉は${PASSPHRASE_MIN_LENGTH}文字以上にしてください` });
    if (sameText(next, masterKey)) return res.status(400).json({ ok: false, error: "合言葉は、マスターキーと違う言葉にしてください" });
    await setNotePassphrase(next);
    const s = await getNotePassphraseStatus();
    return res.status(200).json({ ok: true, ...s });
  } catch (e) {
    console.error("[note-passphrase] error:", e?.message);
    return res.status(500).json({ ok: false, error: "見積作成パスワードの処理に失敗しました。時間をおいてもう一度お試しください" });
  }
}
