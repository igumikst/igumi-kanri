import { useState, useEffect, useRef, useCallback } from "react";
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

const parseFolderMeta = (folder, allFolders = []) => {
  if (!folder) return { type: "normal", year: null, month: null };
  const icon = folder.icon || "";
  if (icon.startsWith("Y:")) {
    const year = Number(icon.slice(2));
    if (!Number.isNaN(year)) return { type: "year", year, month: null };
  }
  if (icon.startsWith("M:")) {
    const month = Number(icon.slice(2));
    const parent = allFolders.find(f => f.id === folder.parent_id);
    const pMeta = parent ? parseFolderMeta(parent, allFolders) : { year: null };
    return { type: "month", year: pMeta.year, month: Number.isNaN(month) ? null : month };
  }
  return { type: "normal", year: null, month: null };
};

const displayFolderIcon = (folder, meta) => {
  if (meta.type === "year") return "📁";
  if (meta.type === "month") return "📅";
  return folder.icon || "📁";
};

const displayFolderLabel = (folder, meta) => folder.label || "";

const genYM = () => {
  const now = new Date(), res = {};
  for (let y = 2022; y <= now.getFullYear(); y++) {
    res[y] = [];
    const max = y === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let m = 1; m <= max; m++) res[y].push(m);
  }
  return res;
};

