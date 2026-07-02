import { useState, useRef, useEffect } from "react";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { Modal, Inp } from "../components/UI";
import AiAssistModal from "../components/AiAssistModal";
import { PRIO } from "../lib/constants";
import { supabase } from "../lib/supabase";

const NAVY = "#122a4a";
const SCHEDULE_BLUE = "#1a56a0";
const BG = "#eef1f6";
const WD = ["日", "月", "火", "水", "木", "金", "土"];

const CAT_COLOR_MAP = {
  "現調": "#2563eb", "調査": "#16a34a", "工事": "#9333ea",
  "打ち合わせ": "#0891b2", "緊急当番": "#dc2626", "事務": "#78716c",
  "外出": "#92400e", "休み": "#db2777", "その他": "#6b7280",
};
const getCatColor = (sc) => sc.color || CAT_COLOR_MAP[sc.category] || "#6b7280";

const fmtCallDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const fmtBlogDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
};

const Pill = ({ children, onClick }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
    style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 700, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }}
  >
    {children}
  </button>
);

export default function Home({ pjs, cos, tks, links, cust, tileConf, tileEdit, setTileEdit, saveTileConf, saveCustomize, weather, weekWeather, fishWeather, isPC, pp, nav, setModal, setEc, ec, rpOpen, setRpOpen, finFiles, tmplFiles, SB_W, RP_W, boardPosts, calls, setCalls }) {
  const [editTile, setEditTile] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [akPwModal, setAkPwModal] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [akPwInput, setAkPwInput] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [akPwErr, setAkPwErr] = useState("");
  const [finUnlocked, setFinUnlocked] = useState(false);
  const [savedPw, setSavedPw] = useState(null);
  const [pwLoaded, setPwLoaded] = useState(false);
  const [showStorage, setShowStorage] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bannerMode, setBannerMode] = useState("schedule");
  const [calBase, setCalBase] = useState(0);
  const [weekSchedules, setWeekSchedules] = useState([]);
  const [todaySchedules, setTodaySchedules] = useState([]);
  const [detailSc, setDetailSc] = useState(null);
  const [blogPosts, setBlogPosts] = useState([]);
  const [aiAssist, setAiAssist] = useState(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const pending = tks.filter(t => !t.done);
  const active = pjs.filter(p => p.status !== "完了" && p.status !== "中断");
  const unsubmitted = pjs.filter(p => p.status === "進行中" || p.status === "着工");
  const estimateStatus = {
    "作成中": pjs.filter(p => p.status === "見積中").length,
    "提出待ち": pjs.filter(p => p.status === "発注待ち").length,
    "回答待ち": pjs.filter(p => p.status === "着工").length,
    "受注": pjs.filter(p => p.status === "進行中").length,
  };
  const pendingCalls = (calls || []).filter(c => c.status === "未対応");
  const pendingCallsCount = pendingCalls.length;
  const todayLabel = new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });

  const tiles = tileConf.filter(t => t.visible || tileEdit).map(t => ({
    ...t,
    sub: t.key === "projects" ? `${active.length}件進行中` : t.key === "companies" ? `${cos.length}社登録` : t.key === "tasks" ? `未完了 ${pending.length}件` : t.sub
  }));

  const finMB = finFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
  const tmplMB = tmplFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
  const totalMB = finMB + tmplMB;
  const storageP = Math.min((totalMB / 1024) * 100, 100);
  const storageCol = storageP > 80 ? "#EF4444" : storageP > 50 ? "#F59E0B" : "#059669";
  const fmtMB = mb => mb < 1 ? `${(mb * 1024).toFixed(0)}KB` : `${mb.toFixed(1)}MB`;
  const weatherIcon = code => code === 0 ? "☀️" : code <= 2 ? "🌤" : code === 3 ? "☁️" : code <= 48 ? "🌫" : code <= 55 ? "🌦" : code <= 65 ? "🌧" : code <= 75 ? "🌨" : code <= 82 ? "🌦" : code <= 99 ? "⛈" : "🌡";

  useEffect(() => {
    const fetch7Days = async () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const todayStr = `${y}-${m}-${d}`;
      const end = new Date(now); end.setDate(now.getDate() + 6); end.setHours(23, 59, 59);
      const { data } = await supabase
        .from("schedules").select("*")
        .gte("start_at", `${todayStr}T00:00:00`)
        .lte("start_at", end.toISOString())
        .order("start_at");
      if (data) {
        setWeekSchedules(data);
        setTodaySchedules(data.filter(sc => sc.start_at?.slice(0, 10) === todayStr));
      }
    };
    fetch7Days();
  }, []);

  useEffect(() => {
    (async () => {
      const applyPosts = (rows) => {
        setBlogPosts(rows.map((p, i) => ({
          id: p.id || p.url || String(i),
          title: p.title,
          url: p.url,
          thumbnail_url: p.thumbnail_url || null,
          published_at: p.published_at,
        })));
      };

      try {
        const res = await fetch("/api/blog-feed");
        if (res.ok) {
          const json = await res.json();
          if (json.posts?.length) {
            applyPosts(json.posts);
            return;
          }
        }
      } catch (_) { /* fall through to Supabase */ }

      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, url, thumbnail_url, published_at")
        .order("published_at", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(3);
      if (!error && data?.length) applyPosts(data);
    })();
  }, []);

  function getDayKey(offset = 0) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getScForDay(offset) {
    const key = getDayKey(offset);
    return weekSchedules.filter(sc => sc.start_at?.slice(0, 10) === key);
  }

  const formatTime = (isoStr) => {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const formatTimeRange = (sc) => {
    if (sc.all_day) return "終日";
    const s = formatTime(sc.start_at);
    const e = sc.end_at ? formatTime(sc.end_at) : "";
    return e ? `${s}-${e}` : s;
  };

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
    setSavedPw(pw); setPwLoaded(true); return pw;
  };

  const handleFinanceClick = async () => {
    const pw = await loadPw();
    if (!pw || finUnlocked) { nav("finance"); }
    else { setPwModal(true); setPwInput(""); setPwErr(""); }
  };

  const handleAiKnowledgeClick = async () => {
    const pw = await loadPw();
    if (!pw || finUnlocked) { nav("aiknowledge"); }
    else { setAkPwModal(true); setAkPwInput(""); setAkPwErr(""); }
  };

  const handleUnlock = () => {
    if (pwInput === savedPw) { setFinUnlocked(true); setPwModal(false); setPwInput(""); nav("finance"); }
    else setPwErr("パスワードが違います");
  };

  const handleAkUnlock = () => {
    if (akPwInput === savedPw) { setFinUnlocked(true); setAkPwModal(false); setAkPwInput(""); nav("aiknowledge"); }
    else setAkPwErr("パスワードが違います");
  };

  const openChatGPT = () => {
    window.location.href = "chatgpt://";
    setTimeout(() => { window.open("https://chatgpt.com", "_blank"); }, 1500);
  };

  const openAiAssist = (mode, context) => {
    setAiAssist({ mode, context });
  };

  const handleTileClick = (t) => {
    if (t.key === "chatgpt") { openChatGPT(); return; }
    if (t.key === "report") { window.open("/report.html", "_blank"); return; }
    if (t.key === "finance") { handleFinanceClick(); return; }
    nav(t.key);
  };

  const drawerNav = (action) => {
    setDrawerOpen(false);
    action();
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && currentPage < 1) setCurrentPage(1);
      if (dx > 0 && currentPage > 0) setCurrentPage(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const IgumiHeader = () => (
    <div style={{ background: NAVY, color: "#fff", position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.5, lineHeight: 1.1 }}>IGUMI OS</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{cust.name || "株式会社IGUMI"}</div>
        </div>
        {weather && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>
            <span>{weather.icon}</span>
            <span style={{ fontWeight: 700 }}>{weather.temp}°C</span>
          </div>
        )}
        <button onClick={() => nav("calls")} style={{ position: "relative", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 10, padding: "8px 10px", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>
          🔔
          {pendingCallsCount > 0 && (
            <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
              {pendingCallsCount > 9 ? "9+" : pendingCallsCount}
            </span>
          )}
        </button>
        <button onClick={() => setDrawerOpen(true)} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 10, padding: "8px 10px", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>☰</button>
      </div>
      <div style={{ padding: "0 16px 10px", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
        {todayLabel} · 案件 {pjs.length}件 · 未対応電話 {pendingCallsCount}件
      </div>
    </div>
  );

  const ScheduleBanner = () => {
    if (bannerMode === "schedule") {
      const WD_JP = ["日", "月", "火", "水", "木", "金", "土"];
      const days = [0, 1, 2, 3].map(i => {
        const d = new Date(); d.setDate(d.getDate() + calBase + i);
        return d;
      });
      return (
        <div style={{ background: "#fff", borderRadius: 16, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ background: SCHEDULE_BLUE, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>📅 スケジュール</span>
              <button onClick={() => setBannerMode("dashboard")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 5, padding: "2px 7px", fontSize: 11, cursor: "pointer" }}>📊</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <button onClick={() => setCalBase(b => Math.max(0, b - 4))} disabled={calBase === 0}
                style={{ background: "rgba(255,255,255,0.2)", border: "none", color: calBase === 0 ? "rgba(255,255,255,0.3)" : "#fff", borderRadius: 5, padding: "2px 8px", fontSize: 12, cursor: calBase === 0 ? "default" : "pointer" }}>◀</button>
              <button onClick={() => setCalBase(b => b + 4)}
                style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 5, padding: "2px 8px", fontSize: 12, cursor: "pointer" }}>▶</button>
              <button onClick={() => nav("schedule")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 5, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>全て →</button>
              <button onClick={() => nav("schedule")} style={{ background: "#fff", border: "none", color: SCHEDULE_BLUE, borderRadius: 5, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>＋</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            {days.map((d, i) => {
              const offset = calBase + i;
              const isToday = offset === 0;
              const isSun = d.getDay() === 0;
              const isSat = d.getDay() === 6;
              const daySchs = getScForDay(offset);
              return (
                <div key={i} style={{ borderRight: i < 3 ? "1px solid #e5e7eb" : "none" }}>
                  <div style={{ textAlign: "center", padding: "6px 2px", borderBottom: "1px solid #e5e7eb", background: isToday ? "#eff6ff" : "#f8fafc" }}>
                    <div style={{ fontSize: 9, color: isSun ? "#dc2626" : isSat ? "#2563eb" : "#6b7280", fontWeight: 600 }}>{WD_JP[d.getDay()]}</div>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", margin: "2px auto", background: isToday ? SCHEDULE_BLUE : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isToday ? "#fff" : isSun ? "#dc2626" : isSat ? "#2563eb" : "#1f2937" }}>{d.getDate()}</span>
                    </div>
                  </div>
                  <div style={{ padding: "3px 2px", maxHeight: 180, overflowY: "auto" }}>
                    {daySchs.map((sc) => (
                      <div key={sc.id} onClick={() => setDetailSc(sc)}
                        style={{ background: getCatColor(sc) + "18", borderLeft: `3px solid ${getCatColor(sc)}`, borderRadius: 3, padding: "2px 3px", marginBottom: 2, cursor: "pointer" }}>
                        {!sc.all_day && (
                          <div style={{ fontSize: 8, color: "#555", fontWeight: 600, lineHeight: 1.3 }}>{formatTime(sc.start_at)}{sc.end_at ? `-${formatTime(sc.end_at)}` : ""}</div>
                        )}
                        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
                          <span style={{ background: getCatColor(sc), color: "#fff", borderRadius: 2, padding: "0 3px", fontSize: 8, fontWeight: 700, flexShrink: 0, lineHeight: 1.6 }}>{sc.category}</span>
                          <span style={{ fontSize: 9, color: "#1f2937", fontWeight: 600, lineHeight: 1.4, wordBreak: "break-all" }}>{sc.title}</span>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => nav("schedule")} style={{ width: "100%", background: "none", border: "1px dashed #e2e8f0", borderRadius: 3, color: "#cbd5e1", fontSize: 12, padding: "1px 0", cursor: "pointer", marginTop: 1 }}>＋</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div style={{ background: "linear-gradient(135deg, #1A3A5C, #2563EB)", borderRadius: 16, padding: "18px 20px", marginBottom: 16, boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>📊 今日の状況</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}</div>
            <button onClick={() => setBannerMode("schedule")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "rgba(255,255,255,0.85)", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", marginLeft: 4 }}>📅</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "進行中案件", value: `${active.length}件`, color: "#60A5FA", action: () => nav("projects") },
            { label: "未完了タスク", value: `${pending.length}件`, color: "#F87171", action: () => nav("tasks") },
            { label: "未対応電話", value: `${pendingCallsCount}件`, color: "#FBBF24", action: () => nav("calls") },
            { label: "取引先", value: `${cos.length}社`, color: "#34D399", action: () => nav("companies") },
          ].map(item => (
            <div key={item.label} onClick={item.action} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px", cursor: "pointer" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
        {weekWeather && (
          <div style={{ marginTop: 12, display: "flex", gap: 4, overflowX: "auto" }}>
            {weekWeather.map((d, i) => (
              <div key={i} style={{ flex: 1, minWidth: 32, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>{i === 0 ? "今日" : WD[d.weekday]}</div>
                <div style={{ fontSize: 14 }}>{weatherIcon(d.code)}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{d.max}°</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const FeatureCard = ({ icon, title, desc, bg, accent, onCardClick, pills, extraLink }) => (
    <div onClick={onCardClick} style={{ background: bg, borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", borderLeft: `4px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 26 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1f2937" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{desc}</div>
        </div>
        <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {pills}
        {extraLink}
      </div>
    </div>
  );

  const SideDrawer = () => {
    if (!drawerOpen) return null;
    const sectionTitle = { fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.45)", letterSpacing: 1, marginBottom: 8, marginTop: 16, textTransform: "uppercase" };
    const item = (label, action, extra) => (
      <button key={label} onClick={action} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 4px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
        <span style={{ flex: 1 }}>{label}</span>
        {extra}
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>›</span>
      </button>
    );
    return (
      <>
        <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300 }} />
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 280, background: NAVY, zIndex: 301, overflowY: "auto", padding: "20px 18px 40px", boxShadow: "-4px 0 24px rgba(0,0,0,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#fff" }}>メニュー</div>
            <button onClick={() => setDrawerOpen(false)} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 8, width: 32, height: 32, fontSize: 16, cursor: "pointer" }}>✕</button>
          </div>
          <div style={sectionTitle}>メインメニュー</div>
          {item("🏠 ホーム", () => drawerNav(() => setCurrentPage(0)))}
          {item("📅 スケジュール", () => drawerNav(() => nav("schedule")))}
          {item("📸 報告書作成", () => drawerNav(() => window.open("/report.html", "_blank")))}
          {item("📝 見積書作成", () => drawerNav(() => nav("estimate")))}
          {item("📋 案件", () => drawerNav(() => nav("projects")))}
          {item("✅ タスク", () => drawerNav(() => nav("tasks")))}
          {item("🏢 取引先", () => drawerNav(() => nav("companies")))}
          {item("📌 掲示板", () => drawerNav(() => nav("board")))}
          {item("📞 電話受付", () => drawerNav(() => nav("calls")))}
          {item("📦 報告書保管箱", () => drawerNav(() => nav("reports")))}
          <div style={sectionTitle}>外部ツール・サービス</div>
          {item("📧 メール", () => drawerNav(() => window.open("https://mail.google.com", "_blank")))}
          {item("🏗 コンクルー", () => drawerNav(() => window.open("https://conkuru.jp", "_blank")))}
          {item("💰 freee会計", () => drawerNav(() => window.open("https://secure.freee.co.jp", "_blank")))}
          {item("📁 Google Drive", () => drawerNav(() => window.open("https://drive.google.com", "_blank")))}
          {item("📅 Googleカレンダー", () => drawerNav(() => window.open("https://calendar.google.com", "_blank")))}
          <div style={sectionTitle}>社内限定</div>
          {item("🔒 財務/書類", () => drawerNav(() => handleFinanceClick()), savedPw ? <span style={{ fontSize: 12 }}>{finUnlocked ? "🔓" : "🔒"}</span> : null)}
          {item("🔒 AIナレッジ", () => drawerNav(() => handleAiKnowledgeClick()), savedPw ? <span style={{ fontSize: 12 }}>{finUnlocked ? "🔓" : "🔒"}</span> : null)}
          <div style={sectionTitle}>設定・その他</div>
          {item("🤖 AI補助", () => drawerNav(() => nav("ai")))}
          {item("🎣 釣り情報", () => drawerNav(() => nav("fishing")))}
          {item("📗 使い方", () => drawerNav(() => nav("usermanual")))}
        </div>
      </>
    );
  };

  const NewHomePage = () => (
    <div style={{ padding: "16px 16px 30px" }}>
      {!isPC && <IgumiHeader />}
      <ScheduleBanner />

      <FeatureCard
        icon="📸" title="報告書作成" desc="現場の記録を作成・管理します" bg="#e8f7f0" accent="#22a06b"
        onCardClick={() => window.open("/report.html", "_blank")}
        pills={[
          <Pill key="m" onClick={() => openAiAssist("mentor", "report")}>🧭 AIメンター</Pill>,
          <Pill key="r" onClick={() => openAiAssist("review", "report")}>🛡️ AIレビュー</Pill>,
        ]}
        extraLink={
          <button
            key="archive"
            onClick={(e) => { e.stopPropagation(); nav("reports"); }}
            style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 700, color: "#1a56a0", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            📦 保管箱
          </button>
        }
      />
      <FeatureCard
        icon="📝" title="見積書作成" desc="見積書の作成・管理を行います" bg="#fef3e8" accent="#e8862e"
        onCardClick={() => nav("estimate")}
        pills={[
          <Pill key="m" onClick={() => openAiAssist("mentor", "estimate")}>🧭 AIメンター</Pill>,
          <Pill key="r" onClick={() => openAiAssist("review", "estimate")}>🛡️ AIレビュー</Pill>,
        ]}
      />
      <FeatureCard
        icon="✍️" title="ブログ" desc="記事一覧・下書き管理" bg="#f0ecfa" accent="#7c5cd6"
        onCardClick={() => window.open("https://www.igumi-inc.jp/blog", "_blank")}
        pills={[
          <Pill key="l" onClick={() => window.open("https://www.igumi-inc.jp/blog", "_blank")}>記事一覧を見る</Pill>,
        ]}
      />

      {blogPosts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>最新のブログ記事</div>
            <button onClick={() => window.open("https://www.igumi-inc.jp/blog", "_blank")} style={{ fontSize: 11, color: "#6366F1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>すべて見る →</button>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            {blogPosts.map((post, i) => (
              <div key={post.id} onClick={() => window.open(post.url, "_blank")} style={{ padding: "12px 16px", borderBottom: i < blogPosts.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 86, height: 64, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#e5e7eb" }}>
                  {post.thumbnail_url ? (
                    <img src={post.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{post.title}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{fmtBlogDate(post.published_at)}</div>
                </div>
                <div style={{ fontSize: 12, color: "#9CA3AF", flexShrink: 0 }}>›</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {unsubmitted.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              未提出の報告書 <span style={{ background: "#EF4444", color: "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 11 }}>{unsubmitted.length}件</span>
            </div>
            <button onClick={() => nav("projects")} style={{ fontSize: 11, color: "#6366F1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>すべて見る →</button>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            {unsubmitted.slice(0, 3).map((p, i) => (
              <div key={p.id} onClick={() => nav("projects")} style={{ padding: "12px 16px", borderBottom: i < Math.min(unsubmitted.length, 3) - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1F2937" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>担当：{p.inCharge || "未設定"}</div>
                </div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>›</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }} onClick={() => nav("calls")}>
          <div style={{ fontSize: 12, fontWeight: 800, color: NAVY, marginBottom: 10 }}>📞 未対応の電話</div>
          {pendingCalls.length === 0 ? (
            <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "12px 0" }}>未対応はありません</div>
          ) : pendingCalls.slice(0, 2).map((c, i) => (
            <div key={c.id} style={{ padding: "8px 0", borderTop: i > 0 ? "1px solid #f3f4f6" : "none" }}>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>{fmtCallDate(c.received_at)}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginTop: 2 }}>{c.phone_number || "番号不明"}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: NAVY, marginBottom: 10 }}>📝 見積ステータス</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {Object.entries(estimateStatus).map(([label, count]) => (
              <div key={label} onClick={() => nav("projects")} style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 6px", textAlign: "center", cursor: "pointer" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: SCHEDULE_BLUE }}>{count}</div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const OldHomePage = () => (
    <div style={{ padding: "14px 14px 30px" }}>

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
              { label: "完了", color: "#10b981", bg: "rgba(16,185,129,0.15)", count: calls.filter(c => c.status === "完了").length },
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

      {!tileEdit && (
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 20 }}>
          {tiles.filter(t => t.visible).map((t, i, arr) => (
            <button key={t.key} onClick={() => handleTileClick(t)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", background: "none", border: "none", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", textAlign: "left" }}>
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

      {tileEdit && (
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

      <div style={{ marginTop: 24 }}>
        <button onClick={() => setShowStorage(p => !p)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0" }}>
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
              <span>📂 財務　{fmtMB(finMB)}</span>
              <span>📋 雛形　{fmtMB(tmplMB)}</span>
            </div>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#9CA3AF" }}>合計 {fmtMB(totalMB)} / 1GB</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: currentPage === 0 ? BG : "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="home" nav={nav} setModal={setModal} setEc={setEc} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      {!isPC && currentPage === 1 && (
        <div style={{ background: cust.c1, color: "#fff", padding: "12px 16px", position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>{cust.sys}</div>
            </div>
            {weather && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>
                <span>{weather.icon}</span>
                <span style={{ fontWeight: 700 }}>{weather.temp}°C</span>
              </div>
            )}
            <button onClick={refreshCalls} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 8px", fontSize: 14, cursor: "pointer" }}>{refreshing ? "⏳" : "🔄"}</button>
            <button onClick={() => { setEc({ ...cust }); setModal("cust"); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 8px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>⚙ 編集</button>
          </div>
          <div onClick={() => setShowInfo(p => !p)} style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", opacity: 0.75 }}>
            <span style={{ fontSize: 11 }}>{pjs.length}件 | {cos.length}社 | {new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}</span>
            <span style={{ fontSize: 10 }}>{showInfo ? "▲" : "▼"}</span>
          </div>
          {showInfo && (
            <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 10, fontSize: 12 }}>
              <div style={{ marginBottom: 4, color: "rgba(255,255,255,0.8)" }}>{cust.name}</div>
              <div style={{ color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>{new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</div>
              <div style={{ display: "flex", gap: 12, color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>
                <span>案件 {pjs.length}件</span>
                <span>取引先 {cos.length}社</span>
                <span>未完了タスク {pending.length}件</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", transform: `translateX(-${currentPage * 100}%)`, transition: "transform 0.3s ease", willChange: "transform" }}>
          <div style={{ minWidth: "100%", width: "100%" }}>
            <NewHomePage />
          </div>
          <div style={{ minWidth: "100%", width: "100%" }}>
            <OldHomePage />
          </div>
        </div>
      </div>

      {!isPC && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingBottom: 16, marginTop: -10 }}>
          {[0, 1].map(i => (
            <div key={i} onClick={() => setCurrentPage(i)} style={{ width: i === currentPage ? 20 : 8, height: 8, borderRadius: 4, background: i === currentPage ? NAVY : "#D1D5DB", cursor: "pointer", transition: "all 0.3s" }} />
          ))}
        </div>
      )}

      <SideDrawer />

      {detailSc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setDetailSc(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: getCatColor(detailSc), padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: 4, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{detailSc.category}</span>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{detailSc.title}</span>
              </div>
              <button onClick={() => setDetailSc(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 0 }}>
              {[
                { label: "日時", value: detailSc.all_day
                  ? detailSc.start_at?.slice(0, 10)
                  : `${detailSc.start_at?.slice(0, 10)} ${formatTime(detailSc.start_at)}${detailSc.end_at ? ` 〜 ${formatTime(detailSc.end_at)}` : ""}` },
                { label: "記入者", value: detailSc.assignees?.[0] || "―" },
                { label: "対応予定業者", value: detailSc.location?.startsWith("対応：") ? detailSc.location.replace("対応：", "") : "―" },
                { label: "メモ", value: detailSc.memo || "―" },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", borderBottom: "1px solid #f1f5f9", padding: "11px 16px", gap: 12 }}>
                  <div style={{ width: 80, flexShrink: 0, fontSize: 12, fontWeight: 600, color: "#6b7280", paddingTop: 1 }}>{row.label}</div>
                  <div style={{ flex: 1, fontSize: 13, color: "#1f2937", wordBreak: "break-all" }}>{row.value}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setDetailSc(null); nav("schedule"); }}
                style={{ padding: "8px 16px", background: SCHEDULE_BLUE, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                編集する
              </button>
              <button onClick={() => setDetailSc(null)}
                style={{ padding: "8px 14px", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {pwModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: 300, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#1F2937" }}>🔒 財務・書類管理</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>パスワードを入力してください</div>
            <input type="password" value={pwInput} autoFocus
              onChange={e => { setPwInput(e.target.value); setPwErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleUnlock()}
              placeholder="パスワード"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: pwErr ? "2px solid #DC2626" : "1.5px solid #E5E7EB", fontSize: 15, boxSizing: "border-box", marginBottom: 4, color: "#1F2937", background: "#fff", outline: "none" }} />
            {pwErr && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>{pwErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => { setPwModal(false); setPwInput(""); setPwErr(""); }} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={handleUnlock} style={{ flex: 1, padding: 12, background: NAVY, color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>開く</button>
            </div>
          </div>
        </div>
      )}

      {akPwModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: 300, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#1F2937" }}>🔒 AIナレッジ管理</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>パスワードを入力してください</div>
            <input type="password" value={akPwInput} autoFocus
              onChange={e => { setAkPwInput(e.target.value); setAkPwErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleAkUnlock()}
              placeholder="パスワード"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: akPwErr ? "2px solid #DC2626" : "1.5px solid #E5E7EB", fontSize: 15, boxSizing: "border-box", marginBottom: 4, color: "#1F2937", background: "#fff", outline: "none" }} />
            {akPwErr && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>{akPwErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => { setAkPwModal(false); setAkPwInput(""); setAkPwErr(""); }} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={handleAkUnlock} style={{ flex: 1, padding: 12, background: NAVY, color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>開く</button>
            </div>
          </div>
        </div>
      )}

      {aiAssist && (
        <AiAssistModal
          mode={aiAssist.mode}
          context={aiAssist.context}
          onClose={() => setAiAssist(null)}
        />
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
