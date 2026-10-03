// 明細の文字(名称・材質寸法)を、単価表(price_items)の項目に当てはめる。AIは使わない。
// 見積ファイルの取り込み(第5弾)と、現調ノートからの下書き(第3弾)で共通に使う。
//
// 探す順番: 1) 名称+材質寸法が完全一致 → 2) 別名辞書(price_item_aliases)→ 3) 文字の類似度で候補を出す(人が選ぶ)
// 別名辞書の alias には aliasKey(名称, 材質寸法) の値を保存する。

const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);

// 文字をそろえる: 全角/半角(NFKC)、大文字/小文字、空白、記号のゆれ
export const normalizeText = s => (s == null ? "" : String(s))
  .normalize("NFKC")
  .split(IDEOGRAPHIC_SPACE).join(" ")
  .toLowerCase()
  .replace(/[×＊*]/g, "x")
  .replace(/[・･,、。]/g, "")
  .replace(/[‐－―ー-]/g, "-")
  .replace(/\s+/g, "");

export const aliasKey = (name, spec) => `${normalizeText(name)}|${normalizeText(spec)}`;

const bigrams = s => {
  const out = new Map();
  if (s.length < 2) { if (s) out.set(s, 1); return out; }
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); }
  return out;
};

// 文字の類似度(0〜1)。2文字ずつ区切って、共通する割合を見る(Dice係数)
export const similarity = (a, b) => {
  const x = normalizeText(a), y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x), B = bigrams(y);
  let common = 0, total = 0;
  for (const [g, n] of A) { common += Math.min(n, B.get(g) || 0); total += n; }
  for (const n of B.values()) total += n;
  return total ? (2 * common) / total : 0;
};

// 単価表の項目を、当てはめに使いやすい形に下ごしらえする
export const buildPriceIndex = (items, aliases = []) => {
  const byKey = new Map();
  for (const it of items) {
    const k = aliasKey(it.name, it.spec);
    if (!byKey.has(k)) byKey.set(k, it);
  }
  const byId = new Map(items.map(it => [it.id, it]));
  const aliasMap = new Map();
  for (const a of aliases) if (byId.has(a.price_item_id)) aliasMap.set(a.alias, a.price_item_id);
  return { items, byKey, byId, aliasMap };
};

// 類似度の高い候補を出す(名称と材質寸法をそれぞれ比べて合わせる)
export const findCandidates = (index, name, spec, limit = 5, minScore = 0.3) => {
  const scored = [];
  for (const it of index.items) {
    const nameScore = similarity(name, it.name);
    const specScore = spec || it.spec ? similarity(spec, it.spec) : 1;
    const allScore = similarity(`${name}${spec}`, `${it.name}${it.spec || ""}`);
    const score = Math.max(allScore, nameScore * 0.6 + specScore * 0.4);
    if (score >= minScore) scored.push({ item: it, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
};

// 1行を当てはめる。status: "exact"(完全一致)/ "alias"(別名辞書)/ "none"(当てはまらない。候補あり/なし)
export const matchLine = (index, name, spec) => {
  const key = aliasKey(name, spec);
  const exact = index.byKey.get(key);
  if (exact) return { status: "exact", item: exact, candidates: [] };
  const aliasId = index.aliasMap.get(key);
  if (aliasId && index.byId.has(aliasId)) return { status: "alias", item: index.byId.get(aliasId), candidates: [] };
  return { status: "none", item: null, candidates: findCandidates(index, name, spec) };
};

// 名称の文字で単価表を検索する(人が手で選ぶ時用)
export const searchItems = (index, text, limit = 20) => {
  const t = normalizeText(text);
  if (!t) return [];
  return index.items.filter(it => normalizeText(`${it.name}${it.spec || ""}`).includes(t)).slice(0, limit);
};
