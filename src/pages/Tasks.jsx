import { useState } from "react";
import { supabase } from "../lib/supabase";
import { PRIO } from "../lib/constants";
import { Inp, Sel, Modal, Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function Tasks({ pjs, cos, tks, setTks, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, SB_W, RP_W }) {
  const [modal, setModal] = useState(null);
  const [conf, setConf] = useState(null);
  const [nTk, setNTk] = useState({ title: "", due: "", prio: "mid" });
  const pending = tks.filter(t => !t.done);
  const done = tks.filter(t => t.done);

  const saveTk = async () => {
    if (!nTk.title) return;
    const { data } = await supabase.from("tasks").insert([{ title: nTk.title, done: false, priority: nTk.prio, due: nTk.due }]).select();
    if (data) setTks([{ ...data[0], prio: data[0].priority || "mid" }, ...tks]);
    setNTk({ title: "", due: "", prio: "mid" }); setModal(null);
  };

  const delTk = async id => {
    await supabase.from("tasks").delete().eq("id", id);
    setTks(tks.filter(t => t.id !== id));
  };

  const togTk = async t => {
    await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id);
    setTks(tks.map(x => x.id === t.id ? { ...x, done: !x.done } : x));
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="tasks" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title="✅ タスク" back={() => nav("home")}
        right={<button onClick={() => setModal("addT")} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ 新規</button>} />

      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8 }}>未完了 ({pending.length})</div>
        {pending.map(t => (
          <div key={t.id} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => togTk(t)} style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #D1D5DB", background: "#fff", cursor: "pointer", flexShrink: 0 }} />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13, color: "#1F2937" }}>{t.title}</div>{t.due && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>📅 {t.due}</div>}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: PRIO[t.prio]?.c }}>{PRIO[t.prio]?.l}</div>
            <button onClick={() => setConf({ msg: `「${t.title}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delTk(t.id); setConf(null); } })} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 14, cursor: "pointer" }}>🗑</button>
          </div>
        ))}
        {done.length > 0 && <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8, marginTop: 16 }}>完了済み ({done.length})</div>
          {done.map(t => (
            <div key={t.id} style={{ background: "#F9FAFB", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, opacity: 0.6 }}>
              <button onClick={() => togTk(t)} style={{ width: 22, height: 22, borderRadius: "50%", border: "none", background: "#10B981", cursor: "pointer", flexShrink: 0, color: "#fff", fontSize: 13 }}>✓</button>
              <div style={{ flex: 1, textDecoration: "line-through", fontSize: 13, color: "#6B7280" }}>{t.title}</div>
              <button onClick={() => setConf({ msg: `「${t.title}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delTk(t.id); setConf(null); } })} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 14, cursor: "pointer" }}>🗑</button>
            </div>
          ))}
        </>}
      </div>

      {modal === "addT" && (<Modal title="タスクを追加" onClose={() => setModal(null)} onSave={saveTk}>
        <Inp label="タスク名 *" value={nTk.title} onChange={e => setNTk({ ...nTk, title: e.target.value })} placeholder="例: 東洋住宅へ見積提出" />
        <Inp label="期限" type="date" value={nTk.due} onChange={e => setNTk({ ...nTk, due: e.target.value })} />
        <Sel label="優先度" opts={["high", "mid", "low"]} value={nTk.prio} onChange={e => setNTk({ ...nTk, prio: e.target.value })} />
      </Modal>)}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
    </div>
  );
}