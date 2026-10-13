// 見積書の出力(Excel/PDF)用に、見積の最新データをDBから読み直して、出力の形(model)にする。
// Excel(buildQuoteXlsx.js)とPDF(buildQuotePdf.js)は、どちらもこのmodelだけを使うので、金額は必ず一致する。
//
// 【厳守】原価は出力に絶対に含めない。quote_item_costs・quote_subcontractor_costs・price_item_costs は
// このファイルでは読まない。quote_items も列名を指定して読み、is_subcontracted・原価の列は取らない。
import { buildGroupTree } from "../groupTree";

// 消費税の率と、1円未満の丸め方(F-2: 切り捨て)。丸め方を変えるときは TAX_ROUNDING だけ直す
// ("ROUNDDOWN"=切り捨て / "ROUND"=四捨五入 / "ROUNDUP"=切り上げ。Excelの関数名と同じ)
export const TAX_RATE_PERCENT = 10;
export const TAX_ROUNDING = "ROUNDDOWN";

// 表紙・1ページ目に並べる大項目の枠の数(F-5)。超えたら出力を止める
export const MAX_SUMMARY_ROWS = 20;

// 諸経費・値引きは、取り込みで「グループ名が 諸経費 / 値引き の明細」として入っている(F-3: 固定の金額のまま出す)
export const OVERHEAD_GROUP = "諸経費";
export const DISCOUNT_GROUP = "値引き";

const ITEM_COLUMNS = "group_name,name,spec,qty,unit,sale_price,note,sort_order,line_type";

// Excelの ROUND / ROUNDDOWN / ROUNDUP と同じ丸め(0から遠い・近い方向)。
// 浮動小数の誤差(12345.999999… など)で1円ずれないよう、先に小数6桁でそろえる
export function roundBy(mode, v) {
  const x = Math.round(Number(v) * 1e6) / 1e6;
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  if (mode === "ROUNDDOWN") return sign * Math.floor(a);
  if (mode === "ROUNDUP") return sign * Math.ceil(a);
  return sign * Math.round(a);
}

const lineAmount = l => (Number(l.qty) || 0) * (Number(l.sale_price) || 0);

function sumTree(node) {
  if (!node.isGroup) return lineAmount(node.line);
  return node.children.reduce((s, c) => s + sumTree(c), 0);
}

function collectLines(node, out = []) {
  if (!node.isGroup) out.push(node.line);
  else node.children.forEach(c => collectLines(c, out));
  return out;
}

const toLineRow = (line, depth, no) => ({
  type: "line", depth, no,
  name: line.name ?? "", spec: line.spec ?? "", qty: Number(line.qty) || 0, unit: line.unit ?? "",
  price: Number(line.sale_price) || 0, note: line.note ?? "", amount: lineAmount(line),
});

// 明細(quote_items の並び順のまま)と見出しの情報から、出力の形を作る。DBには触らない
export function buildExportModel({ quote, items, project, clientName, outputDate = new Date() }) {
  const lines = [...(items || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const root = buildGroupTree(lines);

  const summary = [];      // 1ページ目の大項目一覧(グループ or グループに入っていない明細)
  const detailRows = [];   // 2ページ目からの内訳(グループごと)
  let overhead = 0, discount = 0;

  for (const child of root.children) {
    if (child.isGroup && child.name === OVERHEAD_GROUP) { overhead += sumTree(child); continue; }
    if (child.isGroup && child.name === DISCOUNT_GROUP) { discount += sumTree(child); continue; }
    if (!child.isGroup) {
      const r = toLineRow(child.line, 0, null);
      summary.push({ kind: "line", ...r });
      continue;
    }
    // グループ: 見出し → 明細(入れ子は 見出し・明細・小計)→ 合計 → 空行
    detailRows.push({ type: "head", depth: 0, name: child.name });
    const start = detailRows.length;
    let no = 0;
    (function walk(node, depth) {
      for (const c of node.children) {
        if (!c.isGroup) { detailRows.push(toLineRow(c.line, depth, ++no)); continue; }
        detailRows.push({ type: "head", depth, name: c.name });
        const s = detailRows.length;
        walk(c, depth + 1);
        detailRows.push({ type: "subtotal", depth, label: "小計", name: c.name, amount: sumTree(c), from: s, to: detailRows.length - 1 });
      }
    })(child, 1);
    const totalIdx = detailRows.length;
    detailRows.push({ type: "total", depth: 0, label: "合計", name: child.name, amount: sumTree(child), from: start, to: totalIdx - 1 });
    detailRows.push({ type: "blank" });
    summary.push({ kind: "group", name: child.name, qty: 1, unit: "式", price: sumTree(child), amount: sumTree(child), totalIdx });
  }

  if (summary.length > MAX_SUMMARY_ROWS) {
    throw new Error(`大項目が${summary.length}件あり、出力できる上限(${MAX_SUMMARY_ROWS}件)を超えています。\nグループをまとめて${MAX_SUMMARY_ROWS}件以内にしてから、もう一度出力してください。`);
  }

  const subtotalRaw = summary.reduce((s, r) => s + r.amount, 0) + overhead + discount;
  const subtotal = roundBy("ROUND", subtotalRaw);
  const tax = roundBy(TAX_ROUNDING, subtotal * TAX_RATE_PERCENT / 100);
  const total = subtotal + tax;
  // 画面の「見積合計(税抜)」と同じ計算(明細を全部足してから四捨五入)。確認用
  const screenTotal = Math.round(collectLines(root).reduce((s, l) => s + lineAmount(l), 0));

  return {
    quoteNo: quote?.quote_no != null ? String(quote.quote_no) : "",
    title: quote?.title ?? "",
    projectName: project?.name ?? "",
    clientName: clientName ?? "",
    salesRep: project?.salesRep ?? "",
    outputDate,
    summary, detailRows,
    overhead, discount, subtotalRaw, subtotal, tax, total, screenTotal,
    taxRatePercent: TAX_RATE_PERCENT,
  };
}

// 見積1件の最新データをDBから読み直して、出力の形にする
export async function loadQuoteForExport(supabase, quoteId) {
  const [{ data: quote, error: qErr }, { data: items, error: iErr }] = await Promise.all([
    supabase.from("quotes").select("id,quote_no,title,project_id").eq("id", quoteId).single(),
    supabase.from("quote_items").select(ITEM_COLUMNS).eq("quote_id", quoteId).order("sort_order"),
  ]);
  if (qErr) throw new Error("見積の読み込みに失敗しました: " + qErr.message);
  if (iErr) throw new Error("明細の読み込みに失敗しました: " + iErr.message);
  let project = null, clientName = "";
  if (quote.project_id) {
    const { data: p } = await supabase.from("projects").select("name,clientId,salesRep").eq("id", quote.project_id).maybeSingle();
    project = p || null;
    if (p?.clientId) {
      const { data: c } = await supabase.from("companies").select("name").eq("id", p.clientId).maybeSingle();
      clientName = c?.name || "";
    }
  }
  return buildExportModel({ quote, items: items || [], project, clientName });
}

// ファイル名に使えない文字だけを置き換える(セルに書く工事名は加工しない)
export function exportFileName(model, ext) {
  const d = model.outputDate;
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const safe = (model.title || "見積").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 80);
  return `見積書_${safe}_${ymd}.${ext}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
