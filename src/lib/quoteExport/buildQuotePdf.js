// 見積書のPDFを作る(D: 案2 = HTMLのページを組み立てて、html2canvas で画像にし、jsPDF でA4横のPDFにする)。
// html2canvas・jsPDF はボタンを押したときだけ読み込む。金額は loadQuoteForExport の model をそのまま使うので、
// Excel(buildQuoteXlsx.js)の計算結果と必ず一致する。
import { exportFileName, downloadBlob } from "./loadQuoteForExport";

const PAGE_W = 1123, PAGE_H = 794; // A4横(96dpi)
const DETAIL_ROWS_PER_PAGE = 26;
const FONT = "'MS PGothic','ＭＳ Ｐゴシック','Hiragino Sans','Yu Gothic',sans-serif";
const COLS = [ // Excelの A〜H と同じ並び(幅の比率もExcelの列幅に合わせる)
  ["No.", 7, "center"], ["名称", 30, "left"], ["材質・寸法", 30, "left"], ["数量", 8, "right"],
  ["単位", 6, "center"], ["単価", 12, "right"], ["金額", 14, "right"], ["備考", 24, "left"],
];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Excelの #,##0 と同じ見え方(0から遠い方向に四捨五入)
const yen = v => { const a = Math.round(Math.abs(Number(v) || 0)); return (v < 0 && a ? "-" : "") + a.toLocaleString("ja-JP"); };
const amt = v => (v === null || v === undefined || v === "" || Number(v) === 0 ? "" : yen(v));
const discountAmt = v => (!v ? "" : v < 0 ? "▲ " + yen(-v) : yen(v));
const qtyText = v => (v === null || v === undefined || v === "" ? "" : String(Math.round(Number(v) * 1000) / 1000));
const dateJp = d => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

function colgroup() {
  const total = COLS.reduce((s, c) => s + c[1], 0);
  return `<colgroup>${COLS.map(c => `<col style="width:${(c[1] / total * 100).toFixed(2)}%">`).join("")}</colgroup>`;
}
const th = () => `<tr>${COLS.map(c => `<th>${c[0]}</th>`).join("")}</tr>`;
function tr(cells, cls = "") {
  return `<tr class="${cls}">${cells.map((v, i) => `<td style="text-align:${COLS[i][2]}">${v ?? ""}</td>`).join("")}</tr>`;
}

const STYLE = `
.qp{width:${PAGE_W}px;height:${PAGE_H}px;padding:36px 48px 28px;box-sizing:border-box;background:#fff;color:#000;font-family:${FONT};font-size:13px;position:relative}
.qp *{color:#000;box-sizing:border-box}
.qp .ttl{text-align:center;font-size:28px;font-weight:700;margin:0 0 10px;letter-spacing:4px;line-height:1.3}
.qp .meta{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px}
.qp table{width:100%;border-collapse:collapse;table-layout:fixed}
.qp th,.qp td{border:1px solid #000;padding:0 5px;height:21px;line-height:21px;white-space:nowrap;overflow:hidden;text-overflow:clip}
.qp th{background:#EDEDED;font-weight:700;text-align:center}
.qp tr.b td{font-weight:700}
.qp tr.total td{font-size:15px;font-weight:700;height:26px;line-height:26px}
.qp .foot{position:absolute;left:48px;right:48px;bottom:12px;display:flex;justify-content:space-between;font-size:11px;color:#333}
`;

function header(model, small) {
  return `
    <div class="meta"><span>見積No. ${esc(model.quoteNo)}</span><span>${esc(dateJp(model.outputDate))}</span></div>
    <div class="ttl" style="${small ? "font-size:22px;margin-bottom:6px" : ""}">見積内訳書</div>
    <div class="meta" style="font-size:${small ? 13 : 15}px;font-weight:700"><span>工事名&#12288;${esc(model.title)}</span></div>
    ${small ? "" : `<div class="meta"><span>取引先&#12288;${esc(model.clientName)}</span><span>営業担当&#12288;${esc(model.salesRep)}</span></div>`}`;
}