export default function Finance({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, setFinFiles, finFolders, setFinFolders, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const [finItem, setFinItem] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
  const [finPrev, setFinPrev] = useState(null);
  const [finModal, setFinModal] = useState(null);
  const [folderForm, setFolderForm] = useState({ label: "", icon: "📁" });
  const [addParentId, setAddParentId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editFileTarget, setEditFileTarget] = useState(null);
  const [hiddenFolderIds, setHiddenFolderIds] = useState([]);
  const [conf, setConf] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ymSyncing, setYmSyncing] = useState(false);

  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const touchStartY = useRef(null);
  const touchDragIdx = useRef(null);
  const ymSyncedRef = useRef(new Set());

  const pending = tks.filter(t => !t.done);
  const ym = genYM();
  const now = new Date(), cy = now.getFullYear(), cm = now.getMonth() + 1;

  const childFolders = useCallback((parentId) =>
    finFolders
      .filter(f => normParent(f.parent_id) === normParent(parentId))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  [finFolders]);

  const rootFolders = childFolders(null);

  const folderMeta = (f) => parseFolderMeta(f, finFolders);
  const isYearFolder = (f) => folderMeta(f).type === "year";
  const isMonthFolder = (f) => folderMeta(f).type === "month";

  const getRootItemId = useCallback((folderId) => {
    let current = finFolders.find(f => f.id === folderId);
    while (current?.parent_id) {
      current = finFolders.find(f => f.id === current.parent_id);
    }
    return current?.id || folderId;
  }, [finFolders]);

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

  useEffect(() => {
    const loadHidden = async () => {
      const { data } = await supabase.from("home_settings").select("value").eq("id", "finance_hidden_folders").single();
      const ids = data?.value?.ids || data?.value || [];
      if (Array.isArray(ids)) setHiddenFolderIds(ids);
    };
    loadHidden();
  }, []);

  const toggleFolderVisibility = async (id) => {
    const next = hiddenFolderIds.includes(id)
      ? hiddenFolderIds.filter(x => x !== id)
      : [...hiddenFolderIds, id];
    setHiddenFolderIds(next);
    await supabase.from("home_settings").upsert({
      id: "finance_hidden_folders",
      value: { ids: next },
      updated_at: new Date().toISOString(),
    });
  };

  const isFolderHidden = (id) => hiddenFolderIds.includes(id);

  const ensureYearFolders = async (rootId) => {
    if (ymSyncedRef.current.has(`y:${rootId}`)) return;
    setYmSyncing(true);
    const ymData = genYM();
    const created = [];

    for (const y of Object.keys(ymData).map(Number).sort((a, b) => b - a)) {
      if (childFolders(rootId).some(f => folderMeta(f).type === "year" && folderMeta(f).year === y)) continue;
      const siblings = childFolders(rootId);
      const { data, error } = await supabase.from("finance_folders").insert([{
        parent_id: rootId, label: `${y}年`, icon: `Y:${y}`,
        sort_order: siblings.length + created.length, is_default: false,
      }]).select();
      if (error) { console.warn("年フォルダ作成エラー:", error.message); continue; }
      if (data) created.push(data[0]);
    }

    if (created.length) setFinFolders(prev => [...prev, ...created]);
    ymSyncedRef.current.add(`y:${rootId}`);
    setYmSyncing(false);
  };

  const ensureMonthFolders = async (yearFolder) => {
    const meta = folderMeta(yearFolder);
    if (!meta.year) return;
    const key = `m:${yearFolder.id}`;
    if (ymSyncedRef.current.has(key)) return;
    setYmSyncing(true);
    const months = ym[meta.year] || [];
    const created = [];

    for (const m of months) {
      if (childFolders(yearFolder.id).some(f => folderMeta(f).type === "month" && folderMeta(f).month === m)) continue;
      const siblings = childFolders(yearFolder.id);
      const { data, error } = await supabase.from("finance_folders").insert([{
        parent_id: yearFolder.id, label: `${m}月`, icon: `M:${m}`,
        sort_order: siblings.length + created.length, is_default: false,
      }]).select();
      if (error) { console.warn("月フォルダ作成エラー:", error.message); continue; }
      if (data) created.push(data[0]);
    }

    if (created.length) setFinFolders(prev => [...prev, ...created]);
    ymSyncedRef.current.add(key);
    setYmSyncing(false);
  };

  useEffect(() => {
    if (!finItem) return;
    if (isMonthFolder(finItem)) return;
    if (isYearFolder(finItem)) {
      ensureMonthFolders(finItem);
      return;
    }
    if (!finItem.parent_id) {
      ensureYearFolders(finItem.id);
    }
  }, [finItem?.id]);

  const isPDF   = f => f.type === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf");
  const isImg   = f => f.type?.startsWith("image/");
  const isExcel = f => f.name?.match(/\.(xlsx|xls)$/i);
  const isWord  = f => f.name?.match(/\.(docx|doc)$/i);
  const fileIcon = f => isImg(f) ? "🖼" : isPDF(f) ? "📕" : isExcel(f) ? "📗" : isWord(f) ? "📘" : "📄";

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

  const updateFinFile = async () => {
    if (!editFileTarget?.name?.trim()) return;
    await supabase.from("finance_files").update({ name: editFileTarget.name.trim() }).eq("id", editFileTarget.id);
    setFinFiles(prev => prev.map(f => f.id === editFileTarget.id ? { ...f, name: editFileTarget.name.trim() } : f));
    if (finPrev?.id === editFileTarget.id) setFinPrev(prev => ({ ...prev, name: editFileTarget.name.trim() }));
    setEditFileTarget(null);
    setFinModal(null);
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
    const meta = folderMeta(editTarget);
    const payload = meta.type === "normal"
      ? { label: editTarget.label, icon: editTarget.icon }
      : { label: editTarget.label };
    await supabase.from("finance_folders").update(payload).eq("id", editTarget.id);
    setFinFolders(prev => prev.map(f => f.id === editTarget.id ? { ...f, ...payload } : f));
    if (finItem?.id === editTarget.id) setFinItem(prev => ({ ...prev, ...payload }));
    setEditTarget(null);
    setFinModal(null);
  };

  const deleteFolder = async (id) => {
    const delIds = collectDescendantIds(id);
    await supabase.from("finance_folders").delete().eq("id", id);
    setFinFolders(prev => prev.filter(f => !delIds.includes(f.id)));
    delIds.forEach(did => ymSyncedRef.current.delete(`m:${did}`));
    if (finItem && delIds.includes(finItem.id)) {
      if (folderPath.length === 0) {
        setFinItem(null);
      } else {
        const newPath = folderPath.slice(0, -1);
        const parentInfo = folderPath[folderPath.length - 1];
        setFolderPath(newPath);
        setFinItem(finFolders.find(f => f.id === parentInfo.id) || parentInfo);
      }
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
    const meta = folderMeta(finItem);
    setFolderPath(prev => [...prev, {
      id: finItem.id,
      label: displayFolderLabel(finItem, meta),
      icon: displayFolderIcon(finItem, meta),
    }]);
    setFinItem(folder);
  };

  const goBackFromFolder = () => {
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

  const countFolderContents = (folder) => {
    const rootId = getRootItemId(folder.id);
    const meta = folderMeta(folder);
    if (meta.type === "month") {
      const fileCnt = finFiles.filter(f => f.item_id === rootId && Number(f.year) === meta.year && Number(f.month) === meta.month).length;
      return { subCnt: 0, fileCnt, ymCnt: 0 };
    }
    if (meta.type === "year") {
      const subCnt = childFolders(folder.id).length;
      const ymCnt = finFiles.filter(f => f.item_id === rootId && Number(f.year) === meta.year && !isDirectFile(f)).length;
      return { subCnt, fileCnt: 0, ymCnt };
    }
    const subCnt = childFolders(folder.id).length;
    const fileCnt = finFiles.filter(f => f.item_id === folder.id && isDirectFile(f)).length;
    return { subCnt, fileCnt, ymCnt: 0 };
  };

  const folderSubtitle = (folder, { subCnt, fileCnt, ymCnt }) => {
    if (isMonthFolder(folder)) return fileCnt > 0 ? `${fileCnt}件` : "タップして管理";
    if (isYearFolder(folder)) {
      const parts = [];
      if (subCnt > 0) parts.push(`${subCnt}ヶ月`);
      if (ymCnt > 0) parts.push(`${ymCnt}件`);
      return parts.length ? parts.join("・") : "タップして管理";
    }
    const parts = [];
    if (subCnt > 0) parts.push(`${subCnt}フォルダ`);
    if (fileCnt > 0) parts.push(`${fileCnt}ファイル`);
    return parts.length ? parts.join("・") : "タップして管理";
  };

  const renderFileRow = (f) => (
    <div key={f.id} style={{ background: "#fff", borderRadius: 12, marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
        <span style={{ fontSize: 28, flexShrink: 0, cursor: "pointer" }} onClick={() => openFile(f)}>{fileIcon(f)}</span>
        <div style={{ flex: 1, overflow: "hidden", cursor: "pointer" }} onClick={() => openFile(f)}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1F2937" }}>{f.name}</div>
          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{f.size ? `${(f.size / 1024).toFixed(0)}KB` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => { setEditFileTarget({ ...f }); setFinModal("editFile"); }} style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#1A3A5C", cursor: "pointer" }}>✏️</button>
          <button onClick={() => setConf({ msg: `「${f.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { deleteFinFile(f.id); setConf(null); } })} style={{ background: "#FEF2F2", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#DC2626", cursor: "pointer" }}>🗑</button>
        </div>
      </div>
      {f.url && f.url.startsWith("http") && (
        <div style={{ borderTop: "1px solid #F3F4F6" }}>
          <a href={f.url} download={f.name} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0", fontSize: 12, color: "#059669", fontWeight: 700, textDecoration: "none" }}>⬇ 保存</a>
        </div>
      )}
    </div>
  );

  const renderFolderRows = (siblings, { onOpen, showVisibility = false }) => {
    const onDrop = makeDropHandler(siblings);
    const onTouchEnd = makeTouchEnd(siblings);
    return siblings.map((item, i) => {
      const meta = folderMeta(item);
      const counts = countFolderContents(item);
      const isCurrentYear = meta.type === "year" && meta.year === cy;
      const isCurrentMonth = meta.type === "month" && meta.year === cy && meta.month === cm;
      const hidden = showVisibility && isFolderHidden(item.id);
      return (
        <div
          key={item.id}
          data-folder-row={i}
          draggable={!hidden}
          onDragStart={() => !hidden && handleDragStart(i)}
          onDragOver={e => handleDragOver(e, i)}
          onDrop={() => onDrop(i)}
          onDragEnd={handleDragEnd}
          style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
            borderBottom: i < siblings.length - 1 ? "1px solid #F3F4F6" : "none",
            background: overIdx === i && dragIdx !== i ? "#EFF6FF" : dragIdx === i ? "#F3F4F6" : "#fff",
            transition: "background 0.15s, opacity 0.15s",
            opacity: hidden ? 0.35 : dragIdx === i ? 0.5 : 1,
            borderLeft: isCurrentYear ? "4px solid #1A3A5C" : isCurrentMonth ? "4px solid #E07B39" : "4px solid transparent",
          }}
        >
          {!hidden && (
          <span
            style={{ fontSize: 18, color: "#D1D5DB", cursor: "grab", flexShrink: 0, userSelect: "none", touchAction: "none" }}
            onTouchStart={makeTouchStart(i)}
            onTouchMove={handleTouchMove}
            onTouchEnd={onTouchEnd}
          >☰</span>
          )}
          {hidden && <span style={{ width: 18, flexShrink: 0 }} />}
          <span style={{ fontSize: 26 }}>{displayFolderIcon(item, meta)}</span>
          <div style={{ flex: 1, cursor: hidden ? "default" : "pointer" }} onClick={() => !hidden && onOpen(item)}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", display: "flex", alignItems: "center", gap: 6 }}>
              {displayFolderLabel(item, meta)}
              {isCurrentYear && <span style={{ fontSize: 10, background: "#1A3A5C", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>今年</span>}
              {isCurrentMonth && <span style={{ fontSize: 10, background: "#E07B39", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>今月</span>}
            </div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{folderSubtitle(item, counts)}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {showVisibility && (
              <button
                onClick={e => { e.stopPropagation(); toggleFolderVisibility(item.id); }}
                title={hidden ? "表示する" : "非表示にする"}
                style={{ background: hidden ? "#F3F4F6" : "#F0FDF4", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
              >{hidden ? "👁‍🗨" : "👁"}</button>
            )}
            <button onClick={e => { e.stopPropagation(); setEditTarget({ ...item }); setFinModal("edit"); }} style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#1A3A5C", cursor: "pointer" }}>✏️</button>
            <button onClick={e => { e.stopPropagation(); setConf({ msg: `「${displayFolderLabel(item, meta)}」フォルダを削除しますか？\n\n中のサブフォルダも全て消えます。\nファイルは残りますが、フォルダは元に戻せません。`, onOk: () => { deleteFolder(item.id); setConf(null); } }); }} style={{ background: "#FEF2F2", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#DC2626", cursor: "pointer" }}>🗑</button>
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

  const breadcrumbNav = (breadcrumb) => (
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
            }}
          >{p.label}</span>
        </span>
      ))}
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
          {folderMeta(editTarget).type === "normal" && (
            <Inp label="アイコン（絵文字）" value={editTarget.icon} onChange={e => setEditTarget({ ...editTarget, icon: e.target.value })} />
          )}
          <Inp label="フォルダ名 *" value={editTarget.label} onChange={e => setEditTarget({ ...editTarget, label: e.target.value })} />
        </Modal>
      )}
      {finModal === "editFile" && editFileTarget && (
        <Modal title="📄 ファイル名を編集" onClose={() => { setFinModal(null); setEditFileTarget(null); }} onSave={updateFinFile}>
          <Inp label="ファイル名 *" value={editFileTarget.name} onChange={e => setEditFileTarget({ ...editFileTarget, name: e.target.value })} />
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
      {ymSyncing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998, pointerEvents: "none" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "16px 24px", textAlign: "center", fontSize: 13, color: "#6B7280" }}>フォルダを準備中...</div>
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

  // ── 月フォルダ：ファイル一覧 ──
  if (finItem && isMonthFolder(finItem)) {
    const rootId = getRootItemId(finItem.id);
    const meta = folderMeta(finItem);
    const monthFiles = finFiles.filter(f => f.item_id === rootId && Number(f.year) === meta.year && Number(f.month) === meta.month);
    const breadcrumb = [...folderPath, { id: finItem.id, label: displayFolderLabel(finItem, meta), icon: displayFolderIcon(finItem, meta) }];

    return layoutShell(
      <>
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={goBackFromFolder} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{displayFolderIcon(finItem, meta)} {displayFolderLabel(finItem, meta)}</div>
            {breadcrumbNav(breadcrumb)}
          </div>
          <label style={{ background: "#E07B39", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            ＋ 追加
            <input type="file" accept="image/*,application/pdf,.xlsx,.docx,.xls,.doc" multiple onChange={async e => { for (const f of Array.from(e.target.files)) { await uploadFinFile(f, rootId, meta.year, meta.month); } e.target.value = ""; }} style={{ display: "none" }} />
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

  // ── フォルダ内容画面（サブフォルダ・年フォルダ・直下ファイル）──
  if (finItem) {
    const siblings = childFolders(finItem.id);
    const directFiles = isYearFolder(finItem) ? [] : finFiles.filter(f => f.item_id === finItem.id && isDirectFile(f));
    const breadcrumb = [...folderPath, { id: finItem.id, label: displayFolderLabel(finItem, folderMeta(finItem)), icon: displayFolderIcon(finItem, folderMeta(finItem)) }];
    const showAddFile = !isYearFolder(finItem);
    const headerMeta = folderMeta(finItem);

    return layoutShell(
      <>
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={goBackFromFolder} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{displayFolderIcon(finItem, headerMeta)} {displayFolderLabel(finItem, headerMeta)}</div>
            {breadcrumbNav(breadcrumb)}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {!isYearFolder(finItem) && (
              <button onClick={() => openAddFolder(finItem.id)} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ フォルダ</button>
            )}
            {showAddFile && (
              <label style={{ background: "#059669", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                ＋ ファイル
                <input type="file" accept="image/*,application/pdf,.xlsx,.docx,.xls,.doc" multiple onChange={async e => { for (const f of Array.from(e.target.files)) { await uploadDirectFile(f, finItem.id); } e.target.value = ""; }} style={{ display: "none" }} />
              </label>
            )}
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

          {siblings.length === 0 && directFiles.length === 0 && !ymSyncing && (
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
            ☰ を長押し（スマホ）またはドラッグ（PC）で並べ替え　・　👁 で非表示切替
          </div>
        )}
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          {renderFolderRows(rootFolders, {
            onOpen: (item) => { if (!isFolderHidden(item.id)) { setFinItem(item); setFolderPath([]); } },
            showVisibility: true,
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
