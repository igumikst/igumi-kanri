import { useMemo, useState } from "react";
import { fmt } from "../lib/constants";

// 見積編集画面の「＋まとめて追加」: 入れ先の大項目を決めて、単価表の項目をチェックで複数選び、数量も入れて一度に追加する。
// - 入れ先は、今ある大項目(グループのパス)か、新しい大項目の名前
// - 人工の項目(labor_manual)は、数量の欄が「人工数」になる
// - 入れ先にすでに入っている項目には「入れ済み」を出す(止めない)
// - 行の作り方・入れる位置は呼び出し側(Quotes.jsx)が決める。この部品は選んだ結果を onAdd に渡すだけで、DBには触らない
// 将来「過去の見積から」を足すときは、PriceSourceList と同じ形(picks・togglePick・setQty)の一覧を作り、
// 上にタブを付けて切り替える(入れ先・下の合計バーはそのまま使う)。
//
// props:
//   items: 今の単価セットの単価項目, groups: 今の単価セットの単価グループ, groupsMap: id → 単価グループ
//   groupPaths: 今ある大項目のパス一覧, initialTarget: 最初に選んでおく入れ先("" なら新しい大項目)
//   lines: 今の明細(「入れ済み」の判定に使う), laborUnitPrice: 人工単価
//   isPC, onClose(), onAdd({ target, picks: [{ item, qty }] })  ※picks はチェックした順
const NEW_TARGET = "__new__";
const isLabor = item => item.item_type === "labor_manual";

