import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { describeApiError } from "../lib/errorMessage";

const SETTINGS_ID = "mobile_dashboard_config";
// この端末だけに保存するキー(テーマ28-1b)。読み書きは必ずtry/catchで囲む
const LOCAL_KEY = "igumi_dashboard_config_v1";

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

// 保存元が壊れていても標準設定で埋め合わせる
const normalizeConfig = (v) => ({
  layout: v?.layout || DEFAULT_CONFIG.layout,
  theme: v?.theme || DEFAULT_CONFIG.theme,
  items: { ...DEFAULT_CONFIG.items, ...(v?.items || {}) },
});

// 準備中の項目は、万一ONの値を持っていても必ずOFFで保存する(安全側)
const buildSafePayload = (cfg) => {
  const safeItems = { ...cfg.items };
  ITEM_DEFS.forEach(d => { if (d.comingSoon) safeItems[d.key] = false; });
  return { layout: cfg.layout, theme: cfg.theme, items: safeItems };
};

// localStorageが使えない(プライベートモード・設定で無効化など)環境でも
// 画面が壊れないよう、読み書き・削除はすべてtry/catchで囲む
const readLocalConfig = () => {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : null;
  } catch {
    return null;
  }
};
const writeLocalConfig = (payload) => {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};
const clearLocalConfig = () => {
  try {
    window.localStorage.removeItem(LOCAL_KEY);
    return true;
  } catch {
    return false;
  }
};

const SOURCE_LABEL = { device: "この端末の設定", org: "みんなの初期設定", default: "標準設定" };

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
  const [source, setSource] = useState("default"); // "device" | "org" | "default"
  const [orgDefault, setOrgDefault] = useState(null); // DBの「みんなの初期設定」(無ければnull)
  const [loading, setLoading] = useState(true);
  const [savingOrg, setSavingOrg] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [conf, setConf] = useState(null);

  // 読み込みの優先順位: 1.この端末(localStorage) 2.みんなの初期設定(DB) 3.標準設定(コード内)
  useEffect(() => {
    (async () => {
      const local = readLocalConfig();
      const { data } = await supabase.from("home_settings").select("value").eq("id", SETTINGS_ID).single();
      const org = data?.value ? normalizeConfig(data.value) : null;
      setOrgDefault(org);
      if (local) { setConfig(normalizeConfig(local)); setSource("device"); }
      else if (org) { setConfig(org); setSource("org"); }
      else { setConfig(DEFAULT_CONFIG); setSource("default"); }
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

  // 「保存」: この端末だけに保存する
  const saveToDevice = () => {
    setError(""); setMsg("");
    const payload = buildSafePayload(config);
    const ok = writeLocalConfig(payload);
    if (!ok) {
      setError("この端末への保存に失敗しました。\nブラウザの設定で、サイトのデータ保存(Cookie・ストレージ)がブロックされていないか確認してください。\n\n詳細: この端末ではブラウザの保存機能(localStorage)が使えませんでした");
      return;
    }
    setConfig(payload);
    setSource("device");
    setMsg("この端末に保存しました");
  };

  // 「この設定をみんなの初期設定にする」: DBに保存する(確認あり)
  const askMakeOrgDefault = () => {
    setConf({
      msg: "まだ設定していない端末は、この設定で表示されます。\nよいですか？",
      okLabel: "みんなの初期設定にする",
      onOk: makeOrgDefault,
    });
  };
  const makeOrgDefault = async () => {
    setConf(null);
    setSavingOrg(true); setError(""); setMsg("");
    const payload = buildSafePayload(config);
    const { error: err } = await supabase.from("home_settings").upsert({
      id: SETTINGS_ID, value: payload, updated_at: new Date().toISOString(),
    });
    if (err) {
      setError(describeApiError(err, "みんなの初期設定への保存"));
    } else {
      setOrgDefault(payload);
      setConfig(payload);
      // この端末に個別の設定(device)が既にある場合は、そちらが優先のままでよい
      if (source !== "device") setSource("org");
      setMsg("みんなの初期設定にしました");
    }
    setSavingOrg(false);
  };

  // 「この端末の設定をリセット」: この端末の設定を消して、みんなの初期設定(無ければ標準設定)に戻す(確認あり)
  const askResetDevice = () => {
    setConf({
      msg: "この端末の設定を消して、みんなの初期設定(無ければ標準設定)に戻しますか？",
      okLabel: "リセットする",
      okColor: "#DC2626",
      onOk: resetDevice,
    });
  };
  const resetDevice = () => {
    setConf(null);
    setError(""); setMsg("");
    clearLocalConfig();
    if (orgDefault) { setConfig(orgDefault); setSource("org"); }
    else { setConfig(DEFAULT_CONFIG); setSource("default"); }
    setMsg("この端末の設定をリセットしました");
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
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 2 }}>
              いまの設定: <b style={{ color: "#1A3A5C" }}>{SOURCE_LABEL[source]}</b>
            </div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 16 }}>
              📱 iPhoneのSafariと、ホーム画面に追加したアプリでは、設定が別々に保存されます
            </div>

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
              onClick={saveToDevice}
              style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: "#1A3A5C", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}
            >
              この端末に保存する
            </button>

            <button
              onClick={askMakeOrgDefault}
              disabled={savingOrg}
              style={{ width: "100%", marginTop: 10, padding: 13, borderRadius: 10, border: "1.5px solid #1A3A5C", background: "#fff", color: "#1A3A5C", fontWeight: 700, fontSize: 14, cursor: savingOrg ? "default" : "pointer" }}
            >
              {savingOrg ? "保存中..." : "🌐 この設定をみんなの初期設定にする"}
            </button>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={askResetDevice}
                style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}
              >
                この端末の設定をリセット
              </button>
            </div>

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

      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} okLabel={conf.okLabel} okColor={conf.okColor} />}
    </div>
  );
}
