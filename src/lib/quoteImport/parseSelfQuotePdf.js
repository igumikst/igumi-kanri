// 自社見積書PDF(IGUMIの社内ツールが出力した、表紙+見積内訳書形式)を読み取る(第8弾テーマ18)。
// DBには触らない純粋な処理。pdfjs-dist(既存の依存)で、文字の座標(x,y)から表の行・列を組み立てる。
// 下請け見積のPDF読み取り(subQuoteFileParse.js)とは別物(あちらは金額をゆるく拾うだけ)。
//
// PDFの構造(サンプル2件で確認済み):
// 1ページ目=表紙(工事名・担当者・品名ごとの大項目・諸経費・値引き・小計・消費税・合計)
// 2ページ目=見積内訳書(大項目の一覧。総合計で終わる)
// 3ページ目以降=大項目ごとの内訳(1大項目=1ページ。名称だけの見出し行→明細→合計で終わる)
//
// 内訳書ページの列のx座標(左端)は、サンプル2件・全ページで一致していた固定値。
// 単価・金額は右詰めなので、左端ではなく「次の列の手前まで」で範囲判定する

export const toNumber = v => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const neg = s.includes("▲") || s.includes("-");
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
};

// 令和N年M月D日 → 西暦のISO日付(西暦 = 令和年 + 2018)
export function reiwaToIso(s) {
  const m = String(s).match(/令和(\d+)年(\d+)月(\d+)日/);
  if (!m) return "";
  const y = Number(m[1]) + 2018;
  const mo = String(m[2]).padStart(2, "0");
  const d = String(m[3]).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

// pdfjs-dist(PDFの文字を読み取るライブラリ)は重いので、実際に読み取るときだけ読み込む
let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}

// 各ページの文字を、空白を除いて{str,x,y,w}の配列で返す。座標は見た目の行・列の判定に使う
export async function extractPdfLayout(file) {
  const pdfjsLib = await getPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items
      .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))
      .filter(it => it.str.trim() !== "");
    pages.push(items);
  }
  return pages;
}

// y座標が近い項目を同じ行にまとめる(行はyの降順=ページの上から)。行の中はx昇順にそろえる
export function groupRows(items, tol = 2.5) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows = [];
  for (const it of sorted) {
    const row = rows.find(r => Math.abs(r.y - it.y) <= tol);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}

const joinText = items => items.map(it => it.str).join("");

// 内訳書ページ(見積内訳書・各大項目の内訳)の列の境界(x)。サンプル2件・全ページで確認済みの固定値
const DETAIL_COLS = [
  { key: "name", from: -1 },
  { key: "spec", from: 230 },
  { key: "qty", from: 455 },
  { key: "unit", from: 472 },
  { key: "price", from: 530 },
  { key: "amount", from: 595 },
  { key: "note", from: 690 },
];
export function columnOf(x) {
  let best = DETAIL_COLS[0].key;
  for (const c of DETAIL_COLS) { if (x >= c.from) best = c.key; else break; }
  return best;
}

// 内訳書ページ(見出し行「名称 材質・寸法 数量 単位 単価 金額」を持つページ)かどうか
export function isDetailPage(rows) {
  return rows.some(r => {
    const t = joinText(r.items);
    return t.includes("名称") && t.includes("材質") && t.includes("数量") && t.includes("単価") && t.includes("金額");
  });
}

// 内訳書ページの行を、列ごとに分けて読み取る。見出し行より下、「合計」または「総合計」の行まで。
// 名称だけで他の列が空の行は、大項目の見出し行(isGroupHeader)として返す
export function readDetailRows(rows) {
  const headerIdx = rows.findIndex(r => joinText(r.items).includes("材質"));
  if (headerIdx < 0) return [];
  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = { name: [], spec: [], qty: [], unit: [], price: [], amount: [], note: [] };
    for (const it of rows[i].items) cells[columnOf(it.x)].push(it);
    const name = joinText(cells.name).trim();
    const spec = cells.spec.map(it => it.str).join(" ").trim();
    const qty = toNumber(joinText(cells.qty));
    const unit = joinText(cells.unit).trim();
    const price = toNumber(joinText(cells.price));
    const amount = toNumber(joinText(cells.amount));
    const note = cells.note.map(it => it.str).join(" ").trim();
    if (!name && qty == null && price == null && amount == null) continue; // 空行
    const isFooter = name === "合計" || name === "総合計";
    const isGroupHeader = !isFooter && !!name && !spec && qty == null && price == null && amount == null;
    out.push({ name, spec, qty, unit, price, amount, note, isGroupHeader, isFooter });
    if (isFooter) break;
  }
  return out;
}

// 見積内訳書(大項目の一覧)ページ。各行は大項目そのもの(名称・数量・単位・単価・金額が入っている)
export function parseOverviewPage(rows) {
  const detail = readDetailRows(rows);
  const footer = detail.find(r => r.isFooter);
  const items = detail.filter(r => !r.isFooter && !r.isGroupHeader);
  return { items, total: footer?.amount ?? null };
}

// 大項目ごとの内訳ページ。先頭=大項目の見出し行、以降=明細、最後=合計行
export function parseBreakdownPage(rows) {
  const detail = readDetailRows(rows);
  if (!detail.length) return null;
  const headerRow = detail.find(r => r.isGroupHeader) || detail[0];
  const footer = detail.find(r => r.isFooter);
  const lines = detail.filter(r => r !== headerRow && !r.isFooter);
  return { groupName: headerRow?.name || "", lines, total: footer?.amount ?? null };
}