function summaryPage(model) {
  const rows = [];
  for (let k = 0; k < 20; k++) {
    const s = model.summary[k];
    if (!s) { rows.push(tr(["", "", "", "", "", "", "", ""])); continue; }
    rows.push(tr([k + 1, esc(s.name), s.kind === "line" ? esc(s.spec) : "", qtyText(s.qty), esc(s.unit), amt(s.price), amt(s.amount), s.kind === "line" ? esc(s.note) : ""]));
  }
  // Excelと同じく、諸経費〜合計の見出しは中央にそろえる
  const c = t => `<div style="text-align:center">${t}</div>`;
  rows.push(tr(["", c("諸経費"), "", "1", "式", amt(model.overhead), amt(model.overhead), ""]));
  rows.push(tr(["", c("値引き"), "", "1", "式", discountAmt(model.discount), discountAmt(model.discount), ""]));
  rows.push(tr(["", c("小計"), "", "", "", "", yen(model.subtotal), ""]));
  rows.push(tr(["", c("消費税"), "", String(model.taxRatePercent), "%", "", yen(model.tax), ""]));
  rows.push(tr(["", c("合計"), "", "", "", "", "¥" + yen(model.total), "消費税含む"], "total"));
  return `${header(model, false)}<table>${colgroup()}${th()}${rows.join("")}</table>`;
}

function detailRowHtml(r) {
  const pad = d => `padding-left:${5 + (d || 0) * 14}px`;
  if (r.type === "blank") return `<tr><td colspan="8" style="border-left:none;border-right:none"></td></tr>`;
  if (r.type === "head") return `<tr class="b"><td></td><td style="${pad(r.depth)}">${esc(r.name)}</td>${"<td></td>".repeat(6)}</tr>`;
  if (r.type === "line") {
    return `<tr><td style="text-align:center">${r.no ?? ""}</td><td style="${pad(r.depth)}">${esc(r.name)}</td><td>${esc(r.spec)}</td><td style="text-align:right">${qtyText(r.qty)}</td><td style="text-align:center">${esc(r.unit)}</td><td style="text-align:right">${amt(r.price)}</td><td style="text-align:right">${amt(r.amount)}</td><td>${esc(r.note)}</td></tr>`;
  }
  return `<tr class="b"><td></td><td style="text-align:right">${esc(r.label)}</td>${"<td></td>".repeat(4)}<td style="text-align:right">${yen(r.amount)}</td><td></td></tr>`;
}

// ページごとのHTMLを作る(1ページ目=大項目の一覧と合計、2ページ目から=内訳)
export function buildQuotePages(model) {
  const pages = [summaryPage(model)];
  // ページの先頭に空行が来ないように詰める
  const rows = model.detailRows.slice();
  while (rows.length && rows[rows.length - 1].type === "blank") rows.pop();
  for (let i = 0; i < rows.length; ) {
    while (i < rows.length && rows[i].type === "blank") i++;
    if (i >= rows.length) break;
    const chunk = rows.slice(i, i + DETAIL_ROWS_PER_PAGE);
    i += DETAIL_ROWS_PER_PAGE;
    pages.push(`${header(model, true)}<table>${colgroup()}${th()}${chunk.map(detailRowHtml).join("")}</table>`);
  }
  return pages.map((html, i) => `${html}<div class="foot"><span>${esc(model.title)}</span><span>${i + 1} / ${pages.length}</span></div>`);
}

export async function buildQuotePdfBlob(model, { scale } = {}) {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const { jsPDF } = jspdfMod;
  const isMobile = window.innerWidth < 768;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;z-index:-1";
  host.innerHTML = `<style>${STYLE}</style>`;
  document.body.appendChild(host);
  try {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const pages = buildQuotePages(model);
    for (let i = 0; i < pages.length; i++) {
      const el = document.createElement("div");
      el.className = "qp";
      el.innerHTML = pages[i];
      host.appendChild(el);
      const canvas = await html2canvas(el, { scale: scale ?? (isMobile ? 1.5 : 2), backgroundColor: "#ffffff", logging: false, width: PAGE_W, height: PAGE_H });
      if (i > 0) pdf.addPage("a4", "landscape");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 297, 210);
      host.removeChild(el);
    }
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

export async function exportQuotePdf(model) {
  const blob = await buildQuotePdfBlob(model);
  downloadBlob(blob, exportFileName(model, "pdf"));
}