export default function PriceMultiPicker({ items, groups, groupsMap, groupPaths, initialTarget, lines, laborUnitPrice, isPC, onClose, onAdd }) {
  const [target, setTarget] = useState(initialTarget && groupPaths.includes(initialTarget) ? initialTarget : NEW_TARGET);
  const [newName, setNewName] = useState("");
  const [picks, setPicks] = useState(() => new Map()); // price_item_id → 数量の文字列(Map の順番 = チェックした順)

  const targetPath = target === NEW_TARGET ? newName.trim() : target;
  // 入れ先の大項目に、直接入っている単価項目の数(price_item_id → 件数)
  const existing = useMemo(() => {
    const m = new Map();
    if (!targetPath) return m;
    for (const l of lines) if ((l.group_name || "") === targetPath && l.price_item_id) m.set(l.price_item_id, (m.get(l.price_item_id) || 0) + 1);
    return m;
  }, [lines, targetPath]);

  const togglePick = item => setPicks(prev => {
    const n = new Map(prev);
    if (n.has(item.id)) n.delete(item.id); else n.set(item.id, "1");
    return n;
  });
  const setQty = (id, v) => setPicks(prev => new Map(prev).set(id, v));

  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items]);
  const chosen = [...picks].map(([id, qty]) => ({ item: itemById[id], qty })).filter(p => p.item);
  const amountOf = p => isLabor(p.item) ? (Number(p.qty) || 0) * laborUnitPrice : (Number(p.qty) || 0) * (Number(p.item.sale_price) || 0);
  const sum = chosen.reduce((s, p) => s + amountOf(p), 0);
  const badQty = chosen.filter(p => !(Number(p.qty) > 0));
  const problem = !chosen.length ? "項目を選んでください"
    : !targetPath ? "新しい大項目の名前を入れてください"
    : badQty.length ? `数量(人工数)が空か0の項目があります(${badQty.length}件)`
    : "";

  const submit = () => {
    if (problem) return;
    onAdd({ target: targetPath, picks: chosen.map(p => ({ item: p.item, qty: Number(p.qty) })) });
  };

  const box = isPC
    ? { width: "min(760px, 94vw)", maxHeight: "88vh", borderRadius: 14 }
    : { width: "100%", height: "100%", borderRadius: 0 };
  const sel = { padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", color: "#1F2937", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ ...box, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 15, color: "#1A3A5C" }}>☑ 単価表からまとめて追加</div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "#6B7280", cursor: "pointer" }}>閉じる</button>
        </div>

        <div style={{ padding: "10px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>入れ先の大項目</span>
          <select value={target} onChange={e => setTarget(e.target.value)} style={{ ...sel, flex: 1, minWidth: 160 }}>
            {groupPaths.map(p => <option key={p} value={p}>{p}</option>)}
            <option value={NEW_TARGET}>＋ 新しい大項目を作る</option>
          </select>
          {target === NEW_TARGET && (
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="新しい大項目の名前" autoFocus style={{ ...sel, flex: 1, minWidth: 160, borderColor: "#E07B39" }} />
          )}
        </div>

        <PriceSourceList items={items} groups={groups} groupsMap={groupsMap} picks={picks} togglePick={togglePick} setQty={setQty} existing={existing} laborUnitPrice={laborUnitPrice} isPC={isPC} />

        <div style={{ borderTop: "1px solid #E5E7EB", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, background: "#F9FAFB" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#1A3A5C" }}>選んだ {chosen.length}件 / 合計 {fmt(sum)}</div>
            {problem && chosen.length > 0 && <div style={{ fontSize: 11, color: "#B45309" }}>{problem}</div>}
          </div>
          <button onClick={submit} disabled={!!problem} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: problem ? "#C7D2FE" : "#1A3A5C", color: "#fff", fontSize: 14, fontWeight: 800, cursor: problem ? "default" : "pointer", whiteSpace: "nowrap" }}>追加する</button>
        </div>
      </div>
    </div>
  );
}

// 単価表の一覧(検索・グループの絞り込み・単価グループごとの見出し)。チェックした行だけ数量の欄を出す
function PriceSourceList({ items, groups, groupsMap, picks, togglePick, setQty, existing, laborUnitPrice, isPC }) {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);

  const t = search.trim().toLowerCase();
  const shown = items.filter(i => {
    if (onlyPicked && !picks.has(i.id)) return false;
    if (groupFilter && i.price_group_id !== groupFilter) return false;
    if (t && !(i.name || "").toLowerCase().includes(t) && !(i.spec || "").toLowerCase().includes(t)) return false;
    return true;
  });
  // 単価グループごとにまとめる(単価表の並び順のまま)
  const sections = [];
  const byGroup = new Map();
  for (const i of shown) {
    const gid = i.price_group_id || "";
    if (!byGroup.has(gid)) { const s = { gid, name: groupsMap[gid]?.name || "(グループなし)", items: [] }; byGroup.set(gid, s); sections.push(s); }
    byGroup.get(gid).items.push(i);
  }
  const inp = { padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", color: "#1F2937", boxSizing: "border-box" };

  return (
    <>
      <div style={{ padding: "10px 14px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・仕様で検索" style={{ ...inp, flex: 2, minWidth: 160 }} />
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{ ...inp, flex: 1, minWidth: 130 }}>
          <option value="">グループ: すべて</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={onlyPicked} onChange={e => setOnlyPicked(e.target.checked)} />選んだ項目だけ
        </label>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px", minHeight: 120 }}>
        {sections.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>該当する項目がありません</div>}
        {sections.map(s => (
          <div key={s.gid}>
            <div style={{ position: "sticky", top: 0, background: "#F3F4F6", fontSize: 11, fontWeight: 700, color: "#4B5563", padding: "4px 8px", borderRadius: 4, marginTop: 6, zIndex: 1 }}>{s.name}</div>
            {s.items.map(item => {
              const on = picks.has(item.id);
              const labor = isLabor(item);
              const dup = existing.get(item.id) || 0;
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: isPC ? "6px 6px" : "10px 6px", borderBottom: "1px solid #F3F4F6", background: on ? "#EEF2FF" : undefined }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, cursor: "pointer" }}>
                    <input type="checkbox" checked={on} onChange={() => togglePick(item)} style={{ width: isPC ? 15 : 20, height: isPC ? 15 : 20, flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#1F2937" }}>
                        {labor ? "👷 " : ""}{item.name}
                        {dup > 0 && <span title="入れ先の大項目に、同じ単価項目がすでに入っています(追加はできます)" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 4, padding: "0 4px", whiteSpace: "nowrap" }}>入れ済み{dup > 1 ? ` ×${dup}` : ""}</span>}
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: "#9CA3AF" }}>
                        {item.spec}{item.spec ? " ・ " : ""}{labor ? `人工数で入力(1人工 ${fmt(laborUnitPrice)})` : `${fmt(item.sale_price)} / ${item.unit || ""}`}
                      </span>
                    </span>
                  </label>
                  {on && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                      <input type="number" min="0" step={labor ? "0.5" : "any"} value={picks.get(item.id)} onChange={e => setQty(item.id, e.target.value)}
                        aria-label={labor ? "人工数" : "数量"} style={{ width: isPC ? 64 : 76, padding: isPC ? "4px 6px" : "8px 6px", borderRadius: 6, border: "1.5px solid #A5B4FC", fontSize: isPC ? 12 : 15, textAlign: "right", color: "#1F2937", boxSizing: "border-box" }} />
                      <span style={{ fontSize: 11, color: "#6B7280", minWidth: 22 }}>{labor ? "人工" : (item.unit || "")}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
