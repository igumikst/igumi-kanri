import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { fmt, todayStr } from "../lib/constants";
import { buildPriceIndex, matchLine, matchLineSmart, searchItems, similarity, aliasKey, normalizeText, AUTO_MATCH_LEARN_SCORE } from "../lib/priceMatch";
import { toBasePrice, lineAmount, roundYen, applyRate, MARKUP_BACK_RATE, CUSTOM_RATE_MIN, CUSTOM_RATE_MAX, MARKUP_CHOICE_OPTIONS, resolveMarkupChoice } from "../lib/quoteImport/markup";
import { buildEstTree, flattenEstTree, reverseSiblingOrder } from "../lib/quoteImport/parseEst";
import GroupTree, { BundleToolbar } from "../components/GroupTree";
import ClientBranchRepPicker from "../components/ClientBranchRepPicker";
import SubQuoteFileReader from "../components/SubQuoteFileReader";
import FileDropZone from "../components/FileDropZone";
import { usePreventWindowFileDrop } from "../lib/useFileDropGuard";
import { QUOTE_FILE_BUCKET, FILE_TYPES } from "../lib/quoteFiles";
import { computeQuoteFinancials, CONSTRUCTION_TYPES } from "../lib/quoteFinancials";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPT_RE = /\.(xls|xlsx|est)$/i;
const EST_RE = /\.est$/i;

// 見積の状態は、画面上は「発注前」「完工済」の2つだけ(発注前=submitted / 完工済=won)
const QUOTE_STATUS = [
  { key: "submitted", label: "発注前" },
  { key: "won", label: "完工済" },
];

const card = { background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" };
const th = { padding: "6px 6px", fontSize: 11, color: "#6B7280", textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "4px 6px", fontSize: 12, color: "#1F2937", verticalAlign: "top" };
const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" };
const cellInp = { width: "100%", padding: "3px 5px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937", boxSizing: "border-box", background: "#fff" };
const label = { fontSize: 11, color: "#6B7280", marginBottom: 3 };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 6 };
const num = v => (v == null ? "—" : Number(v).toLocaleString());
const yen = v => (v == null ? "—" : `¥${Math.round(Number(v)).toLocaleString()}`);
// import_quote の後始末(下請け関連)。import_quote 自体のSQLは直さず、登録後の更新で済ませる
// (新しい列を増やすたびに import_quote を直すと、その都度DB実行待ちが必要になるため)
// - subFlagsBySortOrder: 下請け施工チェックが付いた行の sort_order(= p_items の配列index)一覧
// - subCosts: この画面でローカルに保持していた下請けの原価の下書き([{subcontractor_id, amount, note, file}])
async function applySubcontractorFollowUps({ quoteId, subFlagsBySortOrder, subCosts }) {
  if (subFlagsBySortOrder?.length) {
    const { data: insertedItems } = await supabase.from("quote_items").select("id, sort_order").eq("quote_id", quoteId);
    const idBySortOrder = Object.fromEntries((insertedItems || []).map(r => [r.sort_order, r.id]));
    const ids = subFlagsBySortOrder.map(i => idBySortOrder[i]).filter(Boolean);
    if (ids.length) await supabase.from("quote_items").update({ is_subcontracted: true }).in("id", ids);
  }
  for (const c of subCosts || []) {
    let file_storage_path = null, file_original_name = null;
    if (c.file) {
      const ext = (c.file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "").toLowerCase();
      const storagePath = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(QUOTE_FILE_BUCKET).upload(storagePath, c.file, { contentType: FILE_TYPES[ext], upsert: false });
      if (!upErr) { file_storage_path = storagePath; file_original_name = c.file.name; }
    }
    await supabase.from("quote_subcontractor_costs").insert([{
      quote_id: quoteId, subcontractor_id: c.subcontractor_id, amount: Number(c.amount) || 0,
      note: c.note || null, file_storage_path, file_original_name,
    }]);
  }
}

export default function QuoteImport({ pjs, wonQuotes, setPjs, cos, setCos, salesReps, setSalesReps, branches, setBranches, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, quoteImportCtx, setQuoteProjectId }) {
  usePreventWindowFileDrop();
  const pending = tks.filter(t => !t.done);
  const [results, setResults] = useState([]);
  const [reading, setReading] = useState(false);
  const [price, setPrice] = useState(null);

  useEffect(() => {
    (async () => {
      const [setsRes, itemsRes, costsRes, aliasRes] = await Promise.all([
        supabase.from("price_sets").select("*").order("sort_order"),
        supabase.from("price_items").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("price_item_costs").select("*"),
        supabase.from("price_item_aliases").select("*"),
      ]);
      setPrice({
        sets: setsRes.data || [],
        items: itemsRes.data || [],
        costs: Object.fromEntries((costsRes.data || []).map(c => [c.price_item_id, c])),
        aliases: aliasRes.data || [],
        error: setsRes.error || itemsRes.error || costsRes.error ? "単価表の読み込みに失敗しました。原価の当てはめができません" : null,
      });
    })();
  }, []);

  const readFiles = async fileList => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setReading(true);
    // ライブラリが大きいので、ファイルを選んだ時だけ読み込む
    const [{ parseConcluWorkbook }, { parseEstFile }, { parseSelfQuoteWorkbook, isSelfQuoteWorkbook }, XLSX] = await Promise.all([
      import("../lib/quoteImport/parseConclu.js"),
      import("../lib/quoteImport/parseEst.js"),
      import("../lib/quoteImport/parseSelfQuote.js"),
      import("xlsx"),
    ]);
    const next = [];
    for (const f of files) {
      const base = { key: f.name + f.size + f.lastModified, fileName: f.name, size: f.size, file: f };
      if (!ACCEPT_RE.test(f.name)) { next.push({ ...base, error: ".xls / .xlsx / .est のファイルを選んでください" }); continue; }
      if (f.size > MAX_FILE_SIZE) { next.push({ ...base, error: `ファイルが大きすぎます(上限 10MB / このファイル ${(f.size / 1024 / 1024).toFixed(1)}MB)` }); continue; }
      const isEst = EST_RE.test(f.name);
      try {
        if (isEst) {
          next.push({ ...base, kind: "est", data: parseEstFile(await f.arrayBuffer(), f.name) });
        } else {
          const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
          if (isSelfQuoteWorkbook(wb)) next.push({ ...base, kind: "selfquote", data: parseSelfQuoteWorkbook(wb) });
          else next.push({ ...base, kind: "conclu", data: parseConcluWorkbook(wb) });
        }
      } catch (e) {
        next.push({ ...base, error: "読み取れませんでした: " + e.message });
      }
    }
    setResults(prev => [...prev.filter(r => !next.some(n => n.key === r.key)), ...next]);
    setReading(false);
  };

  const back = () => nav(quoteImportCtx?.from || "projects");
  const targetProject = pjs.find(p => p.id === quoteImportCtx?.projectId);

  const addProjectToState = async projectId => {
    if (pjs.some(p => p.id === projectId)) return;
    const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (data) setPjs(prev => [{ ...data, subIds: data.subcontractorIds || [], gp: data.grossProfit || 0, qDate: data.quoteDate || "" }, ...prev]);
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="quoteImport" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} wonQuotes={wonQuotes} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title="📥 見積ファイルから登録" back={back} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={card}>
          {targetProject && <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>追加先の案件(初期値): <b>{targetProject.name}</b></div>}
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 1.6 }}>
            Concluで出力した見積書(.xls/.xlsx。自社見積書も)、または見積ソフトのESTファイル(.est)を選んでください。複数選べます(1ファイル 10MB まで)。<br />
            内容を確認・修正してから、ファイルごとに「登録する」を押してください。
          </div>
          {price?.error && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>⚠️ {price.error}</div>}
          <FileDropZone onFiles={files => { if (!reading) readFiles(files); }} disabled={reading} activeLabel="ここに落とす" style={{ display: "block" }}>
            <label style={{ display: "block", width: "100%", padding: "12px 0", background: "#1A3A5C", color: "#fff", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: reading ? "default" : "pointer", textAlign: "center", opacity: reading ? 0.6 : 1 }}>
              {reading ? "読み取り中..." : "📂 ファイルを選ぶ(ここにドラッグもできます)"}
              <input type="file" accept=".xls,.xlsx,.est" multiple disabled={reading} onChange={e => { readFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
          </FileDropZone>
        </div>

        {results.map(r => (
          <FileCard key={r.key} r={r} price={price} pjs={pjs} cos={cos} setCos={setCos} salesReps={salesReps || []} setSalesReps={setSalesReps} branches={branches || []} setBranches={setBranches}
            defaultProjectId={quoteImportCtx?.projectId || ""}
            onRegistered={addProjectToState}
            onOpenQuote={projectId => { setQuoteProjectId(projectId); nav("quotes"); }}
            onRemove={() => setResults(prev => prev.filter(x => x.key !== r.key))} />
        ))}
      </div>
    </div>
  );
}

function FileCard({ r, price, pjs, cos, setCos, salesReps, setSalesReps, branches, setBranches, defaultProjectId, onRegistered, onOpenQuote, onRemove }) {
  if (r.error) {
    return (
      <div style={{ ...card, borderLeft: "4px solid #DC2626" }}>
        <CardHead fileName={r.fileName} onRemove={onRemove} />
        <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700 }}>⚠️ {r.error}</div>
      </div>
    );
  }
  if (r.kind === "est") return <EstImportForm r={r} price={price} pjs={pjs} cos={cos} setCos={setCos} salesReps={salesReps} setSalesReps={setSalesReps} branches={branches} setBranches={setBranches} defaultProjectId={defaultProjectId} onRegistered={onRegistered} onOpenQuote={onOpenQuote} onRemove={onRemove} />;
  if (r.kind === "selfquote") return <SelfQuoteImportForm r={r} price={price} pjs={pjs} cos={cos} setCos={setCos} salesReps={salesReps} setSalesReps={setSalesReps} branches={branches} setBranches={setBranches} defaultProjectId={defaultProjectId} onRegistered={onRegistered} onOpenQuote={onOpenQuote} onRemove={onRemove} />;
  return <ImportForm r={r} price={price} pjs={pjs} cos={cos} setCos={setCos} salesReps={salesReps} setSalesReps={setSalesReps} branches={branches} setBranches={setBranches} defaultProjectId={defaultProjectId} onRegistered={onRegistered} onOpenQuote={onOpenQuote} onRemove={onRemove} />;
}

