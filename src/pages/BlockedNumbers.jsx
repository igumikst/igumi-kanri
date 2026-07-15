import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const LABEL_OPTIONS = ["営業電話", "いたずら・無言", "間違い電話", "その他"];

export default function BlockedNumbers({ cust, isPC, pp, nav }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newLabel, setNewLabel] = useState("営業電話");
  const [newMemo, setNewMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("blocked_numbers")
      .select("*")
      .order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const normalizePhone = (num) => {
    if (!num || typeof num !== "string") return "";
    const trimmed = num.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("+81")) return "0" + trimmed.slice(3);
    return trimmed;
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  const updateField = async (id, field, value) => {
    const { error } = await supabase.from("blocked_numbers").update({ [field]: value }).eq("id", id);
    if (!error) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    } else {
      alert("更新に失敗しました: " + error.message);
    }
  };

  const deleteRow = async (row) => {
    if (!window.confirm("この番号をリストから削除しますか?")) return;
    const { error } = await supabase.from("blocked_numbers").delete().eq("id", row.id);
    if (!error) {
      setRows(prev => prev.filter(r => r.id !== row.id));
    } else {
      alert("削除に失敗しました: " + error.message);
    }
  };

  const addRow = async () => {
    const phone = normalizePhone(newPhone);
    if (!phone) { alert("電話番号を入力してください"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("blocked_numbers").insert([{
      phone_number: phone,
      label: newLabel || "営業電話",
      memo: newMemo.trim() || null,
    }]).select().single();
    if (!error && data) {
      setRows(prev => [data, ...prev]);
      setShowAdd(false);
      setNewPhone("");
      setNewLabel("営業電話");
      setNewMemo("");
    } else if (error?.code === "23505") {
      alert("この番号はすでに登録されています");
    } else {
      alert("登録に失敗しました: " + (error?.message || ""));
    }
    setSaving(false);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      <div style={{ background: `linear-gradient(135deg,${cust.c1},${cust.c2})`, padding: "16px 20px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>← ホーム</button>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>🚫 迷惑電話リスト</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>{rows.length} 件登録</div>
          </div>
          <button onClick={() => setShowAdd(true)}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
            ＋ 追加
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 16px 40px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>読み込み中...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#9CA3AF" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>登録された番号はありません</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(row => (
              <div key={row.id} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1F2937" }}>{row.phone_number}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", flexShrink: 0 }}>{formatDate(row.created_at)}</div>
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 6 }}>ラベル</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {LABEL_OPTIONS.map(label => (
                    <button key={label} onClick={() => updateField(row.id, "label", label)}
                      style={{ padding: "4px 10px", borderRadius: 16, border: `1.5px solid ${row.label === label ? "#EA580C" : "#E5E7EB"}`, background: row.label === label ? "#FFF7ED" : "#fff", color: row.label === label ? "#EA580C" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 6 }}>メモ</div>
                <input
                  value={row.memo || ""}
                  onChange={e => setRows(prev => prev.map(r => r.id === row.id ? { ...r, memo: e.target.value } : r))}
                  onBlur={e => updateField(row.id, "memo", e.target.value.trim() || null)}
                  placeholder="メモなし"
                  style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", color: "#1F2937", boxSizing: "border-box", marginBottom: 12 }}
                />
                <button onClick={() => deleteRow(row)}
                  style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  🗑 削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 360, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1F2937", marginBottom: 14 }}>＋ 番号を追加</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 6 }}>電話番号</div>
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="例: 09012345678"
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", fontSize: 13, outline: "none", color: "#1F2937", boxSizing: "border-box", marginBottom: 12 }} />
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 6 }}>ラベル</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {LABEL_OPTIONS.map(label => (
                <button key={label} onClick={() => setNewLabel(label)}
                  style={{ padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${newLabel === label ? "#EA580C" : "#E5E7EB"}`, background: newLabel === label ? "#FFF7ED" : "#fff", color: newLabel === label ? "#EA580C" : "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 6 }}>メモ（任意）</div>
            <input value={newMemo} onChange={e => setNewMemo(e.target.value)} placeholder="例: 〇〇商事の営業"
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", fontSize: 13, outline: "none", color: "#1F2937", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={addRow} disabled={saving}
                style={{ flex: 1, padding: 12, background: "#EA580C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
                {saving ? "登録中..." : "登録する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
