import { useState } from "react";
import { supabase } from "../lib/supabase";
import { COMPANY_TYPES, CONTACT_ROLES, fmt } from "../lib/constants";
import { Badge, Inp, Sel, Modal, Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function Companies({ pjs, cos, setCos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W }) {
  const [selC, setSelC] = useState(null);
  const [selCt, setSelCt] = useState(null);
  const [modal, setModal] = useState(null);
  const [fltT, setFltT] = useState("すべて");
  const [schC, setSchC] = useState("");
  const [conf, setConf] = useState(null);
  const [editCoForm, setEditCoForm] = useState({ name: "", branch: "", type: "取引先" });
  const [nCo, setNCo] = useState({ name: "", type: "協力業者", branch: "" });
  const [nCt, setNCt] = useState({ name: "", role: "営業", tel: "", email: "", memo: "" });

  const pending = tks.filter(t => !t.done);
  const getPF = cid => pjs.filter(p => p.clientId === cid || (p.subIds || []).includes(cid));
  const filtC = cos.filter(c => { if (fltT !== "すべて" && c.type !== fltT) return false; if (schC && !c.name.includes(schC)) return false; return true; });

  const saveCo = async () => {
    if (!nCo.name) return;
    const { data } = await supabase.from("companies").insert([{ name: nCo.name, type: nCo.type, branch: nCo.branch, contacts: [] }]).select();
    if (data) setCos([...cos, { ...data[0], contacts: [] }]);
    setNCo({ name: "", type: "協力業者", branch: "" }); setModal(null);
  };

  const updateCo = async (id, updates) => {
    await supabase.from("companies").update(updates).eq("id", id);
    const upd = cos.map(c => c.id === id ? { ...c, ...updates } : c);
    setCos(upd);
    if (selC?.id === id) setSelC({ ...selC, ...updates });
  };

  const delCo = async id => {
    await supabase.from("companies").delete().eq("id", id);
    setCos(cos.filter(c => c.id !== id));
  };

  const saveCt = async () => {
    if (!nCt.name || !selC) return;
    const ct = { id: "ct" + Date.now(), ...nCt };
    const newContacts = [...(selC.contacts || []), ct];
    await supabase.from("companies").update({ contacts: newContacts }).eq("id", selC.id);
    const upd = cos.map(c => c.id === selC.id ? { ...c, contacts: newContacts } : c);
    setCos(upd); setSelC({ ...selC, contacts: newContacts });
    setNCt({ name: "", role: "営業", tel: "", email: "", memo: "" }); setModal(null);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="companies" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title={selCt ? selCt.name : selC ? selC.name : "🏢 取引先・協力業者"}
        back={selCt ? () => setSelCt(null) : selC ? () => setSelC(null) : () => nav("home")}
        right={!selC && !selCt && <button onClick={() => setModal("addCo")} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ 新規</button>} />

      {selCt ? (
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#1A3A5C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", fontWeight: 800 }}>{selCt.name.charAt(0)}</div>
              <div><div style={{ fontWeight: 800, fontSize: 18, color: "#1F2937" }}>{selCt.name}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{selC?.name} · {selCt.role}</div></div>
            </div>
            {selCt.tel && <a href={`tel:${selCt.tel}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "#F0F4F8", borderRadius: 10, padding: "12px 14px", textDecoration: "none", color: "#1F2937", marginBottom: 8 }}><span style={{ fontSize: 20 }}>📞</span><div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>電話番号</div><div style={{ fontWeight: 700, fontSize: 14 }}>{selCt.tel}</div></div><span style={{ color: "#1A3A5C", fontWeight: 700 }}>発信</span></a>}
            {selCt.email && <a href={`mailto:${selCt.email}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "#F0F4F8", borderRadius: 10, padding: "12px 14px", textDecoration: "none", color: "#1F2937", marginBottom: 8 }}><span style={{ fontSize: 20 }}>✉️</span><div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>メール</div><div style={{ fontWeight: 700, fontSize: 14 }}>{selCt.email}</div></div><span style={{ color: "#1A3A5C", fontWeight: 700 }}>送信</span></a>}
          </div>
        </div>
      ) : selC ? (
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#1F2937" }}>{selC.name}{selC.branch ? ` ${selC.branch}` : ""}</div>
              <button onClick={() => { setEditCoForm({ name: selC.name, branch: selC.branch || "", type: selC.type }); setModal("editCo"); }} style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE", color: "#1A3A5C", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️ 編集</button>
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{selC.type}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C" }}>👤 担当者</div>
              <button onClick={() => setModal("addCt")} style={{ padding: "4px 12px", borderRadius: 14, background: "#E07B39", color: "#fff", border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>＋ 追加</button>
            </div>
            {(selC.contacts || []).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 14 }}>担当者が未登録です</div>}
            {[...new Set((selC.contacts || []).map(ct => ct.role))].map(role => (
              <div key={role} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", borderLeft: "3px solid #E07B39", paddingLeft: 7, marginBottom: 6 }}>{role}</div>
                {(selC.contacts || []).filter(ct => ct.role === role).map(ct => (
                  <div key={ct.id} onClick={() => setSelCt(ct)} style={{ background: "#F9FAFB", borderRadius: 8, padding: "10px 12px", marginBottom: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1A3A5C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#fff", fontWeight: 800 }}>{ct.name.charAt(0)}</div>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13, color: "#1F2937" }}>{ct.name}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{[ct.tel, ct.email].filter(Boolean).join(" · ") || "連絡先未登録"}</div></div>
                    <span style={{ color: "#9CA3AF", fontSize: 14 }}>›</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C", marginBottom: 8 }}>📋 関連案件</div>
              {getPF(selC.id).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>案件なし</div>}
              {getPF(selC.id).map(p => (<div key={p.id} style={{ background: "#F0F4F8", borderRadius: 8, padding: "9px 12px", marginBottom: 6 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 600, fontSize: 13, color: "#1F2937" }}>{p.name}</div><Badge s={p.status} /></div><div style={{ fontSize: 12, color: "#E07B39", fontWeight: 700, marginTop: 2 }}>{fmt(p.amount)}</div></div>))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          <input value={schC} onChange={e => setSchC(e.target.value)} placeholder="🔍 会社名で検索" style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#fff", boxSizing: "border-box", marginBottom: 10, color: "#1F2937" }} />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
            {["すべて", ...COMPANY_TYPES].map(t => (<button key={t} onClick={() => setFltT(t)} style={{ padding: "4px 12px", borderRadius: 16, border: "1.5px solid", whiteSpace: "nowrap", borderColor: fltT === t ? "#1A3A5C" : "#D1D5DB", background: fltT === t ? "#1A3A5C" : "#fff", color: fltT === t ? "#fff" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{t}</button>))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {filtC.map(c => (<div key={c.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: "4px solid #E07B39", overflow: "hidden" }}>
              <div onClick={() => setSelC(c)} style={{ padding: "13px 14px", cursor: "pointer" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937" }}>{c.name}{c.branch ? ` ${c.branch}` : ""}</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{c.type} ｜ 担当者 {(c.contacts || []).length}名</div>
                <div style={{ fontSize: 11, color: "#1A3A5C", marginTop: 3 }}>案件 {getPF(c.id).length}件</div>
              </div>
              <div style={{ display: "flex", borderTop: "1px solid #F3F4F6" }}>
                <button onClick={() => setSelC(c)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>詳細 →</button>
                <button onClick={() => setConf({ msg: `「${c.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delCo(c.id); setConf(null); } })} style={{ padding: "8px 16px", background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
              </div>
            </div>))}
          </div>
        </div>
      )}
      {modal === "editCo" && (<Modal title="取引先を編集" onClose={() => setModal(null)} onSave={() => { updateCo(selC.id, { name: editCoForm.name, branch: editCoForm.branch, type: editCoForm.type }); setModal(null); }}><Inp label="会社名 *" value={editCoForm.name} onChange={e => setEditCoForm({ ...editCoForm, name: e.target.value })} /><Inp label="支店" value={editCoForm.branch} onChange={e => setEditCoForm({ ...editCoForm, branch: e.target.value })} /><Sel label="種別" opts={COMPANY_TYPES} value={editCoForm.type} onChange={e => setEditCoForm({ ...editCoForm, type: e.target.value })} /></Modal>)}
      {modal === "addCo" && (<Modal title="新規取引先を追加" onClose={() => setModal(null)} onSave={saveCo}><Inp label="会社名 *" value={nCo.name} onChange={e => setNCo({ ...nCo, name: e.target.value })} placeholder="例: 山田工業" /><Inp label="支店" value={nCo.branch} onChange={e => setNCo({ ...nCo, branch: e.target.value })} /><Sel label="種別" opts={COMPANY_TYPES} value={nCo.type} onChange={e => setNCo({ ...nCo, type: e.target.value })} /></Modal>)}
      {modal === "addCt" && (<Modal title="担当者を追加" onClose={() => setModal(null)} onSave={saveCt}><Inp label="担当者名 *" value={nCt.name} onChange={e => setNCt({ ...nCt, name: e.target.value })} /><Sel label="役割" opts={CONTACT_ROLES} value={nCt.role} onChange={e => setNCt({ ...nCt, role: e.target.value })} /><Inp label="電話番号" value={nCt.tel} onChange={e => setNCt({ ...nCt, tel: e.target.value })} /><Inp label="メール" value={nCt.email} onChange={e => setNCt({ ...nCt, email: e.target.value })} /></Modal>)}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
    </div>
  );
}