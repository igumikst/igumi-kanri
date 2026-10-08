// 下請け見積ファイル(Excel .xlsx/.xls)から、税抜小計・消費税・税込合計を推測する(AIなし・サーバーなし)。
// PDF(subQuoteFileParse.js)と同じ形({kind, best, multiple, candidates})で返すので、
// 画面側の既存の候補選択UIをそのまま使える。先頭シートを読む(シート名には頼らない)。
// 「原価」列は、売値より高い内部メモ的な数字が入っていることがあるため、読み取りの対象外にしている。

import { extractAmounts, findTaxTriples } from "./subQuoteFileParse";

// xlsx(SheetJS)は重いので、実際に読み取るときだけ読み込む(pdfjs-distと同じやり方)
let xlsxPromise = null;
function getXlsx() {
  if (!xlsxPromise) xlsxPromise = import("xlsx");
  return xlsxPromise;
}

const FULLWIDTH_SPACE = String.fromCharCode(0x3000);
const normSpace = s => (s == null ? "" : String(s)).split(FULLWIDTH_SPACE).join("").replace(/\s+/g, "");
const fmtYen = n => `¥${Math.round(n).toLocaleString()}`;

const cellValue = (XLSX, ws, r, c) => ws[XLSX.utils.encode_cell({ r, c })]?.v;

// 行の中から、指定したラベル文字(空白を除いて比較)に一致するセルの列をすべて探す
function findLabelCols(XLSX, ws, r, colStart, colEnd, label) {
  const cols = [];
  for (let c = colStart; c <= colEnd; c++) {
    const v = cellValue(XLSX, ws, r, c);
    if (typeof v === "string" && normSpace(v) === label) cols.push(c);
  }
  return cols;
}

// 行の中で、一番右側にある数値セルを探す(ラベルの金額は、その行の右側にある)
function findRightmostNumber(XLSX, ws, r, colStart, colEnd) {
  for (let c = colEnd; c >= colStart; c--) {
    const v = cellValue(XLSX, ws, r, c);
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

// 「項目」の見出し行を探す(行の位置には頼らない)
function findHeaderRow(XLSX, ws, rowStart, rowEnd, colStart, colEnd) {
  for (let r = rowStart; r <= rowEnd; r++) {
    if (findLabelCols(XLSX, ws, r, colStart, colEnd, "項目").length) return r;
  }
  return -1;
}

// 見出し行から、各項目の列を探す。「数量」は原価の前(使わない)と後(実際の数量)の2回出てくるので、
// 原価より後ろにある方を使う
function findHeaderColumns(XLSX, ws, headerRow, colStart, colEnd) {
  const matches = label => findLabelCols(XLSX, ws, headerRow, colStart, colEnd, label);
  const costCol = matches("原価")[0] ?? -1;
  const qtyCols = matches("数量");
  const qtyCol = (costCol >= 0 ? qtyCols.find(c => c > costCol) : qtyCols[qtyCols.length - 1]) ?? qtyCols[0] ?? -1;
  return {
    unitCol: matches("単位")[0] ?? -1,
    priceCol: matches("単価")[0] ?? -1,
    amountCol: matches("金額")[0] ?? -1,
    qtyCol,
  };
}

// 「小計」「消費税」「合計」の行と金額を探す。ラベルの行・列は雛形によって違うので、文字で探す
function findLabeledTotal(XLSX, ws, rowStart, rowEnd, colStart, colEnd, label) {
  for (let r = rowStart; r <= rowEnd; r++) {
    if (findLabelCols(XLSX, ws, r, colStart, colEnd, label).length) {
      return { row: r, amount: findRightmostNumber(XLSX, ws, r, colStart, colEnd) };
    }
  }
  return null;
}

// 明細行(見出しの次の行から、小計の行の手前まで)の金額を合計する。金額欄が数式の空文字のときは
// 数量×単価で補う。「原価」列は読まない
function sumItemAmounts(XLSX, ws, startRow, endRowExclusive, cols) {
  let sum = 0;
  let any = false;
  for (let r = startRow; r < endRowExclusive; r++) {
    const qty = cols.qtyCol >= 0 ? cellValue(XLSX, ws, r, cols.qtyCol) : null;
    const price = cols.priceCol >= 0 ? cellValue(XLSX, ws, r, cols.priceCol) : null;
    let amount = cols.amountCol >= 0 ? cellValue(XLSX, ws, r, cols.amountCol) : null;
    if ((amount === "" || amount == null) && typeof qty === "number" && typeof price === "number") amount = qty * price;
    if (typeof amount === "number" && Number.isFinite(amount)) { sum += amount; any = true; }
  }
  return any ? sum : null;
}

// シート全体の文字を1つの文章にする(ラベルで読めないときの、数字探しのフォールバック用)。
// 数値はカンマ区切りの文字列にしておく(PDFの文章と同じ形で、既存のextractAmountsが拾えるように)
function sheetText(XLSX, ws, rowStart, rowEnd, colStart, colEnd) {
  const parts = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      const v = cellValue(XLSX, ws, r, c);
      if (v == null || v === "") continue;
      parts.push(typeof v === "number" ? v.toLocaleString("en-US") : String(v));
    }
  }
  return parts.join(" ");
}

