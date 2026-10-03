import { useState } from "react";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { fmt } from "../lib/constants";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPT_RE = /\.(xls|xlsx)$/i;

const card = { background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" };
const th = { padding: "6px 8px", fontSize: 11, color: "#6B7280", textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "6px 8px", fontSize: 12, color: "#1F2937", verticalAlign: "top" };
const num = v => (v == null ? "—" : Number(v).toLocaleString());

export default function QuoteImport({ pjs, cos, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, links, tileConf, tks, SB_W, RP_W, quoteImportCtx }) {
  const pending = tks.filter(t => !t.done);
  const targetProject = pjs.find(p => p.id === quoteImportCtx?.projectId);
  const [results, setResults] = useState([]);
  const [reading, setReading] = useState(false);

  const readFiles = async fileList => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setReading(true);
    // ライブラリが大きいので、ファイルを選んだ時だけ読み込む
    const { parseConcluFile } = await import("../lib/quoteImport/parseConclu.js");
    const next = [];
    for (const f of files) {
      const base = { key: f.name + f.size + f.lastModified, fileName: f.name, size: f.size };
      if (!ACCEPT_RE.test(f.name)) { next.push({ ...base, error: ".xls / .xlsx のファイルを選んでください" }); continue; }
      if (f.size > MAX_FILE_SIZE) { next.push({ ...base, error: `ファイルが大きすぎます(上限 10MB / このファイル ${(f.size / 1024 / 1024).toFixed(1)}MB)` }); continue; }
      try {
        next.push({ ...base, data: parseConcluFile(await f.arrayBuffer()) });
      } catch (e) {
        next.push({ ...base, error: "読み取れませんでした: " + e.message });
      }
    }
    setResults(prev => [...prev.filter(r => !next.some(n => n.key === r.key)), ...next]);
    setReading(false);
  };

  const back = () => nav(quoteImportCtx?.from || "projects");

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="quoteImport" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}

      <Hdr title="📥 見積ファイルから登録" back={back} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>
        <div style={card}>
          {targetProject && <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>追加先の案件: <b>{targetProject.name}</b></div>}
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 1.6 }}>
            Concluで出力した見積書(.xls)を選んでください。複数選べます(1ファイル 10MB まで)。<br />
            <span style={{ color: "#9A3412", fontWeight: 700 }}>※ いまは読み取りの確認だけです。まだ登録はされません。</span>
          </div>
          <label style={{ display: "block", width: "100%", padding: "12px 0", background: "#1A3A5C", color: "#fff", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: reading ? "default" : "pointer", textAlign: "center", opacity: reading ? 0.6 : 1 }}>
            {reading ? "読み取り中..." : "📂 ファイルを選ぶ"}
            <input type="file" accept=".xls,.xlsx" multiple disabled={reading} onChange={e => { readFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
        </div>

        {results.map(r => <FileResult key={r.key} r={r} onRemove={() => setResults(prev => prev.filter(x => x.key !== r.key))} />)}
      </div>
    </div>
  );
}

