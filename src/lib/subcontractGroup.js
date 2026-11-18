// 小計(グループ)見出しの「下請け施工」チェック。配下(入れ子も含む)の明細を
// まとめて切り替える(第9弾テーマ1・3)。見積編集・見積ファイル取り込みの両方で使う。
// is_subcontracted(見積編集)・isSubcontracted(見積ファイル取り込み)のように、
// 画面ごとに項目名が違うため、読み取り方(isChecked)と書き込み方(onBulkChange)は
// 呼び出し側から渡す。
export function buildGroupCheckbox(node, { isChecked, onBulkChange }) {
  const leaves = [];
  (function walk(n) { for (const c of n.children) { if (c.isGroup) walk(c); else leaves.push(c.line); } })(node);
  if (!leaves.length) return null;
  const checkedCount = leaves.filter(isChecked).length;
  const keys = new Set(leaves.map(l => l.key));
  return {
    checked: checkedCount === leaves.length,
    indeterminate: checkedCount > 0 && checkedCount < leaves.length,
    onChange: next => onBulkChange(keys, next),
  };
}
