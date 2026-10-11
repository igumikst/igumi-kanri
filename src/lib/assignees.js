// 担当者名リスト(home_settings の assignee_names)の共通ルール(第8弾テーマ26-6b)。
// 追加できる画面が複数(設定ページ・電話受付)あるため、重複防止のルールを1箇所にまとめる。

export function normalizeAssigneeName(raw) {
  return (raw || "").trim();
}

export function isDuplicateAssigneeName(list, name) {
  return (list || []).some(n => n === name);
}
