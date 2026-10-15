import { useState } from "react";
import { fetchMergeCounts, mergeProjects, visibleProjects } from "../lib/projectMerge";

// 案件の統合(テーマ32)。案件の詳細画面から開く2ステップのモーダル(統合先を選ぶ→確認して実行)
export default function MergeProjectModal({ supabase, source, pjs, assigneeNames, onClose, onMerged }) {
  const [step, setStep] = useState("pick");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState(null);
  const [counts, setCounts] = useState(null);
  const [performedBy, setPerformedBy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const candidates = visibleProjects(pjs)
    .filter(p => p.id !== source.id)
    .filter(p => !search || p.name.includes(search))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const pickTarget = async p => {
    setTarget(p);
    setError("");
    setLoading(true);
    const c = await fetchMergeCounts(supabase, source.id);
    setCounts(c);
    setLoading(false);
    setStep("confirm");
  };

  const back = () => { setStep("pick"); setTarget(null); setCounts(null); setError(""); };

  const doMerge = async () => {
    setLoading(true);
    setError("");
    const { error: err } = await mergeProjects(supabase, { sourceId: source.id, targetId: target.id, performedBy: performedBy || null });
    setLoading(false);
    if (err) { setError(err.message); return; }
    onMerged(target.id);
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 14 };
  const card = { background: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 440, maxHeight: "86vh", overflowY: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.25)", boxSizing: "border-box" };
  const rowBtn = { width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", marginBottom: 6, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#1F2937" };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#1A3A5C", marginBottom: 12 }}>🔗 他の案件と統合</div>

        {step === "pick" && (
          <>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>「{source.name}」を、選んだ案件に統合します(統合元は一覧から隠れます)</div>
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 統合先の案件名で検索" autoFocus
              style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 14, boxSizing: "border-box", marginBottom: 10 }}
            />
            <div>
              {candidates.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, padding: "10px 0" }}>候補がありません</div>}
              {candidates.slice(0, 50).map(p => (
                <button key={p.id} style={rowBtn} onClick={() => pickTarget(p)} disabled={loading}>{p.name}</button>
              ))}
            </div>
            <button onClick={onClose} style={{ width: "100%", marginTop: 6, padding: "13px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#374151" }}>キャンセル</button>
          </>
        )}

        {step === "confirm" && target && (
          <>
            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 13 }}>
              <div style={{ marginBottom: 6 }}><span style={{ color: "#9CA3AF" }}>統合元(隠れる): </span><b>{source.name}</b></div>
              <div><span style={{ color: "#9CA3AF" }}>統合先(残る): </span><b>{target.name}</b></div>
            </div>
            {loading && !counts ? (
              <div style={{ color: "#9CA3AF", fontSize: 13, padding: "8px 0" }}>件数を確認中...</div>
            ) : counts && (
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 10, lineHeight: 1.7 }}>
                移る件数: 見積 {counts.quotes}件・予定 {counts.schedules}件・報告書 {counts.reports}件・見積ファイル {counts.quoteFiles}件・報告書ファイル {counts.reportFiles}件
              </div>
            )}
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10, lineHeight: 1.6 }}>
              統合後、統合先の受注金額・粗利は完工済みの見積から再計算されます。見積番号は振り直され、元の番号はメモに残ります。この操作はあとで取り消せます。
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>実行者(任意)</div>
              <select value={performedBy} onChange={e => setPerformedBy(e.target.value)} style={{ width: "100%", padding: "10px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 14, color: "#1F2937" }}>
                <option value="">未選択</option>
                {(assigneeNames || []).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", borderRadius: 8, padding: "10px 12px", fontSize: 12, marginBottom: 10, whiteSpace: "pre-wrap" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={back} disabled={loading} style={{ flex: 1, padding: "13px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#374151" }}>← 戻る</button>
              <button onClick={doMerge} disabled={loading} style={{ flex: 2, padding: "13px 0", background: loading ? "#9CA3AF" : "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: loading ? "default" : "pointer" }}>{loading ? "統合中..." : "統合する"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
