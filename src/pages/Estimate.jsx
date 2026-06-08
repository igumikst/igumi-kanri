import { useState } from "react";
import { Inp, Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function Estimate({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const pending = tks.filter(t => !t.done);
  const [est, setEst] = useState({ no: "0001", date: new Date().toISOString().split("T")[0], clientId: "", pjName: "", person: "崎岡", items: [], sub: 0, tax: 0, total: 0 });
  const clCos = cos.filter(c => c.type === "取引先");
  const selCo = cos.find(c => c.id === est.clientId);

  const addIt = () => setEst(p => ({ ...p, items: [...p.items, { name: "", spec: "", qty: 1, unit: "式", price: 0, amount: 0 }] }));
  const updIt = (i, f, v) => setEst(p => {
    const its = [...p.items]; its[i] = { ...its[i], [f]: v };
    if (f === "qty" || f === "price") its[i].amount = Number(its[i].qty || 0) * Number(its[i].price || 0);
    const sub = its.reduce((s, it) => s + (it.amount || 0), 0);
    const tax = Math.floor(sub * 0.1);
    return { ...p, items: its, sub, tax, total: sub + tax };
  });
  const remIt = i => setEst(p => {
    const its = p.items.filter((_, idx) => idx !== i);
    const sub = its.reduce((s, it) => s + (it.amount || 0), 0);
    const tax = Math.floor(sub * 0.1);
    return { ...p, items: its, sub, tax, total: sub + tax };
  });
  const dlCSV = () => {
    const cn = selCo ? selCo.name + (selCo.branch ? " " + selCo.branch : "") : "";
    let csv = "\uFEFF見積書\nNo.," + est.no + "\n日付," + est.date + "\n宛先," + cn + "\n工事名," + est.pjName + "\n\n品名,数量,単位,単価,金額\n";
    est.items.forEach(it => { csv += `${it.name},${it.qty},${it.unit},${it.price},${it.amount}\n`; });
    csv += `\n小計,,,, ${est.sub}\n消費税,,,, ${est.tax}\n合計,,,, ${est.total}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `見積書_${cn}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="estimate" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="📝 見積書作成" back={() => nav("home")} right={<button onClick={dlCSV} style={{ background: "#059669", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>⬇ CSV</button>} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>📋 基本情報</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <Inp label="見積No." value={est.no} onChange={e => setEst(p => ({ ...p, no: e.target.value }))} placeholder="0001" />
            <Inp label="日付" type="date" value={est.date} onChange={e => setEst(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>取引先</div>
            <select value={est.clientId} onChange={e => setEst(p => ({ ...p, clientId: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
              <option value="">選択してください</option>
              {clCos.map(c => <option key={c.id} value={c.id}>{c.name}{c.branch ? " " + c.branch : ""}</option>)}
            </select>
          </div>
          {selCo && <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "10px 14px", marginBottom: 10, borderLeft: "3px solid #1A3A5C" }}><div style={{ fontSize: 11, color: "#1A3A5C", fontWeight: 700, marginBottom: 4 }}>✅ 自動入力</div><div style={{ fontSize: 12, color: "#374151" }}>宛先: {selCo.name}{selCo.branch ? " " + selCo.branch : ""}</div></div>}
          <Inp label="工事名" value={est.pjName} onChange={e => setEst(p => ({ ...p, pjName: e.target.value }))} placeholder="例: ○○マンション排水管更新工事" />
          <Inp label="担当者" value={est.person} onChange={e => setEst(p => ({ ...p, person: e.target.value }))} />
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C" }}>🔧 工事項目</div>
            <button onClick={addIt} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>＋ 追加</button>
          </div>
          {est.items.map((item, i) => (
            <div key={i} style={{ background: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 8, border: "1px solid #E5E7EB" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>項目 {i + 1}</div>
                <button onClick={() => remIt(i)} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 16, cursor: "pointer" }}>🗑</button>
              </div>
              <Inp label="品名 *" value={item.name} onChange={e => updIt(i, "name", e.target.value)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                <Inp label="数量" type="number" value={item.qty} onChange={e => updIt(i, "qty", Number(e.target.value))} />
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>単位</div>
                  <select value={item.unit} onChange={e => updIt(i, "unit", e.target.value)} style={{ width: "100%", padding: "8px 6px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
                    {["式", "個", "本", "m", "㎡", "日", "台"].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <Inp label="単価" type="number" value={item.price} onChange={e => updIt(i, "price", Number(e.target.value))} />
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>金額（自動）</div>
                  <div style={{ padding: "8px 10px", background: "#F0F4F8", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#1A3A5C" }}>¥{(item.amount || 0).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
          {est.items.length === 0 && <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 20 }}>「＋ 追加」から工事項目を入力</div>}
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>💰 金額</div>
          {[["小計", est.sub], ["消費税（10%）", est.tax]].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ fontSize: 13, color: "#6B7280" }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>¥{(v || 0).toLocaleString()}</div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1A3A5C" }}>合計（税込）</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#E07B39" }}>¥{(est.total || 0).toLocaleString()}</div>
          </div>
          <button onClick={dlCSV} style={{ width: "100%", padding: 13, background: "#059669", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: "pointer", marginTop: 8 }}>⬇ CSVダウンロード</button>
        </div>
      </div>
    </div>
  );
}