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

// 単価 × 掛け率(円未満は0.5を切り上げでroundYenと同じ考え方)。rate=1なら100%のまま
export const applyRate = (price, rate) => roundYen((Number(price) || 0) * (Number(rate) || 0));

export const CUSTOM_RATE_MIN = 0.5;
export const CUSTOM_RATE_MAX = 1.2;

// 掛け率の4択。choice: "none"(1.0) / "back"(0.925) / "0.9" / "custom"(入力した数字)
export const MARKUP_CHOICE_OPTIONS = [
  { key: "none", rate: 1, label: "1.0" },
  { key: "back", rate: MARKUP_BACK_RATE, label: "0.925" },
  { key: "0.9", rate: 0.9, label: "0.9" },
  { key: "custom", rate: null, label: "カスタム" },
];

const closeEnough = (a, b) => Math.abs(a - b) < 0.0005;

// choice(と カスタムの数字)から掛け率の数を出す。未選択・カスタムの範囲外は null
export function rateFromChoice(choice, custom) {
  const o = MARKUP_CHOICE_OPTIONS.find(x => x.key === choice);
  if (!o) return null;
  if (o.rate != null) return o.rate;
  const n = Number(custom);
  return Number.isFinite(n) && n >= CUSTOM_RATE_MIN && n <= CUSTOM_RATE_MAX ? n : null;
}

// 案件の営業所 → 取引先 の順に「掛け率の初期値」を探す(見積編集の新規見積で使う。取り込み画面の決め方と同じ)
export function resolveDefaultMarkupFor({ clientId, branchId, cos, branches }) {
  const branch = branchId ? (branches || []).find(b => b.id === branchId) : null;
  const fromBranch = branch ? resolveMarkupChoice(branch.markup_default) : null;
  if (fromBranch) return { ...fromBranch, source: "営業所" };
  const co = clientId ? (cos || []).find(c => c.id === clientId) : null;
  const fromCo = co ? resolveMarkupChoice(co.markupDefault) : null;
  return fromCo ? { ...fromCo, source: "取引先" } : null;
}

// 取引先・営業所の「掛け率の初期値」に保存されている文字列(数字)から、choiceとrateを決める。
// null/空/数字でない場合は null(未設定・取引先に合わせる)
export function resolveMarkupChoice(stored) {
  if (stored == null || stored === "") return null;
  const num = Number(stored);
  if (!Number.isFinite(num)) return null;
  if (closeEnough(num, 1)) return { choice: "none", rate: 1 };
  if (closeEnough(num, MARKUP_BACK_RATE)) return { choice: "back", rate: MARKUP_BACK_RATE };
  if (closeEnough(num, 0.9)) return { choice: "0.9", rate: 0.9 };
  return { choice: "custom", rate: num };
}
