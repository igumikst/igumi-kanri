import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { STATUSES, STATUS_STYLE, fmt, pct, todayStr, dateJp } from "../lib/constants";
import { Badge, Inp, Sel, Modal, Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import ClientBranchRepPicker from "../components/ClientBranchRepPicker";
import { CONSTRUCTION_TYPES, computeQuoteFinancials } from "../lib/quoteFinancials";
import FileDropZone from "../components/FileDropZone";
import { usePreventWindowFileDrop } from "../lib/useFileDropGuard";
import { REPORT_FILE_BUCKET, REPORT_FILE_TYPES, REPORT_FILE_MAX_SIZE, reportFileExt, openReportFile } from "../lib/reportFiles";

export default function Projects({ pjs, setPjs, cos, setCos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, setQuoteProjectId, setQuoteImportCtx, branches, setBranches, salesReps, setSalesReps }) {
  usePreventWindowFileDrop();
  const [selP, setSelP] = useState(null);
  const [modal, setModal] = useState(null);
  const [fltS, setFltS] = useState("すべて");
  const [fltInCharge, setFltInCharge] = useState("すべて");
  const [schP, setSchP] = useState("");
  const [quickStatus, setQuickStatus] = useState(null);
  const [conf, setConf] = useState(null);
  const [editP, setEditP] = useState(null);
  const blankP = { name: "", status: "発注待ち", clientId: "", branchId: "", salesRepId: "", salesRep: "", inCharge: "崎岡", subIds: [], amount: "", gp: "", qDate: "", respondedAt: todayStr(), completedOn: "", constructionType: "自社のみ" };
  const [nP, setNP] = useState(blankP);

  // 案件の詳細を開いている時だけ、その案件の見積・報告書ファイルを読み込む
  const [quotes, setQuotes] = useState([]);
  const [reportFiles, setReportFiles] = useState([]);
  const [reportQuoteChoice, setReportQuoteChoice] = useState("");
  const [reportUploading, setReportUploading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!selP) { setQuotes([]); setReportFiles([]); setReportQuoteChoice(""); return; }
      const [{ data: qs }, { data: rf }] = await Promise.all([
        supabase.from("quotes").select("*").eq("project_id", selP.id),
        supabase.from("report_files").select("*").eq("project_id", selP.id).order("created_at", { ascending: false }),
      ]);
      setQuotes(qs || []);
      setReportFiles(rf || []);
      setReportQuoteChoice((qs || []).length === 1 ? qs[0].id : "");
    })();
  }, [selP]);

  // 「完工済」の処理(Quotes.jsxのadoptQuoteと同じ考え方): 見積の原価・下請け原価から
  // 受注金額・粗利を計算し、確認ダイアログのあと、見積をwon・案件を完了にする
  const computeQuoteTotalsForAdopt = async quote => {
    const [{ data: itemsData }, { data: subData }] = await Promise.all([
      supabase.from("quote_items").select("*").eq("quote_id", quote.id),
      supabase.from("quote_subcontractor_costs").select("amount").eq("quote_id", quote.id),
    ]);
    const ids = (itemsData || []).map(r => r.id);
    const { data: costsData } = ids.length ? await supabase.from("quote_item_costs").select("*").in("quote_item_id", ids) : { data: [] };
    const costsByItem = Object.fromEntries((costsData || []).map(c => [c.quote_item_id, c]));
    const total = quote.total_amount || 0;
    const lines = (itemsData || []).map(r => ({ qty: r.qty, costPrice: costsByItem[r.id]?.cost_price ?? null, costConfirmed: !!costsByItem[r.id]?.cost_confirmed, isSubcontracted: !!r.is_subcontracted }));
    const subAmountTotal = (subData || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const { gp, subMissing, ownUnconfirmed } = computeQuoteFinancials({ constructionType: selP.constructionType || "自社のみ", saleTotal: total, lines, subAmountTotal, subCount: (subData || []).length });
    return { total, gp, subMissing, ownUnconfirmed };
  };

  const adoptCompletedOnRef = useRef(todayStr());
  const adoptQuoteFromReports = async quote => {
    const { total, gp, subMissing, ownUnconfirmed } = await computeQuoteTotalsForAdopt(quote);
    const prevAdopted = quotes.find(q => q.is_adopted && q.id !== quote.id);
    adoptCompletedOnRef.current = todayStr();
    const msg = [
      `「${quote.title}」を完工済(採用)にします`,
      prevAdopted ? `(現在「${prevAdopted.title}」が採用中です。切り替えます)` : "",
      "",
      `受注金額: ${fmt(selP.amount)} → ${fmt(total)}`,
      `粗利: ${fmt(selP.gp)} → ${fmt(gp)}`,
      ownUnconfirmed ? "⚠️ 原価が未確認の明細があります。粗利は暫定です" : "",
      subMissing ? "⚠️ 下請けの原価が1件も登録されていません。粗利は暫定です" : "",
      "",
      "案件の状態も「完了」にし、案件の受注金額・粗利を上書きします。元に戻せません。",
      "よろしいですか？",
    ].filter(Boolean).join("\n");
    setConf({ msg, okLabel: "完工済にする", okColor: "#059669",
      extra: (
        <div style={{ marginBottom: 14, textAlign: "left" }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>完工日 *</div>
          <input type="date" defaultValue={adoptCompletedOnRef.current} onChange={e => { adoptCompletedOnRef.current = e.target.value; }} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, color: "#1F2937", boxSizing: "border-box" }} />
        </div>
      ),
      onOk: async () => {
      if (!adoptCompletedOnRef.current) { alert("完工日を入力してください"); return; }
      const completedOn = adoptCompletedOnRef.current;
      if (prevAdopted) await supabase.from("quotes").update({ is_adopted: false }).eq("id", prevAdopted.id);
      await supabase.from("quotes").update({ is_adopted: true, status: "won" }).eq("id", quote.id);
      await supabase.from("projects").update({ amount: Math.round(total), grossProfit: Math.round(gp), status: "完了", completedOn }).eq("id", selP.id);
      const updated = { ...selP, amount: Math.round(total), gp: Math.round(gp), status: "完了", completedOn };
      setPjs(prev => prev.map(p => p.id === selP.id ? updated : p));
      setSelP(updated);
      setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, is_adopted: true, status: "won" } : (prevAdopted && q.id === prevAdopted.id) ? { ...q, is_adopted: false } : q));
      setConf(null);
    } });
  };

  const proposeAdopt = quote => {
    setConf({ msg: `「${quote.title}」を完工済みにしますか？`, okLabel: "はい", onOk: () => adoptQuoteFromReports(quote) });
  };

  // 報告書ファイルの追加: .xlsx/.xls/.pdf のみ、1ファイル30MBまで。再圧縮はしない(超えたら理由を出して受け付けない)
  const uploadReportFiles = async fileList => {
    const files = [...(fileList || [])];
    if (!files.length || !selP) return;
    setReportUploading(true);
    const rejected = [];
    const added = [];
    for (const file of files) {
      const ext = reportFileExt(file.name);
      if (!REPORT_FILE_TYPES[ext]) { rejected.push(`「${file.name}」: .xlsx / .xls / .pdf のファイルだけ追加できます`); continue; }
      if (file.size > REPORT_FILE_MAX_SIZE) { rejected.push(`「${file.name}」: 30MBを超えています(${(file.size / 1024 / 1024).toFixed(1)}MB)。ファイルを小さくしてから追加してください`); continue; }
      const storagePath = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(REPORT_FILE_BUCKET).upload(storagePath, file, { contentType: REPORT_FILE_TYPES[ext], upsert: false });
      if (upErr) { rejected.push(`「${file.name}」: 保存に失敗しました(${upErr.message})`); continue; }
      const { data, error: insErr } = await supabase.from("report_files").insert([{
        project_id: selP.id, quote_id: reportQuoteChoice || null, storage_path: storagePath, original_name: file.name, size_bytes: file.size,
      }]).select();
      if (insErr) { rejected.push(`「${file.name}」: 記録に失敗しました(${insErr.message})`); continue; }
      added.push(data[0]);
    }
    if (added.length) setReportFiles(prev => [...added, ...prev]);
    setReportUploading(false);
    if (rejected.length) alert(rejected.join("\n"));
    // 見積に紐づけて追加した時、その見積がまだ完工済みでなければ、完工済みにするか提案する(ブロックはしない)
    if (added.length && reportQuoteChoice) {
      const q = quotes.find(x => x.id === reportQuoteChoice);
      if (q && q.status !== "won") proposeAdopt(q);
    }
  };

  const getC = id => cos.find(c => c.id === id);
  const inChargeList = ["すべて", ...new Set(pjs.map(p => p.inCharge).filter(Boolean))];

  const filtP = pjs.filter(p => {
    if (fltS !== "すべて" && p.status !== fltS) return false;
    if (fltInCharge !== "すべて" && p.inCharge !== fltInCharge) return false;
    if (schP && !p.name.includes(schP) && !(getC(p.clientId)?.name || "").includes(schP) && !(p.inCharge || "").includes(schP)) return false;
    return true;
  });

  const tA = filtP.reduce((s, p) => s + (p.amount || 0), 0);
  const tG = filtP.reduce((s, p) => s + (p.gp || 0), 0);

  const savePj = async () => {
    if (!nP.name) return;
    if (nP.status === "完了" && !nP.completedOn) { alert("完工日を入力してください"); return; }
    const { data } = await supabase.from("projects").insert([{ name: nP.name, status: nP.status, clientId: nP.clientId || null, branchId: nP.branchId || null, salesRepId: nP.salesRepId || null, salesRep: nP.salesRep, inCharge: nP.inCharge, subcontractorIds: nP.subIds || [], amount: Number(nP.amount) || 0, grossProfit: Number(nP.gp) || 0, quoteDate: nP.qDate, respondedAt: nP.respondedAt || null, completedOn: nP.completedOn || null, constructionType: nP.constructionType || "自社のみ" }]).select();
    if (data) setPjs([{ ...data[0], subIds: data[0].subcontractorIds || [], gp: data[0].grossProfit || 0, qDate: data[0].quoteDate || "" }, ...pjs]);
    setNP(blankP); setModal(null);
  };

  const updatePj = async () => {
    if (!editP || !editP.name) return;
    if (editP.status === "完了" && !editP.completedOn) { alert("完工日を入力してください"); return; }
    const salesRep = editP.salesRep;
    await supabase.from("projects").update({ name: editP.name, status: editP.status, clientId: editP.clientId || null, branchId: editP.branchId || null, salesRepId: editP.salesRepId || null, salesRep, inCharge: editP.inCharge, subcontractorIds: editP.subIds || [], amount: Number(editP.amount) || 0, grossProfit: Number(editP.gp) || 0, quoteDate: editP.qDate, respondedAt: editP.respondedAt || null, completedOn: editP.completedOn || null, constructionType: editP.constructionType || "自社のみ" }).eq("id", editP.id);
    const updated = { ...editP, salesRep, gp: Number(editP.gp) || 0, amount: Number(editP.amount) || 0, respondedAt: editP.respondedAt || null, completedOn: editP.completedOn || null };
    setPjs(pjs.map(p => p.id === editP.id ? updated : p));
    setSelP(updated); setEditP(null);
  };

  const delPj = async id => {
    await supabase.from("projects").delete().eq("id", id);
    setPjs(pjs.filter(p => p.id !== id)); setSelP(null);
  };

  const pending = tks.filter(t => !t.done);

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="projects" nav={nav} setModal={setModal} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title={selP ? selP.name : "📋 案件管理"} back={selP ? () => setSelP(null) : () => nav("home")}
        right={!selP && <div style={{ display: "flex", gap: 6 }}><button onClick={() => { setQuoteImportCtx({ from: "projects", projectId: null }); nav("quoteImport"); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>📥 見積ファイル</button><button onClick={() => setModal("addP")} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ 新規</button></div>} />

      {selP ? (
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          {editP ? (
            <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#1A3A5C", marginBottom: 14 }}>✏️ 案件を編集</div>
              <Inp label="案件名 *" value={editP.name} onChange={e => setEditP({ ...editP, name: e.target.value })} />
              <Sel label="ステータス" opts={STATUSES} value={editP.status} onChange={e => { const v = e.target.value; setEditP(prev => ({ ...prev, status: v, completedOn: v === "完了" && !prev.completedOn ? todayStr() : prev.completedOn })); }} />
              {editP.status === "完了" && !quotes.some(q => q.status === "won") && (
                <div style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 10 }}>
                  ⚠️ 売上・粗利が空のままです。見積を完工済みにしますか?
                  <button onClick={() => { setQuoteProjectId(editP.id); nav("quotes"); }} style={{ marginLeft: 6, border: "none", background: "none", color: "#2563EB", fontWeight: 700, cursor: "pointer", fontSize: 12, padding: 0 }}>見積一覧へ →</button>
                </div>
              )}
              <Inp label="社内担当" value={editP.inCharge || ""} onChange={e => setEditP({ ...editP, inCharge: e.target.value })} />
              <ClientBranchRepPicker
                clientId={editP.clientId} branchId={editP.branchId} salesRepId={editP.salesRepId}
                cos={cos} setCos={setCos} branches={branches} setBranches={setBranches} salesReps={salesReps} setSalesReps={setSalesReps}
                onChange={patch => setEditP({ ...editP, ...patch })}
              />
              <Inp label="受注金額" type="number" value={editP.amount || ""} onChange={e => setEditP({ ...editP, amount: e.target.value })} />
              <Inp label="粗利" type="number" value={editP.gp || ""} onChange={e => setEditP({ ...editP, gp: e.target.value })} />
              <Inp label="見積提出日" type="date" value={editP.qDate || ""} onChange={e => setEditP({ ...editP, qDate: e.target.value })} />
              <Inp label="対応日" type="date" value={editP.respondedAt || ""} onChange={e => setEditP({ ...editP, respondedAt: e.target.value })} />
              <Inp label={editP.status === "完了" ? "完工日 *" : "完工日"} type="date" value={editP.completedOn || ""} onChange={e => setEditP({ ...editP, completedOn: e.target.value })} />
              <Sel label="施工形態" opts={CONSTRUCTION_TYPES} value={editP.constructionType || "自社のみ"} onChange={e => setEditP({ ...editP, constructionType: e.target.value })} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditP(null)} style={{ flex: 1, padding: "12px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#374151" }}>キャンセル</button>
                <button onClick={updatePj} style={{ flex: 2, padding: "12px 0", background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>💾 保存する</button>
              </div>
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 17, flex: 1, marginRight: 8, color: "#1F2937" }}>{selP.name}</div>
                <Badge s={selP.status} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button onClick={() => setEditP({ ...selP, respondedAt: selP.respondedAt || todayStr() })} style={{ flex: 2, padding: "8px 0", background: "#EFF6FF", color: "#1A3A5C", border: "1.5px solid #BFDBFE", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✏️ 編集</button>
                <button onClick={() => setConf({ msg: `「${selP.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delPj(selP.id); setConf(null); } })} style={{ flex: 1, padding: "8px 0", background: "#FEF2F2", color: "#DC2626", border: "1.5px solid #FECACA", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🗑 削除</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, background: "#FFF7ED", borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "#9CA3AF" }}>受注金額</div><div style={{ fontSize: 16, fontWeight: 800, color: "#E07B39" }}>{fmt(selP.amount)}</div></div>
                <div style={{ flex: 1, background: "#F0FDF4", borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "#9CA3AF" }}>粗利 / 粗利率</div><div style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>{fmt(selP.gp)}</div><div style={{ fontSize: 11, color: "#059669" }}>{pct(selP.gp, selP.amount)}</div></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
                {[["ステータス", selP.status], ["社内担当", selP.inCharge], ["営業所", branches.find(b => b.id === selP.branchId)?.name], ["営業担当", selP.salesRep], ["見積提出日", selP.qDate], ["対応日", dateJp(selP.respondedAt)], ["完工日", dateJp(selP.completedOn)], ["施工形態", selP.constructionType || "自社のみ"]].map(([l, v]) => (
                  <div key={l} style={{ marginBottom: 8 }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>{l}</div><div style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{v || "—"}</div></div>
                ))}
              </div>
              <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14, marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C", marginBottom: 8 }}>🏢 取引先</div>
                {getC(selP.clientId) ? <div style={{ background: "#F0F4F8", borderRadius: 10, padding: "10px 12px" }}><div style={{ fontWeight: 700, color: "#1F2937" }}>{getC(selP.clientId).name}</div></div> : <div style={{ color: "#9CA3AF", fontSize: 13 }}>未設定</div>}
              </div>
              <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14, marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C", marginBottom: 8 }}>📝 見積</div>
                <button onClick={() => { setQuoteProjectId(selP.id); nav("quotes"); }} style={{ width: "100%", padding: "10px 0", background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📝 見積一覧を見る・作成する →</button>
                <button onClick={() => { setQuoteImportCtx({ from: "projects", projectId: selP.id }); nav("quoteImport"); }} style={{ width: "100%", marginTop: 8, padding: "10px 0", background: "#fff", color: "#1A3A5C", border: "1.5px dashed #94A3B8", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📥 見積ファイルから登録</button>
              </div>
              <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C" }}>📎 報告書</div>
                  <button onClick={() => window.open("/report.html", "_blank")} style={{ border: "none", background: "none", color: "#2563EB", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>報告書ツールを開く →</button>
                </div>
                {quotes.filter(q => q.status === "won" && !reportFiles.some(rf => rf.quote_id === q.id)).length > 0 && (
                  <div style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 8, padding: "6px 10px", fontSize: 11, marginBottom: 8 }}>
                    ⚠️ 報告書が未登録です: {quotes.filter(q => q.status === "won" && !reportFiles.some(rf => rf.quote_id === q.id)).map(q => q.title).join("、")}
                  </div>
                )}
                {reportFiles.length === 0
                  ? <div style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 10 }}>報告書が未登録です</div>
                  : reportFiles.map(rf => (
                    <div key={rf.id} style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rf.original_name}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                          {rf.quote_id ? (quotes.find(q => q.id === rf.quote_id)?.title || "見積") : "紐づけなし"} ・ {(rf.size_bytes / 1024 / 1024).toFixed(1)}MB ・ {new Date(rf.created_at).toLocaleDateString("ja-JP")}
                        </div>
                      </div>
                      <button onClick={() => openReportFile(rf)} style={{ border: "1px solid #E5E7EB", background: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "#1A3A5C", cursor: "pointer", whiteSpace: "nowrap" }}>📎 開く</button>
                    </div>
                  ))}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>どの見積の報告書か(任意)</div>
                  <select value={reportQuoteChoice} onChange={e => setReportQuoteChoice(e.target.value)} style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937", marginBottom: 8 }}>
                    <option value="">見積に紐づけない</option>
                    {quotes.map(q => <option key={q.id} value={q.id}>{q.title}{q.status === "won" ? "(完工済)" : ""}</option>)}
                  </select>
                  <FileDropZone onFiles={files => uploadReportFiles(files)} disabled={reportUploading} activeLabel="ここに落とす">
                    <label style={{ display: "block", border: "2px dashed #93C5FD", borderRadius: 10, padding: "14px 10px", textAlign: "center", cursor: reportUploading ? "default" : "pointer", background: "#F0F7FF", opacity: reportUploading ? 0.6 : 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1A3A5C" }}>{reportUploading ? "追加中..." : "📂 報告書を追加(.xlsx / .xls / .pdf、30MBまで。複数可)"}</div>
                      <input type="file" accept=".xlsx,.xls,.pdf" multiple disabled={reportUploading} onChange={e => { uploadReportFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
                    </label>
                  </FileDropZone>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          <input value={schP} onChange={e => setSchP(e.target.value)} placeholder="🔍 案件名・取引先・担当者で検索" style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#fff", boxSizing: "border-box", marginBottom: 10, color: "#1F2937" }} />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
            {["すべて", ...STATUSES].map(s => (<button key={s} onClick={() => setFltS(s)} style={{ padding: "4px 12px", borderRadius: 16, border: "1.5px solid", whiteSpace: "nowrap", borderColor: fltS === s ? "#1A3A5C" : "#D1D5DB", background: fltS === s ? "#1A3A5C" : "#fff", color: fltS === s ? "#fff" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{s}</button>))}
          </div>
          {inChargeList.length > 2 && <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>{inChargeList.map(n => (<button key={n} onClick={() => setFltInCharge(n)} style={{ padding: "4px 12px", borderRadius: 16, border: "1.5px solid", whiteSpace: "nowrap", borderColor: fltInCharge === n ? "#E07B39" : "#D1D5DB", background: fltInCharge === n ? "#E07B39" : "#fff", color: fltInCharge === n ? "#fff" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{n === "すべて" ? "👤 全員" : "👤 " + n}</button>))}</div>}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["件数", `${filtP.length}件`], ["受注合計", fmt(tA)], ["粗利合計", fmt(tG)]].map(([l, v]) => (<div key={l} style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "8px 10px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}><div style={{ fontSize: 10, color: "#9CA3AF" }}>{l}</div><div style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C", marginTop: 1 }}>{v}</div></div>))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {filtP.map(p => {
              const cl = getC(p.clientId);
              const gp = p.amount ? ((p.gp / p.amount) * 100).toFixed(1) : null;
              return (
                <div key={p.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: "4px solid #1A3A5C", overflow: "hidden" }}>
                  <div onClick={() => setSelP(p)} style={{ padding: "13px 14px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8, color: "#1F2937" }}>{p.name}</div>
                      <div onClick={e => { e.stopPropagation(); setQuickStatus(quickStatus === p.id ? null : p.id); }}>
                        <Badge s={p.status} />
                      </div>
                    </div>
                    {quickStatus === p.id && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>{STATUSES.map(s => <button key={s} onClick={e => {
                      e.stopPropagation();
                      if (s === "完了" && !p.completedOn) {
                        setSelP(p);
                        setEditP({ ...p, status: "完了", completedOn: todayStr(), respondedAt: p.respondedAt || todayStr() });
                        setQuickStatus(null);
                        return;
                      }
                      supabase.from("projects").update({ status: s }).eq("id", p.id).then(() => { setPjs(prev => prev.map(x => x.id === p.id ? { ...x, status: s } : x)); setQuickStatus(null); });
                    }} style={{ padding: "3px 8px", borderRadius: 10, border: "1px solid", fontSize: 10, fontWeight: 700, cursor: "pointer", borderColor: STATUS_STYLE[s]?.border || "#ccc", background: p.status === s ? STATUS_STYLE[s]?.bg : "#fff", color: STATUS_STYLE[s]?.text || "#374151" }}>{s}</button>)}</div>}
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{cl ? `🏢 ${cl.name}${cl.branch ? " " + cl.branch : ""}` : "取引先未設定"}{p.inCharge && <span style={{ marginLeft: 8, color: "#9CA3AF" }}>👤 {p.inCharge}</span>}</div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#E07B39" }}>{fmt(p.amount)}</div>{gp && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>粗利率 {gp}%</div>}</div>
                    {p.completedOn && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>完工日 {dateJp(p.completedOn)}</div>}
                  </div>
                  <div style={{ display: "flex", borderTop: "1px solid #F3F4F6" }}>
                    <button onClick={() => setSelP(p)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>詳細 →</button>
                    <button onClick={() => setConf({ msg: `「${p.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delPj(p.id); setConf(null); } })} style={{ padding: "8px 16px", background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {modal === "addP" && (<Modal title="新規案件を追加" onClose={() => setModal(null)} onSave={savePj}>
        <Inp label="案件名 *" value={nP.name} onChange={e => setNP({ ...nP, name: e.target.value })} placeholder="例: ○○マンション改修工事" />
        <Sel label="ステータス" opts={STATUSES} value={nP.status} onChange={e => { const v = e.target.value; setNP(prev => ({ ...prev, status: v, completedOn: v === "完了" && !prev.completedOn ? todayStr() : prev.completedOn })); }} />
        <Inp label="社内担当" value={nP.inCharge} onChange={e => setNP({ ...nP, inCharge: e.target.value })} />
        <ClientBranchRepPicker
          clientId={nP.clientId} branchId={nP.branchId} salesRepId={nP.salesRepId}
          cos={cos} setCos={setCos} branches={branches} setBranches={setBranches} salesReps={salesReps} setSalesReps={setSalesReps}
          onChange={patch => setNP({ ...nP, ...patch })}
        />
        <Inp label="見積提出日" type="date" value={nP.qDate} onChange={e => setNP({ ...nP, qDate: e.target.value })} />
        <Inp label="対応日" type="date" value={nP.respondedAt} onChange={e => setNP({ ...nP, respondedAt: e.target.value })} />
        {nP.status === "完了" && <Inp label="完工日 *" type="date" value={nP.completedOn || ""} onChange={e => setNP({ ...nP, completedOn: e.target.value })} />}
        <Sel label="施工形態" opts={CONSTRUCTION_TYPES} value={nP.constructionType} onChange={e => setNP({ ...nP, constructionType: e.target.value })} />
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: -4, marginBottom: 10 }}>受注金額・粗利は、見積を作成して「採用」すると自動で入ります</div>
      </Modal>)}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} okLabel={conf.okLabel} okColor={conf.okColor} extra={conf.extra} />}
    </div>
  );
}