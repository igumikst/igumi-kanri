import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { Confirm } from "../components/UI";

const HEADER_COLOR = "#1a56a0";
const CATEGORIES = ["人格設定", "理念", "現場知識", "会社ルール", "その他"];

const EMPTY_FORM = { title: "", content: "", category: "理念", is_active: true };

export default function AiKnowledge({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterCat, setFilterCat] = useState("すべて");
  const pending = (tks || []).filter((t) => !t.done);

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_knowledge")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) setItems(data);
    setLoading(false);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditId(item.id);
    setForm({
      title: item.title || "",
      content: item.content || "",
      category: item.category || "理念",
      is_active: item.is_active !== false,
    });
    setShowForm(true);
  };

  const saveItem = async () => {
    if (!form.title.trim()) {
      alert("タイトルを入力してください");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      content: form.content,
      category: form.category,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    if (editId) {
      const { data, error } = await supabase.from("ai_knowledge").update(payload).eq("id", editId).select().single();
      setSaving(false);
      if (error) { alert("更新エラー：" + error.message); return; }
      setItems((prev) => prev.map((i) => (i.id === editId ? data : i)));
    } else {
      const { data, error } = await supabase.from("ai_knowledge").insert([payload]).select().single();
      setSaving(false);
      if (error) { alert("追加エラー：" + error.message); return; }
      setItems((prev) => [data, ...prev]);
    }
    setShowForm(false);
    setEditId(null);
    setForm({ ...EMPTY_FORM });
  };

  const toggleActive = async (item) => {
    const next = !item.is_active;
    const { data, error } = await supabase
      .from("ai_knowledge")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .select()
      .single();
    if (error) { alert("更新エラー：" + error.message); return; }
    setItems((prev) => prev.map((i) => (i.id === item.id ? data : i)));
  };

  const deleteItem = async (id) => {
    const { error } = await supabase.from("ai_knowledge").delete().eq("id", id);
    if (error) { alert("削除エラー：" + error.message); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleteTarget(null);
    if (editId === id) {
      setShowForm(false);
      setEditId(null);
      setForm({ ...EMPTY_FORM });
    }
  };

  const fmtDate = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const filtered = filterCat === "すべて" ? items : items.filter((i) => i.category === filterCat);

  const s = {
    input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, boxSizing: "border-box", background: "#fff", color: "#1f2937", colorScheme: "light" },
    textarea: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, boxSizing: "border-box", background: "#fff", color: "#1f2937", minHeight: 280, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, colorScheme: "light" },
    label: { fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6, display: "block" },
    card: { background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#f0f4f8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && (
        <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="aiknowledge" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />
      )}
      {isPC && (cust.showRightPanel !== false) && (
        <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />
      )}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <div style={{ maxWidth: isPC ? 800 : "100%", margin: "0 auto", width: "100%" }}>
      <div style={{ background: HEADER_COLOR, color: "#fff", padding: "14px 16px", position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>← 戻る</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>🧠 AIナレッジ管理</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>AIメンター・レビューに反映される知識ベース</div>
        </div>
        <button onClick={openNew} style={{ background: "#fff", border: "none", color: HEADER_COLOR, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800, flexShrink: 0 }}>＋ 追加</button>
      </div>

      <div style={{ padding: "12px 14px 0", display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
        {["すべて", ...CATEGORIES].map((c) => {
          const active = filterCat === c;
          return (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              style={{
                padding: "5px 14px", borderRadius: 16, border: `1.5px solid ${active ? HEADER_COLOR : "#e5e7eb"}`,
                whiteSpace: "nowrap", background: active ? HEADER_COLOR : "#fff",
                color: active ? "#fff" : "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "8px 14px 80px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📚</div>
            <div>ナレッジがありません</div>
            <button onClick={openNew} style={{ marginTop: 16, padding: "10px 20px", background: HEADER_COLOR, color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>最初のナレッジを追加</button>
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} style={{ ...s.card, opacity: item.is_active ? 1 : 0.55, borderLeft: `4px solid ${item.is_active ? HEADER_COLOR : "#d1d5db"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ background: "#eff6ff", color: HEADER_COLOR, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{item.category || "理念"}</span>
                    <span style={{ background: item.is_active ? "#ecfdf5" : "#f3f4f6", color: item.is_active ? "#059669" : "#9ca3af", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                      {item.is_active ? "有効" : "無効"}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#1f2937", wordBreak: "break-word" }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>更新：{fmtDate(item.updated_at)}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6, maxHeight: 80, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 12 }}>
                {(item.content || "").slice(0, 200)}{(item.content || "").length > 200 ? "…" : ""}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => openEdit(item)} style={{ padding: "6px 12px", background: "#eff6ff", color: HEADER_COLOR, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️ 編集</button>
                <button onClick={() => toggleActive(item)} style={{ padding: "6px 12px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {item.is_active ? "無効にする" : "有効にする"}
                </button>
                <button onClick={() => setDeleteTarget(item)} style={{ padding: "6px 12px", background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑 削除</button>
              </div>
            </div>
          ))
        )}
      </div>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 400, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "92vh", overflowY: "auto", padding: "20px 16px 32px", boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1f2937" }}>{editId ? "ナレッジを編集" : "ナレッジを追加"}</div>
              <button onClick={() => { setShowForm(false); setEditId(null); setForm({ ...EMPTY_FORM }); }} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 15 }}>✕</button>
            </div>

            <label style={s.label}>タイトル</label>
            <input style={{ ...s.input, marginBottom: 14 }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：IGUMIの理念・ハンドオフ" />

            <label style={s.label}>カテゴリ</label>
            <select style={{ ...s.input, marginBottom: 14 }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={s.label}>本文（ハンドオフ全文など長文OK）</label>
            <textarea style={{ ...s.textarea, marginBottom: 14 }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="AIに伝えたい知識・理念・ルールを入力..." />

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, cursor: "pointer", fontSize: 14, color: "#374151" }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              AIに反映する（有効）
            </label>

            <button onClick={saveItem} disabled={saving} style={{ width: "100%", padding: 14, background: saving ? "#9ca3af" : HEADER_COLOR, color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer" }}>
              {saving ? "保存中..." : editId ? "更新する" : "追加する"}
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
