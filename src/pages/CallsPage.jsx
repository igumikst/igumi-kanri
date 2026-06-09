import { useState } from "react";
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

export default function CallsPage({ cust, isPC, pp, nav, calls, setCalls }) {
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState("すべて");

  const filtered = filterStatus === "すべて"
    ? calls
    : calls.filter(c => c.status === filterStatus);

  const updateStatus = async (id, newStatus) => {
    const { error } = await supabase
      .from("calls")
      .update({ status: newStatus })
      .eq("id", id);
    if (!error) {
      setCalls(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
      if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // 詳細モーダル
  if (selected) return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {/* ヘッダー */}
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
                {label === "緊急度" ? (
                  <span style={{ background: URGENCY_CONFIG[value]?.bg, color: URGENCY_CONFIG[value]?.color, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{value}</span>
                ) : value}
              </div>
            </div>
          ) : null)}
        </div>

        {/* AI要約 */}
        {selected.ai_summary && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 8 }}>🤖 AI要約</div>
            <div style={{ fontSize: 13, color: "#1F2937", lineHeight: 1.7, background: "#F8FAFF", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #2563eb" }}>
              {selected.ai_summary}
            </div>
          </div>
        )}

        {/* 文字起こし全文 */}
        {selected.transcript && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 8 }}>📝 文字起こし全文</div>
            <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.8, background: "#F9FAFB", borderRadius: 10, padding: "12px 14px", whiteSpace: "pre-wrap" }}>
              {selected.transcript}
            </div>
          </div>
        )}

        {/* 録音データ */}
        {selected.recording_url && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 8 }}>🎙 録音データ</div>
            <audio controls src={selected.recording_url} style={{ width: "100%", borderRadius: 8 }} />
          </div>
        )}

        {/* 折返し電話ボタン */}
        {selected.phone_number && (
          <a href={`tel:${selected.phone_number}`}
            style={{ display: "block", background: `linear-gradient(135deg,${cust.c1},${cust.c2})`, color: "#fff", borderRadius: 14, padding: "14px", textAlign: "center", fontWeight: 800, fontSize: 16, textDecoration: "none", boxShadow: "0 4px 12px rgba(37,99,235,0.3)", marginBottom: 14 }}>
            📞 折返し電話をする
          </a>
        )}

      </div>
    </div>
  );

  // 一覧画面
  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {/* ヘッダー */}
      <div style={{ background: `linear-gradient(135deg,${cust.c1},${cust.c2})`, padding: "16px 20px 24px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>← ホーム</button>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>📞 電話受付案件</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>全 {calls.length} 件</div>
          </div>
        </div>

        {/* サマリーバッジ */}
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

        {/* フィルター */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
          {["すべて", "未対応", "対応中", "完了"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{ flexShrink: 0, padding: "6px 16px", borderRadius: 20, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: filterStatus === s ? cust.c1 : "#fff", color: filterStatus === s ? "#fff" : "#6B7280", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              {s}
            </button>
          ))}
        </div>

        {/* 案件リスト */}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{sc.icon} {call.status}</span>
                      {call.urgency && uc && (
                        <span style={{ background: uc.bg, color: uc.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{call.urgency}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{formatDate(call.received_at)}</div>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1F2937", marginBottom: 4 }}>
                    {call.company_name || "会社名不明"} {call.contact_name ? `｜${call.contact_name}` : ""}
                  </div>

                  {call.property_name && (
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                      🏠 {call.property_name}{call.room_number ? ` ${call.room_number}号室` : ""}
                    </div>
                  )}

                  {call.ai_summary && (
                    <div style={{ fontSize: 12, color: "#374151", background: "#F8FAFF", borderRadius: 8, padding: "8px 10px", borderLeft: "3px solid #2563eb", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {call.ai_summary}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, textAlign: "right" }}>
                    {call.case_number} ›
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
