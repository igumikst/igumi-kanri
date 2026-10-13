// 見積書(内訳明細シート)のExcelを作る。exceljs はボタンを押したときだけ読み込む。
//
// 列・行の位置は固定(表紙を別シートで後から足しても、位置の決まったセルと「名前の定義」だけを
// 参照すれば崩れない)。INDIRECT・ROW() は使わない。明細の行に結合セルは使わない。
//   列: A=No. B=名称 C=材質・寸法 D=数量 E=単位 F=単価 G=金額 H=備考
//   1行目=見積No.・出力日 / 2行目=見積内訳書 / 3行目=工事名 / 4行目=取引先・営業担当 / 5行目=見出し
//   6〜25行目=大項目の一覧(20枠) / 26=諸経費 27=値引き 28=小計 29=消費税 30=合計 / 33行目から下=内訳
// 金額はすべて数式で書き、計算結果(result)も一緒に入れる(iPhone・LINEのプレビューで空欄にならないように)。
import { MAX_SUMMARY_ROWS, TAX_ROUNDING, exportFileName, downloadBlob } from "./loadQuoteForExport";

export const SHEET_NAME = "内訳明細";
export const CELLS = {
  outputDate: "H1", title: "B3", client: "B4",
  summaryFirstRow: 6, summaryLastRow: 5 + MAX_SUMMARY_ROWS,
  overhead: "G26", discount: "G27", subtotal: "G28", taxRate: "D29", tax: "G29", total: "G30",
  detailFirstRow: 33,
};

const COL_WIDTHS = [7, 30, 30, 8, 6, 12, 14, 24]; // A〜H
const LAST_COL = 8;
const FONT = "ＭＳ Ｐゴシック";
const NUM = '#,##0;[Red]-#,##0;""';
const NUM_DISCOUNT = '#,##0;"▲ "#,##0;""';
const NUM_YEN = '"¥"#,##0;[Red]-"¥"#,##0';
const thin = { style: "thin", color: { argb: "FF000000" } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };

const f = (formula, result) => ({ formula, result });
// 行の高さ(pt)。1ページ目(1〜31行目)がA4横の1枚に収まるよう、サンプルと同じ15.6ptを基本にする
const ROW_H = 15.6;

function font(extra) { return { name: FONT, size: 11, ...extra }; }

