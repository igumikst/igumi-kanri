import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const STAFF = ["崎岡", "後藤", "赤岡", "上村", "綱島", "伊藤"];

const CATEGORIES = [
  { label: "現調", color: "#2563eb" },
  { label: "調査", color: "#16a34a" },
  { label: "工事", color: "#9333ea" },
  { label: "打ち合わせ", color: "#0891b2" },
  { label: "緊急当番", color: "#dc2626" },
  { label: "事務", color: "#78716c" },
  { label: "外出", color: "#92400e" },
  { label: "休み", color: "#db2777" },
  { label: "その他", color: "#6b7280" },
];

const getCategoryColor = (label) =>
  CATEGORIES.find((c) => c.label === label)?.color || "#6b7280";

const DAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];

function getWeekDates(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(monday);
    nd.setDate(monday.getDate() + i);
    return nd;
  });
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isSameDay(a, b) {
  return toDateStr(a) === toDateStr(b);
}

export default function Schedule({ nav }) {
  const [today] = useState(new Date());
  const [baseDate, setBaseDate] = useState(new Date());
  const weekDates = getWeekDates(baseDate);

  const [schedules, setSchedules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [newSubName, setNewSubName] = useState("");

  const emptyForm = {
    title: "",
    start_date: "",
    start_h: "",
    start_m: "00",
    end_h: "",
    end_m: "00",
    all_day: false,
    category: "現調",
    assignees: [],
    project_id: "",
    location: "",
    memo: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [showOutsource, setShowOutsource] = useState(false);

  function buildISO(date, h, m) {
    if (!date) return null;
    if (h === "") return `${date}T00:00`;
    return `${date}T${String(h).padStart(2, "0")}:${m || "00"}`;
  }

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: sc }, { data: pj }, { data: sub }] = await Promise.all([
      supabase.from("schedules").select("*").order("start_at"),
      supabase.from("projects").select("id, name"),
      supabase.from("subcontractors").select("*").order("name"),
    ]);
    setSchedules(sc || []);
    setProjects(pj || []);
    setSubcontractors(sub || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.start_date) {
      alert("タイトルと日付は必須です");
      return;
    }
    const start_at = buildISO(form.start_date, form.start_h, form.start_m);
    const end_at = form.end_h !== "" ? buildISO(form.start_date, form.end_h, form.end_m) : null;
    const payload = {
      title: form.title.trim(),
      start_at,
      end_at,
      all_day: form.all_day,
      category: form.category,
      color: getCategoryColor(form.category),
      assignees: form.assignees,
      project_id: form.project_id || null,
      location: form.location,
      memo: form.memo,
    };
    if (editItem) {
      await supabase.from("schedules").update(payload).eq("id", editItem.id);
    } else {
      await supabase.from("schedules").insert([payload]);
    }
    setShowModal(false);
    setEditItem(null);
    setForm(emptyForm);
    fetchAll();
  }

  async function handleDelete(id) {
    if (!confirm("この予定を削除しますか？")) return;
    await supabase.from("schedules").delete().eq("id", id);
    fetchAll();
  }

  async function addSubcontractor() {
    if (!newSubName.trim()) return;
    await supabase.from("subcontractors").insert([{ name: newSubName.trim() }]);
    setNewSubName("");
    const { data } = await supabase.from("subcontractors").select("*").order("name");
    setSubcontractors(data || []);
  }

  async function deleteSubcontractor(id) {
    if (!confirm("この外注業者を削除しますか？")) return;
    await supabase.from("subcontractors").delete().eq("id", id);
    const { data } = await supabase.from("subcontractors").select("*").order("name");
    setSubcontractors(data || []);
  }

  function openNew(date) {
    setForm({ ...emptyForm, start_date: toDateStr(date) });
    setEditItem(null);
    setShowOutsource(false);
    setShowModal(true);
  }

  function openEdit(sc) {
    const startD = new Date(sc.start_at);
    const endD = sc.end_at ? new Date(sc.end_at) : null;
    setForm({
      title: sc.title,
      start_date: sc.start_at?.slice(0, 10) || "",
      start_h: sc.all_day ? "" : String(startD.getHours()),
      start_m: sc.all_day ? "00" : (startD.getMinutes() >= 30 ? "30" : "00"),
      end_h: endD ? String(endD.getHours()) : "",
      end_m: endD ? (endD.getMinutes() >= 30 ? "30" : "00") : "00",
      all_day: sc.all_day || false,
      category: sc.category || "現調",
      assignees: sc.assignees || [],
      project_id: sc.project_id || "",
      location: sc.location || "",
      memo: sc.memo || "",
    });
    setEditItem(sc);
    setShowOutsource((sc.assignees || []).some((a) => !STAFF.includes(a)));
    setShowModal(true);
  }

  function toggleAssignee(name) {
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(name)
        ? f.assignees.filter((a) => a !== name)
        : [...f.assignees, name],
    }));
  }

  function toggleSub(name) {
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(name)
        ? f.assignees.filter((a) => a !== name)
        : [...f.assignees, name],
    }));
  }

  function getSchedulesForDay(date) {
    return schedules.filter((sc) => isSameDay(new Date(sc.start_at), date));
  }

  function prevWeek() {
    const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d);
  }
  function nextWeek() {
    const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d);
  }
  function goToday() { setBaseDate(new Date()); }

  const weekLabel = `${weekDates[0].getFullYear()}年${weekDates[0].getMonth() + 1}月${weekDates[0].getDate()}日 〜 ${weekDates[6].getMonth() + 1}月${weekDates[6].getDate()}日`;

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#f5f5f5", minHeight: "100vh" }}>

      {/* ===== ヘッダー ===== */}
      <div style={{ background: "#1a56a0", color: "#fff", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 48 }}>
          <button
            onClick={() => nav && nav("home")}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
          >
            ← 戻る
          </button>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>📅 スケジュール</span>
          <button
            onClick={() => openNew(today)}
            style={{ background: "#fff", border: "none", color: "#1a56a0", borderRadius: 6, padding: "5px 14px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}
          >
            ＋ 追加
          </button>
          <button
            onClick={() => setShowSubModal(true)}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, padding: "5px 10px", fontSize: 13, cursor: "pointer" }}
          >
            🏢
          </button>
        </div>
      </div>

      {/* ===== 週ナビ ===== */}
      <div style={{ background: "#fff", borderBottom: "1px solid #ddd", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={prevWeek} style={navBtnStyle}>◀ 前週</button>
        <button onClick={goToday} style={{ ...navBtnStyle, background: "#1a56a0", color: "#fff", border: "none" }}>今日</button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 600, color: "#333" }}>{weekLabel}</span>
        <button onClick={nextWeek} style={navBtnStyle}>次週 ▶</button>
      </div>

      {/* ===== カレンダーグリッド ===== */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>読み込み中...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", background: "#fff" }}>
            <thead>
              <tr>
                {weekDates.map((date, i) => {
                  const isToday = isSameDay(date, today);
                  const isSun = date.getDay() === 0;
                  const isSat = date.getDay() === 6;
                  return (
                    <th key={i} style={{
                      border: "1px solid #ddd",
                      padding: "6px 4px",
                      textAlign: "center",
                      background: isToday ? "#dbeafe" : "#f0f4f8",
                      color: isSun ? "#dc2626" : isSat ? "#2563eb" : "#333",
                      fontSize: 13,
                      fontWeight: 700,
                      width: "14.28%",
                    }}>
                      <div>{date.getMonth() + 1}/{date.getDate()}</div>
                      <div style={{ fontSize: 11 }}>({DAYS_JP[date.getDay()]})</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                {weekDates.map((date, i) => {
                  const isToday = isSameDay(date, today);
                  const daySchedules = getSchedulesForDay(date);
                  return (
                    <td key={i} style={{
                      border: "1px solid #ddd",
                      verticalAlign: "top",
                      padding: "4px",
                      minHeight: 120,
                      background: isToday ? "#eff6ff" : "#fff",
                    }}>
                      {daySchedules.map((sc) => (
                        <div
                          key={sc.id}
                          onClick={() => openEdit(sc)}
                          style={{
                            background: getCategoryColor(sc.category) + "22",
                            borderLeft: `3px solid ${getCategoryColor(sc.category)}`,
                            borderRadius: 3,
                            padding: "3px 5px",
                            marginBottom: 3,
                            cursor: "pointer",
                            fontSize: 11,
                          }}
                        >
                          {!sc.all_day && (
                            <div style={{ color: "#555", fontWeight: 600 }}>{formatTime(sc.start_at)}{sc.end_at ? `-${formatTime(sc.end_at)}` : ""}</div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
                            <span style={{ background: getCategoryColor(sc.category), color: "#fff", borderRadius: 3, padding: "0 4px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                              {sc.category}
                            </span>
                            <span style={{ color: "#1f2937", fontWeight: 600, fontSize: 11 }}>{sc.title}</span>
                          </div>
                          {sc.assignees?.length > 0 && (
                            <div style={{ color: "#666", fontSize: 10, marginTop: 1 }}>{sc.assignees.join("・")}</div>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => openNew(date)}
                        style={{ width: "100%", background: "none", border: "1px dashed #ccc", borderRadius: 3, color: "#aaa", fontSize: 16, padding: "2px 0", cursor: "pointer", marginTop: 2 }}
                      >
                        ＋
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 予定登録・編集モーダル ===== */}
      {showModal && (
        <div style={overlayStyle} onClick={() => setShowModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>

            {/* モーダルヘッダー（サイボウズっぽく青帯） */}
            <div style={{ background: "#1a56a0", color: "#fff", padding: "12px 16px", borderRadius: "12px 12px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>予定の登録</span>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, padding: "0 0 8px" }}>
              {/* 日付 */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>日付</div>
                <div style={rowValueStyle}>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* 時刻 */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>時刻</div>
                <div style={{ ...rowValueStyle, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  <select style={selectStyle} value={form.start_h} onChange={(e) => setForm({ ...form, start_h: e.target.value })}>
                    <option value="">--時</option>
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={String(i)}>{i}時</option>)}
                  </select>
                  <select style={{ ...selectStyle, width: 70 }} value={form.start_m} onChange={(e) => setForm({ ...form, start_m: e.target.value })} disabled={form.start_h === ""}>
                    <option value="00">00分</option>
                    <option value="30">30分</option>
                  </select>
                  <span style={{ color: "#666", fontSize: 16 }}>〜</span>
                  <select style={selectStyle} value={form.end_h} onChange={(e) => setForm({ ...form, end_h: e.target.value })}>
                    <option value="">--時</option>
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={String(i)}>{i}時</option>)}
                  </select>
                  <select style={{ ...selectStyle, width: 70 }} value={form.end_m} onChange={(e) => setForm({ ...form, end_m: e.target.value })} disabled={form.end_h === ""}>
                    <option value="00">00分</option>
                    <option value="30">30分</option>
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#555", cursor: "pointer" }}>
                    <input type="checkbox" checked={form.all_day} onChange={(e) => setForm({ ...form, all_day: e.target.checked, start_h: "", end_h: "" })} />
                    終日
                  </label>
                </div>
              </div>

              {/* 予定（カテゴリ）＋タイトル */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>予定</div>
                <div style={{ ...rowValueStyle, display: "flex", gap: 6, alignItems: "center" }}>
                  {/* カテゴリセレクト（サイボウズっぽいドロップダウン） */}
                  <select
                    style={{ ...selectStyle, width: 110 }}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.label} value={c.label}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="予定のタイトル"
                  />
                </div>
              </div>

              {/* メモ */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>メモ</div>
                <div style={rowValueStyle}>
                  <textarea
                    style={{ ...inputStyle, height: 60, resize: "vertical" }}
                    value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                    placeholder="備考など"
                  />
                </div>
              </div>

              {/* 担当者 */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>担当者</div>
                <div style={rowValueStyle}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {STAFF.map((name) => (
                      <button
                        key={name}
                        onClick={() => toggleAssignee(name)}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 20,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          border: `2px solid ${form.assignees.includes(name) ? "#2563eb" : "#e5e7eb"}`,
                          background: form.assignees.includes(name) ? "#2563eb" : "#f3f4f6",
                          color: form.assignees.includes(name) ? "#fff" : "#374151",
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  {/* 外注業者 */}
                  <button
                    onClick={() => setShowOutsource(!showOutsource)}
                    style={{ background: "none", border: "none", color: "#7c3aed", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
                  >
                    {showOutsource ? "▲" : "▼"} 外注業者
                  </button>
                  {showOutsource && (
                    <div style={{ marginTop: 6, padding: 8, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8 }}>
                      {subcontractors.length === 0 ? (
                        <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>外注業者が登録されていません</p>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {subcontractors.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => toggleSub(sub.name)}
                              style={{
                                padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
                                border: `2px solid ${form.assignees.includes(sub.name) ? "#7c3aed" : "#e5e7eb"}`,
                                background: form.assignees.includes(sub.name) ? "#7c3aed" : "#f3f4f6",
                                color: form.assignees.includes(sub.name) ? "#fff" : "#374151",
                              }}
                            >
                              {sub.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 案件 */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>案件</div>
                <div style={rowValueStyle}>
                  <select style={inputStyle} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                    <option value="">― 案件を選択 ―</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 場所 */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>場所</div>
                <div style={rowValueStyle}>
                  <input
                    style={inputStyle}
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="例：〇〇マンション 305号室"
                  />
                </div>
              </div>
            </div>

            {/* フッターボタン */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid #eee" }}>
              {editItem && (
                <button onClick={() => { handleDelete(editItem.id); setShowModal(false); }}
                  style={{ padding: "8px 16px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", marginRight: "auto" }}>
                  削除
                </button>
              )}
              <button onClick={() => setShowModal(false)}
                style={{ padding: "8px 16px", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
                キャンセル
              </button>
              <button onClick={handleSave}
                style={{ padding: "8px 20px", background: "#1a56a0", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                登録する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 外注業者管理モーダル ===== */}
      {showSubModal && (
        <div style={overlayStyle} onClick={() => setShowSubModal(false)}>
          <div style={{ ...modalStyle, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#1a56a0", color: "#fff", padding: "12px 16px", borderRadius: "12px 12px 0 0", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700 }}>🏢 外注業者を管理</span>
              <button onClick={() => setShowSubModal(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="業者名を入力"
                  onKeyDown={(e) => e.key === "Enter" && addSubcontractor()}
                />
                <button onClick={addSubcontractor}
                  style={{ padding: "8px 14px", background: "#1a56a0", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
                  追加
                </button>
              </div>
              {subcontractors.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13 }}>まだ登録がありません</p>
              ) : (
                subcontractors.map((sub) => (
                  <div key={sub.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 14 }}>{sub.name}</span>
                    <button onClick={() => deleteSubcontractor(sub.id)}
                      style={{ padding: "4px 10px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                      削除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 共通スタイル =====
const navBtnStyle = {
  padding: "5px 12px", background: "#fff", border: "1px solid #ccc",
  borderRadius: 4, fontSize: 13, cursor: "pointer", color: "#333",
};
const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};
const modalStyle = {
  background: "#fff", borderRadius: 12, width: "100%", maxWidth: 540,
  maxHeight: "90vh", display: "flex", flexDirection: "column",
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};
const rowStyle = {
  display: "flex", alignItems: "flex-start", borderBottom: "1px solid #eee",
  padding: "10px 16px", gap: 8,
};
const rowLabelStyle = {
  width: 52, flexShrink: 0, fontSize: 13, fontWeight: 600,
  color: "#555", paddingTop: 6,
};
const rowValueStyle = { flex: 1 };
const inputStyle = {
  width: "100%", padding: "7px 10px", border: "1px solid #ccc",
  borderRadius: 4, fontSize: 14, color: "#1e293b",
  background: "#fff", boxSizing: "border-box", outline: "none",
};
const selectStyle = {
  padding: "7px 6px", border: "1px solid #ccc", borderRadius: 4,
  fontSize: 14, color: "#1e293b", background: "#fff",
  outline: "none", cursor: "pointer", minWidth: 80,
};