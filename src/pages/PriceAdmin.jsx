import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function PriceAdmin({ pjs, cos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W }) {
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

  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    (async () => {
      const [setsRes, groupsRes, itemsRes, costsRes] = await Promise.all([
        supabase.from("price_sets").select("*").order("sort_order"),
        supabase.from("price_groups").select("*").order("sort_order"),
        supabase.from("price_items").select("*").eq("is_active", true).order("sort_order"),
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

  const itemsForSet = priceItems.filter(i => i.price_set_id === activeSetId);
  const unconfirmedCount = itemsForSet.filter(i => !priceCosts[i.id]?.cost_confirmed).length;

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
    if (field === "cost_price") return priceCosts[item.id]?.cost_price ?? "";
    if (field === "cost_confirmed") return priceCosts[item.id]?.cost_confirmed ?? false;
    return "";
  };
  const isDirty = itemId => !!edits[itemId];
  const updateEdit = (itemId, patch) => setEdits(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));

  const saveRow = async item => {
    setSavingId(item.id);
    const salePrice = getVal(item, "sale_price");
    const costPriceRaw = getVal(item, "cost_price");
    const costConfirmed = !!getVal(item, "cost_confirmed");
    const costPrice = costPriceRaw === "" ? null : Number(costPriceRaw);
    const [r1, r2] = await Promise.all([
      supabase.from("price_items").update({ sale_price: Number(salePrice) || 0 }).eq("id", item.id),
      supabase.from("price_item_costs").upsert({ price_item_id: item.id, cost_price: costPrice, cost_confirmed: costConfirmed }, { onConflict: "price_item_id" }),
    ]);
    if (r1.error || r2.error) {
      alert("保存に失敗しました: " + (r1.error?.message || r2.error?.message));
      setSavingId(null);
      return;
    }
    setPriceItems(prev => prev.map(i => i.id === item.id ? { ...i, sale_price: Number(salePrice) || 0 } : i));
    setPriceCosts(prev => ({ ...prev, [item.id]: { ...prev[item.id], price_item_id: item.id, cost_price: costPrice, cost_confirmed: costConfirmed } }));
    setEdits(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    setSavingId(null);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="priceadmin" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
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
              </div>
            </div>

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
                        return (
                          <tr key={item.id} style={{ borderBottom: "1px solid #F9FAFB", background: dirty ? "#FFFBEB" : "transparent" }}>
                            <td style={{ padding: "6px 8px", maxWidth: 200 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>{item.name}</div>
                              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{item.spec}{item.spec ? " ・ " : ""}{item.unit}</div>
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
                              <button onClick={() => saveRow(item)} disabled={!dirty || savingId === item.id} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: dirty ? "#1A3A5C" : "#F3F4F6", color: dirty ? "#fff" : "#9CA3AF", fontSize: 11, fontWeight: 700, cursor: dirty ? "pointer" : "default" }}>
                                {savingId === item.id ? "保存中" : "保存"}
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
    </div>
  );
}
