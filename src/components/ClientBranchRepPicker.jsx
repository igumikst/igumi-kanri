import { useState } from "react";
import { supabase } from "../lib/supabase";
import { addContact, findDuplicateSalesRep } from "../lib/contacts";
import { describeError } from "../lib/errorMessage";

const sel = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" };
const label = { fontSize: 11, color: "#6B7280", marginBottom: 3 };
const addBtn = { marginTop: 4, padding: "4px 10px", borderRadius: 8, border: "1px dashed #94A3B8", background: "#fff", color: "#1A3A5C", fontSize: 11, fontWeight: 700, cursor: "pointer" };
const confirmBtn = { padding: "0 12px", borderRadius: 8, border: "none", background: "#1A3A5C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" };
// 担当者の「＋追加」は、営業担当の選択ミスに直結しやすいので、はっきり見える塗りボタンにする(第8弾テーマ12)
const addRepBtn = { padding: "0 16px", borderRadius: 8, border: "none", background: "#E07B39", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };

// 取引先(companies, type='取引先') → 営業所(company_branches) → 営業担当(sales_reps) の順に選ぶ。
// 取引先を選ぶとその取引先の営業所だけ、営業所を選ぶとその営業所の担当者だけが出る。
// 営業所が無い取引先は、営業担当だけを選べる。営業所・営業担当は、その場で追加できる
// (営業担当を追加すると、sales_reps に入れ、取引先のcontactsにも名前を足す)。
export default function ClientBranchRepPicker({ clientId, branchId, salesRepId, cos, setCos, branches, setBranches, salesReps, setSalesReps, onChange }) {
  const [addingBranch, setAddingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newRepName, setNewRepName] = useState("");

  const clients = cos.filter(c => c.type === "取引先");
  const branchesForClient = branches.filter(b => b.company_id === clientId);
  const repsForClient = salesReps.filter(s => s.company_id === clientId);
  const repsShown = branchId ? repsForClient.filter(s => s.branch_id === branchId) : repsForClient;
  const repName = s => s?.name || s?.display_name || "";

  const pickClient = id => { setAddingBranch(false); onChange({ clientId: id, branchId: "", salesRepId: "", salesRep: "" }); };
  const pickBranch = id => { onChange({ clientId, branchId: id, salesRepId: "", salesRep: "" }); };
  const pickRep = id => { const rep = salesReps.find(s => s.id === id); onChange({ clientId, branchId, salesRepId: id, salesRep: id ? repName(rep) : "" }); };

  const addBranch = async () => {
    if (!newBranchName.trim() || !clientId) return;
    const { data, error } = await supabase.from("company_branches").insert([{ company_id: clientId, name: newBranchName.trim() }]).select();
    if (error) { alert(describeError(error, "営業所の追加")); return; }
    setBranches(prev => [...prev, data[0]]);
    setNewBranchName(""); setAddingBranch(false);
    pickBranch(data[0].id);
  };

  const addRep = async () => {
    const name = newRepName.trim();
    if (!name || !clientId) return;
    const existing = findDuplicateSalesRep(salesReps, { companyId: clientId, name });
    if (existing) {
      const branchName = branches.find(b => b.id === existing.branch_id)?.name || "未設定";
      if (!confirm(`同じ名前の担当者がすでにいます(${name}・${branchName})。\n\nこの人を選択しますか？`)) return;
      setNewRepName("");
      onChange({ clientId, branchId: existing.branch_id || "", salesRepId: existing.id, salesRep: existing.name });
      return;
    }
    const co = cos.find(c => c.id === clientId);
    try {
      const { contacts, salesRepRow } = await addContact(supabase, { companyId: clientId, contacts: co?.contacts, name, role: "営業", branchId: branchId || null });
      if (salesRepRow) setSalesReps(prev => [...prev, salesRepRow]);
      if (co && setCos) setCos(prev => prev.map(c => c.id === clientId ? { ...c, contacts } : c));
      setNewRepName("");
      // pickRep(salesRepRow.id)だと、salesReps stateの更新がまだ反映されていない同じ描画内の
      // 古いsalesReps配列から探すため名前が空になる(第8弾テーマ12で発見)。salesRepRowの名前を直接使う
      onChange({ clientId, branchId, salesRepId: salesRepRow.id, salesRep: salesRepRow.name });
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <div style={label}>取引先</div>
        <select value={clientId || ""} onChange={e => pickClient(e.target.value)} style={sel}>
          <option value="">未設定</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.branch ? " " + c.branch : ""}</option>)}
        </select>
      </div>

      {clientId && branchesForClient.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={label}>営業所</div>
          <select value={branchId || ""} onChange={e => pickBranch(e.target.value)} style={sel}>
            <option value="">未設定</option>
            {branchesForClient.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {!addingBranch ? (
            <button type="button" onClick={() => setAddingBranch(true)} style={addBtn}>＋ 新しい営業所を追加</button>
          ) : (
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="営業所名" style={{ ...sel, flex: 1 }} />
              <button type="button" onClick={addBranch} style={confirmBtn}>追加</button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <div style={label}>営業担当</div>
        {!clientId ? (
          <div style={{ fontSize: 12, color: "#9CA3AF" }}>先に取引先を選んでください</div>
        ) : (
          <>
            <select value={salesRepId || ""} onChange={e => pickRep(e.target.value)} style={sel}>
              <option value="">未設定</option>
              {repsShown.map(s => <option key={s.id} value={s.id}>{repName(s)}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input
                value={newRepName}
                onChange={e => setNewRepName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRep(); } }}
                placeholder="担当者名"
                style={{ ...sel, flex: 1 }}
              />
              <button type="button" onClick={addRep} style={addRepBtn}>＋ 追加</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
