import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { fmt } from "../lib/constants";
import { buildPriceIndex, matchLine, searchItems, similarity, aliasKey, normalizeText } from "../lib/priceMatch";
import { toBasePrice, lineAmount, roundYen, MARKUP_BACK_RATE } from "../lib/quoteImport/markup";
import { buildEstTree, flattenEstTree, reverseSiblingOrder } from "../lib/quoteImport/parseEst";
import GroupTree, { BundleToolbar } from "../components/GroupTree";
import { QUOTE_FILE_BUCKET, FILE_TYPES } from "../lib/quoteFiles";

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

export default function QuoteImport({ pjs, setPjs, cos, salesReps, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, quoteImportCtx, setQuoteProjectId }) {
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
    const [{ parseConcluFile }, { parseEstFile }] = await Promise.all([
      import("../lib/quoteImport/parseConclu.js"),
      import("../lib/quoteImport/parseEst.js"),
    ]);
    const next = [];
    for (const f of files) {
      const base = { key: f.name + f.size + f.lastModified, fileName: f.name, size: f.size, file: f };
      if (!ACCEPT_RE.test(f.name)) { next.push({ ...base, error: ".xls / .xlsx / .est のファイルを選んでください" }); continue; }
      if (f.size > MAX_FILE_SIZE) { next.push({ ...base, error: `ファイルが大きすぎます(上限 10MB / このファイル ${(f.size / 1024 / 1024).toFixed(1)}MB)` }); continue; }
      const isEst = EST_RE.test(f.name);
      try {
        next.push({ ...base, kind: isEst ? "est" : "conclu", data: isEst ? parseEstFile(await f.arrayBuffer()) : parseConcluFile(await f.arrayBuffer()) });
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
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title="📥 見積ファイルから登録" back={back} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={card}>
          {targetProject && <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>追加先の案件(初期値): <b>{targetProject.name}</b></div>}
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 1.6 }}>
            Concluで出力した見積書(.xls)、または見積ソフトのESTファイル(.est)を選んでください。複数選べます(1ファイル 10MB まで)。<br />
            内容を確認・修正してから、ファイルごとに「登録する」を押してください。
          </div>
          {price?.error && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>⚠️ {price.error}</div>}
          <label style={{ display: "block", width: "100%", padding: "12px 0", background: "#1A3A5C", color: "#fff", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: reading ? "default" : "pointer", textAlign: "center", opacity: reading ? 0.6 : 1 }}>
            {reading ? "読み取り中..." : "📂 ファイルを選ぶ"}
            <input type="file" accept=".xls,.xlsx,.est" multiple disabled={reading} onChange={e => { readFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
        </div>

        {results.map(r => (
          <FileCard key={r.key} r={r} price={price} pjs={pjs} cos={cos} salesReps={salesReps || []}
            defaultProjectId={quoteImportCtx?.projectId || ""}
            onRegistered={addProjectToState}
            onOpenQuote={projectId => { setQuoteProjectId(projectId); nav("quotes"); }}
            onRemove={() => setResults(prev => prev.filter(x => x.key !== r.key))} />
        ))}
      </div>
    </div>
  );
}

function FileCard({ r, price, pjs, cos, salesReps, defaultProjectId, onRegistered, onOpenQuote, onRemove }) {
  if (r.error) {
    return (
      <div style={{ ...card, borderLeft: "4px solid #DC2626" }}>
        <CardHead fileName={r.fileName} onRemove={onRemove} />
        <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700 }}>⚠️ {r.error}</div>
      </div>
    );
  }
  if (r.kind === "est") return <EstImportForm r={r} price={price} pjs={pjs} cos={cos} salesReps={salesReps} defaultProjectId={defaultProjectId} onRegistered={onRegistered} onOpenQuote={onOpenQuote} onRemove={onRemove} />;
  return <ImportForm r={r} price={price} pjs={pjs} cos={cos} salesReps={salesReps} defaultProjectId={defaultProjectId} onRegistered={onRegistered} onOpenQuote={onOpenQuote} onRemove={onRemove} />;
}

