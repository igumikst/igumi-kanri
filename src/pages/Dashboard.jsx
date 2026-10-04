import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import DashboardPC from "../components/DashboardPC";
import { STATUSES, PROJECT_STATS_SINCE } from "../lib/constants";

const WON_STATUSES = ["着工", "完了"];

export default function Dashboard({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W, branches, salesReps, embedded }) {
  const pending = (tks || []).filter(t => !t.done);
  const coMap = Object.fromEntries((cos || []).map(c => [c.id, c]));
  const branchMap = Object.fromEntries((branches || []).map(b => [b.id, b]));
  const jobs = (pjs || []).filter(p => (p.created_at || "") >= PROJECT_STATS_SINCE).map(p => {
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
      registeredAt: p.created_at,
      clientId: p.clientId || "",
      clientName: (p.clientId && coMap[p.clientId]?.name) || "",
      branchId: p.branchId || "",
      branchName: (p.branchId && branchMap[p.branchId]?.name) || "",
    };
  });

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: embedded ? "100%" : "100vh", ...(embedded ? {} : pp) }}>
      {!embedded && isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="dashboard" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {!embedded && isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {!embedded && (cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      {!embedded && <Hdr title="🧭 ダッシュボード" back={() => nav("home")} />}
      <DashboardPC jobs={jobs} statuses={STATUSES} wonStatuses={WON_STATUSES} showTitle={!!embedded} branches={branches} salesReps={salesReps} />
    </div>
  );
}
