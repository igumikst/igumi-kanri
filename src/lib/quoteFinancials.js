// 見積の原価・粗利の計算(自社のみ / 下請けのみ / 自社+下請け)。
// 見積の編集画面・取り込みの確認画面・「完工済」にしたときの自動反映で、
// 同じ考え方を使う(第7弾の指示書どおり)。
//
// lines: [{ qty, costPrice, costConfirmed, isSubcontracted }]
//   (下請け施工にチェックした行は、isSubcontracted=true。原価は使わない)
// constructionType: "自社のみ" | "下請けのみ" | "自社+下請け"
// subAmountTotal: 下請けの原価(quote_subcontractor_costs.amount)の合計
// subCount: 下請けの原価の行数(1件もなければ粗利は暫定)
export function computeQuoteFinancials({ constructionType, saleTotal, lines, subAmountTotal, subCount }) {
  const isSubOnly = constructionType === "下請けのみ";
  const isMixed = constructionType === "自社+下請け";

  // 自社の原価を数える対象の行(下請けのみ=対象なし。自社+下請け=チェックした行を除く)
  const ownLines = isSubOnly ? [] : (lines || []).filter(l => !(isMixed && l.isSubcontracted));
  const ownCostTotal = ownLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.costPrice) || 0), 0);

  const subTotal = Number(subAmountTotal) || 0;
  const needsSubCost = isSubOnly || isMixed;
  const costTotal = ownCostTotal + (needsSubCost ? subTotal : 0);

  const gp = saleTotal - costTotal;
  const gpRate = saleTotal ? (gp / saleTotal) * 100 : null;

  const ownUnconfirmed = ownLines.some(l => !l.costConfirmed || l.costPrice == null);
  const subMissing = needsSubCost && (subCount || 0) === 0;
  const provisional = isSubOnly ? subMissing : (ownUnconfirmed || (isMixed && subMissing));

  return { ownCostTotal, subCostTotal: subTotal, costTotal, gp, gpRate, provisional, subMissing, ownUnconfirmed };
}

export const CONSTRUCTION_TYPES = ["自社のみ", "下請けのみ", "自社+下請け"];