const CardHead = ({ fileName, onRemove, locked }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
    <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", wordBreak: "break-all" }}>📗 {fileName}</div>
    {!locked && <button onClick={onRemove} style={{ border: "none", background: "#F3F4F6", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#374151", whiteSpace: "nowrap" }}>✕ 外す</button>}
  </div>
);

let lineSeq = 0;

function ImportForm({ r, price, pjs, cos, salesReps, defaultProjectId, onRegistered, onOpenQuote, onRemove }) {
  const d = r.data;
  const [title, setTitle] = useState(d.cover.title || "");
  const [issuedDate, setIssuedDate] = useState(d.cover.issuedDate || "");
  const [status, setStatus] = useState("submitted");
  const [markup, setMarkup] = useState(null); // "before" | "after"(必須)
  const [pickedSetId, setPriceSetId] = useState("");
  const [projectMode, setProjectMode] = useState(defaultProjectId ? "existing" : "new");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [np, setNp] = useState({ name: d.cover.title || "", clientId: "", salesRepId: "", inCharge: "" });
  const [lines, setLines] = useState(() => d.lines.map(l => ({
    key: "il" + (++lineSeq), groupName: l.groupName, name: l.name, spec: l.spec, qty: l.qty ?? 0, unit: l.unit,
    price: l.price ?? 0, note: l.note, summaryOnly: l.summaryOnly, nameFromSpec: l.nameFromSpec, fileAmount: l.amount,
    pickedItemId: undefined, // undefined = 自動 / null = 当てはめない / id = 手で選んだ
    costOverride: undefined, // undefined = 単価表の原価をそのまま使う / { price, confirmed } = 手で直した原価
  })));
  const [searchKey, setSearchKey] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, projectId, quoteNo }
  const [selectedKeys, setSelectedKeys] = useState(new Set());

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
  const costTotal = view.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.costPrice) || 0), 0);
  const gp = total - costTotal;
  const gpRate = total ? (gp / total) * 100 : null;
  const provisional = view.some(l => !l.costConfirmed);
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

  const clients = cos.filter(c => c.type === "取引先");
  const repsForClient = salesReps.filter(s => !np.clientId || s.company_id === np.clientId);
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
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ flex: "1 1 100%" }}>
                  <div style={label}>案件名 *(初期値 = 工事名称)</div>
                  <input value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={label}>元請</div>
                  <select value={np.clientId} onChange={e => setNp({ ...np, clientId: e.target.value, salesRepId: "" })} style={inp}>
                    <option value="">未設定</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.branch ? " " + c.branch : ""}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={label}>元請側の担当者</div>
                  <select value={np.salesRepId} onChange={e => setNp({ ...np, salesRepId: e.target.value })} style={inp}>
                    <option value="">未設定</option>
                    {repsForClient.map(s => <option key={s.id} value={s.id}>{repName(s) || s.id}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={label}>現場担当(社内)</div>
                  <input value={np.inCharge} onChange={e => setNp({ ...np, inCharge: e.target.value })} style={inp} />
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
                  <th style={th}>単価表の項目(原価)</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                <GroupTree
                  lines={view.map(l => ({ ...l, group_name: l.groupName }))}
                  onChange={handleArrangeConclu}
                  amountOf={l => l.amount}
                  formatAmount={yen}
                  columnCount={markup === "after" ? 8 : 7}
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
                      <td key="cost" style={{ ...td, width: 230 }}>
                        <MatchCell l={l} index={index} costs={price?.costs || {}}
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
            {provisional && <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 原価が未入力・未確認の明細があります。粗利は暫定です</div>}
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
  manual: { text: "手で選択", color: "#1E40AF", bg: "#DBEAFE" },
  skip: { text: "当てはめない", color: "#6B7280", bg: "#F3F4F6" },
  none: { text: "未当てはめ", color: "#92400E", bg: "#FEF3C7" },
};

function MatchCell({ l, index, costs, searching, searchText, onSearchOpen, onSearchText, onPick, onCostChange }) {
  if (l.summaryOnly) return <span style={{ fontSize: 11, color: "#9A3412", fontWeight: 700 }}>総括のみ(原価未入力)</span>;
  if (!index) return <span style={{ fontSize: 11, color: "#9CA3AF" }}>単価表を読み込み中...</span>;
  const b = MATCH_BADGE[l.matchStatus];
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
        <span style={{ fontSize: 10, fontWeight: 700, color: b.color, background: b.bg, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{b.text}</span>
      </div>
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

// 葉(明細)だけの金額(元請が絡む場合は×0.925した後)の合計。小計行自体の金額は使わず、子の積み上げで出す
function sumLeafAmount(node, markupChoice) {
  if (!node.children?.length) {
    const base = toBasePrice(node.priceA, markupChoice === "with" ? "after" : "before");
    return lineAmount(node.qty, base);
  }
  return node.children.reduce((s, c) => s + sumLeafAmount(c, markupChoice), 0);
}

// ESTファイル(見積ソフトのバイナリ形式)の確認画面。ステップ3: 登録・原価の当てはめ・粗利の計算まで行う
function EstImportForm({ r, price, pjs, cos, salesReps, defaultProjectId, onRegistered, onOpenQuote, onRemove }) {
  const d = r.data;
  const [lines, setLines] = useState(() => d.lines.map(l => ({ ...l, pickedItemId: undefined, costOverride: undefined })));
  const [markupChoice, setMarkupChoice] = useState(null); // "with"(元請絡む・×0.925) | "without"(絡まない) ※必須
  const [outputRateChoice, setOutputRateChoice] = useState(d.cover.detectedRate === 100 ? "100" : "file");
  const [status, setStatus] = useState("submitted");
  const [pickedSetId, setPriceSetId] = useState("");
  const [projectMode, setProjectMode] = useState(defaultProjectId ? "existing" : "new");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [np, setNp] = useState({ name: d.cover.title || "", clientId: "", salesRepId: "", inCharge: "" });
  const [searchKey, setSearchKey] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, projectId, quoteNo }
  const [arrangedMeta, setArrangedMeta] = useState([]); // [{key, group_name}] 手でドラッグ・移動した並び・グループ(ステップ2)
  const [selectedKeys, setSelectedKeys] = useState(new Set());

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

  const adjustedTotal = tree.top.reduce((s, n) => s + sumLeafAmount(n, markupChoice), 0);
  const rateMismatchWarning = outputRateChoice === "100" && d.cover.detectedRate !== 100;

  // 単価セット(原価の当てはめに使う。初期値: 工事見積用)
  const defaultSetId = price?.sets?.length ? (price.sets.find(s => s.code === "construction") || price.sets[0]).id : "";
  const priceSetId = pickedSetId || defaultSetId;

  const index = useMemo(() => {
    if (!price || !priceSetId) return null;
    return buildPriceIndex(price.items.filter(i => i.price_set_id === priceSetId), price.aliases);
  }, [price, priceSetId]);

  const autoMatches = useMemo(() => {
    const out = {};
    if (!index) return out;
    for (const l of leaves) out[l.key] = matchLine(index, l.name, l.spec);
    return out;
  }, [index, leaves]);

  // 原価の当てはめ・粗利の計算は、明細(葉)だけを対象にする(小計行は子の積み上げなので対象外)
  const view = arrangedLeaves.map(l => {
    const auto = autoMatches[l.key] || { status: "none", item: null, candidates: [] };
    const picked = l.pickedItemId !== undefined;
    const item = picked ? (l.pickedItemId ? index?.byId.get(l.pickedItemId) || null : null) : auto.item;
    const matchStatus = picked ? (item ? "manual" : "skip") : auto.status;
    const cost = item ? price?.costs[item.id] : null;
    const basePrice = toBasePrice(l.priceA, markupChoice === "with" ? "after" : "before");
    const amount = lineAmount(l.qty, basePrice);
    const costPrice = l.costOverride !== undefined ? l.costOverride.price : (cost?.cost_price ?? null);
    const costConfirmed = l.costOverride !== undefined ? l.costOverride.confirmed : (!!cost?.cost_confirmed && costPrice != null);
    return { ...l, auto, item, matchStatus, basePrice, amount, costPrice, costConfirmed };
  });
  const viewByKey = useMemo(() => Object.fromEntries(view.map(v => [v.key, v])), [view]);

  const costTotal = view.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.costPrice) || 0), 0);
  const gp = adjustedTotal - costTotal;
  const gpRate = adjustedTotal ? (gp / adjustedTotal) * 100 : null;
  const provisional = view.some(l => !l.costConfirmed);
  const unmatchedCount = view.filter(l => !l.item).length;

  const similarProjects = useMemo(() => {
    const t = normalizeText(projectMode === "new" ? np.name : "");
    if (!t) return [];
    return pjs.map(p => {
      const n = normalizeText(p.name);
      const score = n && (n.includes(t) || t.includes(n)) ? 1 : similarity(t, p.name);
      return { p, score };
    }).filter(x => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [pjs, projectMode, np.name]);

  const clients = cos.filter(c => c.type === "取引先");
  const repsForClient = salesReps.filter(s => !np.clientId || s.company_id === np.clientId);
  const repName = s => s?.name || s?.display_name || "";

  const problems = [];
  if (!markupChoice) problems.push("「元請が絡むか」を選んでください");
  if (totalCheckOk === false) problems.push("組み立てた合計が、ファイルに保存されている合計と一致していません(明細・小計/明細の切り替えを確認してください)");
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
    const memo = `見積ファイル「${r.fileName}」(ESTファイル)から取り込み。${markupChoice === "with" ? `元請が絡むため、単価×${MARKUP_BACK_RATE}でIGUMIの販売金額に戻して登録` : "元請が絡まないため、100%の単価のまま登録"}。ファイルの税抜合計(100%) ${fileTotal100?.toLocaleString()}円`;
    const pQuote = { title: (d.cover.title || r.fileName).trim(), price_set_id: priceSetId, status, total_amount: Math.round(adjustedTotal), issued_at: null, memo };
    const pItems = view.map(l => ({
      price_item_id: l.item?.id ?? null,
      line_type: l.item ? "item" : "adjust",
      group_name: l.group_name || "",
      name: l.name, spec: l.spec || "", unit: l.unit || "",
      qty: Number(l.qty) || 0, sale_price: l.basePrice,
      note: l.note || null,
      cost_price: l.costPrice, cost_confirmed: l.costConfirmed,
    }));
    const pAliases = view.filter(l => l.matchStatus === "manual" && l.item).map(l => ({ alias: aliasKey(l.name, l.spec), price_item_id: l.item.id }));

    const { data, error } = await supabase.rpc("import_quote", { p_project: pProject, p_quote: pQuote, p_items: pItems, p_aliases: pAliases });
    if (error) {
      const missing = /import_quote|function|schema cache/i.test(error.message || "");
      setResult({ ok: false, message: `登録できませんでした。案件・見積は登録されていません。(${error.message})${missing ? " ※ 取り込み用のSQLが未実行の可能性があります" : ""}` });
      setRegistering(false);
      return;
    }
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
          <div style={{ fontSize: 13, color: "#065F46", marginBottom: 10 }}>✅ 案件・見積・明細・原価: 登録しました(案件「{result.projectName}」/ 見積 No.{result.quoteNo})</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>※ 元のESTファイル自体は、まだ保管していません。案件の受注金額・粗利も変わっていません。反映するには、見積一覧で「採用にする」を押してください。</div>
          <button onClick={() => onOpenQuote(result.projectId)} style={{ width: "100%", padding: "10px 0", background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📝 見積一覧を開く →</button>
        </div>
      ) : (
      <>


      {/* 表紙 */}
      <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={sectionTitle}>表紙(EST)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6, fontSize: 12 }}>
          <Info label="工事名称" value={d.cover.title || "(読み取れませんでした)"} strong />
          <Info label="合計(税抜・100%)" value={yen(d.cover.totalExTax)} />
          <Info label="合計(ファイルの出力率)" value={yen(d.cover.totalExTax130)} />
          <Info label="検出した出力率" value={`${d.cover.detectedRate}%`} />
        </div>
      </div>

      {/* 検算: 組み立てた階層のトップレベル合計 と、ファイルに保存されている合計(100%)を照合 */}
      <div style={{ marginBottom: 12 }}>
        <div style={sectionTitle}>検算(小計の組み立て)</div>
        {totalCheckOk == null
          ? <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>⚠️ ファイルに保存されている合計金額が見つかりませんでした。検算できていません</div>
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

      {/* ②元請が絡むか(必須) */}
      <div style={{ border: `2px solid ${markupChoice ? "#E5E7EB" : "#E07B39"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C", marginBottom: 6 }}>② 元請さんが絡む案件ですか? *(必須)</div>
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, marginBottom: 4, cursor: "pointer" }}>
          <input type="radio" name={`mk-${r.key}`} checked={markupChoice === "with"} onChange={() => setMarkupChoice("with")} />
          <span><b>絡む</b> → 単価 × {MARKUP_BACK_RATE} した金額を、IGUMIの販売金額にする</span>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
          <input type="radio" name={`mk-${r.key}`} checked={markupChoice === "without"} onChange={() => setMarkupChoice("without")} />
          <span><b>絡まない</b> → 100%の単価のまま、IGUMIの販売金額にする</span>
        </label>
        {markupChoice === "with" && (
          <div style={{ marginTop: 8, background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#374151" }}>
            100%の合計 {yen(topSum100)} × {MARKUP_BACK_RATE} = {yen(roundYen(topSum100 * MARKUP_BACK_RATE))} / 単価ごとに戻した合計 {yen(adjustedTotal)}
            <span style={{ marginLeft: 6, fontWeight: 700, color: "#9A3412" }}>差額 {(adjustedTotal - roundYen(topSum100 * MARKUP_BACK_RATE)).toLocaleString()}円</span>
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
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: "1 1 100%" }}>
              <div style={label}>案件名 *(初期値 = 工事名称)</div>
              <input value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} style={inp} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={label}>元請</div>
              <select value={np.clientId} onChange={e => setNp({ ...np, clientId: e.target.value, salesRepId: "" })} style={inp}>
                <option value="">未設定</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.branch ? " " + c.branch : ""}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={label}>元請側の担当者</div>
              <select value={np.salesRepId} onChange={e => setNp({ ...np, salesRepId: e.target.value })} style={inp}>
                <option value="">未設定</option>
                {repsForClient.map(s => <option key={s.id} value={s.id}>{repName(s) || s.id}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={label}>現場担当(社内)</div>
              <input value={np.inCharge} onChange={e => setNp({ ...np, inCharge: e.target.value })} style={inp} />
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
              {markupChoice === "with" && <th style={th}>単価(IGUMI販売)</th>}
              <th style={{ ...th, textAlign: "right" }}>金額</th>
              <th style={th}>備考</th>
              <th style={th}>単価表の項目(原価)</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node: l, depth }) => {
              const isLeaf = !l.children?.length;
              const mismatch = tree.mismatchKeys.includes(l.key);
              const basePrice = toBasePrice(l.priceA, markupChoice === "with" ? "after" : "before");
              const amount = isLeaf ? lineAmount(l.qty, basePrice) : sumLeafAmount(l, markupChoice);
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
                  {markupChoice === "with" && <td style={{ ...td, textAlign: "right", width: 80 }}>{num(basePrice)}</td>}
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#E07B39", width: 80 }}>{num(amount)}</td>
                  <td style={{ ...td, width: 110 }}><input value={l.note} onChange={e => updateLine(l.key, { note: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>
                  <td style={{ ...td, width: 230 }}>
                    {isLeaf
                      ? <MatchCell l={v} index={index} costs={price?.costs || {}}
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
              <th style={th}>単価表の項目(原価)</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            <GroupTree
              lines={view}
              onChange={handleArrange}
              amountOf={l => l.amount}
              formatAmount={yen}
              columnCount={5}
              selectedKeys={selectedKeys}
              onToggleSelect={key => setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
              renderLeafCells={l => [
                <td key="name" style={{ ...td, width: 150 }}>{l.name}</td>,
                <td key="spec" style={{ ...td, width: 150, fontSize: 11 }}>{l.spec}</td>,
                <td key="qty" style={{ ...td, width: 50, textAlign: "right" }}>{num(l.qty)}{l.unit}</td>,
                <td key="amount" style={{ ...td, textAlign: "right", fontWeight: 700, color: "#E07B39", width: 80 }}>{num(l.amount)}</td>,
                <td key="cost" style={{ ...td, width: 220 }}>
                  <MatchCell l={l} index={index} costs={price?.costs || {}}
                    searching={searchKey === l.key} searchText={searchText}
                    onSearchOpen={() => { setSearchKey(searchKey === l.key ? null : l.key); setSearchText(""); }}
                    onSearchText={setSearchText}
                    onPick={id => { updateLine(l.key, { pickedItemId: id, costOverride: undefined }); setSearchKey(null); }}
                    onCostChange={val => updateLine(l.key, { costOverride: val === "" ? { price: null, confirmed: false } : { price: Number(val), confirmed: true } })} />
                </td>,
              ]}
            />
          </tbody>
        </table>
      </div>

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
        {provisional && <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠️ 原価が未入力・未確認の明細があります。粗利は暫定です</div>}
        <div style={{ marginTop: 4, fontSize: 11, color: "#6B7280" }}>※ 原価は、いまの単価表の原価をコピーします。過去の見積の場合、粗利は「いまの原価」での目安です</div>
      </div>

      {result && !result.ok && (
        <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>❌ {result.message}</div>
      )}
      {problems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {problems.map((p, i) => <div key={i} style={{ fontSize: 12, color: "#B45309" }}>・{p}</div>)}
        </div>
      )}
      <button onClick={register} disabled={problems.length > 0 || registering} style={{ width: "100%", padding: "12px 0", background: problems.length ? "#9CA3AF" : "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: problems.length || registering ? "default" : "pointer", opacity: registering ? 0.6 : 1 }}>
        {registering ? "登録中..." : "💾 この内容で登録する"}
      </button>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, textAlign: "center" }}>案件の受注金額・粗利は変わりません(反映は見積一覧の「採用にする」で行います)。元のESTファイル自体の保管は、このステップでは行いません</div>
      </>
      )}
    </div>
  );
}
