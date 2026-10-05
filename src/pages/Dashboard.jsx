import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import DashboardPC from "../components/DashboardPC";
import { STATUSES } from "../lib/constants";

const WON_STATUSES = ["着工", "完了"];

export default function Dashboard({ pjs, wonQuotes, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W, branches, salesReps, embedded }) {
  const pending = (tks || []).filter(t => !t.done);
  const coMap = Object.fromEntries((cos || []).map(c => [c.id, c]));
  const branchMap = Object.fromEntries((branches || []).map(b => [b.id, b]));
  // registeredAt: 進行中・発注待ち・受注率などの期間の基準は「対応日」(無ければ登録日)。
  // 2026-09-01以降の条件(PROJECT_STATS_SINCE)は、DashboardPC側で適用する
  const jobs = (pjs || []).map(p => {
    const sell = Number(p.amount) || 0;
    const gp = Number(p.gp) || 0;
    return {
      id: p.id,
      name: p.name || "（無題）",
      kind: p.kind || p.workType || p.category || "未設定",
      owner: p.salesRep || "未設定",
      ownerKey: p.salesRepId || p.salesRep || "unknown",
      status: p.status || "未設定",
      sell,
      cost: gp > 0 ? sell - gp : null,
      registeredAt: p.respondedAt || p.created_at,
      clientId: p.clientId || "",
      clientName: (p.clientId && coMap[p.clientId]?.name) || "",
      branchId: p.branchId || "",
      branchName: (p.branchId && branchMap[p.branchId]?.name) || "",
    };
  });

  // 売上合計・粗利合計・粗利率・完工件数は、見積ごとのcompleted_on基準で振り分ける(第8弾ステップ2)。
  // 担当者・取引先・営業所は、見積の所属する案件から引く
  const pjMap = Object.fromEntries((pjs || []).map(p => [p.id, p]));
  const completedQuotes = (wonQuotes || []).map(q => {
    const p = pjMap[q.project_id];
    return {
      id: q.id,
      sell: Number(q.total_amount) || 0,
      gp: Number(q.gross_profit) || 0,
      completedOn: q.completed_on || null,
      ownerKey: p?.salesRepId || p?.salesRep || "unknown",
      owner: p?.salesRep || "未設定",
      clientId: p?.clientId || "",
      branchId: p?.branchId || "",
    };
  }).filter(q => q.completedOn);

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: embedded ? "100%" : "100vh", ...(embedded ? {} : pp) }}>
      {!embedded && isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="dashboard" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {!embedded && isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} wonQuotes={wonQuotes} />}
      {!embedded && (cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      {!embedded && <Hdr title="🧭 ダッシュボード" back={() => nav("home")} />}
      <DashboardPC jobs={jobs} completedQuotes={completedQuotes} statuses={STATUSES} wonStatuses={WON_STATUSES} showTitle={!!embedded} branches={branches} salesReps={salesReps} />
    </div>
  );
}
