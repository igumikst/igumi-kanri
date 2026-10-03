// テスト用: 見積ファイルの内訳ページをコピーして、グループが多いファイルを作る
// 使い方: node scripts/make-quote-fixture.mjs <元の見積.xls> <出力.xls> [コピー数=3]
//   - 元ファイルの2ページ目(最初の内訳)を「テスト工事A/B/C…」としてコピー数ぶん並べる
//   - 残りの内訳ページはそのまま後ろに付ける
//   - 総括に、内訳ページのない「総括のみ」の行(テスト諸経費 5,000円)を1行足す
// ※ 出力ファイルはリポジトリに入れないこと
import fs from "fs";
import * as XLSX from "xlsx";

const [src, out, copiesArg] = process.argv.slice(2);
if (!src || !out) { console.error("使い方: node scripts/make-quote-fixture.mjs <元の見積.xls> <出力.xls> [コピー数]"); process.exit(1); }
const copies = Number(copiesArg) || 3;

const wb = XLSX.read(fs.readFileSync(src), { type: "buffer" });
const aoa = XLSX.utils.sheet_to_json(wb.Sheets["内訳明細"], { header: 1, defval: null, blankrows: true });
const PAGE = 33;
const headers = aoa.map((r, i) => (r[2] === "No." ? i : -1)).filter(i => i >= 0);
const pageStart = h => h - 5; // 見出し行の5行上(日付の行の2行上)からがページ
const pageOf = h => aoa.slice(pageStart(h), pageStart(h) + PAGE);
const pad = rows => { const r = rows.map(x => [...(x || [])]); while (r.length < PAGE) r.push([]); return r; };

const [summaryH, firstDetailH, ...restH] = headers;
const firstDetail = pad(pageOf(firstDetailH));
const firstTotal = firstDetail.find(r => r[3] === "合計")[8];

const detailPages = [];
for (let k = 0; k < copies; k++) {
  const name = `テスト工事${String.fromCharCode(65 + k)}`;
  detailPages.push({ name, total: firstTotal, rows: firstDetail.map(r => {
    const x = [...r];
    if (typeof x[2] === "string" && / \d{4} - \( \d{4} \)$/.test(x[2])) x[2] = `${name} 0001 - ( ${String(k + 2).padStart(4, "0")} )`;
    return x;
  }) });
}
for (const h of restH) {
  const rows = pad(pageOf(h));
  const footer = rows.find(r => typeof r[2] === "string" && / \d{4} - \( \d{4} \)$/.test(r[2]));
  detailPages.push({ name: footer[2].replace(/\s*\d{4} - \( \d{4} \)$/, ""), total: rows.find(r => r[3] === "合計")[8], rows });
}

const extra = { name: "テスト諸経費", spec: "総括のみの行", amount: 5000 };
const summary = pad(pageOf(summaryH));
const sh = summaryH - pageStart(summaryH);
for (let i = sh + 1; i < PAGE; i++) if (summary[i][3] && summary[i][3] !== "総合計") summary[i] = [];
detailPages.forEach((p, i) => { summary[sh + 1 + i] = [null, null, null, p.name, "", 1, "式", p.total, p.total]; });
summary[sh + 1 + detailPages.length] = [null, null, null, extra.name, extra.spec, 1, "式", extra.amount, extra.amount];
const grand = detailPages.reduce((s, p) => s + p.total, 0) + extra.amount;
summary.find(r => r[3] === "総合計")[8] = grand;

const newAoa = [...aoa.slice(0, pageStart(summaryH)), ...summary, ...detailPages.flatMap(p => p.rows)];
wb.Sheets["内訳明細"] = XLSX.utils.aoa_to_sheet(newAoa);

const memo = XLSX.utils.sheet_to_json(wb.Sheets["概要メモ"], { header: 1, defval: null });
const tax = Math.floor(grand * 0.1);
for (const r of memo) {
  if (r[0] === "物件名称") r[1] = "【テスト】グループ多数の見積";
  if (r[0] === "選択プラン見積金額(本体)" || r[0] === "見積課税額") r[1] = grand.toLocaleString();
  if (r[0] === "選択プラン見積消費税額") r[1] = tax.toLocaleString();
  if (r[0] === "選択プラン見積総額") r[1] = (grand + tax).toLocaleString();
}
wb.Sheets["概要メモ"] = XLSX.utils.aoa_to_sheet(memo);

fs.writeFileSync(out, XLSX.write(wb, { bookType: "biff8", type: "buffer" }));
console.log(`作成: ${out}(内訳 ${detailPages.length}グループ + 総括のみ1行、総合計 ${grand.toLocaleString()}円)`);
