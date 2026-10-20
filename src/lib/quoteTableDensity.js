// 見積編集画面の明細の表の「コンパクト/ゆったり」の書式を、ここ1か所にまとめる。
// - cozy(ゆったり)= 今までの見た目そのまま(GroupTree に指定が無いときも、この数値と同じ見た目)
// - compact(コンパクト)= 1行1段・余白小さめ。PCの初期値
// 選んだ方は、その端末(localStorage)に覚える。保存できない端末では毎回初期値に戻るだけ。
// 表示だけの設定なので、金額の計算・保存・Excel/PDF出力には関係しない。

export const DENSITY_STORAGE_KEY = "igumi_quote_density";

export const DENSITY = {
  cozy: {
    key: "cozy", label: "ゆったり", oneLine: false,
    cellPad: "6px 8px", ctrlPad: "4px 6px", inputPad: "4px 6px", fontSize: 12, iconFont: 13,
    qtyWidth: 64, priceWidth: 90, costWidth: 80,
  },
  compact: {
    key: "compact", label: "コンパクト", oneLine: true,
    cellPad: "2px 4px", ctrlPad: "2px 3px", inputPad: "1px 4px", fontSize: 12, iconFont: 12,
    qtyWidth: 52, priceWidth: 80, costWidth: 72, lineHeight: "18px",
  },
};

// PC=コンパクト、スマホ=ゆったり が初期値。スマホでは切り替えを出さず、いつもゆったり
export function loadDensityKey(isPC) {
  if (!isPC) return "cozy";
  try {
    const v = localStorage.getItem(DENSITY_STORAGE_KEY);
    if (v === "cozy" || v === "compact") return v;
  } catch { /* 読めない端末は初期値 */ }
  return "compact";
}

export function saveDensityKey(key) {
  try { localStorage.setItem(DENSITY_STORAGE_KEY, key); } catch { /* 保存できない端末では覚えない */ }
}
