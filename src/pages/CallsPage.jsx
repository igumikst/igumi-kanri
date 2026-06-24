import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const STATUS_CONFIG = {
  "未対応": { color: "#ef4444", bg: "#fef2f2", icon: "🔴" },
  "対応中": { color: "#f59e0b", bg: "#fffbeb", icon: "🟡" },
  "完了":   { color: "#10b981", bg: "#f0fdf4", icon: "🟢" },
};

const URGENCY_CONFIG = {
  "緊急": { color: "#ef4444", bg: "#fef2f2" },
  "高":   { color: "#f59e0b", bg: "#fffbeb" },
  "中":   { color: "#3b82f6", bg: "#eff6ff" },
  "低":   { color: "#9ca3af", bg: "#f9fafb" },
};

const DEFAULT_TAGS = ["漏水", "設備不具合", "緊急対応", "見積依頼", "定期点検", "その他"];
const DEFAULT_ASSIGNEES = ["﨑岡", "後藤", "赤岡", "上村", "綱島", "伊藤"];

export default function CallsPage({ cust, isPC, pp, nav, calls, setCalls }) {
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState("未対応");
  const [filterTag, setFilterTag] = useState("すべて");
  const [refreshing, setRefreshing] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showTagEdit, setShowTagEdit] = useState(false);
  const [customTags, setCustomTags] = useState(DEFAULT_TAGS);
  const [assignees, setAssignees] = useState(DEFAULT_ASSIGNEES);
  const [showAssigneeEdit, setShowAssigneeEdit] = useState(false);
  const [assigneeInput, setAssigneeInput] = useState("");

  useEffect(() => {
    const load = async () => {
      const [tagsRes, assigneesRes] = await Promise.all([
        supabase.from("home_settings").select("value").eq("id", "call_tags").single(),
        supabase.from("home_settings").select("value").eq("id", "assignee_names").single(),
      ]);
      if (tagsRes.data?.value && Array.isArray(tagsRes.data.value)) setCustomTags(tagsRes.data.value);
      if (assigneesRes.data?.value && Array.isArray(assigneesRes.data.value)) setAssignees(assigneesRes.data.value);
    };
    load();
  }, []);

  const saveTags = async (list) => {
    setCustomTags(list);
    await supabase.from("home_settings").upsert({ id: "call_tags", value: list, updated_at: new Date().toISOString() });
  };

  const saveAssignees = async (list) => {
    setAssignees(list);
    await supabase.from("home_settings").upsert({ id: "assignee_names", value: list, updated_at: new Date().toISOString() });
  };

  const allTags = ["すべて", ...customTags];

  const filtered = calls
    .filter(c => filterStatus === "すべて" || c.status === filterStatus)
    .filter(c => filterTag === "すべて" || (c.tags && c.tags.includes(filterTag)));

  const refreshCalls = async () => {
    setRefreshing(true);
    const { data } = await supabase.from("calls").select("*").order("received_at", { ascending: false });
    if (data) setCalls(data);
    setRefreshing(false);
  };

  const updateStatus = async (id, newStatus) => {
    const { error } = await supabase.from("calls").update({ status: newStatus }).eq("id", id);
    if (!error) {
      setCalls(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
      if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
    } else alert("保存に失敗しました: " + error.message);
  };

  const updateAssignee = async (id, name) => {
    const newAssignee = selected?.assignee === name ? null : name;
    const { error } = await supabase.from("calls").update({ assignee: newAssignee }).eq("id", id);
    if (!error) {
      setCalls(prev => prev.map(c => c.id === id ? { ...c, assignee: newAssignee } : c));
      if (selected?.id === id) setSelected(prev => ({ ...prev, assignee: newAssignee }));
    }
  };

  const toggleTag = async (callId, tag, currentTags) => {
    const tags = currentTags || [];
    const newTags = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
    const { error } = await supabase.from("calls").update({ tags: newTags }).eq("id", callId);
    if (!error) {
      setCalls(prev => prev.map(c => c.id === callId ? { ...c, tags: newTags } : c));
      if (selected?.id === callId) setSelected(prev => ({ ...prev, tags: newTags }));
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  if (selected) return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      <div style={{ background: `linear-gradient(135deg,${cust.c1},${cust.c2})`, padding: "16px 20px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setSelected(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>← 戻る</button>
          <div style={{ flex: 1 }}>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{selected.case_number}</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>案件詳細</div>
          </div>
          <div style={{ background: STATUS_CONFIG[selected.status]?.bg, color: STATUS_CONFIG[selected.status]?.color, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
            {STATUS_CONFIG[selected.status]?.icon} {selected.status}
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 16px 40px" }}>
        {/* ステータス変更 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 10 }}>ステータス変更</div>
          <div style={{ display: "flex", gap: 8 }}>
            {Object.entries(STATUS_CONFIG).map(([s, conf]) => (
              <button key={s} onClick={() => updateStatus(selected.id, s)}
                style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: `2px solid ${selected.status === s ? conf.color : "#E5E7EB"}`, background: selected.status === s ? conf.bg : "#fff", color: selected.status === s ? conf.color : "#9CA3AF", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                {conf.icon} {s}
              </button>
            ))}
          </div>
        </div>

        {/* 対応者選択 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700 }}>👤 対応者</div>
            <button onClick={() => setShowAssigneeEdit(p => !p)} style={{ fontSize: 11, color: cust.c1, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✏️ 名前編集</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {assignees.map(name => {
              const isSelected = selected.assignee === name;
              return (
                <button key={name} onClick={() => updateAssignee(selected.id, name)}
                  style={{ padding: "7px 16px", borderRadius: 20, border: `2px solid ${isSelected ? cust.c1 : "#E5E7EB"}`, background: isSelected ? cust.c1 : "#fff", color: isSelected ? "#fff" : "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {isSelected ? "✓ " : ""}{name}
                </button>
              );
            })}
          </div>
          {selected.assignee && <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>現在の対応者：<span style={{ fontWeight: 700, color: cust.c1 }}>{selected.assignee}</span></div>}
          {showAssigneeEdit && (
            <div style={{ marginTop: 14, borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {assignees.map(name => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 4, background: "#F3F4F6", borderRadius: 20, padding: "4px 10px" }}>
                    <span style={{ fontSize: 12, color: "#374151" }}>{name}</span>
                    <button onClick={() => saveAssignees(assignees.filter(a => a !== name))} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={assigneeInput} onChange={e => setAssigneeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && assigneeInput.trim()) { saveAssignees([...assignees, assigneeInput.trim()]); setAssigneeInput(""); }}}
                  placeholder="名前を追加..."
                  style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "7px 12px", fontSize: 13, outline: "none", color: "#1F2937" }} />
                <button onClick={() => { if (assigneeInput.trim()) { saveAssignees([...assignees, assigneeInput.trim()]); setAssigneeInput(""); }}}
                  style={{ background: cust.c1, border: "none", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>追加</button>
              </div>
            </div>
          )}
        </div>

        {/* タグ */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700 }}>🏷 タグ</div>
            <button onClick={() => setShowTagEdit(p => !p)} style={{ fontSize: 11, color: cust.c1, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✏️ タグ編集</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {customTags.map(tag => {
              const active = selected.tags?.includes(tag);
              return (
                <button key={tag} onClick={() => toggleTag(selected.id, tag, selected.tags)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${active ? cust.c1 : "#E5E7EB"}`, background: active ? cust.c1 : "#fff", color: active ? "#fff" : "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {active ? "✓ " : ""}{tag}
                </button>
              );
            })}
          </div>
          {showTagEdit && (
            <div style={{ marginTop: 14, borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {customTags.map(tag => (
                  <div key={tag} style={{ display: "flex", alignItems: "center", gap: 4, background: "#F3F4F6", borderRadius: 20, padding: "4px 10px" }}>
                    <span style={{ fontSize: 12, color: "#374151" }}>{tag}</span>
                    <button onClick={() => saveTags(customTags.filter(t => t !== tag))} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && tagInput.trim()) { saveTags([...customTags, tagInput.trim()]); setTagInput(""); }}}
                  placeholder="新しいタグを入力..."
                  style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "7px 12px", fontSize: 13, outline: "none", color: "#1F2937" }} />
                <button onClick={() => { if (tagInput.trim()) { saveTags([...customTags, tagInput.trim()]); setTagInput(""); }}}
                  style={{ background: cust.c1, border: "none", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>追加</button>
              </div>
            </div>
          )}
        </div>

        {/* 基本情報 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 10 }}>📋 基本情報</div>
          {[
            ["受付日時", formatDate(selected.received_at)],
            ["管理会社", selected.company_name],
            ["担当者名", selected.contact_name],
            ["折返し先", selected.phone_number],
            ["物件名",   selected.property_name],
            ["部屋番号", selected.room_number],
            ["案件種別", selected.case_type],
            ["緊急度",   selected.urgency],
          ].map(([label, value]) => value ? (
            <div key={label} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ fontSize: 12, color: "#9CA3AF", width: 72, flexShrink: 0 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 600, flex: 1 }}>
                {label === "緊急度" ? <span style={{ background: URGENCY_CONFIG[value]?.bg, color: URGENCY_CONFIG[value]?.color, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{value}</span> : value}
              </div>
            </div>
          ) : null)}
        </div>

        {selected.ai_summary && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 8 }}>🤖 AI要約</div>
            <div style={{ fontSize: 13, color: "#1F2937", lineHeight: 1.7, background: "#F8FAFF", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #2563eb" }}>{selected.ai_summary}</div>
          </div>
        )}

        {selected.transcript && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 8 }}>📝 文字起こし全文</div>
            <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.8, background: "#F9FAFB", borderRadius: 10, padding: "12px 14px", whiteSpace: "pre-wrap" }}>{selected.transcript}</div>
          </div>
        )}

        {selected.recording_url && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 8 }}>🎙 録音データ</div>
            <audio controls src={selected.recording_url ? `/api/recording-proxy?url=${encodeURIComponent(selected.recording_url)}` : ""} style={{ width: "100%", borderRadius: 8 }} />
          </div>
        )}

        {selected.phone_number && (
          <a href={`tel:${selected.phone_number}`}
            style={{ display: "block", background: `linear-gradient(135deg,${cust.c1},${cust.c2})`, color: "#fff", borderRadius: 14, padding: "14px", textAlign: "center", fontWeight: 800, fontSize: 16, textDecoration: "none", boxShadow: "0 4px 12px rgba(37,99,235,0.3)", marginBottom: 14 }}>
            📞 折返し電話をする
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      <div style={{ background: `linear-gradient(135deg,${cust.c1},${cust.c2})`, padding: "16px 20px 24px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>← ホーム</button>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>📞 電話受付案件</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>全 {calls.length} 件</div>
          </div>
          <button onClick={refreshCalls} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 15, cursor: "pointer", fontWeight: 700 }}>
            {refreshing ? "⏳" : "🔄 更新"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(STATUS_CONFIG).map(([s, conf]) => (
            <div key={s} style={{ flex: 1, background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{calls.filter(c => c.status === s).length}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>{conf.icon} {s}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 40px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, overflowX: "auto" }}>
          {["すべて", "未対応", "対応中", "完了"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{ flexShrink: 0, padding: "6px 16px", borderRadius: 20, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: filterStatus === s ? cust.c1 : "#fff", color: filterStatus === s ? "#fff" : "#6B7280", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", alignItems: "center" }}>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setFilterTag(tag)}
              style={{ flexShrink: 0, padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${filterTag === tag ? cust.c1 : "#E5E7EB"}`, fontWeight: 600, fontSize: 11, cursor: "pointer", background: filterTag === tag ? cust.c1 : "#fff", color: filterTag === tag ? "#fff" : "#9CA3AF" }}>
              🏷 {tag}
            </button>
          ))}
          <button onClick={() => setShowTagEdit(p => !p)}
            style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 20, border: "1.5px dashed #D1D5DB", fontSize: 11, cursor: "pointer", background: "#fff", color: "#9CA3AF" }}>
            ＋ タグ編集
          </button>
        </div>

        {showTagEdit && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 10 }}>🏷 タグを管理</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {customTags.map(tag => (
                <div key={tag} style={{ display: "flex", alignItems: "center", gap: 4, background: "#F3F4F6", borderRadius: 20, padding: "4px 10px" }}>
                  <span style={{ fontSize: 12, color: "#374151" }}>{tag}</span>
                  <button onClick={() => saveTags(customTags.filter(t => t !== tag))} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && tagInput.trim()) { saveTags([...customTags, tagInput.trim()]); setTagInput(""); }}}
                placeholder="新しいタグを入力..."
                style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "7px 12px", fontSize: 13, outline: "none", color: "#1F2937" }} />
              <button onClick={() => { if (tagInput.trim()) { saveTags([...customTags, tagInput.trim()]); setTagInput(""); }}}
                style={{ background: cust.c1, border: "none", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>追加</button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#9CA3AF" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>案件はありません</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(call => {
              const sc = STATUS_CONFIG[call.status] || STATUS_CONFIG["未対応"];
              const uc = URGENCY_CONFIG[call.urgency];
              return (
                <div key={call.id} onClick={() => setSelected(call)}
                  style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", cursor: "pointer", borderLeft: `4px solid ${sc.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{sc.icon} {call.status}</span>
                      {call.urgency && uc && <span style={{ background: uc.bg, color: uc.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{call.urgency}</span>}
                      {call.assignee && <span style={{ background: "#F0FDF4", color: "#059669", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>👤 {call.assignee}</span>}
                      {call.tags?.map(tag => (
                        <span key={tag} style={{ background: "#EFF6FF", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>🏷 {tag}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", flexShrink: 0, marginLeft: 8 }}>{formatDate(call.received_at)}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1F2937", marginBottom: 4 }}>
                    {call.company_name || "会社名不明"} {call.contact_name ? `｜${call.contact_name}` : ""}
                  </div>
                  {call.property_name && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>🏠 {call.property_name}{call.room_number ? ` ${call.room_number}号室` : ""}</div>}
                  {call.ai_summary && (
                    <div style={{ fontSize: 12, color: "#374151", background: "#F8FAFF", borderRadius: 8, padding: "8px 10px", borderLeft: "3px solid #2563eb", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {call.ai_summary}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, textAlign: "right" }}>{call.case_number} ›</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}