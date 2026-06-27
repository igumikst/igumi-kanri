import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Modal, Inp, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

const DEFAULT_FINANCE_ITEMS = [
  { id: "invoice",    label: "請求書PDF",   icon: "🧾" },
  { id: "receipt",    label: "領収書",       icon: "📄" },
  { id: "outsource",  label: "外注請求書",   icon: "📋" },
  { id: "order",      label: "発注書",       icon: "📝" },
  { id: "delivery",   label: "納品書",       icon: "📦" },
  { id: "bankbook",   label: "通帳確認",     icon: "🏦" },
  { id: "settlement", label: "決算資料",     icon: "📊" },
  { id: "insurance",  label: "保険関係",     icon: "🛡" },
  { id: "tax",        label: "税務書類",     icon: "📑" },
];

export default function Finance({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, setFinFiles, finFolders, setFinFolders, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const [finItem, setFinItem] = useState(null);
  const [finY, setFinY] = useState(null);
  const [finM, setFinM] = useState(null);
  const [finPrev, setFinPrev] = useState(null);
  const [finModal, setFinModal] = useState(null);
  const [folderForm, setFolderForm] = useState({ label: "", icon: "📁" });
  const [editTarget, setEditTarget] = useState(null);
  const [conf, setConf] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [initializing, setInitializing] = useState(false);

  // ── ドラッグ&ドロップ用のstate ──
  const [dragIdx, setDragIdx] = useState(null);   // ドラッグ中のアイテムのindex
  const [overIdx, setOverIdx] = useState(null);   // ホバー中のアイテムのindex
  const touchStartY = useRef(null);               // タッチ開始位置
  const touchDragIdx = useRef(null);              // タッチドラッグ中のindex

  const pending = tks.filter(t => !t.done);

  useEffect(() => {
    const initDefaults = async () => {
      if (finFolders.length > 0) return;
      setInitializing(true);
      const inserts = DEFAULT_FINANCE_ITEMS.map((item, i) => ({
        id: item.id, label: item.label, icon: item.icon, sort_order: i, is_default: true,
      }));
      const { data } = await supabase.from("finance_folders").upsert(inserts, { onConflict: "id" }).select();
      if (data) setFinFolders(data.sort((a, b) => a.sort_order - b.sort_order));
      setInitializing(false);
    };
    initDefaults();
  }, []);

  const isPDF   = f => f.type === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf");
  const isImg   = f => f.type?.startsWith("image/");
  const isExcel = f => f.name?.match(/\.(xlsx|xls)$/i);
  const isWord  = f => f.name?.match(/\.(docx|doc)$/i);
  const fileIcon = f => isImg(f) ? "🖼" : isPDF(f) ? "📕" : isExcel(f) ? "📗" : isWord(f) ? "📘" : "📄";

  const genYM = () => {
    const now = new Date(), res = {};
    for (let y = 2022; y <= now.getFullYear(); y++) {
      res[y] = [];
      const max = y === now.getFullYear() ? now.getMonth() + 1 : 12;
      for (let m = 1; m <= max; m++) res[y].push(m);
    }
    return res;
  };
  const ym = genYM();
  const now = new Date(), cy = now.getFullYear(), cm = now.getMonth() + 1;

  // ── ファイル操作 ──
  const uploadFinFile = async (file, itemId, year, month) => {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `finance/${itemId}/${year}/${month}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from("files").upload(path, file);
    if (error) { alert(`アップロードエラー: ${error.message}`); return; }
    const { data: urlData } = supabase.storage.from("files").getPublicUrl(path);
    const { data } = await supabase.from("finance_files").insert([{
      item_id: itemId, year: Number(year), month: Number(month),
      name: file.name, type: file.type, size: file.size, url: urlData.publicUrl, path
    }]).select("id,item_id,year,month,name,type,size,url,path,created_at");
    if (data) setFinFiles(prev => [...prev, data[0]]);
  };

  const deleteFinFile = async (id) => {
    const f = finFiles.find(f => f.id === id);
    if (f?.path) { try { await supabase.storage.from("files").remove([f.path]); } catch (e) {} }
    await supabase.from("finance_files").delete().eq("id", id);
    setFinFiles(prev => prev.filter(f => f.id !== id));
    setFinPrev(null);
  };

  // ── ファイルを開く ──
  // 理由：一覧は軽くするためurl/dataを読み込んでいない。
  // 開く瞬間に、その1件だけ中身(data)を取りに行ってプレビューする。
  const [opening, setOpening] = useState(false);
  const openFile = async (f) => {
    // 新しいファイル（ストレージにある＝urlが http で始まる）はそのまま開ける
    if (f.url && f.url.startsWith("http")) { setFinPrev(f); return; }
    // 古いファイル（dataにbase64）はこの1件だけ取りに行く
    setOpening(true);
    const { data, error } = await supabase
      .from("finance_files")
      .select("data,type")
      .eq("id", f.id)
      .single();
    setOpening(false);
    if (error || !data?.data) { alert("ファイルを開けませんでした"); return; }
    // base64の頭に "data:...;base64," が二重で付かないよう整形
    let url = data.data;
    if (!url.startsWith("data:")) url = `data:${data.type || f.type};base64,${url}`;
    setFinPrev({ ...f, url });
  };

  // ── フォルダ操作 ──
  const addFolder = async () => {
    if (!folderForm.label) return;
    const { data } = await supabase.from("finance_folders")
      .insert([{ label: folderForm.label, icon: folderForm.icon, sort_order: finFolders.length, is_default: false }])
      .select();
    if (data) setFinFolders(prev => [...prev, data[0]]);
    setFolderForm({ label: "", icon: "📁" });
    setFinModal(null);
  };

  const updateFolder = async () => {
    if (!editTarget) return;
    await supabase.from("finance_folders").update({ label: editTarget.label, icon: editTarget.icon }).eq("id", editTarget.id);
    setFinFolders(prev => prev.map(f => f.id === editTarget.id ? { ...f, ...editTarget } : f));
    setEditTarget(null);
    setFinModal(null);
  };

  const deleteFolder = async (id) => {
    await supabase.from("finance_folders").delete().eq("id", id);
    setFinFolders(prev => prev.filter(f => f.id !== id));
  };

  // ── 並べ替え：ドロップ完了時にSupabaseのsort_orderを更新 ──
  // 理由：画面上の順番をDBに保存しないと、リロードしたら元に戻ってしまうため
  const saveOrder = async (newFolders) => {
    const updates = newFolders.map((f, i) => ({ id: f.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from("finance_folders").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
  };

  // ── PCドラッグ&ドロップのハンドラ ──
  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver  = (e, i) => { e.preventDefault(); setOverIdx(i); };
  const handleDrop      = async (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return; }
    const newFolders = [...finFolders];
    const [moved] = newFolders.splice(dragIdx, 1);
    newFolders.splice(i, 0, moved);
    setFinFolders(newFolders);
    setDragIdx(null);
    setOverIdx(null);
    await saveOrder(newFolders);
  };
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  // ── スマホタッチ並べ替えのハンドラ ──
  // 理由：スマホはdragイベントが使えないのでtouchイベントで代替
  const handleTouchStart = (e, i) => {
    touchStartY.current = e.touches[0].clientY;
    touchDragIdx.current = i;
  };
  const handleTouchMove = (e) => {
    e.preventDefault(); // スクロール防止
    const y = e.touches[0].clientY;
    const els = document.querySelectorAll("[data-folder-row]");
    let overI = null;
    els.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) overI = i;
    });
    if (overI !== null) setOverIdx(overI);
  };
  const handleTouchEnd = async () => {
    const from = touchDragIdx.current;
    const to   = overIdx;
    if (from === null || to === null || from === to) {
      touchDragIdx.current = null; setOverIdx(null); return;
    }
    const newFolders = [...finFolders];
    const [moved] = newFolders.splice(from, 1);
    newFolders.splice(to, 0, moved);
    setFinFolders(newFolders);
    touchDragIdx.current = null;
    setOverIdx(null);
    await saveOrder(newFolders);
  };

  // ── プレビュー画面 ──
  if (finPrev) return (
    <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#1A1A2E", minHeight: "100vh", display: "flex", flexDirection: "column", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="finance" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={() => { setFinPrev(null); setPendingDelete(false); }} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{finPrev.name}</div>
        {finPrev.url && <a href={finPrev.url} download={finPrev.name} target="_blank" rel="noopener noreferrer" style={{ background: "#E07B39", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>⬇ 保存</a>}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {finPrev.url ? (
          isImg(finPrev)
            ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}><img src={finPrev.url} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, objectFit: "contain" }} alt={finPrev.name} /></div>
            : isPDF(finPrev)
              ? <iframe src={finPrev.url} style={{ flex: 1, width: "100%", border: "none", background: "#fff" }} title={finPrev.name} />
              : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: "#fff", textAlign: "center", padding: 32 }}><div style={{ fontSize: 72, marginBottom: 16 }}>{fileIcon(finPrev)}</div><div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{finPrev.name}</div><a href={finPrev.url} download={finPrev.name} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", background: "#E07B39", color: "#fff", padding: "14px 32px", borderRadius: 12, fontWeight: 800, fontSize: 15, textDecoration: "none" }}>⬇ ダウンロード</a></div></div>
        ) : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div><div>読み込み中...</div></div></div>}
      </div>
      <div style={{ flexShrink: 0, padding: "14px 16px 20px", background: "rgba(0,0,0,0.85)" }}>
        {!pendingDelete ? (
          <button onClick={() => setPendingDelete(true)} style={{ width: "100%", padding: "13px 0", background: "#374151", color: "#fff", border: "1.5px solid #6B7280", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🗑 このファイルを削除</button>
        ) : (
          <div>
            <div style={{ color: "#fff", textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>⚠️</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{finPrev.name}</div>
              <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700 }}>元に戻せません。本当に削除しますか？</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPendingDelete(false)} style={{ flex: 1, padding: "12px 0", background: "#4B5563", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>キャンセル</button>
              <button onClick={() => { deleteFinFile(finPrev.id); setPendingDelete(false); }} style={{ flex: 1, padding: "12px 0", background: "#DC2626", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>削除する</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── 月一覧画面 ──
  if (finM) {
    const monthFiles = finFiles.filter(f => f.item_id === finItem.id && Number(f.year) === Number(finY) && Number(f.month) === Number(finM));
    return (
      <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
        {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="finance" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
        {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setFinM(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{finItem.icon} {finItem.label}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{finY}年{finM}月</div>
          </div>
          <label style={{ background: "#E07B39", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ＋ 追加
            <input type="file" accept="image/*,application/pdf,.xlsx,.docx,.xls,.doc" multiple onChange={async e => { for (const f of Array.from(e.target.files)) { await uploadFinFile(f, finItem.id, finY, finM); } }} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          {monthFiles.length === 0
            ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}><div style={{ fontSize: 48, marginBottom: 12 }}>📂</div><div style={{ fontSize: 14 }}>ファイルがありません</div></div>
            : monthFiles.map(f => (
              <div key={f.id} style={{ background: "#fff", borderRadius: 12, marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }} onClick={() => openFile(f)}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{fileIcon(f)}</span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1F2937" }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{f.size ? `${(f.size / 1024).toFixed(0)}KB` : ""}</div>
                  </div>
                  <span style={{ color: "#9CA3AF", fontSize: 14, flexShrink: 0 }}>›</span>
                </div>
                <div style={{ display: "flex", borderTop: "1px solid #F3F4F6" }}>
                  {f.url && f.url.startsWith("http") && <a href={f.url} download={f.name} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "8px 0", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#059669", fontWeight: 700, textDecoration: "none" }}>⬇ 保存</a>}
                  <button onClick={() => setConf({ msg: `「${f.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { deleteFinFile(f.id); setConf(null); } })} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑 削除</button>
                </div>
              </div>
            ))}
        </div>
        {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
        {opening && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
              <div style={{ fontWeight: 700, color: "#1F2937" }}>ファイルを開いています...</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 月選択画面 ──
  if (finY) return (
    <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="finance" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => setFinY(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{finItem.icon} {finItem.label}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{finY}年</div>
        </div>
      </div>
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        {(ym[finY] || []).slice().reverse().map(m => {
          const cnt = finFiles.filter(f => f.item_id === finItem.id && Number(f.year) === Number(finY) && Number(f.month) === m).length;
          const isN = Number(finY) === cy && m === cm;
          return (
            <div key={m} onClick={() => setFinM(m)} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", borderLeft: isN ? "4px solid #E07B39" : "4px solid transparent" }}>
              <span style={{ fontSize: 24 }}>📅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6, color: "#1F2937" }}>
                  {m}月{isN && <span style={{ fontSize: 10, background: "#E07B39", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>今月</span>}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{cnt}件</div>
              </div>
              <span style={{ color: "#9CA3AF" }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── 年選択画面 ──
  if (finItem) return (
    <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="finance" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => setFinItem(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{finItem.icon} {finItem.label}</div>
      </div>
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        {Object.keys(ym).sort((a, b) => b - a).map(y => {
          const tot = Object.values(ym[y] || []).reduce((s, m) => s + finFiles.filter(f => f.item_id === finItem.id && Number(f.year) === Number(y) && Number(f.month) === m).length, 0);
          const isN = Number(y) === cy;
          return (
            <div key={y} onClick={() => setFinY(y)} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", borderLeft: isN ? "4px solid #1A3A5C" : "4px solid transparent" }}>
              <span style={{ fontSize: 26 }}>📁</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6, color: "#1F2937" }}>
                  {y}年{isN && <span style={{ fontSize: 10, background: "#1A3A5C", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>今年</span>}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{tot}件</div>
              </div>
              <span style={{ color: "#9CA3AF" }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── トップ画面（フォルダ一覧 + ドラッグ&ドロップ）──
  return (
    <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="finance" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>←</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>🗃 財務・書類管理</div>
        <button onClick={() => { setFolderForm({ label: "", icon: "📁" }); setFinModal("add"); }} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ フォルダ</button>
      </div>

      {initializing && <div style={{ textAlign: "center", padding: 24, color: "#9CA3AF", fontSize: 13 }}>初期データを読み込み中...</div>}

      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        {/* 並べ替えの説明ヒント */}
        {finFolders.length > 1 && (
          <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginBottom: 8 }}>
            ☰ を長押し（スマホ）またはドラッグ（PC）で並べ替え
          </div>
        )}
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          {finFolders.map((item, i) => (
            <div
              key={item.id}
              data-folder-row={i}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={handleDragEnd}
              style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                borderBottom: i < finFolders.length - 1 ? "1px solid #F3F4F6" : "none",
                // ドラッグ中・ホバー中は背景色を変えて「ここに入る」を視覚的に示す
                background: overIdx === i && dragIdx !== i ? "#EFF6FF" : dragIdx === i ? "#F3F4F6" : "#fff",
                transition: "background 0.15s",
                opacity: dragIdx === i ? 0.5 : 1,
              }}
            >
              {/* ドラッグハンドル：スマホはタッチ操作 */}
              <span
                style={{ fontSize: 18, color: "#D1D5DB", cursor: "grab", flexShrink: 0, userSelect: "none", touchAction: "none" }}
                onTouchStart={e => handleTouchStart(e, i)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >☰</span>

              <span style={{ fontSize: 26 }}>{item.icon}</span>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setFinItem(item)}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937" }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>タップして管理</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setEditTarget({ ...item }); setFinModal("edit"); }} style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#1A3A5C", cursor: "pointer" }}>✏️</button>
                <button onClick={() => setConf({ msg: `「${item.label}」フォルダを削除しますか？\n\n中のファイルは残りますが、フォルダは元に戻せません。`, onOk: () => { deleteFolder(item.id); setConf(null); } })} style={{ background: "#FEF2F2", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#DC2626", cursor: "pointer" }}>🗑</button>
              </div>
            </div>
          ))}
          {finFolders.length === 0 && !initializing && (
            <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
              <div style={{ fontSize: 14 }}>フォルダがありません</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>「＋ フォルダ」で追加できます</div>
            </div>
          )}
        </div>
      </div>

      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}

      {finModal === "add" && (
        <Modal title="📁 フォルダを追加" onClose={() => setFinModal(null)} onSave={addFolder}>
          <Inp label="アイコン（絵文字）" value={folderForm.icon} onChange={e => setFolderForm({ ...folderForm, icon: e.target.value })} />
          <Inp label="フォルダ名 *" value={folderForm.label} onChange={e => setFolderForm({ ...folderForm, label: e.target.value })} placeholder="例: 保険証書" />
        </Modal>
      )}
      {finModal === "edit" && editTarget && (
        <Modal title="📁 フォルダを編集" onClose={() => { setFinModal(null); setEditTarget(null); }} onSave={updateFolder}>
          <Inp label="アイコン（絵文字）" value={editTarget.icon} onChange={e => setEditTarget({ ...editTarget, icon: e.target.value })} />
          <Inp label="フォルダ名 *" value={editTarget.label} onChange={e => setEditTarget({ ...editTarget, label: e.target.value })} />
        </Modal>
      )}
    </div>
  );
}