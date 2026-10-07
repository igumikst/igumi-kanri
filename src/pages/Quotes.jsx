import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import GroupTree, { BundleToolbar } from "../components/GroupTree";
import { fmt, todayStr } from "../lib/constants";
import { openQuoteFile, QUOTE_FILE_BUCKET, FILE_TYPES } from "../lib/quoteFiles";
import { computeQuoteFinancials } from "../lib/quoteFinancials";
import { computeAdoptTotals, buildAdoptMessage, buildUnadoptMessage, provisionalWarningLines, adoptQuote as adoptQuoteInDb, unadoptQuote as unadoptQuoteInDb, recalcProjectTotals } from "../lib/quoteAdopt";
import SubQuoteFileReader from "../components/SubQuoteFileReader";
import FileDropZone from "../components/FileDropZone";
import { usePreventWindowFileDrop } from "../lib/useFileDropGuard";

// 見積の状態は、画面上は「発注前」「完工済」の2つだけ。DBの値は既存の制約に合わせる
// (発注前=submitted / 完工済=won)。既存の下書き(draft)・失注(lost)は、画面では発注前と表示する
const QUOTE_STATUS = [
  { key: "submitted", label: "発注前" },
  { key: "won", label: "完工済" },
];
const STATUS_STYLE_DEFAULT = { label: "発注前", bg: "#E0F0FF", text: "#0B4F8A", border: "#60A5FA" };
const STATUS_STYLE_WON = { label: "完工済", bg: "#D1FAE5", text: "#065F46", border: "#34D399" };
const statusStyle = key => (key === "won" ? STATUS_STYLE_WON : STATUS_STYLE_DEFAULT);

const blankEd = { id: null, quote_no: null, title: "", price_set_id: "", status: "submitted", lines: [] };
const newKey = () => "l" + Date.now() + Math.random().toString(36).slice(2);
// quote_no は text 型のため、数字だけを取り出して数として扱う(DB関数 import_quote と同じ考え方)
const quoteNoNum = q => parseInt(String(q.quote_no ?? "").replace(/[^0-9]/g, ""), 10) || 0;

