// コンクル由来の自社見積書(Excel .xls/.xlsx、シート名が「大項目」+「明細」の形式)を読み取る。
// DBには触らない純粋な処理。拡張子ではなく、シート名の有無で既存のConclu形式(表紙・内訳明細)と区別する。

import * as XLSX from "xlsx";

const str = v => (v == null ? "" : String(v)).trim();

export const toNumber = v => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).normalize("NFKC").replace(/[,¥\\円\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const cellValue = (ws, addr) => ws?.[addr]?.v;

const sheetRows = (ws, maxCol) => {
  if (!ws?.["!ref"]) return [];
  const r = XLSX.utils.decode_range(ws["!ref"]);
  const rows = [];
  for (let R = 0; R <= r.e.r; R++) {
    const row = [];
    for (let C = 0; C <= Math.max(r.e.c, maxCol); C++) row.push(cellValue(ws, XLSX.utils.encode_cell({ r: R, c: C })) ?? null);
    rows.push(row);
  }
  return rows;
};

// 見積ファイルが、この形式(シート名に「大項目」と「明細」の両方がある)かどうか
export function isSelfQuoteWorkbook(wb) {
  return wb.SheetNames.includes("大項目") && wb.SheetNames.includes("明細");
}

// 「No.326-20261003」→ 見積番号「326」・見積日「2026-10-03」(ハイフンの後ろ8桁)
function parseQuoteNo(v) {
  const s = str(v);
  const m = s.match(/No\.?\s*(\d+)\s*-\s*(\d{8})$/);
  if (!m) return { quoteNo: null, issuedDate: "" };
  const d = m[2];
  return { quoteNo: m[1], issuedDate: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` };
}

function readCoverBase(bigWs) {
  const { quoteNo, issuedDate } = parseQuoteNo(cellValue(bigWs, "M3"));
  const titleRaw = str(cellValue(bigWs, "B12"));
  const title = titleRaw.replace(/^工事名[:：]\s*/, "");
  const totalInclTaxC7 = toNumber(cellValue(bigWs, "C7"));
  return { quoteNo, issuedDate, title, totalInclTaxC7 };
}

// 「大項目」の小計・消費税・合計。位置がずれても、I列のラベルで探す
function readBigTotals(bigWs) {
  const rows = sheetRows(bigWs, 10);
  let subtotal = null, tax = null, total = null;
  for (const row of rows) {
    const label = str(row[8]); // I列
    const amount = toNumber(row[9]); // J列
    if (amount == null) continue;
    if (label.startsWith("小計")) subtotal = amount;
    else if (label.startsWith("消費税")) tax = amount;
    else if (label.startsWith("合計")) total = amount;
  }
  return { subtotal, tax, total };
}

// 「大項目」の作業名称の表(14行目が見出し)。B:番号「N.」、C:名称、G:数量、H:単位、I:単価、J:金額、K:備考
function readBigItems(bigWs) {
  const rows = sheetRows(bigWs, 10);
  const headerIdx = rows.findIndex(row => str(row[1]) === "作業名称");
  if (headerIdx < 0) return [];
  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const no = str(row[1]);
    if (!/^\d+\.$/.test(no)) break; // 「N.」形式でなければ、表はここで終わり
    items.push({
      no, name: str(row[2]),
      qty: toNumber(row[6]), unit: str(row[7]), price: toNumber(row[8]), amount: toNumber(row[9]),
      note: str(row[10]),
    });
  }
  return items;
}

// 「明細」: 5行目が見出し。グループ(B列「N.」+C列グループ名)→ 明細(C列連番,D名称,H仕様,I数量,J単位,K単価,L金額,M備考)
// → 「小計」(K列)で終わる。グループが複数あれば全部読む
function readDetailGroups(detailWs) {
  const rows = sheetRows(detailWs, 12);
  const groups = [];
  let current = null;
  for (let i = 5; i < rows.length; i++) { // 6行目(0始まりindex5)から。5行目(index4)は見出し
    const row = rows[i];
    const bCol = str(row[1]);
    const cCol = str(row[2]);
    const kCol = str(row[10]);
    if (/^\d+\.$/.test(bCol) && cCol) {
      current = { groupName: cCol, headerRow: i + 1, lines: [], subtotal: null, subtotalRow: null };
      groups.push(current);
      continue;
    }
    if (kCol === "小計") {
      if (current) { current.subtotal = toNumber(row[11]); current.subtotalRow = i + 1; }
      current = null; // このグループはここで閉じる
      continue;
    }
    if (!current) continue;
    if (/^\d+\.$/.test(cCol)) {
      current.lines.push({
        row: i + 1, no: cCol,
        name: str(row[3]), spec: str(row[7]),
        qty: toNumber(row[8]), unit: str(row[9]), price: toNumber(row[10]), amount: toNumber(row[11]),
        note: str(row[12]),
      });
    }
  }
  return groups;
}

const sum = arr => arr.reduce((s, v) => s + (Number(v) || 0), 0);
const normName = s => str(s).normalize("NFKC").replace(/\s+/g, "");

export function parseSelfQuoteWorkbook(wb) {
  const warnings = [];
  const bigWs = wb.Sheets["大項目"];
  const detailWs = wb.Sheets["明細"];
  if (!bigWs || !detailWs) throw new Error("「大項目」「明細」の両方のシートが必要です");

  const coverBase = readCoverBase(bigWs);
  const bigTotals = readBigTotals(bigWs);
  const bigItems = readBigItems(bigWs);
  const groups = readDetailGroups(detailWs);
  if (!groups.length) warnings.push("「明細」シートにグループ(B列「1.」など)が見つかりません");

  const cover = {
    title: coverBase.title,
    quoteNo: coverBase.quoteNo,
    issuedDate: coverBase.issuedDate,
    totalInclTax: coverBase.totalInclTaxC7 ?? bigTotals.total,
    totalExTax: bigTotals.subtotal,
    tax: bigTotals.tax,
  };

  const lines = [];
  for (const g of groups) {
    for (const l of g.lines) lines.push({ ...l, groupName: g.groupName, summaryOnly: false });
  }
  const linesTotal = sum(lines.map(l => l.amount));

  // 検算
  const checks = [];
  const addCheck = (label, actual, expected) => {
    if (expected == null) { checks.push({ label, actual, expected: null, ok: null }); return; }
    checks.push({ label, actual, expected, ok: Math.round(actual) === Math.round(expected) });
  };
  for (const g of groups) addCheck(`明細「${g.groupName}」の合計 = 小計`, sum(g.lines.map(l => l.amount)), g.subtotal);
  for (const g of groups) {
    const bi = bigItems.find(it => normName(it.name) === normName(g.groupName));
    if (bi) addCheck(`「${g.groupName}」の小計 = 大項目の金額`, g.subtotal ?? sum(g.lines.map(l => l.amount)), bi.amount);
    else warnings.push(`「大項目」に「${g.groupName}」に対応する行が見つかりません`);
  }
  addCheck("明細の合計 = 大項目の小計", linesTotal, bigTotals.subtotal);
  if (bigTotals.subtotal != null && bigTotals.tax != null) addCheck("小計 + 消費税 = 合計", bigTotals.subtotal + bigTotals.tax, bigTotals.total);
  if (coverBase.totalInclTaxC7 != null && bigTotals.total != null) addCheck("税込合計(C7) = 合計の行", coverBase.totalInclTaxC7, bigTotals.total);
  for (const c of checks) if (c.ok === false) warnings.push(`検算が一致しません: ${c.label}(読み取り ${Math.round(c.actual).toLocaleString()}円 / ファイル ${Math.round(c.expected).toLocaleString()}円)`);

  return {
    cover,
    lines,
    linesTotal,
    grandTotal: bigTotals.subtotal,
    bigItems,
    checks,
    warnings,
  };
}

export function parseSelfQuoteFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  return parseSelfQuoteWorkbook(wb);
}