export async function buildQuoteXlsxBuffer(model) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "株式会社IGUMI";
  wb.calcProperties.fullCalcOnLoad = true; // 開いたときに再計算する

  const ws = wb.addWorksheet(SHEET_NAME, {
    properties: { defaultRowHeight: ROW_H },
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, printTitlesRow: "5:5",
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddFooter: "&C&P / &N" },
  });
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const set = (addr, value, style = {}) => {
    const c = ws.getCell(addr);
    c.value = value;
    c.font = font(style.font);
    if (style.numFmt) c.numFmt = style.numFmt;
    if (style.alignment) c.alignment = style.alignment;
    if (style.border) c.border = style.border;
    if (style.fill) c.fill = style.fill;
    return c;
  };
  const tableRow = r => { for (let c = 1; c <= LAST_COL; c++) ws.getCell(r, c).border = BORDER; };

  // ---- 見出し部分(1〜5行目) ----
  const d = model.outputDate;
  ws.getRow(1).height = ROW_H;
  set("A1", "No.");
  set("B1", model.quoteNo, { alignment: { horizontal: "left" } });
  set("G1", "出力日", { alignment: { horizontal: "right" } });
  set(CELLS.outputDate, new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), { numFmt: 'yyyy"年"m"月"d"日"', alignment: { horizontal: "right" } });
  ws.mergeCells("A2:H2"); // タイトルだけ結合
  ws.getRow(2).height = 30;
  set("A2", "見積内訳書", { font: { size: 20, bold: true }, alignment: { horizontal: "center", vertical: "middle" } });
  ws.getRow(3).height = 18;
  set("A3", "工事名");
  set(CELLS.title, model.title, { font: { size: 12, bold: true } });
  ws.getRow(4).height = ROW_H;
  set("A4", "取引先");
  set(CELLS.client, model.clientName);
  set("F4", "営業担当", { alignment: { horizontal: "right" } });
  set("G4", model.salesRep);
  ["No.", "名称", "材質・寸法", "数量", "単位", "単価", "金額", "備考"].forEach((h, i) => {
    set(ws.getCell(5, i + 1).address, h, { alignment: { horizontal: "center", vertical: "middle" }, fill: HEAD_FILL, font: { bold: true } });
  });
  ws.getRow(5).height = 18;
  tableRow(5);

  // ---- 内訳(33行目から下)。先に行番号を決めて、大項目の一覧から参照できるようにする ----
  const detailRowNo = model.detailRows.map((_, i) => CELLS.detailFirstRow + i);
  const rowOf = idx => detailRowNo[idx];
  model.detailRows.forEach((r, i) => {
    const R = rowOf(i);
    ws.getRow(R).height = ROW_H;
    if (r.type === "blank") return;
    tableRow(R);
    const indent = { horizontal: "left", vertical: "middle", indent: r.depth || 0 };
    if (r.type === "head") {
      set(`B${R}`, r.name, { font: { bold: true }, alignment: indent, border: BORDER });
      return;
    }
    if (r.type === "line") {
      set(`A${R}`, r.no, { alignment: { horizontal: "center" }, border: BORDER });
      set(`B${R}`, r.name, { alignment: indent, border: BORDER });
      set(`C${R}`, r.spec, { border: BORDER });
      set(`D${R}`, r.qty, { numFmt: "General", border: BORDER });
      set(`E${R}`, r.unit, { alignment: { horizontal: "center" }, border: BORDER });
      set(`F${R}`, r.price, { numFmt: NUM, border: BORDER });
      set(`G${R}`, f(`D${R}*F${R}`, r.amount), { numFmt: NUM, border: BORDER });
      set(`H${R}`, r.note, { border: BORDER });
      return;
    }
    // 小計(入れ子のグループ)・合計(大項目)。SUBTOTAL は中の SUBTOTAL を二重に数えない
    set(`B${R}`, r.label, { font: { bold: true }, alignment: { horizontal: "right", indent: 0 }, border: BORDER });
    set(`G${R}`, f(`SUBTOTAL(9,G${rowOf(r.from)}:G${rowOf(r.to)})`, r.amount), { numFmt: NUM, font: { bold: true }, border: BORDER });
  });

  // ---- 大項目の一覧(6〜25行目・固定の20枠) ----
  for (let k = 0; k < MAX_SUMMARY_ROWS; k++) {
    const R = CELLS.summaryFirstRow + k;
    ws.getRow(R).height = ROW_H;
    tableRow(R);
    const s = model.summary[k];
    if (!s) { set(`G${R}`, null, { numFmt: NUM, border: BORDER }); continue; }
    set(`A${R}`, k + 1, { alignment: { horizontal: "center" }, border: BORDER });
    set(`B${R}`, s.name, { border: BORDER });
    set(`C${R}`, s.kind === "line" ? s.spec : "", { border: BORDER });
    set(`D${R}`, s.qty, { numFmt: "General", border: BORDER });
    set(`E${R}`, s.unit, { alignment: { horizontal: "center" }, border: BORDER });
    if (s.kind === "group") set(`F${R}`, f(`G${rowOf(s.totalIdx)}`, s.price), { numFmt: NUM, border: BORDER });
    else set(`F${R}`, s.price, { numFmt: NUM, border: BORDER });
    set(`G${R}`, f(`D${R}*F${R}`, s.amount), { numFmt: NUM, border: BORDER });
    set(`H${R}`, s.kind === "line" ? s.note : "", { border: BORDER });
  }

  // ---- 諸経費・値引き・小計・消費税・合計(26〜30行目・固定) ----
  const first = CELLS.summaryFirstRow, last = CELLS.summaryLastRow;
  const label = (R, text) => set(`B${R}`, text, { alignment: { horizontal: "center" }, border: BORDER });
  [[26, "諸経費", model.overhead, NUM], [27, "値引き", model.discount, NUM_DISCOUNT]].forEach(([R, text, amount, fmt]) => {
    ws.getRow(R).height = ROW_H; tableRow(R); label(R, text);
    set(`D${R}`, 1, { numFmt: "General", border: BORDER });
    set(`E${R}`, "式", { alignment: { horizontal: "center" }, border: BORDER });
    set(`F${R}`, amount, { numFmt: fmt, border: BORDER });
    set(`G${R}`, f(`D${R}*F${R}`, amount), { numFmt: fmt, border: BORDER });
  });
  ws.getRow(28).height = ROW_H; tableRow(28); label(28, "小計");
  set(CELLS.subtotal, f(`ROUND(SUM(G${first}:G27),0)`, model.subtotal), { numFmt: NUM, border: BORDER });
  ws.getRow(29).height = ROW_H; tableRow(29); label(29, "消費税");
  set(CELLS.taxRate, model.taxRatePercent, { numFmt: "General", border: BORDER });
  set("E29", "%", { alignment: { horizontal: "center" }, border: BORDER });
  set(CELLS.tax, f(`${TAX_ROUNDING}(${CELLS.subtotal}*${CELLS.taxRate}/100,0)`, model.tax), { numFmt: NUM, border: BORDER });
  ws.getRow(30).height = 20; tableRow(30);
  set("B30", "合計", { font: { size: 12, bold: true }, alignment: { horizontal: "center" }, border: BORDER });
  set(CELLS.total, f(`${CELLS.subtotal}+${CELLS.tax}`, model.total), { numFmt: NUM_YEN, font: { size: 12, bold: true }, border: BORDER });
  set("H30", "消費税含む", { border: BORDER });

  ws.getRow(31).height = ROW_H;
  ws.getRow(31).addPageBreak(); // 内訳は2ページ目から
  ws.getRow(32).height = 18;
  set("B32", "内訳", { font: { bold: true } });

  // ---- 全セルに書式を入れて書き出す(iOSプレビュー対策)----
  const lastRow = Math.max(CELLS.detailFirstRow + model.detailRows.length, 32);
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.font) cell.font = font();
      if (cell.value === undefined) cell.value = null;
    }
  }
  // exceljs は列の前にだけ $ を付けるので、行の $ はこちらで付ける(→ $A$1:$H$n)
  ws.pageSetup.printArea = `A$1:H$${lastRow}`;

  // ---- 名前の定義(表紙を後から足すときは、これか固定のセルだけを参照する)----
  const abs = a => a.replace(/([A-Z]+)(\d+)/, "$$$1$$$2");
  const q = `'${SHEET_NAME}'!`;
  [
    ["見積_合計", abs(CELLS.total)], ["見積_小計", abs(CELLS.subtotal)], ["見積_消費税", abs(CELLS.tax)],
    ["見積_諸経費", abs(CELLS.overhead)], ["見積_値引き", abs(CELLS.discount)],
    ["見積_工事名", abs(CELLS.title)], ["見積_取引先", abs(CELLS.client)], ["見積_出力日", abs(CELLS.outputDate)],
    ["見積_大項目名", `$B$${first}:$B$${last}`], ["見積_大項目金額", `$G$${first}:$G$${last}`],
  ].forEach(([name, ref]) => wb.definedNames.add(q + ref, name));

  return wb.xlsx.writeBuffer();
}

export async function exportQuoteXlsx(model) {
  const buf = await buildQuoteXlsxBuffer(model);
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, exportFileName(model, "xlsx"));
}
