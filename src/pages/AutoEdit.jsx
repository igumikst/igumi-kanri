import { useState } from "react";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

const AE_PIN = "0430";

export default function AutoEdit({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const [aeInput, setAeInput] = useState("");
  const [aeLoading, setAeLoading] = useState(false);
  const [aeResult, setAeResult] = useState(null);
  const [aeHistory, setAeHistory] = useState([]);
  const [aeUnlocked, setAeUnlocked] = useState(false);
  const [aePin, setAePin] = useState("");
  const pending = tks.filter(t => !t.done);

  const suggestions = [
    "案件管理に優先度フィルターを追加して",
    "ホームバナーに今日の案件数を表示して",
    "タスクに期限アラートを追加して",
    "取引先一覧にメモ欄を追加して",
  ];

  const runEdit = async () => {
    if (!aeInput.trim() || aeLoading) return;
    setAeLoading(true); setAeResult(null);
    const instruction = aeInput.trim();
    setAeHistory(prev => [{ instruction, time: new Date().toLocaleTimeString('ja-JP'), status: "実行中" }, ...prev]);
    try {
      const res = await fetch('/api/auto-edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction }) });
      const data = await res.json();
      if (data.success) { setAeResult({ ok: true, msg: data.message }); setAeHistory(prev => prev.map((h, i) => i === 0 ? { ...h, status: "✅ 完了" } : h)); setAeInput(""); }
      else { setAeResult({ ok: false, msg: data.error }); setAeHistory(prev => prev.map((h, i) => i === 0 ? { ...h, status: "❌ エラー" } : h)); }
    } catch (e) {
      setAeResult({ ok: false, msg: "通信エラーが発生しました" });
      setAeHistory(prev => prev.map((h, i) => i === 0 ? { ...h, status: "❌ エラー" } : h));
    }
    setAeLoading(false);
  };

  if (!aeUnlocked) return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="autoedit" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="🤖 Auto-Edit" back={() => nav("home")} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: 24 }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 320, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1A3A5C", marginBottom: 6 }}>管理者専用</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 24 }}>パスコードを入力してください</div>
          <input type="password" value={aePin} onChange={e => setAePin(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { if (aePin === AE_PIN) { setAeUnlocked(true); setAePin(""); } else { alert("パスコードが違います"); setAePin(""); } } }}
            placeholder="パスコード" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 18, textAlign: "center", letterSpacing: 6, boxSizing: "border-box", marginBottom: 12, color: "#1F2937" }} />
          <button onClick={() => { if (aePin === AE_PIN) { setAeUnlocked(true); setAePin(""); } else { alert("パスコードが違います"); setAePin(""); } }}
            style={{ width: "100%", padding: "13px 0", background: "#6D28D9", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>ロック解除</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="autoedit" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="🤖 Auto-Edit" back={() => { setAeUnlocked(false); nav("home"); }} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={{ background: "linear-gradient(135deg,#6D28D9,#4C1D95)", borderRadius: 14, padding: 20, marginBottom: 14, color: "#fff" }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>🤖 AIが自動でアプリを改修</div>
          <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.6 }}>指示を入力するだけでApp.jsxを修正→GitHubにコミット→Vercelが自動デプロイします</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>💡 指示を入力</div>
          <textarea value={aeInput} onChange={e => setAeInput(e.target.value)} placeholder="例：案件管理に担当者フィルターを追加して" rows={4} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 14, resize: "vertical", boxSizing: "border-box", background: "#FAFAFA", color: "#1F2937", fontFamily: "inherit", marginBottom: 10 }} />
          <button onClick={runEdit} disabled={!aeInput.trim() || aeLoading} style={{ width: "100%", padding: "14px 0", background: aeLoading ? "#9CA3AF" : aeInput.trim() ? "#6D28D9" : "#E5E7EB", color: aeInput.trim() && !aeLoading ? "#fff" : "#9CA3AF", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: aeInput.trim() && !aeLoading ? "pointer" : "default" }}>
            {aeLoading ? "⏳ AIが修正中..." : "🚀 実行する"}
          </button>
        </div>
        {aeResult && <div style={{ background: aeResult.ok ? "#F0FDF4" : "#FEF2F2", border: `1.5px solid ${aeResult.ok ? "#BBF7D0" : "#FECACA"}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: aeResult.ok ? "#166534" : "#DC2626" }}>{aeResult.msg}</div>
        </div>}
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>💬 指示の例</div>
          {suggestions.map(s => (<button key={s} onClick={() => setAeInput(s)} style={{ width: "100%", background: "#F9FAFB", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", textAlign: "left", fontSize: 13, color: "#374151", marginBottom: 8, cursor: "pointer", fontWeight: 500 }}>{s}</button>))}
        </div>
        {aeHistory.length > 0 && <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>📋 実行履歴</div>
          {aeHistory.map((h, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: i < aeHistory.length - 1 ? "1px solid #F3F4F6" : "none" }}>
            <div style={{ flex: 1, fontSize: 13, color: "#374151", marginRight: 8 }}>{h.instruction}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap", textAlign: "right" }}><div>{h.time}</div><div style={{ fontWeight: 700 }}>{h.status}</div></div>
          </div>))}
        </div>}
      </div>
    </div>
  );
}