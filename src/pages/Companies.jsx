import { useState } from "react";
import { supabase } from "../lib/supabase";
import { COMPANY_TYPES, CONTACT_ROLES, fmt } from "../lib/constants";
import { Inp, Sel, Modal, Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { MARKUP_CHOICE_OPTIONS, CUSTOM_RATE_MIN, CUSTOM_RATE_MAX, resolveMarkupChoice } from "../lib/quoteImport/markup";
import { addContact, updateContact, deleteContact, findDuplicateContact, resolveContactBranchId, contactBranchName } from "../lib/contacts";

const markupSelStyle = { padding: "5px 8px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#fff", color: "#1F2937" };
const markupInputStyle = { width: 90, padding: "5px 8px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" };
const markupBtnStyle = { padding: "5px 10px", borderRadius: 6, border: "none", background: "#1A3A5C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" };

// 掛け率の初期値を選ぶ・直接保存する小さな部品(取引先・営業所の両方で使う)。
// 保存されている値は、数字の文字列(例"0.925")か null(未設定/取引先に合わせる)。
// 呼び出し側で key={value} を渡し、外から value が変わったら(保存後など)初期状態を作り直す。
function MarkupDefaultEditor({ value, onSave, unsetLabel }) {
  const resolved = resolveMarkupChoice(value);
  const [choice, setChoice] = useState(resolved?.choice || "");
  const [customRate, setCustomRate] = useState(resolved?.choice === "custom" ? String(resolved.rate) : "");

  const customRateNum = Number(customRate);
  const customValid = customRate.trim() !== "" && Number.isFinite(customRateNum) && customRateNum >= CUSTOM_RATE_MIN && customRateNum <= CUSTOM_RATE_MAX;

  const handleChoice = v => {
    setChoice(v);
    if (v === "") { onSave(null); return; }
    if (v === "custom") return; // 数字の入力を待つ(確定ボタンで保存)
    onSave(String(MARKUP_CHOICE_OPTIONS.find(o => o.key === v).rate));
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select value={choice} onChange={e => handleChoice(e.target.value)} style={markupSelStyle}>
        <option value="">{unsetLabel}</option>
        {MARKUP_CHOICE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {choice === "custom" && (
        <>
          <input type="number" step="0.001" min={CUSTOM_RATE_MIN} max={CUSTOM_RATE_MAX} value={customRate} onChange={e => setCustomRate(e.target.value)}
            placeholder={`${CUSTOM_RATE_MIN}〜${CUSTOM_RATE_MAX}`} style={{ ...markupInputStyle, borderColor: customValid || !customRate ? "#E5E7EB" : "#FCA5A5" }} />
          <button type="button" disabled={!customValid} onClick={() => onSave(customRate)} style={{ ...markupBtnStyle, opacity: customValid ? 1 : 0.5, cursor: customValid ? "pointer" : "default" }}>確定</button>
        </>
      )}
    </div>
  );
}

export default function Companies({ pjs, submittedQuotes, wonQuotes, cos, setCos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, branches, setBranches, setSalesReps }) {
  const [selC, setSelC] = useState(null);
  const [selCt, setSelCt] = useState(null);
  const [modal, setModal] = useState(null);
  const [fltT, setFltT] = useState("すべて");
  const [schC, setSchC] = useState("");
  const [conf, setConf] = useState(null);
  const [editCoForm, setEditCoForm] = useState({ name: "", branch: "", type: "取引先" });
  const [nCo, setNCo] = useState({ name: "", type: "協力業者", branch: "" });
  const [nCt, setNCt] = useState({ name: "", role: "営業", tel: "", email: "", memo: "", branchId: "" });
  const [editCt, setEditCt] = useState(null); // { id, name, role, tel, email, branchId }
  const [nBranchName, setNBranchName] = useState("");
  const [editBranch, setEditBranch] = useState(null); // { id, name }

  const pending = tks.filter(t => !t.done);
  const getPF = cid => pjs.filter(p => p.clientId === cid || (p.subIds || []).includes(cid));
  // 発注済み/未発注は見積の状態だけで判断する(案件のstatusは使わない。第8弾テーマ3)
  const wonProjectIds = new Set((wonQuotes || []).map(q => q.project_id));
  const submittedProjectIds = new Set((submittedQuotes || []).map(q => q.project_id));
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

  const addBranch = async () => {
    if (!nBranchName.trim() || !selC) return;
    const { data } = await supabase.from("company_branches").insert([{ company_id: selC.id, name: nBranchName.trim() }]).select();
    if (data) setBranches([...branches, data[0]]);
    setNBranchName(""); setModal(null);
  };
  const renameBranch = async () => {
    if (!editBranch?.name.trim()) return;
    await supabase.from("company_branches").update({ name: editBranch.name.trim() }).eq("id", editBranch.id);
    setBranches(branches.map(b => b.id === editBranch.id ? { ...b, name: editBranch.name.trim() } : b));
    setEditBranch(null); setModal(null);
  };
  const delBranch = async id => {
    await supabase.from("company_branches").delete().eq("id", id);
    setBranches(branches.filter(b => b.id !== id));
  };
  const updateBranchMarkup = async (id, value) => {
    await supabase.from("company_branches").update({ markup_default: value }).eq("id", id);
    setBranches(branches.map(b => b.id === id ? { ...b, markup_default: value } : b));
  };

  const openAddCt = (branchId = "") => { setNCt({ name: "", role: "営業", tel: "", email: "", memo: "", branchId }); setModal("addCt"); };

  const saveCt = async () => {
    if (!nCt.name || !selC) return;
    const branchId = nCt.branchId || null;
    if (findDuplicateContact(selC.contacts, { name: nCt.name, branchId }, branches.filter(b => b.company_id === selC.id))) {
      setConf({
        msg: `同じ名前の担当者がいます(${nCt.name})。\n\n追加しますか？`, okLabel: "追加する", okColor: "#E07B39",
        onOk: () => { setConf(null); doSaveCt(branchId); },
      });
      return;
    }
    await doSaveCt(branchId);
  };

  const doSaveCt = async branchId => {
    try {
      const { contacts, salesRepRow } = await addContact(supabase, { companyId: selC.id, contacts: selC.contacts, name: nCt.name, role: nCt.role, tel: nCt.tel, email: nCt.email, memo: nCt.memo, branchId });
      if (salesRepRow) setSalesReps(prev => [...prev, salesRepRow]);
      setCos(prev => prev.map(c => c.id === selC.id ? { ...c, contacts } : c));
      setSelC(prev => ({ ...prev, contacts }));
      setNCt({ name: "", role: "営業", tel: "", email: "", memo: "", branchId: "" }); setModal(null);
    } catch (e) { alert(e.message); }
  };

  const openEditCt = ct => {
    setEditCt({ id: ct.id, name: ct.name, role: ct.role, tel: ct.tel || "", email: ct.email || "", branchId: resolveContactBranchId(ct, branches.filter(b => b.company_id === selC.id)) || "" });
    setModal("editCt");
  };

  const saveEditCt = async () => {
    if (!editCt?.name || !selC) return;
    const branchId = editCt.branchId || null;
    if (findDuplicateContact(selC.contacts, { name: editCt.name, branchId, excludeId: editCt.id }, branches.filter(b => b.company_id === selC.id))
      && !confirm(`同じ名前の担当者がいます(${editCt.name})。保存しますか？`)) return;
    try {
      const { contact, contacts, salesRepRow, deletedSalesRepId } = await updateContact(supabase, {
        companyId: selC.id, contacts: selC.contacts, projects: pjs, ctId: editCt.id,
        patch: { name: editCt.name, role: editCt.role, tel: editCt.tel, email: editCt.email, branchId },
      });
      if (salesRepRow) setSalesReps(prev => prev.some(s => s.id === salesRepRow.id) ? prev.map(s => s.id === salesRepRow.id ? salesRepRow : s) : [...prev, salesRepRow]);
      if (deletedSalesRepId) setSalesReps(prev => prev.filter(s => s.id !== deletedSalesRepId));
      setCos(prev => prev.map(c => c.id === selC.id ? { ...c, contacts } : c));
      setSelC(prev => ({ ...prev, contacts }));
      if (selCt?.id === editCt.id) setSelCt(contact);
      setEditCt(null); setModal(null);
    } catch (e) { alert(e.message); }
  };

  const askDeleteCt = ct => {
    setConf({
      msg: `「${ct.name}」\n\nこの操作は元に戻せません。\n削除しますか？`,
      onOk: async () => {
        setConf(null);
        try {
          const { contacts, deletedSalesRepId } = await deleteContact(supabase, { companyId: selC.id, contacts: selC.contacts, projects: pjs, ctId: ct.id });
          if (deletedSalesRepId) setSalesReps(prev => prev.filter(s => s.id !== deletedSalesRepId));
          setCos(prev => prev.map(c => c.id === selC.id ? { ...c, contacts } : c));
          setSelC(prev => ({ ...prev, contacts }));
          if (selCt?.id === ct.id) setSelCt(null);
        } catch (e) { alert(e.message); }
      },
    });
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="companies" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} submittedQuotes={submittedQuotes} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} wonQuotes={wonQuotes} submittedQuotes={submittedQuotes} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title={selCt ? selCt.name : selC ? selC.name : "🏢 取引先・協力業者"}
        back={selCt ? () => setSelCt(null) : selC ? () => setSelC(null) : () => nav("home")}
        right={!selC && !selCt && <button onClick={() => setModal("addCo")} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ 新規</button>} />

      {selCt ? (
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#1A3A5C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", fontWeight: 800 }}>{selCt.name.charAt(0)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#1F2937" }}>{selCt.name}</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>{selC?.name} · {selCt.role}{(() => { const bn = contactBranchName(selCt, branches.filter(b => b.company_id === selC?.id)); return bn ? ` · 🏢 ${bn}` : ""; })()}</div>
              </div>
              <button onClick={() => openEditCt(selCt)} style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE", color: "#1A3A5C", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️ 編集</button>
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
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>{selC.type}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 700 }}>掛け率の初期値</div>
              <MarkupDefaultEditor key={`co-${selC.id}-${selC.markupDefault ?? ""}`} value={selC.markupDefault} onSave={v => updateCo(selC.id, { markupDefault: v })} unsetLabel="未設定" />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C" }}>🏢 営業所</div>
              <button onClick={() => { setNBranchName(""); setModal("addBranch"); }} style={{ padding: "4px 12px", borderRadius: 14, background: "#E07B39", color: "#fff", border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>＋ 追加</button>
            </div>
            {branches.filter(b => b.company_id === selC.id).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 14 }}>営業所が未登録です</div>}
            {branches.filter(b => b.company_id === selC.id).map(b => (
              <div key={b.id} style={{ background: "#F9FAFB", borderRadius: 8, padding: "9px 12px", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: "#1F2937" }}>{b.name}</div>
                  <button onClick={() => { setEditBranch({ id: b.id, name: b.name }); setModal("editBranch"); }} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13 }}>✏️</button>
                  <button onClick={() => setConf({ msg: `「${b.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delBranch(b.id); setConf(null); } })} style={{ border: "none", background: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>🗑</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 700 }}>掛け率の初期値</div>
                  <MarkupDefaultEditor key={`br-${b.id}-${b.markup_default ?? ""}`} value={b.markup_default} onSave={v => updateBranchMarkup(b.id, v)} unsetLabel="取引先に合わせる" />
                </div>
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, marginTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C" }}>👤 担当者</div>
              <button onClick={() => openAddCt()} style={{ padding: "4px 12px", borderRadius: 14, background: "#E07B39", color: "#fff", border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>＋ 追加</button>
            </div>
            {(selC.contacts || []).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 14 }}>担当者が未登録です</div>}
            {(() => {
              const myBranches = branches.filter(b => b.company_id === selC.id);
              const renderCt = ct => (
                <div key={ct.id} onClick={() => setSelCt(ct)} style={{ background: "#F9FAFB", borderRadius: 8, padding: "10px 12px", marginBottom: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1A3A5C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#fff", fontWeight: 800 }}>{ct.name.charAt(0)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13, color: "#1F2937" }}>{ct.name}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{[ct.role, ct.tel, ct.email].filter(Boolean).join(" · ") || "連絡先未登録"}</div></div>
                  <button onClick={e => { e.stopPropagation(); askDeleteCt(ct); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#DC2626", fontSize: 13, flex: "none" }}>🗑</button>
                </div>
              );
              if (myBranches.length === 0) {
                const groupKey = ct => ct.role;
                return [...new Set((selC.contacts || []).map(groupKey))].map(g => (
                  <div key={g} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", borderLeft: "3px solid #E07B39", paddingLeft: 7, marginBottom: 6 }}>{g}</div>
                    {(selC.contacts || []).filter(ct => groupKey(ct) === g).map(renderCt)}
                  </div>
                ));
              }
              const unassigned = (selC.contacts || []).filter(ct => !myBranches.some(b => b.id === resolveContactBranchId(ct, myBranches)));
              return (
                <>
                  {myBranches.map(b => (
                    <div key={b.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "3px solid #E07B39", paddingLeft: 7, marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>🏢 {b.name}</div>
                        <button onClick={() => openAddCt(b.id)} style={{ border: "none", background: "none", color: "#E07B39", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>＋担当者を追加</button>
                      </div>
                      {(selC.contacts || []).filter(ct => resolveContactBranchId(ct, myBranches) === b.id).map(renderCt)}
                    </div>
                  ))}
                  {unassigned.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", borderLeft: "3px solid #9CA3AF", paddingLeft: 7, marginBottom: 6 }}>(営業所未設定)</div>
                      {unassigned.map(renderCt)}
                    </div>
                  )}
                </>
              );
            })()}
            <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C", marginBottom: 8 }}>📋 関連案件</div>
              {getPF(selC.id).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>案件なし</div>}
              {getPF(selC.id).map(p => {
                const won = wonProjectIds.has(p.id);
                const label = won ? "発注済み" : submittedProjectIds.has(p.id) ? "未発注" : "—";
                return (<div key={p.id} style={{ background: "#F0F4F8", borderRadius: 8, padding: "9px 12px", marginBottom: 6 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 600, fontSize: 13, color: "#1F2937" }}>{p.name}</div><span style={{ background: won ? "#D1FAE5" : "#E0F0FF", color: won ? "#065F46" : "#0B4F8A", border: `1px solid ${won ? "#34D399" : "#60A5FA"}`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span></div><div style={{ fontSize: 12, color: "#E07B39", fontWeight: 700, marginTop: 2 }}>{fmt(p.amount)}</div></div>);
              })}
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
      {modal === "addBranch" && (<Modal title="営業所を追加" onClose={() => setModal(null)} onSave={addBranch}><Inp label="営業所名 *" value={nBranchName} onChange={e => setNBranchName(e.target.value)} placeholder="例: 相模原" /></Modal>)}
      {modal === "editBranch" && editBranch && (<Modal title="営業所名を変更" onClose={() => setModal(null)} onSave={renameBranch}><Inp label="営業所名 *" value={editBranch.name} onChange={e => setEditBranch({ ...editBranch, name: e.target.value })} /></Modal>)}
      {modal === "addCt" && (<Modal title="担当者を追加" onClose={() => setModal(null)} onSave={saveCt}>
        <Inp label="担当者名 *" value={nCt.name} onChange={e => setNCt({ ...nCt, name: e.target.value })} />
        <Sel label="役割" opts={CONTACT_ROLES} value={nCt.role} onChange={e => setNCt({ ...nCt, role: e.target.value })} />
        {branches.filter(b => b.company_id === selC?.id).length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>営業所</div>
            <select value={nCt.branchId || ""} onChange={e => setNCt({ ...nCt, branchId: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
              <option value="">(営業所未設定)</option>
              {branches.filter(b => b.company_id === selC?.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <Inp label="電話番号" value={nCt.tel} onChange={e => setNCt({ ...nCt, tel: e.target.value })} />
        <Inp label="メール" value={nCt.email} onChange={e => setNCt({ ...nCt, email: e.target.value })} />
      </Modal>)}
      {modal === "editCt" && editCt && (<Modal title="担当者を編集" onClose={() => setModal(null)} onSave={saveEditCt}>
        <Inp label="担当者名 *" value={editCt.name} onChange={e => setEditCt({ ...editCt, name: e.target.value })} />
        <Sel label="役割" opts={CONTACT_ROLES} value={editCt.role} onChange={e => setEditCt({ ...editCt, role: e.target.value })} />
        {branches.filter(b => b.company_id === selC?.id).length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>営業所</div>
            <select value={editCt.branchId || ""} onChange={e => setEditCt({ ...editCt, branchId: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
              <option value="">(営業所未設定)</option>
              {branches.filter(b => b.company_id === selC?.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <Inp label="電話番号" value={editCt.tel} onChange={e => setEditCt({ ...editCt, tel: e.target.value })} />
        <Inp label="メール" value={editCt.email} onChange={e => setEditCt({ ...editCt, email: e.target.value })} />
      </Modal>)}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} okLabel={conf.okLabel} okColor={conf.okColor} />}
    </div>
  );
}