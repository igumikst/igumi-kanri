import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import ClientBranchRepPicker from "../components/ClientBranchRepPicker";
import { fmt, todayStr } from "../lib/constants";
import { aliasKey, searchItems } from "../lib/priceMatch";
import { describeError } from "../lib/errorMessage";
import { defaultOwnCrewId } from "../lib/crews";
import { maskPhoneNumbers } from "../lib/noteDraft/maskPhone";
import { buildDraft, resolveLine } from "../lib/noteDraft/buildDraftLines";
import { findProjectCandidates, findRepCandidates } from "../lib/noteDraft/projectCandidates";
import { DEFAULT_LABOR_UNIT_PRICE } from "../lib/noteDraft/rules";

// ノートから見積の下書きを作る画面(第8弾 ノート見積作成)。
// ノートを貼る → 電話番号を伏せる → AIで分解(/api/note-parse)→ 案件を人が選ぶ → 明細を3色で確認 → 登録して見積編集画面を開く。
// AIは分解だけ。単価表への当てはめ・人工・金額・色はプログラム(src/lib/noteDraft/)が決め、最後は人が確認する。
// 原価はこの画面と見積編集画面の中だけで扱い、見積書(Excel/PDF)には出ない(既存の決まりのまま)。

const NOTE_MAX_CHARS = 5000; // api/_noteParseCore.js の上限と同じ
const AI_TIMEOUT_MS = 60000;
// 合言葉(不正利用対策)。値はコードに書かず、スタッフが画面で入力し、この端末にだけ覚えておく。
// サーバー(api/note-parse.js)は、設定画面で決めた「見積作成パスワード」のハッシュと照らし合わせる
const PASSPHRASE_STORAGE_KEY = "igumi_note_passphrase";
const PASSPHRASE_HEADER = "x-note-passphrase";
const loadPassphrase = () => { try { return localStorage.getItem(PASSPHRASE_STORAGE_KEY) || ""; } catch { return ""; } };
const savePassphrase = v => { try { if (v) localStorage.setItem(PASSPHRASE_STORAGE_KEY, v); else localStorage.removeItem(PASSPHRASE_STORAGE_KEY); } catch { /* 保存できない端末では、毎回入力する */ } };

