import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, PROJECT_STATS_SINCE } from "../lib/constants";
import "./DashboardPC.css";

// 発注済み/未発注の2区分の色(Quotes.jsxの完工済み=緑・発注前=青と合わせる)
const TWO_STATE_STYLE = {
  "発注済み": { text: "#065F46", border: "#34D399", bg: "#D1FAE5" },
  "未発注": { text: "#0B4F8A", border: "#60A5FA", bg: "#E0F0FF" },
  "未設定": { text: "#374151", border: "#94a3b8", bg: "#F3F4F6" },
};

const PERIODS = [
  { key: "all", label: "全期間" },
  { key: "thisMonth", label: "今月" },
  { key: "lastMonth", label: "先月" },
  { key: "thisYear", label: "今年" },
];

const BANDS = [
  { label: "〜100万", min: 0, max: 1_000_000 },
  { label: "〜300万", min: 1_000_000, max: 3_000_000 },
  { label: "〜500万", min: 3_000_000, max: 5_000_000 },
  { label: "〜1000万", min: 5_000_000, max: 10_000_000 },
  { label: "1000万〜", min: 10_000_000, max: Infinity },
];

const KIND_PALETTE = ["#3b82f6", "#e07b39", "#059669", "#7c3aed", "#0891b2", "#db2777", "#d97706", "#0f766e"];

const inPeriod = (registeredAt, period) => {
  if (period === "all") return true;
  const d = new Date(registeredAt);
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

const pctLabel = v => (v == null || Number.isNaN(v) ? "—" : `${v.toFixed(1)}%`);

const cmpVal = (av, bv, dir) => {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv, "ja") : bv.localeCompare(av, "ja");
  return dir === "asc" ? av - bv : bv - av;
};

const manLabel = n => {
  const v = n / 10000;
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 10) return Math.round(v).toLocaleString("ja-JP");
  return v.toFixed(1);
};

const shortYen = n => {
  if (!n) return "—";
  if (Math.abs(n) >= 10000) return `${Math.round(n / 10000)}万`;
  return fmt(n);
};

function Trend({ months, sell, gp }) {
  const box = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const apply = () => setWidth(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 168;
  const pad = { l: 40, r: 8, t: 10, b: 22 };
  const max = Math.max(...sell, ...gp, 1);
  const innerW = Math.max(width - pad.l - pad.r, 1);
  const innerH = H - pad.t - pad.b;
  const x = i => pad.l + (months.length <= 1 ? innerW / 2 : (i / (months.length - 1)) * innerW);
  const y = v => pad.t + innerH - (v / max) * innerH;
  const path = values => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const step = months.length > 8 ? Math.ceil(months.length / 6) : 1;
  const ticks = [0, 0.5, 1];

  return (
    <div>
      <div className="trend" ref={box}>
        {width > 0 && (
          <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label="売上と粗利の推移">
            {ticks.map(t => {
              const yy = y(max * t);
              return (
                <g key={t}>
                  <line x1={pad.l} x2={width - pad.r} y1={yy} y2={yy} stroke="#e3e9f3" strokeWidth="1" />
                  <text x={pad.l - 4} y={yy + 3} textAnchor="end" fontSize="10" fill="#5b6b86">{manLabel(max * t)}</text>
                </g>
              );
            })}
            <path d={path(sell)} fill="none" stroke="#e07b39" strokeWidth="2.5" />
            <path d={path(gp)} fill="none" stroke="#059669" strokeWidth="2.5" />
            {sell.map((v, i) => <circle key={`s${months[i].key}`} cx={x(i)} cy={y(v)} r="4" fill="#e07b39" />)}
            {gp.map((v, i) => <circle key={`g${months[i].key}`} cx={x(i)} cy={y(v)} r="4" fill="#059669" />)}
            {months.map((m, i) => (i % step === 0 || i === months.length - 1) ? (
              <text key={m.key} x={x(i)} y={H - 4} textAnchor="middle" fontSize="10" fill="#5b6b86">{m.label}</text>
            ) : null)}
          </svg>
        )}
      </div>
      <div className="legend">
        <span><i style={{ background: "#e07b39" }} />売上</span>
        <span><i style={{ background: "#059669" }} />粗利</span>
      </div>
      <div className="axis">万円・対応月</div>
    </div>
  );
}

function Donut({ slices }) {
  const total = slices.reduce((s, x) => s + x.n, 0);
  const r = 58;
  const circ = 2 * Math.PI * r;
  const positive = slices.filter(s => s.n > 0);
  const arcs = positive.map((s, i) => {
    const before = positive.slice(0, i).reduce((sum, x) => sum + x.n, 0);
    return {
      ...s,
      len: total ? (s.n / total) * circ : 0,
      off: total ? (before / total) * circ : 0,
    };
  });
  return (
    <div className="donut">
      <svg viewBox="0 0 190 190" role="img" aria-label="案件の状況">
        <g transform="translate(95 95) rotate(-90)">
          <circle r={r} fill="none" stroke="#e3e9f3" strokeWidth="22" />
          {arcs.map(a => (
            <circle
              key={a.name}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth="22"
              strokeDasharray={`${a.len} ${Math.max(circ - a.len, 0)}`}
              strokeDashoffset={-a.off}
            />
          ))}
        </g>
        <text x="95" y="92" textAnchor="middle" fontSize="22" fontWeight="700" fill="#14233f">{total}</text>
        <text x="95" y="112" textAnchor="middle" fontSize="11" fill="#5b6b86">件</text>
      </svg>
      <div className="legend col">
        {slices.map(s => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
            <b>{s.n}件</b>
            <em>{total ? `${Math.round((s.n / total) * 100)}%` : "—"}</em>
          </span>
        ))}
        {slices.length === 0 && <span>案件がありません</span>}
      </div>
    </div>
  );
}