// 表紙ページを読む。ラベルの文字(「工」「事」「名」のように1文字ずつ離れていることがある)と
// 値を、同じ行(yが近い)にあるかどうかで対応づける
export function readCover(allItems) {
  // 右側の会社情報(社名・住所・TEL・MAILなど)は、ラベルと同じy座標に乗ることがあるため、
  // 先に除いておく(x=560以上は会社情報の列。サンプルで確認済み)
  const items = allItems.filter(it => it.x < 560);
  const rows = groupRows(items);
  const findLabelRow = label => rows.find(r => joinText(r.items).includes(label));

  const titleRow = findLabelRow("工事名");
  const title = titleRow ? joinText(titleRow.items.filter(it => it.str.length > 1)) : "";

  const chargeRow = findLabelRow("担当者") || findLabelRow("担 当 者");
  const inCharge = chargeRow ? joinText(chargeRow.items.filter(it => it.str.length > 1 && it.str !== "：")) : "";

  const dateItem = allItems.find(it => /^令和\d+年\d+月\d+日$/.test(it.str));
  const issuedDate = dateItem ? reiwaToIso(dateItem.str) : "";

  const amountNear = label => {
    const row = findLabelRow(label);
    if (!row) return null;
    const valueItems = row.items.filter(it => /[0-9]/.test(it.str)).sort((a, b) => a.x - b.x);
    const last = valueItems[valueItems.length - 1];
    return last ? toNumber(last.str) : null;
  };
  const overheadAmount = amountNear("諸経費");
  const discountAmount = amountNear("値引き");
  const subtotal = amountNear("小計");
  const tax = amountNear("消費税");
  const totalInclTax = amountNear("合計");

  return { title, inCharge, issuedDate, overheadAmount, discountAmount, subtotal, tax, totalInclTax };
}

// このPDFが、対応している自社見積書の形式(表紙+見積内訳書)かどうか
export function isSelfQuotePdf(pages) {
  if (!pages || pages.length < 2) return false;
  const totalItems = pages.reduce((s, items) => s + items.length, 0);
  if (totalItems < 10) return false; // 文字がほぼ無い(画像PDFなど)
  const coverText = joinText(pages[0]);
  if (!coverText.includes("見積書")) return false;
  if (!coverText.includes("諸経費") || !coverText.includes("値引き")) return false;
  const rowsByPage = pages.slice(1).map(items => groupRows(items));
  return rowsByPage.some(rows => isDetailPage(rows));
}

export async function parseSelfQuotePdfFile(file) {
  const pages = await extractPdfLayout(file);
  const totalItems = pages.reduce((s, items) => s + items.length, 0);
  if (totalItems < 10) throw new Error("文字が読み取れませんでした(画像のPDFには対応していません)");
  if (!isSelfQuotePdf(pages)) throw new Error("対応していないPDFの形式です");

  const cover = readCover(pages[0]);
  const overviewRows = groupRows(pages[1]);
  const overview = parseOverviewPage(overviewRows);

  const groups = [];
  for (let p = 2; p < pages.length; p++) {
    const rows = groupRows(pages[p]);
    if (!isDetailPage(rows)) continue;
    const g = parseBreakdownPage(rows);
    if (g) groups.push(g);
  }

  const lines = [];
  for (const g of groups) {
    for (const l of g.lines) {
      lines.push({
        groupName: g.groupName, name: l.name, spec: l.spec || "", qty: l.qty ?? 1, unit: l.unit || "",
        price: l.price ?? l.amount ?? 0, amount: l.amount ?? 0, note: l.note || "", isOverhead: false,
      });
    }
  }
  // 諸経費・値引きは、大項目に属さない単独の明細行として入れる(アプリ側で5%を再計算しない)。
  // 値引きは負の金額の行にする
  if (cover.overheadAmount != null) {
    lines.push({ groupName: "諸経費", name: "諸経費", spec: "", qty: 1, unit: "", price: cover.overheadAmount, amount: cover.overheadAmount, note: "", isOverhead: true, overheadKind: "surcharge" });
  }
  if (cover.discountAmount != null) {
    lines.push({ groupName: "値引き", name: "値引き", spec: "", qty: 1, unit: "", price: cover.discountAmount, amount: cover.discountAmount, note: "", isOverhead: true, overheadKind: "discount" });
  }

  const linesTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const warnings = [];
  const checks = [];
  const addCheck = (label, actual, expected) => {
    if (actual == null || expected == null) { checks.push({ label, actual, expected: expected ?? null, ok: null }); return; }
    const ok = Math.round(actual) === Math.round(expected);
    checks.push({ label, actual, expected, ok });
    if (!ok) warnings.push(`検算が一致しません: ${label}(読み取り ${Math.round(actual).toLocaleString()}円 / ファイル ${Math.round(expected).toLocaleString()}円)`);
  };
  for (const g of groups) addCheck(`明細「${g.groupName}」の合計 = 大項目の金額`, g.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), g.total);
  addCheck("全明細の合計 = 小計(税抜)", linesTotal, cover.subtotal);
  if (cover.subtotal != null && cover.tax != null) addCheck("小計 + 消費税 = 合計(税込)", cover.subtotal + cover.tax, cover.totalInclTax);
  if (!groups.length) warnings.push("内訳書の大項目が見つかりません");

  return {
    cover: {
      title: cover.title, issuedDate: cover.issuedDate, quoteNo: null, inCharge: cover.inCharge,
      totalExTax: cover.subtotal, tax: cover.tax, totalInclTax: cover.totalInclTax,
      overheadAmount: cover.overheadAmount, discountAmount: cover.discountAmount,
    },
    lines,
    linesTotal,
    grandTotal: cover.subtotal,
    bigItems: overview.items.map(it => ({ name: it.name, qty: it.qty, unit: it.unit, price: it.price, amount: it.amount })),
    checks,
    warnings,
  };
}
