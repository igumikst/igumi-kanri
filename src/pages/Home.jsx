import { useState } from "react";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { Modal, Inp } from "../components/UI";
import { PRIO } from "../lib/constants";
import { supabase } from "../lib/supabase";

export default function Home({ pjs, cos, tks, links, cust, tileConf, tileEdit, setTileEdit, saveTileConf, saveCustomize, weather, weekWeather, fishWeather, isPC, pp, nav, setModal, setEc, ec, rpOpen, setRpOpen, finFiles, tmplFiles, SB_W, RP_W, boardPosts, calls, setCalls }) {
  const [editTile, setEditTile] = useState(null);
  const [showWeekWeather, setShowWeekWeather] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [finUnlocked, setFinUnlocked] = useState(false);
  const [savedPw, setSavedPw] = useState(null);
  const [pwLoaded, setPwLoaded] = useState(false);
  const [showStorage, setShowStorage] = useState(false); // ★追加

  const pending = tks.filter(t => !t.done);
  const active = pjs.filter(p => p.status !== "完了" && p.status !== "中断");
  const tiles = tileConf.filter(t => t.visible || tileEdit).map(t => ({
    ...t,
    sub: t.key === "projects" ? `${active.length}件進行中` : t.key === "companies" ? `${cos.length}社登録` : t.key === "tasks" ? `未完了 ${pending.length}件` : t.sub
  }));

  // ★ストレージ計算
  const finMB = finFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
  const tmplMB = tmplFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
  const totalMB = finMB + tmplMB;
  const limitMB = 1024;
  const storageP = Math.min((totalMB / limitMB) * 100, 100);
  const storageCol = storageP > 80 ? "#EF4444" : storageP > 50 ? "#F59E0B" : "#059669";
  const fmtMB = mb => mb < 1 ? `${(mb * 1024).toFixed(0)}KB` : `${mb.toFixed(1)}MB`;

  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const weatherIcon = code => code === 0 ? "☀️" : code <= 2 ? "🌤" : code === 3 ? "☁️" : code <= 48 ? "🌫" : code <= 55 ? "🌦" : code <= 65 ? "🌧" : code <= 75 ? "🌨" : code <= 82 ? "🌦" : code <= 99 ? "⛈" : "🌡";

  const refreshCalls = async () => {
    setRefreshing(true);
    const { data } = await supabase.from("calls").select("*").order("received_at", { ascending: false });
    if (data) setCalls(data);
    setRefreshing(false);
  };

  const loadPw = async () => {
    if (pwLoaded) return savedPw;
    const { data } = await supabase.from("home_settings").select("value").eq("id", "finance_password").single();
    const pw = data?.value?.password || null;
    setSavedPw(pw);
    setPwLoaded(true);
    return pw;
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

  const openChatGPT = () => {
    window.location.href = "chatgpt://";
    setTimeout(() => { window.open("https://chatgpt.com", "_blank"); }, 1500);
  };

  const handleTileClick = (t) => {
    if (t.key === "chatgpt") { openChatGPT(); return; }
    if (t.key === "report") { window.open("/report.html", "_blank"); return; }
    if (t.key === "finance") { handleFinanceClick(); return; }
    nav(t.key);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: cust.bg, minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="home" nav={nav} setModal={setModal} setEc={setEc} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      {!isPC && <div style={{ background: cust.c1, color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ background: cust.acc, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16 }}>I</div>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 16 }}>{cust.sys}</div><div style={{ fontSize: 10, opacity: 0.65 }}>{cust.name}</div></div>
        <button onClick={refreshCalls} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 16, cursor: "pointer" }}>{refreshing ? "⏳" : "🔄"}</button>
        <button onClick={() => { setEc({ ...cust }); setModal("cust"); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>⚙ 編集</button>
      </div>}

      <div style={{ background: `linear-gradient(135deg,${cust.c1},${cust.c2})`, padding: "20px 20px 28px", margin: "0 0 -16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>{new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>{cust.name}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{cust.sys}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>案件 {pjs.length}件 ｜ 取引先 {cos.length}社</div>
          </div>
          {weather && (
            <div onClick={() => setShowWeekWeather(p => !p)} style={{ textAlign: "right", background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: "10px 14px", flexShrink: 0, cursor: "pointer" }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>{weather.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4 }}>{weather.temp}°C</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>{weather.desc}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>横浜 タップで週間</div>
            </div>
          )}
        </div>
        {showWeekWeather && weekWeather && (
          <div style={{ marginTop: 14, background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 8px", display: "flex", gap: 4, overflowX: "auto" }}>
            {weekWeather.map((d, i) => (
              <div key={i} style={{ flex: 1, minWidth: 44, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>{i === 0 ? "今日" : WD[d.weekday]}</div>
                <div style={{ fontSize: 20 }}>{weatherIcon(d.code)}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginTop: 2 }}>{d.max}°</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{d.min}°</div>
                {d.rain > 0 && <div style={{ fontSize: 9, color: "#BAE6FD", marginTop: 1 }}>{d.rain}mm</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: isPC ? "12px 0 20px" : "28px 14px 30px" }}>
        {calls && calls.length > 0 && (
          <div style={{ background: "linear-gradient(135deg, #1e3a5f, #2563eb)", borderRadius: 14, padding: "14px 18px", marginBottom: 16, boxShadow: "0 4px 12px rgba(37,99,235,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div onClick={() => nav("calls")} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <span style={{ fontSize: 20 }}>📞</span>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>電話受付案件</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={refreshCalls} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 14, cursor: "pointer" }}>{refreshing ? "⏳" : "🔄"}</button>
                <span onClick={() => nav("calls")} style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>一覧を見る →</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { label: "未対応", color: "#ef4444", bg: "rgba(239,68,68,0.15)", count: calls.filter(c => c.status === "未対応").length },
                { label: "対応中", color: "#f59e0b", bg: "rgba(245,158,11,0.15)", count: calls.filter(c => c.status === "対応中").length },
                { label: "完了",   color: "#10b981", bg: "rgba(16,185,129,0.15)", count: calls.filter(c => c.status === "完了").length },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 10, padding: "8px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {calls.filter(c => c.status === "未対応").length > 0 && (
              <div onClick={() => nav("calls")} style={{ marginTop: 10, background: "rgba(239,68,68,0.1)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
                {calls.filter(c => c.status === "未対応").slice(0, 1).map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, background: "#ef4444", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>🔴 未対応</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.company_name}｜{c.property_name}｜{c.ai_summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {boardPosts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>📣 社内掲示板</div>
              <button onClick={() => nav("board")} style={{ fontSize: 11, color: cust.c1, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>すべて見る →</button>
            </div>
            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              {boardPosts.slice(0, 3).map((post, i) => {
                const CAT_COLOR = { "業務連絡": "#1D4ED8", "スケジュール": "#166534", "緊急連絡": "#DC2626", "その他": "#374151" };
                const CAT_BG = { "業務連絡": "#EFF6FF", "スケジュール": "#F0FDF4", "緊急連絡": "#FEF2F2", "その他": "#F9FAFB" };
                return (
                  <div key={post.id} onClick={() => nav("board")} style={{ padding: "12px 16px", borderBottom: i < Math.min(boardPosts.length, 3) - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ background: CAT_BG[post.category] || "#F9FAFB", color: CAT_COLOR[post.category] || "#374151", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{post.category}</span>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>{post.author}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.content}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>DB一覧</div>
          <button onClick={() => { if (tileEdit) { saveTileConf(tileConf); } setTileEdit(!tileEdit); }} style={{ fontSize: 11, fontWeight: 700, color: tileEdit ? "#E07B39" : "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}>
            {tileEdit ? "✅ 完了" : "✏️ 並び替え・編集"}
          </button>
        </div>

        {isPC && !tileEdit && (
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 20 }}>
            {tiles.filter(t => t.visible).map((t, i, arr) => (
              <button key={t.key} onClick={() => handleTileClick(t)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", background: "none", border: "none", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", textAlign: "left" }}
                onMouseOver={e => e.currentTarget.style.background = "#F9FAFB"}
                onMouseOut={e => e.currentTarget.style.background = "none"}>
                <div style={{ width: 4, height: 36, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                <span style={{ fontSize: 22, flexShrink: 0 }}>{t.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", display: "flex", alignItems: "center", gap: 6 }}>
                    {t.label}
                    {t.key === "finance" && savedPw && <span style={{ fontSize: 12 }}>{finUnlocked ? "🔓" : "🔒"}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{t.sub}</div>
                </div>
                <div style={{ fontSize: 14, color: "#D1D5DB" }}>›</div>
              </button>
            ))}
          </div>
        )}

        {isPC && tileEdit && (
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 20 }}>
            {tiles.map((t, i) => (
              <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: i < tiles.length - 1 ? "1px solid #F3F4F6" : "none", opacity: t.visible ? 1 : 0.45 }}>
                <div style={{ width: 4, height: 32, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                <span style={{ fontSize: 20, flexShrink: 0 }}>{t.icon}</span>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "#1F2937" }}>{t.label}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => { const pi = tileConf.findIndex(x => x.key === t.key); if (pi > 0) { const n = [...tileConf]; [n[pi], n[pi - 1]] = [n[pi - 1], n[pi]]; saveTileConf(n); } }} style={{ background: "#F3F4F6", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 12, cursor: "pointer" }}>↑</button>
                  <button onClick={() => { const pi = tileConf.findIndex(x => x.key === t.key); if (pi < tileConf.length - 1) { const n = [...tileConf]; [n[pi], n[pi + 1]] = [n[pi + 1], n[pi]]; saveTileConf(n); } }} style={{ background: "#F3F4F6", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 12, cursor: "pointer" }}>↓</button>
                  <button onClick={() => setEditTile({ ...t })} style={{ background: "#EFF6FF", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, color: "#1A3A5C", cursor: "pointer" }}>✏️</button>
                  <button onClick={() => saveTileConf(tileConf.map(x => x.key === t.key ? { ...x, visible: !x.visible } : x))} style={{ background: t.visible ? "#FEF2F2" : "#F0FDF4", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>{t.visible ? "🙈" : "👁"}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isPC && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {tiles.map((t) => (
            <div key={t.key}>
              {tileEdit ? (
                <div style={{ background: "#fff", border: `2px solid ${t.visible ? "#E07B39" : "#E5E7EB"}`, borderRadius: 14, padding: "12px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", opacity: t.visible ? 1 : 0.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { const pi = tileConf.findIndex(x => x.key === t.key); if (pi > 0) { const n = [...tileConf]; [n[pi], n[pi - 1]] = [n[pi - 1], n[pi]]; saveTileConf(n); } }} style={{ background: "#F3F4F6", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 12, cursor: "pointer" }}>↑</button>
                      <button onClick={() => { const pi = tileConf.findIndex(x => x.key === t.key); if (pi < tileConf.length - 1) { const n = [...tileConf]; [n[pi], n[pi + 1]] = [n[pi + 1], n[pi]]; saveTileConf(n); } }} style={{ background: "#F3F4F6", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 12, cursor: "pointer" }}>↓</button>
                      <button onClick={() => setEditTile({ ...t })} style={{ background: "#EFF6FF", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "#1A3A5C", cursor: "pointer" }}>✏️</button>
                      <button onClick={() => saveTileConf(tileConf.map(x => x.key === t.key ? { ...x, visible: !x.visible } : x))} style={{ background: t.visible ? "#FEF2F2" : "#F0FDF4", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 11, cursor: "pointer" }}>{t.visible ? "🙈" : "👁"}</button>
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#1F2937" }}>{t.label}</div>
                  <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: t.color, width: "40%" }} />
                </div>
              ) : (
                <button onClick={() => handleTileClick(t)} style={{ width: "100%", background: "#fff", border: "none", borderRadius: 14, padding: "16px 14px", textAlign: "left", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                  <div style={{ fontSize: 26, marginBottom: 8 }}>{t.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1F2937", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    {t.label}
                    {t.key === "finance" && savedPw && <span style={{ fontSize: 12 }}>{finUnlocked ? "🔓" : "🔒"}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{t.sub}</div>
                  <div style={{ marginTop: 10, height: 3, borderRadius: 2, background: t.color, width: "40%" }} />
                </button>
              )}
            </div>
          ))}
        </div>}

        <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 10 }}>直近のタスク</div>
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          {pending.slice(0, 3).map((t, i) => (
            <div key={t.id} style={{ padding: "12px 16px", borderBottom: i < Math.min(pending.length, 3) - 1 ? "1px solid #F3F4F6" : "none", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRIO[t.prio]?.c || "#9CA3AF", flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{t.title}</div>
              {t.due && <div style={{ fontSize: 11, color: "#9CA3AF" }}>{t.due}</div>}
            </div>
          ))}
          {pending.length === 0 && <div style={{ padding: 16, color: "#9CA3AF", fontSize: 13, textAlign: "center" }}>タスクはありません</div>}
          <button onClick={() => nav("tasks")} style={{ width: "100%", padding: 10, background: "#F9FAFB", border: "none", fontSize: 12, color: cust.c1, fontWeight: 700, cursor: "pointer", borderTop: "1px solid #F3F4F6" }}>すべて見る →</button>
        </div>

        {/* ★ストレージ表示（ひっそり） */}
        <div style={{ marginTop: 24 }}>
          <button onClick={() => setShowStorage(p => !p)}
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0" }}>
            <span style={{ fontSize: 11, color: "#C4C4C4" }}>📦 Storage {fmtMB(totalMB)} / 1GB</span>
            <span style={{ fontSize: 10, color: "#C4C4C4" }}>{showStorage ? "▲" : "▼"}</span>
          </button>
          {showStorage && (
            <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>ストレージ使用量</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: storageCol }}>{storageP.toFixed(1)}%</span>
              </div>
              <div style={{ background: "#E5E7EB", borderRadius: 4, height: 8, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ width: `${storageP}%`, height: "100%", background: storageCol, borderRadius: 4, transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280" }}>
                <span>📂 財務ファイル　{fmtMB(finMB)}</span>
                <span>📋 雛形　{fmtMB(tmplMB)}</span>
              </div>
              <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#9CA3AF" }}>合計 {fmtMB(totalMB)} / 1GB</div>
            </div>
          )}
        </div>
      </div>

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

      {editTile && (<Modal title="タイルを編集" onClose={() => setEditTile(null)} onSave={() => { saveTileConf(tileConf.map(t => t.key === editTile.key ? editTile : t)); setEditTile(null); }}>
        <Inp label="アイコン" value={editTile.icon} onChange={e => setEditTile({ ...editTile, icon: e.target.value })} />
        <Inp label="ラベル名" value={editTile.label} onChange={e => setEditTile({ ...editTile, label: e.target.value })} />
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>カラー</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="color" value={editTile.color} onChange={e => setEditTile({ ...editTile, color: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} />
            <div style={{ flex: 1, height: 36, borderRadius: 8, background: editTile.color }} />
          </div>
        </div>
      </Modal>)}
    </div>
  );
}