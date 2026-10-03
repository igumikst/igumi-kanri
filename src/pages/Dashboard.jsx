import { useState, useMemo } from "react";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { STATUS_STYLE, fmt, PROJECT_STATS_SINCE } from "../lib/constants";

const DASHBOARD_STATUSES = ["発注待ち", "失注", "着工", "完了"];

const PERIOD_OPTIONS = [
  { key: "all", label: "全期間" },
  { key: "thisMonth", label: "今月" },
  { key: "lastMonth", label: "先月" },
  { key: "thisYear", label: "今年" },
];

const inPeriod = (createdAt, period) => {
  if (period === "all") return true;
  const d = new Date(createdAt);
  if (isNaN(d)) return false;
  const now = new Date();
  if (period === "thisYear") return d.getFullYear() === now.getFullYear();
  if (period === "thisMonth") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === "lastMonth") {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
  }
  return true;
};

const cmpVal = (av, bv, dir) => {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv, "ja") : bv.localeCompare(av, "ja");
  return dir === "asc" ? av - bv : bv - av;
};

const pctLabel = v => v == null ? "—" : `${v.toFixed(1)}%`;

const Th = ({ label, k, sort, onSort }) => (
  <th onClick={() => onSort(k)} style={{ padding: "8px 10px", fontSize: 11, color: "#6B7280", textAlign: "left", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
    {label}{sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
  </th>
);

export default function Dashboard({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W, salesReps }) {
  const pending = tks.filter(t => !t.done);
  const [period, setPeriod] = useState("all");
  const [repFilter, setRepFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [sort, setSort] = useState({ key: "amt", dir: "desc" });

  const coMap = useMemo(() => Object.fromEntries(cos.map(c => [c.id, c])), [cos]);
  const repCompanyMap = useMemo(() => Object.fromEntries((salesReps || []).map(r => [r.id, r.company_id])), [salesReps]);

  const repOptions = useMemo(() => {
    const map = new Map();
    pjs.forEach(p => {
      const k = p.salesRepId || p.salesRep || "unknown";
      if (!map.has(k)) map.set(k, p.salesRep || "未設定");
    });
    return [...map.entries()];
  }, [pjs]);

  const clientOptions = useMemo(() => {
    const map = new Map();
    pjs.forEach(p => {
      if (p.clientId && !map.has(p.clientId)) map.set(p.clientId, coMap[p.clientId]?.name || "不明");
    });
    return [...map.entries()];
  }, [pjs, coMap]);

  const filtered = useMemo(() => {
    return pjs.filter(p => {
      if (p.created_at < PROJECT_STATS_SINCE) return false;
      if (!inPeriod(p.created_at, period)) return false;
      if (repFilter && (p.salesRepId || p.salesRep || "unknown") !== repFilter) return false;
      if (clientFilter && p.clientId !== clientFilter) return false;
      return true;
    });
  }, [pjs, period, repFilter, clientFilter]);

  const totalAmt = filtered.reduce((s, p) => s + (p.amount || 0), 0);
  const confirmed = filtered.filter(p => p.gp > 0);
  const unconfirmedCount = filtered.length - confirmed.length;
  const confirmedAmt = confirmed.reduce((s, p) => s + (p.amount || 0), 0);
  const totalGp = confirmed.reduce((s, p) => s + (p.gp || 0), 0);
  const gpRate = confirmedAmt ? totalGp / confirmedAmt * 100 : null;
  const wonCount = filtered.filter(p => p.status === "着工" || p.status === "完了").length;
  const lostCount = filtered.filter(p => p.status === "失注").length;
  const decidedCount = wonCount + lostCount;
  const winRate = decidedCount ? wonCount / decidedCount * 100 : null;

  const statusBreakdown = DASHBOARD_STATUSES.map(s => {
    const list = filtered.filter(p => p.status === s);
    return { status: s, count: list.length, amt: list.reduce((sum, p) => sum + (p.amount || 0), 0) };
  });
  const maxStatusCount = Math.max(...statusBreakdown.map(x => x.count), 1);

  const repGroups = useMemo(() => {
    const groups = new Map();
    filtered.forEach(p => {
      const k = p.salesRepId || p.salesRep || "unknown";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    return [...groups.entries()].map(([key, list]) => {
      const name = list.find(p => p.salesRep)?.salesRep || "未設定";
      const clientId = list.find(p => p.clientId)?.clientId || repCompanyMap[key];
      const clientName = clientId ? (coMap[clientId]?.name || "不明") : "—";
      const count = list.length;
      const amt = list.reduce((s, p) => s + (p.amount || 0), 0);
      const confirmedList = list.filter(p => p.gp > 0);
      const confirmedAmtG = confirmedList.reduce((s, p) => s + (p.amount || 0), 0);
      const gp = confirmedList.reduce((s, p) => s + (p.gp || 0), 0);
      const gpRateG = confirmedAmtG ? gp / confirmedAmtG * 100 : null;
      const wonN = list.filter(p => p.status === "着工" || p.status === "完了").length;
      const lostN = list.filter(p => p.status === "失注").length;
      const orderRate = (wonN + lostN) ? wonN / (wonN + lostN) * 100 : null;
      return { key, name, clientName, count, amt, gp, gpRate: gpRateG, orderRate };
    });
  }, [filtered, coMap, repCompanyMap]);

  const sortedRepGroups = useMemo(() => {
    return [...repGroups].sort((a, b) => cmpVal(a[sort.key], b[sort.key], sort.dir));
  }, [repGroups, sort]);

  const toggleSort = key => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: typeof repGroups[0]?.[key] === "string" ? "asc" : "desc" });
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="dashboard" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="🧭 ダッシュボード" back={() => nav("home")} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>

        <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>担当者</div>
            <select value={repFilter} onChange={e => setRepFilter(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
              <option value="">すべて</option>
              {repOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>元請</div>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
              <option value="">すべて</option>
              {clientOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>期間(登録日基準)</div>
            <select value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
              {PERIOD_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {[
            { label: "案件数", value: `${filtered.length}件`, color: "#1A3A5C", icon: "📋" },
            { label: "売上合計", value: fmt(totalAmt), color: "#E07B39", icon: "💰" },
            { label: "粗利合計", value: fmt(totalGp), color: "#059669", icon: "📈" },
            { label: "粗利率", value: pctLabel(gpRate), color: "#7C3AED", icon: "📊" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 14, padding: "14px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {unconfirmedCount > 0 && (
          <div style={{ background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#9A3412" }}>
            ⚠️ 粗利未確定: {unconfirmedCount}件(粗利が0または未入力)— 粗利合計・粗利率の計算からは除外しています
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 14 }}>📋 状態別の件数・売上</div>
          {statusBreakdown.map(({ status, count, amt }) => {
            const st = STATUS_STYLE[status];
            return (
              <div key={status} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: st.text }}>{status}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{count}件 / {fmt(amt)}</span>
                </div>
                <div style={{ background: "#F3F4F6", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${(count / maxStatusCount) * 100}%`, height: "100%", background: st.border, borderRadius: 4, transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12, fontSize: 11, color: "#9CA3AF" }}>
            受注率: {pctLabel(winRate)}(着工+完了 ÷ 着工+完了+失注。発注待ち・見積中は未決着のため対象外)
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 14 }}>👤 担当者別集計</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                  <Th label="元請" k="clientName" sort={sort} onSort={toggleSort} />
                  <Th label="担当者" k="name" sort={sort} onSort={toggleSort} />
                  <Th label="案件数" k="count" sort={sort} onSort={toggleSort} />
                  <Th label="売上合計" k="amt" sort={sort} onSort={toggleSort} />
                  <Th label="粗利合計" k="gp" sort={sort} onSort={toggleSort} />
                  <Th label="粗利率" k="gpRate" sort={sort} onSort={toggleSort} />
                  <Th label="受注率" k="orderRate" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedRepGroups.map(g => (
                  <tr key={g.key} style={{ borderBottom: "1px solid #F9FAFB" }}>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>{g.clientName}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#1F2937", whiteSpace: "nowrap" }}>{g.name}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151" }}>{g.count}件</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#E07B39", fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(g.amt)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#059669", fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(g.gp)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151" }}>{pctLabel(g.gpRate)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151" }}>{pctLabel(g.orderRate)}</td>
                  </tr>
                ))}
                {sortedRepGroups.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>該当する案件がありません</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
