import { useState } from "react";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function AI({ pjs, cos, tks, links, cust, tileConf, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, SB_W, RP_W }) {
  const [selected, setSelected] = useState(null);
  const pending = tks.filter(t => !t.done);

  // 仮の相談履歴
  const recentChats = [
    { icon: "📝", label: "見積もり相談", color: "#E07B39", text: "外壁塗装工事の単価について相談しました", time: "今日 10:32" },
    { icon: "📄", label: "報告書相談", color: "#059669", text: "防水工事の報告書の文章を整形してもらいました", time: "昨日 15:15" },
    { icon: "¥", label: "経理相談", color: "#6366F1", text: "今月の経費の内訳について質問しました", time: "2日前 16:45" },
  ];

  const boxes = [
    {
      key: "report",
      icon: "📄",
      label: "報告書相談箱",
      desc: "報告書の作成サポートや\n記載内容の提案、文章の整形を行います",
      color: "#059669",
      bg: "#F0FDF4",
      iconBg: "linear-gradient(135deg, #D1FAE5, #A7F3D0)",
      url: null, // カスタムGPTのURL（後で設定）
    },
    {
      key: "estimate",
      icon: "🧮",
      label: "見積もり相談箱",
      desc: "見積書の作成サポートや\n単価・工法の提案、比較検討を行います",
      color: "#E07B39",
      bg: "#FFF7ED",
      iconBg: "linear-gradient(135deg, #FED7AA, #FCA87F)",
      url: null,
    },
    {
      key: "accounting",
      icon: "¥",
      label: "経理相談箱",
      desc: "経費や請求、PLの確認など\n数字に関する相談を行います",
      color: "#6366F1",
      bg: "#EEF2FF",
      iconBg: "linear-gradient(135deg, #E0E7FF, #C7D2FE)",
      url: null,
    },
  ];

  const handleBoxClick = (box) => {
    if (box.url) {
      window.open(box.url, "_blank");
    } else {
      setSelected(box);
    }
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="ai" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title="✨ AI補助" back={() => nav("home")} />

      <div style={{ padding: isPC ? "20px 0" : "20px 16px 40px" }}>

        {/* タイトル */}
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1F2937", marginBottom: 4 }}>相談したい内容を選択してください</div>
          <div style={{ fontSize: 13, color: "#9CA3AF" }}>AIがあなたの業務をサポートします</div>
        </div>

        {/* 相談箱3種類 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
          {boxes.map(box => (
            <div key={box.key} onClick={() => handleBoxClick(box)}
              style={{ background: "#fff", borderRadius: 16, padding: "20px", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              {/* アイコン */}
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: box.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                {box.icon}
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: box.color, marginBottom: 6 }}>{box.label}</div>
              <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6, whiteSpace: "pre-line", marginBottom: 14 }}>{box.desc}</div>
              <div style={{ border: `1.5px solid ${box.color}`, borderRadius: 20, padding: "8px 24px", color: box.color, fontWeight: 700, fontSize: 13 }}>
                相談をはじめる ›
              </div>
            </div>
          ))}
        </div>

        {/* 最近の相談履歴（仮） */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>最近の相談履歴</div>
            <button style={{ fontSize: 11, color: "#6366F1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>すべて見る →</button>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            {recentChats.map((chat, i) => (
              <div key={i} style={{ padding: "14px 16px", borderBottom: i < recentChats.length - 1 ? "1px solid #F3F4F6" : "none", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, color: chat.color, fontWeight: 700 }}>
                  {chat.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: chat.color, marginBottom: 2 }}>{chat.label}</div>
                  <div style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.text}</div>
                </div>
                <div style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>{chat.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 準備中モーダル */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 320, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{selected.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: selected.color, marginBottom: 8 }}>{selected.label}</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 20, lineHeight: 1.6 }}>
              カスタムGPTの準備中です。<br />もうしばらくお待ちください！
            </div>
            <button onClick={() => setSelected(null)} style={{ width: "100%", padding: "12px 0", background: selected.color, color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}