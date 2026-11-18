import { useState } from "react";
import { listGroupPaths } from "./groupTree";

// 小計(グループ)の開閉状態をまとめて管理する(第9弾テーマ3。見積編集・見積ファイル
// 取り込みの、GroupTree.jsxを使うすべての画面で、この1つの部品を使う)。
export function useGroupCollapse() {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleGroup = (path, onClose) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path);
    else { next.add(path); onClose?.(next); }
    return next;
  });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = lines => setCollapsed(new Set(listGroupPaths(lines)));
  // 施工形態が「下請けのみ」になった、その時だけ大項目(小計)だけの表示にする
  const collapseAllIfSubOnly = (constructionType, lines) => {
    if (constructionType === "下請けのみ") setCollapsed(new Set(listGroupPaths(lines)));
  };
  return { collapsed, setCollapsed, toggleGroup, expandAll, collapseAll, collapseAllIfSubOnly };
}
