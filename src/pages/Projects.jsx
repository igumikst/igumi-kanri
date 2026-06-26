import { useState } from "react";
import { supabase } from "../lib/supabase";
import { STATUSES, STATUS_STYLE, fmt, pct } from "../lib/constants";
import { Badge, Inp, Sel, Modal, Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function Projects({ pjs, setPjs, cos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W }) {
  const [selP, setSelP] = useState(null);
  const [modal, setModal] = useState(null);
  const [fltS, setFltS] = useState("すべて");
  const [fltInCharge, setFltInCharge] = useState("すべて");
  const [schP, setSchP] = useState("");
  const [quickStatus, setQuickStatus] = useState(null);
  const [conf, setConf] = useState(null);
  const [editP, setEditP] = useState(null);
  const blankP = { name: "", status: "発注待ち", clientId: "", salesRep: "", inCharge: "崎岡", subIds: [], amount: "", gp: "", qDate: "" };
  const [nP, setNP] = useState(blankP);

  const getC = id => cos.find(c => c.id === id);
  const inChargeList = ["すべて", ...new Set(pjs.map(p => p.inCharge).filter(Boolean))];

  const filtP = pjs.filter(p => {
    if (fltS !== "すべて" && p.status !== fltS) return false;
    if (fltInCharge !== "すべて" && p.inCharge !== fltInCharge) return false;
    if (schP && !p.name.includes(schP) && !(getC(p.clientId)?.name || "").includes(schP) && !(p.inCharge || "").includes(schP)) return false;
    return true;
  });

  const tA = filtP.reduce((s, p) => s + (p.amount || 0), 0);
  const tG = filtP.reduce((s, p) => s + (p.gp || 0), 0);

  const savePj = async () => {
    if (!nP.name) return;
    const { data } = await supabase.from("projects").insert([{ name: nP.name, status: nP.status, clientId: nP.clientId || null, salesRep: nP.salesRep, inCharge: nP.inCharge, subcontractorIds: nP.subIds || [], amount: Number(nP.amount) || 0, grossProfit: Number(nP.gp) || 0, quoteDate: nP.qDate }]).select();
    if (data) setPjs([{ ...data[0], subIds: data[0].subcontractorIds || [], gp: data[0].grossProfit || 0, qDate: data[0].quoteDate || "" }, ...pjs]);
    setNP(blankP); setModal(null);
  };

  const updatePj = async () => {
    if (!editP || !editP.name) return;
    await supabase.from("projects").update({ name: editP.name, status: editP.status, clientId: editP.clientId || null, salesRep: editP.salesRep, inCharge: editP.inCharge, subcontractorIds: editP.subIds || [], amount: Number(editP.amount) || 0, grossProfit: Number(editP.gp) || 0, quoteDate: editP.qDate }).eq("id", editP.id);
    const updated = { ...editP, gp: Number(editP.gp) || 0, amount: Number(editP.amount) || 0 };
    setPjs(pjs.map(p => p.id === editP.id ? updated : p));
    setSelP(updated); setEditP(null);
  };

  const delPj = async id => {
    await supabase.from("projects").delete().eq("id", id);
    setPjs(pjs.filter(p => p.id !== id)); setSelP(null);
  };

  const pending = tks.filter(t => !t.done);

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="projects" nav={nav} setModal={setModal} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title={selP ? selP.name : "📋 案件管理"} back={selP ? () => setSelP(null) : () => nav("home")}
        right={!selP && <button onClick={() => setModal("addP")} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ 新規</button>} />

      {selP ? (
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          {editP ? (
            <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#1A3A5C", marginBottom: 14 }}>✏️ 案件を編集</div>
              <Inp label="案件名 *" value={editP.name} onChange={e => setEditP({ ...editP, name: e.target.value })} />
              <Sel label="ステータス" opts={STATUSES} value={editP.status} onChange={e => setEditP({ ...editP, status: e.target.value })} />
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>取引先</div>
                <select value={editP.clientId || ""} onChange={e => setEditP({ ...editP, clientId: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
                  <option value="">未設定</option>
                  {cos.filter(c => c.type === "取引先").map(c => <option key={c.id} value={c.id}>{c.name}{c.branch ? " " + c.branch : ""}</option>)}
                </select>
              </div>
              <Inp label="社内担当" value={editP.inCharge || ""} onChange={e => setEditP({ ...editP, inCharge: e.target.value })} />
              <Inp label="営業担当" value={editP.salesRep || ""} onChange={e => setEditP({ ...editP, salesRep: e.target.value })} />
              <Inp label="受注金額" type="number" value={editP.amount || ""} onChange={e => setEditP({ ...editP, amount: e.target.value })} />
              <Inp label="粗利" type="number" value={editP.gp || ""} onChange={e => setEditP({ ...editP, gp: e.target.value })} />
              <Inp label="見積提出日" type="date" value={editP.qDate || ""} onChange={e => setEditP({ ...editP, qDate: e.target.value })} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditP(null)} style={{ flex: 1, padding: "12px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#374151" }}>キャンセル</button>
                <button onClick={updatePj} style={{ flex: 2, padding: "12px 0", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>💾 保存する</button>
              </div>
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 17, flex: 1, marginRight: 8, color: "#1F2937" }}>{selP.name}</div>
                <Badge s={selP.status} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button onClick={() => setEditP({ ...selP })} style={{ flex: 2, padding: "8px 0", background: "#EFF6FF", color: "#1A3A5C", border: "1.5px solid #BFDBFE", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✏️ 編集</button>
                <button onClick={() => setConf({ msg: `「${selP.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delPj(selP.id); setConf(null); } })} style={{ flex: 1, padding: "8px 0", background: "#FEF2F2", color: "#DC2626", border: "1.5px solid #FECACA", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🗑 削除</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, background: "#FFF7ED", borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "#9CA3AF" }}>受注金額</div><div style={{ fontSize: 16, fontWeight: 800, color: "#E07B39" }}>{fmt(selP.amount)}</div></div>
                <div style={{ flex: 1, background: "#F0FDF4", borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "#9CA3AF" }}>粗利 / 粗利率</div><div style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>{fmt(selP.gp)}</div><div style={{ fontSize: 11, color: "#059669" }}>{pct(selP.gp, selP.amount)}</div></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
                {[["ステータス", selP.status], ["社内担当", selP.inCharge], ["営業担当", selP.salesRep], ["見積提出日", selP.qDate]].map(([l, v]) => (
                  <div key={l} style={{ marginBottom: 8 }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>{l}</div><div style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{v || "—"}</div></div>
                ))}
              </div>
              <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C", marginBottom: 8 }}>🏢 取引先</div>
                {getC(selP.clientId) ? <div style={{ background: "#F0F4F8", borderRadius: 10, padding: "10px 12px" }}><div style={{ fontWeight: 700, color: "#1F2937" }}>{getC(selP.clientId).name}</div></div> : <div style={{ color: "#9CA3AF", fontSize: 13 }}>未設定</div>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          <input value={schP} onChange={e => setSchP(e.target.value)} placeholder="🔍 案件名・取引先・担当者で検索" style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#fff", boxSizing: "border-box", marginBottom: 10, color: "#1F2937" }} />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
            {["すべて", ...STATUSES].map(s => (<button key={s} onClick={() => setFltS(s)} style={{ padding: "4px 12px", borderRadius: 16, border: "1.5px solid", whiteSpace: "nowrap", borderColor: fltS === s ? "#1A3A5C" : "#D1D5DB", background: fltS === s ? "#1A3A5C" : "#fff", color: fltS === s ? "#fff" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{s}</button>))}
          </div>
          {inChargeList.length > 2 && <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>{inChargeList.map(n => (<button key={n} onClick={() => setFltInCharge(n)} style={{ padding: "4px 12px", borderRadius: 16, border: "1.5px solid", whiteSpace: "nowrap", borderColor: fltInCharge === n ? "#E07B39" : "#D1D5DB", background: fltInCharge === n ? "#E07B39" : "#fff", color: fltInCharge === n ? "#fff" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{n === "すべて" ? "👤 全員" : "👤 " + n}</button>))}</div>}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["件数", `${filtP.length}件`], ["受注合計", fmt(tA)], ["粗利合計", fmt(tG)]].map(([l, v]) => (<div key={l} style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "8px 10px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}><div style={{ fontSize: 10, color: "#9CA3AF" }}>{l}</div><div style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C", marginTop: 1 }}>{v}</div></div>))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {filtP.map(p => {
              const cl = getC(p.clientId);
              const gp = p.amount ? ((p.gp / p.amount) * 100).toFixed(1) : null;
              return (
                <div key={p.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: "4px solid #1A3A5C", overflow: "hidden" }}>
                  <div onClick={() => setSelP(p)} style={{ padding: "13px 14px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8, color: "#1F2937" }}>{p.name}</div>
                      <div onClick={e => { e.stopPropagation(); setQuickStatus(quickStatus === p.id ? null : p.id); }}>
                        <Badge s={p.status} />
                      </div>
                    </div>
                    {quickStatus === p.id && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>{STATUSES.map(s => <button key={s} onClick={e => { e.stopPropagation(); supabase.from("projects").update({ status: s }).eq("id", p.id).then(() => { setPjs(prev => prev.map(x => x.id === p.id ? { ...x, status: s } : x)); setQuickStatus(null); }); }} style={{ padding: "3px 8px", borderRadius: 10, border: "1px solid", fontSize: 10, fontWeight: 700, cursor: "pointer", borderColor: STATUS_STYLE[s]?.border || "#ccc", background: p.status === s ? STATUS_STYLE[s]?.bg : "#fff", color: STATUS_STYLE[s]?.text || "#374151" }}>{s}</button>)}</div>}
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{cl ? `🏢 ${cl.name}${cl.branch ? " " + cl.branch : ""}` : "取引先未設定"}{p.inCharge && <span style={{ marginLeft: 8, color: "#9CA3AF" }}>👤 {p.inCharge}</span>}</div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#E07B39" }}>{fmt(p.amount)}</div>{gp && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>粗利率 {gp}%</div>}</div>
                  </div>
                  <div style={{ display: "flex", borderTop: "1px solid #F3F4F6" }}>
                    <button onClick={() => setSelP(p)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>詳細 →</button>
                    <button onClick={() => setConf({ msg: `「${p.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delPj(p.id); setConf(null); } })} style={{ padding: "8px 16px", background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {modal === "addP" && (<Modal title="新規案件を追加" onClose={() => setModal(null)} onSave={savePj}>
        <Inp label="案件名 *" value={nP.name} onChange={e => setNP({ ...nP, name: e.target.value })} placeholder="例: ○○マンション改修工事" />
        <Sel label="ステータス" opts={STATUSES} value={nP.status} onChange={e => setNP({ ...nP, status: e.target.value })} />
        <Inp label="社内担当" value={nP.inCharge} onChange={e => setNP({ ...nP, inCharge: e.target.value })} />
        <Inp label="受注金額" type="number" value={nP.amount} onChange={e => setNP({ ...nP, amount: e.target.value })} />
        <Inp label="粗利" type="number" value={nP.gp} onChange={e => setNP({ ...nP, gp: e.target.value })} />
        <Inp label="見積提出日" type="date" value={nP.qDate} onChange={e => setNP({ ...nP, qDate: e.target.value })} />
      </Modal>)}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
    </div>
  );
}