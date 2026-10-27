import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import GroupTree, { BundleToolbar } from "../components/GroupTree";
import PriceMultiPicker from "../components/PriceMultiPicker";
import { fmt, todayStr } from "../lib/constants";
import { DENSITY, loadDensityKey, saveDensityKey } from "../lib/quoteTableDensity";
import { listGroupPaths } from "../lib/groupTree";
import { openQuoteFile, QUOTE_FILE_BUCKET, FILE_TYPES, fileIcon } from "../lib/quoteFiles";
import { computeQuoteFinancials } from "../lib/quoteFinancials";
import { computeAdoptTotals, buildAdoptMessage, buildUnadoptMessage, provisionalWarningLines, adoptQuote as adoptQuoteInDb, unadoptQuote as unadoptQuoteInDb, recalcProjectTotals, confirmQuoteProfit, unconfirmQuoteProfit } from "../lib/quoteAdopt";
import SubQuoteFileReader from "../components/SubQuoteFileReader";
import CrewPicker from "../components/CrewPicker";
import FileDropZone from "../components/FileDropZone";
import { usePreventWindowFileDrop } from "../lib/useFileDropGuard";
import { describeError } from "../lib/errorMessage";
import { CONSTRUCTION_TYPES } from "../lib/quoteFinancials";
import { defaultOwnCrewId } from "../lib/crews";
import { loadQuoteForExport } from "../lib/quoteExport/loadQuoteForExport";
import { exportQuoteXlsx } from "../lib/quoteExport/buildQuoteXlsx";
import { exportQuotePdf } from "../lib/quoteExport/buildQuotePdf";
import { applyRate, MARKUP_CHOICE_OPTIONS, CUSTOM_RATE_MIN, CUSTOM_RATE_MAX, resolveMarkupChoice, rateFromChoice, resolveDefaultMarkupFor } from "../lib/quoteImport/markup";

// 見積の状態は、画面上は「発注前」「完工済」の2つだけ。DBの値は既存の制約に合わせる
// (発注前=submitted / 完工済=won)。既存の下書き(draft)・失注(lost)は、画面では発注前と表示する
const QUOTE_STATUS = [
  { key: "submitted", label: "発注前" },
  { key: "won", label: "完工済" },
];
const STATUS_STYLE_DEFAULT = { label: "発注前", bg: "#E0F0FF", text: "#0B4F8A", border: "#60A5FA" };
const STATUS_STYLE_WON = { label: "完工済", bg: "#D1FAE5", text: "#065F46", border: "#34D399" };
const statusStyle = key => (key === "won" ? STATUS_STYLE_WON : STATUS_STYLE_DEFAULT);

const blankEd = { id: null, quote_no: null, title: "", price_set_id: "", status: "submitted", construction_type: "自社のみ", crew_id: "", profit_confirmed: false, rate_choice: null, rate_custom: "", applied_rates: null, lines: [] };
// 見積の掛け率(販売の単価 = 100%の単価 × 掛け率)。未選択は null
const edRate = e => rateFromChoice(e.rate_choice, e.rate_custom);
const rateLabel = r => (r == null ? "未選択" : `×${Number.isInteger(r) ? r.toFixed(1) : r}`);
// 100%の単価(base_price)。空(取り込み・ノート見積作成で入った行、手入力の行)は今の単価と同じとして扱う
const baseOf = l => (l.base_price === null || l.base_price === undefined || l.base_price === "" ? Number(l.sale_price) || 0 : Number(l.base_price) || 0);
// 単価表から入れた行で、単価が「100%の単価 × 掛け率」のままの行(手で単価を直していない行)。掛け率を変えたら計算し直す対象
const followsRate = (l, rate) => (l.line_type === "item" || l.line_type === "labor") && !!l.price_item_id
  && l.base_price !== null && l.base_price !== undefined && l.base_price !== ""
  && (Number(l.sale_price) || 0) === applyRate(l.base_price, rate);
const newKey = () => "l" + Date.now() + Math.random().toString(36).slice(2);
// quote_no は text 型のため、数字だけを取り出して数として扱う(DB関数 import_quote と同じ考え方)
const quoteNoNum = q => parseInt(String(q.quote_no ?? "").replace(/[^0-9]/g, ""), 10) || 0;
// 見積書の出力(Excel/PDF)で「保存していない変更」があるかを見るための、保存される項目だけの写し
const savedSnapshot = e => JSON.stringify({
  title: e.title, price_set_id: e.price_set_id, status: e.status, construction_type: e.construction_type, crew_id: e.crew_id, rate: edRate(e),
  lines: e.lines.map(l => [l.group_name, l.name, l.spec, l.unit, Number(l.qty) || 0, Number(l.sale_price) || 0, baseOf(l), l.note || "", l.cost_price ?? null, !!l.cost_confirmed, !!l.is_subcontracted]),
});

