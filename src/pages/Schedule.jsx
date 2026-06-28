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

function getMonthDates(baseDate) {
  // 月の1日〜末日＋前後の余白（月〜日始まり）
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // 月曜起点に合わせる
  const startOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - startOffset);
  const endOffset = (7 - lastDay.getDay()) % 7 === 0 ? 0 : (7 - lastDay.getDay()) % 7;
  const end = new Date(lastDay);
  end.setDate(lastDay.getDate() + endOffset);
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isSameDay(a, b) {
  return toDateStr(a) === toDateStr(b);
}

function buildISO(dateStr, h, m) {
  if (!dateStr) return null;
  const hour = h === "" ? "00" : String(h).padStart(2, "0");
  const min = m || "00";
  const d = new Date(`${dateStr}T${hour}:${min}:00`);
  return d.toISOString();
}

export default function Schedule({ nav }) {
  const [today] = useState(new Date());
  const [baseDate, setBaseDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("week"); // "week" or "month"

  const weekDates = getWeekDates(baseDate);
  const monthDates = getMonthDates(baseDate);

  const [schedules, setSchedules] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [newSubName, setNewSubName] = useState("");

  const [customMembers, setCustomMembers] = useState([]);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");

  const emptyForm = {
    title: "",
    start_date: toDateStr(new Date()),
    start_h: "", start_m: "00",
    end_h: "", end_m: "00",
    all_day: false,
    category: "現調",
    recorder: "",
    contractors: [],
    memo: "",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: sc }, { data: sub }, { data: hs }] = await Promise.all([
      supabase.from("schedules").select("*").order("start_at"),
      supabase.from("subcontractors").select("*").order("name"),
      supabase.from("home_settings").select("*").eq("id", "schedule_members"),
    ]);
    setSchedules(sc || []);
    setSubcontractors(sub || []);
    if (hs && hs[0]?.value) setCustomMembers(hs[0].value);
    setLoading(false);
  }

  async function saveMembers(list) {
    setCustomMembers(list);
    await supabase.from("home_settings").upsert({ id: "schedule_members", value: list });
  }

  async function handleSave() {
    if (!form.title.trim() || !form.start_date) { alert("タイトルと日付は必須です"); return; }
    const start_at = buildISO(form.start_date, form.start_h, form.start_m);
    const end_at = form.end_h !== "" ? buildISO(form.start_date, form.end_h, form.end_m) : null;
    const payload = {
      title: form.title.trim(), start_at, end_at, all_day: form.all_day,
      category: form.category, color: getCategoryColor(form.category),
      assignees: form.recorder ? [form.recorder] : [],
      memo: form.memo,
      location: form.contractors.length > 0 ? `対応：${form.contractors.join("・")}` : "",
    };
    if (editItem) { await supabase.from("schedules").update(payload).eq("id", editItem.id); }
    else { await supabase.from("schedules").insert([payload]); }
    setShowModal(false); setEditItem(null); setForm(emptyForm); fetchAll();
  }

  async function handleDelete(id) {
    if (!confirm("この予定を削除しますか？")) return;
    await supabase.from("schedules").delete().eq("id", id);
    setShowModal(false); fetchAll();
  }

  async function addSubcontractor() {
    if (!newSubName.trim()) return;
    await supabase.from("subcontractors").insert([{ name: newSubName.trim() }]);
    setNewSubName("");
    const { data } = await supabase.from("subcontractors").select("*").order("name");
    setSubcontractors(data || []);
  }

  async function deleteSubcontractor(id) {
    if (!confirm("削除しますか？")) return;
    await supabase.from("subcontractors").delete().eq("id", id);
    const { data } = await supabase.from("subcontractors").select("*").order("name");
    setSubcontractors(data || []);
  }

  function openNew(date) {
    setForm({ ...emptyForm, start_date: toDateStr(date) });
    setEditItem(null); setShowModal(true);
  }

  function openEdit(sc) {
    const startD = new Date(sc.start_at);
    const endD = sc.end_at ? new Date(sc.end_at) : null;
    const contractors = sc.location?.startsWith("対応：")
      ? sc.location.replace("対応：", "").split("・").filter(Boolean) : [];
    setForm({
      title: sc.title, start_date: toDateStr(startD),
      start_h: sc.all_day ? "" : String(startD.getHours()),
      start_m: sc.all_day ? "00" : (startD.getMinutes() >= 30 ? "30" : "00"),
      end_h: endD ? String(endD.getHours()) : "",
      end_m: endD ? (endD.getMinutes() >= 30 ? "30" : "00") : "00",
      all_day: sc.all_day || false, category: sc.category || "現調",
      recorder: sc.assignees?.[0] || "", contractors, memo: sc.memo || "",
    });
    setEditItem(sc); setShowModal(true);
  }

  function toggleContractor(name) {
    setForm((f) => ({
      ...f,
      contractors: f.contractors.includes(name)
        ? f.contractors.filter((a) => a !== name)
        : [...f.contractors, name],
    }));
  }

  function getSchedulesForDay(date) {
    return schedules.filter((sc) => isSameDay(new Date(sc.start_at), date));
  }

  // 週ナビ
  function prevWeek() { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); }
  function nextWeek() { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); }
  // 月ナビ
  function prevMonth() { const d = new Date(baseDate); d.setMonth(d.getMonth() - 1); setBaseDate(d); }
  function nextMonth() { const d = new Date(baseDate); d.setMonth(d.getMonth() + 1); setBaseDate(d); }
  function goToday() { setBaseDate(new Date()); }

  const weekLabel = `${weekDates[0].getFullYear()}年${weekDates[0].getMonth()+1}月${weekDates[0].getDate()}日 〜 ${weekDates[6].getMonth()+1}月${weekDates[6].getDate()}日`;
  const monthLabel = `${baseDate.getFullYear()}年${baseDate.getMonth()+1}月`;

  const allMembers = [...STAFF, ...customMembers.filter(m => !STAFF.includes(m))];

  // 予定チップ（共通）
  const ScChip = ({ sc }) => (
    <div onClick={() => openEdit(sc)} style={{
      background: getCategoryColor(sc.category) + "22",
      borderLeft: `3px solid ${getCategoryColor(sc.category)}`,
      borderRadius: 3, padding: "2px 3px", marginBottom: 2, cursor: "pointer", fontSize: 10,
    }}>
      {!sc.all_day && (
        <div style={{ color: "#555", fontWeight: 600, fontSize: 9 }}>
          {formatTime(sc.start_at)}{sc.end_at ? `-${formatTime(sc.end_at)}` : ""}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
        <span style={{ background: getCategoryColor(sc.category), color: "#fff", borderRadius: 2, padding: "0 3px", fontSize: 9, fontWeight: 700, flexShrink: 0, lineHeight: 1.6 }}>
          {sc.category}
        </span>
        <span style={{ color: "#1f2937", fontWeight: 600, fontSize: 10, wordBreak: "break-all", lineHeight: 1.4 }}>{sc.title}</span>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#f5f5f5", minHeight: "100vh", maxWidth: "100vw", overflowX: "hidden" }}>

      {/* ヘッダー */}
      <div style={{ background: "#1a56a0", color: "#fff", padding: "0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 48 }}>
          <button onClick={() => nav && nav("home")} style={headerBtnStyle}>← 戻る</button>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>📅 スケジュール</span>
          <button onClick={() => openNew(today)} style={{ ...headerBtnStyle, background: "#fff", color: "#1a56a0", fontWeight: 700 }}>＋ 追加</button>
          <button onClick={() => setShowSubModal(true)} style={headerBtnStyle}>🏢</button>
        </div>
      </div>

      {/* ナビバー */}
      <div style={{ background: "#fff", borderBottom: "1px solid #ddd", padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={viewMode === "week" ? prevWeek : prevMonth} style={navBtnStyle}>◀ {viewMode === "week" ? "前週" : "前月"}</button>
        <button onClick={goToday} style={{ ...navBtnStyle, background: "#1a56a0", color: "#fff", border: "none" }}>今日</button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: "#333" }}>
          {viewMode === "week" ? weekLabel : monthLabel}
        </span>
        <button onClick={viewMode === "week" ? nextWeek : nextMonth} style={navBtnStyle}>{viewMode === "week" ? "次週" : "次月"} ▶</button>
        {/* 週/月切替 */}
        <div style={{ display: "flex", border: "1px solid #ccc", borderRadius: 4, overflow: "hidden", marginLeft: 4 }}>
          <button onClick={() => setViewMode("week")}
            style={{ padding: "4px 8px", fontSize: 11, border: "none", cursor: "pointer", background: viewMode === "week" ? "#1a56a0" : "#fff", color: viewMode === "week" ? "#fff" : "#333", fontWeight: viewMode === "week" ? 700 : 400 }}>週</button>
          <button onClick={() => setViewMode("month")}
            style={{ padding: "4px 8px", fontSize: 11, border: "none", cursor: "pointer", background: viewMode === "month" ? "#1a56a0" : "#fff", color: viewMode === "month" ? "#fff" : "#333", fontWeight: viewMode === "month" ? 700 : 400 }}>月</button>
        </div>
      </div>

      {/* カレンダー本体 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>読み込み中...</div>
      ) : viewMode === "week" ? (
        /* ===== 週表示 ===== */
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse", background: "#fff", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {weekDates.map((date, i) => {
                  const isToday = isSameDay(date, today);
                  const isSun = date.getDay() === 0;
                  const isSat = date.getDay() === 6;
                  return (
                    <th key={i} style={{ border: "1px solid #ddd", padding: "5px 2px", textAlign: "center", background: isToday ? "#dbeafe" : "#f0f4f8", color: isSun ? "#dc2626" : isSat ? "#2563eb" : "#333", fontSize: 11, fontWeight: 700, width: "14.28%" }}>
                      <div>{date.getMonth()+1}/{date.getDate()}</div>
                      <div>({DAYS_JP[date.getDay()]})</div>
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
                    <td key={i} style={{ border: "1px solid #ddd", verticalAlign: "top", padding: "3px 2px", background: isToday ? "#eff6ff" : "#fff" }}>
                      {daySchedules.map((sc) => <ScChip key={sc.id} sc={sc} />)}
                      <button onClick={() => openNew(date)} style={{ width: "100%", background: "none", border: "1px dashed #ccc", borderRadius: 3, color: "#bbb", fontSize: 14, padding: "1px 0", cursor: "pointer", marginTop: 1 }}>＋</button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        /* ===== 月表示 ===== */
        <div>
          {/* 曜日ヘッダー */}
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#f0f4f8", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {["月","火","水","木","金","土","日"].map((d, i) => (
                  <th key={i} style={{ border: "1px solid #ddd", padding: "4px 2px", textAlign: "center", fontSize: 11, fontWeight: 700, color: i === 5 ? "#2563eb" : i === 6 ? "#dc2626" : "#333", width: "14.28%" }}>{d}</th>
                ))}
              </tr>
            </thead>
          </table>
          {/* 日付グリッド（縦スクロール） */}
          <div style={{ overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", tableLayout: "fixed" }}>
              <tbody>
                {Array.from({ length: monthDates.length / 7 }, (_, weekIdx) => (
                  <tr key={weekIdx}>
                    {monthDates.slice(weekIdx * 7, weekIdx * 7 + 7).map((date, i) => {
                      const isToday = isSameDay(date, today);
                      const isCurrentMonth = date.getMonth() === baseDate.getMonth();
                      const isSun = date.getDay() === 0;
                      const isSat = date.getDay() === 6;
                      const daySchedules = getSchedulesForDay(date);
                      return (
                        <td key={i} style={{ border: "1px solid #ddd", verticalAlign: "top", padding: "2px 2px", minHeight: 80, background: isToday ? "#eff6ff" : !isCurrentMonth ? "#fafafa" : "#fff", width: "14.28%" }}>
                          {/* 日付番号 */}
                          <div style={{ textAlign: "center", marginBottom: 2 }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 20, height: 20, borderRadius: "50%",
                              background: isToday ? "#1a56a0" : "transparent",
                              fontSize: 11, fontWeight: 700,
                              color: isToday ? "#fff" : !isCurrentMonth ? "#ccc" : isSun ? "#dc2626" : isSat ? "#2563eb" : "#333",
                            }}>{date.getDate()}</span>
                          </div>
                          {/* 予定 */}
                          {daySchedules.map((sc) => <ScChip key={sc.id} sc={sc} />)}
                          <button onClick={() => openNew(date)} style={{ width: "100%", background: "none", border: "1px dashed #e2e8f0", borderRadius: 3, color: "#cbd5e1", fontSize: 12, padding: "1px 0", cursor: "pointer", marginTop: 1 }}>＋</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 予定登録・編集モーダル */}
      {showModal && (
        <div style={overlayStyle} onClick={() => setShowModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#1a56a0", color: "#fff", padding: "12px 16px", borderRadius: "12px 12px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>予定の登録</span>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* 日付 */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>日付</div>
                <div style={rowValueStyle}>
                  <input type="date" value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    style={inputStyle} />
                </div>
              </div>

              {/* 時刻（開始を1行目・終了を2行目に） */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>時刻</div>
                <div style={rowValueStyle}>
                  {/* 1行目：開始時刻 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                    <select style={selStyle} value={form.start_h} onChange={(e) => setForm({ ...form, start_h: e.target.value })}>
                      <option value="">--時</option>
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={String(i)}>{i}時</option>)}
                    </select>
                    <select style={{ ...selStyle, minWidth: 64 }} value={form.start_m}
                      onChange={(e) => setForm({ ...form, start_m: e.target.value })}
                      disabled={form.start_h === ""}>
                      <option value="00">00分</option>
                      <option value="30">30分</option>
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginLeft: 4, color: "#555" }}>
                      <input type="checkbox" checked={form.all_day}
                        onChange={(e) => setForm({ ...form, all_day: e.target.checked, start_h: "", end_h: "" })} />
                      終日
                    </label>
                  </div>
                  {/* 2行目：終了時刻 */}
                  {!form.all_day && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "#888", marginRight: 2 }}>〜</span>
                      <select style={selStyle} value={form.end_h} onChange={(e) => setForm({ ...form, end_h: e.target.value })}>
                        <option value="">--時</option>
                        {Array.from({ length: 24 }, (_, i) => <option key={i} value={String(i)}>{i}時</option>)}
                      </select>
                      <select style={{ ...selStyle, minWidth: 64 }} value={form.end_m}
                        onChange={(e) => setForm({ ...form, end_m: e.target.value })}
                        disabled={form.end_h === ""}>
                        <option value="00">00分</option>
                        <option value="30">30分</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* 予定（カテゴリ＋タイトル） */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>予定</div>
                <div style={{ ...rowValueStyle, display: "flex", gap: 6 }}>
                  <select style={{ ...selStyle, width: 100 }} value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                  </select>
                  <input style={{ ...inputStyle, flex: 1 }} value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="内容" />
                </div>
              </div>

              {/* メモ */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>メモ</div>
                <div style={rowValueStyle}>
                  <textarea style={{ ...inputStyle, height: 56, resize: "vertical" }} value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                    placeholder="備考など" />
                </div>
              </div>

              {/* 記入者 */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>記入者</div>
                <div style={rowValueStyle}>
                  <select style={{ ...inputStyle, marginBottom: 8 }} value={form.recorder}
                    onChange={(e) => setForm({ ...form, recorder: e.target.value })}>
                    <option value="">― 選択 ―</option>
                    {allMembers.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button onClick={() => setShowMemberModal(true)}
                    style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 600 }}>
                    ＋ 名前を追加・管理
                  </button>
                </div>
              </div>

              {/* 対応予定業者 */}
              <div style={rowStyle}>
                <div style={rowLabelStyle}>対応予定業者</div>
                <div style={rowValueStyle}>
                  {subcontractors.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 4px" }}>業者が登録されていません</p>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      {subcontractors.map((sub) => (
                        <button key={sub.id} onClick={() => toggleContractor(sub.name)}
                          style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: `2px solid ${form.contractors.includes(sub.name) ? "#9333ea" : "#e5e7eb"}`,
                            background: form.contractors.includes(sub.name) ? "#9333ea" : "#f3f4f6",
                            color: form.contractors.includes(sub.name) ? "#fff" : "#374151" }}>
                          {sub.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setShowSubModal(true)}
                    style={{ background: "none", border: "none", color: "#9333ea", fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 600 }}>
                    ＋ 業者を追加・管理
                  </button>
                </div>
              </div>
            </div>

            {/* フッター */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid #eee", flexShrink: 0 }}>
              {editItem && (
                <button onClick={() => handleDelete(editItem.id)}
                  style={{ padding: "8px 14px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", marginRight: "auto" }}>
                  削除
                </button>
              )}
              <button onClick={() => setShowModal(false)}
                style={{ padding: "8px 14px", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
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

      {/* 対応予定業者管理 */}
      {showSubModal && (
        <div style={overlayStyle} onClick={() => setShowSubModal(false)}>
          <div style={{ ...modalStyle, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#1a56a0", color: "#fff", padding: "12px 16px", borderRadius: "12px 12px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>🏢 対応予定業者を管理</span>
              <button onClick={() => setShowSubModal(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 16, overflowY: "auto", maxHeight: "60vh" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input style={{ ...inputStyle, flex: 1 }} value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)} placeholder="業者名を入力"
                  onKeyDown={(e) => e.key === "Enter" && addSubcontractor()} />
                <button onClick={addSubcontractor}
                  style={{ padding: "8px 14px", background: "#1a56a0", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>追加</button>
              </div>
              {subcontractors.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>まだ登録がありません</p>
                : subcontractors.map((sub) => (
                  <div key={sub.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 14 }}>{sub.name}</span>
                    <button onClick={() => deleteSubcontractor(sub.id)}
                      style={{ padding: "4px 10px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>削除</button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 記入者管理 */}
      {showMemberModal && (
        <div style={overlayStyle} onClick={() => setShowMemberModal(false)}>
          <div style={{ ...modalStyle, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#2563eb", color: "#fff", padding: "12px 16px", borderRadius: "12px 12px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>👤 記入者を管理</span>
              <button onClick={() => setShowMemberModal(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 16, overflowY: "auto", maxHeight: "60vh" }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>固定スタッフ（変更不可）</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STAFF.map(s => <span key={s} style={{ padding: "4px 10px", background: "#e0e7ff", borderRadius: 20, fontSize: 12, color: "#3730a3" }}>{s}</span>)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>追加した名前</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input style={{ ...inputStyle, flex: 1 }} value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)} placeholder="名前を入力"
                  onKeyDown={(e) => { if (e.key === "Enter" && newMemberName.trim()) { saveMembers([...customMembers, newMemberName.trim()]); setNewMemberName(""); } }} />
                <button onClick={() => { if (!newMemberName.trim()) return; saveMembers([...customMembers, newMemberName.trim()]); setNewMemberName(""); }}
                  style={{ padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>追加</button>
              </div>
              {customMembers.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>まだ追加していません</p>
                : customMembers.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 14 }}>{m}</span>
                    <button onClick={() => saveMembers(customMembers.filter((_, j) => j !== i))}
                      style={{ padding: "4px 10px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>削除</button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const headerBtnStyle = { background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, padding: "5px 11px", fontSize: 13, cursor: "pointer" };
const navBtnStyle = { padding: "5px 10px", background: "#fff", border: "1px solid #ccc", borderRadius: 4, fontSize: 12, cursor: "pointer", color: "#333", whiteSpace: "nowrap" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 };
const modalStyle = { background: "#fff", borderRadius: 12, width: "100%", maxWidth: 500, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" };
const rowStyle = { display: "flex", alignItems: "flex-start", borderBottom: "1px solid #eee", padding: "10px 16px", gap: 8 };
const rowLabelStyle = { width: 64, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "#555", paddingTop: 7 };
const rowValueStyle = { flex: 1, minWidth: 0 };
const inputStyle = { width: "100%", padding: "7px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, color: "#1e293b", background: "#fff", boxSizing: "border-box", outline: "none" };
const selStyle = { padding: "7px 4px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, color: "#1e293b", background: "#fff", outline: "none", cursor: "pointer", minWidth: 72 };