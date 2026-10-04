// 明細(quote_items / 取り込みの確認画面の行)は、group_name という文字列
// (" > " 区切りの階層パス。例:「内装復旧工事費 > 大工工事費」)を持つフラットな
// 配列として持つ。小計(グループ)の行は保存しない — 表示のときに、group_name
// が同じ行をまとめて、木構造を組み立てる。DBの構造は変えない(第7弾 ステップ2)。
export const GROUP_SEP = " > ";

export function groupPathOf(line) {
  return line.group_name || "";
}

// 明細の配列から木構造を組み立てる。ルートはisGroup:true, path:""
export function buildGroupTree(lines) {
  const root = { isGroup: true, name: "", path: "", children: [] };
  const byPath = new Map([["", root]]);
  for (const line of lines) {
    const segs = groupPathOf(line).split(GROUP_SEP).filter(Boolean);
    let node = root;
    let path = "";
    for (const seg of segs) {
      path = path ? `${path}${GROUP_SEP}${seg}` : seg;
      let child = byPath.get(path);
      if (!child) {
        child = { isGroup: true, name: seg, path, children: [] };
        byPath.set(path, child);
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({ isGroup: false, line, path: groupPathOf(line) });
  }
  return root;
}

// 木を、深さつきの行配列(表示・ドラッグ用)に平らにする
export function flattenGroupTree(lines) {
  const root = buildGroupTree(lines);
  const out = [];
  (function walk(node, depth) {
    for (const child of node.children) {
      if (child.isGroup) {
        out.push({ id: "g:" + child.path, isGroup: true, path: child.path, name: child.name, depth, node: child });
        walk(child, depth + 1);
      } else {
        out.push({ id: "l:" + child.line.key, isGroup: false, depth, line: child.line });
      }
    }
  })(root, 0);
  return out;
}

export function groupAmount(node, amountOf) {
  if (!node.isGroup) return amountOf(node.line);
  return node.children.reduce((s, c) => s + groupAmount(c, amountOf), 0);
}

// 既存のグループのパス一覧(「このグループに移す」メニュー用)。トップレベルは ""
export function listGroupPaths(lines) {
  const root = buildGroupTree(lines);
  const out = [];
  (function walk(node) {
    for (const child of node.children) {
      if (child.isGroup) { out.push(child.path); walk(child); }
    }
  })(root);
  return out;
}

// 明細1件を、ドラッグ・メニューで指定した「直前の行」に合わせて並べ替える。
// afterRowId が null なら先頭(トップレベル)に置く。
export function reorderLeafAfter(lines, leafKey, afterRowId) {
  const flat = flattenGroupTree(lines);
  const fromIdx = flat.findIndex(r => !r.isGroup && r.line.key === leafKey);
  if (fromIdx === -1) return lines;
  const [moved] = flat.splice(fromIdx, 1);
  let toIdx = afterRowId == null ? 0 : flat.findIndex(r => r.id === afterRowId) + 1;
  if (toIdx < 0) toIdx = flat.length;
  flat.splice(toIdx, 0, moved);
  return rebuildFromFlat(flat);
}

// 明細1件の group_name を、直接指定したグループパスに変える(先頭に挿入)
export function moveLeafToGroup(lines, leafKey, targetPath) {
  const flat = flattenGroupTree(lines);
  const fromIdx = flat.findIndex(r => !r.isGroup && r.line.key === leafKey);
  if (fromIdx === -1) return lines;
  const [moved] = flat.splice(fromIdx, 1);
  moved.line = { ...moved.line, group_name: targetPath };
  // 対象グループの先頭(ヘッダーの直後)に挿入。トップレベルなら先頭
  let insertAt = 0;
  if (targetPath) {
    const headerIdx = flat.findIndex(r => r.isGroup && r.path === targetPath);
    insertAt = headerIdx === -1 ? flat.length : headerIdx + 1;
  }
  flat.splice(insertAt, 0, moved);
  return lines.map(l => (l.key === leafKey ? { ...l, group_name: targetPath } : l))
    .sort((a, b) => leafOrderIndex(flat, a.key) - leafOrderIndex(flat, b.key));
}

function leafOrderIndex(flat, key) {
  return flat.findIndex(r => !r.isGroup && r.line.key === key);
}

// グループ(とその配下すべて)を、兄弟の中で1つ上/下に動かす
export function moveGroupUpDown(lines, groupPath, dir) {
  const root = buildGroupTree(lines);
  const parent = findParent(root, groupPath);
  if (!parent) return lines;
  const idx = parent.children.findIndex(c => c.isGroup && c.path === groupPath);
  const to = idx + dir;
  if (idx === -1 || to < 0 || to >= parent.children.length) return lines;
  [parent.children[idx], parent.children[to]] = [parent.children[to], parent.children[idx]];
  return leavesInTreeOrder(root);
}

// 明細1件を、同じグループの兄弟の中で1つ上/下に動かす
export function moveLeafUpDown(lines, leafKey, dir) {
  const root = buildGroupTree(lines);
  const parent = findLeafParent(root, leafKey);
  if (!parent) return lines;
  const idx = parent.children.findIndex(c => !c.isGroup && c.line.key === leafKey);
  const to = idx + dir;
  if (idx === -1 || to < 0 || to >= parent.children.length) return lines;
  [parent.children[idx], parent.children[to]] = [parent.children[to], parent.children[idx]];
  return leavesInTreeOrder(root);
}

// グループ全体を、別のグループの配下(先頭)に移す。targetPathが""ならトップレベルへ
export function moveGroupToParent(lines, groupPath, targetPath) {
  if (targetPath === groupPath || (targetPath || "").startsWith(groupPath + GROUP_SEP)) return lines; // 自分自身・自分の子孫には移せない
  const root = buildGroupTree(lines);
  const groupNode = findGroup(root, groupPath);
  if (!groupNode) return lines;
  const oldPrefix = groupPath;
  const newPrefix = targetPath ? `${targetPath}${GROUP_SEP}${groupNode.name}` : groupNode.name;
  const leafKeys = new Set(leavesOf(groupNode).map(l => l.key));
  const renamed = lines.map(l => (leafKeys.has(l.key) ? { ...l, group_name: newPrefix + groupPathOf(l).slice(oldPrefix.length) } : l));
  // 並び順: 対象グループの見出し行+配下のleafを、まとめて移動先の直後に差し込む
  // (見出し行も一緒に動かさないと、rebuildFromFlatがグループ名を復元できない)
  const flat = flattenGroupTree(renamed);
  const movedIds = new Set();
  for (const r of flat) {
    if (r.isGroup && (r.path === newPrefix || r.path.startsWith(newPrefix + GROUP_SEP))) movedIds.add(r.id);
    if (!r.isGroup && leafKeys.has(r.line.key)) movedIds.add(r.id);
  }
  const movedRows = flat.filter(r => movedIds.has(r.id));
  const restRows = flat.filter(r => !movedIds.has(r.id));
  let insertAt = 0;
  if (targetPath) {
    const headerIdx = restRows.findIndex(r => r.isGroup && r.path === targetPath);
    insertAt = headerIdx === -1 ? restRows.length : headerIdx + 1;
  }
  restRows.splice(insertAt, 0, ...movedRows);
  return rebuildFromFlat(restRows);
}

// 選んだ明細(複数)を、新しいグループ名でまとめる(トップレベルの新グループになる)
export function bundleIntoNewGroup(lines, leafKeys, newGroupName) {
  const keySet = new Set(leafKeys);
  const renamed = lines.map(l => (keySet.has(l.key) ? { ...l, group_name: newGroupName } : l));
  const flat = flattenGroupTree(renamed);
  const movedIds = new Set(leafKeys.map(k => "l:" + k));
  movedIds.add("g:" + newGroupName); // 見出し行も一緒に動かす
  const movedRows = flat.filter(r => movedIds.has(r.id));
  const restRows = flat.filter(r => !movedIds.has(r.id));
  restRows.push(...movedRows); // 新グループは末尾に追加
  return rebuildFromFlat(restRows);
}

// --- 内部ヘルパー ---

function rebuildFromFlat(flat) {
  // 直前の行(グループなら そのpath、明細なら その明細の現在のgroup_name)を、
  // 新しいgroup_nameとして引き継ぐ。並び順はflatの順番そのまま
  const out = [];
  let prevGroupName = "";
  for (const row of flat) {
    if (row.isGroup) { prevGroupName = row.path; continue; }
    const line = { ...row.line, group_name: prevGroupName };
    out.push(line);
    prevGroupName = line.group_name;
  }
  return out;
}

function leavesInTreeOrder(root) {
  const out = [];
  (function walk(node, path) {
    for (const child of node.children) {
      if (child.isGroup) walk(child, child.path);
      else out.push({ ...child.line, group_name: path });
    }
  })(root, "");
  return out;
}

function leavesOf(node, out = []) {
  for (const child of node.children) {
    if (child.isGroup) leavesOf(child, out);
    else out.push(child.line);
  }
  return out;
}

function findGroup(node, path) {
  if (node.path === path) return node;
  for (const child of node.children) {
    if (child.isGroup) {
      const found = findGroup(child, path);
      if (found) return found;
    }
  }
  return null;
}

function findParent(node, childPath) {
  for (const child of node.children) {
    if (child.isGroup && child.path === childPath) return node;
    if (child.isGroup) {
      const found = findParent(child, childPath);
      if (found) return found;
    }
  }
  return null;
}

function findLeafParent(node, leafKey) {
  for (const child of node.children) {
    if (!child.isGroup && child.line.key === leafKey) return node;
    if (child.isGroup) {
      const found = findLeafParent(child, leafKey);
      if (found) return found;
    }
  }
  return null;
}
