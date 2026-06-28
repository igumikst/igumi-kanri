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
    const dateStr = toDateStr(date);
    setForm({ ...emptyForm, start_date: dateStr });
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
    return schedules.filter((sc) => {
      const start = new Date(sc.start_at);
      return isSameDay(start, date);
    });
  }

  function prevWeek() {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - 7);
    setBaseDate(d);
  }
  function nextWeek() {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 7);
    setBaseDate(d);
  }
  function goToday() { setBaseDate(new Date()); }

  const weekLabel = `${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()} (月) 〜 ${weekDates[6].getMonth() + 1}/${weekDates[6].getDate()} (日)`;

  return (
    <div style={styles.outer}>
      {/* サイドバー */}
      <aside style={styles.sidebar}>
        {/* 戻るボタン */}
        <button style={styles.backBtn} onClick={() => nav && nav("home")}>
          ← ホームへ戻る
        </button>
        <div style={styles.sideTitle}>📅 スケジュール</div>
        <div style={styles.sideSection}>
          <div style={styles.sideSectionTitle}>今日の予定</div>
          {getSchedulesForDay(today).length === 0 ? (
            <p style={styles.sideEmpty}>予定なし</p>
          ) : (
            getSchedulesForDay(today).map((sc) => (
              <div key={sc.id} style={{ ...styles.sideItem, borderLeft: `3px solid ${sc.color || "#6b7280"}` }}>
                <div style={styles.sideItemTime}>{formatTime(sc.start_at)}</div>
                <div style={styles.sideItemTitle}>{sc.title}</div>
                {sc.assignees?.length > 0 && (
                  <div style={styles.sideItemSub}>{sc.assignees.join("・")}</div>
                )}
              </div>
            ))
          )}
        </div>
        <div style={styles.sideSection}>
          <div style={styles.sideSectionTitle}>カテゴリ</div>
          {CATEGORIES.map((c) => (
            <div key={c.label} style={styles.legendRow}>
              <span style={{ ...styles.legendDot, background: c.color }} />
              <span style={styles.legendLabel}>{c.label}</span>
            </div>
          ))}
        </div>
        <button style={styles.subBtn} onClick={() => setShowSubModal(true)}>
          🏢 外注業者を管理
        </button>
      </aside>

      {/* メインエリア */}
      <main style={styles.main}>
        {/* スマホ用ヘッダー（サイドバーが見えないとき） */}
        <div style={styles.mobileHeader}>
          <button style={styles.mobileBackBtn} onClick={() => nav && nav("home")}>
            ← 戻る
          </button>
          <span style={styles.mobileTitle}>📅 スケジュール</span>
          <button style={styles.mobileSubBtn} onClick={() => setShowSubModal(true)}>🏢</button>
        </div>

        <div style={styles.navBar}>
          <button style={styles.navBtn} onClick={prevWeek}>‹ 前週</button>
          <button style={styles.todayBtn} onClick={goToday}>今日</button>
          <span style={styles.weekLabel}>{weekLabel}</span>
          <button style={styles.navBtn} onClick={nextWeek}>次週 ›</button>
          <button style={styles.addBtn} onClick={() => openNew(today)}>＋ 予定追加</button>
        </div>

        {loading ? (
          <div style={styles.loading}>読み込み中...</div>
        ) : (
          <div style={styles.calGrid}>
            {weekDates.map((date, i) => {
              const isToday = isSameDay(date, today);
              const isSat = i === 5;
              const isSun = i === 6;
              const daySchedules = getSchedulesForDay(date);
              return (
                <div key={i} style={{
                  ...styles.dayCol,
                  background: isToday ? "#eff6ff" : isSun ? "#fff5f5" : isSat ? "#f0f9ff" : "#fff",
                }}>
                  <div style={{
                    ...styles.dayHeader,
                    background: isToday ? "#2563eb" : "transparent",
                    borderRadius: isToday ? "8px" : "0",
                    color: isToday ? "#fff" : isSun ? "#dc2626" : isSat ? "#2563eb" : "#374151",
                  }}>
                    <span style={styles.dayNum}>{date.getDate()}</span>
                    <span style={styles.dayName}>{DAYS_JP[date.getDay()]}</span>
                  </div>
                  <div style={styles.eventList}>
                    {daySchedules.map((sc) => (
                      <div
                        key={sc.id}
                        style={{ ...styles.eventChip, background: sc.color || "#6b7280" }}
                        onClick={() => openEdit(sc)}
                      >
                        <div style={styles.eventTime}>
                          {sc.all_day ? "終日" : formatTime(sc.start_at)}
                        </div>
                        <div style={styles.eventTitle}>{sc.title}</div>
                        {sc.assignees?.length > 0 && (
                          <div style={styles.eventAssignee}>{sc.assignees.join("・")}</div>
                        )}
                      </div>
                    ))}
                    <button style={styles.dayAddBtn} onClick={() => openNew(date)}>＋</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 予定登録・編集モーダル */}
      {showModal && (
        <div style={styles.overlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>{editItem ? "予定を編集" : "予定を追加"}</span>
              <button style={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={styles.modalBody}>

              <label style={styles.label}>タイトル *</label>
              <input
                style={styles.input}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例：〇〇マンション 現調"
              />

              <label style={styles.label}>カテゴリ</label>
              <div style={styles.catGrid}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.label}
                    style={{
                      ...styles.catChip,
                      background: form.category === c.label ? c.color : "#f3f4f6",
                      color: form.category === c.label ? "#fff" : "#374151",
                      border: `2px solid ${form.category === c.label ? c.color : "#e5e7eb"}`,
                    }}
                    onClick={() => setForm({ ...form, category: c.label })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <label style={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={form.all_day}
                  onChange={(e) => setForm({ ...form, all_day: e.target.checked, start_h: "", end_h: "" })}
                  style={{ marginRight: 8 }}
                />
                終日
              </label>

              <label style={styles.label}>日付 *</label>
              <input
                type="date"
                style={styles.input}
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />

              {!form.all_day && (
                <>
                  <label style={styles.label}>時刻</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <select
                      style={{ ...styles.input, flex: 1 }}
                      value={form.start_h}
                      onChange={(e) => setForm({ ...form, start_h: e.target.value })}
                    >
                      <option value="">--時</option>
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={String(i)}>{i}時</option>
                      ))}
                    </select>
                    <select
                      style={{ ...styles.input, flex: 1 }}
                      value={form.start_m}
                      onChange={(e) => setForm({ ...form, start_m: e.target.value })}
                      disabled={form.start_h === ""}
                    >
                      <option value="00">00分</option>
                      <option value="30">30分</option>
                    </select>
                    <span style={{ color: "#94a3b8", fontSize: 14, flexShrink: 0 }}>〜</span>
                    <select
                      style={{ ...styles.input, flex: 1 }}
                      value={form.end_h}
                      onChange={(e) => setForm({ ...form, end_h: e.target.value })}
                    >
                      <option value="">--時</option>
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={String(i)}>{i}時</option>
                      ))}
                    </select>
                    <select
                      style={{ ...styles.input, flex: 1 }}
                      value={form.end_m}
                      onChange={(e) => setForm({ ...form, end_m: e.target.value })}
                      disabled={form.end_h === ""}
                    >
                      <option value="00">00分</option>
                      <option value="30">30分</option>
                    </select>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                    ※ 開始時刻だけ入れればOK。終了は任意
                  </div>
                </>
              )}

              <label style={styles.label}>担当者（スタッフ）</label>
              <div style={styles.staffGrid}>
                {STAFF.map((name) => (
                  <button
                    key={name}
                    style={{
                      ...styles.staffChip,
                      background: form.assignees.includes(name) ? "#2563eb" : "#f3f4f6",
                      color: form.assignees.includes(name) ? "#fff" : "#374151",
                      border: `2px solid ${form.assignees.includes(name) ? "#2563eb" : "#e5e7eb"}`,
                    }}
                    onClick={() => toggleAssignee(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <button style={styles.outsourceToggle} onClick={() => setShowOutsource(!showOutsource)}>
                {showOutsource ? "▲" : "▼"} 外注業者を追加する
              </button>
              {showOutsource && (
                <div style={styles.outsourceBox}>
                  {subcontractors.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontSize: 13 }}>外注業者が登録されていません。「外注業者を管理」から追加してください。</p>
                  ) : (
                    <div style={styles.staffGrid}>
                      {subcontractors.map((sub) => (
                        <button
                          key={sub.id}
                          style={{
                            ...styles.staffChip,
                            background: form.assignees.includes(sub.name) ? "#7c3aed" : "#f3f4f6",
                            color: form.assignees.includes(sub.name) ? "#fff" : "#374151",
                            border: `2px solid ${form.assignees.includes(sub.name) ? "#7c3aed" : "#e5e7eb"}`,
                          }}
                          onClick={() => toggleSub(sub.name)}
                        >
                          {sub.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <label style={styles.label}>案件（任意）</label>
              <select
                style={styles.input}
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              >
                <option value="">― 案件を選択 ―</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <label style={styles.label}>場所（任意）</label>
              <input
                style={styles.input}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="例：〇〇マンション 305号室"
              />

              <label style={styles.label}>メモ（任意）</label>
              <textarea
                style={{ ...styles.input, height: 72, resize: "vertical" }}
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                placeholder="備考など"
              />
            </div>

            <div style={styles.modalFooter}>
              {editItem && (
                <button style={styles.deleteBtn} onClick={() => { handleDelete(editItem.id); setShowModal(false); }}>削除</button>
              )}
              <button style={styles.cancelBtn} onClick={() => setShowModal(false)}>キャンセル</button>
              <button style={styles.saveBtn} onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 外注業者管理モーダル */}
      {showSubModal && (
        <div style={styles.overlay} onClick={() => setShowSubModal(false)}>
          <div style={{ ...styles.modal, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>🏢 外注業者を管理</span>
              <button style={styles.closeBtn} onClick={() => setShowSubModal(false)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="業者名を入力"
                  onKeyDown={(e) => e.key === "Enter" && addSubcontractor()}
                />
                <button style={styles.saveBtn} onClick={addSubcontractor}>追加</button>
              </div>
              {subcontractors.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13 }}>まだ登録がありません</p>
              ) : (
                subcontractors.map((sub) => (
                  <div key={sub.id} style={styles.subRow}>
                    <span style={styles.subName}>{sub.name}</span>
                    <button style={styles.subDeleteBtn} onClick={() => deleteSubcontractor(sub.id)}>削除</button>
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

const styles = {
  outer: { display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif" },
  sidebar: { width: 220, minWidth: 220, background: "#1e293b", color: "#e2e8f0", padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 0 },
  backBtn: { marginBottom: 16, padding: "8px 12px", background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", textAlign: "left", width: "100%" },
  sideTitle: { fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 24, letterSpacing: "0.05em" },
  sideSection: { marginBottom: 24 },
  sideSectionTitle: { fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 },
  sideEmpty: { fontSize: 12, color: "#64748b", margin: 0 },
  sideItem: { paddingLeft: 8, marginBottom: 8, borderRadius: 4 },
  sideItemTime: { fontSize: 11, color: "#94a3b8" },
  sideItemTitle: { fontSize: 13, color: "#e2e8f0", fontWeight: 500 },
  sideItemSub: { fontSize: 11, color: "#64748b" },
  legendRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  legendDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  legendLabel: { fontSize: 12, color: "#cbd5e1" },
  subBtn: { marginTop: "auto", padding: "10px 12px", background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", textAlign: "left" },
  main: { flex: 1, padding: "20px 16px", overflowX: "auto" },
  mobileHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 0" },
  mobileBackBtn: { padding: "6px 12px", background: "#f1f5f9", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#374151", fontWeight: 600 },
  mobileTitle: { flex: 1, fontSize: 15, fontWeight: 700, color: "#1e293b" },
  mobileSubBtn: { padding: "6px 10px", background: "#f1f5f9", border: "none", borderRadius: 8, fontSize: 16, cursor: "pointer" },
  navBar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  navBtn: { padding: "6px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, cursor: "pointer", color: "#374151" },
  todayBtn: { padding: "6px 14px", background: "#2563eb", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", color: "#fff", fontWeight: 600 },
  weekLabel: { fontSize: 14, fontWeight: 600, color: "#1e293b", flex: 1, textAlign: "center" },
  addBtn: { padding: "6px 16px", background: "#16a34a", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", color: "#fff", fontWeight: 600 },
  loading: { textAlign: "center", padding: 40, color: "#94a3b8" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, minWidth: 700 },
  dayCol: { borderRadius: 10, border: "1px solid #e2e8f0", minHeight: 200, overflow: "hidden" },
  dayHeader: { display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 4px", borderBottom: "1px solid #e2e8f0" },
  dayNum: { fontSize: 18, fontWeight: 700, lineHeight: 1.2 },
  dayName: { fontSize: 11, fontWeight: 500, opacity: 0.8 },
  eventList: { padding: "6px 4px", display: "flex", flexDirection: "column", gap: 4 },
  eventChip: { borderRadius: 6, padding: "5px 7px", cursor: "pointer", transition: "opacity 0.15s" },
  eventTime: { fontSize: 10, color: "rgba(255,255,255,0.85)", fontWeight: 500 },
  eventTitle: { fontSize: 12, color: "#fff", fontWeight: 600, lineHeight: 1.3, wordBreak: "break-all" },
  eventAssignee: { fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 1 },
  dayAddBtn: { width: "100%", padding: "4px 0", background: "transparent", border: "1px dashed #cbd5e1", borderRadius: 6, fontSize: 16, color: "#94a3b8", cursor: "pointer", marginTop: 2 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid #f1f5f9" },
  modalTitle: { fontSize: 17, fontWeight: 700, color: "#1e293b" },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8", padding: "4px 8px" },
  modalBody: { flex: 1, overflowY: "auto", padding: "16px 20px" },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid #f1f5f9" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4, marginTop: 12, letterSpacing: "0.05em" },
  input: { width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, color: "#1e293b", background: "#f8fafc", boxSizing: "border-box", outline: "none", marginBottom: 0 },
  checkRow: { display: "flex", alignItems: "center", fontSize: 14, color: "#374151", marginTop: 12, cursor: "pointer" },
  catGrid: { display: "flex", flexWrap: "wrap", gap: 6 },
  catChip: { padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" },
  staffGrid: { display: "flex", flexWrap: "wrap", gap: 6 },
  staffChip: { padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" },
  outsourceToggle: { marginTop: 12, padding: "6px 0", background: "none", border: "none", color: "#7c3aed", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" },
  outsourceBox: { background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "10px 12px", marginTop: 4 },
  saveBtn: { padding: "9px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  cancelBtn: { padding: "9px 16px", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" },
  deleteBtn: { padding: "9px 16px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", marginRight: "auto" },
  subRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" },
  subName: { fontSize: 14, color: "#1e293b" },
  subDeleteBtn: { padding: "4px 10px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" },
};