// 自社見積書Excel(表紙つき)を読み取る。DBには触らない純粋な処理。
// シートは「見積書」(IGUMIの自社見積書の表紙。品名・諸経費・値引き・小計・消費税・合計)と、
// Concluの出力そのままの「内訳明細」「概要メモ」。「表紙」「大項目」シートは無い。
// 金額は「見積書」シートから読む(概要メモの金額は、諸経費・値引きを含まないため使わない)。
// 戻り値の形は parseSelfQuotePdfFile にそろえ、確認画面(SelfQuotePdfImportForm)をそのまま使う。

import * as XLSX from "xlsx";
import { parseConcluWorkbook } from "./parseConclu.js";

const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000); // 全角スペース
// 文字の整え方は parseConclu.js の str と同じ
const str = v => (v == null ? "" : String(v)).split(IDEOGRAPHIC_SPACE).join(" ").trim();
// ラベルの比較用。NFKC正規化して、全角・半角の空白をすべて除く(全角スペース入りの「小 計」→「小計」)
const labelKey = v => (v == null ? "" : String(v)).normalize("NFKC").replace(/\s+/g, "");

// 「見積書」シートの列(0始まり)。A:ラベル C:工事名の値(C:H結合) D:合計金額(D:H結合) J:金額(J:L結合)・担当者のラベル L:担当者の値
const COL = { label: 0, title: 2, grandTotal: 3, amount: 9, inChargeLabel: 9, inCharge: 11 };

// 画面・登録メモの文言(PDFの文言は SelfQuotePdfImportForm 側の初期値のまま)
export const SELF_COVER_LABELS = {
  source: "自社見積書Excel(表紙つき)",
  issuedDateFrom: "概要メモの見積年月日から読み取り",
  fileShort: "Excel",
};

// シート「見積書」と「内訳明細」があり、「表紙」「大項目」が無いブック
export function isSelfCoverWorkbook(wb) {
  const names = wb.SheetNames;
  return names.includes("見積書") && names.includes("内訳明細") && !names.includes("表紙") && !names.includes("大項目");
}

const cellValue = (ws, r, c) => ws?.[XLSX.utils.encode_cell({ r, c })]?.v;

// A列(担当者だけJ列)のラベルで行を探す。見つからなければ -1
const findRow = (ws, col, label) => {
  if (!ws?.["!ref"]) return -1;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = range.s.r; R <= range.e.r; R++) {
    if (labelKey(cellValue(ws, R, col)) === label) return R;
  }
  return -1;
};

// 金額はセルのキャッシュ値を円に丸める(=X27*0.05 の 2523.8 → 表示どおり 2,524)。数値でなければ null
const readAmount = (ws, label, col) => {
  const R = findRow(ws, COL.label, label);
  if (R < 0) return { found: false, value: null };
  const v = cellValue(ws, R, col);
  return { found: true, value: typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null };
};

export function parseSelfCoverWorkbook(wb) {
  const coverWs = wb.Sheets["見積書"];
  if (!coverWs) throw new Error("「見積書」シートが見つかりません");

  const subtotal = readAmount(coverWs, "小計", COL.amount);
  if (subtotal.value == null) throw new Error("表紙の金額が読み取れませんでした。Excelで開いて上書き保存してから、もう一度取り込んでください");

  const warnings = [];
  const optional = (label, col, display = label) => {
    const a = readAmount(coverWs, label, col);
    if (!a.found) warnings.push(`表紙に「${display}」の行が見つかりません`);
    else if (a.value == null) warnings.push(`表紙の「${display}」の金額が読み取れませんでした`);
    return a.value;
  };
  const overheadAmount = optional("諸経費", COL.amount);
  const discountAmount = optional("値引き", COL.amount);
  const tax = optional("消費税", COL.amount);
  const totalInclTax = optional("合計", COL.amount);
  const grandTotalCell = optional("合計金額", COL.grandTotal); // この行のJ列は「担当者」の文字なので読まない

  const titleRow = findRow(coverWs, COL.label, "工事名");
  const title = titleRow >= 0 ? str(cellValue(coverWs, titleRow, COL.title)) : "";
  const chargeRow = findRow(coverWs, COL.inChargeLabel, "担当者");
  const inCharge = chargeRow >= 0 ? str(cellValue(coverWs, chargeRow, COL.inCharge)) : "";

  // 内訳明細・見積日(概要メモの見積年月日、空なら出力年月日)は、Concluの読み取りを使い回す。
  // 表紙のM2は =TODAY() で開くたびに変わるため使わない
  const conclu = parseConcluWorkbook(wb);

  const lines = conclu.lines.map(l => ({
    groupName: l.groupName, name: l.name, spec: l.spec || "", qty: l.qty ?? 1, unit: l.unit || "",
    price: l.price ?? l.amount ?? 0, amount: l.amount ?? 0, note: l.note || "", isOverhead: false,
  }));
  // 諸経費・値引きは、大項目に属さない単独の明細行として入れる(parseSelfQuotePdfFile と同じ条件)
  if (overheadAmount != null) {
    lines.push({ groupName: "諸経費", name: "諸経費", spec: "", qty: 1, unit: "", price: overheadAmount, amount: overheadAmount, note: "", isOverhead: true, overheadKind: "surcharge" });
  }
  if (discountAmount != null) {
    lines.push({ groupName: "値引き", name: "値引き", spec: "", qty: 1, unit: "", price: discountAmount, amount: discountAmount, note: "", isOverhead: true, overheadKind: "discount" });
  }
  const linesTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  // 検算。内訳明細の検算はConcluのものを使い、概要メモの金額と比べるものは入れない
  const MEMO_CHECKS = ["取り込む明細の合計 = 見積代金(税抜)", "見積代金(税抜) + 消費税 = 御見積金額(税込)"];
  const checks = conclu.checks.filter(c => !MEMO_CHECKS.includes(c.label));
  for (const w of conclu.warnings) {
    if (MEMO_CHECKS.some(label => w.includes(label))) continue;
    if (w.startsWith("「表紙」「概要メモ」シートが見つかりません")) continue;
    warnings.push(w);
  }
  // (Concluの検算で一致しなかったものの警告は、上の conclu.warnings に入っている)
  const addCheck = (label, actual, expected) => {
    if (actual == null || expected == null) { checks.push({ label, actual, expected: expected ?? null, ok: null }); return; }
    const ok = Math.round(actual) === Math.round(expected);
    checks.push({ label, actual, expected, ok });
    if (!ok) warnings.push(`検算が一致しません: ${label}(読み取り ${Math.round(actual).toLocaleString()}円 / ファイル ${Math.round(expected).toLocaleString()}円)`);
  };
  addCheck("全明細の合計(諸経費・値引き込み) = 表紙の小計", linesTotal, subtotal.value);
  if (tax != null) addCheck("小計 + 消費税 = 合計(税込)", subtotal.value + tax, totalInclTax);
  addCheck("表紙の「合計金額」 = 「合計」", grandTotalCell, totalInclTax);

  return {
    cover: {
      title, issuedDate: conclu.cover.issuedDate || "", quoteNo: null, inCharge,
      totalExTax: subtotal.value, tax, totalInclTax, overheadAmount, discountAmount,
    },
    lines,
    linesTotal,
    grandTotal: subtotal.value,
    bigItems: [],
    checks,
    warnings,
    labels: SELF_COVER_LABELS,
  };
}
