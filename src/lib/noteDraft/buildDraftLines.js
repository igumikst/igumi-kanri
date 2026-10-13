// AIが分けたノート(JSON)を、見積の明細の下書きと3色の判定に変える。AIは使わない(すべてプログラムで決める)。
//
// 3色(決定事項4・調査報告 E):
//   緑 = 単価表と完全一致、かつ数量がはっきりしている(人が選び直した行も緑)
//   黄 = 別名辞書・類似・名前だけで当てはめた / 人工を丸めて仮置きした / 作業の数量を1式で仮置きした
//   赤 = 当てはまらない / 数量が曖昧・無い / 数量に内訳が付いている / 金額が読めない / 売価が無い /
//        人工が計算できない / AIが返した元の文字(raw)がノートに無い
// 行の色は、当てはめの色と、数量・金額などの色のうち、悪いほうにする。
import { buildPriceIndex, normalizeText } from "../priceMatch";
import { matchNoteLine } from "./matchNoteLine";
import { laborFromCrews, parseYen, PREFERRED_PRICE_SET_NAME, LABOR_ITEM_NAME, LABOR_WORK_PATTERN, MALL_ITEM_NAME } from "./rules";

const RANK = { green: 0, yellow: 1, red: 2 };
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);
const squash = s => normalizeText(s).replace(/[()（）[\]【】「」]/g, "");

// AIが返した raw が、ノートに本当にあるか(空白・記号のゆれは無視する)
export const rawInNote = (raw, noteText) => {
  const r = squash(raw);
  return !r || squash(noteText).includes(r);
};

let seq = 0;
const newKey = () => "nl" + (++seq) + Date.now().toString(36);

export function buildPriceIndexes(price) {
  const preferredSet = (price?.sets || []).find(s => s.name === PREFERRED_PRICE_SET_NAME);
  const items = price?.items || [];
  const preferred = preferredSet ? buildPriceIndex(items.filter(i => i.price_set_id === preferredSet.id), price.aliases || []) : null;
  const all = buildPriceIndex(items, price?.aliases || []);
  return { preferred, all, preferredSetId: preferredSet?.id || "" };
}

const findLaborItem = (price, preferredSetId) => {
  const items = (price?.items || []).filter(i => i.item_type === "labor_manual" && i.name === LABOR_ITEM_NAME);
  return items.find(i => i.price_set_id === preferredSetId) || items[0] || null;
};

// 下書きを作る。返す lines は、画面で人が直す前の状態
export function buildDraft({ draft, noteText, price, laborUnitPrice }) {
  const idx = buildPriceIndexes(price);
  const notices = [];
  const lines = [];
  const groupName = (draft?.work_title?.name || "").trim() || "工事";
  const check = (raw, what) => {
    const ok = rawInNote(raw, noteText);
    if (!ok) notices.push({ level: "red", text: `AIが返した${what}「${raw}」が、ノートの中に見つかりません。この行は使いませんでした` });
    return ok;
  };

  // 人工(人数×時間)→ 新規配管施工費 N人工 の1行(決定事項7・回答1)
  const labor = laborFromCrews((draft?.crew || []).filter(c => check(c.raw, "人数・時間")));
  const laborItem = findLaborItem(price, idx.preferredSetId);
  const unit = Number(laborUnitPrice) || 0;
  const laborLine = {
    key: newKey(), kind: "labor", group_name: groupName,
    name: laborItem?.name || LABOR_ITEM_NAME, spec: labor.manDays != null ? `${labor.manDays}人工` : "", unit: "式",
    qty: labor.manDays != null ? 1 : null, salePrice: labor.manDays != null ? labor.manDays * unit : 0,
    note: "", raws: (draft?.crew || []).map(c => c.raw), sourceName: LABOR_ITEM_NAME,
    match: laborItem ? { status: "exact", item: laborItem, candidates: [] } : { status: "none", item: null, candidates: [] },
    flags: { laborStatus: labor.status, laborReason: labor.reason },
  };

  // 配管モール → 配管モール施工費 の1行(決定事項8)。中身は備考に残す
  const mallParts = (draft?.mall_materials || []).filter(m => check(m.raw, "配管モール材料"));
  const mallWorks = [];

  let laborPlaced = false;
  for (const w of draft?.works || []) {
    if (!check(w.raw, "作業")) continue;
    if (/モール/.test(w.text)) { mallWorks.push(w); continue; }
    const match = matchNoteLine(idx.preferred, idx.all, w.text, "");
    if (match.item?.item_type === "labor_manual" || LABOR_WORK_PATTERN.test(w.text)) {
      // 「新規○○配管」などは人工の行にまとめる(別の行にしない)。中身は人工の行の備考に残す
      laborLine.raws.push(w.raw);
      laborLine.note = [laborLine.note, w.raw.trim()].filter(Boolean).join("・");
      if (!laborPlaced) { lines.push(laborLine); laborPlaced = true; }
      continue;
    }
    lines.push({
      key: newKey(), kind: "work", group_name: groupName,
      name: w.text, spec: "", unit: w.unit || "式", qty: w.qty ?? 1, salePrice: null,
      note: w.detail_raw || "", raws: [w.raw], sourceName: w.text, match,
      flags: { qtyAssumed: w.qty == null },
    });
  }
  if (!laborPlaced) lines.push(laborLine);

  if (mallParts.length || mallWorks.length) {
    const match = matchNoteLine(idx.preferred, idx.all, MALL_ITEM_NAME, "");
    const parts = [...mallWorks.map(w => w.detail_raw).filter(Boolean), ...mallParts.map(m => m.raw.trim())];
    lines.push({
      key: newKey(), kind: "mall", group_name: groupName,
      name: MALL_ITEM_NAME, spec: "", unit: "式", qty: 1, salePrice: null,
      note: parts.join("・"), raws: [...mallWorks.map(w => w.raw), ...mallParts.map(m => m.raw)], sourceName: MALL_ITEM_NAME, match,
      flags: {},
    });
  }

  for (const m of draft?.materials || []) {
    if (!check(m.raw, "材料")) continue;
    const wholesale = parseYen(m.wholesale_price_raw);
    const list = parseYen(m.list_price_raw);
    const noteParts = [m.spec_raw, m.breakdown_raw, list.value != null ? `定価${list.value.toLocaleString()}円` : null].filter(Boolean);
    lines.push({
      key: newKey(), kind: "material", group_name: groupName,
      name: m.name, spec: "", unit: m.unit || "", qty: m.qty_certain === false ? null : m.qty, salePrice: null,
      note: noteParts.join(" "), raws: [m.raw], sourceName: m.name,
      match: matchNoteLine(idx.preferred, idx.all, m.name, ""),
      wholesale, list,
      flags: { breakdown: !!m.breakdown_raw, priceUnreadable: !wholesale.ok || !list.ok },
    });
  }

  // 人に返すもの(明細にはしない)
  for (const c of draft?.conditions || []) if (check(c.raw, "条件")) notices.push({ level: "info", text: `ノートの条件: ${c.raw.trim()}(この作業は明細に入れていません)` });
  const mk = draft?.markup_75;
  notices.push(mk?.status === "unknown" || !mk
    ? { level: "yellow", text: "7.5% が入っているかは、ノートからは分かりません。人が決めてください" }
    : { level: "yellow", text: `7.5%: AIの読み取りは「${mk.status === "included" ? "入っている" : "入っていない"}」(根拠: ${mk.raw || "なし"})。人が確認してください` });
  for (const s of draft?.subcontract || []) notices.push({ level: "red", text: `外注見積の記述(中身は変えていません。人が入れてください): ${s.raw}` });
  for (const u of draft?.unparsed || []) notices.push({ level: "red", text: `分けられなかった行: ${u}` });
  for (const q of draft?.questions || []) notices.push({ level: "yellow", text: `AIからの確認: ${q}` });

  return {
    header: {
      propertyRaw: draft?.property?.raw || "", propertyName: draft?.property?.name || "", place: draft?.property?.place || "",
      workTitle: draft?.work_title?.name || "", workTitleRaw: draft?.work_title?.raw || "", repName: draft?.sales_rep?.name || "",
    },
    lines, notices, preferredSetId: idx.preferredSetId, indexes: idx,
  };
}

