// Conclu出力の見積書(.xls)を読み取る。DBには触らない純粋な処理。
// 表紙のセルは「概要メモ」への数式で、キャッシュ値が 0 のことがあるため、
// 金額・工事名称などは「概要メモ」(A列=項目名 / B列=値)を優先して読む。

import * as XLSX from "xlsx";

const MEMO_KEYS = {
  outputDate: "出力年月日",
  quoteDate: "見積年月日",
  title: "物件名称",
  site: "工事場所",
  startDate: "着手予定日",
  endDate: "完了予定日",
  totalInclTax: "選択プラン見積総額",
  totalExTax: "選択プラン見積金額(本体)",
  tax: "選択プラン見積消費税額",
  clientName: "得意先名",
};

// 表紙のセル(概要メモが無い・読めない場合の予備)
const COVER_CELLS = {
  outputDate: "AP3", clientName: "E6", totalInclTax: "W10", totalExTax: "AG13", tax: "AG14",
  title: "I19", site: "I21", startDate: "L23", endDate: "L24",
};

const AMOUNT_FIELDS = ["totalInclTax", "totalExTax", "tax"];

// 内訳明細の列(0始まり)。C:No. D:名称 E:材質・寸法 F:数量 G:単位 H:単価 I:金額 J:備考
const COL = { no: 2, name: 3, spec: 4, qty: 5, unit: 6, price: 7, amount: 8, note: 9 };

// グループ名の行: 「給水管更新工事費 0001 - ( 0002 )」
const FOOTER_RE = /^(.*?)\s*\d{4}\s*-\s*\(\s*\d{4}\s*\)\s*$/;

const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000); // 全角スペース
const str = v => (v == null ? "" : String(v)).split(IDEOGRAPHIC_SPACE).join(" ").trim();

