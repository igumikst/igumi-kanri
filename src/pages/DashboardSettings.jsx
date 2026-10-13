import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { describeApiError } from "../lib/errorMessage";

const SETTINGS_ID = "mobile_dashboard_config";

const LAYOUT_OPTIONS = [
  { key: "standard", label: "標準" },
  { key: "hero", label: "粗利ヒーロー" },
  { key: "compact", label: "コンパクト" },
];

const THEME_OPTIONS = [
  { key: "light", label: "☀️ 明るい" },
  { key: "dark", label: "🌙 ダーク" },
];

// 「準備中」の3項目は、まだダッシュボード本体に出せないためオフ固定・選択不可
const ITEM_DEFS = [
  { key: "grossProfitBig", label: "粗利(大)" },
  { key: "revenue", label: "売上" },
  { key: "grossProfitAndRate", label: "粗利と粗利率" },
  { key: "orderCount", label: "受注件数" },
  { key: "inProgress", label: "進行中の案件", comingSoon: true },
  { key: "yearlyGrossProfitCumulative", label: "年間の粗利累計", comingSoon: true },
  { key: "unconfirmedProfitCount", label: "粗利未確定の件数" },
  { key: "needsAttention", label: "要対応", comingSoon: true },
  { key: "trendChart", label: "売上と粗利の推移グラフ" },
  { key: "projectStatus", label: "案件の状況" },
  { key: "priceRange", label: "見積の価格帯" },
  { key: "byOwner", label: "担当者別" },
];

const DEFAULT_CONFIG = {
  layout: "standard",
  theme: "light",
  items: {
    grossProfitBig: true,
    revenue: true,
    grossProfitAndRate: true,
    orderCount: true,
    inProgress: false,
    yearlyGrossProfitCumulative: false,
    unconfirmedProfitCount: true,
    needsAttention: false,
    trendChart: true,
    projectStatus: true,
    priceRange: true,
    byOwner: true,
  },
};

// 左右に動くスイッチ型のON/OFF(LineSettings.jsxと同じ見た目の考え方)
const ToggleSwitch = ({ checked, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: 44, height: 24, borderRadius: 12, border: "none", padding: 2,
      background: checked ? "#059669" : "#CBD5E1",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1,
      flexShrink: 0,
      transition: "background 0.15s",
    }}
  >
    <span
      style={{
        display: "block", width: 20, height: 20, borderRadius: "50%", background: "#fff",
        transform: checked ? "translateX(20px)" : "translateX(0)",
        transition: "transform 0.15s",
        boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
      }}
    />
  </button>
);

export default function DashboardSettings({ isPC, pp, nav, rpOpen, setRpOpen, SB_W, RP_W, cust, pjs, submittedQuotes, wonQuotes, cos, tks, finFiles, tmplFiles, tileConf }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("home_settings").select("value").eq("id", SETTINGS_ID).single();
      if (data?.value) {
        setConfig({
          layout: data.value.layout || DEFAULT_CONFIG.layout,
          theme: data.value.theme || DEFAULT_CONFIG.theme,
          items: { ...DEFAULT_CONFIG.items, ...(data.value.items || {}) },
        });
      }
      setLoading(false);
    })();
  }, []);

  const setLayout = (layout) => setConfig(prev => ({ ...prev, layout }));
  const setTheme = (theme) => setConfig(prev => ({ ...prev, theme }));
  const toggleItem = (key) => {
    const def = ITEM_DEFS.find(d => d.key === key);
    if (def?.comingSoon) return; // 準備中はオンにできない
    setConfig(prev => ({ ...prev, items: { ...prev.items, [key]: !prev.items[key] } }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setMsg("");
    // 準備中の項目は、万一ONの値を持っていても必ずOFFで保存する(安全側)
    const safeItems = { ...config.items };
    ITEM_DEFS.forEach(d => { if (d.comingSoon) safeItems[d.key] = false; });
    const payload = { layout: config.layout, theme: config.theme, items: safeItems };

    const { error: err } = await supabase.from("home_settings").upsert({
      id: SETTINGS_ID, value: payload, updated_at: new Date().toISOString(),
    });
    if (err) {
      setError(describeApiError(err, "表示設定の保存"));
    } else {
      setConfig(payload);
      setMsg("保存しました");
    }
    setSaving(false);
  };

  const pending = (tks || []).filter(t => !t.done);

  const s = {
    btn: (active) => ({
      padding: "10px 16px", borderRadius: 10, border: `2px solid ${active ? "#1A3A5C" : "#E5E7EB"}`,
      background: active ? "#1A3A5C" : "#fff", color: active ? "#fff" : "#374151",
      fontWeight: 700, fontSize: 13, cursor: "pointer",
    }),
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && <PCSidebar nav={nav} page="dashboardsettings" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} submittedQuotes={submittedQuotes} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} wonQuotes={wonQuotes || []} submittedQuotes={submittedQuotes} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} isPC={isPC} />}

      <Hdr title="📊 ダッシュボードの表示設定" back={() => nav("settings")} />

      <div style={{ maxWidth: 560, margin: "0 auto", padding: isPC ? "32px 24px" : "16px 12px" }}>
        {loading ? (
          <div style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", padding: "24px 0" }}>読み込み中...</div>
        ) : (
          <>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>レイアウト</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {LAYOUT_OPTIONS.map(o => (
                  <button key={o.key} style={s.btn(config.layout === o.key)} onClick={() => setLayout(o.key)}>{o.label}</button>
                ))}
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>明るさ</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {THEME_OPTIONS.map(o => (
                  <button key={o.key} style={s.btn(config.theme === o.key)} onClick={() => setTheme(o.key)}>{o.label}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 10 }}>
                ダークとレイアウト(粗利ヒーロー・コンパクト)の見た目は、これから対応します。
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>表示する項目</div>
              {ITEM_DEFS.map(d => (
                <div key={d.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
                  <div>
                    <div style={{ fontSize: 14, color: "#1F2937", fontWeight: 600 }}>{d.label}</div>
                    {d.comingSoon && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>準備中(まだ表示できません)</div>}
                  </div>
                  <ToggleSwitch checked={!!config.items[d.key]} onClick={() => toggleItem(d.key)} disabled={d.comingSoon} />
                </div>
              ))}
            </div>

            <button
              onClick={save}
              disabled={saving}
              style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: saving ? "#9CA3AF" : "#1A3A5C", color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer" }}
            >
              {saving ? "保存中..." : "保存する"}
            </button>

            {msg && <div style={{ marginTop: 12, fontSize: 13, color: "#166534", fontWeight: 700 }}>✅ {msg}</div>}

            {error && (() => {
              if (!error.includes("\n\n詳細: ")) {
                return <div style={{ marginTop: 12, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>⚠️ {error}</div>;
              }
              const [summary, detail] = error.split("\n\n詳細: ");
              return (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
                  <div style={{ color: "#DC2626", fontSize: 13, whiteSpace: "pre-wrap" }}>{summary}</div>
                  {detail && <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 4 }}>詳細: {detail}</div>}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
