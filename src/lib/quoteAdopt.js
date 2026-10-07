// 見積を「完工済み(採用)にする/発注前に戻す」処理の共通化(第8弾)。
// Quotes.jsx(一覧の採用ボタン・編集画面の保存)、Projects.jsx(報告書からの提案)の
// 3箇所で同じ処理をしていたのを、ここに集約する。
//
// 第8弾ステップ2: 完工日・粗利は「見積ごと」(quotes.completed_on / quotes.gross_profit)。
// 完工済みの見積は、すべて案件の受注金額・粗利に入る(採用の切り替えで、他の完工済み見積の
// is_adopted / status は変更しない)。案件の amount / grossProfit は、常に
// 「その案件の全完工済み(won)見積の合計」として、書き込み直す(上書きではなく合算)。
import { computeQuoteFinancials } from "./quoteFinancials";
import { describeError } from "./errorMessage";

// 見積の原価・下請け原価から、完工済みにするときの受注金額・粗利を計算する
export async function computeAdoptTotals(supabase, { quote, constructionType }) {
  const [{ data: itemsData }, { data: subData }] = await Promise.all([
    supabase.from("quote_items").select("*").eq("quote_id", quote.id),
    supabase.from("quote_subcontractor_costs").select("amount").eq("quote_id", quote.id),
  ]);
  const ids = (itemsData || []).map(r => r.id);
  const { data: costsData } = ids.length ? await supabase.from("quote_item_costs").select("*").in("quote_item_id", ids) : { data: [] };
  const costsByItem = Object.fromEntries((costsData || []).map(c => [c.quote_item_id, c]));
  const total = quote.total_amount || 0;
  const lines = (itemsData || []).map(r => ({
    qty: r.qty, costPrice: costsByItem[r.id]?.cost_price ?? null, costConfirmed: !!costsByItem[r.id]?.cost_confirmed, isSubcontracted: !!r.is_subcontracted,
  }));
  const subAmountTotal = (subData || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const { gp, subMissing, ownUnconfirmed } = computeQuoteFinancials({ constructionType, saleTotal: total, lines, subAmountTotal, subCount: (subData || []).length });
  return { total, gp, subMissing, ownUnconfirmed };
}

// 粗利が暫定になる理由(原価未確認・下請けの原価が1件もない)の注意書き
export const provisionalWarningLines = ({ ownUnconfirmed, subMissing }) => [
  ownUnconfirmed ? "⚠️ 原価が未確認の明細があります。粗利は暫定です" : "",
  subMissing ? "⚠️ 下請けの原価が1件も登録されていません。粗利は暫定です" : "",
].filter(Boolean);

// 完工済みにする確認ダイアログの本文。受注金額・粗利は「この見積の分を加える」加算として示す
export function buildAdoptMessage({ fmt, quoteTitle, beforeAmount, beforeGp, quoteAmount, quoteGp, ownUnconfirmed, subMissing }) {
  const afterAmount = (Number(beforeAmount) || 0) + (Number(quoteAmount) || 0);
  const afterGp = (Number(beforeGp) || 0) + (Number(quoteGp) || 0);
  return [
    `「${quoteTitle}」を完工済みにします`,
    "",
    `受注金額: ${fmt(beforeAmount)} → ${fmt(afterAmount)}`,
    `粗利: ${fmt(beforeGp)} → ${fmt(afterGp)}`,
    ...provisionalWarningLines({ ownUnconfirmed, subMissing }),
    "",
    "案件の受注金額・粗利に、この見積の分を加えます(他に完工済みの見積があれば、そのまま残ります)。",
    "よろしいですか？",
  ].filter(Boolean).join("\n");
}

// 発注前に戻す確認ダイアログの本文
export function buildUnadoptMessage(quoteTitle) {
  return `「${quoteTitle}」を発注前に戻します(採用を解除)\n\n案件の受注金額・粗利は、残りの完工済み見積の合計に更新されます\n\nよろしいですか？`;
}

// 案件の amount / grossProfit を、その案件の全完工済み(won)見積の合計に書き直す
export async function recalcProjectTotals(supabase, projectId) {
  const { data } = await supabase.from("quotes").select("total_amount, gross_profit").eq("project_id", projectId).eq("status", "won");
  const amount = Math.round((data || []).reduce((s, q) => s + (Number(q.total_amount) || 0), 0));
  const gp = Math.round((data || []).reduce((s, q) => s + (Number(q.gross_profit) || 0), 0));
  const { error } = await supabase.from("projects").update({ amount, grossProfit: gp }).eq("id", projectId);
  if (error) throw new Error(describeError(error, "案件の受注金額・粗利の更新"));
  return { amount, gp };
}

// 見積を完工済み(採用)にする。他の完工済み見積の is_adopted / status は変更しない。
// 案件の amount / grossProfit は、全完工済み見積の合計に書き直す
export async function adoptQuote(supabase, { quoteId, projectId, gp, completedOn }) {
  const { error } = await supabase.from("quotes").update({ is_adopted: true, status: "won", completed_on: completedOn, gross_profit: Math.round(gp) }).eq("id", quoteId);
  if (error) throw new Error(describeError(error, "見積の完工済み更新"));
  const totals = await recalcProjectTotals(supabase, projectId);
  const { error: pErr } = await supabase.from("projects").update({ status: "完了" }).eq("id", projectId);
  if (pErr) throw new Error(describeError(pErr, "案件のステータス更新"));
  return { ...totals, status: "完了" };
}

// 見積の採用を解除する(発注前に戻す)。見積の completed_on / gross_profit は消さない。
// 案件の amount / grossProfit は、残りの完工済み見積の合計に書き直す
export async function unadoptQuote(supabase, { quoteId, projectId }) {
  const { error } = await supabase.from("quotes").update({ is_adopted: false, status: "submitted" }).eq("id", quoteId);
  if (error) throw new Error(describeError(error, "見積を発注前に戻す更新"));
  return recalcProjectTotals(supabase, projectId);
}
