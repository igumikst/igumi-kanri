import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { fmt } from "../lib/constants";
import { buildPriceIndex, matchLine, searchItems, similarity, aliasKey, normalizeText } from "../lib/priceMatch";
import { toBasePrice, lineAmount, roundYen, MARKUP_BACK_RATE } from "../lib/quoteImport/markup";
import { QUOTE_FILE_BUCKET, FILE_TYPES } from "../lib/quoteFiles";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPT_RE = /\.(xls|xlsx)$/i;

const QUOTE_STATUS = [
  { key: "draft", label: "下書き" },
  { key: "submitted", label: "提出済み" },
  { key: "won", label: "受注" },
  { key: "lost", label: "失注" },
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
    const { parseConcluFile } = await import("../lib/quoteImport/parseConclu.js");
    const next = [];
    for (const f of files) {
      const base = { key: f.name + f.size + f.lastModified, fileName: f.name, size: f.size, file: f };
      if (!ACCEPT_RE.test(f.name)) { next.push({ ...base, error: ".xls / .xlsx のファイルを選んでください" }); continue; }
      if (f.size > MAX_FILE_SIZE) { next.push({ ...base, error: `ファイルが大きすぎます(上限 10MB / このファイル ${(f.size / 1024 / 1024).toFixed(1)}MB)` }); continue; }
      try {
        next.push({ ...base, data: parseConcluFile(await f.arrayBuffer()) });
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
            Concluで出力した見積書(.xls)を選んでください。複数選べます(1ファイル 10MB まで)。<br />
            内容を確認・修正してから、ファイルごとに「登録する」を押してください。
          </div>
          {price?.error && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>⚠️ {price.error}</div>}
          <label style={{ display: "block", width: "100%", padding: "12px 0", background: "#1A3A5C", color: "#fff", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: reading ? "default" : "pointer", textAlign: "center", opacity: reading ? 0.6 : 1 }}>
            {reading ? "読み取り中..." : "📂 ファイルを選ぶ"}
            <input type="file" accept=".xls,.xlsx" multiple disabled={reading} onChange={e => { readFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
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
  })));
  const [searchKey, setSearchKey] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, projectId, quoteNo }

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
    const costPrice = cost?.cost_price ?? null;
    return { ...l, auto, item, matchStatus, basePrice, amount, costPrice, costConfirmed: !!cost?.cost_confirmed && costPrice != null };
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
          <div style={{ overflowX: "auto", marginBottom: 6 }}>
            <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                  <th style={th}>グループ</th><th style={th}>名称</th><th style={th}>材質・寸法</th>
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
                {view.map(l => (
                  <tr key={l.key} style={{ borderBottom: "1px solid #F3F4F6", background: l.summaryOnly ? "#FFF7ED" : !l.item ? "#FFFBEB" : "transparent" }}>
                    <td style={{ ...td, width: 110 }}>
                      <input value={l.groupName} onChange={e => updateLine(l.key, { groupName: e.target.value })} style={{ ...cellInp, fontSize: 11, color: l.summaryOnly ? "#9A3412" : "#6B7280", fontWeight: l.summaryOnly ? 700 : 400 }} />
                    </td>
                    <td style={{ ...td, width: 150 }}><input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} style={cellInp} /></td>
                    <td style={{ ...td, width: 170 }}><input value={l.spec} onChange={e => updateLine(l.key, { spec: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>
                    <td style={{ ...td, width: 60 }}><input type="number" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} style={{ ...cellInp, textAlign: "right" }} /></td>
                    <td style={{ ...td, width: 46 }}><input value={l.unit} onChange={e => updateLine(l.key, { unit: e.target.value })} style={cellInp} /></td>
                    <td style={{ ...td, width: 90 }}><input type="number" value={l.price} onChange={e => updateLine(l.key, { price: e.target.value })} style={{ ...cellInp, textAlign: "right" }} /></td>
                    {markup === "after" && <td style={{ ...td, textAlign: "right", width: 80 }}>{num(l.basePrice)}</td>}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#E07B39", width: 80 }}>{num(l.amount)}</td>
                    <td style={{ ...td, width: 110 }}><input value={l.note} onChange={e => updateLine(l.key, { note: e.target.value })} style={{ ...cellInp, fontSize: 11 }} /></td>
                    <td style={{ ...td, width: 230 }}>
                      <MatchCell l={l} index={index} costs={price?.costs || {}}
                        searching={searchKey === l.key} searchText={searchText}
                        onSearchOpen={() => { setSearchKey(searchKey === l.key ? null : l.key); setSearchText(""); }}
                        onSearchText={setSearchText}
                        onPick={id => { updateLine(l.key, { pickedItemId: id }); setSearchKey(null); }} />
                    </td>
                    <td style={{ ...td, width: 30 }}>
                      <button onClick={() => removeLine(l.key)} title="この行を削除" style={{ border: "none", background: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>🗑</button>
                    </td>
                  </tr>
                ))}
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

function MatchCell({ l, index, costs, searching, searchText, onSearchOpen, onSearchText, onPick }) {
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
  return (
    <div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: b.color, background: b.bg, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{b.text}</span>
        {l.item && <span style={{ fontSize: 10, color: l.costConfirmed ? "#6B7280" : "#DC2626" }}>{l.costPrice != null ? `原価 ${Number(l.costPrice).toLocaleString()}${l.costConfirmed ? "" : "(未確認)"}` : "原価未入力"}</span>}
      </div>
      <div style={{ display: "flex", gap: 3 }}>
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
    </div>
  );
}

const Info = ({ label: l, value, strong }) => (
  <div>
    <div style={{ fontSize: 10, color: "#9CA3AF" }}>{l}</div>
    <div style={{ fontSize: strong ? 14 : 12, fontWeight: strong ? 800 : 600, color: strong ? "#E07B39" : "#1F2937" }}>{value}</div>
  </div>
);
