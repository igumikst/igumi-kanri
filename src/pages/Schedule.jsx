import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const STAFF = ["崎岡", "後藤", "赤岡", "上村", "綱島", "伊藤"];

const CATEGORIES = [
  { label: "現調", color: "#3b82f6" },
  { label: "調査", color: "#22c55e" },
  { label: "工事", color: "#a78bfa" },
  { label: "打ち合わせ", color: "#06b6d4" },
  { label: "緊急当番", color: "#ef4444" },
  { label: "事務", color: "#94a3b8" },
  { label: "外出", color: "#a16207" },
  { label: "他社", color: "#c4a484" },
  { label: "休み", color: "#f87171" },
  { label: "その他", color: "#e879f9" },
  { label: "サイボウズ", color: "#0F766E" },
];

const getCategoryColor = (label) =>
  CATEGORIES.find((c) => c.label === label)?.color || "#6b7280";

const DAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];
const CAT_PREFIXES = ["現調", "調査", "工事", "報告済", "打ち合わせ", "打合せ", "緊急当番", "緊急", "事務", "外出", "他社", "休み", "その他"];

function toJstDateKey(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** サイボウズ風: 選択日から7日間 */
function getWeekDates(baseDate) {
  const start = new Date(baseDate);
  start.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(start);
    nd.setDate(start.getDate() + i);
    return nd;
  });
}