// 今の行の状態(人が選んだ項目・原価)から、当てはめ先・売価・原価・色・理由を出す
export function resolveLine(line, price) {
  const picked = line.pickedItemId !== undefined;
  const item = picked ? (line.pickedItemId ? (price?.items || []).find(i => i.id === line.pickedItemId) || null : null) : line.match.item;
  const manualPrice = !item && line.kind !== "labor" && Number(line.manualSalePrice) > 0 ? Number(line.manualSalePrice) : null;
  const status = manualPrice != null ? "manualPrice" : picked ? (item ? "manual" : "skip") : line.match.status;
  const reasons = [];
  let color = status === "exact" || status === "manual" || status === "manualPrice" ? "green" : status === "none" || status === "skip" ? "red" : "yellow";
  if (status === "manualPrice") reasons.push("単価表に無いため、売価は手入力");
  if (status === "alias") reasons.push("別名辞書で当てはめ");
  if (status === "auto") reasons.push(`類似${Math.round((line.match.score || 0) * 100)}%で当てはめ`);
  if (status === "name") reasons.push("名前だけで当てはめ(材質寸法は比べていません)");
  if (status === "none") reasons.push(line.match.candidates.length ? "単価表で決められません(候補から選んでください)" : "単価表にありません");
  if (status === "skip") reasons.push("当てはめない");

  let salePrice;
  if (line.kind === "labor") {
    salePrice = line.salePrice;
    if (line.flags.laborStatus === "check") { color = worse(color, "yellow"); reasons.push(line.flags.laborReason); }
    if (line.flags.laborStatus === "unknown") { color = "red"; reasons.push(line.flags.laborReason); }
  } else {
    salePrice = manualPrice ?? (item?.sale_price != null && Number(item.sale_price) > 0 ? Number(item.sale_price) : null);
    if (item && salePrice == null) { color = "red"; reasons.push("単価表の売価がありません"); }
  }
  if (line.qty == null) { color = "red"; reasons.push("数量が曖昧・書いていない(人が決めてください)"); }
  if (line.flags.qtyAssumed) { color = worse(color, "yellow"); reasons.push("数量の記載なし(1式で仮置き)"); }
  if (line.flags.breakdown) { color = "red"; reasons.push("数量に内訳が付いています(人が決めてください)"); }
  if (line.flags.priceUnreadable) { color = "red"; reasons.push("卸値・定価の金額が読めません"); }

  // 原価(決定事項6): ノートの卸値 → 無ければ単価表の原価。人が入れた原価があればそれ
  const base = item ? price?.costs?.[item.id] : null;
  let costPrice = base?.cost_price ?? null, costConfirmed = !!base?.cost_confirmed && costPrice != null;
  if (line.wholesale?.value != null) { costPrice = line.wholesale.value; costConfirmed = true; }
  if (line.costOverride !== undefined) { costPrice = line.costOverride.price; costConfirmed = line.costOverride.confirmed; }

  return {
    item, status, color, reasons, salePrice,
    name: item && line.kind !== "labor" ? item.name : line.name,
    spec: item && line.kind !== "labor" ? item.spec || "" : line.spec,
    unit: line.kind === "labor" ? "式" : (item?.unit || line.unit || ""),
    costPrice, costConfirmed,
  };
}