export const toNumber = v => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).normalize("NFKC").replace(/[,¥\\円\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// 「2026年 10月 3日」→「2026-10-03」。Excelの日付シリアル値にも対応
export const toISODate = v => {
  if (v == null || v === "" || v === 0 || v === "0") return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const m = String(v).normalize("NFKC").match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
};

const cellValue = (ws, addr) => ws?.[addr]?.v;

const readMemo = ws => {
  const out = {};
  if (!ws?.["!ref"]) return out;
  const r = XLSX.utils.decode_range(ws["!ref"]);
  const byLabel = {};
  for (let R = r.s.r; R <= r.e.r; R++) {
    const label = str(cellValue(ws, XLSX.utils.encode_cell({ r: R, c: 0 })));
    if (label) byLabel[label] = cellValue(ws, XLSX.utils.encode_cell({ r: R, c: 1 }));
  }
  for (const [key, label] of Object.entries(MEMO_KEYS)) out[key] = byLabel[label];
  return out;
};

const isBlankish = v => v == null || v === "" || v === 0 || v === "0";

const readCover = (memoWs, coverWs) => {
  const memo = readMemo(memoWs);
  const pick = key => {
    if (!isBlankish(memo[key])) return memo[key];
    const v = cellValue(coverWs, COVER_CELLS[key]);
    return isBlankish(v) ? null : v;
  };
  const cover = {};
  for (const key of Object.keys(MEMO_KEYS)) {
    if (key === "quoteDate") { cover.quoteDate = isBlankish(memo.quoteDate) ? null : memo.quoteDate; continue; }
    cover[key] = pick(key);
  }
  for (const k of AMOUNT_FIELDS) cover[k] = toNumber(cover[k]);
  for (const k of ["outputDate", "quoteDate", "startDate", "endDate"]) cover[k] = toISODate(cover[k]);
  for (const k of ["title", "site", "clientName"]) cover[k] = str(cover[k]);
  // 見積日: 概要メモの「見積年月日」。空なら表紙の日付(出力年月日)
  cover.issuedDate = cover.quoteDate || cover.outputDate;
  return cover;
};

// シートを行の配列にする(セルの値。空は null)
const sheetRows = ws => {
  const r = XLSX.utils.decode_range(ws["!ref"]);
  const rows = [];
  for (let R = 0; R <= r.e.r; R++) {
    const row = [];
    for (let C = 0; C <= Math.max(r.e.c, COL.note); C++) row.push(cellValue(ws, XLSX.utils.encode_cell({ r: R, c: C })) ?? null);
    rows.push(row);
  }
  return rows;
};

// 1ページ分を読む。headerIdx は「No.」の行、endIdx はそのページの最終行(含まない)
const readPage = (rows, headerIdx, endIdx) => {
  const page = { headerRow: headerIdx + 1, lines: [], totalRow: null, total: null, isSummary: false, groupName: "", footerText: "" };
  let closed = false;
  for (let i = headerIdx + 1; i < endIdx; i++) {
    const row = rows[i];
    const name = str(row[COL.name]);
    const c = str(row[COL.no]);
    const footer = c.match(FOOTER_RE);
    if (footer) { page.groupName = str(footer[1]); page.footerText = c; continue; }
    if (name === "合計" || name === "総合計") {
      page.totalRow = i + 1;
      page.total = toNumber(row[COL.amount]);
      page.isSummary = name === "総合計";
      closed = true;
      continue;
    }
    if (closed) continue;
    const qty = toNumber(row[COL.qty]);
    const amount = toNumber(row[COL.amount]);
    if (qty == null && amount == null) continue; // 見出しだけの行
    const spec = str(row[COL.spec]);
    page.lines.push({
      row: i + 1,
      no: c,
      // 名称が空の行(「同継手材」など)は、材質・寸法を名称として使う
      name: name || spec,
      spec: name ? spec : "",
      nameFromSpec: !name && !!spec,
      qty,
      unit: str(row[COL.unit]),
      price: toNumber(row[COL.price]),
      amount,
      note: str(row[COL.note]),
    });
  }
  return page;
};

const sum = arr => arr.reduce((s, v) => s + (Number(v) || 0), 0);
const normName = s => str(s).normalize("NFKC").replace(/\s+/g, "");

export function parseConcluWorkbook(wb) {
  const warnings = [];
  const coverWs = wb.Sheets["表紙"];
  const detailWs = wb.Sheets["内訳明細"];
  const memoWs = wb.Sheets["概要メモ"];
  if (!detailWs) throw new Error("「内訳明細」シートが見つかりません。Concluの見積書(.xls)か確認してください");
  if (!coverWs && !memoWs) warnings.push("「表紙」「概要メモ」シートが見つかりません。表紙の情報は読み取れません");

  const cover = readCover(memoWs, coverWs);
  const rows = sheetRows(detailWs);

  const headerIdxs = rows.map((r, i) => (str(r[COL.no]) === "No." ? i : -1)).filter(i => i >= 0);
  if (!headerIdxs.length) throw new Error("内訳明細に見出し行(C列「No.」)が見つかりません");
  const pages = headerIdxs.map((h, k) => readPage(rows, h, k + 1 < headerIdxs.length ? headerIdxs[k + 1] : rows.length));

  const summaryPage = pages.find(p => p.isSummary) || pages[0];
  if (!summaryPage.isSummary) warnings.push("「総合計」の行が見つかりません。1ページ目を総括として扱いました");
  const detailPages = pages.filter(p => p !== summaryPage);
  if (!cover.title && summaryPage.groupName) cover.title = summaryPage.groupName;

  // 総括の各行を、内訳ページ(グループ名と金額が一致)に対応付ける
  const usedPages = new Set();
  const summary = summaryPage.lines.map(l => {
    const page = detailPages.find(p => !usedPages.has(p) && normName(p.groupName) === normName(l.name) && p.total === l.amount)
      || detailPages.find(p => !usedPages.has(p) && normName(p.groupName) === normName(l.name));
    if (page) usedPages.add(page);
    return { ...l, page, amountMatches: page ? page.total === l.amount : null };
  });
  for (const s of summary) {
    if (s.page && !s.amountMatches) warnings.push(`総括「${s.name}」(${s.amount?.toLocaleString()}円)と内訳ページの合計(${s.page.total?.toLocaleString()}円)が一致しません`);
  }
  for (const p of detailPages) {
    if (!usedPages.has(p)) warnings.push(`内訳ページ「${p.groupName || `${p.headerRow}行目〜`}」に対応する総括の行がありません(明細として取り込みます)`);
  }

  // 取り込む明細: 内訳ページの行 + 内訳ページがない総括の行(「総括のみ」)
  const lines = [];
  for (const p of detailPages) {
    for (const l of p.lines) lines.push({ ...l, groupName: p.groupName, summaryOnly: false });
  }
  for (const s of summary) {
    if (s.page) continue;
    lines.push({ row: s.row, no: s.no, name: s.name, spec: s.spec, nameFromSpec: s.nameFromSpec, qty: s.qty, unit: s.unit, price: s.price, amount: s.amount, note: s.note, groupName: "総括のみ", summaryOnly: true });
  }

  // 検算
  const checks = [];
  const addCheck = (label, actual, expected) => {
    if (expected == null) { checks.push({ label, actual, expected: null, ok: null }); return; }
    checks.push({ label, actual, expected, ok: Math.round(actual) === Math.round(expected) });
  };
  for (const l of lines) {
    l.amountOk = l.qty != null && l.price != null && l.amount != null ? Math.round(l.qty * l.price) === Math.round(l.amount) : null;
    if (l.amountOk === false) warnings.push(`${l.row}行目「${l.name}」: 数量×単価(${Math.round(l.qty * l.price).toLocaleString()})と金額(${l.amount.toLocaleString()})が一致しません`);
  }
  for (const p of detailPages) addCheck(`内訳「${p.groupName || p.headerRow + "行目〜"}」の明細合計 = ページの合計`, sum(p.lines.map(l => l.amount)), p.total);
  addCheck("総括の行の合計 = 総合計", sum(summaryPage.lines.map(l => l.amount)), summaryPage.total);
  const linesTotal = sum(lines.map(l => l.amount));
  addCheck("取り込む明細の合計 = 総合計", linesTotal, summaryPage.total);
  addCheck("取り込む明細の合計 = 見積代金(税抜)", linesTotal, cover.totalExTax);
  if (cover.totalInclTax != null && cover.totalExTax != null && cover.tax != null) {
    addCheck("見積代金(税抜) + 消費税 = 御見積金額(税込)", cover.totalExTax + cover.tax, cover.totalInclTax);
  }
  for (const c of checks) if (c.ok === false) warnings.push(`検算が一致しません: ${c.label}(読み取り ${Math.round(c.actual).toLocaleString()}円 / ファイル ${Math.round(c.expected).toLocaleString()}円)`);

  return {
    cover,
    summary: summary.map(s => ({ row: s.row, name: s.name, spec: s.spec, amount: s.amount, groupName: s.page?.groupName || null, amountMatches: s.amountMatches })),
    pages: detailPages.map(p => ({ headerRow: p.headerRow, groupName: p.groupName, total: p.total, lineCount: p.lines.length })),
    grandTotal: summaryPage.total,
    lines,
    linesTotal,
    checks,
    warnings,
  };
}

export function parseConcluFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  return parseConcluWorkbook(wb);
}
