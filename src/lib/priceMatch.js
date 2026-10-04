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
  const byKeyAll = new Map(); // 名称+材質寸法が同じで単価だけ違う項目も、全部保持する(価格での優先に使う)
  for (const it of items) {
    const k = aliasKey(it.name, it.spec);
    if (!byKey.has(k)) byKey.set(k, it);
    const arr = byKeyAll.get(k);
    if (arr) arr.push(it); else byKeyAll.set(k, [it]);
  }
  const byId = new Map(items.map(it => [it.id, it]));
  const aliasMap = new Map();
  for (const a of aliases) if (byId.has(a.price_item_id)) aliasMap.set(a.alias, a.price_item_id);
  return { items, byKey, byKeyAll, byId, aliasMap };
};

// 名称+材質寸法が完全一致する項目が複数(単価違い)ある時、ファイルの単価と同じ販売単価のものを選ぶ。
// 無ければ先頭(既存の挙動と同じ)
const pickByPrice = (sameKeyItems, price) => {
  if (price != null) {
    const byPrice = sameKeyItems.find(it => Number(it.sale_price) === Number(price));
    if (byPrice) return byPrice;
  }
  return sameKeyItems[0];
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

// findCandidatesの結果を、名称+材質寸法が同じ(単価だけ違う)候補どうしでまとめて1件にする。
// まとめないと、同じ項目の単価違いが1位・2位を占めて「候補が複数で僅差」という誤判定になる
export const findCandidatesSmart = (index, name, spec, price, limit = 5, minScore = 0.3) => {
  const scored = findCandidates(index, name, spec, limit * 3, minScore);
  const byKey = new Map();
  for (const c of scored) {
    const k = aliasKey(c.item.name, c.item.spec);
    const prev = byKey.get(k);
    if (!prev || c.score > prev.score) byKey.set(k, c);
  }
  const merged = [...byKey.values()].map(c => {
    const sameKeyItems = index.byKeyAll.get(aliasKey(c.item.name, c.item.spec)) || [c.item];
    return { item: pickByPrice(sameKeyItems, price), score: c.score };
  });
  return merged.sort((a, b) => b.score - a.score).slice(0, limit);
};

// 自動(類似)で当てはめる時のしきい値。設定はここ1箇所にまとめる
export const AUTO_MATCH_MIN_SCORE = 0.8; // 類似度がこれ以上
export const AUTO_MATCH_GAP = 0.05; // 2位との差がこれ以上(または候補が1件だけ)
export const AUTO_MATCH_PRICE_TOLERANCE = 0.5; // ファイルの単価と候補の販売単価が、これを超えて違ったら自動にしない(±50%)
export const AUTO_MATCH_LEARN_SCORE = 0.85; // 自動(類似)で当てはめた行を、登録時に別名辞書へ自動保存する下限

const priceWithinTolerance = (filePrice, itemPrice) => {
  if (filePrice == null || itemPrice == null) return true; // 比較できない場合は、安全装置の対象外にする
  const fp = Number(filePrice), ip = Number(itemPrice);
  if (!Number.isFinite(fp) || !Number.isFinite(ip) || fp === 0) return true;
  return Math.abs(ip - fp) / Math.abs(fp) <= AUTO_MATCH_PRICE_TOLERANCE;
};

// matchLineに、単価での優先(pickByPrice)・類似度による自動当てはめ・安全装置を加えたもの。
// EST・自社見積書Excelの取り込みで使う(他の取り込み(Conclu .xls)は、従来通りmatchLineを使う)。
// status: "exact" / "alias" / "auto"(類似度のしきい値を満たして自動で当てはめた) / "none"
export const matchLineSmart = (index, name, spec, price) => {
  const key = aliasKey(name, spec);
  const exactGroup = index.byKeyAll.get(key);
  if (exactGroup && exactGroup.length) return { status: "exact", item: pickByPrice(exactGroup, price), candidates: [] };
  const aliasId = index.aliasMap.get(key);
  if (aliasId && index.byId.has(aliasId)) return { status: "alias", item: index.byId.get(aliasId), candidates: [] };
  const candidates = findCandidatesSmart(index, name, spec, price);
  const top = candidates[0];
  const second = candidates[1];
  const clearlyBest = top && top.score >= AUTO_MATCH_MIN_SCORE && (!second || top.score - second.score >= AUTO_MATCH_GAP);
  if (clearlyBest && priceWithinTolerance(price, top.item.sale_price)) {
    return { status: "auto", item: top.item, candidates, score: top.score };
  }
  return { status: "none", item: null, candidates };
};

// 名称の文字で単価表を検索する(人が手で選ぶ時用)
export const searchItems = (index, text, limit = 20) => {
  const t = normalizeText(text);
  if (!t) return [];
  return index.items.filter(it => normalizeText(`${it.name}${it.spec || ""}`).includes(t)).slice(0, limit);
};
