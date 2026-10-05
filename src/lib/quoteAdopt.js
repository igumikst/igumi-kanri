// 見積を「完工済み(採用)にする/発注前に戻す」処理の共通化(第8弾 ステップ1)。
// Quotes.jsx(一覧の採用ボタン・編集画面の保存)、Projects.jsx(報告書からの提案)の
// 3箇所で同じ処理をしていたのを、ここに集約する。
import { computeQuoteFinancials } from "./quoteFinancials";

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

// 完工済み(採用)にする確認ダイアログの本文
export function buildAdoptMessage({ fmt, quoteTitle, prevAdoptedTitle, beforeAmount, beforeGp, afterAmount, afterGp, ownUnconfirmed, subMissing }) {
  return [
    `「${quoteTitle}」を完工済(採用)にします`,
    prevAdoptedTitle ? `(現在「${prevAdoptedTitle}」が採用中です。切り替えます)` : "",
    "",
    `受注金額: ${fmt(beforeAmount)} → ${fmt(afterAmount)}`,
    `粗利: ${fmt(beforeGp)} → ${fmt(afterGp)}`,
    ...provisionalWarningLines({ ownUnconfirmed, subMissing }),
    "",
    "案件の状態も「完了」にし、案件の受注金額・粗利を上書きします。元に戻せません。",
    "よろしいですか？",
  ].filter(Boolean).join("\n");
}

// 見積を完工済み(採用)にする。他に採用中の見積があれば、その採用を外す
// (段階1では挙動を変えない: 他の見積の status は変更しない/案件の amount・grossProfit は上書き)
export async function adoptQuote(supabase, { quoteId, prevAdoptedId, projectId, amount, gp, completedOn }) {
  if (prevAdoptedId) await supabase.from("quotes").update({ is_adopted: false }).eq("id", prevAdoptedId);
  await supabase.from("quotes").update({ is_adopted: true, status: "won" }).eq("id", quoteId);
  const projectPatch = { amount: Math.round(amount), grossProfit: Math.round(gp), status: "完了", completedOn };
  await supabase.from("projects").update(projectPatch).eq("id", projectId);
  return projectPatch;
}

// 見積の採用を解除する(発注前に戻す)。alsoRevertStatus=true のときは、見積の status も submitted に戻す
export async function unadoptQuote(supabase, { quoteId, alsoRevertStatus }) {
  const patch = alsoRevertStatus ? { is_adopted: false, status: "submitted" } : { is_adopted: false };
  await supabase.from("quotes").update(patch).eq("id", quoteId);
}
