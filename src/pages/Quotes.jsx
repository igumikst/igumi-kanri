import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { fmt } from "../lib/constants";

const QUOTE_STATUS = [
  { key: "draft", label: "下書き", bg: "#F3F4F6", text: "#4B5563", border: "#D1D5DB" },
  { key: "submitted", label: "提出済み", bg: "#E0F0FF", text: "#0B4F8A", border: "#60A5FA" },
  { key: "won", label: "受注", bg: "#D1FAE5", text: "#065F46", border: "#34D399" },
  { key: "lost", label: "失注", bg: "#F8D7DA", text: "#58151C", border: "#F1707A" },
];
const statusStyle = key => QUOTE_STATUS.find(s => s.key === key) || QUOTE_STATUS[0];

const blankEd = { id: null, quote_no: null, title: "", price_set_id: "", status: "draft", lines: [] };
const newKey = () => "l" + Date.now() + Math.random().toString(36).slice(2);

export default function Quotes({ pjs, cos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, quoteProjectId }) {
  const project = pjs.find(p => p.id === quoteProjectId);
  const pending = tks.filter(t => !t.done);

  const [view, setView] = useState("list");
  const [quotes, setQuotes] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [conf, setConf] = useState(null);
  const [saving, setSaving] = useState(false);

  const [priceLoaded, setPriceLoaded] = useState(false);
  const [priceSets, setPriceSets] = useState([]);
  const [priceGroups, setPriceGroups] = useState([]);
  const [priceItems, setPriceItems] = useState([]);
  const [priceCosts, setPriceCosts] = useState({});
  const [laborUnitPrice, setLaborUnitPrice] = useState(26000);

  const [ed, setEd] = useState(blankEd);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [laborPick, setLaborPick] = useState(null);
  const [laborCountInput, setLaborCountInput] = useState("");

  const loadQuotes = async () => {
    if (!quoteProjectId) return;
    setLoadingQuotes(true);
    const { data } = await supabase.from("quotes").select("*").eq("project_id", quoteProjectId).order("quote_no", { ascending: true });
    if (data) setQuotes(data);
    setLoadingQuotes(false);
  };
  useEffect(() => { loadQuotes(); }, [quoteProjectId]);

  const ensurePriceData = async () => {
    if (priceLoaded) return;
    const [setsRes, groupsRes, itemsRes, costsRes, settingsRes] = await Promise.all([
      supabase.from("price_sets").select("*").order("sort_order"),
      supabase.from("price_groups").select("*").order("sort_order"),
      supabase.from("price_items").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("price_item_costs").select("*"),
      supabase.from("app_settings").select("*").eq("key", "labor_unit_price"),
    ]);
    if (setsRes.data) setPriceSets(setsRes.data);
    if (groupsRes.data) setPriceGroups(groupsRes.data);
    if (itemsRes.data) setPriceItems(itemsRes.data);
    if (costsRes.data) setPriceCosts(Object.fromEntries(costsRes.data.map(c => [c.price_item_id, c])));
    if (settingsRes.data?.[0]?.value) setLaborUnitPrice(Number(settingsRes.data[0].value));
    setPriceLoaded(true);
  };

  const groupsMap = useMemo(() => Object.fromEntries(priceGroups.map(g => [g.id, g])), [priceGroups]);

  const openNewQuote = async () => {
    await ensurePriceData();
    setEd({ ...blankEd });
    setSearch(""); setCategoryFilter(""); setGroupFilter("");
    setView("edit");
  };

  const openQuote = async q => {
    await ensurePriceData();
    const { data: itemsData } = await supabase.from("quote_items").select("*").eq("quote_id", q.id).order("sort_order");
    const ids = (itemsData || []).map(r => r.id);
    const { data: costsData } = ids.length ? await supabase.from("quote_item_costs").select("*").in("quote_item_id", ids) : { data: [] };
    const costsByItem = Object.fromEntries((costsData || []).map(c => [c.quote_item_id, c]));
    const lines = (itemsData || []).map(r => ({
      key: r.id,
      price_item_id: r.price_item_id,
      line_type: r.line_type,
      group_name: r.group_name,
      name: r.name,
      spec: r.spec || "",
      unit: r.unit || "",
      qty: r.qty,
      sale_price: r.sale_price,
      cost_price: costsByItem[r.id]?.cost_price ?? null,
      cost_confirmed: costsByItem[r.id]?.cost_confirmed ?? false,
      labor_count: r.line_type === "labor" ? (parseFloat(r.spec) || "") : undefined,
    }));
    setEd({ id: q.id, quote_no: q.quote_no, title: q.title, price_set_id: q.price_set_id || "", status: q.status, lines });
    setSearch(""); setCategoryFilter(""); setGroupFilter("");
    setView("edit");
  };

  const delQuote = async id => {
    await supabase.from("quotes").delete().eq("id", id);
    setQuotes(quotes.filter(q => q.id !== id));
  };

  const addItemLine = item => {
    const cost = priceCosts[item.id];
    setEd(prev => ({ ...prev, lines: [...prev.lines, {
      key: newKey(), price_item_id: item.id, line_type: "item",
      group_name: groupsMap[item.price_group_id]?.name || "",
      name: item.name, spec: item.spec || "", unit: item.unit || "",
      qty: 1, sale_price: item.sale_price || 0,
      cost_price: cost?.cost_price ?? null, cost_confirmed: cost?.cost_confirmed ?? false,
    }] }));
  };

  const confirmLaborAdd = () => {
    const count = Number(laborCountInput);
    if (!laborPick || !count || count <= 0) return;
    const cost = priceCosts[laborPick.id];
    setEd(prev => ({ ...prev, lines: [...prev.lines, {
      key: newKey(), price_item_id: laborPick.id, line_type: "labor",
      group_name: groupsMap[laborPick.price_group_id]?.name || "",
      name: laborPick.name, spec: `${count}人工`, unit: "式",
      qty: 1, sale_price: count * laborUnitPrice,
      cost_price: cost?.cost_price ?? null, cost_confirmed: cost?.cost_confirmed ?? false,
      labor_count: count,
    }] }));
    setLaborPick(null); setLaborCountInput("");
  };

  const updateLaborCount = (key, count) => {
    const n = Number(count);
    setEd(prev => ({ ...prev, lines: prev.lines.map(l => l.key === key ? { ...l, labor_count: count, spec: `${count || 0}人工`, sale_price: (n || 0) * laborUnitPrice } : l) }));
  };

  const addManualLine = () => {
    setEd(prev => ({ ...prev, lines: [...prev.lines, {
      key: newKey(), price_item_id: null, line_type: "adjust", group_name: "手入力",
      name: "", spec: "", unit: "式", qty: 1, sale_price: 0, cost_price: null, cost_confirmed: false,
    }] }));
  };

  const updateLine = (key, patch) => setEd(prev => ({ ...prev, lines: prev.lines.map(l => l.key === key ? { ...l, ...patch } : l) }));
  const removeLine = key => setEd(prev => ({ ...prev, lines: prev.lines.filter(l => l.key !== key) }));
  const moveLine = (key, dir) => setEd(prev => {
    const idx = prev.lines.findIndex(l => l.key === key);
    const to = idx + dir;
    if (to < 0 || to >= prev.lines.length) return prev;
    const lines = [...prev.lines];
    [lines[idx], lines[to]] = [lines[to], lines[idx]];
    return { ...prev, lines };
  });

  const total = ed.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.sale_price) || 0), 0);
  const costTotal = ed.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost_price) || 0), 0);
  const gp = total - costTotal;
  const gpRate = total ? (gp / total * 100) : null;
  const hasUnconfirmed = ed.lines.some(l => !l.cost_confirmed || l.cost_price == null);

  const saveQuote = async () => {
    if (!ed.title.trim()) { alert("タイトルを入力してください"); return; }
    if (!ed.price_set_id) { alert("単価セットを選んでください"); return; }
    setSaving(true);
    let quoteId = ed.id;
    const payload = { project_id: quoteProjectId, title: ed.title.trim(), price_set_id: ed.price_set_id, status: ed.status, total_amount: Math.round(total) };
    if (!quoteId) {
      const { data, error } = await supabase.from("quotes").insert([{ ...payload, quote_no: quotes.length + 1 }]).select();
      if (error) { alert("保存に失敗しました: " + error.message); setSaving(false); return; }
      quoteId = data[0].id;
    } else {
      const { error } = await supabase.from("quotes").update(payload).eq("id", quoteId);
      if (error) { alert("保存に失敗しました: " + error.message); setSaving(false); return; }
      await supabase.from("quote_items").delete().eq("quote_id", quoteId);
    }
    if (ed.lines.length) {
      const itemsPayload = ed.lines.map((l, i) => ({
        quote_id: quoteId, price_item_id: l.price_item_id, line_type: l.line_type, group_name: l.group_name,
        name: l.name, spec: l.spec, unit: l.unit, qty: Number(l.qty) || 0, sale_price: Number(l.sale_price) || 0, sort_order: i,
      }));
      const { data: insertedItems, error: itemsErr } = await supabase.from("quote_items").insert(itemsPayload).select();
      if (itemsErr) { alert("明細の保存に失敗しました: " + itemsErr.message); setSaving(false); return; }
      const idBySortOrder = Object.fromEntries(insertedItems.map(r => [r.sort_order, r.id]));
      const costsPayload = ed.lines.map((l, i) => ({
        quote_item_id: idBySortOrder[i], cost_price: l.cost_price, cost_qty: Number(l.qty) || 0, cost_confirmed: !!l.cost_confirmed,
      }));
      const { error: costsErr } = await supabase.from("quote_item_costs").insert(costsPayload);
      if (costsErr) { alert("原価の保存に失敗しました: " + costsErr.message); setSaving(false); return; }
    }
    await loadQuotes();
    setSaving(false);
    setView("list");
  };

  const groupsForSet = priceGroups.filter(g => g.price_set_id === ed.price_set_id);
  const categories = [...new Set(groupsForSet.map(g => g.category))];
  const groupsForCategory = categoryFilter ? groupsForSet.filter(g => g.category === categoryFilter) : groupsForSet;
  const itemsForSet = priceItems.filter(i => i.price_set_id === ed.price_set_id);
  const filteredItems = itemsForSet.filter(i => {
    if (groupFilter && i.price_group_id !== groupFilter) return false;
    if (categoryFilter && !groupFilter) { if (groupsMap[i.price_group_id]?.category !== categoryFilter) return false; }
    if (search) { const t = search.toLowerCase(); if (!(i.name || "").toLowerCase().includes(t) && !(i.spec || "").toLowerCase().includes(t)) return false; }
    return true;
  }).slice(0, 100);

  const hasSetLines = ed.price_set_id && ed.lines.some(l => l.line_type !== "adjust");

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="quotes" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      {view === "list" ? (
        <>
          <Hdr title={`📝 見積 — ${project?.name || ""}`} back={() => nav("projects")} />
          <div style={{ padding: isPC ? "14px 0" : 14 }}>
            {!project ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 20, textAlign: "center", color: "#9CA3AF" }}>案件が選択されていません。案件詳細から開いてください。</div>
            ) : (
              <>
                <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>現在の案件の値(見積は未反映)</div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div><span style={{ fontSize: 12, color: "#6B7280" }}>受注金額 </span><span style={{ fontWeight: 800, color: "#E07B39" }}>{fmt(project.amount)}</span></div>
                    <div><span style={{ fontSize: 12, color: "#6B7280" }}>粗利 </span><span style={{ fontWeight: 800, color: "#059669" }}>{fmt(project.gp)}</span></div>
                  </div>
                </div>

                <button onClick={openNewQuote} style={{ width: "100%", padding: "12px 0", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>＋ 新規見積を作成</button>

                {loadingQuotes ? (
                  <div style={{ textAlign: "center", color: "#9CA3AF", padding: 20 }}>読み込み中...</div>
                ) : quotes.length === 0 ? (
                  <div style={{ background: "#fff", borderRadius: 14, padding: 24, textAlign: "center", color: "#9CA3AF" }}>まだ見積がありません</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {quotes.map(q => {
                      const st = statusStyle(q.status);
                      return (
                        <div key={q.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: "4px solid #1A3A5C", overflow: "hidden" }}>
                          <div onClick={() => openQuote(q)} style={{ padding: "13px 14px", cursor: "pointer" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8, color: "#1F2937" }}>No.{q.quote_no} {q.title}</div>
                              <span style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#E07B39" }}>{fmt(q.total_amount)}</div>
                          </div>
                          <div style={{ display: "flex", borderTop: "1px solid #F3F4F6" }}>
                            <button onClick={() => openQuote(q)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>開く →</button>
                            <button onClick={() => setConf({ msg: `「${q.title}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delQuote(q.id); setConf(null); } })} style={{ padding: "8px 16px", background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <Hdr title={ed.id ? `見積を編集 (No.${ed.quote_no})` : "新規見積を作成"} back={() => setView("list")} />
          <div style={{ padding: isPC ? "14px 0" : 14 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>見積タイトル *</div>
                <input value={ed.title} onChange={e => setEd({ ...ed, title: e.target.value })} placeholder="例: ○○マンション改修工事 見積" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>単価セット *</div>
                  <select value={ed.price_set_id} disabled={hasSetLines} onChange={e => setEd({ ...ed, price_set_id: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: hasSetLines ? "#F3F4F6" : "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
                    <option value="">選択してください</option>
                    {priceSets.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                  </select>
                  {hasSetLines && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>単価表の明細があるため変更できません</div>}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>状態</div>
                  <select value={ed.status} onChange={e => setEd({ ...ed, status: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
                    {QUOTE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {ed.price_set_id && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 10 }}>🔍 単価項目を追加</div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・仕様で検索" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937", marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setGroupFilter(""); }} style={{ flex: 1, minWidth: 140, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
                    <option value="">カテゴリ: すべて</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{ flex: 1, minWidth: 140, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
                    <option value="">グループ: すべて</option>
                    {groupsForCategory.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #F3F4F6", borderRadius: 10 }}>
                  {filteredItems.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>該当する項目がありません</div>}
                  {filteredItems.map(item => (
                    item.item_type === "labor_manual" ? (
                      <div key={item.id} style={{ padding: "9px 12px", borderBottom: "1px solid #F9FAFB" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>👷 {item.name}</div>
                            <div style={{ fontSize: 11, color: "#9CA3AF" }}>{item.spec} ・ 人工数で入力</div>
                          </div>
                          <button onClick={() => { setLaborPick(item); setLaborCountInput(""); }} style={{ background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ 追加</button>
                        </div>
                        {laborPick?.id === item.id && (
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <input type="number" min="0" step="0.5" value={laborCountInput} onChange={e => setLaborCountInput(e.target.value)} placeholder="人工数" style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #E07B39", fontSize: 12, color: "#1F2937" }} />
                            <button onClick={confirmLaborAdd} style={{ background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>確定</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: "1px solid #F9FAFB", gap: 8 }}>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{item.spec}{item.spec ? " ・ " : ""}{fmt(item.sale_price)} / {item.unit}</div>
                        </div>
                        <button onClick={() => addItemLine(item)} style={{ background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ 追加</button>
                      </div>
                    )
                  ))}
                </div>
                <button onClick={addManualLine} style={{ width: "100%", marginTop: 10, padding: "9px 0", background: "#FFF7ED", color: "#9A3412", border: "1.5px dashed #FDBA74", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✎ 単価表にない項目を手入力で追加</button>
              </div>
            )}

            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 10 }}>📋 明細 ({ed.lines.length}件)</div>
              {ed.lines.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>まだ明細がありません</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>項目</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>数量</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>単価</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>金額</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>原価🔒</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ed.lines.map((l, i) => {
                        const amount = (Number(l.qty) || 0) * (Number(l.sale_price) || 0);
                        const lineCostTotal = (Number(l.qty) || 0) * (Number(l.cost_price) || 0);
                        const unconfirmed = !l.cost_confirmed || l.cost_price == null;
                        return (
                          <tr key={l.key} style={{ borderBottom: "1px solid #F9FAFB" }}>
                            <td style={{ padding: "6px 8px" }}>
                              {l.line_type === "adjust" ? (
                                <>
                                  <input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} placeholder="項目名" style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937", marginBottom: 3, boxSizing: "border-box" }} />
                                  <input value={l.spec} onChange={e => updateLine(l.key, { spec: e.target.value })} placeholder="仕様(任意)" style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 11, color: "#6B7280", boxSizing: "border-box" }} />
                                </>
                              ) : (
                                <>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>{l.line_type === "labor" ? "👷 " : ""}{l.name}</div>
                                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{l.spec}</div>
                                </>
                              )}
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              {l.line_type === "labor" ? (
                                <input type="number" min="0" step="0.5" value={l.labor_count} onChange={e => updateLaborCount(l.key, e.target.value)} style={{ width: 64, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                              ) : (
                                <input type="number" min="0" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} style={{ width: 64, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                              )}
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              {l.line_type === "adjust" ? (
                                <input type="number" value={l.sale_price} onChange={e => updateLine(l.key, { sale_price: e.target.value })} style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                              ) : (
                                <span style={{ fontSize: 12, color: "#374151" }}>{fmt(l.sale_price)}</span>
                              )}
                            </td>
                            <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#E07B39", whiteSpace: "nowrap" }}>{fmt(amount)}</td>
                            <td style={{ padding: "6px 8px", fontSize: 11, whiteSpace: "nowrap" }}>
                              {unconfirmed ? <span style={{ color: "#DC2626", fontWeight: 700 }}>未確認</span> : <span style={{ color: "#6B7280" }}>{fmt(lineCostTotal)}</span>}
                            </td>
                            <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>
                              <button onClick={() => moveLine(l.key, -1)} disabled={i === 0} style={{ border: "none", background: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, fontSize: 13 }}>↑</button>
                              <button onClick={() => moveLine(l.key, 1)} disabled={i === ed.lines.length - 1} style={{ border: "none", background: "none", cursor: i === ed.lines.length - 1 ? "default" : "pointer", opacity: i === ed.lines.length - 1 ? 0.3 : 1, fontSize: 13 }}>↓</button>
                              <button onClick={() => removeLine(l.key)} style={{ border: "none", background: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>🗑</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 13, color: "#6B7280" }}>見積合計(税抜)</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#1A3A5C" }}>{fmt(total)}</div>
              </div>
              <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>🔒 社内用(見積書には出しません)</div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>原価合計 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{fmt(costTotal)}</span></div>
                  <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>粗利 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{fmt(gp)}</span></div>
                  <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>粗利率 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{gpRate == null ? "—" : `${gpRate.toFixed(1)}%`}</span></div>
                </div>
                {hasUnconfirmed && <div style={{ marginTop: 8, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 原価が未確認の明細があります。粗利は暫定です</div>}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setView("list")} style={{ flex: 1, padding: "12px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={saveQuote} disabled={saving} style={{ flex: 2, padding: "12px 0", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "保存中..." : "💾 保存する"}</button>
            </div>
          </div>
        </>
      )}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
    </div>
  );
}