export default function Quotes({ branches, pjs, submittedQuotes, wonQuotes, setWonQuotes, setSubmittedQuotes, setPjs, cos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, quoteProjectId, setQuoteImportCtx, setOpenProjectId, crews, setCrews, openQuoteId, setOpenQuoteId }) {
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
  // 班の初期値を「自社」にする処理(第8弾テーマ21-A追加)で、ユーザーが班を手で選んだかどうかを覚えておく
  const crewTouchedRef = useRef(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [laborPick, setLaborPick] = useState(null);
  const [laborCountInput, setLaborCountInput] = useState("");
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  // 明細の表の見た目(コンパクト/ゆったり。端末に覚える)と、グループの折りたたみ(画面の中だけ。DBには保存しない)
  const [densityKey, setDensityKey] = useState(() => loadDensityKey(isPC));
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showPricePicker, setShowPricePicker] = useState(false); // 「単価項目を追加」は、ふだんは閉じておく
  // 単価表の今の名前(price_item_id → { name, spec })。単価表から入れた行の品名・規格を編集したとき、
  // 「単価表: ○○」と「↩ 単価表の名前にする」を出すために使う(DBには何も足さない。単価表も変えない)
  const [catalog, setCatalog] = useState({});
  const [noteOpen, setNoteOpen] = useState(() => new Set()); // コンパクトで備考の入力欄を開いている行
  const [multiAdd, setMultiAdd] = useState(null); // 「＋まとめて追加」の画面。開いているときは { target: 最初の入れ先 }
  const [subCosts, setSubCosts] = useState([]); // 下請けの原価(quote_subcontractor_costs)
  const [subForm, setSubForm] = useState({ subcontractor_id: "", amount: "", note: "", file: null });
  const [savingSub, setSavingSub] = useState(false);
  const [exporting, setExporting] = useState(null); // 見積書の出力中: "xlsx" | "pdf" | null
  const openQuoteRef = useRef(null); // ノート見積作成から来たとき、loadQuotes の中で openQuote を呼ぶため
  const openedSnapRef = useRef(null); // 編集画面を開いたときの保存済みの状態(savedSnapshot)
  const [showHiddenQuoteFiles, setShowHiddenQuoteFiles] = useState(false); // 第8弾テーマ12①: 非表示のファイルを表示するトグル
  // 施工形態は見積ごとに持つ(第8弾テーマ21)。案件の値は新規見積の初期値としてだけ使う
  const constructionType = ed.construction_type || "自社のみ";

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
    // ノート見積作成で登録した見積は、一覧ではなく編集画面を直接開く(一度だけ)
    const target = openQuoteId && (data || []).find(q => q.id === openQuoteId);
    if (target) { setOpenQuoteId?.(null); openQuoteRef.current?.(target); }
  };
  useEffect(() => { loadQuotes(); }, [quoteProjectId]);
  // crews の読み込みがまだで班の初期値を入れられなかった新規見積に、読み込み完了後に「自社」を入れる。
  // ユーザーが何か選んでいたら(未設定を含む)上書きしない(第8弾テーマ21-A追加)
  useEffect(() => {
    setEd(prev => {
      if (prev.id !== null || crewTouchedRef.current || prev.crew_id) return prev;
      const defaultCrewId = defaultOwnCrewId(crews);
      return defaultCrewId ? { ...prev, crew_id: defaultCrewId, profit_confirmed: true } : prev;
    });
  }, [crews]);

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
    crewTouchedRef.current = false;
    // 班の初期値は「自社」(第8弾テーマ21-A追加)。自社の見積として作るので、粗利も最初から確定扱い
    const defaultCrewId = defaultOwnCrewId(crews);
    const mk = resolveDefaultMarkupFor({ clientId: project?.clientId, branchId: project?.branchId, cos, branches });
    setEd({ ...blankEd, construction_type: project?.constructionType || "自社のみ", crew_id: defaultCrewId, profit_confirmed: !!defaultCrewId,
      rate_choice: mk?.choice ?? null, rate_custom: mk?.choice === "custom" ? String(mk.rate) : "", rate_source: mk?.source || "" });
    setSubCosts([]); setSubForm({ subcontractor_id: "", amount: "", note: "", file: null });
    setSearch(""); setCategoryFilter(""); setGroupFilter("");
    setCollapsed(new Set()); setShowPricePicker(false); setSelectedKeys(new Set()); setNoteOpen(new Set()); // 見積を開くたびに、グループは全部開いた状態から
    setView("edit");
  };

  const openQuote = async q => {
    await ensurePriceData();
    const { data: itemsData } = await supabase.from("quote_items").select("*").eq("quote_id", q.id).order("sort_order");
    const ids = (itemsData || []).map(r => r.id);
    const { data: costsData } = ids.length ? await supabase.from("quote_item_costs").select("*").in("quote_item_id", ids) : { data: [] };
    const costsByItem = Object.fromEntries((costsData || []).map(c => [c.quote_item_id, c]));
    const pids = [...new Set((itemsData || []).map(r => r.price_item_id).filter(Boolean))];
    const { data: catData } = pids.length ? await supabase.from("price_items").select("id,name,spec").in("id", pids) : { data: [] };
    setCatalog(Object.fromEntries((catData || []).map(c => [c.id, { name: c.name || "", spec: c.spec || "" }])));
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
      base_price: r.base_price ?? null,
      cost_price: costsByItem[r.id]?.cost_price ?? null,
      cost_confirmed: costsByItem[r.id]?.cost_confirmed ?? false,
      is_subcontracted: !!r.is_subcontracted,
      labor_count: r.line_type === "labor" ? (parseFloat(r.spec) || "") : undefined,
      note: r.note || "",
    }));
    const ar = q.applied_rates || null;
    const mk = ar?.choice && MARKUP_CHOICE_OPTIONS.some(o => o.key === ar.choice) && rateFromChoice(ar.choice, ar.rate) != null
      ? { choice: ar.choice, rate: ar.rate } : (resolveMarkupChoice(ar?.rate) || { choice: "none", rate: 1 });
    const openedEd = { id: q.id, quote_no: q.quote_no, title: q.title, price_set_id: q.price_set_id || "", status: q.status === "won" ? "won" : "submitted", construction_type: q.construction_type || "自社のみ", crew_id: q.crew_id || "", profit_confirmed: !!q.profit_confirmed,
      rate_choice: mk.choice, rate_custom: mk.choice === "custom" ? String(mk.rate) : "", applied_rates: ar, rate_source: ar ? "" : "今までの見積(1.0扱い)", lines };
    openedSnapRef.current = savedSnapshot(openedEd);
    setEd(openedEd);
    setSubForm({ subcontractor_id: "", amount: "", note: "", file: null });
    await loadSubCosts(q.id);
    setSearch(""); setCategoryFilter(""); setGroupFilter("");
    setCollapsed(new Set()); setShowPricePicker(false); setSelectedKeys(new Set()); setNoteOpen(new Set()); // 見積を開くたびに、グループは全部開いた状態から
    setView("edit");
  };

  // 見積書の出力(Excel/PDF)。いつもDBから最新のデータを読み直して作る(原価は読まない)
  const exportQuote = async (kind, quoteId) => {
    if (exporting) return;
    setExporting(kind);
    const t0 = performance.now();
    try {
      const model = await loadQuoteForExport(supabase, quoteId);
      if (kind === "xlsx") await exportQuoteXlsx(model);
      else await exportQuotePdf(model);
      console.info(`[見積書の出力] ${kind} ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      alert(e?.message ? `見積書を出力できませんでした。
${e.message}` : "見積書を出力できませんでした。");
    } finally {
      setExporting(null);
    }
  };
  const exportFromEditor = kind => {
    if (!ed.id || savedSnapshot(ed) !== openedSnapRef.current) { alert("保存していない変更があります。先に保存してください。"); return; }
    exportQuote(kind, ed.id);
  };
  const exportBtnStyle = { padding: "8px 10px", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };

  // loadQuotes(この関数より前に定義)から openQuote を呼ぶための参照
  useEffect(() => { openQuoteRef.current = openQuote; });
  const addSubCost = async () => {
    if (!ed.id) { alert("先に見積を保存してください"); return; }
    if (!subForm.subcontractor_id || !subForm.amount) { alert("下請け会社と金額を入力してください"); return; }
    setSavingSub(true);
    let file_storage_path = null, file_original_name = null;
    if (subForm.file) {
      const ext = (subForm.file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "").toLowerCase();
      const storagePath = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(QUOTE_FILE_BUCKET).upload(storagePath, subForm.file, { contentType: FILE_TYPES[ext], upsert: false });
      if (upErr) { alert(describeError(upErr, "ファイルの保存")); setSavingSub(false); return; }
      file_storage_path = storagePath; file_original_name = subForm.file.name;
    }
    const { data, error } = await supabase.from("quote_subcontractor_costs").insert([{
      quote_id: ed.id, subcontractor_id: subForm.subcontractor_id, amount: Number(subForm.amount) || 0,
      note: subForm.note || null, file_storage_path, file_original_name,
    }]).select();
    setSavingSub(false);
    if (error) { alert(describeError(error, "下請けの原価の保存")); return; }
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
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch, updated_at: new Date().toISOString() } : p));
      } catch (e) { alert(e.message); }
    }
  };

  // 見積の元ファイルの非表示・表示に戻す(第8弾テーマ12①)。ファイル本体(Storage)は消さない
  const setQuoteFileHidden = async (id, hidden) => {
    const hidden_at = hidden ? new Date().toISOString() : null;
    const { error } = await supabase.from("quote_files").update({ hidden_at }).eq("id", id);
    if (error) { alert(describeError(error, hidden ? "非表示処理" : "表示に戻す処理")); return; }
    setQuoteFiles(prev => prev.map(f => f.id === id ? { ...f, hidden_at } : f));
  };

  const askHideQuoteFile = f => {
    setConf({ msg: `「${f.original_name}」\n\n非表示にしますか？(ファイルは残ります。あとで表示に戻せます)`, okLabel: "非表示にする", onOk: () => { setQuoteFileHidden(f.id, true); setConf(null); } });
  };

  const computeQuoteTotals = quote => computeAdoptTotals(supabase, { quote, constructionType: quote.construction_type || "自社のみ" });

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
    const msg = buildAdoptMessage({ fmt, quoteTitle: quote.title, beforeAmount: project.amount, beforeGp: project.gp, quoteAmount: total, quoteGp: gp, ownUnconfirmed, subMissing, crewUnset: !quote.crew_id });
    setConf({ msg, okLabel: "完工済にする", okColor: "#059669", extra: completedOnField(), onOk: async () => {
      if (!completedOnRef.current) { alert("完工日を入力してください"); return; }
      const completedOn = completedOnRef.current;
      setConf(null);
      try {
        const projectPatch = await adoptQuoteInDb(supabase, { quoteId: quote.id, projectId: quoteProjectId, gp, completedOn });
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch, updated_at: new Date().toISOString() } : p));
        upsertWonQuote(quote.id, { project_id: quoteProjectId, total_amount: quote.total_amount || 0, gross_profit: Math.round(gp), completed_on: completedOn, profit_confirmed: !!quote.profit_confirmed, crew_id: quote.crew_id || null });
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
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch, updated_at: new Date().toISOString() } : p));
        removeWonQuote(quote.id);
        upsertSubmittedQuote(quote.id, { project_id: quoteProjectId });
      } catch (e) { alert(e.message); }
      await loadQuotes();
    } });
  };

  const rememberCatalog = item => setCatalog(prev => ({ ...prev, [item.id]: { name: item.name || "", spec: item.spec || "" } }));
  // 単価表の項目から明細の行を作る(原価は単価表の原価をコピー)。group_name は入れ先の大項目
  const makeItemLine = (item, groupName, qty) => {
    const cost = priceCosts[item.id];
    return {
      key: newKey(), price_item_id: item.id, line_type: "item",
      group_name: groupName,
      name: item.name, spec: item.spec || "", unit: item.unit || "",
      qty, base_price: Number(item.sale_price) || 0, sale_price: applyRate(item.sale_price || 0, edRate(ed) ?? 1),
      cost_price: cost?.cost_price ?? null, cost_confirmed: cost?.cost_confirmed ?? false,
    };
  };
  const makeLaborLine = (item, groupName, count) => {
    const cost = priceCosts[item.id];
    return {
      key: newKey(), price_item_id: item.id, line_type: "labor",
      group_name: groupName,
      name: item.name, spec: `${count}人工`, unit: "式",
      qty: 1, base_price: count * laborUnitPrice, sale_price: applyRate(count * laborUnitPrice, edRate(ed) ?? 1),
      cost_price: cost?.cost_price ?? null, cost_confirmed: cost?.cost_confirmed ?? false,
      labor_count: count,
    };
  };
  const addItemLine = item => {
    rememberCatalog(item);
    const line = makeItemLine(item, groupsMap[item.price_group_id]?.name || "", 1);
    setEd(prev => ({ ...prev, lines: [...prev.lines, line] }));
  };

  const confirmLaborAdd = () => {
    const count = Number(laborCountInput);
    if (!laborPick || !count || count <= 0) return;
    rememberCatalog(laborPick);
    const line = makeLaborLine(laborPick, groupsMap[laborPick.price_group_id]?.name || "", count);
    setEd(prev => ({ ...prev, lines: [...prev.lines, line] }));
    setLaborPick(null); setLaborCountInput("");
  };

  // 「＋まとめて追加」の結果を入れる。入れ先の大項目の最後の行(中項目の中も含む)の直後に、選んだ順で差し込む。
  // 入れ先がまだ無い(新しい大項目)ときは、明細の最後に足す。閉じている大項目に入れたときは開く
  const addPicksToGroup = ({ target, picks }) => {
    picks.forEach(p => rememberCatalog(p.item));
    const newLines = picks.map(p => (p.item.item_type === "labor_manual" ? makeLaborLine(p.item, target, p.qty) : makeItemLine(p.item, target, p.qty)));
    setEd(prev => {
      const inTarget = l => { const g = l.group_name || ""; return g === target || g.startsWith(target + " > "); };
      let last = -1;
      prev.lines.forEach((l, i) => { if (inTarget(l)) last = i; });
      const lines = last === -1 ? [...prev.lines, ...newLines] : [...prev.lines.slice(0, last + 1), ...newLines, ...prev.lines.slice(last + 1)];
      return { ...prev, lines };
    });
    setCollapsed(prev => {
      const next = new Set([...prev].filter(p => !(target === p || target.startsWith(p + " > "))));
      return next.size === prev.size ? prev : next;
    });
    setMultiAdd(null);
  };

  const updateLaborCount = (key, count) => {
    const n = Number(count);
    setEd(prev => ({ ...prev, lines: prev.lines.map(l => l.key === key ? { ...l, labor_count: count, spec: `${count || 0}人工`, base_price: (n || 0) * laborUnitPrice, sale_price: applyRate((n || 0) * laborUnitPrice, edRate(prev) ?? 1) } : l) }));
  };

  // 掛け率を変える。単価表から入れた行のうち、手で単価を直していない行だけを「100%の単価 × 新しい掛け率」に計算し直す。
  // 計算し直す行があるときは、先に確認を出す。手入力の行・手で直した行・取り込みの行は変えない
  const changeRate = (choice, custom = "") => {
    const newRate = rateFromChoice(choice, custom);
    if (newRate == null) return;
    const oldRate = edRate(ed) ?? 1;
    const apply = () => setEd(prev => ({
      ...prev, rate_choice: choice, rate_custom: choice === "custom" ? String(custom) : "", rate_source: "",
      lines: prev.lines.map(l => (followsRate(l, oldRate) ? { ...l, sale_price: applyRate(l.base_price, newRate) } : l)),
    }));
    const targets = ed.lines.filter(l => followsRate(l, oldRate) && applyRate(l.base_price, newRate) !== (Number(l.sale_price) || 0));
    if (!targets.length) { apply(); return; }
    const kept = ed.lines.length - ed.lines.filter(l => followsRate(l, oldRate)).length;
    setConf({
      msg: `掛け率を ${rateLabel(edRate(ed))} から ${rateLabel(newRate)} に変えます。\n\n単価表から入れた行のうち、単価を手で直していない ${targets.length}行の単価を「100%の単価 × ${newRate}」に計算し直します。` + (kept ? `\n手入力の行・手で単価を直した行・取り込んだ行(${kept}行)は変えません。` : ""),
      okLabel: "計算し直す", okColor: "#1A3A5C", onOk: () => { setConf(null); apply(); },
    });
  };

  const addManualLine = () => {
    setEd(prev => ({ ...prev, lines: [...prev.lines, {
      key: newKey(), price_item_id: null, line_type: "adjust", group_name: "手入力",
      name: "", spec: "", unit: "式", qty: 1, sale_price: 0, cost_price: null, cost_confirmed: false,
    }] }));
  };

  // 単価表から入れた行(item・labor)の、単価表の今の名前。手入力の行は無し
  const catalogOf = l => (l.price_item_id && (l.line_type === "item" || l.line_type === "labor") ? catalog[l.price_item_id] || null : null);
  // 単価表の名前と違うか(人工は品名だけ比べる。規格の「○人工」は人工数から作るので比べない)
  const differsFromCatalog = (l, c) => !!c && (l.line_type === "labor" ? l.name !== c.name : (l.name !== c.name || (l.spec || "") !== (c.spec || "")));
  const resetToCatalog = (l, c) => updateLine(l.key, l.line_type === "labor" ? { name: c.name } : { name: c.name, spec: c.spec || "" });
  const toggleNote = key => setNoteOpen(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const priceHint = l => (l.price_item_id && l.line_type === "item"
    ? (followsRate(l, edRate(ed) ?? 1) ? `100%の単価 ${fmt(baseOf(l))} × 掛け率 ${edRate(ed) ?? 1}` : `手で直した単価・取り込んだ単価(100%の単価として記録: ${fmt(baseOf(l))})。掛け率を変えても変わりません`)
    : "");
  const updateLine = (key, patch) => setEd(prev => ({ ...prev, lines: prev.lines.map(l => l.key === key ? { ...l, ...patch } : l) }));
  const removeLine = key => setEd(prev => ({ ...prev, lines: prev.lines.filter(l => l.key !== key) }));
  const setLines = newLines => setEd(prev => ({ ...prev, lines: newLines }));
  // 閉じたグループの中に入っている行か(入れ子も含む)
  const hiddenBy = (set, groupName) => { const g = groupName || ""; for (const p of set) if (g === p || g.startsWith(p + " > ")) return true; return false; };
  // 並び替え・グループ分けの結果を反映する。見えていた行が、閉じたグループの中に入ったときは、そのグループを自動で開く
  // (閉じたまま中に入って見えなくなる事故を防ぐ)。名前が変わって無くなったグループの開閉の記録は片付ける
  const onTreeChange = newLines => {
    setCollapsed(prev => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter(p => listGroupPaths(newLines).includes(p)));
      const before = new Map(ed.lines.map(l => [l.key, l.group_name || ""]));
      for (const l of newLines) {
        const was = before.get(l.key);
        if (was === undefined || hiddenBy(prev, was)) continue; // もともと見えていなかった行は対象外
        if (hiddenBy(next, l.group_name)) for (const p of [...next]) if ((l.group_name || "") === p || (l.group_name || "").startsWith(p + " > ")) next.delete(p);
      }
      return next;
    });
    setLines(newLines);
  };
  const toggleGroup = path => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path);
    else {
      next.add(path);
      // 閉じるグループの中の行は、選択(まとめる用のチェック)から外す(見えない行がまとめられないように)
      setSelectedKeys(sel => new Set([...sel].filter(k => !hiddenBy(next, ed.lines.find(l => l.key === k)?.group_name))));
    }
    return next;
  });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => { const all = new Set(listGroupPaths(ed.lines)); setCollapsed(all); setSelectedKeys(sel => new Set([...sel].filter(k => !hiddenBy(all, ed.lines.find(l => l.key === k)?.group_name)))); };
  const changeDensity = key => { setDensityKey(key); saveDensityKey(key); };
  const toggleSelect = key => setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const total = ed.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.sale_price) || 0), 0);
  const subAmountTotal = subCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const financials = computeQuoteFinancials({
    constructionType, saleTotal: total,
    lines: ed.lines.map(l => ({ qty: l.qty, costPrice: l.cost_price, costConfirmed: l.cost_confirmed, isSubcontracted: l.is_subcontracted })),
    subAmountTotal, subCount: subCosts.length,
  });
  const { costTotal, gp, gpRate, provisional: hasUnconfirmed, subMissing, ownUnconfirmed } = financials;

  // 班を変えたとき、is_own(自社かどうか)が実際に変わった場合だけprofit_confirmedを自動で変える。
  // 自社以外→別の自社以外(is_ownはfalseのまま)は、今の値を維持する(第8弾テーマ21)
  const onCrewChange = newCrewId => {
    crewTouchedRef.current = true;
    const oldIsOwn = !!crews.find(c => c.id === ed.crew_id)?.is_own;
    const newIsOwn = !!crews.find(c => c.id === newCrewId)?.is_own;
    setEd(prev => ({ ...prev, crew_id: newCrewId, profit_confirmed: oldIsOwn !== newIsOwn ? newIsOwn : prev.profit_confirmed }));
  };

  // 粗利を手で確定にする/未確定に戻す(第8弾テーマ21)。保存とは別に、その場でDBへ反映する
  const doConfirmProfit = async () => {
    try {
      const projectPatch = await confirmQuoteProfit(supabase, { quoteId: ed.id, projectId: quoteProjectId });
      setEd(prev => ({ ...prev, profit_confirmed: true }));
      setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch, updated_at: new Date().toISOString() } : p));
      upsertWonQuote(ed.id, { profit_confirmed: true });
    } catch (e) { alert(e.message); }
  };
  const confirmProfit = () => {
    if (hasUnconfirmed) { setConf({ msg: "原価が未確認です。それでも確定しますか？", okLabel: "確定する", okColor: "#059669", onOk: () => { setConf(null); doConfirmProfit(); } }); return; }
    doConfirmProfit();
  };
  const unconfirmProfit = async () => {
    try {
      const projectPatch = await unconfirmQuoteProfit(supabase, { quoteId: ed.id, projectId: quoteProjectId });
      setEd(prev => ({ ...prev, profit_confirmed: false }));
      setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch, updated_at: new Date().toISOString() } : p));
      upsertWonQuote(ed.id, { profit_confirmed: false });
    } catch (e) { alert(e.message); }
  };

  // 状態を「完工済」にして保存する場合は、採用(案件のamount/grossProfit・statusへの反映)も
  // あわせて行う。「発注前」に戻す場合は、採用を解除する。どちらも確認ダイアログを先に出す
  const saveQuote = () => {
    if (!ed.title.trim()) { alert("タイトルを入力してください"); return; }
    if (!ed.price_set_id) { alert("単価セットを選んでください"); return; }
    if (edRate(ed) == null) { alert(ed.rate_choice === "custom" ? `掛け率は${CUSTOM_RATE_MIN}〜${CUSTOM_RATE_MAX}の範囲で入力してください` : "掛け率を選んでください"); return; }
    const emptyNameCount = ed.lines.filter(l => !String(l.name || "").trim()).length;
    if (emptyNameCount) alert(`品名が空の行が ${emptyNameCount} 件あります。このまま保存します(あとで直せます)`);
    const prevQuote = ed.id ? quotes.find(q => q.id === ed.id) : null;
    // 「すでに完工済み(採用済み)だったか」は is_adopted で判定する(第8弾テーマ10の不具合で、
    // status=won なのにis_adopted=falseの見積が残っていることがあるため。その場合は従来通り、
    // 明示的な採用の確認を通す=becomingDoneになる)
    const wasWon = !!prevQuote?.is_adopted;
    const becomingDone = ed.status === "won" && !wasWon; // 発注前→完工済のときだけ
    const leavingDone = wasWon && ed.status !== "won"; // 完工済→発注前のときだけ
    if (becomingDone) {
      const msg = buildAdoptMessage({ fmt, quoteTitle: ed.title.trim(), beforeAmount: project.amount, beforeGp: project.gp, quoteAmount: total, quoteGp: gp, ownUnconfirmed, subMissing, crewUnset: !ed.crew_id });
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
    // 完工済みのまま編集して保存(班・施工形態・明細・金額など)。採用の確認は出さず、
    // 金額・粗利の再計算だけ行う(第8弾テーマ21-A 不具合修正)。
    // completed_on・is_adopted・案件のstatusは触らない
    persistQuote({ recalcOnly: wasWon && ed.status === "won" });
  };

  const persistQuote = async ({ adopt, unadopt, recalcOnly, completedOn }) => {
    setSaving(true);
    let quoteId = ed.id;
    // construction_type・crew_id・profit_confirmedは保存のたびに今のed(編集状態)の値を書き込むが、
    // profit_confirmed自体は「班を変更してis_ownが変わったとき」だけ変わる値なので、
    // 明細・金額だけの編集では実質触らないことになる(第8弾テーマ21)
    const payload = { project_id: quoteProjectId, title: ed.title.trim(), price_set_id: ed.price_set_id, status: ed.status, total_amount: Math.round(total), construction_type: ed.construction_type || "自社のみ", crew_id: ed.crew_id || null, profit_confirmed: !!ed.profit_confirmed,
      // 使った掛け率。取り込みで入っていた他の記録(ESTの出力率など)は残す
      applied_rates: { ...(ed.applied_rates || {}), rate: edRate(ed), choice: ed.rate_choice } };
    if (!quoteId) {
      const { data, error } = await supabase.from("quotes").insert([{ ...payload, quote_no: String(Math.max(0, ...quotes.map(quoteNoNum)) + 1) }]).select();
      if (error) { alert(describeError(error, "保存")); setSaving(false); return; }
      quoteId = data[0].id;
    } else {
      const { error } = await supabase.from("quotes").update(payload).eq("id", quoteId);
      if (error) { alert(describeError(error, "保存")); setSaving(false); return; }
      await supabase.from("quote_items").delete().eq("quote_id", quoteId);
    }
    if (ed.lines.length) {
      const itemsPayload = ed.lines.map((l, i) => ({
        quote_id: quoteId, price_item_id: l.price_item_id, line_type: l.line_type, group_name: l.group_name,
        name: l.name, spec: l.spec, unit: l.unit, qty: Number(l.qty) || 0, sale_price: Number(l.sale_price) || 0, sort_order: i,
        base_price: l.line_type === "adjust" ? Number(l.sale_price) || 0 : baseOf(l), // 100%の単価。手入力の行は入れた単価と同じ
        is_subcontracted: !!l.is_subcontracted,
        ...(l.note ? { note: l.note } : {}), // 備考(取り込んだ行・画面で入れた行)。ない行は送らない
      }));
      const { data: insertedItems, error: itemsErr } = await supabase.from("quote_items").insert(itemsPayload).select();
      if (itemsErr) { alert(describeError(itemsErr, "明細の保存")); setSaving(false); return; }
      const idBySortOrder = Object.fromEntries(insertedItems.map(r => [r.sort_order, r.id]));
      const costsPayload = ed.lines.map((l, i) => ({
        quote_item_id: idBySortOrder[i], cost_price: l.cost_price == null || l.cost_price === "" ? null : Number(l.cost_price), cost_qty: Number(l.qty) || 0, cost_confirmed: !!l.cost_confirmed,
      }));
      const { error: costsErr } = await supabase.from("quote_item_costs").insert(costsPayload);
      if (costsErr) { alert(describeError(costsErr, "原価の保存")); setSaving(false); return; }
    }
    try {
      if (adopt) {
        const projectPatch = await adoptQuoteInDb(supabase, { quoteId, projectId: quoteProjectId, gp, completedOn });
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch, updated_at: new Date().toISOString() } : p));
        upsertWonQuote(quoteId, { project_id: quoteProjectId, total_amount: Math.round(total), gross_profit: Math.round(gp), completed_on: completedOn, profit_confirmed: !!ed.profit_confirmed, crew_id: ed.crew_id || null });
      } else if (unadopt) {
        const projectPatch = await unadoptQuoteInDb(supabase, { quoteId, projectId: quoteProjectId });
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch, updated_at: new Date().toISOString() } : p));
        removeWonQuote(quoteId);
      } else if (recalcOnly) {
        // 完工済みのまま編集したときは、採用時と同じ計算でgross_profitを書き直してから、
        // 案件の受注金額・粗利だけを再計算する。completed_on・is_adopted・案件のstatusは触らない
        const { error: gpErr } = await supabase.from("quotes").update({ gross_profit: Math.round(gp) }).eq("id", quoteId);
        if (gpErr) throw new Error(describeError(gpErr, "粗利の更新"));
        const projectPatch = await recalcProjectTotals(supabase, quoteProjectId);
        setPjs(prev => prev.map(p => p.id === quoteProjectId ? { ...p, ...projectPatch, updated_at: new Date().toISOString() } : p));
        upsertWonQuote(quoteId, { total_amount: Math.round(total), gross_profit: Math.round(gp), profit_confirmed: !!ed.profit_confirmed, crew_id: ed.crew_id || null });
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
  const subcontractors = cos.filter(c => c.type === "協力業者" || c.type === "両方");
  const isMixed = constructionType === "自社+下請け";
  const isSubOnly = constructionType === "下請けのみ";
  const showSubCheckCol = isMixed;
  const showCostCol = !isSubOnly;
  const leafColumnCount = 4 + (showSubCheckCol ? 1 : 0) + (showCostCol ? 1 : 0);
  const density = DENSITY[isPC ? densityKey : "cozy"]; // スマホはいつも「ゆったり」(今の縦積み)
  const compactPC = isPC && density.oneLine;
  const hasGroups = ed.lines.some(l => l.group_name);
  // 原価が「未入力・未確認」の行(原価の欄を出している施工形態だけ。下請け施工の行は対象外=今の原価欄と同じ考え方)
  const costMissing = l => showCostCol && !(isMixed && l.is_subcontracted) && (!l.cost_confirmed || l.cost_price == null);
  const groupInfo = node => {
    let count = 0, warnCount = 0;
    (function walk(n) { for (const c of n.children) { if (c.isGroup) walk(c); else { count++; if (costMissing(c.line)) warnCount++; } } })(node);
    return { count, warnCount };
  };

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
          <Hdr title={`📝 見積 — ${project?.name || ""}`} back={() => { if (quoteProjectId) setOpenProjectId(quoteProjectId); nav("projects"); }} />
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
                            {(() => { const n = reportFiles.filter(f => f.quote_id === q.id && !f.hidden_at).length; return <div style={{ fontSize: 10, color: n ? "#059669" : "#9CA3AF", marginTop: 2 }}>{n ? `📸 報告書あり(${n}件)` : "報告書なし"}</div>; })()}
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
                            <button onClick={() => exportQuote("xlsx", q.id)} disabled={!!exporting} style={{ ...exportBtnStyle, opacity: exporting ? 0.5 : 1 }}>{exporting === "xlsx" ? "作成中..." : "📤 Excel"}</button>
                            <button onClick={() => exportQuote("pdf", q.id)} disabled={!!exporting} style={{ ...exportBtnStyle, opacity: exporting ? 0.5 : 1 }}>{exporting === "pdf" ? "作成中..." : "📄 PDF"}</button>
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
                <RateField key={ed.id || "new"} ed={ed} onChange={changeRate} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>状態</div>
                  <select value={ed.status} onChange={e => setEd({ ...ed, status: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
                    {QUOTE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>施工形態</div>
                  <select value={ed.construction_type || "自社のみ"} onChange={e => setEd({ ...ed, construction_type: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" }}>
                    {CONSTRUCTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>班(誰が施工したか)</div>
                  <CrewPicker crewId={ed.crew_id} crews={crews} setCrews={setCrews} onChange={onCrewChange} />
                </div>
              </div>
            </div>

            {ed.price_set_id && !showPricePicker && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button onClick={() => setShowPricePicker(true)} style={{ flex: 2, padding: "10px 0", background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>＋ 単価表から追加</button>
                <button onClick={() => setMultiAdd({ target: "" })} style={{ flex: 2, padding: "10px 0", background: "#fff", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>☑ まとめて追加</button>
                <button onClick={addManualLine} style={{ flex: 1, padding: "10px 0", background: "#FFF7ED", color: "#9A3412", border: "1.5px dashed #FDBA74", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✎ 手入力で追加</button>
              </div>
            )}
            {ed.price_set_id && showPricePicker && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C" }}>🔍 単価項目を追加</div>
                  <button onClick={() => setShowPricePicker(false)} style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "3px 10px", fontSize: 12, color: "#6B7280", cursor: "pointer" }}>閉じる ▲</button>
                </div>
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", flex: 1 }}>📋 明細 ({ed.lines.length}件)</div>
                {hasGroups && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={expandAll} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#374151", cursor: "pointer" }}>▼ 全部開く</button>
                    <button onClick={collapseAll} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#374151", cursor: "pointer" }}>▶ 全部閉じる</button>
                  </div>
                )}
                {isPC && (
                  <div style={{ display: "flex", border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden" }}>
                    {["compact", "cozy"].map(k => (
                      <button key={k} onClick={() => changeDensity(k)} style={{ background: densityKey === k ? "#1A3A5C" : "#fff", color: densityKey === k ? "#fff" : "#374151", border: "none", padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{DENSITY[k].label}</button>
                    ))}
                  </div>
                )}
              </div>
              {ed.lines.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>まだ明細がありません</div>
              ) : (
                <div>
                  <BundleToolbar lines={ed.lines} onChange={setLines} selectedKeys={selectedKeys} setSelectedKeys={setSelectedKeys} />
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>⠿をドラッグ、または↑↓・📂(このグループに移す)で並べ替え・グループ分けができます</div>
                  <div style={compactPC ? { maxHeight: "calc(100vh - 150px)", overflow: "auto", border: "1px solid #F3F4F6", borderRadius: 8 } : { overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: compactPC ? 760 : 640, borderCollapse: "collapse" }}>
                    <thead>
                      {(() => {
                        // PCのコンパクトは、見出しを箱の上に固定する
                        const h = (align = "left", extra = {}) => ({ padding: density.oneLine ? "5px 4px" : "6px 8px", fontSize: 11, color: "#6B7280", textAlign: align, whiteSpace: "nowrap", ...(compactPC ? { position: "sticky", top: 0, zIndex: 3, background: "#fff", boxShadow: "inset 0 -2px 0 #F3F4F6" } : {}), ...extra });
                        const num = density.oneLine ? "right" : "left";
                        return (
                          <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                            <th style={h()}></th>
                            <th style={h()}>{density.oneLine ? "品名・規格" : "項目"}</th>
                            <th style={h(num)}>数量</th>
                            <th style={h(num)}>単価</th>
                            <th style={h(num)}>金額</th>
                            {showSubCheckCol && <th style={h("center")}>{density.oneLine ? "下請" : "下請け施工"}</th>}
                            {showCostCol && <th style={h()}>原価単価🔒</th>}
                            <th style={h()}></th>
                          </tr>
                        );
                      })()}
                    </thead>
                    <tbody>
                      <GroupTree
                        lines={ed.lines}
                        onChange={onTreeChange}
                        density={density}
                        collapsedPaths={collapsed}
                        onToggleGroup={toggleGroup}
                        groupInfo={groupInfo}
                        onAddToGroup={ed.price_set_id ? path => setMultiAdd({ target: path }) : undefined}
                        amountOf={l => (Number(l.qty) || 0) * (Number(l.sale_price) || 0)}
                        formatAmount={fmt}
                        columnCount={leafColumnCount}
                        selectedKeys={selectedKeys}
                        onToggleSelect={toggleSelect}
                        onDeleteLeaf={removeLine}
                        renderLeafCells={(l, { depth } = {}) => {
                          const amount = (Number(l.qty) || 0) * (Number(l.sale_price) || 0);
                          const lineCostTotal = (Number(l.qty) || 0) * (Number(l.cost_price) || 0);
                          const unconfirmed = !l.cost_confirmed || l.cost_price == null;
                          const excluded = isMixed && l.is_subcontracted;
                          if (density.oneLine) {
                            const d = density;
                            const cin = { padding: d.inputPad, borderRadius: 5, border: "1px solid #E5E7EB", fontSize: d.fontSize, color: "#1F2937", boxSizing: "border-box", height: 22 };
                            const ctd = { padding: d.cellPad, verticalAlign: "middle", fontSize: d.fontSize, color: "#1F2937", lineHeight: d.lineHeight };
                            const fullText = [l.name, l.spec].filter(Boolean).join(" ") + (l.note ? ` / 備考: ${l.note}` : "");
                            const out = [
                              <td key="item" title={fullText} style={{ ...ctd, maxWidth: 0, width: "100%", paddingLeft: 4 + (depth || 0) * 12 }}>
                                {(() => {
                                  const c = catalogOf(l);
                                  const diff = differsFromCatalog(l, c);
                                  const catText = c ? [c.name, c.spec].filter(Boolean).join(" ") : "";
                                  return (
                                    <>
                                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                        {l.line_type === "labor" && <span>👷</span>}
                                        <input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} placeholder="品名" style={{ ...cin, flex: 3, minWidth: 0, fontWeight: 700, borderColor: c ? "#BFDBFE" : "#E5E7EB" }} />
                                        {l.line_type === "labor" ? (
                                          <span style={{ color: "#9CA3AF", whiteSpace: "nowrap" }}>{l.spec}</span>
                                        ) : (
                                          <input value={l.spec} onChange={e => updateLine(l.key, { spec: e.target.value })} placeholder="規格(任意)" style={{ ...cin, flex: 2, minWidth: 0, color: "#6B7280", borderColor: c ? "#BFDBFE" : "#E5E7EB" }} />
                                        )}
                                        <button type="button" onClick={() => toggleNote(l.key)} title={l.note ? `備考: ${l.note}(押すと編集)` : "備考を入れる"} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, padding: "0 1px", opacity: l.note || noteOpen.has(l.key) ? 1 : 0.35 }}>📝</button>
                                      </div>
                                      {/* 単価表の名前と違う行だけ、下に1段足す(品名の欄を狭くしないため) */}
                                      {diff && (
                                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 1, fontSize: 10, color: "#6B7280" }}>
                                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>単価表: {catText}</span>
                                          <button type="button" onClick={() => resetToCatalog(l, c)} style={{ border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", borderRadius: 4, cursor: "pointer", fontSize: 10, padding: "0 4px", whiteSpace: "nowrap", lineHeight: "14px" }}>↩ 単価表の名前にする</button>
                                        </div>
                                      )}
                                      {noteOpen.has(l.key) && (
                                        <input value={l.note || ""} onChange={e => updateLine(l.key, { note: e.target.value })} placeholder="備考(任意)" style={{ ...cin, width: "100%", marginTop: 2, color: "#374151" }} />
                                      )}
                                    </>
                                  );
                                })()}
                              </td>,
                              <td key="qty" style={{ ...ctd, whiteSpace: "nowrap", textAlign: "right" }}>
                                {l.line_type === "labor" ? (
                                  <input type="number" min="0" step="0.5" value={l.labor_count} onChange={e => updateLaborCount(l.key, e.target.value)} title="人工数" style={{ ...cin, width: d.qtyWidth, textAlign: "right" }} />
                                ) : (
                                  <input type="number" min="0" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} style={{ ...cin, width: d.qtyWidth, textAlign: "right" }} />
                                )}
                              </td>,
                              <td key="price" style={{ ...ctd, whiteSpace: "nowrap", textAlign: "right" }}>
                                {l.line_type !== "labor" ? (
                                  <input type="number" value={l.sale_price} onChange={e => updateLine(l.key, { sale_price: e.target.value })} title={priceHint(l)} style={{ ...cin, width: d.priceWidth, textAlign: "right" }} />
                                ) : (
                                  <span style={{ color: "#374151" }}>{fmt(l.sale_price)}</span>
                                )}
                              </td>,
                              <td key="amount" style={{ ...ctd, fontWeight: 700, color: "#E07B39", whiteSpace: "nowrap", textAlign: "right" }}>{fmt(amount)}</td>,
                            ];
                            if (showSubCheckCol) {
                              out.push(
                                <td key="subflag" style={{ ...ctd, textAlign: "center", width: 32 }}>
                                  <input type="checkbox" checked={!!l.is_subcontracted} onChange={e => updateLine(l.key, { is_subcontracted: e.target.checked })} style={{ margin: 0, verticalAlign: "middle" }} />
                                </td>
                              );
                            }
                            if (showCostCol) {
                              out.push(
                                <td key="cost" style={{ ...ctd, fontSize: 11, whiteSpace: "nowrap" }}>
                                  {excluded ? (
                                    <span style={{ color: "#9CA3AF" }}>下請け施工(対象外)</span>
                                  ) : (
                                    <>
                                      {/* 原価単価を直すと、その行は「確認済み」になる。空にすると未入力に戻る */}
                                      <input type="number" value={l.cost_price ?? ""} placeholder="未入力" onChange={e => updateLine(l.key, e.target.value === "" ? { cost_price: null, cost_confirmed: false } : { cost_price: e.target.value, cost_confirmed: true })} style={{ ...cin, width: d.costWidth, textAlign: "right", borderColor: unconfirmed ? "#FCA5A5" : "#E5E7EB" }} />
                                      <span style={{ marginLeft: 4, fontSize: 10 }}>{unconfirmed ? <span style={{ color: "#DC2626", fontWeight: 700 }}>未確認</span> : <span style={{ color: "#6B7280" }}>計 {fmt(lineCostTotal)}</span>}</span>
                                    </>
                                  )}
                                </td>
                              );
                            }
                            return out;
                          }
                          const cells = [
                            <td key="item" style={{ padding: "6px 8px" }}>
                              {(() => {
                                const c = catalogOf(l);
                                const diff = differsFromCatalog(l, c);
                                const border = `1.5px solid ${c ? "#BFDBFE" : "#E5E7EB"}`;
                                return (
                                  <>
                                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 3 }}>
                                      {l.line_type === "labor" && <span>👷</span>}
                                      <input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} placeholder="品名" style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border, fontSize: 12, fontWeight: 700, color: "#1F2937", boxSizing: "border-box" }} />
                                    </div>
                                    {l.line_type === "labor" ? (
                                      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>{l.spec}</div>
                                    ) : (
                                      <input value={l.spec} onChange={e => updateLine(l.key, { spec: e.target.value })} placeholder="規格(任意)" style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border, fontSize: 11, color: "#6B7280", boxSizing: "border-box", marginBottom: 3 }} />
                                    )}
                                    <input value={l.note || ""} onChange={e => updateLine(l.key, { note: e.target.value })} placeholder="備考(任意)" style={{ width: "100%", padding: "3px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 10, color: "#374151", boxSizing: "border-box" }} />
                                    {diff && (
                                      <div style={{ fontSize: 10, color: "#6B7280", marginTop: 3, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                        <span>単価表: {[c.name, c.spec].filter(Boolean).join(" ")}</span>
                                        <button type="button" onClick={() => resetToCatalog(l, c)} style={{ border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", borderRadius: 4, cursor: "pointer", fontSize: 10, padding: "1px 6px" }}>↩ 単価表の名前にする</button>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
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
                                <input type="number" value={l.sale_price} onChange={e => updateLine(l.key, { sale_price: e.target.value })} title={priceHint(l)} style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937" }} />
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
                      {c.file_storage_path && <button onClick={() => openQuoteFile({ storage_path: c.file_storage_path, original_name: c.file_original_name })} style={{ background: "#EFF6FF", color: "#2563EB", border: "1.5px solid #BFDBFE", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{fileIcon(c.file_original_name)} {c.file_original_name}</button>}
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
                    onFiles={files => { const f = files[0]; if (!f) return; if (!/\.(pdf|xlsx|xls)$/i.test(f.name)) { alert("PDFまたはExcel(.xlsx/.xls)のファイルを落としてください"); return; } setSubForm({ ...subForm, file: f }); }}
                    activeLabel="PDFかExcelをここに落とす" style={{ display: "inline-block" }}
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
                {ed.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ed.profit_confirmed ? "#059669" : "#DC2626" }}>{ed.profit_confirmed ? "✅ 粗利は確定済みです" : "⚠️ 粗利は未確定です"}</span>
                    {ed.profit_confirmed ? (
                      <button type="button" onClick={unconfirmProfit} style={{ background: "#fff", color: "#9A3412", border: "1.5px solid #FDBA74", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>未確定に戻す</button>
                    ) : (
                      <button type="button" onClick={confirmProfit} style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>粗利を確定にする</button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={() => exportFromEditor("xlsx")} disabled={!!exporting} style={{ flex: 1, padding: "10px 0", background: "#fff", border: "1.5px solid #1A3A5C", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#1A3A5C", opacity: exporting ? 0.5 : 1 }}>{exporting === "xlsx" ? "作成中..." : "📤 Excelで出力"}</button>
              <button onClick={() => exportFromEditor("pdf")} disabled={!!exporting} style={{ flex: 1, padding: "10px 0", background: "#fff", border: "1.5px solid #1A3A5C", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#1A3A5C", opacity: exporting ? 0.5 : 1 }}>{exporting === "pdf" ? "作成中..." : "📄 PDFで出力"}</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setView("list")} style={{ flex: 1, padding: "12px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={saveQuote} disabled={saving} style={{ flex: 2, padding: "12px 0", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "保存中..." : "💾 保存する"}</button>
            </div>
          </div>
        </>
      )}
      {multiAdd && (
        <PriceMultiPicker items={itemsForSet} groups={groupsForSet} groupsMap={groupsMap} groupPaths={listGroupPaths(ed.lines)}
          initialTarget={multiAdd.target} lines={ed.lines} laborUnitPrice={laborUnitPrice} rate={edRate(ed) ?? 1} isPC={isPC}
          onClose={() => setMultiAdd(null)} onAdd={addPicksToGroup} />
      )}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} okLabel={conf.okLabel} okColor={conf.okColor} extra={conf.extra} />}
    </div>
  );
}

// 見積の「掛け率 *(必須)」。1.0 / 0.925 / 0.9 / カスタム(0.50〜1.20)。カスタムは数字を入れて「決定」で反映する
function RateField({ ed, onChange }) {
  const [custom, setCustom] = useState(ed.rate_choice === "custom" ? ed.rate_custom : "");
  const [editingCustom, setEditingCustom] = useState(false);
  const rate = edRate(ed);
  const customNum = Number(custom);
  const customValid = custom !== "" && Number.isFinite(customNum) && customNum >= CUSTOM_RATE_MIN && customNum <= CUSTOM_RATE_MAX;
  const showCustom = editingCustom || ed.rate_choice === "custom";
  const btn = on => ({ padding: "6px 12px", border: "none", borderRight: "1px solid #E5E7EB", background: on ? "#1A3A5C" : "#fff", color: on ? "#fff" : "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" });
  return (
    <div style={{ flexBasis: "100%", border: `2px solid ${rate == null ? "#E07B39" : "#E5E7EB"}`, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C" }}>掛け率 *(必須)</span>
        <div style={{ display: "flex", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
          {MARKUP_CHOICE_OPTIONS.map(o => {
            const on = o.key === "custom" ? showCustom : ed.rate_choice === o.key && !editingCustom;
            return (
              <button key={o.key} type="button" style={btn(on)}
                onClick={() => { if (o.key === "custom") { setEditingCustom(true); return; } setEditingCustom(false); onChange(o.key); }}>{o.label}</button>
            );
          })}
        </div>
        {showCustom && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="number" step="0.001" min={CUSTOM_RATE_MIN} max={CUSTOM_RATE_MAX} value={custom} onChange={e => setCustom(e.target.value)}
              placeholder={`${CUSTOM_RATE_MIN}〜${CUSTOM_RATE_MAX}`} style={{ width: 90, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${customValid || !custom ? "#E5E7EB" : "#FCA5A5"}`, fontSize: 13, color: "#1F2937" }} />
            <button type="button" disabled={!customValid} onClick={() => { setEditingCustom(false); onChange("custom", custom); }}
              style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: customValid ? "#1A3A5C" : "#C7D2FE", color: "#fff", fontSize: 12, fontWeight: 700, cursor: customValid ? "pointer" : "default" }}>決定</button>
          </span>
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: rate == null ? "#C2410C" : "#374151" }}>{rate == null ? "選んでください" : `今の掛け率 ${rateLabel(rate)}`}</span>
        {ed.rate_source && <span style={{ fontSize: 10, color: "#6B7280", background: "#F3F4F6", borderRadius: 4, padding: "1px 6px" }}>{ed.rate_source === "営業所" || ed.rate_source === "取引先" ? `${ed.rate_source}の初期値` : ed.rate_source}</span>}
      </div>
      <div style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>販売の単価 = 100%の単価 × 掛け率。単価表から入れた行に使います(手入力の行・手で直した単価には使いません)</div>
    </div>
  );
}
