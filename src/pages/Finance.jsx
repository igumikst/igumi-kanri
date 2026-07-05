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

const normParent = (id) => id || null;
const isDirectFile = (f) => (f.year == null || f.year === 0) && (f.month == null || f.month === 0);

export default function Finance({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, setFinFiles, finFolders, setFinFolders, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const [finItem, setFinItem] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
  const [finY, setFinY] = useState(null);
  const [finM, setFinM] = useState(null);
  const [finPrev, setFinPrev] = useState(null);
  const [finModal, setFinModal] = useState(null);
  const [folderForm, setFolderForm] = useState({ label: "", icon: "📁" });
  const [addParentId, setAddParentId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [conf, setConf] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const touchStartY = useRef(null);
  const touchDragIdx = useRef(null);

  const pending = tks.filter(t => !t.done);

  const childFolders = (parentId) =>
    finFolders
      .filter(f => normParent(f.parent_id) === normParent(parentId))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const rootFolders = childFolders(null);

  useEffect(() => {
    const initDefaults = async () => {
      if (finFolders.length > 0) return;
      setInitializing(true);
      const inserts = DEFAULT_FINANCE_ITEMS.map((item, i) => ({
        id: item.id, label: item.label, icon: item.icon, sort_order: i, is_default: true, parent_id: null,
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

  const uploadFinFile = async (file, itemId, year, month) => {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = year != null
      ? `finance/${itemId}/${year}/${month}/${Date.now()}_${safeName}`
      : `finance/${itemId}/direct/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from("files").upload(path, file);
    if (error) { alert(`アップロードエラー: ${error.message}`); return; }
    const { data: urlData } = supabase.storage.from("files").getPublicUrl(path);
    const row = {
      item_id: itemId,
      name: file.name, type: file.type, size: file.size, url: urlData.publicUrl, path,
    };
    if (year != null) { row.year = Number(year); row.month = Number(month); }
    const { data } = await supabase.from("finance_files").insert([row])
      .select("id,item_id,year,month,name,type,size,url,path,created_at");
    if (data) setFinFiles(prev => [...prev, data[0]]);
  };

  const uploadDirectFile = async (file, itemId) => {
    setUploading(true);
    await uploadFinFile(file, itemId, null, null);
    setUploading(false);
  };

  const deleteFinFile = async (id) => {
    const f = finFiles.find(f => f.id === id);
    if (f?.path) { try { await supabase.storage.from("files").remove([f.path]); } catch (e) {} }
    await supabase.from("finance_files").delete().eq("id", id);
    setFinFiles(prev => prev.filter(f => f.id !== id));
    setFinPrev(null);
  };

  const [opening, setOpening] = useState(false);
  const openFile = async (f) => {
    if (f.url && f.url.startsWith("http")) { setFinPrev(f); return; }
    setOpening(true);
    const { data, error } = await supabase
      .from("finance_files")
      .select("data,type")
      .eq("id", f.id)
      .single();
    setOpening(false);
    if (error || !data?.data) { alert("ファイルを開けませんでした"); return; }
    let url = data.data;
    if (!url.startsWith("data:")) url = `data:${data.type || f.type};base64,${url}`;
    setFinPrev({ ...f, url });
  };

  const collectDescendantIds = (rootId) => {
    const ids = [rootId];
    const queue = [rootId];
    while (queue.length) {
      const pid = queue.shift();
      finFolders.forEach(f => { if (f.parent_id === pid) { ids.push(f.id); queue.push(f.id); } });
    }
    return ids;
  };

  const addFolder = async () => {
    if (!folderForm.label) return;
    const siblings = childFolders(addParentId);
    const { data, error } = await supabase.from("finance_folders")
      .insert([{
        label: folderForm.label, icon: folderForm.icon,
        sort_order: siblings.length, is_default: false, parent_id: addParentId,
      }])
      .select();
    if (error) { alert(`フォルダ追加エラー: ${error.message}`); return; }
    if (data) setFinFolders(prev => [...prev, data[0]]);
    setFolderForm({ label: "", icon: "📁" });
    setFinModal(null);
  };

  const updateFolder = async () => {
    if (!editTarget) return;
    await supabase.from("finance_folders").update({ label: editTarget.label, icon: editTarget.icon }).eq("id", editTarget.id);
    setFinFolders(prev => prev.map(f => f.id === editTarget.id ? { ...f, ...editTarget } : f));
    if (finItem?.id === editTarget.id) setFinItem(prev => ({ ...prev, ...editTarget }));
    setEditTarget(null);
    setFinModal(null);
  };

  const deleteFolder = async (id) => {
    const delIds = collectDescendantIds(id);
    await supabase.from("finance_folders").delete().eq("id", id);
    setFinFolders(prev => prev.filter(f => !delIds.includes(f.id)));
    if (finItem && delIds.includes(finItem.id)) {
      setFinItem(null);
      setFolderPath([]);
      setFinY(null);
      setFinM(null);
    }
  };

  const saveOrder = async (orderedSiblings) => {
    for (let i = 0; i < orderedSiblings.length; i++) {
      await supabase.from("finance_folders").update({ sort_order: i }).eq("id", orderedSiblings[i].id);
    }
    setFinFolders(prev => prev.map(f => {
      const idx = orderedSiblings.findIndex(s => s.id === f.id);
      return idx >= 0 ? { ...f, sort_order: idx } : f;
    }));
  };

  const reorderSiblings = async (siblings, from, to) => {
    if (from === null || to === null || from === to) return;
    const newList = [...siblings];
    const [moved] = newList.splice(from, 1);
    newList.splice(to, 0, moved);
    await saveOrder(newList);
  };

  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver  = (e, i) => { e.preventDefault(); setOverIdx(i); };
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  const makeDropHandler = (siblings) => async (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return; }
    await reorderSiblings(siblings, dragIdx, i);
    setDragIdx(null);
    setOverIdx(null);
  };

  const makeTouchStart = (i) => (e) => {
    touchStartY.current = e.touches[0].clientY;
    touchDragIdx.current = i;
  };
  const handleTouchMove = (e) => {
    e.preventDefault();
    const y = e.touches[0].clientY;
    const els = document.querySelectorAll("[data-folder-row]");
    let overI = null;
    els.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) overI = i;
    });
    if (overI !== null) setOverIdx(overI);
  };
  const makeTouchEnd = (siblings) => async () => {
    const from = touchDragIdx.current;
    const to = overIdx;
    touchDragIdx.current = null;
    setOverIdx(null);
    await reorderSiblings(siblings, from, to);
  };

  const enterSubfolder = (folder) => {
    setFolderPath(prev => [...prev, { id: finItem.id, label: finItem.label, icon: finItem.icon }]);
    setFinItem(folder);
    setFinY(null);
    setFinM(null);
  };

  const goBackFromFolder = () => {
    if (finY) { setFinY(null); setFinM(null); return; }
    if (folderPath.length === 0) {
      setFinItem(null);
      return;
    }
    const newPath = folderPath.slice(0, -1);
    const parentInfo = folderPath[folderPath.length - 1];
    setFolderPath(newPath);
    setFinItem(finFolders.find(f => f.id === parentInfo.id) || parentInfo);
  };

  const openAddFolder = (parentId) => {
    setAddParentId(parentId);
    setFolderForm({ label: "", icon: "📁" });
    setFinModal("add");
  };

  const countFolderContents = (folderId) => {
    const subCnt = childFolders(folderId).length;
    const fileCnt = finFiles.filter(f => f.item_id === folderId && isDirectFile(f)).length;
    const ymCnt = finFiles.filter(f => f.item_id === folderId && !isDirectFile(f)).length;
    return { subCnt, fileCnt, ymCnt };
  };

  const renderFileRow = (f) => (
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
  );

  const renderFolderRows = (siblings, { onOpen, showReorder = true }) => {
    const onDrop = makeDropHandler(siblings);
    const onTouchEnd = makeTouchEnd(siblings);
    return siblings.map((item, i) => {
      const { subCnt, fileCnt, ymCnt } = countFolderContents(item.id);
      return (
        <div
          key={item.id}
          data-folder-row={i}
          draggable={showReorder}
          onDragStart={() => handleDragStart(i)}
          onDragOver={e => handleDragOver(e, i)}
          onDrop={() => onDrop(i)}
          onDragEnd={handleDragEnd}
          style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
            borderBottom: i < siblings.length - 1 ? "1px solid #F3F4F6" : "none",
            background: overIdx === i && dragIdx !== i ? "#EFF6FF" : dragIdx === i ? "#F3F4F6" : "#fff",
            transition: "background 0.15s",
            opacity: dragIdx === i ? 0.5 : 1,
          }}
        >
          {showReorder && (
            <span
              style={{ fontSize: 18, color: "#D1D5DB", cursor: "grab", flexShrink: 0, userSelect: "none", touchAction: "none" }}
              onTouchStart={makeTouchStart(i)}
              onTouchMove={handleTouchMove}
              onTouchEnd={onTouchEnd}
            >☰</span>
          )}
          <span style={{ fontSize: 26 }}>{item.icon}</span>
          <div style={{ flex: 1, cursor: "pointer" }} onClick={() => onOpen(item)}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937" }}>{item.label}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
              {subCnt > 0 && `${subCnt}フォルダ`}
              {subCnt > 0 && (fileCnt > 0 || ymCnt > 0) && "・"}
              {fileCnt > 0 && `${fileCnt}ファイル`}
              {fileCnt > 0 && ymCnt > 0 && "・"}
              {ymCnt > 0 && `年月別${ymCnt}件`}
              {subCnt === 0 && fileCnt === 0 && ymCnt === 0 && "タップして管理"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={e => { e.stopPropagation(); setEditTarget({ ...item }); setFinModal("edit"); }} style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#1A3A5C", cursor: "pointer" }}>✏️</button>
            <button onClick={e => { e.stopPropagation(); setConf({ msg: `「${item.label}」フォルダを削除しますか？\n\n中のサブフォルダも全て消えます。\nファイルは残りますが、フォルダは元に戻せません。`, onOk: () => { deleteFolder(item.id); setConf(null); } }); }} style={{ background: "#FEF2F2", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#DC2626", cursor: "pointer" }}>🗑</button>
          </div>
          <span style={{ color: "#9CA3AF" }}>›</span>
        </div>
      );
    });
  };

  const layoutShell = (children) => (
    <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="finance" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {children}
    </div>
  );

  const modals = (
    <>
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
      {opening && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "24px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <div style={{ fontWeight: 700, color: "#1F2937" }}>ファイルを開いています...</div>
          </div>
        </div>
      )}
      {uploading && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "24px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <div style={{ fontWeight: 700, color: "#1F2937" }}>アップロード中...</div>
          </div>
        </div>
      )}
    </>
  );

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
    return layoutShell(
      <>
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setFinM(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{finItem.icon} {finItem.label}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{finY}年{finM}月</div>
          </div>
          <label style={{ background: "#E07B39", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ＋ 追加
            <input type="file" accept="image/*,application/pdf,.xlsx,.docx,.xls,.doc" multiple onChange={async e => { for (const f of Array.from(e.target.files)) { await uploadFinFile(f, finItem.id, finY, finM); } e.target.value = ""; }} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          {monthFiles.length === 0
            ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}><div style={{ fontSize: 48, marginBottom: 12 }}>📂</div><div style={{ fontSize: 14 }}>ファイルがありません</div></div>
            : monthFiles.map(renderFileRow)}
        </div>
        {modals}
      </>
    );
  }

  // ── 年月別：年選択画面 ──
  if (finItem && finY === "browse") return layoutShell(
    <>
      <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => setFinY(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{finItem.icon} {finItem.label} — 年月別</div>
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
      {modals}
    </>
  );

  // ── 月選択画面 ──
  if (finY) return layoutShell(
    <>
      <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => setFinY("browse")} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
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
      {modals}
    </>
  );

  // ── フォルダ内容画面（サブフォルダ・直下ファイル・年月別入口）──
  if (finItem && !finY) {
    const siblings = childFolders(finItem.id);
    const directFiles = finFiles.filter(f => f.item_id === finItem.id && isDirectFile(f));
    const ymTotal = finFiles.filter(f => f.item_id === finItem.id && !isDirectFile(f)).length;
    const breadcrumb = [...folderPath, { id: finItem.id, label: finItem.label, icon: finItem.icon }];

    return layoutShell(
      <>
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={goBackFromFolder} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{finItem.icon} {finItem.label}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {breadcrumb.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && <span style={{ opacity: 0.5 }}> › </span>}
                  <span
                    style={{ cursor: i < breadcrumb.length - 1 ? "pointer" : "default" }}
                    onClick={() => {
                      if (i >= breadcrumb.length - 1) return;
                      const target = breadcrumb[i];
                      setFolderPath(breadcrumb.slice(0, i));
                      setFinItem(finFolders.find(f => f.id === target.id) || target);
                      setFinY(null);
                      setFinM(null);
                    }}
                  >{p.label}</span>
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => openAddFolder(finItem.id)} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ フォルダ</button>
            <label style={{ background: "#059669", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              ＋ ファイル
              <input type="file" accept="image/*,application/pdf,.xlsx,.docx,.xls,.doc" multiple onChange={async e => { for (const f of Array.from(e.target.files)) { await uploadDirectFile(f, finItem.id); } e.target.value = ""; }} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          {siblings.length > 1 && (
            <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginBottom: 8 }}>
              ☰ を長押し（スマホ）またはドラッグ（PC）で並べ替え
            </div>
          )}

          {siblings.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 12 }}>
              {renderFolderRows(siblings, { onOpen: enterSubfolder })}
            </div>
          )}

          {directFiles.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 8, paddingLeft: 4 }}>📄 このフォルダのファイル</div>
              {directFiles.map(renderFileRow)}
            </div>
          )}

          <div
            onClick={() => setFinY("browse")}
            style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", borderLeft: "4px solid #1A3A5C" }}
          >
            <span style={{ fontSize: 26 }}>📅</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1F2937" }}>年月別で管理</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{ymTotal}件のファイル</div>
            </div>
            <span style={{ color: "#9CA3AF" }}>›</span>
          </div>

          {siblings.length === 0 && directFiles.length === 0 && ymTotal === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: "#9CA3AF" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
              <div style={{ fontSize: 14 }}>まだ何もありません</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>上のボタンからフォルダ・ファイルを追加できます</div>
            </div>
          )}
        </div>
        {modals}
      </>
    );
  }

  // ── トップ画面（ルートフォルダ一覧）──
  return layoutShell(
    <>
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>←</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>🗃 財務・書類管理</div>
        <button onClick={() => openAddFolder(null)} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ フォルダ</button>
      </div>

      {initializing && <div style={{ textAlign: "center", padding: 24, color: "#9CA3AF", fontSize: 13 }}>初期データを読み込み中...</div>}

      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        {rootFolders.length > 1 && (
          <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginBottom: 8 }}>
            ☰ を長押し（スマホ）またはドラッグ（PC）で並べ替え
          </div>
        )}
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          {renderFolderRows(rootFolders, {
            onOpen: (item) => { setFinItem(item); setFolderPath([]); setFinY(null); setFinM(null); },
          })}
          {rootFolders.length === 0 && !initializing && (
            <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
              <div style={{ fontSize: 14 }}>フォルダがありません</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>「＋ フォルダ」で追加できます</div>
            </div>
          )}
        </div>
      </div>
      {modals}
    </>
  );
}