/** 「調査:物件名 担当」→ { category, title, sub } */
function parseEventDisplay(sc) {
  const raw = String(sc.title || "").trim();
  let category = sc.category || "その他";
  let rest = raw;

  for (const p of CAT_PREFIXES) {
    if (raw.startsWith(p + ":") || raw.startsWith(p + "：")) {
      category = p === "報告済" ? "工事" : p === "緊急" ? "緊急当番" : p === "打合せ" ? "打ち合わせ" : p;
      rest = raw.slice(p.length + 1).trim();
      break;
    }
  }

  // 末尾の担当者っぽい語を分離（空白区切りの最後）
  let title = rest;
  let sub = sc.assignees?.[0] || "";
  if (!sub) {
    const parts = rest.split(/[\s　]+/).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (last.length <= 8 && !/\d/.test(last)) {
        sub = last;
        title = parts.slice(0, -1).join(" ");
      }
    }
  }
  if (sc.location?.startsWith("対応：") && !sub) {
    sub = sc.location.replace("対応：", "");
  }
  return { category, title: title || raw, sub };
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
  if (Number.isNaN(d.getTime())) return "";
  // サイボウズ風: JST・時はゼロ埋めしない（9:00）
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo", hour: "numeric", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value?.replace(/^0/, "") || "0";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  return `${h}:${m}`;
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
  const [cybozuEvents, setCybozuEvents] = useState([]);
  const [cybozuError, setCybozuError] = useState("");
  const [subcontractors, setSubcontractors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [cybozuDetail, setCybozuDetail] = useState(null);
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
    setCybozuError("");
    const [{ data: sc }, { data: sub }, { data: hs }, cybozuRes] = await Promise.all([
      supabase.from("schedules").select("*").order("start_at"),
      supabase.from("subcontractors").select("*").order("name"),
      supabase.from("home_settings").select("*").eq("id", "schedule_members"),
      fetch("/api/cybozu-calendar").then(r => r.json()).catch(() => ({ events: [], error: "fetch failed" })),
    ]);
    setSchedules(sc || []);
    setSubcontractors(sub || []);
    if (hs && hs[0]?.value) setCustomMembers(hs[0].value);
    setCybozuEvents(Array.isArray(cybozuRes?.events) ? cybozuRes.events : []);
    if (cybozuRes?.error && !(cybozuRes.events?.length)) setCybozuError("サイボウズ予定の取得に失敗しました");
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
    if (sc?.source === "cybozu" || sc?.readonly) {
      setCybozuDetail(sc);
      return;
    }
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
    const key = toJstDateKey(date);
    const local = schedules.filter((sc) => toJstDateKey(sc.start_at) === key);
    const remote = cybozuEvents.filter((sc) => (sc.date_key || toJstDateKey(sc.start_at)) === key);
    return [...local, ...remote].sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  }

  // 週ナビ（選択日から7日）
  function prevWeek() { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); }
  function nextWeek() { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); }
  function prevDay() { const d = new Date(baseDate); d.setDate(d.getDate() - 1); setBaseDate(d); }
  function nextDay() { const d = new Date(baseDate); d.setDate(d.getDate() + 1); setBaseDate(d); }
  // 月ナビ
  function prevMonth() { const d = new Date(baseDate); d.setMonth(d.getMonth() - 1); setBaseDate(d); }
  function nextMonth() { const d = new Date(baseDate); d.setMonth(d.getMonth() + 1); setBaseDate(d); }
  function goToday() { setBaseDate(new Date()); }

  const weekLabel = `${baseDate.getFullYear()}年 ${baseDate.getMonth()+1}月 ${baseDate.getDate()}日 (${DAYS_JP[baseDate.getDay()]})`;
  const monthLabel = `${baseDate.getFullYear()}年${baseDate.getMonth()+1}月`;

  const allMembers = [...STAFF, ...customMembers.filter(m => !STAFF.includes(m))];

  // サイボウズ風の予定行（時刻 → カテゴリ＋青リンク → 担当）
  const ScChip = ({ sc }) => {
    const { category, title, sub } = parseEventDisplay(sc);
    const color = getCategoryColor(category);
    const timeLabel = sc.all_day
      ? "終日"
      : `${formatTime(sc.start_at)}${sc.end_at ? `-${formatTime(sc.end_at)}` : ""}`;
    return (
      <div
        onClick={() => openEdit(sc)}
        style={{
          borderBottom: "1px solid #e8e8e8",
          padding: "4px 4px 5px",
          cursor: "pointer",
          background: category === "休み" ? "#fff1f2" : "transparent",
        }}
      >
        <div style={{ fontSize: 10, color: "#222", fontWeight: 600, marginBottom: 2, lineHeight: 1.2 }}>
          {timeLabel}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 3, flexWrap: "wrap" }}>
          <span style={{
            background: color, color: "#fff", borderRadius: 2,
            padding: "0 4px", fontSize: 9, fontWeight: 800, flexShrink: 0, lineHeight: 1.55,
          }}>
            {category}
          </span>
          <span style={{
            color: "#2563eb", fontWeight: 700, fontSize: 10, lineHeight: 1.35,
            textDecoration: "underline", textUnderlineOffset: 2, wordBreak: "break-all",
          }}>
            {title}
          </span>
        </div>
        {sub ? (
          <div style={{ fontSize: 9, color: "#555", marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#f5f5f5", minHeight: "100vh", maxWidth: "100vw", overflowX: "hidden" }}>

      {/* ヘッダー */}
      <div style={{ background: "#1a56a0", color: "#fff", padding: "0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 48 }}>
          <button onClick={() => nav && nav("home")} style={headerBtnStyle}>← 戻る</button>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>📅 スケジュール</span>
          <button onClick={() => openNew(today)} style={{ ...headerBtnStyle, background: "#fff", color: "#1a56a0", fontWeight: 700 }}>＋ 追加</button>
          <button onClick={fetchAll} style={headerBtnStyle} title="再読み込み">🔄</button>
          <button onClick={() => setShowSubModal(true)} style={headerBtnStyle}>🏢</button>
        </div>
      </div>

      {/* サイボウズ連携バナー */}
      <div style={{ background: "#ecfdf5", borderBottom: "1px solid #a7f3d0", padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#065f46" }}>
        <span style={{ fontWeight: 800 }}>サイボウズ連携中</span>
        <span style={{ flex: 1 }}>{cybozuError ? cybozuError : `${cybozuEvents.length}件の予定を表示`}</span>
        <a href="https://product-pro.cybozu.com/o/" target="_blank" rel="noreferrer" style={{ color: "#0F766E", fontWeight: 700, textDecoration: "none" }}>Officeを開く →</a>
      </div>

      {/* ナビバー（サイボウズ風） */}
      <div style={{ background: "#fff", borderBottom: "1px solid #d1d5db", padding: "8px 10px", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", marginRight: 4 }}>📅 {viewMode === "week" ? weekLabel : monthLabel}</span>
        <span style={{ flex: 1 }} />
        {viewMode === "week" ? (
          <>
            <button onClick={prevWeek} style={navBtnStyle}>前週</button>
            <button onClick={prevDay} style={navBtnStyle}>前日</button>
            <button onClick={goToday} style={{ ...navBtnStyle, background: "#1a56a0", color: "#fff", border: "none" }}>今日</button>
            <button onClick={nextDay} style={navBtnStyle}>翌日</button>
            <button onClick={nextWeek} style={navBtnStyle}>翌週</button>
          </>
        ) : (
          <>
            <button onClick={prevMonth} style={navBtnStyle}>前月</button>
            <button onClick={goToday} style={{ ...navBtnStyle, background: "#1a56a0", color: "#fff", border: "none" }}>今日</button>
            <button onClick={nextMonth} style={navBtnStyle}>翌月</button>
          </>
        )}
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
        /* ===== 週表示（サイボウズ風） ===== */
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", background: "#fff" }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {weekDates.map((date, i) => {
                  const isToday = isSameDay(date, today);
                  const isSun = date.getDay() === 0;
                  const isSat = date.getDay() === 6;
                  return (
                    <th key={i} style={{
                      border: "1px solid #d1d5db",
                      padding: "8px 2px",
                      textAlign: "center",
                      background: isSun ? "#fff1f2" : isSat ? "#eff6ff" : isToday ? "#f8fafc" : "#f3f4f6",
                      color: isSun ? "#dc2626" : isSat ? "#2563eb" : "#374151",
                      fontSize: 12,
                      fontWeight: 700,
                      width: "14.28%",
                    }}>
                      {date.getDate()} ({DAYS_JP[date.getDay()]})
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                {weekDates.map((date, i) => {
                  const isSun = date.getDay() === 0;
                  const isSat = date.getDay() === 6;
                  const daySchedules = getSchedulesForDay(date);
                  return (
                    <td key={i} style={{
                      border: "1px solid #d1d5db",
                      verticalAlign: "top",
                      padding: 0,
                      background: isSun ? "#fff5f5" : isSat ? "#f0f7ff" : "#fff",
                      minHeight: 280,
                    }}>
                      <div style={{ minHeight: 280, display: "flex", flexDirection: "column" }}>
                        <div style={{ flex: 1 }}>
                          {daySchedules.map((sc) => <ScChip key={sc.id} sc={sc} />)}
                        </div>
                        <button
                          onClick={() => openNew(date)}
                          style={{
                            width: "100%", background: "none", border: "none", borderTop: "1px solid #e8e8e8",
                            color: "#22c55e", fontSize: 18, padding: "4px 0", cursor: "pointer", fontWeight: 700,
                            lineHeight: 1,
                          }}
                          title="予定を追加"
                        >
                          ＋
                        </button>
                      </div>
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

      {/* サイボウズ予定詳細（読み取り専用） */}
      {cybozuDetail && (
        <div style={overlayStyle} onClick={() => setCybozuDetail(null)}>
          <div style={{ ...modalStyle, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#0F766E", color: "#fff", padding: "12px 16px", borderRadius: "12px 12px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>サイボウズの予定</span>
              <button onClick={() => setCybozuDetail(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1f2937", marginBottom: 10, lineHeight: 1.4 }}>{cybozuDetail.title}</div>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                🗓 {toJstDateKey(cybozuDetail.start_at)}
                {!cybozuDetail.all_day && (
                  <span> {formatTime(cybozuDetail.start_at)}{cybozuDetail.end_at ? `〜${formatTime(cybozuDetail.end_at)}` : ""}</span>
                )}
                {cybozuDetail.all_day && <span>（終日）</span>}
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ background: getCategoryColor(cybozuDetail.category), color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                  {cybozuDetail.category}
                </span>
              </div>
              {cybozuDetail.memo && (
                <div style={{ fontSize: 12, color: "#4b5563", background: "#f8fafc", borderRadius: 8, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 14, lineHeight: 1.6 }}>
                  {cybozuDetail.memo}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {cybozuDetail.external_url && (
                  <a href={cybozuDetail.external_url} target="_blank" rel="noreferrer"
                    style={{ padding: "8px 14px", background: "#0F766E", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                    サイボウズで開く
                  </a>
                )}
                <button onClick={() => setCybozuDetail(null)}
                  style={{ padding: "8px 14px", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                  閉じる
                </button>
              </div>
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