// 先頭シートから、税抜小計の候補を読み取る。
// 1) 「小計」「消費税」「合計」のラベルを探して、小計+消費税=合計・消費税=小計の10%(±1円)が
//    成り立てば、それを最優先の候補にする
// 2) 成り立たない・ラベルが見つからない場合は、PDFと同じ「数字の組を探す」方式に切り替える
// 3) ラベルの行が分かれば、明細の金額の合計と小計を比べて、合わなければcheckWarningを付ける
function detectSubcontractorAmountFromSheet(XLSX, ws) {
  if (!ws?.["!ref"]) return { kind: "none", best: null, multiple: false, candidates: [] };
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const { s: { r: rowStart, c: colStart }, e: { r: rowEnd, c: colEnd } } = range;

  const headerRow = findHeaderRow(XLSX, ws, rowStart, rowEnd, colStart, colEnd);
  const cols = headerRow >= 0 ? findHeaderColumns(XLSX, ws, headerRow, colStart, colEnd) : null;

  const subtotalHit = findLabeledTotal(XLSX, ws, rowStart, rowEnd, colStart, colEnd, "小計");
  const taxHit = findLabeledTotal(XLSX, ws, rowStart, rowEnd, colStart, colEnd, "消費税");
  const totalHit = findLabeledTotal(XLSX, ws, rowStart, rowEnd, colStart, colEnd, "合計");

  let result = null;
  if (subtotalHit?.amount != null && taxHit?.amount != null && totalHit?.amount != null) {
    const { amount: subtotal } = subtotalHit, { amount: tax } = taxHit, { amount: total } = totalHit;
    const sumsUp = Math.round(subtotal + tax) === Math.round(total);
    const taxIsTenPercent = Math.abs(tax - Math.round(subtotal * 0.1)) <= 1;
    if (sumsUp && taxIsTenPercent) {
      const best = { subtotal, tax, total };
      result = { kind: "triple", best, multiple: false, candidates: [best] };
    }
  }

  if (!result) {
    const amounts = extractAmounts(sheetText(XLSX, ws, rowStart, rowEnd, colStart, colEnd));
    const triples = findTaxTriples(amounts);
    if (triples.length) {
      result = { kind: "triple", best: triples[0], multiple: triples.length > 1, candidates: triples };
    } else if (amounts.length) {
      const total = Math.max(...amounts);
      const subtotal = Math.round(total / 1.1);
      const best = { subtotal, tax: total - subtotal, total };
      result = { kind: "totalOnly", best, multiple: false, candidates: [best] };
    } else {
      result = { kind: "none", best: null, multiple: false, candidates: [] };
    }
  }

  if (result.best && headerRow >= 0 && subtotalHit && cols) {
    const itemsSum = sumItemAmounts(XLSX, ws, headerRow + 1, subtotalHit.row, cols);
    if (itemsSum != null && Math.round(itemsSum) !== Math.round(result.best.subtotal)) {
      result.checkWarning = `明細の合計が合いません(Excel:${fmtYen(result.best.subtotal)} / 明細:${fmtYen(itemsSum)})`;
    }
  }

  return result;
}

// Excelファイル(File)の先頭シートから、税抜小計の候補を読み取る。ブラウザの中だけで行う
export async function detectSubcontractorAmountFromExcel(file) {
  const XLSX = await getXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("シートが見つかりません");
  return detectSubcontractorAmountFromSheet(XLSX, wb.Sheets[sheetName]);
}
