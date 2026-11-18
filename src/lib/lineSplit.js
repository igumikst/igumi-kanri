// 明細1行を、自社分・下請け分の2行に分ける計算(第9弾テーマ3)。
// 単価(price)は変えずに数量(qty)だけ分けるので、2行の金額の合計は、必ずもとの金額と
// 同じになる。数量そのものを指定する(mode="qty")か、金額を指定して単価で割り戻す
// (mode="amount")かを選べる。
export function computeSplit({ qty, price, mode, rawValue }) {
  const q = Number(qty) || 0;
  const p = Number(price) || 0;
  const raw = Number(rawValue);
  const subRaw = mode === "amount" ? (p ? raw / p : NaN) : raw;
  const subQty = Number.isFinite(subRaw) ? Math.round(subRaw * 100) / 100 : NaN;
  const valid = rawValue !== "" && Number.isFinite(subQty) && subQty > 0 && subQty < q;
  const ownQty = valid ? q - subQty : null;
  return { subQty, ownQty, valid };
}