function FileResult({ r, onRemove }) {
  const d = r.data;
  const ngChecks = d ? d.checks.filter(c => c.ok === false) : [];
  return (
    <div style={{ ...card, borderLeft: `4px solid ${r.error || ngChecks.length ? "#DC2626" : "#059669"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", wordBreak: "break-all" }}>📗 {r.fileName}</div>
        <button onClick={onRemove} style={{ border: "none", background: "#F3F4F6", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#374151", whiteSpace: "nowrap" }}>✕ 外す</button>
      </div>

      {r.error ? (
        <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700 }}>⚠️ {r.error}</div>
      ) : (
        <>
          <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>表紙</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1F2937", marginBottom: 6 }}>{d.cover.title || "(工事名称なし)"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, fontSize: 12 }}>
              <Info label="見積日(表紙)" value={d.cover.outputDate || "—"} />
              <Info label="見積年月日(概要メモ)" value={d.cover.quoteDate || "—"} />
              <Info label="見積代金(税抜)" value={fmt(d.cover.totalExTax)} strong />
              <Info label="消費税" value={fmt(d.cover.tax)} />
              <Info label="御見積金額(税込)" value={fmt(d.cover.totalInclTax)} />
              {d.cover.site && <Info label="工事場所" value={d.cover.site} />}
              {d.cover.clientName && <Info label="宛先" value={d.cover.clientName} />}
              {(d.cover.startDate || d.cover.endDate) && <Info label="工期" value={`${d.cover.startDate || "—"} 〜 ${d.cover.endDate || "—"}`} />}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>検算</div>
            {ngChecks.length === 0
              ? <div style={{ background: "#ECFDF5", color: "#065F46", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>✅ 読み取った明細の合計({fmt(d.linesTotal)})が、ファイルの合計と一致しています</div>
              : <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>⚠️ ファイルの合計と一致しない項目があります。明細を確認してください</div>}
            {d.checks.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, fontSize: 11, color: c.ok === false ? "#DC2626" : "#6B7280", padding: "2px 0" }}>
                <span style={{ width: 18 }}>{c.ok === null ? "－" : c.ok ? "✓" : "✗"}</span>
                <span style={{ flex: 1 }}>{c.label}</span>
                <span style={{ whiteSpace: "nowrap" }}>{num(c.actual)} / {num(c.expected)}</span>
              </div>
            ))}
          </div>

          {d.warnings.length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
              {d.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: "#92400E", padding: "2px 0" }}>⚠️ {w}</div>)}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>総括(1ページ目)</div>
          <div style={{ marginBottom: 12 }}>
            {d.summary.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, padding: "3px 0", borderBottom: "1px solid #F9FAFB" }}>
                <span style={{ flex: 1, color: "#1F2937" }}>{s.name}</span>
                <span style={{ whiteSpace: "nowrap", color: "#374151" }}>{fmt(s.amount)}</span>
                <span style={{ whiteSpace: "nowrap", fontSize: 11, color: s.groupName ? (s.amountMatches ? "#059669" : "#DC2626") : "#9A3412", fontWeight: 700 }}>
                  {s.groupName ? (s.amountMatches ? "→ 内訳を採用" : "→ 内訳と金額不一致") : "総括のみ(1行で取り込み)"}
                </span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>取り込む明細({d.lines.length}行)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                  <th style={th}>グループ</th><th style={th}>名称</th><th style={th}>材質・寸法</th>
                  <th style={{ ...th, textAlign: "right" }}>数量</th><th style={th}>単位</th>
                  <th style={{ ...th, textAlign: "right" }}>単価</th><th style={{ ...th, textAlign: "right" }}>金額</th><th style={th}>備考</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F9FAFB", background: l.amountOk === false ? "#FEF2F2" : l.summaryOnly ? "#FFF7ED" : "transparent" }}>
                    <td style={{ ...td, fontSize: 11, color: l.summaryOnly ? "#9A3412" : "#6B7280", fontWeight: l.summaryOnly ? 700 : 400 }}>{l.groupName}</td>
                    <td style={td}>{l.name}{l.nameFromSpec && <span title="名称が空のため、材質・寸法を名称にしました" style={{ marginLeft: 4, fontSize: 10, color: "#9CA3AF" }}>※</span>}</td>
                    <td style={{ ...td, fontSize: 11, color: "#6B7280" }}>{l.spec}</td>
                    <td style={{ ...td, textAlign: "right" }}>{num(l.qty)}</td>
                    <td style={td}>{l.unit}</td>
                    <td style={{ ...td, textAlign: "right" }}>{num(l.price)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: l.amountOk === false ? "#DC2626" : "#E07B39" }}>{num(l.amount)}</td>
                    <td style={{ ...td, fontSize: 11, color: "#6B7280" }}>{l.note}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #F3F4F6" }}>
                  <td colSpan={6} style={{ ...td, textAlign: "right", fontWeight: 700, color: "#6B7280" }}>明細の合計(税抜)</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 900, color: "#1A3A5C" }}>{num(d.linesTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 6 }}>※ = 名称が空のため、材質・寸法を名称にした行 / オレンジの行 = 総括のみ(内訳ページなし)/ 赤い行 = 数量×単価と金額が一致しない行</div>
        </>
      )}
    </div>
  );
}

const Info = ({ label, value, strong }) => (
  <div>
    <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
    <div style={{ fontSize: strong ? 14 : 12, fontWeight: strong ? 800 : 600, color: strong ? "#E07B39" : "#1F2937" }}>{value}</div>
  </div>
);