const card = { background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" };
const th = { padding: "6px 6px", fontSize: 11, color: "#6B7280", textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "4px 6px", fontSize: 12, color: "#1F2937", verticalAlign: "top" };
const cellInp = { width: "100%", padding: "3px 5px", borderRadius: 6, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937", boxSizing: "border-box", background: "#fff" };
const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", color: "#1F2937" };
const label = { fontSize: 11, color: "#6B7280", marginBottom: 3 };

// 3色の見た目(取り込み画面の「自動(類似)」警告に寄せる)
const COLOR = {
  green: { text: "緑", color: "#065F46", bg: "#D1FAE5", row: "transparent" },
  yellow: { text: "黄", color: "#92400E", bg: "#FEF3C7", row: "#FFFBEB" },
  red: { text: "赤", color: "#991B1B", bg: "#FEE2E2", row: "#FEF2F2" },
};
const STATUS_TEXT = { exact: "一致", alias: "別名辞書", auto: "自動(類似)", name: "名前で一致", manual: "手で選択", skip: "当てはめない", none: "未当てはめ", manualPrice: "売価を手入力" };
const NOTICE = { red: { color: "#991B1B", bg: "#FEF2F2" }, yellow: { color: "#92400E", bg: "#FFFBEB" }, info: { color: "#1E40AF", bg: "#EFF6FF" } };

export default function NoteQuote({ pjs, setPjs, cos, setCos, salesReps, setSalesReps, branches, setBranches, crews, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, submittedQuotes, wonQuotes, setQuoteProjectId, setOpenQuoteId }) {
  const pending = tks.filter(t => !t.done);
  const [noteText, setNoteText] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [maskedCount, setMaskedCount] = useState(0);
  const [price, setPrice] = useState(null);
  const [laborUnitPrice, setLaborUnitPrice] = useState(DEFAULT_LABOR_UNIT_PRICE);
  const [built, setBuilt] = useState(null); // { header, notices, preferredSetId, indexes }
  const [lines, setLines] = useState([]);
  const [searchKey, setSearchKey] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [title, setTitle] = useState("");
  const [projectMode, setProjectMode] = useState("existing");
  const [projectId, setProjectId] = useState("");
  const [np, setNp] = useState({ name: "", clientId: "", branchId: "", salesRepId: "", salesRep: "", inCharge: "", respondedAt: todayStr() });
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const abortRef = useRef(null);
  const [passphrase, setPassphrase] = useState(loadPassphrase);
  const [showPassphrase, setShowPassphrase] = useState(() => !loadPassphrase());
  const [passphraseUnset, setPassphraseUnset] = useState(false); // 見積作成パスワードが未設定(設定画面への案内を出す)

  // 単価表・原価・別名辞書・1人工の単価を読む(取り込み画面と同じ)
  useEffect(() => {
    (async () => {
      const [setsRes, itemsRes, costsRes, aliasRes, laborRes] = await Promise.all([
        supabase.from("price_sets").select("*").order("sort_order"),
        supabase.from("price_items").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("price_item_costs").select("*"),
        supabase.from("price_item_aliases").select("*"),
        supabase.from("app_settings").select("*").eq("key", "labor_unit_price"),
      ]);
      setPrice({
        sets: setsRes.data || [], items: itemsRes.data || [], aliases: aliasRes.data || [],
        costs: Object.fromEntries((costsRes.data || []).map(c => [c.price_item_id, c])),
        error: setsRes.error || itemsRes.error || costsRes.error ? "単価表の読み込みに失敗しました。当てはめができません" : null,
      });
      const v = Number(laborRes.data?.[0]?.value);
      if (v > 0) setLaborUnitPrice(v);
    })();
    return () => abortRef.current?.abort();
  }, []);

  const readNote = async () => {
    if (reading || !noteText.trim() || !price) return;
    if (!passphrase.trim()) { setShowPassphrase(true); setReadError("合言葉を入力してください"); return; }
    setReading(true); setReadError(""); setPassphraseUnset(false); setBuilt(null); setLines([]);
    const { text, count } = maskPhoneNumbers(noteText); // AIに送る前に電話番号を伏せる(この1か所だけ)
    setMaskedCount(count);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch("/api/note-parse", { method: "POST", headers: { "Content-Type": "application/json", [PASSPHRASE_HEADER]: encodeURIComponent(passphrase.trim()) }, body: JSON.stringify({ text }), signal: ctrl.signal });
      const data = await res.json().catch(() => null);
      // 合言葉が違う・無い → 端末に覚えた古い合言葉を消して、入力欄を出し直す(合言葉が変わったとき)
      if (res.status === 401) { savePassphrase(""); setShowPassphrase(true); }
      if (data?.code === "unset") setPassphraseUnset(true);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `AIの読み取りに失敗しました(${res.status})`);
      savePassphrase(passphrase.trim()); // 通ったときだけ、この端末に覚えておく
      const b = buildDraft({ draft: data.draft, noteText: text, price, laborUnitPrice });
      setBuilt(b);
      setLines(b.lines);
      setTitle(b.header.workTitle || b.header.workTitleRaw || "");
      const cands = findProjectCandidates({ pjs, salesReps, header: b.header });
      setProjectMode(cands.length ? "existing" : "new");
      setProjectId(""); // 候補があっても自動では選ばない(人が選ぶ)
      const reps = findRepCandidates(salesReps, b.header.repName);
      setNp(prev => ({ ...prev, name: b.header.propertyRaw.trim(), ...(reps.length === 1 ? { clientId: reps[0].company_id || "", branchId: reps[0].branch_id || "", salesRepId: reps[0].id, salesRep: reps[0].name } : {}) }));
    } catch (e) {
      setReadError(e.name === "AbortError" ? "AIの応答が60秒以内に返りませんでした。もう一度試してください(貼った文字はそのまま残っています)" : e.message);
    } finally {
      clearTimeout(timer);
      setReading(false);
    }
  };

  const candidates = useMemo(() => (built ? findProjectCandidates({ pjs, salesReps, header: built.header }) : []), [built, pjs, salesReps]);
  const repCandidates = useMemo(() => (built ? findRepCandidates(salesReps, built.header.repName) : []), [built, salesReps]);
  const views = useMemo(() => lines.map(l => ({ l, r: resolveLine(l, price) })), [lines, price]);
  const counts = views.reduce((c, { r }) => ({ ...c, [r.color]: c[r.color] + 1 }), { green: 0, yellow: 0, red: 0 });
  const amountOf = ({ l, r }) => (Number(l.qty) || 0) * (Number(r.salePrice) || 0);
  const total = views.reduce((s, v) => s + amountOf(v), 0);

  const updateLine = (key, patch) => setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = key => setLines(prev => prev.filter(l => l.key !== key));
  // 人が数量を入れたら、「曖昧」「内訳付き」「1式で仮置き」の印は外す(人が決めたため)
  const setQty = (l, v) => updateLine(l.key, { qty: v === "" ? null : Number(v), flags: { ...l.flags, breakdown: false, qtyAssumed: false } });

  const problems = [];
  if (!title.trim()) problems.push("見積タイトルを入力してください");
  if (!lines.length) problems.push("明細がありません");
  if (projectMode === "existing" && !projectId) problems.push("追加先の案件を選んでください");
  if (projectMode === "new" && !np.name.trim()) problems.push("案件名を入力してください");
  if (!built?.preferredSetId) problems.push("単価セット「工事見積用」が見つかりません");

  const register = async () => {
    if (problems.length || registering) return;
    setRegistering(true); setRegisterError("");
    const rep = salesReps.find(s => s.id === np.salesRepId);
    const pProject = projectMode === "existing" ? { id: projectId } : {
      name: np.name.trim(), status: "発注待ち", clientId: np.clientId || null,
      salesRepId: np.salesRepId || null, salesRep: rep?.name || np.salesRep || "", inCharge: np.inCharge.trim(),
      subcontractorIds: [], quoteDate: "",
    };
    const memo = `現調ノートから作成(AI下書き。人が確認して登録)。登録時の色: 緑${counts.green}・黄${counts.yellow}・赤${counts.red}`;
    const pQuote = { title: title.trim(), price_set_id: built.preferredSetId, status: "submitted", total_amount: Math.round(total), issued_at: null, memo, construction_type: "自社のみ", crew_id: defaultOwnCrewId(crews) || null };
    const pItems = views.map(({ l, r }) => ({
      price_item_id: r.item?.id ?? null,
      line_type: l.kind === "labor" ? "labor" : r.item ? "item" : "adjust",
      group_name: l.group_name, name: r.name, spec: r.spec || "", unit: r.unit || "",
      qty: Number(l.qty) || 0, sale_price: Number(r.salePrice) || 0,
      note: l.note || null,
      cost_price: r.costPrice, cost_confirmed: r.costConfirmed,
    }));
    // 別名辞書には、人が当てはめ先を選び直した行だけを保存する(類似で自動に当てはまった行は保存しない。回答6)
    const pAliases = views.filter(({ l, r }) => l.kind !== "labor" && r.status === "manual" && r.item)
      .map(({ l, r }) => ({ alias: aliasKey(l.sourceName, ""), price_item_id: r.item.id }));
    const { data, error } = await supabase.rpc("import_quote", { p_project: pProject, p_quote: pQuote, p_items: pItems, p_aliases: pAliases, p_file: null });
    if (error) {
      setRegisterError(`${describeError(error, "登録")}\n(案件・見積は登録されていません)`);
      setRegistering(false);
      return;
    }
    if (projectMode === "new" && (np.respondedAt || np.branchId)) {
      await supabase.from("projects").update({
        ...(np.respondedAt ? { respondedAt: np.respondedAt } : {}),
        ...(np.branchId ? { branchId: np.branchId } : {}),
      }).eq("id", data.project_id);
    }
    if (!pjs.some(p => p.id === data.project_id)) {
      const { data: p } = await supabase.from("projects").select("*").eq("id", data.project_id).single();
      if (p) setPjs(prev => [{ ...p, subIds: p.subcontractorIds || [], gp: p.grossProfit || 0, qDate: p.quoteDate || "" }, ...prev]);
    }
    setRegistering(false);
    // 出力先は既存の見積編集画面
    setQuoteProjectId(data.project_id);
    setOpenQuoteId(data.quote_id);
    nav("quotes");
  };

  const allItems = price?.items || [];
  const searchResults = searchKey && built ? searchItems(built.indexes.all, searchText) : [];

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="noteQuote" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} submittedQuotes={submittedQuotes} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} wonQuotes={wonQuotes} submittedQuotes={submittedQuotes} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title="📝 ノート見積作成" back={() => nav("home")} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={card}>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8, lineHeight: 1.6 }}>
            LINEの現調ノートの文字を貼ってください(写真は読みません)。AIが物件・営業担当・人数と時間・作業・材料に分け、単価表に当てはめた見積の下書きを作ります。<br />
            AIは「たたき台」までです。色の付いた行を確認してから登録してください。電話番号らしい文字は、AIに送る前に伏せます。
          </div>
          {price?.error && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>⚠️ {price.error}</div>}
          {showPassphrase ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>🔑 合言葉</span>
              <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="社内で決めた合言葉(この端末に覚えます)" autoComplete="off" style={{ ...inp, flex: 1 }} />
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>🔑 合言葉はこの端末に保存済みです <button onClick={() => setShowPassphrase(true)} style={{ background: "none", border: "none", color: "#2563EB", fontSize: 11, cursor: "pointer", padding: 0 }}>変更する</button></div>
          )}
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} disabled={reading} placeholder={"例:\n○○マンション101\n給水管一部更新工事\n2名作業9:00〜17:00\n○○さん案件\n・内容\n…\n・材料\n13エルボ×5"} rows={10} style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: 11, color: noteText.length > NOTE_MAX_CHARS ? "#DC2626" : "#9CA3AF" }}>{noteText.length} / {NOTE_MAX_CHARS} 文字</span>
            <button onClick={readNote} disabled={reading || !noteText.trim() || !price || noteText.length > NOTE_MAX_CHARS} style={{ padding: "10px 18px", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: reading ? "default" : "pointer", opacity: reading || !noteText.trim() || !price ? 0.6 : 1 }}>
              {reading ? "AIが読み取り中...(10〜20秒)" : built ? "🔁 もう一度読み取る" : "🤖 AIで読み取る"}
            </button>
          </div>
          {readError && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginTop: 10, whiteSpace: "pre-wrap" }}>⚠️ {readError}</div>}
          {readError && passphraseUnset && <button onClick={() => nav("notepassphrase")} style={{ marginTop: 6, background: "none", border: "none", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>🔑 設定画面で見積作成パスワードを設定する →</button>}
          {maskedCount > 0 && built && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>電話番号らしい文字を {maskedCount} か所伏せてから、AIに送りました</div>}
        </div>

        {built && (
          <>
            <div style={card}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 8 }}>🏗️ 追加先の案件(人が選んでください)</div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
                ノートの物件: <b>{built.header.propertyRaw || "(読み取れませんでした)"}</b>
                {built.header.repName && <> / 営業担当: <b>{built.header.repName}</b>{repCandidates.length > 1 && <span style={{ color: "#B45309" }}>(同じ名前の営業担当が{repCandidates.length}人います)</span>}{repCandidates.length === 0 && <span style={{ color: "#B45309" }}>(営業担当の一覧にいません)</span>}</>}
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 13, marginBottom: 8, color: "#1F2937" }}>
                <label style={{ cursor: "pointer" }}><input type="radio" checked={projectMode === "existing"} onChange={() => setProjectMode("existing")} /> 既存の案件に追加</label>
                <label style={{ cursor: "pointer" }}><input type="radio" checked={projectMode === "new"} onChange={() => setProjectMode("new")} /> 新しい案件として作る</label>
              </div>
              {projectMode === "existing" ? (
                <>
                  {candidates.length > 0 ? (
                    <div style={{ marginBottom: 8 }}>
                      <div style={label}>候補(物件名・営業担当が近い順。自動では選びません)</div>
                      {candidates.map(({ p, score, repMatch, roomMismatch }) => (
                        <button key={p.id} onClick={() => setProjectId(p.id)} style={{ display: "block", width: "100%", textAlign: "left", background: projectId === p.id ? "#FDE68A" : "#fff", border: "1px solid #FCD34D", borderRadius: 8, padding: "6px 10px", marginBottom: 4, fontSize: 12, cursor: "pointer", color: "#1F2937" }}>
                          <b>{p.name}</b>
                          <span style={{ color: "#6B7280" }}> — {cos.find(c => c.id === p.clientId)?.name || "取引先未設定"} / {branches.find(b => b.id === p.branchId)?.name || "営業所未設定"} / {p.salesRep || "営業担当未設定"} / {p.status} / 更新 {String(p.updated_at || p.created_at || "").slice(0, 10)}</span>
                          <span style={{ color: "#9CA3AF" }}> (近さ{Math.round(score * 100)}%)</span>
                          {repMatch && <span style={{ color: "#065F46", fontWeight: 700 }}> 営業担当一致</span>}
                          {roomMismatch && <div style={{ color: "#DC2626", fontWeight: 700 }}>⚠ 部屋番号がノートと違います。別の部屋の案件かもしれません</div>}
                        </button>
                      ))}
                    </div>
                  ) : <div style={{ fontSize: 12, color: "#92400E", marginBottom: 8 }}>近い案件が見つかりませんでした。一覧から選ぶか、新しい案件として作ってください</div>}
                  <div style={label}>一覧から選ぶ</div>
                  <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inp}>
                    <option value="">選んでください</option>
                    {pjs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <div style={label}>案件名 *(ノートの物件名を入れてあります)</div>
                  <input value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} style={{ ...inp, marginBottom: 8 }} />
                  <ClientBranchRepPicker clientId={np.clientId} branchId={np.branchId} salesRepId={np.salesRepId} cos={cos} setCos={setCos} branches={branches} setBranches={setBranches} salesReps={salesReps} setSalesReps={setSalesReps} onChange={v => setNp(prev => ({ ...prev, ...v }))} />
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <div style={{ flex: 1 }}><div style={label}>社内担当</div><input value={np.inCharge} onChange={e => setNp({ ...np, inCharge: e.target.value })} style={inp} /></div>
                    <div style={{ flex: 1 }}><div style={label}>対応日</div><input type="date" value={np.respondedAt} onChange={e => setNp({ ...np, respondedAt: e.target.value })} style={inp} /></div>
                  </div>
                </>
              )}
            </div>

            <div style={card}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 8 }}>📝 見積の下書き</div>
              <div style={label}>見積タイトル *</div>
              <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...inp, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, fontSize: 12 }}>
                {["green", "yellow", "red"].map(c => <span key={c} style={{ background: COLOR[c].bg, color: COLOR[c].color, borderRadius: 6, padding: "2px 10px", fontWeight: 700 }}>{COLOR[c].text} {counts[c]}件</span>)}
                <span style={{ color: "#6B7280" }}>緑=単価表と一致 / 黄=予測で当てはめ(確認してください) / 赤=分からない(人が決めてください)</span>
              </div>
              {built.notices.map((n, i) => <div key={i} style={{ background: NOTICE[n.level].bg, color: NOTICE[n.level].color, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{n.text}</div>)}
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                  <thead><tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                    <th style={th}>色</th><th style={th}>ノートの言葉</th><th style={th}>当てはめ先(単価表)</th><th style={th}>数量</th><th style={th}>売価</th><th style={th}>金額</th><th style={th}>原価単価(社内用)</th><th style={th}></th>
                  </tr></thead>
                  <tbody>
                    {views.map(({ l, r }) => {
                      const c = COLOR[r.color];
                      const options = [];
                      if (r.item) options.push(r.item);
                      if (l.match.item && !options.some(o => o.id === l.match.item.id)) options.push(l.match.item);
                      for (const cd of l.match.candidates) if (!options.some(o => o.id === cd.item.id)) options.push(cd.item);
                      const scoreOf = id => l.match.candidates.find(cd => cd.item.id === id)?.score;
                      const pickedSelect = l.pickedItemId !== undefined ? (l.pickedItemId || "") : (l.match.item?.id || "");
                      return (
                        <tr key={l.key} style={{ borderBottom: "1px solid #F3F4F6", background: c.row }}>
                          <td style={td}><span style={{ fontSize: 11, fontWeight: 800, color: c.color, background: c.bg, borderRadius: 4, padding: "1px 6px" }}>{c.text}</span></td>
                          <td style={{ ...td, minWidth: 160 }}>
                            <div style={{ fontWeight: 700 }}>{l.kind === "labor" ? "👷 " : ""}{l.sourceName}</div>
                            {l.raws.filter(Boolean).map((raw, i) => <div key={i} style={{ fontSize: 10, color: "#9CA3AF" }}>「{raw.trim()}」</div>)}
                            {l.note && <div style={{ fontSize: 10, color: "#6B7280" }}>備考: {l.note}</div>}
                          </td>
                          <td style={{ ...td, minWidth: 220 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: c.color, marginBottom: 2 }}>{STATUS_TEXT[r.status]}{r.status === "auto" && l.match.score != null ? ` ${Math.round(l.match.score * 100)}%` : ""}{r.item && r.item.price_set_id !== built.preferredSetId ? `(単価セット: ${price.sets.find(s => s.id === r.item.price_set_id)?.name || "他"})` : ""}</div>
                            {r.color !== "green" && r.item && <div style={{ fontSize: 10, color: "#92400E", marginBottom: 2 }}>⚠ 「{l.sourceName}」→「{r.item.name}{r.item.spec ? " " + r.item.spec : ""}」</div>}
                            {l.kind === "labor" ? (
                              <div style={{ fontSize: 12 }}>{r.name} {r.spec}</div>
                            ) : (
                              <div style={{ display: "flex", gap: 3 }}>
                                <select value={pickedSelect} onChange={e => updateLine(l.key, { pickedItemId: e.target.value || null })} style={{ ...cellInp, fontSize: 11, flex: 1, minWidth: 0 }}>
                                  <option value="">当てはめない(手入力)</option>
                                  {options.map(it => <option key={it.id} value={it.id}>{it.name} {it.spec || ""} / 売価{it.sale_price ?? "なし"}{scoreOf(it.id) != null ? ` [類似${Math.round(scoreOf(it.id) * 100)}%]` : ""}</option>)}
                                </select>
                                <button onClick={() => { setSearchKey(searchKey === l.key ? null : l.key); setSearchText(""); }} title="単価表を検索" style={{ border: "1px solid #E5E7EB", background: searchKey === l.key ? "#EEF2FF" : "#fff", borderRadius: 6, cursor: "pointer", fontSize: 11, padding: "0 6px" }}>🔍</button>
                              </div>
                            )}
                            {searchKey === l.key && (
                              <div style={{ marginTop: 4, border: "1px solid #C7D2FE", borderRadius: 6, padding: 4, background: "#fff" }}>
                                <input autoFocus value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="名称・仕様で検索" style={{ ...cellInp, fontSize: 11, marginBottom: 3 }} />
                                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                                  {searchText && searchResults.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF", padding: 4 }}>該当なし</div>}
                                  {searchResults.map(it => (
                                    <div key={it.id} onClick={() => { updateLine(l.key, { pickedItemId: it.id }); setSearchKey(null); }} style={{ fontSize: 11, padding: "3px 4px", cursor: "pointer", borderBottom: "1px solid #F3F4F6" }}>
                                      {it.name} <span style={{ color: "#9CA3AF" }}>{it.spec}</span> <span style={{ color: "#6B7280" }}>/ 売価{it.sale_price ?? "なし"}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {r.reasons.length > 0 && <div style={{ fontSize: 10, color: c.color, marginTop: 2 }}>{r.reasons.join(" / ")}</div>}
                          </td>
                          <td style={{ ...td, width: 90 }}>
                            {l.kind === "labor" ? <span>1 式</span> : (
                              <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                                <input type="number" min="0" value={l.qty ?? ""} placeholder="要確認" onChange={e => setQty(l, e.target.value)} style={{ ...cellInp, width: 56, borderColor: l.qty == null ? "#FCA5A5" : "#E5E7EB" }} />
                                <span style={{ fontSize: 11, color: "#6B7280" }}>{r.unit}</span>
                              </div>
                            )}
                          </td>
                          <td style={{ ...td, width: 90 }}>
                            {r.item || l.kind === "labor" ? (r.salePrice != null ? fmt(r.salePrice) : <span style={{ color: "#DC2626" }}>なし</span>) : (
                              <input type="number" min="0" value={l.manualSalePrice ?? ""} placeholder="要確認" onChange={e => updateLine(l.key, { manualSalePrice: e.target.value === "" ? undefined : Number(e.target.value) })} style={{ ...cellInp, width: 80, borderColor: "#FCA5A5" }} />
                            )}
                          </td>
                          <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700, color: "#E07B39" }}>{fmt(amountOf({ l, r }))}</td>
                          <td style={{ ...td, width: 100 }}>
                            <input type="number" value={r.costPrice ?? ""} placeholder="未入力" onChange={e => updateLine(l.key, { costOverride: e.target.value === "" ? { price: null, confirmed: false } : { price: Number(e.target.value), confirmed: true } })} style={{ ...cellInp, width: 80, borderColor: r.costConfirmed ? "#E5E7EB" : "#FCA5A5" }} />
                            {l.wholesale?.value != null && l.costOverride === undefined && <div style={{ fontSize: 10, color: "#6B7280" }}>ノートの卸値</div>}
                          </td>
                          <td style={td}><button onClick={() => removeLine(l.key)} title="この行を消す" style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 13 }}>🗑</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 12, color: "#6B7280" }}>下書きの合計(税抜・売価)</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: "#1A3A5C" }}>{fmt(Math.round(total))}</span>
              </div>
              {allItems.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF" }}>単価表を読み込み中...</div>}
            </div>

            <div style={card}>
              {problems.length > 0 && problems.map(p => <div key={p} style={{ fontSize: 12, color: "#DC2626", fontWeight: 700, marginBottom: 2 }}>・{p}</div>)}
              {counts.red > 0 && <div style={{ fontSize: 12, color: "#991B1B", marginBottom: 6 }}>赤の行が {counts.red} 件あります。このまま登録して、見積編集画面で直すこともできます(数量・売価が空の行は 0 円で入ります)</div>}
              {registerError && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 8, whiteSpace: "pre-wrap" }}>⚠️ {registerError}</div>}
              <button onClick={register} disabled={!!problems.length || registering} style={{ width: "100%", padding: "12px 0", background: problems.length ? "#9CA3AF" : "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: problems.length || registering ? "default" : "pointer", opacity: registering ? 0.6 : 1 }}>
                {registering ? "登録中..." : "💾 下書きを登録して、見積編集画面を開く"}
              </button>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>見積は「発注前」で登録します。案件の受注金額・粗利は変わりません。</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
