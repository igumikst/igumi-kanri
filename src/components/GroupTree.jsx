import { useState } from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  flattenGroupTree, groupAmount, listGroupPaths,
  reorderLeafAfter, moveLeafToGroup, moveLeafUpDown, moveGroupUpDown, moveGroupToParent, bundleIntoNewGroup,
} from "../lib/groupTree";

const td = { padding: "4px 6px", fontSize: 12, color: "#1F2937", verticalAlign: "top" };
const iconBtn = { border: "none", background: "none", cursor: "pointer", fontSize: 13, padding: "0 3px" };

// 明細の配列(group_nameを持つ)を、小計(グループ)つきの木構造として表示し、
// ドラッグ・上下ボタン・「このグループに移す」メニューで並べ替えられるようにする。
// DBには小計の行を保存しない(group_nameから毎回組み立てる)。
//
// props:
//   lines, onChange(newLines), amountOf(line), formatAmount(n),
//   renderLeafCells(line, {depth}) -> 配列(<td>たち。構造用の列は呼び出し側で足さない),
//   columnCount (renderLeafCellsが返す<td>の数。グループの見出し行のcolSpanに使う),
//   selectedKeys, onToggleSelect(key) (チェックボックス。無ければ非表示),
//   onDeleteLeaf(key) (任意)
// 見積編集画面だけが使う、任意の指定(指定が無いときは今までと同じ見た目・動き。取り込み画面は指定しない):
//   density: src/lib/quoteTableDensity.js の DENSITY の1つ。compact(oneLine)のときは、左に⠿だけ、
//            ↑↓・📂・選択・🗑 は右端に横一列。余白も小さくする
//   collapsedPaths(Set), onToggleGroup(path): グループの折りたたみ。閉じたグループの中身(入れ子も)は表示しない
//            (表示しない行は、ドラッグ・↑↓・選択の対象にもならない)
//   groupInfo(node) -> { count, warnCount }: 見出し行に出す件数と「原価未設定」の件数(入れ子の中も数える)
//   onAddToGroup(path): 見出し行に「＋まとめて追加」ボタンを出す(押すとそのグループのパスを渡す)
export default function GroupTree({
  lines, onChange, amountOf, formatAmount, renderLeafCells, columnCount,
  selectedKeys, onToggleSelect, onDeleteLeaf, rowStyle,
  density, collapsedPaths, onToggleGroup, groupInfo, onAddToGroup,
}) {
  const [menuFor, setMenuFor] = useState(null); // "このグループに移す" メニューを開いている行のid

  const compact = !!density?.oneLine;
  const ctrlTd = compact ? { ...td, padding: density.ctrlPad, fontSize: density.fontSize, verticalAlign: "middle", ...(density.lineHeight ? { lineHeight: density.lineHeight } : {}) } : td;
  const btn = compact ? { ...iconBtn, fontSize: density.iconFont, padding: "0 2px" } : iconBtn;
  const collapsible = !!onToggleGroup;
  const isHidden = r => {
    if (!collapsedPaths || collapsedPaths.size === 0) return false;
    const gp = r.isGroup ? r.path : (r.line.group_name || "");
    for (const p of collapsedPaths) {
      if (r.isGroup ? gp.startsWith(p + " > ") : (gp === p || gp.startsWith(p + " > "))) return true;
    }
    return false;
  };

  const rows = flattenGroupTree(lines).filter(r => !isHidden(r));
  const groupPaths = listGroupPaths(lines);
  const ids = rows.map(r => r.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleDragEnd = ({ active, over }) => {
    setMenuFor(null);
    if (!over || active.id === over.id) return;
    const leafKey = String(active.id).slice(2); // "l:" を外す
    onChange(reorderLeafAfter(lines, leafKey, over.id));
  };

  const MoveMenu = ({ rowId, isGroup, path, leafKey }) => (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setMenuFor(menuFor === rowId ? null : rowId)} title="このグループに移す" style={btn}>📂</button>
      {menuFor === rowId && (
        <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 20, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", minWidth: 180, maxHeight: 220, overflowY: "auto" }}>
          <div
            onClick={() => { onChange(isGroup ? moveGroupToParent(lines, path, "") : moveLeafToGroup(lines, leafKey, "")); setMenuFor(null); }}
            style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", color: "#374151", borderBottom: "1px solid #F3F4F6" }}>
            (トップレベル)
          </div>
          {groupPaths.filter(p => p !== path && !p.startsWith(path + " > ")).map(p => (
            <div key={p}
              onClick={() => { onChange(isGroup ? moveGroupToParent(lines, path, p) : moveLeafToGroup(lines, leafKey, p)); setMenuFor(null); }}
              style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", color: "#374151", borderBottom: "1px solid #F3F4F6" }}>
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}
      accessibility={{ container: typeof document !== "undefined" ? document.body : undefined }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {rows.map(r => {
          if (r.isGroup) {
            return (
              <GroupHeaderRow key={r.id} id={r.id}>
                {() => (
                  <>
                    <td style={{ ...ctrlTd, width: compact ? 18 : 60, whiteSpace: "nowrap", background: "#FFF7ED" }}>
                      {!compact && <>
                        <button onClick={() => onChange(moveGroupUpDown(lines, r.path, -1))} title="上へ" style={btn}>↑</button>
                        <button onClick={() => onChange(moveGroupUpDown(lines, r.path, 1))} title="下へ" style={btn}>↓</button>
                      </>}
                    </td>
                    <td colSpan={columnCount} style={{ ...ctrlTd, paddingLeft: 6 + r.depth * 16, fontWeight: 700, color: "#9A3412", background: "#FFF7ED" }}>
                      <GroupHeaderContent r={r} info={groupInfo ? groupInfo(r.node) : null} closed={!!collapsedPaths?.has(r.path)}
                        collapsible={collapsible} onToggleGroup={onToggleGroup} btn={btn} amount={formatAmount(groupAmount(r.node, amountOf))} onAddToGroup={onAddToGroup} />
                    </td>
                    <td style={compact ? { ...ctrlTd, background: "#FFF7ED", whiteSpace: "nowrap" } : { ...td, background: "#FFF7ED" }}>
                      {compact && <>
                        <button onClick={() => onChange(moveGroupUpDown(lines, r.path, -1))} title="上へ" style={btn}>↑</button>
                        <button onClick={() => onChange(moveGroupUpDown(lines, r.path, 1))} title="下へ" style={btn}>↓</button>
                      </>}
                      <MoveMenu rowId={r.id} isGroup path={r.path} />
                    </td>
                  </>
                )}
              </GroupHeaderRow>
            );
          }
          const cells = renderLeafCells(r.line, { depth: r.depth });
          const bg = rowStyle ? rowStyle(r.line) : undefined;
          return (
            <SortableLeafRow key={r.id} id={r.id} background={bg}>
              {(dragAttrs, dragListeners, isDragging) => (
                <>
                  <td style={{ ...ctrlTd, width: compact ? 18 : 60, whiteSpace: "nowrap", opacity: isDragging ? 0.4 : 1, background: isDragging ? undefined : bg }}>
                    <span {...dragAttrs} {...dragListeners} title="ドラッグで移動" style={{ cursor: "grab", marginRight: compact ? 0 : 3, touchAction: "none" }}>⠿</span>
                    {!compact && <>
                      <button onClick={() => onChange(moveLeafUpDown(lines, r.line.key, -1))} title="上へ" style={btn}>↑</button>
                      <button onClick={() => onChange(moveLeafUpDown(lines, r.line.key, 1))} title="下へ" style={btn}>↓</button>
                    </>}
                  </td>
                  {cells}
                  <td style={compact ? { ...ctrlTd, whiteSpace: "nowrap" } : td}>
                    {compact && <>
                      <button onClick={() => onChange(moveLeafUpDown(lines, r.line.key, -1))} title="上へ" style={btn}>↑</button>
                      <button onClick={() => onChange(moveLeafUpDown(lines, r.line.key, 1))} title="下へ" style={btn}>↓</button>
                    </>}
                    <MoveMenu rowId={r.id} isGroup={false} path={r.line.group_name || ""} leafKey={r.line.key} />
                    {onToggleSelect && (
                      <input type="checkbox" checked={!!selectedKeys?.has(r.line.key)} onChange={() => onToggleSelect(r.line.key)}
                        title="選んでグループにまとめる" style={compact ? { marginLeft: 3, verticalAlign: "middle" } : { marginLeft: 6 }} />
                    )}
                    {onDeleteLeaf && (
                      <button onClick={() => onDeleteLeaf(r.line.key)} title="削除" style={{ ...btn, color: "#DC2626", marginLeft: compact ? 2 : 4 }}>🗑</button>
                    )}
                  </td>
                </>
              )}
            </SortableLeafRow>
          );
        })}
      </SortableContext>
    </DndContext>
  );
}

// グループの見出し行の中身(小計の名前・件数・原価未設定の警告・小計の金額)。
// info が無い(取り込み画面)ときは、今までどおり「小計: 名前」と金額だけ
function GroupHeaderContent({ r, info, closed, collapsible, onToggleGroup, btn, amount, onAddToGroup }) {
  if (!info && !collapsible && !onAddToGroup) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>小計: {r.name}</span>
        <span>{amount}</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {collapsible && (
          <button onClick={() => onToggleGroup(r.path)} title={closed ? "開く" : "閉じる"} style={{ ...btn, color: "#9A3412", width: 18 }}>{closed ? "▶" : "▼"}</button>
        )}
        <span style={info ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : undefined}>小計: {r.name}</span>
        {info && <span style={{ fontSize: 10, fontWeight: 600, color: "#B45309", whiteSpace: "nowrap" }}>({info.count}件)</span>}
        {info && info.warnCount > 0 && (
          <span title="原価単価が未入力・未確認の行(この中の入れ子も含む)。社内用の表示です" style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: 4, padding: "0 5px", whiteSpace: "nowrap" }}>⚠️ 原価未設定 {info.warnCount}件🔒</span>
        )}
        {onAddToGroup && (
          <button onClick={() => onAddToGroup(r.path)} title="このグループに、単価表の項目をまとめて追加" style={{ fontSize: 10, fontWeight: 700, color: "#3730A3", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 4, padding: "0 6px", cursor: "pointer", whiteSpace: "nowrap", lineHeight: "16px" }}>＋まとめて追加</button>
        )}
      </span>
      <span style={info ? { whiteSpace: "nowrap" } : undefined}>{amount}</span>
    </div>
  );
}

function SortableLeafRow({ id, children, background }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, background: isDragging ? "#EEF2FF" : background, borderBottom: "1px solid #F3F4F6" };
  return <tr ref={setNodeRef} style={style}>{children(attributes, listeners, isDragging)}</tr>;
}

function GroupHeaderRow({ id, children }) {
  const { setNodeRef, transform, transition } = useSortable({ id, disabled: true });
  const style = { transform: CSS.Transform.toString(transform), transition, borderBottom: "1px solid #F3F4F6" };
  return <tr ref={setNodeRef} style={style}>{children()}</tr>;
}

// 「選んだ行を新しいグループにまとめる」ツールバー。呼び出し側が、tableの外(上や下)に置く
export function BundleToolbar({ lines, onChange, selectedKeys, setSelectedKeys }) {
  const [name, setName] = useState("");
  if (!selectedKeys || selectedKeys.size < 2) return null;
  const confirm = () => {
    if (!name.trim()) return;
    onChange(bundleIntoNewGroup(lines, [...selectedKeys], name.trim()));
    setSelectedKeys(new Set());
    setName("");
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", background: "#EEF2FF", border: "1.5px solid #C7D2FE", borderRadius: 8, padding: "6px 8px", marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "#3730A3", fontWeight: 700, whiteSpace: "nowrap" }}>選んだ{selectedKeys.size}件を、新しいグループに:</span>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="グループ名" style={{ flex: 1, minWidth: 100, padding: "4px 8px", borderRadius: 6, border: "1.5px solid #C7D2FE", fontSize: 12 }} />
      <button onClick={confirm} disabled={!name.trim()} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: name.trim() ? "#3730A3" : "#C7D2FE", color: "#fff", fontSize: 12, fontWeight: 700, cursor: name.trim() ? "pointer" : "default" }}>まとめる</button>
      <button onClick={() => setSelectedKeys(new Set())} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #C7D2FE", background: "#fff", color: "#3730A3", fontSize: 12, cursor: "pointer" }}>選択を解除</button>
    </div>
  );
}
