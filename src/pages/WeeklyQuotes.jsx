import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { fmt } from "../lib/constants";
import { computeAdoptTotals } from "../lib/quoteAdopt";
import { TAX_RATE_PERCENT, TAX_ROUNDING, roundBy } from "../lib/quoteExport/loadQuoteForExport";

const HEADER_COLOR = "#1A3A5C";

// 今週(月曜〜日曜、日本時間)の範囲を、実行環境のタイムゾーンに関係なく求める。
// ① "sv-SE"表示で今日のJST基準の日付(YYYY-MM-DD)を取り、②その年月日だけでカレンダー上の
// 曜日を計算(タイムゾーンの影響を受けない)、③月曜の年月日が決まったら、そこだけ「+09:00」で
// 本当のUTC時刻に変換する(年月日の計算と、JST→UTC変換を混ぜないのがポイント)
function getWeekRangeJst(now = new Date()) {
  const todayKey = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const [y, m, d] = todayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=日,1=月,...6=土
  const diffToMonday = (dow + 6) % 7;
  const mondayCalc = new Date(Date.UTC(y, m - 1, d - diffToMonday));
  const mondayKey = `${mondayCalc.getUTCFullYear()}-${String(mondayCalc.getUTCMonth() + 1).padStart(2, "0")}-${String(mondayCalc.getUTCDate()).padStart(2, "0")}`;
  const monday = new Date(`${mondayKey}T00:00:00+09:00`);
  const nextMonday = new Date(monday.getTime() + 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return { startIso: monday.toISOString(), endIso: nextMonday.toISOString(), monday, sunday };
}

const fmtMd = d => d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];
const fmtCreated = iso => {
  const d = new Date(iso);
  const md = d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
  // 曜日は、JST基準の年月日だけから計算する(タイムゾーンのズレなし)
  const [yy, mm, dd] = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).split("-").map(Number);
  const wd = WEEKDAY_JA[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()];
  return `${md}(${wd})`;
};

const taxIncluded = amount => (Number(amount) || 0) + roundBy(TAX_ROUNDING, (Number(amount) || 0) * TAX_RATE_PERCENT / 100);

export default function WeeklyQuotes({ pjs, cos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, links, tks, SB_W, RP_W, submittedQuotes, wonQuotes, setQuoteProjectId, setOpenQuoteId, setOpenProjectId }) {
  const week = useMemo(() => getWeekRangeJst(), []);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]); // { quote, project, company, total, gp, provisional }
  const [tab, setTab] = useState("survey"); // "survey" | "construction"
  const [sortBy, setSortBy] = useState("new"); // "new" | "amount"
  const [clientFilter, setClientFilter] = useState("");
  const pending = (tks || []).filter(t => !t.done);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id,title,project_id,total_amount,gross_profit,status,construction_type,profit_confirmed,created_at")
        .gte("created_at", week.startIso)
        .lt("created_at", week.endIso)
        .order("created_at", { ascending: false });

      const built = await Promise.all((quotes || []).map(async q => {
        const project = (pjs || []).find(p => p.id === q.project_id) || null;
        const company = project ? (cos || []).find(c => c.id === project.clientId) || null : null;
        let total = Number(q.total_amount) || 0;
        let gp = q.gross_profit;
        let provisional = !q.profit_confirmed;
        if (q.status !== "won") {
          const r = await computeAdoptTotals(supabase, { quote: q, constructionType: q.construction_type || "自社のみ" });
          total = r.total;
          gp = r.gp;
          provisional = r.ownUnconfirmed || r.subMissing;
        }
        return { quote: q, project, company, total, gp, provisional };
      }));
      setRows(built);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week.startIso, week.endIso]);

  const isSurvey = r => (r.quote.title || "").includes("調査");
  const clientOptions = useMemo(() => {
    const names = new Set(rows.map(r => r.company?.name).filter(Boolean));
    return [...names].sort();
  }, [rows]);

  const openQuote = r => {
    if (!r.project) { alert("この見積の案件が見つかりませんでした"); return; }
    setQuoteProjectId(r.project.id);
    setOpenQuoteId(r.quote.id);
    nav("quotes");
  };
  const openMergedTarget = (e, targetId) => {
    e.stopPropagation();
    setOpenProjectId(targetId);
    nav("projects");
  };

  const filtered = rows
    .filter(r => (tab === "survey" ? isSurvey(r) : !isSurvey(r)))
    .filter(r => !clientFilter || r.company?.name === clientFilter)
    .sort((a, b) => sortBy === "amount" ? b.total - a.total : String(b.quote.created_at).localeCompare(String(a.quote.created_at)));

  const surveyCount = rows.filter(r => isSurvey(r) && (!clientFilter || r.company?.name === clientFilter)).length;
  const constructionCount = rows.filter(r => !isSurvey(r) && (!clientFilter || r.company?.name === clientFilter)).length;

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && (
        <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="weeklyquotes" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} submittedQuotes={submittedQuotes} />
      )}
      {isPC && (cust.showRightPanel !== false) && (
        <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} wonQuotes={wonQuotes} submittedQuotes={submittedQuotes} />
      )}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <div style={{ maxWidth: isPC ? 800 : "100%", margin: "0 auto", width: "100%" }}>
        <div style={{ background: HEADER_COLOR, color: "#fff", padding: "14px 16px", position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>← 戻る</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>🗓 今週作成した見積もり</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{fmtMd(week.monday)}(月)〜{fmtMd(week.sunday)}(日)</div>
          </div>
        </div>

        <div style={{ padding: "12px 14px 0" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[["survey", "調査", surveyCount], ["construction", "工事", constructionCount]].map(([key, label, count]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: "9px 0", borderRadius: 10, border: `1.5px solid ${tab === key ? HEADER_COLOR : "#E5E7EB"}`,
                background: tab === key ? HEADER_COLOR : "#fff", color: tab === key ? "#fff" : "#374151",
                fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                {label}
                <span style={{ background: tab === key ? "rgba(255,255,255,0.25)" : "#F3F4F6", borderRadius: 10, padding: "1px 8px", fontSize: 11 }}>{count}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ flex: "1 1 120px", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937", background: "#fff" }}>
              <option value="new">新しい順</option>
              <option value="amount">金額順</option>
            </select>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={{ flex: "2 1 160px", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937", background: "#fff" }}>
              <option value="">取引先: すべて</option>
              {clientOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: "4px 14px 80px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
              <div>今週作成された見積はまだありません</div>
            </div>
          ) : (
            filtered.map(r => (
              <div key={r.quote.id} onClick={() => openQuote(r)} style={{ background: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", borderLeft: `4px solid ${HEADER_COLOR}` }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#1F2937", marginBottom: 4, wordBreak: "break-word" }}>{r.quote.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                  <span>📋 {r.project?.name || "(案件不明)"}</span>
                  {r.project?.merged_into_id && (
                    <span onClick={e => openMergedTarget(e, r.project.merged_into_id)} style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>統合済み →</span>
                  )}
                  {r.company?.name && <span>🏢 {r.company.name}</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtCreated(r.quote.created_at)}作成</div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#1F2937" }}>{fmt(r.total)}<span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 400 }}>(税抜)</span></div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>税込 {fmt(taxIncluded(r.total))}</div>
                    <div style={{ fontSize: 12, color: "#059669", fontWeight: 700, marginTop: 2 }}>
                      粗利 {fmt(r.gp)}{r.provisional && <span style={{ color: "#D97706", fontWeight: 700 }}> (暫定)</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