/**
 * jobs: { id, name, kind, owner, ownerKey, hasWon, hasSubmitted, sell, cost, registeredAt, clientId, clientName }
 * hasWon/hasSubmittedは見積の状態から判断する発注済み/未発注のフラグ(第8弾テーマ3。案件のstatusは使わない)
 * cost が null の案件は粗利未確定（粗利合計・粗利率から除外）
 * bigJobs を渡すとそのまま大型工事欄に出す。未指定なら売上500万円以上を表示する。
 */
export default function DashboardPC({
  jobs = [],
  completedQuotes = [],
  kindColors,
  bigJobs,
  showTitle = false,
  branches = [],
  salesReps = [],
}) {
  const [period, setPeriod] = useState("thisMonth");
  const [owner, setOwner] = useState("");
  const [client, setClient] = useState("");
  const [branch, setBranch] = useState("");
  const [sort, setSort] = useState({ key: "amt", dir: "desc" });

  const clientOptions = useMemo(() => {
    const map = new Map();
    jobs.forEach(j => {
      if (j.clientId && !map.has(j.clientId)) map.set(j.clientId, j.clientName || "不明");
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [jobs]);

  const branchOptions = useMemo(() => {
    return branches
      .filter(b => !client || b.company_id === client)
      .map(b => [b.id, b.name || "(名称未設定)"])
      .sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [branches, client]);

  const baseFiltered = useMemo(() => jobs.filter(j => {
    if (!inPeriod(j.registeredAt, period)) return false;
    if ((j.registeredAt || "") < PROJECT_STATS_SINCE) return false;
    if (client && j.clientId !== client) return false;
    if (branch && j.branchId !== branch) return false;
    return true;
  }), [jobs, period, client, branch]);

  const ownerOptions = useMemo(() => {
    const repOpts = salesReps
      .filter(s => (!client || s.company_id === client) && (!branch || s.branch_id === branch))
      .map(s => [s.id, s.name || s.display_name || "(名前未設定)"]);
    const covered = new Set(repOpts.map(([k]) => k));
    const extra = new Map();
    baseFiltered.forEach(j => {
      const k = j.ownerKey || j.owner || "unknown";
      if (!covered.has(k) && !extra.has(k)) extra.set(k, j.owner || "未設定");
    });
    return [...repOpts, ...extra.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [salesReps, client, branch, baseFiltered]);

  const onClientChange = v => { setClient(v); setBranch(""); setOwner(""); };
  const onBranchChange = v => { setBranch(v); setOwner(""); };

  const filtered = useMemo(() => baseFiltered.filter(j => {
    if (owner && (j.ownerKey || j.owner || "unknown") !== owner) return false;
    return true;
  }), [baseFiltered, owner]);

  // 売上合計・粗利合計・粗利率・完工件数は、見積ごとのcompleted_on基準で別集計する
  // （対応日基準の filtered とは独立。第8弾ステップ2: 案件単位ではなく見積単位)
  const completedFilteredQuotes = useMemo(() => completedQuotes.filter(q => {
    if (!q.completedOn || q.completedOn < PROJECT_STATS_SINCE) return false;
    if (!inPeriod(q.completedOn, period)) return false;
    if (client && q.clientId !== client) return false;
    if (branch && q.branchId !== branch) return false;
    if (owner && (q.ownerKey || q.owner || "unknown") !== owner) return false;
    return true;
  }), [completedQuotes, period, client, branch, owner]);

  const totalAmt = completedFilteredQuotes.reduce((s, q) => s + (q.sell || 0), 0);
  const totalGp = completedFilteredQuotes.reduce((s, q) => s + (q.gp || 0), 0);
  const gpRate = totalAmt ? (totalGp / totalAmt) * 100 : null;
  const completedCount = completedFilteredQuotes.length;

  // 受注率(第8弾テーマ3): 発注済み(完工日基準・期間内に完工済みの見積がある案件、重複なし)
  // ÷ (発注済み + 未発注だけの案件(対応日基準・完工済みの見積が1つも無い))
  const wonProjectIdsInPeriod = useMemo(() => new Set(completedFilteredQuotes.map(q => q.projectId)), [completedFilteredQuotes]);
  const unorderedOnly = filtered.filter(j => j.hasSubmitted && !j.hasWon);
  const winRate = (wonProjectIdsInPeriod.size + unorderedOnly.length)
    ? (wonProjectIdsInPeriod.size / (wonProjectIdsInPeriod.size + unorderedOnly.length)) * 100
    : null;

  const months = useMemo(() => {
    const dates = filtered.map(j => new Date(j.registeredAt)).filter(d => !isNaN(d));
    if (!dates.length) return [];
    const maxD = new Date(Math.max(...dates));
    const minD = new Date(Math.min(...dates));
    const cap = new Date(maxD.getFullYear(), maxD.getMonth() - 11, 1);
    const start = new Date(minD.getFullYear(), minD.getMonth(), 1);
    const from = start < cap ? cap : start;
    const list = [];
    const cur = new Date(from);
    const end = new Date(maxD.getFullYear(), maxD.getMonth(), 1);
    while (cur <= end && list.length < 18) {
      const key = `${cur.getFullYear()}-${cur.getMonth()}`;
      list.push({ key, label: `${cur.getMonth() + 1}月`, y: cur.getFullYear(), m: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  }, [filtered]);

  const trend = useMemo(() => {
    const sell = months.map(() => 0);
    const gp = months.map(() => 0);
    const index = new Map(months.map((m, i) => [m.key, i]));
    filtered.forEach(j => {
      const d = new Date(j.registeredAt);
      if (isNaN(d)) return;
      const i = index.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i == null) return;
      sell[i] += j.sell || 0;
      if (j.cost != null) gp[i] += (j.sell || 0) - j.cost;
    });
    return { sell, gp };
  }, [filtered, months]);

  const kindSlices = useMemo(() => {
    const map = new Map();
    filtered.forEach(j => {
      const name = j.kind || "未設定";
      map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()].map(([name, n], i) => ({
      name,
      n,
      color: kindColors?.[name] || (name === "未設定" ? "#94a3b8" : KIND_PALETTE[i % KIND_PALETTE.length]),
    }));
  }, [filtered, kindColors]);

  // 状態別(第8弾テーマ3): 案件のstatusではなく、見積の状態(未発注/発注済み)の2区分に作り直す。
  // 同じ案件が両方に出ることがある(決定事項3)
  const statusRows = useMemo(() => {
    const subRows = filtered.filter(j => j.hasSubmitted);
    const wonRows = filtered.filter(j => j.hasWon);
    return [
      { status: "未発注", count: subRows.length, amt: subRows.reduce((s, j) => s + (j.sell || 0), 0) },
      { status: "発注済み", count: wonRows.length, amt: wonRows.reduce((s, j) => s + (j.sell || 0), 0) },
    ];
  }, [filtered]);
  const maxStatus = Math.max(...statusRows.map(r => r.count), 1);

  const bands = useMemo(() => {
    const counts = BANDS.map(b => ({ ...b, n: 0 }));
    filtered.forEach(j => {
      const sell = j.sell || 0;
      if (sell <= 0) return;
      const hit = counts.find(b => sell >= b.min && sell < b.max) || counts[counts.length - 1];
      hit.n += 1;
    });
    return counts;
  }, [filtered]);
  const maxBand = Math.max(...bands.map(b => b.n), 1);

  const ownerBars = useMemo(() => {
    const groups = new Map();
    filtered.forEach(j => {
      const k = j.ownerKey || j.owner || "unknown";
      if (!groups.has(k)) groups.set(k, { key: k, name: j.owner || "未設定", amt: 0, parts: new Map() });
      const g = groups.get(k);
      const sell = j.sell || 0;
      g.amt += sell;
      // 積み上げは重複なしの2区分(+見積が1つも無い案件は未設定)にする(第8弾テーマ3)
      const bucket = j.hasWon ? "発注済み" : j.hasSubmitted ? "未発注" : "未設定";
      g.parts.set(bucket, (g.parts.get(bucket) || 0) + sell);
    });
    return [...groups.values()].sort((a, b) => b.amt - a.amt).slice(0, 8);
  }, [filtered]);
  const maxOwner = Math.max(...ownerBars.map(o => o.amt), 1);

  const repGroups = useMemo(() => {
    const groups = new Map();
    filtered.forEach(j => {
      const k = j.ownerKey || j.owner || "unknown";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(j);
    });
    return [...groups.entries()].map(([key, list]) => {
      const name = list.find(j => j.owner)?.owner || "未設定";
      const names = [...new Set(list.map(j => j.clientName).filter(Boolean))];
      const clientName = names.length ? names.join("・") : "—";
      const amt = list.reduce((s, j) => s + (j.sell || 0), 0);
      const confirmedList = list.filter(j => j.cost != null);
      const confirmedAmtG = confirmedList.reduce((s, j) => s + (j.sell || 0), 0);
      const gp = confirmedList.reduce((s, j) => s + ((j.sell || 0) - j.cost), 0);
      const gpRateG = confirmedAmtG ? (gp / confirmedAmtG) * 100 : null;
      // 受注率は全体のKPIと同じ考え方(発注済みは完工日基準、未発注のみは対応日基準)
      const wonN = list.filter(j => wonProjectIdsInPeriod.has(j.id)).length;
      const lostN = list.filter(j => j.hasSubmitted && !j.hasWon).length;
      const orderRate = (wonN + lostN) ? (wonN / (wonN + lostN)) * 100 : null;
      return { key, name, clientName, count: list.length, amt, gp, gpRate: gpRateG, orderRate };
    });
  }, [filtered, wonProjectIdsInPeriod]);

  const sortedReps = useMemo(
    () => [...repGroups].sort((a, b) => cmpVal(a[sort.key], b[sort.key], sort.dir)),
    [repGroups, sort],
  );

  const toggleSort = key => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: typeof repGroups[0]?.[key] === "string" ? "asc" : "desc" });
  };

  const largeJobs = useMemo(() => {
    if (bigJobs) return bigJobs;
    return [...filtered]
      .filter(j => (j.sell || 0) >= 5_000_000)
      .sort((a, b) => (b.sell || 0) - (a.sell || 0))
      .slice(0, 6);
  }, [bigJobs, filtered]);

  const kindUnsetOnly = kindSlices.length > 0 && kindSlices.every(s => s.name === "未設定");
  const mark = k => (sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="igdash">
      {showTitle && <div className="dtitle">ダッシュボード</div>}
      <div className="pcfilter">
        <label>担当者
          <select value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">すべて</option>
            {ownerOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label>取引先
          <select value={client} onChange={e => onClientChange(e.target.value)}>
            <option value="">すべて</option>
            {clientOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label>営業所
          <select value={branch} onChange={e => onBranchChange(e.target.value)}>
            <option value="">すべて</option>
            {branchOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label>期間（対応日）
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            {PERIODS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <div className="pcgrid4 five">
        <div className="pckpi"><span>📋</span><small>案件数</small><b style={{ color: "#1a3a5c" }}>{filtered.length}件</b></div>
        <div className="pckpi"><span>💰</span><small>売上合計</small><b style={{ color: "#e07b39" }}>{fmt(totalAmt)}</b><div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>完工日基準</div></div>
        <div className="pckpi"><span>📈</span><small>粗利合計</small><b style={{ color: "#059669" }}>{fmt(totalGp)}</b><div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>完工日基準</div></div>
        <div className="pckpi"><span>📊</span><small>粗利率</small><b style={{ color: "#7c3aed" }}>{pctLabel(gpRate)}</b><div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>完工日基準</div></div>
        <div className="pckpi"><span>🏁</span><small>完工件数</small><b style={{ color: "#0891b2" }}>{completedCount}件</b><div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>完工日基準</div></div>
      </div>

      <div className="pcrow r2">
        <div className="panel col">
          <h3>推移</h3>
          {months.length ? <Trend months={months} sell={trend.sell} gp={trend.gp} /> : <div className="empty">該当する案件がありません</div>}
        </div>
        <div className="panel col">
          <h3>案件の状況</h3>
          <Donut slices={kindSlices} />
          {kindUnsetOnly && <div className="note">工種が案件に未登録のため、内訳はまだ分かれません。</div>}
        </div>
      </div>

      <div className="pcrow r2">
        <div className="panel">
          <h3>状態別</h3>
          {statusRows.map(row => {
            const st = TWO_STATE_STYLE[row.status] || { text: "#374151", border: "#94a3b8" };
            return (
              <div className="sb" key={row.status}>
                <div className="sbh">
                  <b style={{ color: st.text }}>{row.status}</b>
                  <span>{row.count}件 / {fmt(row.amt)}</span>
                </div>
                <div className="sbt"><span style={{ width: `${(row.count / maxStatus) * 100}%`, background: st.border }} /></div>
              </div>
            );
          })}
          <div className="note">受注率: {pctLabel(winRate)}（発注済み ÷ 発注済み+未発注のみ。発注済みは完工日基準、未発注のみは対応日基準）</div>
        </div>
        <div className="panel">
          <h3>価格帯</h3>
          <div className="bars">
            {bands.map(b => (
              <div key={b.label}>
                <span style={{ height: `${Math.max(b.n ? 8 : 2, (b.n / maxBand) * 70)}%` }} />
                {b.label}
              </div>
            ))}
          </div>
          <div className="axis">件数（売上未入力は除く）</div>
        </div>
      </div>

      <div className="pcrow r2">
        <div className="panel">
          <h3>担当者別</h3>
          {ownerBars.length === 0 && <div className="empty">該当する案件がありません</div>}
          {ownerBars.map(o => (
            <div className="orow" key={o.key}>
              <div className="on" title={o.name}>{o.name}</div>
              <div className="track">
                <div className="stack" style={{ width: `${Math.max((o.amt / maxOwner) * 100, 8)}%` }}>
                  {[...o.parts.entries()].map(([status, amt]) => (
                    <span key={status} style={{ flex: `0 0 ${o.amt ? (amt / o.amt) * 100 : 0}%`, background: TWO_STATE_STYLE[status]?.border || "#94a3b8" }} />
                  ))}
                </div>
              </div>
              <div className="v">{shortYen(o.amt)}</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>大型工事</h3>
          {largeJobs.length === 0 && <div className="empty">500万円以上の案件はありません</div>}
          {largeJobs.map((j, i) => {
            const label = j.hasWon ? "発注済み" : "未発注";
            const st = TWO_STATE_STYLE[label];
            return (
              <div className="wrow" key={j.id || `${j.name}-${i}`}>
                <span>{j.name}</span>
                <em style={{ background: st.bg, color: st.text }}>{label}</em>
              </div>
            );
          })}
          {!bigJobs && <div className="note">売上500万円以上の案件を表示しています。進捗の連動はこれからです。</div>}
        </div>
      </div>

      <div className="pcrow panel">
        <h3>担当者別集計</h3>
        <div className="scroll">
          <table className="pt">
            <thead>
              <tr>
                <th className="tl" onClick={() => toggleSort("clientName")}>取引先{mark("clientName")}</th>
                <th className="tl" onClick={() => toggleSort("name")}>担当者{mark("name")}</th>
                <th onClick={() => toggleSort("count")}>案件数{mark("count")}</th>
                <th onClick={() => toggleSort("amt")}>売上合計{mark("amt")}</th>
                <th onClick={() => toggleSort("gp")}>粗利合計{mark("gp")}</th>
                <th onClick={() => toggleSort("gpRate")}>粗利率{mark("gpRate")}</th>
                <th onClick={() => toggleSort("orderRate")}>受注率{mark("orderRate")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedReps.map(g => (
                <tr key={g.key}>
                  <td className="tl">{g.clientName}</td>
                  <td className="tl">{g.name}</td>
                  <td>{g.count}件</td>
                  <td style={{ color: "#e07b39", fontWeight: 700 }}>{fmt(g.amt)}</td>
                  <td style={{ color: "#059669", fontWeight: 700 }}>{fmt(g.gp)}</td>
                  <td>{pctLabel(g.gpRate)}</td>
                  <td>{pctLabel(g.orderRate)}</td>
                </tr>
              ))}
              {sortedReps.length === 0 && (
                <tr><td className="tl" colSpan={7}>該当する案件がありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
