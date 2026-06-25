import { useState } from "react";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { Modal, Inp } from "../components/UI";
import { PRIO } from "../lib/constants";
import { supabase } from "../lib/supabase";

export default function Home({ pjs, cos, tks, links, cust, tileConf, tileEdit, setTileEdit, saveTileConf, saveCustomize, weather, weekWeather, fishWeather, isPC, pp, nav, setModal, setEc, ec, rpOpen, setRpOpen, finFiles, tmplFiles, SB_W, RP_W, boardPosts, calls, setCalls }) {
  const [editTile, setEditTile] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [finUnlocked, setFinUnlocked] = useState(false);
  const [savedPw, setSavedPw] = useState(null);
  const [pwLoaded, setPwLoaded] = useState(false);

  const pending = tks.filter(t => !t.done);
  const active = pjs.filter(p => p.status !== "完了" && p.status !== "中断");
  const unsubmitted = pjs.filter(p => p.status === "進行中" || p.status === "着工");
  const estimateStatus = {
    "作成中": pjs.filter(p => p.status === "見積中").length,
    "提出待ち": pjs.filter(p => p.status === "発注待ち").length,
    "回答待ち": pjs.filter(p => p.status === "着工").length,
    "受注": pjs.filter(p => p.status === "進行中").length,
  };

  const loadPw = async () => {
    if (pwLoaded) return savedPw;
    const { data } = await supabase.from("home_settings").select("value").eq("id", "finance_password").single();
    const pw = data?.value?.password || null;
    setSavedPw(pw); setPwLoaded(true); return pw;
  };

  const handleFinanceClick = async () => {
    const pw = await loadPw();
    if (!pw || finUnlocked) { nav("finance"); }
    else { setPwModal(true); setPwInput(""); setPwErr(""); }
  };

  const handleUnlock = () => {
    if (pwInput === savedPw) { setFinUnlocked(true); setPwModal(false); setPwInput(""); nav("finance"); }
    else setPwErr("パスワードが違います");
  };

  const refreshCalls = async () => {
    setRefreshing(true);
    const { data } = await supabase.from("calls").select("*").order("received_at", { ascending: false });
    if (data) setCalls(data);
    setRefreshing(false);
  };

  const s = {
    wrap: { fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp },
    header: { background: "#1A3A5C", padding: "0 0 0 0", position: "sticky", top: 0, zIndex: 50 },
    headerInner: { padding: "16px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" },
    headerTitle: { color: "#fff", fontWeight: 900, fontSize: 22, letterSpacing: 1 },
    headerRight: { display: "flex", alignItems: "center", gap: 12 },
    weatherBadge: { background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 14 },
    tabBar: { display: "flex", padding: "12px 24px 0", gap: 4 },
    tab: (active) => ({ padding: "8px 20px", borderRadius: "8px 8px 0 0", border: "none", background: active ? "#fff" : "transparent", color: active ? "#1A3A5C" : "rgba(255,255,255,0.6)", fontWeight: active ? 800 : 600, cursor: "pointer", fontSize: 14, transition: "all 0.2s" }),
    main: { padding: "24px" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
    grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 },
    card: { background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
    cardTitle: { fontSize: 13, color: "#64748B", fontWeight: 600, marginBottom: 4 },
    cardValue: { fontSize: 28, fontWeight: 900, color: "#1A3A5C" },
    sectionTitle: { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" },
    seeAll: { fontSize: 12, color: "#6366F1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 },
    tileGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 },
    tileCard: (color) => ({ background: "#fff", borderRadius: 16, padding: "20px", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}`, transition: "transform 0.15s, box-shadow 0.15s" }),
    aiCard: { background: "linear-gradient(135deg, #6366F1, #8B5CF6)", borderRadius: 16, padding: 20, cursor: "pointer", boxShadow: "0 4px 16px rgba(99,102,241,0.3)", gridColumn: "span 2" },
  };

  const [activeTab, setActiveTab] = useState("home");

  return (
    <div style={s.wrap}>
      {isPC && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="home" nav={nav} setModal={setModal} setEc={setEc} SB_W={SB_W} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {!isPC && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      {/* ヘッダー */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div style={s.headerTitle}>IGUMI OS</div>
          <div style={s.headerRight}>
            {weather && (
              <div style={s.weatherBadge}>
                <span>{weather.icon}</span>
                <span style={{ fontWeight: 700 }}>{weather.temp}°C</span>
                <span style={{ fontSize: 12, opacity: 0.8 }}>{weather.desc}</span>
              </div>
            )}
            <button onClick={refreshCalls} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 14, cursor: "pointer" }}>
              {refreshing ? "⏳" : "🔄"}
            </button>
            <button onClick={() => { setEc({ ...cust }); setModal("cust"); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>⚙</button>
          </div>
        </div>

        {/* タブ */}
        <div style={s.tabBar}>
          {[
            { id: "home", label: "🏠 ホーム" },
            { id: "calls", label: "📞 電話受付" },
            { id: "board", label: "📣 掲示板" },
          ].map(t => (
            <button key={t.id} style={s.tab(activeTab === t.id)} onClick={() => {
              if (t.id === "calls") { nav("calls"); return; }
              if (t.id === "board") { nav("board"); return; }
              setActiveTab(t.id);
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={s.main}>

        {/* 今日の予定風バナー */}
        <div style={{ background: "linear-gradient(135deg, #1A3A5C, #2563EB)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>📅 今日の状況</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            {[
              { label: "進行中案件", value: `${active.length}件`, color: "#60A5FA" },
              { label: "未完了タスク", value: `${pending.length}件`, color: "#F87171" },
              { label: "未対応電話", value: `${(calls || []).filter(c => c.status === "未対応").length}件`, color: "#FBBF24" },
              { label: "取引先", value: `${cos.length}社`, color: "#34D399" },
            ].map(item => (
              <div key={item.label} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* メイン4タイル */}
        <div style={{ ...s.tileGrid, marginBottom: 24 }}>
          {/* 案件 */}
          <div style={s.tileCard("#1A3A5C")} onClick={() => nav("projects")}
            onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)"; }}
            onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1F2937", marginBottom: 4 }}>案件</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>案件の確認・管理を行います</div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#1A3A5C", fontWeight: 700 }}>{active.length}件進行中 →</div>
          </div>

          {/* 報告 */}
          <div style={s.tileCard("#059669")} onClick={() => window.open("/report.html", "_blank")}
            onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)"; }}
            onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1F2937", marginBottom: 4 }}>報告</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>現場の報告を作成・確認します</div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#059669", fontWeight: 700 }}>報告書を作成 →</div>
          </div>

          {/* 見積 */}
          <div style={s.tileCard("#E07B39")} onClick={() => nav("estimate")}
            onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)"; }}
            onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1F2937", marginBottom: 4 }}>見積</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>見積の作成・確認を行います</div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#E07B39", fontWeight: 700 }}>見積書を作成 →</div>
          </div>

          {/* AI補助 */}
          <div style={{ ...s.tileCard("#6366F1"), background: "linear-gradient(135deg, #6366F1, #8B5CF6)", borderLeft: "none" }}
            onClick={() => nav("ai")}
            onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(99,102,241,0.3)"; }}
            onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: 4 }}>AI補助</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>AIが業務をサポートします</div>
            <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>相談する →</div>
          </div>
        </div>

        {/* 未提出の報告書 */}
        {unsubmitted.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={s.sectionTitle}>
              <span>未提出の報告書 <span style={{ background: "#EF4444", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11 }}>{unsubmitted.length}件</span></span>
              <button style={s.seeAll} onClick={() => nav("projects")}>すべて見る →</button>
            </div>
            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              {unsubmitted.slice(0, 3).map((p, i) => (
                <div key={p.id} onClick={() => nav("projects")} style={{ padding: "14px 18px", borderBottom: i < Math.min(unsubmitted.length, 3) - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                  onMouseOver={e => e.currentTarget.style.background = "#F9FAFB"}
                  onMouseOut={e => e.currentTarget.style.background = "#fff"}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📄</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>担当：{p.inCharge || "未設定"}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>›</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 見積ステータス */}
        <div style={{ marginBottom: 24 }}>
          <div style={s.sectionTitle}>
            <span>見積ステータス <span style={{ background: "#E07B39", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11 }}>{Object.values(estimateStatus).reduce((a, b) => a + b, 0)}件</span></span>
            <button style={s.seeAll} onClick={() => nav("projects")}>すべて見る →</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            {Object.entries(estimateStatus).map(([label, count]) => (
              <div key={label} style={{ background: "#fff", borderRadius: 12, padding: "14px 10px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", cursor: "pointer" }} onClick={() => nav("projects")}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#1A3A5C" }}>{count}</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AIからの提案 */}
        <div style={{ marginBottom: 24 }}>
          <div style={s.sectionTitle}>
            <span>AIからの提案</span>
            <button style={s.seeAll} onClick={() => nav("ai")}>すべて見る →</button>
          </div>
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            {[
              { icon: "💡", text: "過去の類似案件から見積精度を向上できます", action: () => nav("ai") },
              { icon: "📊", text: `未対応の電話案件が${(calls || []).filter(c => c.status === "未対応").length}件あります`, action: () => nav("calls") },
              { icon: "✅", text: `未完了タスクが${pending.length}件あります`, action: () => nav("tasks") },
            ].map((item, i) => (
              <div key={i} onClick={item.action} style={{ padding: "14px 18px", borderBottom: i < 2 ? "1px solid #F3F4F6" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                onMouseOver={e => e.currentTarget.style.background = "#F9FAFB"}
                onMouseOut={e => e.currentTarget.style.background = "#fff"}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1, fontSize: 13, color: "#374151" }}>{item.text}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>›</div>
              </div>
            ))}
          </div>
        </div>

        {/* 直近タスク */}
        <div style={{ marginBottom: 24 }}>
          <div style={s.sectionTitle}>
            <span>直近タスク</span>
            <button style={s.seeAll} onClick={() => nav("tasks")}>すべて見る →</button>
          </div>
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            {pending.slice(0, 3).map((t, i) => (
              <div key={t.id} onClick={() => nav("tasks")} style={{ padding: "14px 18px", borderBottom: i < Math.min(pending.length, 3) - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                onMouseOver={e => e.currentTarget.style.background = "#F9FAFB"}
                onMouseOut={e => e.currentTarget.style.background = "#fff"}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: PRIO[t.prio]?.c || "#9CA3AF", flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{t.title}</div>
                {t.due && <div style={{ fontSize: 11, color: "#9CA3AF" }}>{t.due}</div>}
              </div>
            ))}
            {pending.length === 0 && <div style={{ padding: 20, color: "#9CA3AF", fontSize: 13, textAlign: "center" }}>タスクはありません 🎉</div>}
          </div>
        </div>

        {/* 掲示板 */}
        {boardPosts.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={s.sectionTitle}>
              <span>社内掲示板</span>
              <button style={s.seeAll} onClick={() => nav("board")}>すべて見る →</button>
            </div>
            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              {boardPosts.slice(0, 2).map((post, i) => {
                const CAT_COLOR = { "業務連絡": "#1D4ED8", "スケジュール": "#166534", "緊急連絡": "#DC2626", "その他": "#374151" };
                const CAT_BG = { "業務連絡": "#EFF6FF", "スケジュール": "#F0FDF4", "緊急連絡": "#FEF2F2", "その他": "#F9FAFB" };
                return (
                  <div key={post.id} onClick={() => nav("board")} style={{ padding: "14px 18px", borderBottom: i < 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}
                    onMouseOver={e => e.currentTarget.style.background = "#F9FAFB"}
                    onMouseOut={e => e.currentTarget.style.background = "#fff"}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ background: CAT_BG[post.category], color: CAT_COLOR[post.category], borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{post.category}</span>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>{post.author}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.content}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* PWモーダル */}
      {pwModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: 300, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#1F2937" }}>🔒 財務・書類管理</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>パスワードを入力してください</div>
            <input type="password" value={pwInput} autoFocus
              onChange={e => { setPwInput(e.target.value); setPwErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleUnlock()}
              placeholder="パスワード"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: pwErr ? "2px solid #DC2626" : "1.5px solid #E5E7EB", fontSize: 15, boxSizing: "border-box", marginBottom: 4, color: "#1F2937", outline: "none" }} />
            {pwErr && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>{pwErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => { setPwModal(false); setPwInput(""); setPwErr(""); }} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={handleUnlock} style={{ flex: 1, padding: 12, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>開く</button>
            </div>
          </div>
        </div>
      )}

      {editTile && (
        <Modal title="タイルを編集" onClose={() => setEditTile(null)} onSave={() => { saveTileConf(tileConf.map(t => t.key === editTile.key ? editTile : t)); setEditTile(null); }}>
          <Inp label="アイコン" value={editTile.icon} onChange={e => setEditTile({ ...editTile, icon: e.target.value })} />
          <Inp label="ラベル名" value={editTile.label} onChange={e => setEditTile({ ...editTile, label: e.target.value })} />
        </Modal>
      )}
    </div>
  );
}