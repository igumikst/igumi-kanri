import { useState } from "react";
import { supabase } from "../lib/supabase";
import { TEMPLATE_CATS } from "../lib/constants";
import { Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function Templates({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, setTmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const [tmplCat, setTmplCat] = useState(null);
  const [tmplPrev, setTmplPrev] = useState(null);
  const [conf, setConf] = useState(null);
  const pending = tks.filter(t => !t.done);

  const isPDF = f => f.type === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf");
  const isImg = f => f.type?.startsWith("image/");
  const fi = f => isImg(f) ? "🖼" : f.name?.endsWith(".pdf") ? "📕" : f.name?.endsWith(".xlsx") || f.name?.endsWith(".xls") ? "📗" : f.name?.endsWith(".docx") || f.name?.endsWith(".doc") ? "📘" : "📄";

  const uploadTmplFile = async (file, catId) => {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `templates/${catId}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from("files").upload(path, file);
    if (error) { alert(`アップロードエラー: ${error.message}`); return; }
    const { data: urlData } = supabase.storage.from("files").getPublicUrl(path);
    const { data } = await supabase.from("template_files").insert([{ cat_id: catId, name: file.name, type: file.type, size: file.size, url: urlData.publicUrl, path }]).select("id,cat_id,name,type,size,url,path,created_at");
    if (data) setTmplFiles(prev => [...prev, data[0]]);
  };

  const deleteTmplFile = async (id) => {
    const f = tmplFiles.find(f => f.id === id);
    if (f?.path) { try { await supabase.storage.from("files").remove([f.path]); } catch (e) { } }
    await supabase.from("template_files").delete().eq("id", id);
    setTmplFiles(prev => prev.filter(f => f.id !== id));
    setTmplPrev(null);
  };

  if (tmplPrev) return (
    <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#1A1A2E", minHeight: "100vh", display: "flex", flexDirection: "column", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="templates" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={() => setTmplPrev(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{tmplPrev.name}</div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {tmplPrev.url && <a href={tmplPrev.url} download={tmplPrev.name} target="_blank" rel="noopener noreferrer" style={{ background: "#E07B39", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>⬇ 保存</a>}
          <button onClick={() => setConf({ msg: `「${tmplPrev.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { deleteTmplFile(tmplPrev.id); setConf(null); } })} style={{ background: "rgba(220,38,38,0.8)", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>🗑 削除</button>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tmplPrev.url ? (
          isImg(tmplPrev) ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}><img src={tmplPrev.url} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, objectFit: "contain" }} alt={tmplPrev.name} /></div>
            : isPDF(tmplPrev) ? <iframe src={tmplPrev.url} style={{ flex: 1, width: "100%", border: "none", background: "#fff" }} title={tmplPrev.name} />
              : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: "#fff", textAlign: "center", padding: 32 }}><div style={{ fontSize: 72, marginBottom: 16 }}>{fi(tmplPrev)}</div><div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{tmplPrev.name}</div><a href={tmplPrev.url} download={tmplPrev.name} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", background: "#E07B39", color: "#fff", padding: "14px 32px", borderRadius: 12, fontWeight: 800, fontSize: 15, textDecoration: "none" }}>⬇ ダウンロード</a></div></div>
        ) : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div><div>読み込み中...</div></div></div>}
      </div>
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
    </div>
  );

  if (tmplCat) {
    const files = tmplFiles.filter(f => f.cat_id === tmplCat.id);
    return (
      <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
        {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="templates" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
        {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setTmplCat(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{tmplCat.icon} {tmplCat.label}</div><div style={{ fontSize: 11, opacity: 0.7 }}>{files.length}件</div></div>
          <label style={{ background: "#E07B39", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            ＋ 追加
            <input type="file" accept="image/*,application/pdf,.xlsx,.docx,.xls,.doc" multiple onChange={async e => { for (const f of Array.from(e.target.files)) { await uploadTmplFile(f, tmplCat.id); } }} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ padding: isPC ? "14px 0" : 14 }}>
          {files.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}><div style={{ fontSize: 48, marginBottom: 12 }}>📂</div><div style={{ fontSize: 14 }}>ファイルがありません</div></div>
            : files.map(f => (
              <div key={f.id} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>{fi(f)}</span>
                <div style={{ flex: 1, overflow: "hidden", cursor: "pointer" }} onClick={() => setTmplPrev(f)}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1F2937" }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{f.size ? `${(f.size / 1024).toFixed(0)}KB` : ""}</div>
                </div>
                <button onClick={() => setConf({ msg: `「${f.name}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { deleteTmplFile(f.id); setConf(null); } })} style={{ background: "#FEF2F2", border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
              </div>
            ))}
        </div>
        {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="templates" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="📂 お知らせ・雛形" back={() => nav("home")} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 16 }}>
          {TEMPLATE_CATS.map((cat, i) => {
            const cnt = tmplFiles.filter(f => f.cat_id === cat.id).length;
            return (
              <div key={cat.id} onClick={() => setTmplCat(cat)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderBottom: i < TEMPLATE_CATS.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}>
                <span style={{ fontSize: 28 }}>{cat.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937" }}>{cat.label}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{cnt > 0 ? `${cnt}件のファイル` : "タップして管理"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {cnt > 0 && <span style={{ background: "#E07B39", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{cnt}</span>}
                  <span style={{ color: "#9CA3AF", fontSize: 18 }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}