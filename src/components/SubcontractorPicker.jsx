import { useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeText } from "../lib/priceMatch";
import { describeError } from "../lib/errorMessage";

const ADD_NEW = "__add_new__";

// 下請け会社を選ぶドロップダウンと、「＋ 新しい下請け会社を追加」(第9弾)。
// 見積編集(Quotes.jsx)と見積ファイル取り込み(QuoteImport.jsxの4つの取り込み形式)で、
// まったく同じ作りだったものを、ここに1つにまとめた(直すときは、ここだけでよい)。
// 末尾の「＋ 新しい下請け会社を追加」を選ぶと、会社名だけの小さな入力欄に切り替わる。
// 追加すると、取引先ページの新規追加(Companies.jsx の saveCo)と同じ内容
// (type="協力業者"・branch=""・contacts=[])でcompaniesに登録し、一覧(cos)に足して、
// そのまま選択状態にする。
export default function SubcontractorPicker({ cos, setCos, subcontractors, value, onChange, style, selectStyle }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const addCompany = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    // 全角半角・大文字小文字・空白などの表記ゆれを無視して、同じ名前が無いか確認する
    const dupe = cos.some(c => normalizeText(c.name) === normalizeText(trimmed));
    if (dupe && !window.confirm("すでに同じ名前の会社があります。続けますか?")) return;
    setSaving(true);
    const { data, error } = await supabase.from("companies").insert([{ name: trimmed, type: "協力業者", branch: "", contacts: [] }]).select();
    setSaving(false);
    if (error || !data?.[0]) { alert(describeError(error, "下請け会社の追加")); return; }
    setCos(prev => [...prev, { ...data[0], contacts: data[0].contacts || [] }]);
    setAdding(false);
    setName("");
    onChange(data[0].id);
  };

  if (adding) {
    return (
      <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 160, flexBasis: "100%", ...style }}>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="新しい下請け会社名"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCompany(); } if (e.key === "Escape") { setAdding(false); setName(""); } }}
          style={{ flex: 1, minWidth: 100, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E07B39", fontSize: 12, color: "#1F2937" }}
        />
        <button type="button" onClick={addCompany} disabled={saving || !name.trim()} style={{ background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving || !name.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}>{saving ? "追加中..." : "追加"}</button>
        <button type="button" onClick={() => { setAdding(false); setName(""); }} style={{ background: "none", border: "none", color: "#6B7280", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>キャンセル</button>
      </div>
    );
  }

  return (
    <select
      value={value || ""}
      onChange={e => { if (e.target.value === ADD_NEW) setAdding(true); else onChange(e.target.value); }}
      style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937", ...selectStyle, ...style }}
    >
      <option value="">下請け会社を選択</option>
      {subcontractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      <option value={ADD_NEW}>＋ 新しい下請け会社を追加</option>
    </select>
  );
}
