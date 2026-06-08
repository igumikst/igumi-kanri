import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Inp, Hdr, Modal } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function Links({ pjs, cos, tks, links, setLinks, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W }) {
  const [modal, setModal] = useState(null);
  const [editLnk, setEditLnk] = useState(null);
  const [newLnk, setNewLnk] = useState({ label: "", url: "", icon: "🔗", cat: "ツール・サービス" });
  const pending = tks.filter(t => !t.done);
  const cats = [...new Set(links.map(l => l.cat))];

  const addLink = async (lnk) => {
    const { data } = await supabase.from("links").insert([{ cat: lnk.cat, label: lnk.label, url: lnk.url, icon: lnk.icon, sort_order: links.length }]).select();
    if (data) setLinks(prev => [...prev, data[0]]);
  };

  const updateLink = async (lnk) => {
    await supabase.from("links").update({ cat: lnk.cat, label: lnk.label, url: lnk.url, icon: lnk.icon }).eq("id", lnk.id);
    setLinks(prev => prev.map(l => l.id === lnk.id ? lnk : l));
  };

  const deleteLink = async (id) => {
    await supabase.from("links").delete().eq("id", id);
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="links" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title="🔗 リンク集" back={() => nav("home")}
        right={<button onClick={() => setModal("addL")} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ 新規</button>} />

      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        {cats.map(cat => {
          const cl = links.filter(l => l.cat === cat);
          return (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", marginBottom: 8 }}>🔗 {cat}</div>
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                {cl.map((l, i) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < cl.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, textDecoration: "none", color: "#1F2937", minWidth: 0 }}>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>{l.icon}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937" }}>{l.label}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url.replace("https://", "").substring(0, 28)}</div>
                      </div>
                      <span style={{ color: "#9CA3AF", flexShrink: 0 }}>↗</span>
                    </a>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setEditLnk({ ...l })} style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>✏️</button>
                      <button onClick={() => deleteLink(l.id)} style={{ background: "#FEF2F2", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modal === "addL" && (<Modal title="🔗 リンクを追加" onClose={() => setModal(null)} onSave={() => { if (!newLnk.label || !newLnk.url) return; addLink(newLnk); setNewLnk({ label: "", url: "", icon: "🔗", cat: "ツール・サービス" }); setModal(null); }}>
        <Inp label="アイコン" value={newLnk.icon} onChange={e => setNewLnk({ ...newLnk, icon: e.target.value })} />
        <Inp label="名前 *" value={newLnk.label} onChange={e => setNewLnk({ ...newLnk, label: e.target.value })} placeholder="例: Google Drive" />
        <Inp label="URL *" value={newLnk.url} onChange={e => setNewLnk({ ...newLnk, url: e.target.value })} placeholder="https://..." />
        <Inp label="カテゴリ" value={newLnk.cat} onChange={e => setNewLnk({ ...newLnk, cat: e.target.value })} />
      </Modal>)}
      {editLnk && (<Modal title="🔗 リンクを編集" onClose={() => setEditLnk(null)} onSave={() => { updateLink(editLnk); setEditLnk(null); }}>
        <Inp label="アイコン" value={editLnk.icon} onChange={e => setEditLnk({ ...editLnk, icon: e.target.value })} />
        <Inp label="名前" value={editLnk.label} onChange={e => setEditLnk({ ...editLnk, label: e.target.value })} />
        <Inp label="URL" value={editLnk.url} onChange={e => setEditLnk({ ...editLnk, url: e.target.value })} />
        <Inp label="カテゴリ" value={editLnk.cat} onChange={e => setEditLnk({ ...editLnk, cat: e.target.value })} />
      </Modal>)}
    </div>
  );
}