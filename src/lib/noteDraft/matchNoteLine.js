// ノートの1行(品名・作業名)を、単価表の項目に当てはめる。AIは使わない。
// priceMatch.js(取り込みと共通)はそのまま使い、ノート用の探し方を1段だけ足す(取り込みの動きは変えない)。
//
// 1) 今と同じ matchLineSmart(工事見積用 → 無ければ全部のセット)。ノートには売価が無いので price は渡さない
// 2) 当てはまらなければ「名前だけ」で探す。サイズの書き方をそろえ(13㎜・13mm・13A → 13)、材質寸法の欄は比べない。
//    ノートには材質寸法が書いていないことが多く、工事見積用は材質寸法の欄に定価が入っているため。
//    同じ名前の項目が1件だけなら当てはめ(黄)、複数あれば候補として並べる(赤・人が選ぶ)
import { matchLineSmart, normalizeText } from "../priceMatch";

export const sizeNormalize = s => normalizeText(s).replace(/(\d)(mm|a)(?![a-z])/g, "$1");

const sameName = (index, key) => index.items.filter(it => sizeNormalize(it.name) === key);

export function matchNoteLine(preferredIndex, allIndex, name, spec = "") {
  let res = preferredIndex ? matchLineSmart(preferredIndex, name, spec, null) : { status: "none", item: null, candidates: [] };
  if (res.status === "none" && allIndex) {
    const resAll = matchLineSmart(allIndex, name, spec, null);
    if (resAll.status !== "none" || resAll.candidates.length) res = resAll;
  }
  if (res.status !== "none") return res;

  const key = sizeNormalize(name);
  if (!key) return res;
  let hits = preferredIndex ? sameName(preferredIndex, key) : [];
  if (!hits.length && allIndex) hits = sameName(allIndex, key);
  if (hits.length === 1) return { status: "name", item: hits[0], candidates: res.candidates };
  if (hits.length > 1) {
    const ids = new Set(hits.map(h => h.id));
    return { status: "none", item: null, candidates: [...hits.map(item => ({ item, score: 1 })), ...res.candidates.filter(c => !ids.has(c.item.id))].slice(0, 8) };
  }
  return res;
}