export default function Quotes({ pjs, submittedQuotes, wonQuotes, setWonQuotes, setSubmittedQuotes, setPjs, cos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, quoteProjectId, setQuoteImportCtx }) {
  usePreventWindowFileDrop();
  const project = pjs.find(p => p.id === quoteProjectId);
  const pending = tks.filter(t => !t.done);

  const [view, setView] = useState("list");
  const [quotes, setQuotes] = useState([]);
  const [quoteFiles, setQuoteFiles] = useState([]);
  const [reportFiles, setReportFiles] = useState([]);
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
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [subCosts, setSubCosts] = useState([]); // 下請けの原価(quote_subcontractor_costs)
  const [subForm, setSubForm] = useState({ subcontractor_id: "", amount: "", note: "", file: null });
  const [savingSub, setSavingSub] = useState(false);
  const [showHiddenQuoteFiles, setShowHiddenQuoteFiles] = useState(false); // 第8弾テーマ12①: 非表示のファイルを表示するトグル
  const constructionType = project?.constructionType || "自社のみ";

  const loadQuotes = async () => {
    if (!quoteProjectId) return;
    setLoadingQuotes(true);
    const [{ data }, filesRes, reportFilesRes] = await Promise.all([
      supabase.from("quotes").select("*").eq("project_id", quoteProjectId),
      supabase.from("quote_files").select("*").eq("project_id", quoteProjectId).order("created_at"),
      supabase.from("report_files").select("*").eq("project_id", quoteProjectId),
    ]);
    if (data) setQuotes([...data].sort((a, b) => quoteNoNum(a) - quoteNoNum(b) || String(a.created_at).localeCompare(String(b.created_at))));
    setQuoteFiles(filesRes.data || []); // テーブルが未作成でも、見積一覧はそのまま表示する
    setReportFiles(reportFilesRes.data || []);
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

  const loadSubCosts = async quoteId => {
    const { data } = await supabase.from("quote_subcontractor_costs").select("*").eq("quote_id", quoteId).order("created_at");
    setSubCosts(data || []);
  };

  const openNewQuote = async () => {
    await ensurePriceData();
    setEd({ ...blankEd });
    setSubCosts([]); setSubForm({ subcontractor_id: "", amount: "", note: "", file: null });
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
      is_subcontracted: !!r.is_subcontracted,
      labor_count: r.line_type === "labor" ? (parseFloat(r.spec) || "") : undefined,
      note: r.note || "",
    }));
    setEd({ id: q.id, quote_no: q.quote_no, title: q.title, price_set_id: q.price_set_id || "", status: q.status === "won" ? "won" : "submitted", lines });
    setSubForm({ subcontractor_id: "", amount: "", note: "", file: null });
    await loadSubCosts(q.id);
    setSearch(""); setCategoryFilter(""); setGroupFilter("");
    setView("edit");
  };

  const addSubCost = async () => {
    if (!ed.id) { alert("先に見積を保存してください"); return; }
    if (!subForm.subcontractor_id || !subForm.amount) { alert("下請け会社と金額を入力してください"); return; }
    setSavingSub(true);
    let file_storage_path = null, file_original_name = null;
    if (subForm.file) {
      const ext = (subForm.file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "").toLowerCase();
      const storagePath = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(QUOTE_FILE_BUCKET).upload(storagePath, subForm.file, { contentType: FILE_TYPES[ext], upsert: false });
      if (upErr) { alert("ファイルの保存に失敗しました: " + upErr.message); setSavingSub(false); return; }
      file_storage_path = storagePath; file_original_name = subForm.file.name;
    }
    const { data, error } = await supabase.from("quote_subcontractor_costs").insert([{
      quote_id: ed.id, subcontractor_id: subForm.subcontractor_id, amount: Number(subForm.amount) || 0,
      note: subForm.note || null, file_storage_path, file_original_name,
    }]).select();
    setSavingSub(false);
    if (error) { alert("下請けの原価の保存に失敗しました: " + error.message); return; }
    setSubCosts(prev => [...prev, data[0]]);
    setSubForm({ subcontractor_id: "", amount: "", note: "", file: null });
  };

  const removeSubCost = async id => {
    await supabase.from("quote_subcontractor_costs").delete().eq("id", id);
    setSubCosts(prev => prev.filter(c => c.id !== id));
  };

  // 完工済み(status==="won")の見積を削除したときは、案件のamount/grossProfitを
  // 「残りの完工済み見積の合計」に再計算する(第8弾テーマ16)。発注前の見積は、
  // 案件の金額に入っていないので再計算しない
  const delQuote = async id => {
    const target = quotes.find(q => q.id === id);
    await supabase.from("quotes").delete().eq("id", id);
    setQuotes(quotes.filter(q => q.id !== id));
    removeWonQuote(id);
    removeSubmittedQuote(id);
    if (target?.status === "won") {
      try {
        const projectPatch = await recalcProjectTotals(supabase, quoteProjectId);
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch } : p));
      } catch (e) { alert(e.message); }
    }
  };

  // 見積の元ファイルの非表示・表示に戻す(第8弾テーマ12①)。ファイル本体(Storage)は消さない
  const setQuoteFileHidden = async (id, hidden) => {
    const hidden_at = hidden ? new Date().toISOString() : null;
    const { error } = await supabase.from("quote_files").update({ hidden_at }).eq("id", id);
    if (error) { alert(`${hidden ? "非表示" : "表示に戻す"}処理に失敗しました: ` + error.message); return; }
    setQuoteFiles(prev => prev.map(f => f.id === id ? { ...f, hidden_at } : f));
  };

  const askHideQuoteFile = f => {
    setConf({ msg: `「${f.original_name}」\n\n非表示にしますか？(ファイルは残ります。あとで表示に戻せます)`, okLabel: "非表示にする", onOk: () => { setQuoteFileHidden(f.id, true); setConf(null); } });
  };

  const computeQuoteTotals = quote => computeAdoptTotals(supabase, { quote, constructionType: project?.constructionType || "自社のみ" });

  // ダッシュボード・右パネルの完工日基準の集計(wonQuotes)・案件管理の未発注/発注済み
  // ソート(submittedQuotes)を、画面を再読み込みしなくても最新にするための更新
  // (App.jsxのloadAll()は起動時の1回だけなので、ここで補う)
  const upsertWonQuote = (quoteId, patch) => setWonQuotes(prev => prev.some(q => q.id === quoteId)
    ? prev.map(q => q.id === quoteId ? { ...q, ...patch } : q)
    : [...prev, { id: quoteId, ...patch }]);
  const removeWonQuote = quoteId => setWonQuotes(prev => prev.filter(q => q.id !== quoteId));
  const upsertSubmittedQuote = (quoteId, patch) => setSubmittedQuotes(prev => prev.some(q => q.id === quoteId)
    ? prev.map(q => q.id === quoteId ? { ...q, ...patch } : q)
    : [...prev, { id: quoteId, ...patch }]);
  const removeSubmittedQuote = quoteId => setSubmittedQuotes(prev => prev.filter(q => q.id !== quoteId));

  // 完工日の入力欄(確認ダイアログの中に出す)。defaultValue制御で、ダイアログの再描画なしに最新値をrefで読む
  const completedOnRef = useRef(todayStr());
  const completedOnField = () => {
    completedOnRef.current = todayStr();
    return (
      <div style={{ marginBottom: 14, textAlign: "left" }}>
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>完工日 *</div>
        <input type="date" defaultValue={completedOnRef.current} onChange={e => { completedOnRef.current = e.target.value; }} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, color: "#1F2937", boxSizing: "border-box" }} />
      </div>
    );
  };

  // 「採用にする」= 完工済にする(見積の状態をwonにし、案件の受注金額・粗利にこの見積の分を加える)
  const adoptQuote = async quote => {
    const { total, gp, subMissing, ownUnconfirmed } = await computeQuoteTotals(quote);
    const msg = buildAdoptMessage({ fmt, quoteTitle: quote.title, beforeAmount: project.amount, beforeGp: project.gp, quoteAmount: total, quoteGp: gp, ownUnconfirmed, subMissing });
    setConf({ msg, okLabel: "完工済にする", okColor: "#059669", extra: completedOnField(), onOk: async () => {
      if (!completedOnRef.current) { alert("完工日を入力してください"); return; }
      const completedOn = completedOnRef.current;
      setConf(null);
      try {
        const projectPatch = await adoptQuoteInDb(supabase, { quoteId: quote.id, projectId: quoteProjectId, gp, completedOn });
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch } : p));
        upsertWonQuote(quote.id, { project_id: quoteProjectId, total_amount: quote.total_amount || 0, gross_profit: Math.round(gp), completed_on: completedOn });
        removeSubmittedQuote(quote.id);
      } catch (e) { alert(e.message); }
      await loadQuotes();
    } });
  };

  const unadoptQuote = quote => {
    setConf({ msg: buildUnadoptMessage(quote.title), okLabel: "発注前に戻す", okColor: "#9A3412", onOk: async () => {
      setConf(null);
      try {
        const projectPatch = await unadoptQuoteInDb(supabase, { quoteId: quote.id, projectId: quoteProjectId });
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch } : p));
        removeWonQuote(quote.id);
        upsertSubmittedQuote(quote.id, { project_id: quoteProjectId });
      } catch (e) { alert(e.message); }
      await loadQuotes();
    } });
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
  const setLines = newLines => setEd(prev => ({ ...prev, lines: newLines }));
  const toggleSelect = key => setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const total = ed.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.sale_price) || 0), 0);
  const subAmountTotal = subCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const financials = computeQuoteFinancials({
    constructionType, saleTotal: total,
    lines: ed.lines.map(l => ({ qty: l.qty, costPrice: l.cost_price, costConfirmed: l.cost_confirmed, isSubcontracted: l.is_subcontracted })),
    subAmountTotal, subCount: subCosts.length,
  });
  const { costTotal, gp, gpRate, provisional: hasUnconfirmed, subMissing, ownUnconfirmed } = financials;

  // 状態を「完工済」にして保存する場合は、採用(案件のamount/grossProfit・statusへの反映)も
  // あわせて行う。「発注前」に戻す場合は、採用を解除する。どちらも確認ダイアログを先に出す
  const saveQuote = () => {
    if (!ed.title.trim()) { alert("タイトルを入力してください"); return; }
    if (!ed.price_set_id) { alert("単価セットを選んでください"); return; }
    const prevQuote = ed.id ? quotes.find(q => q.id === ed.id) : null;
    const becomingDone = ed.status === "won";
    const leavingDone = !!prevQuote?.is_adopted && !becomingDone;
    if (becomingDone) {
      const msg = buildAdoptMessage({ fmt, quoteTitle: ed.title.trim(), beforeAmount: project.amount, beforeGp: project.gp, quoteAmount: total, quoteGp: gp, ownUnconfirmed, subMissing });
      setConf({ msg, okLabel: "完工済にする", okColor: "#059669", extra: completedOnField(), onOk: () => {
        if (!completedOnRef.current) { alert("完工日を入力してください"); return; }
        setConf(null); persistQuote({ adopt: true, completedOn: completedOnRef.current });
      } });
      return;
    }
    if (leavingDone) {
      setConf({ msg: buildUnadoptMessage(ed.title.trim()), okLabel: "発注前に戻す", okColor: "#9A3412", onOk: () => { setConf(null); persistQuote({ unadopt: true }); } });
      return;
    }
    persistQuote({});
  };

  const persistQuote = async ({ adopt, unadopt, completedOn }) => {
    setSaving(true);
    let quoteId = ed.id;
    const payload = { project_id: quoteProjectId, title: ed.title.trim(), price_set_id: ed.price_set_id, status: ed.status, total_amount: Math.round(total) };
    if (!quoteId) {
      const { data, error } = await supabase.from("quotes").insert([{ ...payload, quote_no: String(Math.max(0, ...quotes.map(quoteNoNum)) + 1) }]).select();
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
        is_subcontracted: !!l.is_subcontracted,
        ...(l.note ? { note: l.note } : {}), // 備考(見積ファイルから取り込んだ行)。ない行は送らない
      }));
      const { data: insertedItems, error: itemsErr } = await supabase.from("quote_items").insert(itemsPayload).select();
      if (itemsErr) { alert("明細の保存に失敗しました: " + itemsErr.message); setSaving(false); return; }
      const idBySortOrder = Object.fromEntries(insertedItems.map(r => [r.sort_order, r.id]));
      const costsPayload = ed.lines.map((l, i) => ({
        quote_item_id: idBySortOrder[i], cost_price: l.cost_price == null || l.cost_price === "" ? null : Number(l.cost_price), cost_qty: Number(l.qty) || 0, cost_confirmed: !!l.cost_confirmed,
      }));
      const { error: costsErr } = await supabase.from("quote_item_costs").insert(costsPayload);
      if (costsErr) { alert("原価の保存に失敗しました: " + costsErr.message); setSaving(false); return; }
    }
    try {
      if (adopt) {
        const projectPatch = await adoptQuoteInDb(supabase, { quoteId, projectId: quoteProjectId, gp, completedOn });
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch } : p));
        upsertWonQuote(quoteId, { project_id: quoteProjectId, total_amount: Math.round(total), gross_profit: Math.round(gp), completed_on: completedOn });
      } else if (unadopt) {
        const projectPatch = await unadoptQuoteInDb(supabase, { quoteId, projectId: quoteProjectId });
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch } : p));
        removeWonQuote(quoteId);
      }
      // 見積の最終的な状態(ed.status)にあわせて、未発注(submittedQuotes)側も同期する。
      // 新規作成・編集での保存(adopt/unadoptを経ない場合)もここで一括して反映される
      if (ed.status === "won") removeSubmittedQuote(quoteId);
      else upsertSubmittedQuote(quoteId, { project_id: quoteProjectId });
    } catch (e) { alert(e.message); }
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
  const subcontractors = cos.filter(c => c.type === "協力業者");
  const isMixed = constructionType === "自社+下請け";
  const isSubOnly = constructionType === "下請けのみ";
  const showSubCheckCol = isMixed;
  const showCostCol = !isSubOnly;
  const leafColumnCount = 4 + (showSubCheckCol ? 1 : 0) + (showCostCol ? 1 : 0);

  // 非表示(hidden_at)のファイルは、一覧・「元ファイル」ボタンの対象から外す(第8弾テーマ12①)
  const visibleQuoteFiles = quoteFiles.filter(f => !f.hidden_at);
  const hiddenQuoteFiles = quoteFiles.filter(f => f.hidden_at);

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="quotes" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} submittedQuotes={submittedQuotes} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} wonQuotes={wonQuotes} submittedQuotes={submittedQuotes} />}
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
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>{quotes.some(q => q.is_adopted) ? "現在の案件の値(採用中の見積を反映済み)" : "現在の案件の値(見積は未反映)"}</div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div><span style={{ fontSize: 12, color: "#6B7280" }}>受注金額 </span><span style={{ fontWeight: 800, color: "#E07B39" }}>{fmt(project.amount)}</span></div>
                    <div><span style={{ fontSize: 12, color: "#6B7280" }}>粗利 </span><span style={{ fontWeight: 800, color: "#059669" }}>{fmt(project.gp)}</span></div>
                  </div>
                </div>

                <button onClick={openNewQuote} style={{ width: "100%", padding: "12px 0", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>＋ 新規見積を作成</button>
                <button onClick={() => { setQuoteImportCtx({ from: "quotes", projectId: quoteProjectId }); nav("quoteImport"); }} style={{ width: "100%", padding: "10px 0", background: "#fff", color: "#1A3A5C", border: "1.5px dashed #94A3B8", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: -6, marginBottom: 14 }}>📥 見積ファイルから登録</button>

                {loadingQuotes ? (
                  <div style={{ textAlign: "center", color: "#9CA3AF", padding: 20 }}>読み込み中...</div>
                ) : quotes.length === 0 ? (
                  <div style={{ background: "#fff", borderRadius: 14, padding: 24, textAlign: "center", color: "#9CA3AF" }}>まだ見積がありません</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {quotes.map(q => {
                      const st = statusStyle(q.status);
                      // 第8弾テーマ10: 取り込みの古い不具合で、status=won なのにis_adopted=falseの見積が残っていることがある。
                      // 自動では直さず、気づけるように注意バッジ+ボタンの強調だけ行う
                      const isUnadoptedWon = q.status === "won" && !q.is_adopted;
                      return (
                        <div key={q.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: `4px solid ${isUnadoptedWon ? "#DC2626" : "#1A3A5C"}`, overflow: "hidden" }}>
                          <div onClick={() => openQuote(q)} style={{ padding: "13px 14px", cursor: "pointer" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8, color: "#1F2937" }}>No.{q.quote_no} {q.title}</div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                {q.is_adopted && <span style={{ background: "#D1FAE5", color: "#065F46", border: "1px solid #34D399", borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>✅ 採用中</span>}
                                <span style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span>
                              </div>
                            </div>
                            {isUnadoptedWon && <div style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, marginBottom: 5, display: "inline-block" }}>⚠️ 未採用(売上に未反映)</div>}
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#E07B39" }}>{fmt(q.total_amount)}</div>
                            {q.applied_rates?.rate != null && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>掛け率 ×{Number.isInteger(q.applied_rates.rate) ? q.applied_rates.rate.toFixed(1) : q.applied_rates.rate}</div>}
                            {(() => { const n = reportFiles.filter(f => f.quote_id === q.id && !f.hidden_at).length; return <div style={{ fontSize: 10, color: n ? "#059669" : "#9CA3AF", marginTop: 2 }}>{n ? `📎 報告書あり(${n}件)` : "報告書なし"}</div>; })()}
                          </div>
                          <div style={{ display: "flex", borderTop: "1px solid #F3F4F6" }}>
                            <button onClick={() => openQuote(q)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>開く →</button>
                            {q.is_adopted ? (
                              <button onClick={() => unadoptQuote(q)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#9A3412", fontWeight: 700, cursor: "pointer" }}>採用を解除</button>
                            ) : (
                              <button onClick={() => adoptQuote(q)} style={isUnadoptedWon
                                ? { flex: 1, padding: "8px 0", background: "#059669", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#fff", fontWeight: 800, cursor: "pointer" }
                                : { flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#059669", fontWeight: 700, cursor: "pointer" }}>✅ 採用にする</button>
                            )}
                            {visibleQuoteFiles.filter(f => f.quote_id === q.id).map(f => (
                              <div key={f.id} style={{ display: "flex", alignItems: "center", borderRight: "1px solid #F3F4F6" }}>
                                <button onClick={() => openQuoteFile(f)} title={f.original_name} style={{ padding: "8px 10px", background: "none", border: "none", fontSize: 12, color: "#2563EB", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📎 元ファイル</button>
                                <button onClick={() => askHideQuoteFile(f)} title="非表示にする" style={{ padding: "8px 8px", background: "none", border: "none", fontSize: 13, color: "#9CA3AF", cursor: "pointer" }}>🙈</button>
                              </div>
                            ))}
                            <button onClick={() => setConf({ msg: q.status === "won" ? `「${q.title}」\n\n完工済みの見積です。削除すると、案件の売上・粗利から外れます。\n\nこの操作は元に戻せません。\n削除しますか？` : `「${q.title}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delQuote(q.id); setConf(null); } })} style={{ padding: "8px 16px", background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {quoteFiles.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginTop: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 8 }}>📎 見積の元ファイル</div>
                    {visibleQuoteFiles.length === 0 && <div style={{ fontSize: 12, color: "#9CA3AF", padding: "7px 0" }}>表示中のファイルはありません</div>}
                    {visibleQuoteFiles.map(f => {
                      const q = quotes.find(x => x.id === f.quote_id);
                      return (
                        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid #F3F4F6" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", wordBreak: "break-all" }}>📗 {f.original_name}</div>
                            <div style={{ fontSize: 11, color: "#9CA3AF" }}>{q ? `見積 No.${q.quote_no}` : "見積は削除済み"} ・ {String(f.created_at || "").slice(0, 10)}{f.size ? ` ・ ${Math.ceil(f.size / 1024)}KB` : ""}</div>
                          </div>
                          <button onClick={() => openQuoteFile(f)} style={{ background: "#EFF6FF", color: "#2563EB", border: "1.5px solid #BFDBFE", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>開く</button>
                          <button onClick={() => askHideQuoteFile(f)} style={{ background: "#fff", color: "#6B7280", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>非表示にする</button>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px solid #F3F4F6" }}>
                      <input type="checkbox" id="showHiddenQuoteFiles" checked={showHiddenQuoteFiles} onChange={e => setShowHiddenQuoteFiles(e.target.checked)} />
                      <label htmlFor="showHiddenQuoteFiles" style={{ fontSize: 11, color: "#6B7280", cursor: "pointer" }}>非表示のファイルを表示({hiddenQuoteFiles.length}件)</label>
                    </div>
                    {showHiddenQuoteFiles && hiddenQuoteFiles.map(f => {
                      const q = quotes.find(x => x.id === f.quote_id);
                      return (
                        <div key={f.id} style={{ background: "#F3F4F6", borderRadius: 8, padding: "8px 10px", marginTop: 6, display: "flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", wordBreak: "break-all" }}>📗 {f.original_name}</div>
                            <div style={{ fontSize: 11, color: "#9CA3AF" }}>{q ? `見積 No.${q.quote_no}` : "見積は削除済み"} ・ {String(f.created_at || "").slice(0, 10)}{f.size ? ` ・ ${Math.ceil(f.size / 1024)}KB` : ""} ・ 非表示</div>
                          </div>
                          <button onClick={() => openQuoteFile(f)} style={{ background: "#EFF6FF", color: "#2563EB", border: "1.5px solid #BFDBFE", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>開く</button>
                          <button onClick={() => setQuoteFileHidden(f.id, false)} style={{ background: "#EFF6FF", color: "#1A3A5C", border: "1.5px solid #BFDBFE", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>表示に戻す</button>
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
                  <BundleToolbar lines={ed.lines} onChange={setLines} selectedKeys={selectedKeys} setSelectedKeys={setSelectedKeys} />
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>⠿をドラッグ、または↑↓・📂(このグループに移す)で並べ替え・グループ分けができます</div>
                  <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}></th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>項目</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>数量</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>単価</th>
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>金額</th>
                        {showSubCheckCol && <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "center" }}>下請け施工</th>}
                        {showCostCol && <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left" }}>原価単価🔒</th>}
                        <th style={{ padding: "6px 8px", fontSize: 11, color: "#6B7280" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      <GroupTree
                        lines={ed.lines}
                        onChange={setLines}
                        amountOf={l => (Number(l.qty) || 0) * (Number(l.sale_price) || 0)}
                        formatAmount={fmt}
                        columnCount={leafColumnCount}
                        selectedKeys={selectedKeys}
                        onToggleSelect={toggleSelect}
                        onDeleteLeaf={removeLine}
                        renderLeafCells={(l) => {
                          const amount = (Number(l.qty) || 0) * (Number(l.sale_price) || 0);
                          const lineCostTotal = (Number(l.qty) || 0) * (Number(l.cost_price) || 0);
                          const unconfirmed = !l.cost_confirmed || l.cost_price == null;
                          const excluded = isMixed && l.is_subcontracted;
                          const cells = [
                            <td key="item" style={{ padding: "6px 8px" }}>
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
                              {l.note && <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>備考: {l.note}</div>}
                            </td>,
                            <td key="qty" style={{ padding: "6px 8px" }}>
                              {l.line_type === "labor" ? (
                                <input type="number" min="0" step="0.5" value={l.labor_count} onChange={e => updateLaborCount(l.key, e.target.value)} style={{ width: 64, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                              ) : (
                                <input type="number" min="0" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} style={{ width: 64, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                              )}
                            </td>,
                            <td key="price" style={{ padding: "6px 8px" }}>
                              {l.line_type !== "labor" ? (
                                <input type="number" value={l.sale_price} onChange={e => updateLine(l.key, { sale_price: e.target.value })} style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                              ) : (
                                <span style={{ fontSize: 12, color: "#374151" }}>{fmt(l.sale_price)}</span>
                              )}
                            </td>,
                            <td key="amount" style={{ padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#E07B39", whiteSpace: "nowrap" }}>{fmt(amount)}</td>,
                          ];
                          if (showSubCheckCol) {
                            cells.push(
                              <td key="subflag" style={{ padding: "6px 8px", textAlign: "center" }}>
                                <input type="checkbox" checked={!!l.is_subcontracted} onChange={e => updateLine(l.key, { is_subcontracted: e.target.checked })} />
                              </td>
                            );
                          }
                          if (showCostCol) {
                            cells.push(
                              <td key="cost" style={{ padding: "6px 8px", fontSize: 11, whiteSpace: "nowrap" }}>
                                {excluded ? (
                                  <span style={{ color: "#9CA3AF" }}>下請け施工(対象外)</span>
                                ) : (
                                  <>
                                    {/* 原価単価を直すと、その行は「確認済み」になる。空にすると未入力に戻る */}
                                    <input type="number" value={l.cost_price ?? ""} placeholder="未入力" onChange={e => updateLine(l.key, e.target.value === "" ? { cost_price: null, cost_confirmed: false } : { cost_price: e.target.value, cost_confirmed: true })} style={{ width: 80, padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${unconfirmed ? "#FCA5A5" : "#E5E7EB"}`, fontSize: 12, color: "#1F2937" }} />
                                    <div style={{ marginTop: 2 }}>{unconfirmed ? <span style={{ color: "#DC2626", fontWeight: 700 }}>未確認</span> : <span style={{ color: "#6B7280" }}>計 {fmt(lineCostTotal)}</span>}</div>
                                  </>
                                )}
                              </td>
                            );
                          }
                          return cells;
                        }}
                      />
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {constructionType !== "自社のみ" && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 10 }}>🏗 下請けの原価 ({subCosts.length}件)</div>
                {subCosts.length === 0 && <div style={{ padding: "8px 0", fontSize: 12, color: "#9CA3AF" }}>まだ登録されていません(粗利は暫定になります)</div>}
                {subCosts.map(c => {
                  const subCo = cos.find(x => x.id === c.subcontractor_id);
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid #F3F4F6" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{subCo?.name || "不明な会社"}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{fmt(c.amount)}{c.note ? ` ・ ${c.note}` : ""}</div>
                      </div>
                      {c.file_storage_path && <button onClick={() => openQuoteFile({ storage_path: c.file_storage_path, original_name: c.file_original_name })} style={{ background: "#EFF6FF", color: "#2563EB", border: "1.5px solid #BFDBFE", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📎 {c.file_original_name}</button>}
                      <button onClick={() => removeSubCost(c.id)} style={{ background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "1px solid #F3F4F6" }}>
                  <select value={subForm.subcontractor_id} onChange={e => setSubForm({ ...subForm, subcontractor_id: e.target.value })} style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#FAFAFA", color: "#1F2937" }}>
                    <option value="">下請け会社を選択</option>
                    {subcontractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input type="number" value={subForm.amount} onChange={e => setSubForm({ ...subForm, amount: e.target.value })} placeholder="金額(税抜)" style={{ width: 120, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                  <input value={subForm.note} onChange={e => setSubForm({ ...subForm, note: e.target.value })} placeholder="備考(任意)" style={{ flex: 1, minWidth: 140, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
                  <FileDropZone
                    onFiles={files => { const f = files[0]; if (!f) return; if (!/\.pdf$/i.test(f.name)) { alert("PDFファイルを落としてください"); return; } setSubForm({ ...subForm, file: f }); }}
                    activeLabel="PDFをここに落とす" style={{ display: "inline-block" }}
                  >
                    <input type="file" accept=".xls,.xlsx,.pdf" onChange={e => setSubForm({ ...subForm, file: e.target.files?.[0] || null })} style={{ fontSize: 11 }} />
                  </FileDropZone>
                  <button onClick={addSubCost} disabled={savingSub} style={{ background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: savingSub ? "default" : "pointer", opacity: savingSub ? 0.6 : 1 }}>{savingSub ? "追加中..." : "+ 追加"}</button>
                </div>
                <SubQuoteFileReader
                  file={subForm.file} subcontractors={subcontractors} hasCompanySelected={!!subForm.subcontractor_id}
                  onPickAmount={v => setSubForm(f => ({ ...f, amount: String(v) }))}
                  onPickCompany={id => setSubForm(f => ({ ...f, subcontractor_id: id }))}
                />
                {!ed.id && <div style={{ fontSize: 11, color: "#9A3412", marginTop: 6 }}>※ 先に見積を保存すると、下請けの原価を追加できます</div>}
              </div>
            )}

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
                {hasUnconfirmed && provisionalWarningLines({ ownUnconfirmed, subMissing }).map(line => (
                  <div key={line} style={{ marginTop: 8, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>{line}</div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setView("list")} style={{ flex: 1, padding: "12px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={saveQuote} disabled={saving} style={{ flex: 2, padding: "12px 0", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "保存中..." : "💾 保存する"}</button>
            </div>
          </div>
        </>
      )}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} okLabel={conf.okLabel} okColor={conf.okColor} extra={conf.extra} />}
    </div>
  );
}
