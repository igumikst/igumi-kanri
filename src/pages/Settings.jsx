import { Hdr, LineIcon } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

// 今後ここに設定項目を追加していく想定(第8弾テーマ26-2b)
const SETTINGS_ITEMS = [
  {
    key: "linesettings",
    icon: <LineIcon size={24} />,
    label: "LINE通知設定",
    sub: "キーワード・スタッフ管理・プッシュ通知(テスト)",
  },
];

export default function Settings({ isPC, pp, nav, rpOpen, setRpOpen, SB_W, RP_W, cust, pjs, submittedQuotes, wonQuotes, cos, tks, finFiles, tmplFiles, tileConf }) {
  const pending = (tks || []).filter(t => !t.done);

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && <PCSidebar nav={nav} page="settings" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} submittedQuotes={submittedQuotes} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} wonQuotes={wonQuotes || []} submittedQuotes={submittedQuotes} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} isPC={isPC} />}

      <Hdr title="⚙️ 設定" back={() => nav("home")} />

      <div style={{ maxWidth: 720, margin: "0 auto", padding: isPC ? "32px 24px" : "16px 12px" }}>
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          {SETTINGS_ITEMS.map((item, i) => (
            <button
              key={item.key}
              onClick={() => nav(item.key)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "none", border: "none", borderBottom: i < SETTINGS_ITEMS.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", textAlign: "left" }}
            >
              {item.icon}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937" }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{item.sub}</div>
              </div>
              <div style={{ fontSize: 14, color: "#D1D5DB" }}>›</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
