import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { STATUSES, STATUS_STYLE, fmt } from "../lib/constants";

export default function Analytics({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const pending = tks.filter(t => !t.done);
  const active = pjs.filter(p => p.status !== "完了" && p.status !== "中断");
  const done = pjs.filter(p => p.status === "完了");
  const totalAmt = pjs.reduce((s, p) => s + (p.amount || 0), 0);
  const totalGp = pjs.reduce((s, p) => s + (p.gp || 0), 0);
  const avgGpRate = totalAmt ? (totalGp / totalAmt * 100).toFixed(1) : 0;
  const statusCount = STATUSES.map(s => ({ s, n: pjs.filter(p => p.status === s).length }));
  const maxSC = Math.max(...statusCount.map(x => x.n), 1);
  const top5 = pjs.filter(p => p.amount > 0).sort((a, b) => (b.gp / b.amount) - (a.gp / a.amount)).slice(0, 5);
  const byCharge = {};
  pjs.forEach(p => { const k = p.inCharge || "未設定"; byCharge[k] = (byCharge[k] || 0) + (p.amount || 0); });
  const chargeList = Object.entries(byCharge).sort((a, b) => b[1] - a[1]);
  const maxCharge = Math.max(...chargeList.map(x => x[1]), 1);

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="analytics" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="📊 分析ダッシュボード" back={() => nav("home")} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "総案件数", value: `${pjs.length}件`, sub: `進行中 ${active.length}件`, color: "#1A3A5C", icon: "📋" },
            { label: "完了案件", value: `${done.length}件`, sub: `完了率 ${pjs.length ? (done.length / pjs.length * 100).toFixed(0) : 0}%`, color: "#059669", icon: "✅" },
            { label: "受注合計", value: `¥${(totalAmt / 10000).toFixed(0)}万`, sub: pjs.length ? `平均 ¥${(totalAmt / pjs.length / 10000).toFixed(0)}万` : "", color: "#E07B39", icon: "💰" },
            { label: "平均粗利率", value: `${avgGpRate}%`, sub: `粗利計 ¥${(totalGp / 10000).toFixed(0)}万`, color: "#7C3AED", icon: "📈" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 14, padding: "14px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 14 }}>📋 ステータス別件数</div>
          {statusCount.map(({ s, n }) => {
            const st = STATUS_STYLE[s];
            return (
              <div key={s} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: st.text }}>{s}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{n}件</span>
                </div>
                <div style={{ background: "#F3F4F6", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${(n / maxSC) * 100}%`, height: "100%", background: st.border, borderRadius: 4, transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })}
        </div>

        {top5.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 14 }}>🏆 粗利率TOP5</div>
            {top5.map((p, i) => {
              const rate = (p.gp / p.amount * 100).toFixed(1);
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < top5.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : i === 2 ? "#B45309" : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: i < 3 ? "#fff" : "#6B7280", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{fmt(p.amount)}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#059669" }}>{rate}%</div>
                </div>
              );
            })}
          </div>
        )}

        {chargeList.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 14 }}>👤 担当者別受注金額</div>
            {chargeList.map(([name, amt]) => (
              <div key={name} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#E07B39" }}>{fmt(amt)}</span>
                </div>
                <div style={{ background: "#F3F4F6", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${(amt / maxCharge) * 100}%`, height: "100%", background: "#E07B39", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 14 }}>✅ タスク状況</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "未完了", value: tks.filter(t => !t.done).length, color: "#EF4444" },
              { label: "完了済み", value: tks.filter(t => t.done).length, color: "#10B981" },
              { label: "高優先度", value: tks.filter(t => !t.done && t.prio === "high").length, color: "#F59E0B" },
            ].map(x => (
              <div key={x.label} style={{ flex: 1, background: "#F9FAFB", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: x.color }}>{x.value}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{x.label}</div>
              </div>
            ))}
          </div>
        </div>

        {(() => {
          const finMB = finFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
          const tmplMB = tmplFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
          const totalMB = finMB + tmplMB;
          const limitMB = 1024;
          const usedPct = Math.min((totalMB / limitMB) * 100, 100);
          const barColor = usedPct > 80 ? "#EF4444" : usedPct > 50 ? "#F59E0B" : "#059669";
          const fmtSize = mb => mb < 1 ? `${(mb * 1024).toFixed(0)}KB` : `${mb.toFixed(1)}MB`;
          return (
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 14 }}>📦 Storage使用量</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>合計使用量</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: barColor }}>{fmtSize(totalMB)} <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 400 }}>/ 1GB（無料枠）</span></div>
                </div>
                <div style={{ background: "#E5E7EB", borderRadius: 6, height: 12, overflow: "hidden" }}>
                  <div style={{ width: `${usedPct}%`, height: "100%", background: barColor, borderRadius: 6, transition: "width 0.5s" }} />
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4, textAlign: "right" }}>{usedPct.toFixed(1)}% 使用中</div>
              </div>
              {[{ label: "財務・書類", mb: finMB, count: finFiles.length, color: "#0891B2" }, { label: "お知らせ・雛形", mb: tmplMB, count: tmplFiles.length, color: "#D97706" }].map(c => (
                <div key={c.label} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{c.label}</span>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>{fmtSize(c.mb)}　{c.count}件</span>
                  </div>
                  <div style={{ background: "#F3F4F6", borderRadius: 4, height: 7, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min((c.mb / limitMB) * 100, 100)}%`, height: "100%", background: c.color, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
              {usedPct > 80 && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 12px", marginTop: 8, fontSize: 12, color: "#DC2626", fontWeight: 700 }}>⚠️ 残り{fmtSize(limitMB - totalMB)}です。</div>}
              {usedPct <= 80 && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 12px", marginTop: 8, fontSize: 12, color: "#059669", fontWeight: 600 }}>✅ 残り{fmtSize(limitMB - totalMB)}あります</div>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}