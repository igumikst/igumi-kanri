import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Hdr, Modal, Inp } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function PriceAdmin({ pjs, submittedQuotes, wonQuotes, cos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W }) {
  const pending = tks.filter(t => !t.done);

  const [loaded, setLoaded] = useState(false);
  const [priceSets, setPriceSets] = useState([]);
  const [priceGroups, setPriceGroups] = useState([]);
  const [priceItems, setPriceItems] = useState([]);
  const [priceCosts, setPriceCosts] = useState({});
  const [activeSetId, setActiveSetId] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [onlyUnconfirmed, setOnlyUnconfirmed] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [hidingId, setHidingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ groupId: "", name: "", spec: "", unit: "", note: "", salePrice: "", costPrice: "" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      const [setsRes, groupsRes, itemsRes, costsRes] = await Promise.all([
        supabase.from("price_sets").select("*").order("sort_order"),
        supabase.from("price_groups").select("*").order("sort_order"),
        supabase.from("price_items").select("*").order("sort_order"), // 非表示(is_active=false)も含めて取得し、表示側で絞り込む
        supabase.from("price_item_costs").select("*"),
      ]);
      if (setsRes.data) { setPriceSets(setsRes.data); setActiveSetId(setsRes.data[0]?.id || ""); }
      if (groupsRes.data) setPriceGroups(groupsRes.data);
      if (itemsRes.data) setPriceItems(itemsRes.data);
      if (costsRes.data) setPriceCosts(Object.fromEntries(costsRes.data.map(c => [c.price_item_id, c])));
      setLoaded(true);
    })();
  }, []);

  const groupsForSet = priceGroups.filter(g => g.price_set_id === activeSetId);
  const categories = [...new Set(groupsForSet.map(g => g.category))];
  const groupsForCategory = categoryFilter ? groupsForSet.filter(g => g.category === categoryFilter) : groupsForSet;
  const groupsMap = useMemo(() => Object.fromEntries(priceGroups.map(g => [g.id, g])), [priceGroups]);

  const itemsForSet = priceItems.filter(i => i.price_set_id === activeSetId && (showInactive || i.is_active !== false));
  const unconfirmedCount = itemsForSet.filter(i => i.is_active !== false && !priceCosts[i.id]?.cost_confirmed).length;

  const allFiltered = itemsForSet.filter(i => {
    if (onlyUnconfirmed && priceCosts[i.id]?.cost_confirmed) return false;
    if (groupFilter && i.price_group_id !== groupFilter) return false;
    if (categoryFilter && !groupFilter) { if (groupsMap[i.price_group_id]?.category !== categoryFilter) return false; }
    if (search) { const t = search.toLowerCase(); if (!(i.name || "").toLowerCase().includes(t) && !(i.spec || "").toLowerCase().includes(t)) return false; }
    return true;
  });
  const filtered = allFiltered.slice(0, 200);

  const getVal = (item, field) => {
    if (edits[item.id] && edits[item.id][field] !== undefined) return edits[item.id][field];
    if (field === "sale_price") return item.sale_price ?? "";
    if (field === "name") return item.name ?? "";
    if (field === "spec") return item.spec ?? "";
    if (field === "unit") return item.unit ?? "";
    if (field === "note") return item.note ?? "";
    if (field === "cost_price") return priceCosts[item.id]?.cost_price ?? "";
    if (field === "cost_confirmed") return priceCosts[item.id]?.cost_confirmed ?? false;
    return "";
  };
  const isDirty = itemId => !!edits[itemId];
  const updateEdit = (itemId, patch) => setEdits(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));

  const saveRow = async item => {
    setSavingId(item.id);
    const salePrice = getVal(item, "sale_price");
    const name = getVal(item, "name");
    const spec = getVal(item, "spec");
    const unit = getVal(item, "unit");
    const note = getVal(item, "note");
    const costPriceRaw = getVal(item, "cost_price");
    const costConfirmed = !!getVal(item, "cost_confirmed");
    const costPrice = costPriceRaw === "" ? null : Number(costPriceRaw);
    const [r1, r2] = await Promise.all([
      supabase.from("price_items").update({ sale_price: Number(salePrice) || 0, name: name.trim(), spec: spec.trim(), unit: unit.trim(), note: note.trim() }).eq("id", item.id),
      supabase.from("price_item_costs").upsert({ price_item_id: item.id, cost_price: costPrice, cost_confirmed: costConfirmed }, { onConflict: "price_item_id" }),
    ]);
    if (r1.error || r2.error) {
      alert("保存に失敗しました: " + (r1.error?.message || r2.error?.message));
      setSavingId(null);
      return;
    }
    setPriceItems(prev => prev.map(i => i.id === item.id ? { ...i, sale_price: Number(salePrice) || 0, name: name.trim(), spec: spec.trim(), unit: unit.trim(), note: note.trim() } : i));
    setPriceCosts(prev => ({ ...prev, [item.id]: { ...prev[item.id], price_item_id: item.id, cost_price: costPrice, cost_confirmed: costConfirmed } }));
    setEdits(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    setSavingId(null);
  };

  // 非表示/再表示(削除はしない。見積の履歴を壊さないため)
  const setActive = async (item, isActive) => {
    setHidingId(item.id);
    const { error } = await supabase.from("price_items").update({ is_active: isActive }).eq("id", item.id);
    if (error) { alert("更新に失敗しました: " + error.message); setHidingId(null); return; }
    setPriceItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: isActive } : i));
    setHidingId(null);
  };

  const groupsForAdd = priceGroups.filter(g => g.price_set_id === activeSetId);

  const openAdd = () => { setAddForm({ groupId: groupsForAdd[0]?.id || "", name: "", spec: "", unit: "", note: "", salePrice: "", costPrice: "" }); setAddOpen(true); };

  const saveAdd = async () => {
    if (adding) return;
    if (!addForm.name.trim() || !addForm.groupId) { alert("グループと名称は必須です"); return; }
    setAdding(true);
    const sortOrder = Math.max(0, ...priceItems.filter(i => i.price_group_id === addForm.groupId).map(i => i.sort_order || 0)) + 1;
    const { data, error } = await supabase.from("price_items").insert([{
      price_set_id: activeSetId, price_group_id: addForm.groupId, name: addForm.name.trim(), spec: addForm.spec.trim(),
      unit: addForm.unit.trim(), note: addForm.note.trim(), sale_price: Number(addForm.salePrice) || 0,
      item_type: "item", is_active: true, sort_order: sortOrder,
    }]).select();
    if (error) { alert("追加に失敗しました: " + error.message); setAdding(false); return; }
    const newItem = data[0];
    const costPrice = addForm.costPrice === "" ? null : Number(addForm.costPrice);
    if (costPrice != null) {
      await supabase.from("price_item_costs").upsert({ price_item_id: newItem.id, cost_price: costPrice, cost_confirmed: true }, { onConflict: "price_item_id" });
      setPriceCosts(prev => ({ ...prev, [newItem.id]: { price_item_id: newItem.id, cost_price: costPrice, cost_confirmed: true } }));
    }
    setPriceItems(prev => [...prev, newItem]);
    setAdding(false);
    setAddOpen(false);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="priceadmin" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} submittedQuotes={submittedQuotes} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} wonQuotes={wonQuotes} submittedQuotes={submittedQuotes} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="💲 単価・原価管理" back={() => nav("home")} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        {!loaded ? (
          <div style={{ textAlign: "center", color: "#9CA3AF", padding: 30 }}>読み込み中...</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {priceSets.map(s => (
                <button key={s.id} onClick={() => { setActiveSetId(s.id); setCategoryFilter(""); setGroupFilter(""); }}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid", borderColor: activeSetId === s.id ? "#1A3A5C" : "#D1D5DB", background: activeSetId === s.id ? "#1A3A5C" : "#fff", color: activeSetId === s.id ? "#fff" : "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {s.icon} {s.name}
                </button>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>この単価セット {itemsForSet.length}件 ・ <span style={{ color: unconfirmedCount > 0 ? "#DC2626" : "#059669", fontWeight: 700 }}>原価未確認 {unconfirmedCount}件</span></div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・仕様で検索" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setGroupFilter(""); }} style={{ flex: 1, minWidth: 140, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
                  <option value="">カテゴリ: すべて</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{ flex: 1, minWidth: 140, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
                  <option value="">グループ: すべて</option>
                  {groupsForCategory.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", whiteSpace: "nowrap", cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyUnconfirmed} onChange={e => setOnlyUnconfirmed(e.target.checked)} />
                  原価未確認のみ表示
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", whiteSpace: "nowrap", cursor: "pointer" }}>
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                  非表示の項目も表示
                </label>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>※ 単価表を直しても、すでに作った見積には影響しません(見積の作成時の値をコピーして保存しているため)</div>
            <button onClick={openAdd} style={{ width: "100%", padding: "10px 0", background: "#fff", color: "#1A3A5C", border: "1.5px dashed #94A3B8", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>＋ 新しい項目を追加</button>

            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>該当する項目がありません</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>項目</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>売価</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>原価🔒</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>確認済み</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(item => {
                        const dirty = isDirty(item.id);
                        const confirmed = getVal(item, "cost_confirmed");
                        const inactive = item.is_active === false;
                        return (
                          <tr key={item.id} style={{ borderBottom: "1px solid #F9FAFB", background: inactive ? "#F3F4F6" : dirty ? "#FFFBEB" : "transparent", opacity: inactive ? 0.6 : 1 }}>
                            <td style={{ padding: "6px 8px", maxWidth: 220 }}>
                              <input value={getVal(item, "name")} onChange={e => updateEdit(item.id, { name: e.target.value })} placeholder="名称" style={{ width: "100%", padding: "3px 5px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, fontWeight: 700, color: "#1F2937", marginBottom: 2, boxSizing: "border-box" }} />
                              <input value={getVal(item, "spec")} onChange={e => updateEdit(item.id, { spec: e.target.value })} placeholder="仕様" style={{ width: "100%", padding: "3px 5px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 11, color: "#6B7280", marginBottom: 2, boxSizing: "border-box" }} />
                              <div style={{ display: "flex", gap: 4 }}>
                                <input value={getVal(item, "unit")} onChange={e => updateEdit(item.id, { unit: e.target.value })} placeholder="単位" style={{ width: 50, padding: "3px 5px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 11, color: "#6B7280", boxSizing: "border-box" }} />
                                <input value={getVal(item, "note")} onChange={e => updateEdit(item.id, { note: e.target.value })} placeholder="備考" style={{ flex: 1, padding: "3px 5px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 11, color: "#6B7280", boxSizing: "border-box" }} />
                              </div>
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              {item.item_type === "labor_manual" ? <span style={{ fontSize: 11, color: "#9CA3AF" }}>(人工計算)</span> : (
                                <input type="number" value={getVal(item, "sale_price")} onChange={e => updateEdit(item.id, { sale_price: e.target.value })} style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                              )}
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              <input type="number" value={getVal(item, "cost_price")} onChange={e => updateEdit(item.id, { cost_price: e.target.value })} placeholder="未入力" style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              <input type="checkbox" checked={!!confirmed} onChange={e => updateEdit(item.id, { cost_confirmed: e.target.checked })} />
                            </td>
                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                              <button onClick={() => saveRow(item)} disabled={!dirty || savingId === item.id} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: dirty ? "#1A3A5C" : "#F3F4F6", color: dirty ? "#fff" : "#9CA3AF", fontSize: 11, fontWeight: 700, cursor: dirty ? "pointer" : "default", marginBottom: 4, display: "block" }}>
                                {savingId === item.id ? "保存中" : "保存"}
                              </button>
                              <button onClick={() => setActive(item, inactive)} disabled={hidingId === item.id} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: inactive ? "#059669" : "#9A3412", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                {hidingId === item.id ? "処理中" : inactive ? "再表示にする" : "非表示にする"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {allFiltered.length > filtered.length && <div style={{ padding: "10px 4px", fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>該当{allFiltered.length}件中、先頭200件を表示しています。検索で絞り込んでください</div>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {addOpen && (
        <Modal title="新しい項目を追加" onClose={() => setAddOpen(false)} onSave={saveAdd}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>グループ *</div>
            <select value={addForm.groupId} onChange={e => setAddForm({ ...addForm, groupId: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
              {groupsForAdd.length === 0 && <option value="">(グループがありません)</option>}
              {groupsForAdd.map(g => <option key={g.id} value={g.id}>{g.category ? `${g.category} / ` : ""}{g.name}</option>)}
            </select>
          </div>
          <Inp label="名称 *" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} />
          <Inp label="仕様" value={addForm.spec} onChange={e => setAddForm({ ...addForm, spec: e.target.value })} />
          <Inp label="単位" value={addForm.unit} onChange={e => setAddForm({ ...addForm, unit: e.target.value })} />
          <Inp label="備考" value={addForm.note} onChange={e => setAddForm({ ...addForm, note: e.target.value })} />
          <Inp label="売価" type="number" value={addForm.salePrice} onChange={e => setAddForm({ ...addForm, salePrice: e.target.value })} />
          <Inp label="原価(任意・入れると確認済みになります)" type="number" value={addForm.costPrice} onChange={e => setAddForm({ ...addForm, costPrice: e.target.value })} />
        </Modal>
      )}
    </div>
  );
}
