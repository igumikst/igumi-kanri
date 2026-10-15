import { useState, useEffect } from "react";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

// 見積作成パスワード(ノート見積作成の合言葉)の設定・変更・解除。
// 照合・保存はサーバー(api/note-passphrase.js)だけで行う。合言葉はハッシュで保存され、画面からは読めない。
// 設定・変更・解除には、マスターキー(財務ページのパスワード)が必要。
// 合言葉を変えると、各端末に覚えている古い合言葉は通らなくなり、次の読み取りで入力し直しになる。

const PASSPHRASE_MIN_LENGTH = 8; // api/_notePassphraseLib.js と同じ
const inp = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 14, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" };
const label = { fontSize: 12, color: "#6B7280", marginBottom: 4 };

const callApi = async body => {
  const res = await fetch("/api/note-passphrase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || `処理に失敗しました(${res.status})`);
  return data;
};

const dateJp = s => { if (!s) return ""; const d = new Date(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function NotePassphraseSettings({ isPC, pp, nav, rpOpen, setRpOpen, SB_W, RP_W, cust, pjs, submittedQuotes, wonQuotes, cos, tks, finFiles, tmplFiles, tileConf }) {
  const pending = (tks || []).filter(t => !t.done);
  const [status, setStatus] = useState(null); // { configured, updated_at }
  const [statusError, setStatusError] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    callApi({ action: "status" }).then(setStatus, e => setStatusError(e.message));
  }, []);

  const save = async () => {
    if (busy) return;
    setError(""); setMsg("");
    if (!masterKey) { setError("マスターキー(財務ページのパスワード)を入力してください"); return; }
    if (next.trim().length < PASSPHRASE_MIN_LENGTH) { setError(`合言葉は${PASSPHRASE_MIN_LENGTH}文字以上にしてください`); return; }
    if (next.trim() !== next2.trim()) { setError("確認用の合言葉が一致しません"); return; }
    setBusy(true);
    try {
      const s = await callApi({ action: "set", masterKey, newPassphrase: next.trim() });
      setStatus(s);
      setMasterKey(""); setNext(""); setNext2("");
      setMsg("見積作成パスワードを設定しました。各端末では、次の読み取りのときに新しい合言葉を入力してください。");
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const clear = async () => {
    if (busy) return;
    setError(""); setMsg("");
    if (!masterKey) { setError("解除するには、マスターキー(財務ページのパスワード)を入力してください"); return; }
    if (!window.confirm("見積作成パスワードを解除しますか?\n解除すると、もう一度設定するまで、ノート見積作成は誰も使えなくなります。")) return;
    setBusy(true);
    try {
      await callApi({ action: "clear", masterKey });
      setStatus({ configured: false, updated_at: null });
      setMasterKey(""); setNext(""); setNext2("");
      setMsg("見積作成パスワードを解除しました。ノート見積作成は、もう一度設定するまで使えません。");
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && <PCSidebar nav={nav} page="notepassphrase" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} submittedQuotes={submittedQuotes} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} wonQuotes={wonQuotes || []} submittedQuotes={submittedQuotes} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} isPC={isPC} />}

      <Hdr title="🔑 見積作成パスワード" back={() => nav("settings")} />

      <div style={{ maxWidth: 560, margin: "0 auto", padding: isPC ? "32px 24px" : "16px 12px" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.7, marginBottom: 10 }}>
            「ノート見積作成」を使うための合言葉です。スタッフは、各端末で最初の1回だけ入力します。<br />
            合言葉は元に戻せない形(ハッシュ)で保存され、この画面からも読めません。設定・変更・解除には、マスターキー(財務ページのパスワード)が必要です。
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: status?.configured ? "#065F46" : "#991B1B" }}>
            {statusError ? `⚠️ ${statusError}` : !status ? "状態を確認中..." : status.configured ? `✅ 設定済み(最終更新 ${dateJp(status.updated_at)})` : "⚠️ 未設定(ノート見積作成は、今は誰も使えません)"}
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={label}>マスターキー(財務ページのパスワード)*</div>
          <input type="password" value={masterKey} onChange={e => setMasterKey(e.target.value)} autoComplete="off" style={{ ...inp, marginBottom: 12 }} />
          <div style={label}>新しい合言葉({PASSPHRASE_MIN_LENGTH}文字以上。マスターキーとは違う言葉)</div>
          <input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" style={{ ...inp, marginBottom: 8 }} />
          <div style={label}>確認のため、もう一度</div>
          <input type="password" value={next2} onChange={e => setNext2(e.target.value)} autoComplete="new-password" style={{ ...inp, marginBottom: 12 }} />
          {error && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>⚠️ {error}</div>}
          {msg && <div style={{ background: "#ECFDF5", color: "#065F46", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{msg}</div>}
          <button onClick={save} disabled={busy} style={{ width: "100%", padding: "12px 0", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "処理中..." : status?.configured ? "合言葉を変更する" : "合言葉を設定する"}
          </button>
          {status?.configured && (
            <button onClick={clear} disabled={busy} style={{ width: "100%", padding: "8px 0", marginTop: 8, background: "none", border: "none", color: "#DC2626", fontSize: 12, cursor: "pointer" }}>🗑 合言葉を解除する(マスターキーが必要です)</button>
          )}
        </div>
      </div>
    </div>
  );
}