const CardHead = ({ fileName, onRemove, locked }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
    <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", wordBreak: "break-all" }}>📗 {fileName}</div>
    {!locked && <button onClick={onRemove} style={{ border: "none", background: "#F3F4F6", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#374151", whiteSpace: "nowrap" }}>✕ 外す</button>}
  </div>
);

let lineSeq = 0;

function ImportForm({ r, price, pjs, cos, setCos, salesReps, setSalesReps, branches, setBranches, defaultProjectId, onRegistered, onOpenQuote, onRemove }) {
  const d = r.data;
  const [title, setTitle] = useState(d.cover.title || "");
  const [issuedDate, setIssuedDate] = useState(d.cover.issuedDate || "");
  const [status, setStatus] = useState("submitted");
  const [markup, setMarkup] = useState(null); // "before" | "after"(必須)
  const [pickedSetId, setPriceSetId] = useState("");
  const [projectMode, setProjectMode] = useState(defaultProjectId ? "existing" : "new");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [np, setNp] = useState({ name: d.cover.title || "", clientId: "", branchId: "", salesRepId: "", inCharge: "", respondedAt: todayStr(), constructionType: "自社のみ" });
  const [lines, setLines] = useState(() => d.lines.map(l => ({
    key: "il" + (++lineSeq), groupName: l.groupName, name: l.name, spec: l.spec, qty: l.qty ?? 0, unit: l.unit,
    price: l.price ?? 0, note: l.note, summaryOnly: l.summaryOnly, nameFromSpec: l.nameFromSpec, fileAmount: l.amount,
    pickedItemId: undefined, // undefined = 自動 / null = 当てはめない / id = 手で選んだ
    costOverride: undefined, // undefined = 単価表の原価をそのまま使う / { price, confirmed } = 手で直した原価
    isSubcontracted: false,
  })));
  const [searchKey, setSearchKey] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, projectId, quoteNo }
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  // 下請けの原価(まだ案件・見積が無いので、登録が終わるまではこの画面のローカル状態に置く)
  const [subCosts, setSubCosts] = useState([]);
  const [subForm, setSubForm] = useState({ subcontractor_id: "", amount: "", note: "", file: null });
  const subcontractors = cos.filter(c => c.type === "協力業者");
  const addSubCostDraft = () => {
    if (!subForm.subcontractor_id || !subForm.amount) { alert("下請け会社と金額を入力してください"); return; }
    setSubCosts(prev => [...prev, { key: "sc" + Date.now(), subcontractor_id: subForm.subcontractor_id, amount: Number(subForm.amount) || 0, note: subForm.note || "", file: subForm.file }]);
    setSubForm({ subcontractor_id: "", amount: "", note: "", file: null });
  };
  const removeSubCostDraft = key => setSubCosts(prev => prev.filter(c => c.key !== key));

  // ドラッグ・ボタンでの並べ替え・グループ分け(ステップ2)。group_nameを直接書き換える
  const handleArrangeConclu = newLines => setLines(prev => {
    const prevByKey = new Map(prev.map(l => [l.key, l]));
    return newLines.map(nl => ({ ...prevByKey.get(nl.key), groupName: nl.group_name }));
  });

  // 単価セットの初期値: 工事見積用
  const defaultSetId = price?.sets?.length ? (price.sets.find(s => s.code === "construction") || price.sets[0]).id : "";
  const priceSetId = pickedSetId || defaultSetId;

  const index = useMemo(() => {
    if (!price || !priceSetId) return null;
    return buildPriceIndex(price.items.filter(i => i.price_set_id === priceSetId), price.aliases);
  }, [price, priceSetId]);

  const autoMatches = useMemo(() => {
    const out = {};
    if (!index) return out;
    for (const l of lines) out[l.key] = l.summaryOnly ? { status: "none", item: null, candidates: [] } : matchLine(index, l.name, l.spec);
    return out;
  }, [index, lines]);

  const view = lines.map(l => {
    const auto = autoMatches[l.key] || { status: "none", item: null, candidates: [] };
    const picked = l.pickedItemId !== undefined;
    const item = picked ? (l.pickedItemId ? index?.byId.get(l.pickedItemId) || null : null) : auto.item;
    const matchStatus = picked ? (item ? "manual" : "skip") : auto.status;
    const cost = item ? price?.costs[item.id] : null;
    const basePrice = toBasePrice(l.price, markup || "before");
    const amount = lineAmount(l.qty, basePrice);
    const costPrice = l.costOverride !== undefined ? l.costOverride.price : (cost?.cost_price ?? null);
    const costConfirmed = l.costOverride !== undefined ? l.costOverride.confirmed : (!!cost?.cost_confirmed && costPrice != null);
    return { ...l, auto, item, matchStatus, basePrice, amount, costPrice, costConfirmed };
  });

  const total = view.reduce((s, l) => s + l.amount, 0);
  const fileTotal = d.grandTotal ?? d.linesTotal;
  const expectedAfter = roundYen(fileTotal * MARKUP_BACK_RATE);
  const selectedProject = projectMode === "existing" ? pjs.find(p => p.id === projectId) : null;
  const constructionType = projectMode === "existing" ? (selectedProject?.constructionType || "自社のみ") : (np.constructionType || "自社のみ");
  const isMixed = constructionType === "自社+下請け";
  const isSubOnly = constructionType === "下請けのみ";
  const showSubCheckCol = isMixed;
  const showCostCol = !isSubOnly;
  const subAmountTotal = subCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const financials = computeQuoteFinancials({
    constructionType, saleTotal: total,
    lines: view.map(l => ({ qty: l.qty, costPrice: l.costPrice, costConfirmed: l.costConfirmed, isSubcontracted: l.isSubcontracted })),
    subAmountTotal, subCount: subCosts.length,
  });
  const { costTotal, gp, gpRate, provisional, subMissing, ownUnconfirmed } = financials;
  const unmatchedCount = view.filter(l => !l.item).length;
  const ngChecks = d.checks.filter(c => c.ok === false);

  const similarProjects = useMemo(() => {
    const t = normalizeText(title);
    if (!t) return [];
    return pjs.map(p => {
      const n = normalizeText(p.name);
      const score = n && (n.includes(t) || t.includes(n)) ? 1 : similarity(title, p.name);
      return { p, score };
    }).filter(x => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [pjs, title]);

  const repName = s => s?.name || s?.display_name || "";

  const updateLine = (key, patch) => setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = key => setLines(prev => prev.filter(l => l.key !== key));

  const problems = [];
  if (!markup) problems.push("「載せる前/載せた後」を選んでください");
  if (!title.trim()) problems.push("見積タイトルを入力してください");
  if (!priceSetId) problems.push("単価セットを選んでください");
  if (!lines.length) problems.push("明細がありません");
  if (projectMode === "existing" && !projectId) problems.push("追加先の案件を選んでください");
  if (projectMode === "new" && !np.name.trim()) problems.push("案件名を入力してください");

  const register = async () => {
    if (problems.length || registering) return;
    setRegistering(true);
    const rep = salesReps.find(s => s.id === np.salesRepId);
    const pProject = projectMode === "existing" ? { id: projectId } : {
      name: np.name.trim(), status: "発注待ち", clientId: np.clientId || null,
      salesRepId: np.salesRepId || null, salesRep: repName(rep), inCharge: np.inCharge.trim(),
      subcontractorIds: [], quoteDate: issuedDate || "",
    };
    const memo = `見積ファイル「${r.fileName}」から取り込み。${markup === "after" ? `ファイルの金額は載せた後 → 単価×${MARKUP_BACK_RATE}で載せる前に戻して登録` : "ファイルの金額は載せる前(そのまま登録)"}。ファイルの税抜合計 ${fileTotal?.toLocaleString()}円`;
    const pQuote = { title: title.trim(), price_set_id: priceSetId, status, total_amount: Math.round(total), issued_at: issuedDate || null, memo };
    const pItems = view.map(l => ({
      price_item_id: l.item?.id ?? null,
      line_type: l.item ? "item" : "adjust",
      group_name: l.groupName || "",
      name: l.name, spec: l.spec || "", unit: l.unit || "",
      qty: Number(l.qty) || 0, sale_price: l.basePrice,
      note: l.note || null,
      cost_price: l.costPrice, cost_confirmed: l.costConfirmed,
    }));
    const subFlagsBySortOrder = view.map((l, i) => [i, !!l.isSubcontracted]).filter(([, flag]) => flag).map(([i]) => i);
    const pAliases = view.filter(l => l.matchStatus === "manual" && l.item).map(l => ({ alias: aliasKey(l.name, l.spec), price_item_id: l.item.id }));

    // 1) 元ファイルを Storage(非公開バケット)に保存。保存名は ID + 拡張子、元の名前は別に記録する
    const ext = (r.fileName.match(/\.(xlsx?|XLSX?)$/)?.[1] || "xls").toLowerCase();
    const storagePath = `${crypto.randomUUID()}.${ext}`;
    const contentType = FILE_TYPES[ext];
    const { error: upErr } = await supabase.storage.from(QUOTE_FILE_BUCKET).upload(storagePath, r.file, { contentType, upsert: false });
    if (upErr) {
      setResult({ ok: false, message: `元ファイルの保存に失敗しました。何も登録されていません。(${upErr.message})` });
      setRegistering(false);
      return;
    }

    // 2) 案件・見積・明細・原価・別名・ファイルの記録を、1つのトランザクションで登録
    const pFile = { storage_path: storagePath, original_name: r.fileName, size: r.size, content_type: contentType };
    const { data, error } = await supabase.rpc("import_quote", { p_project: pProject, p_quote: pQuote, p_items: pItems, p_aliases: pAliases, p_file: pFile });
    if (error) {
      const missing = /import_quote|function|schema cache/i.test(error.message || "");
      setResult({ ok: false, message: `登録できませんでした。案件・見積は登録されていません。(${error.message})${missing ? " ※ 取り込み用のSQLが未実行の可能性があります" : ""}`, orphanPath: storagePath });
      setRegistering(false);
      return;
    }
    if (projectMode === "new" && (np.respondedAt || np.branchId || np.constructionType)) {
      await supabase.from("projects").update({
        ...(np.respondedAt ? { respondedAt: np.respondedAt } : {}),
        ...(np.branchId ? { branchId: np.branchId } : {}),
        ...(np.constructionType ? { constructionType: np.constructionType } : {}),
      }).eq("id", data.project_id);
    }
    await applySubcontractorFollowUps({ quoteId: data.quote_id, subFlagsBySortOrder, subCosts });
    await onRegistered(data.project_id);
    setResult({ ok: true, projectId: data.project_id, quoteNo: data.quote_no, projectName: projectMode === "existing" ? pjs.find(p => p.id === projectId)?.name : np.name.trim() });
    setRegistering(false);
  };

  const locked = !!result?.ok;

  return (
    <div style={{ ...card, borderLeft: `4px solid ${locked ? "#059669" : ngChecks.length ? "#DC2626" : "#1A3A5C"}` }}>
      <CardHead fileName={r.fileName} onRemove={onRemove} locked={locked} />

      {locked ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>登録の結果</div>
          <div style={{ fontSize: 13, color: "#065F46", marginBottom: 4 }}>✅ 元ファイルの保管: 保存しました(案件の見積一覧から開けます)</div>
          <div style={{ fontSize: 13, color: "#065F46", marginBottom: 10 }}>✅ 案件・見積・明細・原価: 登録しました(案件「{result.projectName}」/ 見積 No.{result.quoteNo})</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>案件の受注金額・粗利は変わっていません。反映するには、見積一覧で「採用にする」を押してください。</div>
          <button onClick={() => onOpenQuote(result.projectId)} style={{ width: "100%", padding: "10px 0", background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📝 見積一覧を開く →</button>
        </div>
      ) : (
        <>
          {/* 表紙 */}
          <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={sectionTitle}>表紙</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ flex: 3, minWidth: 220 }}>
                <div style={label}>見積タイトル(初期値 = 工事名称)*</div>
                <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={label}>見積日(概要メモの見積年月日)</div>
                <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6, fontSize: 12 }}>
              <Info label="見積代金(税抜)" value={fmt(d.cover.totalExTax)} strong />
              <Info label="消費税" value={fmt(d.cover.tax)} />
              <Info label="御見積金額(税込)" value={fmt(d.cover.totalInclTax)} />
              <Info label="表紙の日付(出力日)" value={d.cover.outputDate || "—"} />
              {d.cover.site && <Info label="工事場所" value={d.cover.site} />}
              {d.cover.clientName && <Info label="宛先" value={d.cover.clientName} />}
            </div>
          </div>

          {/* 検算 */}
          <div style={{ marginBottom: 12 }}>
            <div style={sectionTitle}>検算(ファイルの内容)</div>
            {ngChecks.length === 0
              ? <div style={{ background: "#ECFDF5", color: "#065F46", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>✅ 読み取った明細の合計({fmt(d.linesTotal)})が、ファイルの合計と一致しています</div>
              : <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>⚠️ ファイルの合計と一致しない項目があります。明細を確認してください</div>}
            <details>
              <summary style={{ fontSize: 11, color: "#6B7280", cursor: "pointer" }}>検算の内訳・総括を見る</summary>
              {d.checks.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 6, fontSize: 11, color: c.ok === false ? "#DC2626" : "#6B7280", padding: "2px 0" }}>
                  <span style={{ width: 18 }}>{c.ok === null ? "－" : c.ok ? "✓" : "✗"}</span>
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <span style={{ whiteSpace: "nowrap" }}>{num(c.actual)} / {num(c.expected)}</span>
                </div>
              ))}
              <div style={{ marginTop: 6 }}>
                {d.summary.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, padding: "2px 0" }}>
                    <span style={{ flex: 1 }}>総括: {s.name}</span>
                    <span>{fmt(s.amount)}</span>
                    <span style={{ fontWeight: 700, color: s.groupName ? (s.amountMatches ? "#059669" : "#DC2626") : "#9A3412" }}>{s.groupName ? (s.amountMatches ? "→ 内訳を採用" : "→ 内訳と金額不一致") : "総括のみ(1行で取り込み)"}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {d.warnings.length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
              {d.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: "#92400E", padding: "2px 0" }}>⚠️ {w}</div>)}
            </div>
          )}

          {/* 載せる前/載せた後(必須) */}
          <div style={{ border: `2px solid ${markup ? "#E5E7EB" : "#E07B39"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C", marginBottom: 6 }}>このファイルの金額は? *(必須)</div>
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, marginBottom: 4, cursor: "pointer" }}>
              <input type="radio" name={`mk-${r.key}`} checked={markup === "before"} onChange={() => setMarkup("before")} />
              <span><b>載せる前</b> の金額(そのまま登録する)</span>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" name={`mk-${r.key}`} checked={markup === "after"} onChange={() => setMarkup("after")} />
              <span><b>載せた後</b>(7.5%載せ後)の金額 → 単価を × {MARKUP_BACK_RATE} して、載せる前に戻す</span>
            </label>
            {markup === "after" && (
              <div style={{ marginTop: 8, background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#374151" }}>
                ファイルの合計 {yen(fileTotal)} × {MARKUP_BACK_RATE} = {yen(expectedAfter)} / 単価ごとに戻した合計 {yen(total)}
                <span style={{ marginLeft: 6, fontWeight: 700, color: total === expectedAfter ? "#059669" : "#9A3412" }}>差額 {total - expectedAfter >= 0 ? "+" : ""}{(total - expectedAfter).toLocaleString()}円</span>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>差額は、単価ごとに円未満を四捨五入したことによるものです(明細を直した場合は、その分も含みます)</div>
              </div>
            )}
          </div>

          {/* 案件・見積の設定 */}
          <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={sectionTitle}>登録先</div>
            <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 13 }}>
              <label style={{ cursor: "pointer" }}><input type="radio" name={`pm-${r.key}`} checked={projectMode === "existing"} onChange={() => setProjectMode("existing")} /> 既存の案件に追加</label>
              <label style={{ cursor: "pointer" }}><input type="radio" name={`pm-${r.key}`} checked={projectMode === "new"} onChange={() => setProjectMode("new")} /> 新しい案件を作る</label>
            </div>

            {similarProjects.length > 0 && (
              <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>⚠️ 名前の似た案件があります(二重登録に注意)</div>
                {similarProjects.map(({ p }) => (
                  <button key={p.id} onClick={() => { setProjectMode("existing"); setProjectId(p.id); }} style={{ display: "block", width: "100%", textAlign: "left", background: projectMode === "existing" && projectId === p.id ? "#FDE68A" : "#fff", border: "1px solid #FCD34D", borderRadius: 6, padding: "4px 8px", marginBottom: 3, fontSize: 12, cursor: "pointer", color: "#1F2937" }}>
                    {p.name}<span style={{ color: "#9CA3AF", marginLeft: 6 }}>{p.status}</span><span style={{ float: "right", color: "#92400E" }}>この案件に追加 →</span>
                  </button>
                ))}
              </div>
            )}

            {projectMode === "existing" ? (
              <div style={{ marginBottom: 8 }}>
                <div style={label}>追加先の案件 *</div>
                <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inp}>
                  <option value="">選択してください</option>
                  {pjs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {selectedProject && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>施工形態: {constructionType}(案件の設定。変更は案件の編集画面で行います)</div>}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ flex: "1 1 100%" }}>
                  <div style={label}>案件名 *(初期値 = 工事名称)</div>
                  <input value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} style={inp} />
                </div>
                <div style={{ flex: "1 1 100%" }}>
                  <ClientBranchRepPicker
                    clientId={np.clientId} branchId={np.branchId} salesRepId={np.salesRepId}
                    cos={cos} setCos={setCos} branches={branches} setBranches={setBranches} salesReps={salesReps} setSalesReps={setSalesReps}
                    onChange={patch => setNp({ ...np, clientId: patch.clientId, branchId: patch.branchId, salesRepId: patch.salesRepId })}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={label}>現場担当(社内)</div>
                  <input value={np.inCharge} onChange={e => setNp({ ...np, inCharge: e.target.value })} style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={label}>対応日(見積などの対応をした日)</div>
                  <input type="date" value={np.respondedAt} onChange={e => setNp({ ...np, respondedAt: e.target.value })} style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={label}>施工形態</div>
                  <select value={np.constructionType} onChange={e => setNp({ ...np, constructionType: e.target.value })} style={inp}>
                    {CONSTRUCTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={label}>見積の状態</div>
                <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
                  {QUOTE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={label}>単価セット(原価の当てはめに使う)</div>
                <select value={priceSetId} onChange={e => setPriceSetId(e.target.value)} style={inp}>
                  {(price?.sets || []).map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 明細 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div style={sectionTitle}>明細({lines.length}行)</div>
            {unmatchedCount > 0 && <div style={{ fontSize: 11, color: "#B45309", fontWeight: 700 }}>単価表に当てはまらない行: {unmatchedCount}行(原価未入力)</div>}
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>⠿をドラッグ、または↑↓・📂(このグループに移す)で並べ替え・グループ分けができます</div>
          <BundleToolbar lines={view.map(l => ({ ...l, group_name: l.groupName }))} onChange={handleArrangeConclu} selectedKeys={selectedKeys} setSelectedKeys={setSelectedKeys} />
          <div style={{ overflowX: "auto", marginBottom: 6 }}>
            <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                  <th style={th}></th>
                  <th style={th}>名称</th><th style={th}>材質・寸法</th>
                  <th style={th}>数量</th><th style={th}>単位</th>
                  <th style={th}>単価(ファイル)</th>
                  {markup === "after" && <th style={th}>単価(載せる前)</th>}
                  <th style={{ ...th, textAlign: "right" }}>金額</th>
                  <th style={th}>備考</th>
                  {showSubCheckCol && <th style={{ ...th, textAlign: "center" }}>下請け施工</th>}
                  <th style={th}>単価表の項目{showCostCol ? "(原価)" : ""}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                <GroupTree
                  lines={view.map(l => ({ ...l, group_name: l.groupName }))}
                  onChange={handleArrangeConclu}
                  amountOf={l => l.amount}
                  formatAmount={yen}
                  columnCount={(markup === "after" ? 8 : 7) + (showSubCheckCol ? 1 : 0)}
                  rowStyle={l => (l.summaryOnly ? "#FFF7ED" : !l.item ? "#FFFBEB" : "transparent")}
                  selectedKeys={selectedKeys}
                  onToggleSelect={key => setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                  onDeleteLeaf={removeLine}
                  renderLeafCells={l => {
                    const cells = [
                      <td key="name" style={{ ...td, width: 150 }}><input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} style={cellInp} /></td>,
                      <td key="spec" style={{ ...td, width: 170 }}><input value={l.spec} onChange={e => updateLine(l.key, { spec: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>,
                      <td key="qty" style={{ ...td, width: 60 }}><input type="number" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} style={{ ...cellInp, textAlign: "right" }} /></td>,
                      <td key="unit" style={{ ...td, width: 46 }}><input value={l.unit} onChange={e => updateLine(l.key, { unit: e.target.value })} style={cellInp} /></td>,
                      <td key="price" style={{ ...td, width: 90 }}><input type="number" value={l.price} onChange={e => updateLine(l.key, { price: e.target.value })} style={{ ...cellInp, textAlign: "right" }} /></td>,
                    ];
                    if (markup === "after") cells.push(<td key="basePrice" style={{ ...td, textAlign: "right", width: 80 }}>{num(l.basePrice)}</td>);
                    cells.push(
                      <td key="amount" style={{ ...td, textAlign: "right", fontWeight: 700, color: "#E07B39", width: 80 }}>{num(l.amount)}</td>,
                      <td key="note" style={{ ...td, width: 110 }}><input value={l.note} onChange={e => updateLine(l.key, { note: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>,
                    );
                    if (showSubCheckCol) {
                      cells.push(
                        <td key="subflag" style={{ ...td, textAlign: "center", width: 60 }}>
                          <input type="checkbox" checked={!!l.isSubcontracted} onChange={e => updateLine(l.key, { isSubcontracted: e.target.checked })} />
                        </td>
                      );
                    }
                    cells.push(
                      <td key="cost" style={{ ...td, width: 230 }}>
                        <MatchCell l={l} index={index} costs={price?.costs || {}}
                          showCost={showCostCol} excluded={isMixed && l.isSubcontracted}
                          searching={searchKey === l.key} searchText={searchText}
                          onSearchOpen={() => { setSearchKey(searchKey === l.key ? null : l.key); setSearchText(""); }}
                          onSearchText={setSearchText}
                          onPick={id => { updateLine(l.key, { pickedItemId: id, costOverride: undefined }); setSearchKey(null); }}
                          onCostChange={v => updateLine(l.key, { costOverride: v === "" ? { price: null, confirmed: false } : { price: Number(v), confirmed: true } })} />
                      </td>,
                    );
                    return cells;
                  }}
                />
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 12 }}>黄色の行 = 単価表に当てはまらない行(原価未入力)/ オレンジの行 = 総括のみ(内訳ページなし。原価未入力)</div>

          {constructionType !== "自社のみ" && (
            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <div style={sectionTitle}>🏗 下請けの原価({subCosts.length}件)</div>
              {subCosts.length === 0 && <div style={{ padding: "4px 0", fontSize: 12, color: "#9CA3AF" }}>まだ登録されていません(粗利は暫定になります)</div>}
              {subCosts.map(c => {
                const subCo = cos.find(x => x.id === c.subcontractor_id);
                return (
                  <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #F3F4F6" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{subCo?.name || "不明な会社"}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{yen(c.amount)}{c.note ? ` ・ ${c.note}` : ""}{c.file ? ` ・ 📎 ${c.file.name}` : ""}</div>
                    </div>
                    <button onClick={() => removeSubCostDraft(c.key)} style={{ background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid #F3F4F6" }}>
                <select value={subForm.subcontractor_id} onChange={e => setSubForm({ ...subForm, subcontractor_id: e.target.value })} style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#fff", color: "#1F2937" }}>
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
                <button onClick={addSubCostDraft} style={{ background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ 追加</button>
              </div>
              <SubQuoteFileReader
                file={subForm.file} subcontractors={subcontractors} hasCompanySelected={!!subForm.subcontractor_id}
                onPickAmount={v => setSubForm(f => ({ ...f, amount: String(v) }))}
                onPickCompany={id => setSubForm(f => ({ ...f, subcontractor_id: id }))}
              />
            </div>
          )}

          {/* 合計・粗利 */}
          <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 13, color: "#6B7280" }}>登録する見積合計(税抜{markup === "after" ? "・載せる前" : ""})</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#1A3A5C" }}>{yen(total)}</div>
            </div>
            {markup !== "after" && total !== fileTotal && <div style={{ fontSize: 11, color: "#9A3412", marginBottom: 6 }}>※ ファイルの合計({yen(fileTotal)})と {(total - fileTotal).toLocaleString()}円 違います(明細を直したため)</div>}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 4 }}>🔒 社内用</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>原価合計 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{yen(costTotal)}</span></div>
              <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>粗利 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{yen(gp)}{provisional ? "(暫定)" : ""}</span></div>
              <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>粗利率 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{gpRate == null ? "—" : `${gpRate.toFixed(1)}%`}</span></div>
            </div>
            {ownUnconfirmed && <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 原価が未入力・未確認の明細があります。粗利は暫定です</div>}
            {subMissing && <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 下請けの原価が1件も登録されていません。粗利は暫定です</div>}
            <div style={{ marginTop: 4, fontSize: 11, color: "#6B7280" }}>※ 原価は、いまの単価表の原価をコピーします。過去の見積の場合、粗利は「いまの原価」での目安です</div>
          </div>

          {result && !result.ok && (
            <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              <div>❌ {result.message}</div>
              {result.orphanPath && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>※ 元ファイルだけが Storage に残っています(quote-files / {result.orphanPath})。もう一度登録すると、新しい名前で保存し直します。</div>}
            </div>
          )}
          {problems.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {problems.map((p, i) => <div key={i} style={{ fontSize: 12, color: "#B45309" }}>・{p}</div>)}
            </div>
          )}
          <button onClick={register} disabled={problems.length > 0 || registering} style={{ width: "100%", padding: "12px 0", background: problems.length ? "#9CA3AF" : "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: problems.length || registering ? "default" : "pointer", opacity: registering ? 0.6 : 1 }}>
            {registering ? "登録中..." : "💾 この内容で登録する"}
          </button>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, textAlign: "center" }}>案件の受注金額・粗利は変わりません(反映は見積一覧の「採用にする」で行います)</div>
        </>
      )}
    </div>
  );
}

const MATCH_BADGE = {
  exact: { text: "一致", color: "#065F46", bg: "#D1FAE5" },
  alias: { text: "別名辞書", color: "#065F46", bg: "#D1FAE5" },
  auto: { text: "自動(類似)", color: "#5B21B6", bg: "#EDE9FE" },
  manual: { text: "手で選択", color: "#1E40AF", bg: "#DBEAFE" },
  skip: { text: "当てはめない", color: "#6B7280", bg: "#F3F4F6" },
  none: { text: "未当てはめ", color: "#92400E", bg: "#FEF3C7" },
};

function MatchCell({ l, index, costs, showCost = true, excluded = false, searching, searchText, onSearchOpen, onSearchText, onPick, onCostChange }) {
  if (l.summaryOnly) return <span style={{ fontSize: 11, color: "#9A3412", fontWeight: 700 }}>総括のみ(原価未入力)</span>;
  if (!index) return <span style={{ fontSize: 11, color: "#9CA3AF" }}>単価表を読み込み中...</span>;
  const b = MATCH_BADGE[l.matchStatus];
  const badgeText = l.matchStatus === "auto" && l.score != null ? `自動(類似${Math.round(l.score * 100)}%)` : b.text;
  const options = [];
  if (l.item) options.push(l.item);
  if (l.auto.item && !options.some(o => o.id === l.auto.item.id)) options.push(l.auto.item);
  for (const c of l.auto.candidates) if (!options.some(o => o.id === c.item.id)) options.push(c.item);
  const scoreOf = id => l.auto.candidates.find(c => c.item.id === id)?.score;
  const results = searching ? searchItems(index, searchText) : [];
  const costLabel = it => { const c = costs[it.id]; return c?.cost_price != null ? `原価${Number(c.cost_price).toLocaleString()}${c.cost_confirmed ? "" : "(未確認)"}` : "原価なし"; };
  const lineCostTotal = (Number(l.qty) || 0) * (Number(l.costPrice) || 0);
  const lineGp = (Number(l.amount) || 0) - lineCostTotal;
  return (
    <div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: b.color, background: b.bg, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{badgeText}</span>
        {l.itemSetLabel && <span style={{ fontSize: 9, color: "#9CA3AF", whiteSpace: "nowrap" }}>単価セット: {l.itemSetLabel}</span>}
      </div>
      {l.matchStatus === "auto" && l.item && (
        <div style={{ fontSize: 10, color: "#92400E", marginBottom: 3 }}>
          ⚠ 自動(類似{Math.round(l.score * 100)}%): 「{l.name}{l.spec ? " " + l.spec : ""}」→「{l.item.name}{l.item.spec ? " " + l.item.spec : ""}」
          {l.item.sale_price == null && <span style={{ color: "#B45309" }}> (単価なし)</span>}
        </div>
      )}
      <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
        <select value={l.item?.id || ""} onChange={e => onPick(e.target.value || null)} style={{ ...cellInp, fontSize: 11, flex: 1, minWidth: 0 }}>
          <option value="">当てはめない(原価未入力)</option>
          {options.map(it => <option key={it.id} value={it.id}>{it.name} {it.spec || ""} / {costLabel(it)}{scoreOf(it.id) != null ? ` [類似${Math.round(scoreOf(it.id) * 100)}%]` : ""}</option>)}
        </select>
        <button onClick={onSearchOpen} title="単価表を検索" style={{ border: "1px solid #E5E7EB", background: searching ? "#EEF2FF" : "#fff", borderRadius: 6, cursor: "pointer", fontSize: 11, padding: "0 6px" }}>🔍</button>
      </div>
      {searching && (
        <div style={{ marginTop: 4, border: "1px solid #C7D2FE", borderRadius: 6, padding: 4, background: "#fff" }}>
          <input autoFocus value={searchText} onChange={e => onSearchText(e.target.value)} placeholder="名称・仕様で検索" style={{ ...cellInp, fontSize: 11, marginBottom: 3 }} />
          <div style={{ maxHeight: 140, overflowY: "auto" }}>
            {searchText && results.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF", padding: 4 }}>該当なし</div>}
            {results.map(it => (
              <div key={it.id} onClick={() => onPick(it.id)} style={{ fontSize: 11, padding: "3px 4px", cursor: "pointer", borderBottom: "1px solid #F3F4F6" }}>
                {it.name} <span style={{ color: "#9CA3AF" }}>{it.spec}</span> <span style={{ color: "#6B7280" }}>/ {costLabel(it)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {excluded ? (
        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>下請け施工(原価算入対象外)</div>
      ) : !showCost ? (
        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>下請けのみのため、原価はこの画面では入力しません</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap" }}>原価単価</span>
            <input type="number" value={l.costPrice ?? ""} placeholder="未入力" onChange={e => onCostChange(e.target.value)}
              style={{ ...cellInp, fontSize: 11, width: 72, borderColor: l.costConfirmed ? "#E5E7EB" : "#FCA5A5" }} />
          </div>
          <div style={{ fontSize: 10, marginTop: 2 }}>
            {!l.costConfirmed
              ? <span style={{ color: "#DC2626", fontWeight: 700 }}>未確認(粗利は暫定)</span>
              : <span style={{ color: "#6B7280" }}>原価計 {Math.round(lineCostTotal).toLocaleString()} / 粗利 {Math.round(lineGp).toLocaleString()}</span>}
          </div>
        </>
      )}
    </div>
  );
}

const Info = ({ label: l, value, strong }) => (
  <div>
    <div style={{ fontSize: 10, color: "#9CA3AF" }}>{l}</div>
    <div style={{ fontSize: strong ? 14 : 12, fontWeight: strong ? 800 : 600, color: strong ? "#E07B39" : "#1F2937" }}>{value}</div>
  </div>
);

// ツリーを、表示用に「深さつきの行配列」に平らにする(プレ順: グループの見出し行→その子、を繰り返す)
function flattenForDisplay(nodes, depth = 0, out = []) {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children?.length) flattenForDisplay(node.children, depth + 1, out);
  }
  return out;
}

// 葉(明細)だけの金額(掛け率をかけた後)の合計。小計行自体の金額は使わず、子の積み上げで出す
function sumLeafAmount(node, rate) {
  if (!node.children?.length) {
    const base = applyRate(node.priceA, rate);
    return lineAmount(node.qty, base);
  }
  return node.children.reduce((s, c) => s + sumLeafAmount(c, rate), 0);
}

// 取引先・営業所の「掛け率の初期値」を解決する。選択済みの案件(既存)/未登録の案件(新規)の
// どちらでも、clientId・branchIdから branch優先→company優先の順で探す
function resolveDefaultMarkup({ clientId, branchId, cos, branches }) {
  const branch = branchId ? branches.find(b => b.id === branchId) : null;
  const fromBranch = branch ? resolveMarkupChoice(branch.markup_default) : null;
  if (fromBranch) return fromBranch;
  const co = clientId ? cos.find(c => c.id === clientId) : null;
  return co ? resolveMarkupChoice(co.markupDefault) : null;
}

// ESTファイル(見積ソフトのバイナリ形式)の確認画面。ステップ3: 登録・原価の当てはめ・粗利の計算まで行う
function EstImportForm({ r, price, pjs, cos, setCos, salesReps, setSalesReps, branches, setBranches, defaultProjectId, onRegistered, onOpenQuote, onRemove }) {
  const d = r.data;
  const [lines, setLines] = useState(() => d.lines.map(l => ({ ...l, pickedItemId: undefined, costOverride: undefined, isSubcontracted: false })));
  // 工事名称。初期値はファイル内で見つかった工事名称(見つからなければファイル名)。確認画面で直せる
  const [title, setTitle] = useState(d.cover.title || "");
  // rateChoice: "none"(1.0) | "back"(×0.925) | "0.9"(×0.9) | "custom"(入力した掛け率) ※必須。
  // 手で触るまでは、取引先・営業所の「掛け率の初期値」をそのまま使う(manualの状態には入れない)
  const [manualRateChoice, setManualRateChoice] = useState(null);
  const [manualCustomRate, setManualCustomRate] = useState("");
  const [rateTouched, setRateTouched] = useState(false);
  const [outputRateChoice, setOutputRateChoice] = useState(d.cover.detectedRate === 100 ? "100" : "file");
  // ファイルの合計が見つからない場合、自分で明細の合計を確認したことのチェック(必須)
  const [totalMissingAck, setTotalMissingAck] = useState(false);
  const [status, setStatus] = useState("submitted");
  const [pickedSetId, setPriceSetId] = useState("");
  const [projectMode, setProjectMode] = useState(defaultProjectId ? "existing" : "new");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [np, setNp] = useState({ name: d.cover.title || "", clientId: "", branchId: "", salesRepId: "", inCharge: "", respondedAt: todayStr(), constructionType: "自社のみ" });
  const [searchKey, setSearchKey] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, projectId, quoteNo }
  const [arrangedMeta, setArrangedMeta] = useState([]); // [{key, group_name}] 手でドラッグ・移動した並び・グループ(ステップ2)
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // 掛け率②の初期値:取引先・営業所の「掛け率の初期値」から、手で触るまでは自動で入れる
  const selectedProject = projectMode === "existing" ? pjs.find(p => p.id === projectId) : null;
  const effClientId = projectMode === "existing" ? selectedProject?.clientId : np.clientId;
  const effBranchId = projectMode === "existing" ? selectedProject?.branchId : np.branchId;
  const autoMarkup = useMemo(() => resolveDefaultMarkup({ clientId: effClientId, branchId: effBranchId, cos, branches }), [effClientId, effBranchId, cos, branches]);
  const rateChoice = rateTouched ? manualRateChoice : (autoMarkup?.choice ?? null);
  const customRate = rateTouched ? manualCustomRate : (autoMarkup?.choice === "custom" ? String(autoMarkup.rate) : "");
  const rateAutoSource = !rateTouched && autoMarkup ? autoMarkup.rate : null;
  const setRateChoice = v => { setRateTouched(true); setManualRateChoice(v); setManualCustomRate(""); };
  const setCustomRate = v => { setRateTouched(true); setManualRateChoice("custom"); setManualCustomRate(v); };
  // 下請けの原価(まだ案件・見積が無いので、登録が終わるまではこの画面のローカル状態に置く)
  const [subCosts, setSubCosts] = useState([]);
  const [subForm, setSubForm] = useState({ subcontractor_id: "", amount: "", note: "", file: null });
  const subcontractors = cos.filter(c => c.type === "協力業者");
  const addSubCostDraft = () => {
    if (!subForm.subcontractor_id || !subForm.amount) { alert("下請け会社と金額を入力してください"); return; }
    setSubCosts(prev => [...prev, { key: "sc" + Date.now(), subcontractor_id: subForm.subcontractor_id, amount: Number(subForm.amount) || 0, note: subForm.note || "", file: subForm.file }]);
    setSubForm({ subcontractor_id: "", amount: "", note: "", file: null });
  };
  const removeSubCostDraft = key => setSubCosts(prev => prev.filter(c => c.key !== key));

  const updateLine = (key, patch) => setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const toggleGroup = key => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    // undefined(自動)→true(強制:小計)→false(強制:明細)→undefined… の順で切り替える
    const next = l.groupOverride === undefined ? true : l.groupOverride === true ? false : undefined;
    return { ...l, groupOverride: next };
  }));

  // ファイル内の行順(見積書の逆)を、見積書と同じ表示順に直してから使う
  const tree = useMemo(() => {
    const t = buildEstTree(lines);
    return { ...t, top: reverseSiblingOrder(t.top) };
  }, [lines]);
  const rows = useMemo(() => flattenForDisplay(tree.top), [tree]);
  const leaves = useMemo(() => flattenEstTree(tree.top), [tree]);

  // 手で動かした並び・グループ(arrangedMeta)を、最新のleaves(小計/明細の切り替えや
  // 項目の編集で変わる)に重ね合わせる。無くなった明細は外し、新しい明細は末尾に追加する
  const arrangedLeaves = useMemo(() => {
    const metaByKey = new Map(arrangedMeta.map(m => [m.key, m]));
    const keptOrder = arrangedMeta.filter(m => leaves.some(l => l.key === m.key));
    const newOnes = leaves.filter(l => !metaByKey.has(l.key)).map(l => ({ key: l.key, group_name: l.groupPath || "" }));
    const leafByKey = new Map(leaves.map(l => [l.key, l]));
    return [...keptOrder, ...newOnes].map(m => ({ ...leafByKey.get(m.key), group_name: m.group_name }));
  }, [leaves, arrangedMeta]);
  const handleArrange = newLines => setArrangedMeta(newLines.map(l => ({ key: l.key, group_name: l.group_name || "" })));

  const topSum100 = tree.top.reduce((s, n) => s + (Number(n.amountA) || 0), 0);
  const fileTotal100 = d.cover.totalExTax;
  const totalCheckOk = fileTotal100 != null ? Math.abs(topSum100 - fileTotal100) < 1 : null;

  // 掛け率(1.0 / 0.925 / 0.9 / カスタム(0.50〜1.20))。未選択・範囲外は
  // problemsでブロックするが、選ぶまでのプレビューは100%(rate=1)のまま表示する
  const customRateNum = Number(customRate);
  const customRateValid = customRate.trim() !== "" && Number.isFinite(customRateNum) && customRateNum >= CUSTOM_RATE_MIN && customRateNum <= CUSTOM_RATE_MAX;
  const rate = rateChoice === "back" ? MARKUP_BACK_RATE
    : rateChoice === "0.9" ? 0.9
    : rateChoice === "custom" ? (customRateValid ? customRateNum : 1)
    : 1;

  const adjustedTotal = tree.top.reduce((s, n) => s + sumLeafAmount(n, rate), 0);
  const rateMismatchWarning = outputRateChoice === "100" && d.cover.detectedRate !== 100;

  // 単価セット(原価の当てはめに使う。初期値: 工事見積用)
  const defaultSetId = price?.sets?.length ? (price.sets.find(s => s.code === "construction") || price.sets[0]).id : "";
  const priceSetId = pickedSetId || defaultSetId;

  const index = useMemo(() => {
    if (!price || !priceSetId) return null;
    return buildPriceIndex(price.items.filter(i => i.price_set_id === priceSetId), price.aliases);
  }, [price, priceSetId]);
  // 選んでいる単価セットで見つからない・自動の対象にならない時に、他のセットも探すための全体索引
  const allIndex = useMemo(() => (price ? buildPriceIndex(price.items, price.aliases) : null), [price]);
  const setNameById = useMemo(() => new Map((price?.sets || []).map(s => [s.id, s.name])), [price]);

  // 名称の頭の「N月N日」を外してから当てはめる(自社見積書Excelの取り込みと同じ)。
  // 選んでいる単価セットを優先し、見つからない時だけ他のセットも含めて探す
  const autoMatches = useMemo(() => {
    const out = {};
    if (!index) return out;
    for (const l of leaves) {
      const name = l.name.replace(DATE_PREFIX_RE, "");
      let res = matchLineSmart(index, name, l.spec, l.priceA);
      if (res.status === "none" && allIndex) {
        const resAll = matchLineSmart(allIndex, name, l.spec, l.priceA);
        if (resAll.status !== "none" || resAll.candidates.length) res = resAll;
      }
      out[l.key] = res;
    }
    return out;
  }, [index, allIndex, leaves]);

  // 原価の当てはめ・粗利の計算は、明細(葉)だけを対象にする(小計行は子の積み上げなので対象外)
  const view = arrangedLeaves.map(l => {
    const auto = autoMatches[l.key] || { status: "none", item: null, candidates: [] };
    const picked = l.pickedItemId !== undefined;
    const item = picked ? (l.pickedItemId ? allIndex?.byId.get(l.pickedItemId) || null : null) : auto.item;
    const matchStatus = picked ? (item ? "manual" : "skip") : auto.status;
    const cost = item ? price?.costs[item.id] : null;
    const basePrice = applyRate(l.priceA, rate);
    const amount = lineAmount(l.qty, basePrice);
    const costPrice = l.costOverride !== undefined ? l.costOverride.price : (cost?.cost_price ?? null);
    const costConfirmed = l.costOverride !== undefined ? l.costOverride.confirmed : (!!cost?.cost_confirmed && costPrice != null);
    const itemSetLabel = item && item.price_set_id !== priceSetId ? setNameById.get(item.price_set_id) : null;
    const matchName = l.name.replace(DATE_PREFIX_RE, "");
    return { ...l, auto, item, matchStatus, basePrice, amount, costPrice, costConfirmed, score: auto.score, itemSetLabel, matchName };
  });
  const viewByKey = useMemo(() => Object.fromEntries(view.map(v => [v.key, v])), [view]);

  const constructionType = projectMode === "existing" ? (selectedProject?.constructionType || "自社のみ") : (np.constructionType || "自社のみ");
  const isMixed = constructionType === "自社+下請け";
  const isSubOnly = constructionType === "下請けのみ";
  const showSubCheckCol = isMixed;
  const showCostCol = !isSubOnly;
  const subAmountTotal = subCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const financials = computeQuoteFinancials({
    constructionType, saleTotal: adjustedTotal,
    lines: view.map(l => ({ qty: l.qty, costPrice: l.costPrice, costConfirmed: l.costConfirmed, isSubcontracted: l.isSubcontracted })),
    subAmountTotal, subCount: subCosts.length,
  });
  const { costTotal, gp, gpRate, provisional, subMissing, ownUnconfirmed } = financials;
  const unmatchedCount = view.filter(l => !l.item).length;
  const autoMatchCount = view.filter(l => l.matchStatus === "auto").length;

  const similarProjects = useMemo(() => {
    const t = normalizeText(projectMode === "new" ? np.name : "");
    if (!t) return [];
    return pjs.map(p => {
      const n = normalizeText(p.name);
      const score = n && (n.includes(t) || t.includes(n)) ? 1 : similarity(t, p.name);
      return { p, score };
    }).filter(x => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [pjs, projectMode, np.name]);

  const repName = s => s?.name || s?.display_name || "";

  const problems = [];
  if (!rateChoice) problems.push("「掛け率」を選んでください");
  else if (rateChoice === "custom" && !customRateValid) problems.push(`掛け率は${CUSTOM_RATE_MIN}〜${CUSTOM_RATE_MAX}の範囲で入力してください`);
  if (!title.trim()) problems.push("見積タイトルを入力してください");
  if (totalCheckOk === false) problems.push("組み立てた合計が、ファイルに保存されている合計と一致していません(明細・小計/明細の切り替えを確認してください)");
  else if (totalCheckOk == null && !totalMissingAck) problems.push("ファイルの合計を確認できなかったことを、チェックで確認してください");
  if (!priceSetId) problems.push("単価セットを選んでください");
  if (projectMode === "existing" && !projectId) problems.push("追加先の案件を選んでください");
  if (projectMode === "new" && !np.name.trim()) problems.push("案件名を入力してください");

  const register = async () => {
    if (problems.length || registering) return;
    setRegistering(true);
    const rep = salesReps.find(s => s.id === np.salesRepId);
    const pProject = projectMode === "existing" ? { id: projectId } : {
      name: np.name.trim(), status: "発注待ち", clientId: np.clientId || null,
      salesRepId: np.salesRepId || null, salesRep: repName(rep), inCharge: np.inCharge.trim(),
      subcontractorIds: [], quoteDate: "",
    };
    const memo = `見積ファイル「${r.fileName}」(ESTファイル)から取り込み。${rateChoice === "none" ? "掛け率1.0のまま登録" : `掛け率×${rate}でIGUMIの販売金額を計算して登録`}。ファイルの税抜合計(100%) ${fileTotal100?.toLocaleString()}円`;
    const appliedRates = { rate, choice: rateChoice, est_output_rate: d.cover.detectedRate ?? null };
    const pQuote = { title: title.trim(), price_set_id: priceSetId, status, total_amount: Math.round(adjustedTotal), issued_at: null, memo };
    const pItems = view.map(l => ({
      price_item_id: l.item?.id ?? null,
      line_type: l.item ? "item" : "adjust",
      group_name: l.group_name || "",
      name: l.name, spec: l.spec || "", unit: l.unit || "",
      qty: Number(l.qty) || 0, sale_price: l.basePrice,
      note: l.note || null,
      cost_price: l.costPrice, cost_confirmed: l.costConfirmed,
    }));
    const subFlagsBySortOrder = view.map((l, i) => [i, !!l.isSubcontracted]).filter(([, flag]) => flag).map(([i]) => i);
    // 別名辞書への保存: 手で選んだ行は必ず保存。自動(類似)で当てはめた行は、類似度0.85以上だけ保存する
    const pAliases = view.filter(l => l.item && (l.matchStatus === "manual" || (l.matchStatus === "auto" && l.score >= AUTO_MATCH_LEARN_SCORE)))
      .map(l => ({ alias: aliasKey(l.matchName, l.spec), price_item_id: l.item.id }));

    // 1) 元ファイル(EST)を Storage(非公開バケット)に保存。保存名は ID + 拡張子、元の名前は別に記録する
    const ext = (r.fileName.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "est").toLowerCase();
    const storagePath = `${crypto.randomUUID()}.${ext}`;
    const contentType = FILE_TYPES[ext] || "application/octet-stream";
    const { error: upErr } = await supabase.storage.from(QUOTE_FILE_BUCKET).upload(storagePath, r.file, { contentType, upsert: false });
    if (upErr) {
      setResult({ ok: false, message: `元ファイルの保存に失敗しました。何も登録されていません。(${upErr.message})` });
      setRegistering(false);
      return;
    }

    // 2) 案件・見積・明細・原価・別名・ファイルの記録を、1つのトランザクションで登録
    const pFile = { storage_path: storagePath, original_name: r.fileName, size: r.size, content_type: contentType };
    const { data, error } = await supabase.rpc("import_quote", { p_project: pProject, p_quote: pQuote, p_items: pItems, p_aliases: pAliases, p_file: pFile });
    if (error) {
      const missing = /import_quote|function|schema cache/i.test(error.message || "");
      setResult({ ok: false, message: `登録できませんでした。案件・見積は登録されていません。(${error.message})${missing ? " ※ 取り込み用のSQLが未実行の可能性があります" : ""}`, orphanPath: storagePath });
      setRegistering(false);
      return;
    }
    if (projectMode === "new" && (np.respondedAt || np.branchId || np.constructionType)) {
      await supabase.from("projects").update({
        ...(np.respondedAt ? { respondedAt: np.respondedAt } : {}),
        ...(np.branchId ? { branchId: np.branchId } : {}),
        ...(np.constructionType ? { constructionType: np.constructionType } : {}),
      }).eq("id", data.project_id);
    }
    // 使った掛け率とESTの出力率を残す(import_quoteのSQLは直さず、登録後の更新で済ませる)
    await supabase.from("quotes").update({ applied_rates: appliedRates }).eq("id", data.quote_id);
    await applySubcontractorFollowUps({ quoteId: data.quote_id, subFlagsBySortOrder, subCosts });
    await onRegistered(data.project_id);
    setResult({ ok: true, projectId: data.project_id, quoteNo: data.quote_no, projectName: projectMode === "existing" ? pjs.find(p => p.id === projectId)?.name : np.name.trim() });
    setRegistering(false);
  };

  const locked = !!result?.ok;

  return (
    <div style={{ ...card, borderLeft: `4px solid ${locked ? "#059669" : totalCheckOk === false ? "#DC2626" : "#1A3A5C"}` }}>
      <CardHead fileName={r.fileName} onRemove={onRemove} locked={locked} />

      {locked ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>登録の結果</div>
          <div style={{ fontSize: 13, color: "#065F46", marginBottom: 4 }}>✅ 元ファイルの保管: 保存しました(案件の見積一覧から開けます)</div>
          <div style={{ fontSize: 13, color: "#065F46", marginBottom: 10 }}>✅ 案件・見積・明細・原価: 登録しました(案件「{result.projectName}」/ 見積 No.{result.quoteNo})</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>案件の受注金額・粗利は変わっていません。反映するには、見積一覧で「採用にする」を押してください。</div>
          <button onClick={() => onOpenQuote(result.projectId)} style={{ width: "100%", padding: "10px 0", background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📝 見積一覧を開く →</button>
        </div>
      ) : (
      <>


      {autoMatchCount > 0 && (
        <div style={{ background: "#EDE9FE", color: "#5B21B6", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
          ⚠ 自動(類似)で当てはめた行: {autoMatchCount}件(下の明細一覧で、当てはめ先を確認してください)
        </div>
      )}

      {/* 表紙 */}
      <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={sectionTitle}>表紙(EST)</div>
        <div style={{ marginBottom: 8 }}>
          <div style={label}>見積タイトル(初期値 = 工事名称)*</div>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6, fontSize: 12 }}>
          <Info label="合計(税抜・100%)" value={yen(d.cover.totalExTax)} strong />
          <Info label="合計(ファイルの出力率)" value={yen(d.cover.totalExTax130)} />
          <Info label="検出した出力率" value={`${d.cover.detectedRate}%`} />
        </div>
      </div>

      {/* 検算: 組み立てた階層のトップレベル合計 と、ファイルに保存されている合計(100%)を照合 */}
      <div style={{ marginBottom: 12 }}>
        <div style={sectionTitle}>検算(小計の組み立て)</div>
        {totalCheckOk == null
          ? (
            <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>
              ⚠️ ファイルに保存されている合計金額が見つかりませんでした。検算できていません(明細の合計 {yen(topSum100)})
              <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, fontWeight: 400, marginTop: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={totalMissingAck} onChange={e => setTotalMissingAck(e.target.checked)} />
                <span>ファイルの合計を確認できませんでした。明細の合計を確認しました</span>
              </label>
            </div>
          )
          : totalCheckOk
            ? <div style={{ background: "#ECFDF5", color: "#065F46", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>✅ 組み立てた明細の合計({yen(topSum100)})が、ファイル保存の合計と一致しています</div>
            : <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>⚠️ 組み立てた明細の合計({yen(topSum100)})が、ファイル保存の合計({yen(fileTotal100)})と一致しません。下の明細一覧で、小計/明細の割り当てを確認してください</div>}
        {d.warnings.filter(w => !w.includes("検算")).map((w, i) => <div key={i} style={{ fontSize: 11, color: "#92400E", marginTop: 4 }}>⚠️ {w}</div>)}
      </div>

      {/* ①ESTの出力率(必須・自動判定ずみ・手で変更可) */}
      <div style={{ border: "2px solid #E5E7EB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C", marginBottom: 6 }}>① このESTの出力率は?</div>
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, marginBottom: 4, cursor: "pointer" }}>
          <input type="radio" name={`rate-${r.key}`} checked={outputRateChoice === "file"} onChange={() => setOutputRateChoice("file")} />
          <span>検出通り(<b>{d.cover.detectedRate}%</b>出力のファイル)</span>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
          <input type="radio" name={`rate-${r.key}`} checked={outputRateChoice === "100"} onChange={() => setOutputRateChoice("100")} />
          <span><b>100%</b>出力のファイル</span>
        </label>
        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>いずれの場合も、IGUMIの販売金額のもとは「100%の金額」(単価A)を使います。この選択は確認用です</div>
        {rateMismatchWarning && <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 700, marginTop: 4 }}>⚠️ ファイルから検出した出力率({d.cover.detectedRate}%)と選択が違います</div>}
      </div>

      {/* ②掛け率(必須) */}
      <div style={{ border: `2px solid ${rateChoice ? "#E5E7EB" : "#E07B39"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C", marginBottom: 6 }}>② 掛け率 *(必須)</div>
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>IGUMIの販売金額 = 100%の単価 × 掛け率</div>
        {MARKUP_CHOICE_OPTIONS.map(o => (
          <label key={o.key} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, marginBottom: 4, cursor: "pointer" }}>
            <input type="radio" name={`mk-${r.key}`} checked={rateChoice === o.key} onChange={() => setRateChoice(o.key)} />
            <span><b>{o.label}</b></span>
          </label>
        ))}
        {rateChoice === "custom" && (
          <div style={{ marginLeft: 22, marginBottom: 4 }}>
            <input type="number" step="0.001" min={CUSTOM_RATE_MIN} max={CUSTOM_RATE_MAX} value={customRate} onChange={e => setCustomRate(e.target.value)}
              placeholder={`${CUSTOM_RATE_MIN}〜${CUSTOM_RATE_MAX}`} style={{ width: 100, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${customRateValid ? "#E5E7EB" : "#FCA5A5"}`, fontSize: 12, color: "#1F2937" }} />
            {!customRateValid && <span style={{ fontSize: 11, color: "#DC2626", marginLeft: 6 }}>{CUSTOM_RATE_MIN}〜{CUSTOM_RATE_MAX}の範囲で入力してください</span>}
          </div>
        )}
        {rateAutoSource != null && !rateTouched && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>取引先の初期値(×{rateAutoSource})を使っています</div>}
        {rateChoice && rateChoice !== "none" && (customRateValid || rateChoice !== "custom") && (
          <div style={{ marginTop: 8, background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#374151" }}>
            100%の合計 {yen(topSum100)} × {rate} = {yen(roundYen(topSum100 * rate))} / 単価ごとに戻した合計 {yen(adjustedTotal)}
            <span style={{ marginLeft: 6, fontWeight: 700, color: "#9A3412" }}>差額 {(adjustedTotal - roundYen(topSum100 * rate)).toLocaleString()}円</span>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>差額は、明細ごとに単価の円未満を四捨五入したことによるものです</div>
          </div>
        )}
      </div>

      {/* 登録先(案件・見積の設定) */}
      <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={sectionTitle}>登録先</div>
        <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 13 }}>
          <label style={{ cursor: "pointer" }}><input type="radio" name={`pm-${r.key}`} checked={projectMode === "existing"} onChange={() => setProjectMode("existing")} /> 既存の案件に追加</label>
          <label style={{ cursor: "pointer" }}><input type="radio" name={`pm-${r.key}`} checked={projectMode === "new"} onChange={() => setProjectMode("new")} /> 新しい案件を作る</label>
        </div>

        {projectMode === "new" && similarProjects.length > 0 && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>⚠️ 名前の似た案件があります(二重登録に注意)</div>
            {similarProjects.map(({ p }) => (
              <button key={p.id} onClick={() => { setProjectMode("existing"); setProjectId(p.id); }} style={{ display: "block", width: "100%", textAlign: "left", background: projectMode === "existing" && projectId === p.id ? "#FDE68A" : "#fff", border: "1px solid #FCD34D", borderRadius: 6, padding: "4px 8px", marginBottom: 3, fontSize: 12, cursor: "pointer", color: "#1F2937" }}>
                {p.name}<span style={{ color: "#9CA3AF", marginLeft: 6 }}>{p.status}</span><span style={{ float: "right", color: "#92400E" }}>この案件に追加 →</span>
              </button>
            ))}
          </div>
        )}

        {projectMode === "existing" ? (
          <div style={{ marginBottom: 8 }}>
            <div style={label}>追加先の案件 *</div>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inp}>
              <option value="">選択してください</option>
              {pjs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {selectedProject && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>施工形態: {constructionType}(案件の設定。変更は案件の編集画面で行います)</div>}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: "1 1 100%" }}>
              <div style={label}>案件名 *(初期値 = 工事名称)</div>
              <input value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} style={inp} />
            </div>
            <div style={{ flex: "1 1 100%" }}>
              <ClientBranchRepPicker
                clientId={np.clientId} branchId={np.branchId} salesRepId={np.salesRepId}
                cos={cos} setCos={setCos} branches={branches} setBranches={setBranches} salesReps={salesReps} setSalesReps={setSalesReps}
                onChange={patch => setNp({ ...np, clientId: patch.clientId, branchId: patch.branchId, salesRepId: patch.salesRepId })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={label}>現場担当(社内)</div>
              <input value={np.inCharge} onChange={e => setNp({ ...np, inCharge: e.target.value })} style={inp} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={label}>対応日(見積などの対応をした日)</div>
              <input type="date" value={np.respondedAt} onChange={e => setNp({ ...np, respondedAt: e.target.value })} style={inp} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={label}>施工形態</div>
              <select value={np.constructionType} onChange={e => setNp({ ...np, constructionType: e.target.value })} style={inp}>
                {CONSTRUCTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={label}>見積の状態</div>
            <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
              {QUOTE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={label}>単価セット(原価の当てはめに使う)</div>
            <select value={priceSetId} onChange={e => setPriceSetId(e.target.value)} style={inp}>
              {(price?.sets || []).map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 明細(階層つき) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={sectionTitle}>明細({lines.length}行 / 小計{rows.filter(x => x.node.children.length > 0).length}件)</div>
        {tree.mismatchKeys.length > 0 && <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 小計にした行で、金額が子の合計と一致しないものが{tree.mismatchKeys.length}件あります</div>}
        {unmatchedCount > 0 && <div style={{ fontSize: 11, color: "#B45309", fontWeight: 700 }}>単価表に当てはまらない行: {unmatchedCount}行(原価未入力)</div>}
      </div>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>各行の「小計/明細」ボタンで、自動判定を手で切り替えられます(自動→小計→明細→自動…)</div>
      <div style={{ overflowX: "auto", marginBottom: 6 }}>
        <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
              <th style={th}>種別</th><th style={th}>名称</th><th style={th}>材質・寸法</th>
              <th style={th}>数量</th><th style={th}>単位</th>
              <th style={th}>単価(100%)</th><th style={th}>単価(ファイルの出力率・参考)</th>
              {rate !== 1 && <th style={th}>単価(IGUMI販売)</th>}
              <th style={{ ...th, textAlign: "right" }}>金額</th>
              <th style={th}>備考</th>
              {showSubCheckCol && <th style={{ ...th, textAlign: "center" }}>下請け施工</th>}
              <th style={th}>単価表の項目{showCostCol ? "(原価)" : ""}</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node: l, depth }) => {
              const isLeaf = !l.children?.length;
              const mismatch = tree.mismatchKeys.includes(l.key);
              const basePrice = applyRate(l.priceA, rate);
              const amount = isLeaf ? lineAmount(l.qty, basePrice) : sumLeafAmount(l, rate);
              const v = isLeaf ? viewByKey[l.key] : null;
              return (
                <tr key={l.key} style={{ borderBottom: "1px solid #F3F4F6", background: mismatch ? "#FEF2F2" : !isLeaf ? "#FFF7ED" : "transparent" }}>
                  <td style={{ ...td, width: 70 }}>
                    <button onClick={() => toggleGroup(l.key)} title="小計/明細を切り替える" style={{ border: "1px solid #E5E7EB", background: isLeaf ? "#fff" : "#FDE68A", borderRadius: 6, cursor: "pointer", fontSize: 10, padding: "3px 6px", fontWeight: 700, color: isLeaf ? "#6B7280" : "#92400E", whiteSpace: "nowrap" }}>
                      {isLeaf ? "明細" : "小計"}{l.groupOverride !== undefined ? "(手動)" : ""}
                    </button>
                  </td>
                  <td style={{ ...td, width: 150, paddingLeft: 6 + depth * 14 }}>
                    <input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} style={{ ...cellInp, fontWeight: isLeaf ? 400 : 700, color: isLeaf ? "#1F2937" : "#9A3412" }} />
                  </td>
                  <td style={{ ...td, width: 170 }}><input value={l.spec} onChange={e => updateLine(l.key, { spec: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>
                  <td style={{ ...td, width: 56 }}><input type="number" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} style={{ ...cellInp, textAlign: "right" }} disabled={!isLeaf} /></td>
                  <td style={{ ...td, width: 46 }}><input value={l.unit} onChange={e => updateLine(l.key, { unit: e.target.value })} style={cellInp} /></td>
                  <td style={{ ...td, textAlign: "right", width: 80 }}>{num(l.priceA)}</td>
                  <td style={{ ...td, textAlign: "right", width: 90, color: "#9CA3AF", fontSize: 11 }}>{num(l.priceB)}({d.cover.detectedRate}%)</td>
                  {rate !== 1 && <td style={{ ...td, textAlign: "right", width: 80 }}>{num(basePrice)}</td>}
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#E07B39", width: 80 }}>{num(amount)}</td>
                  <td style={{ ...td, width: 110 }}><input value={l.note} onChange={e => updateLine(l.key, { note: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>
                  {showSubCheckCol && (
                    <td style={{ ...td, textAlign: "center", width: 60 }}>
                      {isLeaf && <input type="checkbox" checked={!!l.isSubcontracted} onChange={e => updateLine(l.key, { isSubcontracted: e.target.checked })} />}
                    </td>
                  )}
                  <td style={{ ...td, width: 230 }}>
                    {isLeaf
                      ? <MatchCell l={v} index={index} costs={price?.costs || {}}
                          showCost={showCostCol} excluded={isMixed && l.isSubcontracted}
                          searching={searchKey === l.key} searchText={searchText}
                          onSearchOpen={() => { setSearchKey(searchKey === l.key ? null : l.key); setSearchText(""); }}
                          onSearchText={setSearchText}
                          onPick={id => { updateLine(l.key, { pickedItemId: id, costOverride: undefined }); setSearchKey(null); }}
                          onCostChange={val => updateLine(l.key, { costOverride: val === "" ? { price: null, confirmed: false } : { price: Number(val), confirmed: true } })} />
                      : <span style={{ fontSize: 11, color: "#9CA3AF" }}>小計(原価対象外)</span>}
                  </td>
                  <td style={{ ...td, width: 30 }}>
                    <button onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))} title="この行を削除" style={{ border: "none", background: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>🗑</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 12 }}>オレンジの行 = 小計(グループ)。ピンクの行 = 小計にしたが、子の金額の合計と一致しない(ベストエフォートで組み立て)</div>

      {/* ③ 並び替え・グループ分け(ステップ2)。②までで組み立てた明細を、ドラッグや
          ボタンで並べ替えたり、別のグループに移したりできる。原価の当てはめもここで行う */}
      <div style={{ marginBottom: 6 }}>
        <div style={sectionTitle}>③ 並び替え・グループ分け・原価の当てはめ</div>
        <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>⠿をドラッグ、または↑↓・📂(このグループに移す)で並べ替え・グループ分けができます</div>
      </div>
      <BundleToolbar lines={view} onChange={handleArrange} selectedKeys={selectedKeys} setSelectedKeys={setSelectedKeys} />
      {unmatchedCount > 0 && <div style={{ fontSize: 11, color: "#B45309", fontWeight: 700, marginBottom: 6 }}>単価表に当てはまらない行: {unmatchedCount}行(原価未入力)</div>}
      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
              <th style={th}></th>
              <th style={th}>名称</th><th style={th}>材質・寸法</th>
              <th style={th}>数量</th>
              <th style={{ ...th, textAlign: "right" }}>金額</th>
              {showSubCheckCol && <th style={{ ...th, textAlign: "center" }}>下請け施工</th>}
              <th style={th}>単価表の項目{showCostCol ? "(原価)" : ""}</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            <GroupTree
              lines={view}
              onChange={handleArrange}
              amountOf={l => l.amount}
              formatAmount={yen}
              columnCount={4 + (showSubCheckCol ? 1 : 0) + 1}
              selectedKeys={selectedKeys}
              onToggleSelect={key => setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
              renderLeafCells={l => {
                const cells = [
                  <td key="name" style={{ ...td, width: 150 }}>{l.name}</td>,
                  <td key="spec" style={{ ...td, width: 150, fontSize: 11 }}>{l.spec}</td>,
                  <td key="qty" style={{ ...td, width: 50, textAlign: "right" }}>{num(l.qty)}{l.unit}</td>,
                  <td key="amount" style={{ ...td, textAlign: "right", fontWeight: 700, color: "#E07B39", width: 80 }}>{num(l.amount)}</td>,
                ];
                if (showSubCheckCol) {
                  cells.push(
                    <td key="subflag" style={{ ...td, textAlign: "center", width: 60 }}>
                      <input type="checkbox" checked={!!l.isSubcontracted} onChange={e => updateLine(l.key, { isSubcontracted: e.target.checked })} />
                    </td>
                  );
                }
                cells.push(
                  <td key="cost" style={{ ...td, width: 220 }}>
                    <MatchCell l={l} index={index} costs={price?.costs || {}}
                      showCost={showCostCol} excluded={isMixed && l.isSubcontracted}
                      searching={searchKey === l.key} searchText={searchText}
                      onSearchOpen={() => { setSearchKey(searchKey === l.key ? null : l.key); setSearchText(""); }}
                      onSearchText={setSearchText}
                      onPick={id => { updateLine(l.key, { pickedItemId: id, costOverride: undefined }); setSearchKey(null); }}
                      onCostChange={val => updateLine(l.key, { costOverride: val === "" ? { price: null, confirmed: false } : { price: Number(val), confirmed: true } })} />
                  </td>
                );
                return cells;
              }}
            />
          </tbody>
        </table>
      </div>

      {constructionType !== "自社のみ" && (
        <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
          <div style={sectionTitle}>🏗 下請けの原価({subCosts.length}件)</div>
          {subCosts.length === 0 && <div style={{ padding: "4px 0", fontSize: 12, color: "#9CA3AF" }}>まだ登録されていません(粗利は暫定になります)</div>}
          {subCosts.map(c => {
            const subCo = cos.find(x => x.id === c.subcontractor_id);
            return (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #F3F4F6" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{subCo?.name || "不明な会社"}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{yen(c.amount)}{c.note ? ` ・ ${c.note}` : ""}{c.file ? ` ・ 📎 ${c.file.name}` : ""}</div>
                </div>
                <button onClick={() => removeSubCostDraft(c.key)} style={{ background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid #F3F4F6" }}>
            <select value={subForm.subcontractor_id} onChange={e => setSubForm({ ...subForm, subcontractor_id: e.target.value })} style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#fff", color: "#1F2937" }}>
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
            <button onClick={addSubCostDraft} style={{ background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ 追加</button>
          </div>
          <SubQuoteFileReader
            file={subForm.file} subcontractors={subcontractors} hasCompanySelected={!!subForm.subcontractor_id}
            onPickAmount={v => setSubForm(f => ({ ...f, amount: String(v) }))}
            onPickCompany={id => setSubForm(f => ({ ...f, subcontractor_id: id }))}
          />
        </div>
      )}

      {/* 合計・粗利 */}
      <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 13, color: "#6B7280" }}>IGUMIの販売金額の合計(税抜)</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#1A3A5C" }}>{yen(adjustedTotal)}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 4 }}>🔒 社内用</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>原価合計 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{yen(costTotal)}</span></div>
          <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>粗利 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{yen(gp)}{provisional ? "(暫定)" : ""}</span></div>
          <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>粗利率 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{gpRate == null ? "—" : `${gpRate.toFixed(1)}%`}</span></div>
        </div>
        {ownUnconfirmed && <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 原価が未入力・未確認の明細があります。粗利は暫定です</div>}
        {subMissing && <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 下請けの原価が1件も登録されていません。粗利は暫定です</div>}
        <div style={{ marginTop: 4, fontSize: 11, color: "#6B7280" }}>※ 原価は、いまの単価表の原価をコピーします。過去の見積の場合、粗利は「いまの原価」での目安です</div>
      </div>

      {result && !result.ok && (
        <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          <div>❌ {result.message}</div>
          {result.orphanPath && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>※ 元ファイルだけが Storage に残っています(quote-files / {result.orphanPath})。もう一度登録すると、新しい名前で保存し直します。</div>}
        </div>
      )}
      {problems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {problems.map((p, i) => <div key={i} style={{ fontSize: 12, color: "#B45309" }}>・{p}</div>)}
        </div>
      )}
      <button onClick={register} disabled={problems.length > 0 || registering} style={{ width: "100%", padding: "12px 0", background: problems.length ? "#9CA3AF" : "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: problems.length || registering ? "default" : "pointer", opacity: registering ? 0.6 : 1 }}>
        {registering ? "登録中..." : "💾 この内容で登録する"}
      </button>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, textAlign: "center" }}>案件の受注金額・粗利は変わりません(反映は見積一覧の「採用にする」で行います)</div>
      </>
      )}
    </div>
  );
}

// 「N月N日」形式の日付の頭を、単価表への当てはめの前に外す(見た目の名称には残す)
const DATE_PREFIX_RE = /^\d{1,2}月\d{1,2}日/;

// Excel(.xls/.xlsx)で、シート名に「大項目」と「明細」がある形式(コンクル由来の自社見積書)の確認画面。
// ESTの確認画面と同じ作り(元請が絡むかの4択・単価表への当てはめ・原価の手入力・並び替え・登録)にする
function SelfQuoteImportForm({ r, price, pjs, cos, setCos, salesReps, setSalesReps, branches, setBranches, defaultProjectId, onRegistered, onOpenQuote, onRemove }) {
  const d = r.data;
  const [title, setTitle] = useState(d.cover.title || "");
  const [issuedDate, setIssuedDate] = useState(d.cover.issuedDate || "");
  const [status, setStatus] = useState("submitted");
  // rateChoice: "none"(1.0) | "back"(×0.925) | "0.9"(×0.9) | "custom"(入力した掛け率) ※必須。
  // 手で触るまでは、取引先・営業所の「掛け率の初期値」をそのまま使う(manualの状態には入れない)
  const [manualRateChoice, setManualRateChoice] = useState(null);
  const [manualCustomRate, setManualCustomRate] = useState("");
  const [rateTouched, setRateTouched] = useState(false);
  const [pickedSetId, setPriceSetId] = useState("");
  const [projectMode, setProjectMode] = useState(defaultProjectId ? "existing" : "new");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [np, setNp] = useState({ name: d.cover.title || "", clientId: "", branchId: "", salesRepId: "", inCharge: "", respondedAt: todayStr(), constructionType: "自社のみ" });
  const [lines, setLines] = useState(() => d.lines.map(l => ({
    key: "il" + (++lineSeq), groupName: l.groupName, name: l.name, spec: l.spec, qty: l.qty ?? 0, unit: l.unit,
    price: l.price ?? 0, note: l.note, summaryOnly: false, nameFromSpec: false, fileAmount: l.amount,
    pickedItemId: undefined, costOverride: undefined, isSubcontracted: false,
  })));
  const [searchKey, setSearchKey] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  // 下請けの原価(まだ案件・見積が無いので、登録が終わるまではこの画面のローカル状態に置く)
  const [subCosts, setSubCosts] = useState([]);
  const [subForm, setSubForm] = useState({ subcontractor_id: "", amount: "", note: "", file: null });
  const subcontractors = cos.filter(c => c.type === "協力業者");
  const addSubCostDraft = () => {
    if (!subForm.subcontractor_id || !subForm.amount) { alert("下請け会社と金額を入力してください"); return; }
    setSubCosts(prev => [...prev, { key: "sc" + Date.now(), subcontractor_id: subForm.subcontractor_id, amount: Number(subForm.amount) || 0, note: subForm.note || "", file: subForm.file }]);
    setSubForm({ subcontractor_id: "", amount: "", note: "", file: null });
  };
  const removeSubCostDraft = key => setSubCosts(prev => prev.filter(c => c.key !== key));

  // 掛け率②の初期値:取引先・営業所の「掛け率の初期値」から、手で触るまでは自動で入れる
  const selectedProject = projectMode === "existing" ? pjs.find(p => p.id === projectId) : null;
  const effClientId = projectMode === "existing" ? selectedProject?.clientId : np.clientId;
  const effBranchId = projectMode === "existing" ? selectedProject?.branchId : np.branchId;
  const autoMarkup = useMemo(() => resolveDefaultMarkup({ clientId: effClientId, branchId: effBranchId, cos, branches }), [effClientId, effBranchId, cos, branches]);
  const rateChoice = rateTouched ? manualRateChoice : (autoMarkup?.choice ?? null);
  const customRate = rateTouched ? manualCustomRate : (autoMarkup?.choice === "custom" ? String(autoMarkup.rate) : "");
  const rateAutoSource = !rateTouched && autoMarkup ? autoMarkup.rate : null;
  const setRateChoice = v => { setRateTouched(true); setManualRateChoice(v); setManualCustomRate(""); };
  const setCustomRate = v => { setRateTouched(true); setManualRateChoice("custom"); setManualCustomRate(v); };

  // ドラッグ・ボタンでの並べ替え・グループ分け。group_nameを直接書き換える
  const handleArrangeSelf = newLines => setLines(prev => {
    const prevByKey = new Map(prev.map(l => [l.key, l]));
    return newLines.map(nl => ({ ...prevByKey.get(nl.key), groupName: nl.group_name }));
  });

  // 単価セットの初期値: 事務員さん用(漏水調査費のため)
  const defaultSetId = price?.sets?.length ? (price.sets.find(s => s.code === "clerk") || price.sets[0]).id : "";
  const priceSetId = pickedSetId || defaultSetId;

  const index = useMemo(() => {
    if (!price || !priceSetId) return null;
    return buildPriceIndex(price.items.filter(i => i.price_set_id === priceSetId), price.aliases);
  }, [price, priceSetId]);
  // 選んでいる単価セットで見つからない・自動の対象にならない時に、他のセットも探すための全体索引
  const allIndex = useMemo(() => (price ? buildPriceIndex(price.items, price.aliases) : null), [price]);
  const setNameById = useMemo(() => new Map((price?.sets || []).map(s => [s.id, s.name])), [price]);

  // 名称の頭の「N月N日」を外してから当てはめる。名称+材質寸法が同じで単価が違う項目が複数あれば、
  // ファイルの単価と同じ販売単価の項目を優先する(matchLineSmartが行う)。選んでいる単価セットを優先し、
  // 見つからない時だけ他のセットも含めて探す
  const autoMatches = useMemo(() => {
    const out = {};
    if (!index) return out;
    for (const l of lines) {
      const strippedName = l.name.replace(DATE_PREFIX_RE, "");
      let res = matchLineSmart(index, strippedName, l.spec, l.price);
      if (res.status === "none" && allIndex) {
        const resAll = matchLineSmart(allIndex, strippedName, l.spec, l.price);
        if (resAll.status !== "none" || resAll.candidates.length) res = resAll;
      }
      out[l.key] = res;
    }
    return out;
  }, [index, allIndex, lines]);

  const fileTotal = d.linesTotal; // 100%の合計(ファイルの明細の合計)
  const customRateNum = Number(customRate);
  const customRateValid = customRate.trim() !== "" && Number.isFinite(customRateNum) && customRateNum >= CUSTOM_RATE_MIN && customRateNum <= CUSTOM_RATE_MAX;
  const rate = rateChoice === "back" ? MARKUP_BACK_RATE
    : rateChoice === "0.9" ? 0.9
    : rateChoice === "custom" ? (customRateValid ? customRateNum : 1)
    : 1;

  const view = lines.map(l => {
    const auto = autoMatches[l.key] || { status: "none", item: null, candidates: [] };
    const picked = l.pickedItemId !== undefined;
    const item = picked ? (l.pickedItemId ? allIndex?.byId.get(l.pickedItemId) || null : null) : auto.item;
    const matchStatus = picked ? (item ? "manual" : "skip") : auto.status;
    const cost = item ? price?.costs[item.id] : null;
    const basePrice = applyRate(l.price, rate);
    const amount = lineAmount(l.qty, basePrice);
    const costPrice = l.costOverride !== undefined ? l.costOverride.price : (cost?.cost_price ?? null);
    const costConfirmed = l.costOverride !== undefined ? l.costOverride.confirmed : (!!cost?.cost_confirmed && costPrice != null);
    const itemSetLabel = item && item.price_set_id !== priceSetId ? setNameById.get(item.price_set_id) : null;
    const matchName = l.name.replace(DATE_PREFIX_RE, "");
    return { ...l, auto, item, matchStatus, basePrice, amount, costPrice, costConfirmed, score: auto.score, itemSetLabel, matchName };
  });

  const total = view.reduce((s, l) => s + l.amount, 0);
  const constructionType = projectMode === "existing" ? (selectedProject?.constructionType || "自社のみ") : (np.constructionType || "自社のみ");
  const isMixed = constructionType === "自社+下請け";
  const isSubOnly = constructionType === "下請けのみ";
  const showSubCheckCol = isMixed;
  const showCostCol = !isSubOnly;
  const subAmountTotal = subCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const financials = computeQuoteFinancials({
    constructionType, saleTotal: total,
    lines: view.map(l => ({ qty: l.qty, costPrice: l.costPrice, costConfirmed: l.costConfirmed, isSubcontracted: l.isSubcontracted })),
    subAmountTotal, subCount: subCosts.length,
  });
  const { costTotal, gp, gpRate, provisional, subMissing, ownUnconfirmed } = financials;
  const unmatchedCount = view.filter(l => !l.item).length;
  const autoMatchCount = view.filter(l => l.matchStatus === "auto").length;
  const ngChecks = d.checks.filter(c => c.ok === false);

  const similarProjects = useMemo(() => {
    const t = normalizeText(title);
    if (!t) return [];
    return pjs.map(p => {
      const n = normalizeText(p.name);
      const score = n && (n.includes(t) || t.includes(n)) ? 1 : similarity(title, p.name);
      return { p, score };
    }).filter(x => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [pjs, title]);

  const repName = s => s?.name || s?.display_name || "";
  const updateLine = (key, patch) => setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = key => setLines(prev => prev.filter(l => l.key !== key));

  const problems = [];
  if (!rateChoice) problems.push("「掛け率」を選んでください");
  else if (rateChoice === "custom" && !customRateValid) problems.push(`掛け率は${CUSTOM_RATE_MIN}〜${CUSTOM_RATE_MAX}の範囲で入力してください`);
  if (!title.trim()) problems.push("見積タイトルを入力してください");
  if (!priceSetId) problems.push("単価セットを選んでください");
  if (!lines.length) problems.push("明細がありません");
  if (projectMode === "existing" && !projectId) problems.push("追加先の案件を選んでください");
  if (projectMode === "new" && !np.name.trim()) problems.push("案件名を入力してください");

  const register = async () => {
    if (problems.length || registering) return;
    setRegistering(true);
    const rep = salesReps.find(s => s.id === np.salesRepId);
    const pProject = projectMode === "existing" ? { id: projectId } : {
      name: np.name.trim(), status: "発注待ち", clientId: np.clientId || null,
      salesRepId: np.salesRepId || null, salesRep: repName(rep), inCharge: np.inCharge.trim(),
      subcontractorIds: [], quoteDate: issuedDate || "",
    };
    const memo = `見積ファイル「${r.fileName}」(自社見積書Excel)から取り込み。見積番号 ${d.cover.quoteNo || "不明"}。${rateChoice === "none" ? "掛け率1.0のまま登録" : `掛け率×${rate}でIGUMIの販売金額を計算して登録`}。ファイルの税抜合計(100%) ${fileTotal?.toLocaleString()}円`;
    const appliedRates = { rate, choice: rateChoice, quote_no: d.cover.quoteNo || null };
    const pQuote = { title: title.trim(), price_set_id: priceSetId, status, total_amount: Math.round(total), issued_at: issuedDate || null, memo };
    const pItems = view.map(l => ({
      price_item_id: l.item?.id ?? null,
      line_type: l.item ? "item" : "adjust",
      group_name: l.groupName || "",
      name: l.name, spec: l.spec || "", unit: l.unit || "",
      qty: Number(l.qty) || 0, sale_price: l.basePrice,
      note: l.note || null,
      cost_price: l.costPrice, cost_confirmed: l.costConfirmed,
    }));
    const subFlagsBySortOrder = view.map((l, i) => [i, !!l.isSubcontracted]).filter(([, flag]) => flag).map(([i]) => i);
    // 別名辞書への保存: 手で選んだ行は必ず保存。自動(類似)で当てはめた行は、類似度0.85以上だけ保存する
    const pAliases = view.filter(l => l.item && (l.matchStatus === "manual" || (l.matchStatus === "auto" && l.score >= AUTO_MATCH_LEARN_SCORE)))
      .map(l => ({ alias: aliasKey(l.matchName, l.spec), price_item_id: l.item.id }));

    // 1) 元ファイルを Storage(非公開バケット)に保存。保存名は ID + 拡張子、元の名前は別に記録する
    const ext = (r.fileName.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "xlsx").toLowerCase();
    const storagePath = `${crypto.randomUUID()}.${ext}`;
    const contentType = FILE_TYPES[ext];
    const { error: upErr } = await supabase.storage.from(QUOTE_FILE_BUCKET).upload(storagePath, r.file, { contentType, upsert: false });
    if (upErr) {
      setResult({ ok: false, message: `元ファイルの保存に失敗しました。何も登録されていません。(${upErr.message})` });
      setRegistering(false);
      return;
    }

    // 2) 案件・見積・明細・原価・別名・ファイルの記録を、1つのトランザクションで登録
    const pFile = { storage_path: storagePath, original_name: r.fileName, size: r.size, content_type: contentType };
    const { data, error } = await supabase.rpc("import_quote", { p_project: pProject, p_quote: pQuote, p_items: pItems, p_aliases: pAliases, p_file: pFile });
    if (error) {
      const missing = /import_quote|function|schema cache/i.test(error.message || "");
      setResult({ ok: false, message: `登録できませんでした。案件・見積は登録されていません。(${error.message})${missing ? " ※ 取り込み用のSQLが未実行の可能性があります" : ""}`, orphanPath: storagePath });
      setRegistering(false);
      return;
    }
    if (projectMode === "new" && (np.respondedAt || np.branchId || np.constructionType)) {
      await supabase.from("projects").update({
        ...(np.respondedAt ? { respondedAt: np.respondedAt } : {}),
        ...(np.branchId ? { branchId: np.branchId } : {}),
        ...(np.constructionType ? { constructionType: np.constructionType } : {}),
      }).eq("id", data.project_id);
    }
    // 使った掛け率と見積番号を残す(import_quoteのSQLは直さず、登録後の更新で済ませる)
    await supabase.from("quotes").update({ applied_rates: appliedRates }).eq("id", data.quote_id);
    await applySubcontractorFollowUps({ quoteId: data.quote_id, subFlagsBySortOrder, subCosts });
    await onRegistered(data.project_id);
    setResult({ ok: true, projectId: data.project_id, quoteNo: data.quote_no, projectName: projectMode === "existing" ? pjs.find(p => p.id === projectId)?.name : np.name.trim() });
    setRegistering(false);
  };

  const locked = !!result?.ok;

  return (
    <div style={{ ...card, borderLeft: `4px solid ${locked ? "#059669" : ngChecks.length ? "#DC2626" : "#1A3A5C"}` }}>
      <CardHead fileName={r.fileName} onRemove={onRemove} locked={locked} />

      {locked ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>登録の結果</div>
          <div style={{ fontSize: 13, color: "#065F46", marginBottom: 4 }}>✅ 元ファイルの保管: 保存しました(案件の見積一覧から開けます)</div>
          <div style={{ fontSize: 13, color: "#065F46", marginBottom: 10 }}>✅ 案件・見積・明細・原価: 登録しました(案件「{result.projectName}」/ 見積 No.{result.quoteNo})</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>案件の受注金額・粗利は変わっていません。反映するには、見積一覧で「採用にする」を押してください。</div>
          <button onClick={() => onOpenQuote(result.projectId)} style={{ width: "100%", padding: "10px 0", background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📝 見積一覧を開く →</button>
        </div>
      ) : (
        <>
          {autoMatchCount > 0 && (
            <div style={{ background: "#EDE9FE", color: "#5B21B6", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
              ⚠ 自動(類似)で当てはめた行: {autoMatchCount}件(下の明細一覧で、当てはめ先を確認してください)
            </div>
          )}

          {/* 表紙 */}
          <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={sectionTitle}>表紙(自社見積書)</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ flex: 3, minWidth: 220 }}>
                <div style={label}>見積タイトル(初期値 = 工事名称)*</div>
                <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={label}>見積日(見積番号から読み取り)</div>
                <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6, fontSize: 12 }}>
              <Info label="見積代金(税抜・100%)" value={fmt(d.cover.totalExTax)} strong />
              <Info label="消費税" value={fmt(d.cover.tax)} />
              <Info label="御見積金額(税込)" value={fmt(d.cover.totalInclTax)} />
              {d.cover.quoteNo && <Info label="見積番号" value={d.cover.quoteNo} />}
            </div>
          </div>

          {/* 検算 */}
          <div style={{ marginBottom: 12 }}>
            <div style={sectionTitle}>検算(ファイルの内容)</div>
            {ngChecks.length === 0
              ? <div style={{ background: "#ECFDF5", color: "#065F46", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>✅ 読み取った明細の合計({fmt(d.linesTotal)})が、ファイルの内容と一致しています</div>
              : <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>⚠️ ファイルの内容と一致しない項目があります。明細を確認してください</div>}
            <details>
              <summary style={{ fontSize: 11, color: "#6B7280", cursor: "pointer" }}>検算の内訳を見る</summary>
              {d.checks.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 6, fontSize: 11, color: c.ok === false ? "#DC2626" : "#6B7280", padding: "2px 0" }}>
                  <span style={{ width: 18 }}>{c.ok === null ? "－" : c.ok ? "✓" : "✗"}</span>
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <span style={{ whiteSpace: "nowrap" }}>{num(c.actual)} / {num(c.expected)}</span>
                </div>
              ))}
            </details>
          </div>

          {d.warnings.length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
              {d.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: "#92400E", padding: "2px 0" }}>⚠️ {w}</div>)}
            </div>
          )}

          {/* 掛け率(必須) */}
          <div style={{ border: `2px solid ${rateChoice ? "#E5E7EB" : "#E07B39"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C", marginBottom: 6 }}>② 掛け率 *(必須)</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>IGUMIの販売金額 = 100%の単価 × 掛け率</div>
            {MARKUP_CHOICE_OPTIONS.map(o => (
              <label key={o.key} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, marginBottom: 4, cursor: "pointer" }}>
                <input type="radio" name={`mk-${r.key}`} checked={rateChoice === o.key} onChange={() => setRateChoice(o.key)} />
                <span><b>{o.label}</b></span>
              </label>
            ))}
            {rateChoice === "custom" && (
              <div style={{ marginLeft: 22, marginBottom: 4 }}>
                <input type="number" step="0.001" min={CUSTOM_RATE_MIN} max={CUSTOM_RATE_MAX} value={customRate} onChange={e => setCustomRate(e.target.value)}
                  placeholder={`${CUSTOM_RATE_MIN}〜${CUSTOM_RATE_MAX}`} style={{ width: 100, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${customRateValid ? "#E5E7EB" : "#FCA5A5"}`, fontSize: 12, color: "#1F2937" }} />
                {!customRateValid && <span style={{ fontSize: 11, color: "#DC2626", marginLeft: 6 }}>{CUSTOM_RATE_MIN}〜{CUSTOM_RATE_MAX}の範囲で入力してください</span>}
              </div>
            )}
            {rateAutoSource != null && !rateTouched && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>取引先の初期値(×{rateAutoSource})を使っています</div>}
            {rateChoice && rateChoice !== "none" && (customRateValid || rateChoice !== "custom") && (
              <div style={{ marginTop: 8, background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#374151" }}>
                100%の合計 {yen(fileTotal)} × {rate} = {yen(roundYen(fileTotal * rate))} / 単価ごとに戻した合計 {yen(total)}
                <span style={{ marginLeft: 6, fontWeight: 700, color: "#9A3412" }}>差額 {(total - roundYen(fileTotal * rate)).toLocaleString()}円</span>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>差額は、明細ごとに単価の円未満を四捨五入したことによるものです</div>
              </div>
            )}
          </div>

          {/* 案件・見積の設定 */}
          <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={sectionTitle}>登録先</div>
            <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 13 }}>
              <label style={{ cursor: "pointer" }}><input type="radio" name={`pm-${r.key}`} checked={projectMode === "existing"} onChange={() => setProjectMode("existing")} /> 既存の案件に追加</label>
              <label style={{ cursor: "pointer" }}><input type="radio" name={`pm-${r.key}`} checked={projectMode === "new"} onChange={() => setProjectMode("new")} /> 新しい案件を作る</label>
            </div>

            {similarProjects.length > 0 && (
              <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>⚠️ 名前の似た案件があります(二重登録に注意)</div>
                {similarProjects.map(({ p }) => (
                  <button key={p.id} onClick={() => { setProjectMode("existing"); setProjectId(p.id); }} style={{ display: "block", width: "100%", textAlign: "left", background: projectMode === "existing" && projectId === p.id ? "#FDE68A" : "#fff", border: "1px solid #FCD34D", borderRadius: 6, padding: "4px 8px", marginBottom: 3, fontSize: 12, cursor: "pointer", color: "#1F2937" }}>
                    {p.name}<span style={{ color: "#9CA3AF", marginLeft: 6 }}>{p.status}</span><span style={{ float: "right", color: "#92400E" }}>この案件に追加 →</span>
                  </button>
                ))}
              </div>
            )}

            {projectMode === "existing" ? (
              <div style={{ marginBottom: 8 }}>
                <div style={label}>追加先の案件 *</div>
                <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inp}>
                  <option value="">選択してください</option>
                  {pjs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {selectedProject && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>施工形態: {constructionType}(案件の設定。変更は案件の編集画面で行います)</div>}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ flex: "1 1 100%" }}>
                  <div style={label}>案件名 *(初期値 = 工事名称)</div>
                  <input value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} style={inp} />
                </div>
                <div style={{ flex: "1 1 100%" }}>
                  <ClientBranchRepPicker
                    clientId={np.clientId} branchId={np.branchId} salesRepId={np.salesRepId}
                    cos={cos} setCos={setCos} branches={branches} setBranches={setBranches} salesReps={salesReps} setSalesReps={setSalesReps}
                    onChange={patch => setNp({ ...np, clientId: patch.clientId, branchId: patch.branchId, salesRepId: patch.salesRepId })}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={label}>現場担当(社内)</div>
                  <input value={np.inCharge} onChange={e => setNp({ ...np, inCharge: e.target.value })} style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={label}>対応日(見積などの対応をした日)</div>
                  <input type="date" value={np.respondedAt} onChange={e => setNp({ ...np, respondedAt: e.target.value })} style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={label}>施工形態</div>
                  <select value={np.constructionType} onChange={e => setNp({ ...np, constructionType: e.target.value })} style={inp}>
                    {CONSTRUCTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={label}>見積の状態</div>
                <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
                  {QUOTE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={label}>単価セット(原価の当てはめに使う)</div>
                <select value={priceSetId} onChange={e => setPriceSetId(e.target.value)} style={inp}>
                  {(price?.sets || []).map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 明細 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div style={sectionTitle}>明細({lines.length}行)</div>
            {unmatchedCount > 0 && <div style={{ fontSize: 11, color: "#B45309", fontWeight: 700 }}>単価表に当てはまらない行: {unmatchedCount}行(原価未入力)</div>}
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>⠿をドラッグ、または↑↓・📂(このグループに移す)で並べ替え・グループ分けができます</div>
          <BundleToolbar lines={view.map(l => ({ ...l, group_name: l.groupName }))} onChange={handleArrangeSelf} selectedKeys={selectedKeys} setSelectedKeys={setSelectedKeys} />
          <div style={{ overflowX: "auto", marginBottom: 6 }}>
            <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                  <th style={th}></th>
                  <th style={th}>名称</th><th style={th}>材質・寸法</th>
                  <th style={th}>数量</th><th style={th}>単位</th>
                  <th style={th}>単価(ファイル)</th>
                  {rate !== 1 && <th style={th}>単価(IGUMI販売)</th>}
                  <th style={{ ...th, textAlign: "right" }}>金額</th>
                  <th style={th}>備考</th>
                  {showSubCheckCol && <th style={{ ...th, textAlign: "center" }}>下請け施工</th>}
                  <th style={th}>単価表の項目{showCostCol ? "(原価)" : ""}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                <GroupTree
                  lines={view.map(l => ({ ...l, group_name: l.groupName }))}
                  onChange={handleArrangeSelf}
                  amountOf={l => l.amount}
                  formatAmount={yen}
                  columnCount={(rate !== 1 ? 8 : 7) + (showSubCheckCol ? 1 : 0)}
                  rowStyle={l => (!l.item ? "#FFFBEB" : "transparent")}
                  selectedKeys={selectedKeys}
                  onToggleSelect={key => setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                  onDeleteLeaf={removeLine}
                  renderLeafCells={l => {
                    const cells = [
                      <td key="name" style={{ ...td, width: 150 }}><input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} style={cellInp} /></td>,
                      <td key="spec" style={{ ...td, width: 170 }}><input value={l.spec} onChange={e => updateLine(l.key, { spec: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>,
                      <td key="qty" style={{ ...td, width: 60 }}><input type="number" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} style={{ ...cellInp, textAlign: "right" }} /></td>,
                      <td key="unit" style={{ ...td, width: 46 }}><input value={l.unit} onChange={e => updateLine(l.key, { unit: e.target.value })} style={cellInp} /></td>,
                      <td key="price" style={{ ...td, width: 90 }}><input type="number" value={l.price} onChange={e => updateLine(l.key, { price: e.target.value })} style={{ ...cellInp, textAlign: "right" }} /></td>,
                    ];
                    if (rate !== 1) cells.push(<td key="basePrice" style={{ ...td, textAlign: "right", width: 80 }}>{num(l.basePrice)}</td>);
                    cells.push(
                      <td key="amount" style={{ ...td, textAlign: "right", fontWeight: 700, color: "#E07B39", width: 80 }}>{num(l.amount)}</td>,
                      <td key="note" style={{ ...td, width: 110 }}><input value={l.note} onChange={e => updateLine(l.key, { note: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>,
                    );
                    if (showSubCheckCol) {
                      cells.push(
                        <td key="subflag" style={{ ...td, textAlign: "center", width: 60 }}>
                          <input type="checkbox" checked={!!l.isSubcontracted} onChange={e => updateLine(l.key, { isSubcontracted: e.target.checked })} />
                        </td>
                      );
                    }
                    cells.push(
                      <td key="cost" style={{ ...td, width: 230 }}>
                        <MatchCell l={l} index={index} costs={price?.costs || {}}
                          showCost={showCostCol} excluded={isMixed && l.isSubcontracted}
                          searching={searchKey === l.key} searchText={searchText}
                          onSearchOpen={() => { setSearchKey(searchKey === l.key ? null : l.key); setSearchText(""); }}
                          onSearchText={setSearchText}
                          onPick={id => { updateLine(l.key, { pickedItemId: id, costOverride: undefined }); setSearchKey(null); }}
                          onCostChange={v => updateLine(l.key, { costOverride: v === "" ? { price: null, confirmed: false } : { price: Number(v), confirmed: true } })} />
                      </td>,
                    );
                    return cells;
                  }}
                />
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 12 }}>黄色の行 = 単価表に当てはまらない行(原価未入力)</div>

          {constructionType !== "自社のみ" && (
            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <div style={sectionTitle}>🏗 下請けの原価({subCosts.length}件)</div>
              {subCosts.length === 0 && <div style={{ padding: "4px 0", fontSize: 12, color: "#9CA3AF" }}>まだ登録されていません(粗利は暫定になります)</div>}
              {subCosts.map(c => {
                const subCo = cos.find(x => x.id === c.subcontractor_id);
                return (
                  <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #F3F4F6" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{subCo?.name || "不明な会社"}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{yen(c.amount)}{c.note ? ` ・ ${c.note}` : ""}{c.file ? ` ・ 📎 ${c.file.name}` : ""}</div>
                    </div>
                    <button onClick={() => removeSubCostDraft(c.key)} style={{ background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid #F3F4F6" }}>
                <select value={subForm.subcontractor_id} onChange={e => setSubForm({ ...subForm, subcontractor_id: e.target.value })} style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, background: "#fff", color: "#1F2937" }}>
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
                <button onClick={addSubCostDraft} style={{ background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ 追加</button>
              </div>
              <SubQuoteFileReader
                file={subForm.file} subcontractors={subcontractors} hasCompanySelected={!!subForm.subcontractor_id}
                onPickAmount={v => setSubForm(f => ({ ...f, amount: String(v) }))}
                onPickCompany={id => setSubForm(f => ({ ...f, subcontractor_id: id }))}
              />
            </div>
          )}

          {/* 合計・粗利 */}
          <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 13, color: "#6B7280" }}>登録する見積合計(税抜)</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#1A3A5C" }}>{yen(total)}</div>
            </div>
            {rate === 1 && total !== fileTotal && <div style={{ fontSize: 11, color: "#9A3412", marginBottom: 6 }}>※ ファイルの合計({yen(fileTotal)})と {(total - fileTotal).toLocaleString()}円 違います(明細を直したため)</div>}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 4 }}>🔒 社内用</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>原価合計 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{yen(costTotal)}</span></div>
              <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>粗利 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{yen(gp)}{provisional ? "(暫定)" : ""}</span></div>
              <div><span style={{ fontSize: 11, color: "#9CA3AF" }}>粗利率 </span><span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{gpRate == null ? "—" : `${gpRate.toFixed(1)}%`}</span></div>
            </div>
            {ownUnconfirmed && <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 原価が未入力・未確認の明細があります。粗利は暫定です</div>}
            {subMissing && <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 下請けの原価が1件も登録されていません。粗利は暫定です</div>}
            <div style={{ marginTop: 4, fontSize: 11, color: "#6B7280" }}>※ 原価は、いまの単価表の原価をコピーします。過去の見積の場合、粗利は「いまの原価」での目安です</div>
          </div>

          {result && !result.ok && (
            <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              <div>❌ {result.message}</div>
              {result.orphanPath && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>※ 元ファイルだけが Storage に残っています(quote-files / {result.orphanPath})。もう一度登録すると、新しい名前で保存し直します。</div>}
            </div>
          )}
          {problems.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {problems.map((p, i) => <div key={i} style={{ fontSize: 12, color: "#B45309" }}>・{p}</div>)}
            </div>
          )}
          <button onClick={register} disabled={problems.length > 0 || registering} style={{ width: "100%", padding: "12px 0", background: problems.length ? "#9CA3AF" : "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: problems.length || registering ? "default" : "pointer", opacity: registering ? 0.6 : 1 }}>
            {registering ? "登録中..." : "💾 この内容で登録する"}
          </button>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, textAlign: "center" }}>案件の受注金額・粗利は変わりません(反映は見積一覧の「採用にする」で行います)</div>
        </>
      )}
    </div>
  );
}
