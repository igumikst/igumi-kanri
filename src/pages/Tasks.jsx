import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PRIO } from "../lib/constants";
import { Inp, Sel, Modal, Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { getOwnEndpoint } from "../lib/push";

const NEW_TASK_DEFAULT = { title: "", due: "", prio: "mid", assignees: [], shared: false };

export default function Tasks({ pjs, submittedQuotes, wonQuotes, cos, tks, setTks, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, SB_W, RP_W }) {
  const [modal, setModal] = useState(null);
  const [conf, setConf] = useState(null);
  const [nTk, setNTk] = useState(NEW_TASK_DEFAULT);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const pending = tks.filter(t => !t.done);
  const done = tks.filter(t => t.done);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("home_settings").select("value").eq("id", "assignee_names").single();
      if (data?.value && Array.isArray(data.value)) setAssigneeOptions(data.value);
    })();
  }, []);

  const toggleAssignee = (name) => {
    setNTk(prev => ({
      ...prev,
      assignees: prev.assignees.includes(name) ? prev.assignees.filter(a => a !== name) : [...prev.assignees, name],
    }));
  };

  const toggleShared = () => {
    setNTk(prev => ({ ...prev, shared: !prev.shared, assignees: !prev.shared ? [] : prev.assignees }));
  };

  const saveTk = async () => {
    if (!nTk.title) return;
    const { data } = await supabase.from("tasks").insert([{
      title: nTk.title, done: false, priority: nTk.prio, due: nTk.due,
      assignees: nTk.assignees, shared: nTk.shared,
    }]).select();
    if (data) {
      const newTask = data[0];
      setTks([{ ...newTask, prio: newTask.priority || "mid" }, ...tks]);
      notifyTaskAssignees(newTask, nTk.assignees);
    }
    setNTk(NEW_TASK_DEFAULT); setModal(null);
  };

  // タスクの追加・担当者指名の直後に、関わる人のON端末へ通知する(第8弾テーマ27-2)。
  // 失敗してもタスクの保存自体は既に成功しているため、画面には何も出さない。
  const notifyTaskAssignees = async (task, notifyNames) => {
    if (!task.shared && (!notifyNames || !notifyNames.length)) return;
    try {
      const excludeEndpoint = await getOwnEndpoint();
      await fetch("/api/task-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, notifyNames, excludeEndpoint }),
      });
    } catch {
      /* 通知の失敗は無視する */
    }
  };

  const delTk = async id => {
    await supabase.from("tasks").delete().eq("id", id);
    setTks(tks.filter(t => t.id !== id));
  };

  const togTk = async t => {
    await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id);
    setTks(tks.map(x => x.id === t.id ? { ...x, done: !x.done } : x));
  };

  const assigneeLabel = (t) => {
    if (t.shared) return "👥 全員";
    if (t.assignees && t.assignees.length) return "👤 " + t.assignees.join("・");
    return "";
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="tasks" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} submittedQuotes={submittedQuotes} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} wonQuotes={wonQuotes} submittedQuotes={submittedQuotes} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title="✅ タスク" back={() => nav("home")}
        right={<button onClick={() => setModal("addT")} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ 新規</button>} />

      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8 }}>未完了 ({pending.length})</div>
        {pending.map(t => (
          <div key={t.id} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => togTk(t)} style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #D1D5DB", background: "#fff", cursor: "pointer", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1F2937" }}>{t.title}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                {t.due && <div style={{ fontSize: 11, color: "#9CA3AF" }}>📅 {t.due}</div>}
                {assigneeLabel(t) && <div style={{ fontSize: 11, color: "#9CA3AF" }}>{assigneeLabel(t)}</div>}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: PRIO[t.prio]?.c }}>{PRIO[t.prio]?.l}</div>
            <button onClick={() => setConf({ msg: `「${t.title}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delTk(t.id); setConf(null); } })} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 14, cursor: "pointer" }}>🗑</button>
          </div>
        ))}
        {done.length > 0 && <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8, marginTop: 16 }}>完了済み ({done.length})</div>
          {done.map(t => (
            <div key={t.id} style={{ background: "#F9FAFB", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, opacity: 0.6 }}>
              <button onClick={() => togTk(t)} style={{ width: 22, height: 22, borderRadius: "50%", border: "none", background: "#10B981", cursor: "pointer", flexShrink: 0, color: "#fff", fontSize: 13 }}>✓</button>
              <div style={{ flex: 1 }}>
                <div style={{ textDecoration: "line-through", fontSize: 13, color: "#6B7280" }}>{t.title}</div>
                {assigneeLabel(t) && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{assigneeLabel(t)}</div>}
              </div>
              <button onClick={() => setConf({ msg: `「${t.title}」\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { delTk(t.id); setConf(null); } })} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 14, cursor: "pointer" }}>🗑</button>
            </div>
          ))}
        </>}
      </div>

      {modal === "addT" && (<Modal title="タスクを追加" onClose={() => { setModal(null); setNTk(NEW_TASK_DEFAULT); }} onSave={saveTk}>
        <Inp label="タスク名 *" value={nTk.title} onChange={e => setNTk({ ...nTk, title: e.target.value })} placeholder="例: 東洋住宅へ見積提出" />
        <Inp label="期限" type="date" value={nTk.due} onChange={e => setNTk({ ...nTk, due: e.target.value })} />
        <Sel label="優先度" opts={["high", "mid", "low"]} value={nTk.prio} onChange={e => setNTk({ ...nTk, prio: e.target.value })} />

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>担当者(複数選択可)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {assigneeOptions.map(name => {
              const selected = nTk.assignees.includes(name);
              return (
                <button key={name} type="button" onClick={() => toggleAssignee(name)} disabled={nTk.shared}
                  style={{
                    padding: "7px 14px", borderRadius: 20, border: `2px solid ${selected ? "#1A3A5C" : "#E5E7EB"}`,
                    background: selected ? "#1A3A5C" : "#fff", color: selected ? "#fff" : "#374151",
                    fontSize: 13, fontWeight: 700, cursor: nTk.shared ? "default" : "pointer", opacity: nTk.shared ? 0.5 : 1,
                  }}>
                  {selected ? "✓ " : ""}{name}
                </button>
              );
            })}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={nTk.shared} onChange={toggleShared} />
          <span style={{ fontSize: 13, color: "#374151", fontWeight: 700 }}>👥 全員(共有)のタスクにする</span>
        </label>
      </Modal>)}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
    </div>
  );
}
