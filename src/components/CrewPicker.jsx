import { useState } from "react";
import { supabase } from "../lib/supabase";
import { describeError } from "../lib/errorMessage";

// 班(誰が施工したか)を選ぶセレクトと、「＋ 班を追加」(第8弾テーマ21)。
// ClientBranchRepPicker.jsx の「＋ 新しい営業所を追加」と同じ見た目・同じ作り。
// 追加した班は is_own=false 固定(自社かどうかは、最初に用意した「自社」だけが true)。
const sel = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" };
const addBtn = { marginTop: 4, padding: "4px 10px", borderRadius: 8, border: "1px dashed #94A3B8", background: "#fff", color: "#1A3A5C", fontSize: 11, fontWeight: 700, cursor: "pointer" };
const confirmBtn = { padding: "0 12px", borderRadius: 8, border: "none", background: "#1A3A5C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" };

export default function CrewPicker({ crewId, crews, setCrews, onChange }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const activeCrews = [...(crews || [])].filter(c => c.is_active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const addCrew = async () => {
    const name = newName.trim();
    if (!name) return;
    if (activeCrews.some(c => c.name.toLowerCase() === name.toLowerCase())) { alert("同じ名前の班があります"); return; }
    const maxOrder = Math.max(0, ...(crews || []).map(c => c.sort_order || 0));
    const { data, error } = await supabase.from("crews").insert([{ name, is_own: false, sort_order: maxOrder + 1 }]).select();
    if (error) { alert(describeError(error, "班の追加")); return; }
    setCrews(prev => [...prev, data[0]]);
    setNewName(""); setAdding(false);
    onChange(data[0].id);
  };

  return (
    <div>
      <select value={crewId || ""} onChange={e => onChange(e.target.value)} style={sel}>
        <option value="">未設定</option>
        {activeCrews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} style={addBtn}>＋ 班を追加</button>
      ) : (
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="班名" style={{ ...sel, flex: 1 }} />
          <button type="button" onClick={addCrew} style={confirmBtn}>追加</button>
        </div>
      )}
    </div>
  );
}
