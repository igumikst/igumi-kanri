// 見積ファイルの金額を「載せる前」に戻す計算(7.5%載せ = 単価 ÷ 0.925 の逆)
export const MARKUP_BACK_RATE = 0.925;

// 円未満の四捨五入(マイナスの金額=値引きも、絶対値で四捨五入する)
export const roundYen = v => Math.sign(v) * Math.round(Math.abs(v));

// markup: "before"(載せる前。そのまま)/ "after"(載せた後 → 単価 × 0.925)
export const toBasePrice = (price, markup) => {
  const p = Number(price) || 0;
  return markup === "after" ? roundYen(p * MARKUP_BACK_RATE) : p;
};

export const lineAmount = (qty, price) => roundYen((Number(qty) || 0) * (Number(price) || 0));
