import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { Confirm } from "../components/UI";

const HEADER_COLOR = "#1a56a0";
const TYPE_LABELS = { normal: "通常", tama: "多摩", union: "ユニオン", manual: "手動登録", "": "未分類" };
const TYPE_FILTERS = ["すべて", "normal", "tama", "union", "manual"];

export default function Reports({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("すべて");
  const [selected, setSelected] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualForm, setManualForm] = useState({ title: "", property_name: "", content: "", created_by: "" });
  const pending = (tks || []).filter((t) => !t.done);

  useEffect(() => {
    const t = setTimeout(() => { searchItems(); }, 300);
    return () => clearTimeout(t);
  }, [keyword, typeFilter]);

  const searchItems = async () => {
    setLoading(true);
    let query = supabase.from("reports").select("*").order("created_at", { ascending: false });
    if (typeFilter !== "すべて") query = query.eq("report_type", typeFilter);
    if (keyword.trim()) {
      const q = `%${keyword.trim()}%`;
      query = query.or(`title.ilike.${q},property_name.ilike.${q},content.ilike.${q}`);
    }
    const { data, error } = await query;
    if (!error && data) setItems(data);
    setLoading(false);
  };

  const deleteItem = async (id) => {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) { alert("削除エラー：" + error.message); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleteTarget(null);
    if (selected?.id === id) setSelected(null);
  };

  const saveManual = async () => {
    if (!manualForm.title.trim() || !manualForm.content.trim()) {
      alert("タイトルと本文を入力してください");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from("reports").insert([{
      title: manualForm.title.trim(),
      property_name: manualForm.property_name.trim(),
      content: manualForm.content,
      report_type: "manual",
      source: "manual",
      created_by: manualForm.created_by.trim(),
    }]).select().single();
    setSaving(false);
    if (error) { alert("保存エラー：" + error.message); return; }
    setItems((prev) => [data, ...prev]);
    setManualForm({ title: "", property_name: "", content: "", created_by: "" });
    setShowManual(false);
  };

  const fmtDate = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const typeLabel = (t) => TYPE_LABELS[t] || t || "未分類";

  const s = {
    input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, boxSizing: "border-box", background: "#fff", color: "#1f2937", colorScheme: "light" },
    textarea: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, boxSizing: "border-box", background: "#fff", color: "#1f2937", minHeight: 200, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, colorScheme: "light" },
    label: { fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6, display: "block" },
    card: { background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", cursor: "pointer" },
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#f0f4f8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && (
        <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="reports" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />
      )}
      {isPC && (cust.showRightPanel !== false) && (
        <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />
      )}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <div style={{ maxWidth: isPC ? 800 : "100%", margin: "0 auto", width: "100%" }}>
        <div style={{ background: HEADER_COLOR, color: "#fff", padding: "14px 16px", position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>← 戻る</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>📦 報告書保管箱</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>報告書テキストの検索・保管</div>
          </div>
          <button onClick={() => setShowManual(true)} style={{ background: "#fff", border: "none", color: HEADER_COLOR, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800, flexShrink: 0 }}>＋ 外部登録</button>
        </div>

        <div style={{ padding: "12px 14px 0" }}>
          <input
            style={{ ...s.input, marginBottom: 10 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="🔍 タイトル・物件名・本文で検索..."
          />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
            {TYPE_FILTERS.map((c) => {
              const active = typeFilter === c;
              const label = c === "すべて" ? "すべて" : typeLabel(c);
              return (
                <button
                  key={c}
                  onClick={() => setTypeFilter(c)}
                  style={{
                    padding: "5px 14px", borderRadius: 16, border: `1.5px solid ${active ? HEADER_COLOR : "#e5e7eb"}`,
                    whiteSpace: "nowrap", background: active ? HEADER_COLOR : "#fff",
                    color: active ? "#fff" : "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "8px 14px 80px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>読み込み中...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
              <div>報告書がありません</div>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} onClick={() => setSelected(item)} style={{ ...s.card, borderLeft: `4px solid ${HEADER_COLOR}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1f2937", flex: 1, wordBreak: "break-word" }}>{item.title}</div>
                  <span style={{ background: "#eff6ff", color: HEADER_COLOR, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{typeLabel(item.report_type)}</span>
                </div>
                {item.property_name && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>🏠 {item.property_name}</div>
                )}
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  {fmtDate(item.created_at)}
                  {item.created_by ? ` · ${item.created_by}` : ""}
                  {item.source === "manual" ? " · 手動登録" : item.source === "report_tool" ? " · 報告書ツール" : ""}
                </div>
                <div style={{ fontSize: 12, color: "#4b5563", marginTop: 8, lineHeight: 1.5, maxHeight: 48, overflow: "hidden", whiteSpace: "pre-wrap" }}>
                  {(item.content || "").slice(0, 120)}{(item.content || "").length > 120 ? "…" : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 400, display: "flex", alignItems: "flex-end" }} onClick={() => setSelected(null)}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "20px 16px 32px", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#1f2937", wordBreak: "break-word" }}>{selected.title}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                  {typeLabel(selected.report_type)} · {fmtDate(selected.created_at)}
                  {selected.created_by ? ` · ${selected.created_by}` : ""}
                </div>
                {selected.property_name && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>🏠 {selected.property_name}</div>}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 15, flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7, color: "#374151", background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e5e7eb", marginBottom: 16, maxHeight: "50vh", overflowY: "auto" }}>
              {selected.content || "（本文なし）"}
            </div>
            <button onClick={() => setDeleteTarget(selected)} style={{ width: "100%", padding: 12, background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>🗑 削除する</button>
          </div>
        </div>
      )}

      {showManual && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 400, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "92vh", overflowY: "auto", padding: "20px 16px 32px", boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1f2937" }}>外部の報告書を登録</div>
              <button onClick={() => setShowManual(false)} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 15 }}>✕</button>
            </div>
            <label style={s.label}>タイトル *</label>
            <input style={{ ...s.input, marginBottom: 14 }} value={manualForm.title} onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })} placeholder="報告書のタイトル" />
            <label style={s.label}>物件名</label>
            <input style={{ ...s.input, marginBottom: 14 }} value={manualForm.property_name} onChange={(e) => setManualForm({ ...manualForm, property_name: e.target.value })} placeholder="例: 〇〇マンション" />
            <label style={s.label}>登録者</label>
            <input style={{ ...s.input, marginBottom: 14 }} value={manualForm.created_by} onChange={(e) => setManualForm({ ...manualForm, created_by: e.target.value })} placeholder="例: 山田" />
            <label style={s.label}>本文 *（報告書の全文を貼り付け）</label>
            <textarea style={{ ...s.textarea, marginBottom: 14 }} value={manualForm.content} onChange={(e) => setManualForm({ ...manualForm, content: e.target.value })} placeholder="報告書の内容を貼り付けてください..." />
            <button onClick={saveManual} disabled={saving} style={{ width: "100%", padding: 14, background: saving ? "#9ca3af" : HEADER_COLOR, color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer" }}>
              {saving ? "保存中..." : "保管箱に保存"}
            </button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <Confirm
          msg={`「${deleteTarget.title}」を削除しますか？\nこの操作は元に戻せません`}
          onCancel={() => setDeleteTarget(null)}
          onOk={() => deleteItem(deleteTarget.id)}
        />
      )}
    </div>
  );
}
