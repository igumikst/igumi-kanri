import { useState } from "react";
import { extractPdfText, detectSubcontractorAmount, suggestSubcontractorCompany } from "../lib/subQuoteFileParse";

const yen = v => (v == null ? "—" : `¥${Math.round(Number(v)).toLocaleString()}`);

// 下請け見積ファイル(PDF)から、税抜小計・消費税・税込合計の候補を読み取るボタンと結果表示。
// AIなし・サーバーなし(ブラウザの中だけで読む)。読み取った金額・会社は、ボタンを押したときだけ
// 反映する(自動では入れない)。PDF以外(.xls/.xlsxの添付など)では、何も表示しない
export default function SubQuoteFileReader({ file, subcontractors, hasCompanySelected, onPickAmount, onPickCompany }) {
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState(null);

  if (!file || !/\.pdf$/i.test(file.name)) return null;

  const read = async () => {
    setReading(true);
    setResult(null);
    try {
      const text = await extractPdfText(file);
      const detected = detectSubcontractorAmount(text);
      const company = suggestSubcontractorCompany(text, subcontractors);
      setResult({ ...detected, company });
    } catch (e) {
      setResult({ kind: "error", message: e.message });
    }
    setReading(false);
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" onClick={read} disabled={reading} style={{ background: "#EEF2FF", color: "#3730A3", border: "1.5px solid #C7D2FE", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: reading ? "default" : "pointer" }}>
        {reading ? "読み取り中..." : "📄 ファイルから金額を読み取る"}
      </button>
      {result && (
        <div style={{ marginTop: 6, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
          {result.kind === "error" && <div style={{ color: "#DC2626" }}>読み取れませんでした({result.message})。手入力してください</div>}
          {result.kind === "none" && <div style={{ color: "#9CA3AF" }}>読み取れませんでした。手入力してください</div>}
          {result.kind === "totalOnly" && (
            <div>
              <div style={{ color: "#9A3412", fontWeight: 700, marginBottom: 3 }}>税込のみ検出。税抜は{yen(result.best.subtotal)}(÷1.1で計算・要確認)</div>
              <button type="button" onClick={() => onPickAmount(result.best.subtotal)} style={{ background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>この税抜金額を原価に入れる</button>
            </div>
          )}
          {result.kind === "triple" && (
            <div>
              {result.multiple && <div style={{ color: "#B45309", fontWeight: 700, marginBottom: 4 }}>⚠️ 複数候補があります</div>}
              {result.candidates.map((c, i) => (
                <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: i < result.candidates.length - 1 ? "1px solid #E5E7EB" : "none" }}>
                  <div>税抜 <b>{yen(c.subtotal)}</b> / 消費税 {yen(c.tax)} / 税込 {yen(c.total)}</div>
                  <div style={{ color: "#059669", marginTop: 2 }}>✓ 小計+消費税=合計・✓ 消費税は小計の10%</div>
                  <button type="button" onClick={() => onPickAmount(c.subtotal)} style={{ marginTop: 3, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>この税抜金額を原価に入れる</button>
                </div>
              ))}
            </div>
          )}
          {result.company && !hasCompanySelected && (
            <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #E5E7EB" }}>
              会社名の候補: <b>{result.company.name}</b>
              <button type="button" onClick={() => onPickCompany(result.company.id)} style={{ marginLeft: 6, background: "#fff", color: "#1A3A5C", border: "1px solid #94A3B8", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>この会社を選ぶ</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
