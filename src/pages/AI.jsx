import { useState } from "react";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function AI({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, aiMsgs, setAiMsgs, aiInput, setAiInput, SB_W, RP_W }) {
  const [aiLoading, setAiLoading] = useState(false);
  const pending = tks.filter(t => !t.done);
  const suggestions = ["今月完了した案件は？", "粗利率が一番高い案件は？", "未完了タスクを優先度順に教えて", "受注金額の合計を教えて", "進行中の案件一覧を教えて"];

  const sendAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput("");
    setAiMsgs(prev => [...prev, { role: "user", content: userMsg }]);
    setAiLoading(true);
    try {
      const context = `
あなたはIGUMI管理アプリのAIアシスタントです。以下のデータをもとに質問に答えてください。日本語で簡潔に答えてください。

【案件データ】
${pjs.map(p => `・${p.name}（${p.status}）受注:${p.amount ? '¥' + Number(p.amount).toLocaleString() : '未設定'} 粗利:${p.gp ? '¥' + Number(p.gp).toLocaleString() : '未設定'} 担当:${p.inCharge || '未設定'}`).join('\n')}

【取引先データ】
${cos.map(c => `・${c.name}${c.branch ? ' ' + c.branch : ''}（${c.type}）担当者${(c.contacts || []).length}名`).join('\n')}

【未完了タスク】
${tks.filter(t => !t.done).map(t => `・${t.title}（優先度:${t.prio}）${t.due ? '期限:' + t.due : ''}`).join('\n') || 'なし'}
      `;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: context }, ...aiMsgs.slice(-6), { role: "user", content: userMsg }],
          max_tokens: 800
        })
      });
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "エラーが発生しました";
      setAiMsgs(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setAiMsgs(prev => [...prev, { role: "assistant", content: "エラーが発生しました。APIキーを確認してください。" }]);
    }
    setAiLoading(false);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", display: "flex", flexDirection: "column", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="ai" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={setAiInput} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="🤖 AIアシスタント" back={() => nav("home")} />
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0" }}>
        {aiMsgs.length === 0 && (
          <div>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#1F2937", marginBottom: 4 }}>AIアシスタント</div>
              <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>IGUMIのデータについて何でも聞いてください。</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8 }}>💡 質問例</div>
            {suggestions.map(s => (
              <button key={s} onClick={() => setAiInput(s)} style={{ width: "100%", background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", textAlign: "left", fontSize: 13, color: "#374151", marginBottom: 6, cursor: "pointer", fontWeight: 500 }}>{s}</button>
            ))}
          </div>
        )}
        {aiMsgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "assistant" && <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2 }}>🤖</div>}
            <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.role === "user" ? "#1A3A5C" : "#fff", color: m.role === "user" ? "#fff" : "#1F2937", fontSize: 13, lineHeight: 1.7, boxShadow: m.role === "assistant" ? "0 1px 4px rgba(0,0,0,0.08)" : "none", whiteSpace: "pre-wrap" }}>{m.content}</div>
          </div>
        ))}
        {aiLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
            <div style={{ background: "#fff", borderRadius: "16px 16px 16px 4px", padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ display: "flex", gap: 4 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#9CA3AF" }} />)}</div>
            </div>
          </div>
        )}
        <div style={{ height: 14 }} />
      </div>
      <div style={{ padding: "12px 14px 24px", background: "#fff", borderTop: "1px solid #F3F4F6" }}>
        {aiMsgs.length > 0 && <button onClick={() => setAiMsgs([])} style={{ fontSize: 11, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginBottom: 8 }}>🗑 会話をリセット</button>}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAI()} placeholder="質問を入力..." style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", color: "#1F2937" }} />
          <button onClick={sendAI} disabled={!aiInput.trim() || aiLoading} style={{ background: aiInput.trim() && !aiLoading ? "#6D28D9" : "#E5E7EB", color: aiInput.trim() && !aiLoading ? "#fff" : "#9CA3AF", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: aiInput.trim() && !aiLoading ? "pointer" : "default" }}>送信</button>
        </div>
      </div>
    </div>
  );
}