// 班の初期値(第8弾テーマ21-A追加): 自社(is_own=true)で有効(is_active!==false)な班のうち、
// sort_orderが最小のものを返す。名前の一致では探さない。見つからなければ空文字(未設定)
export function defaultOwnCrewId(crews) {
  const ownCrews = (crews || []).filter(c => c.is_own && c.is_active !== false);
  if (!ownCrews.length) return "";
  return ownCrews.reduce((min, c) => ((c.sort_order ?? 0) < (min.sort_order ?? 0) ? c : min)).id;
}
