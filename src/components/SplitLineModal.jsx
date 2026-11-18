import { useState } from "react";
import { Modal, Inp } from "./UI";
import { computeSplit } from "../lib/lineSplit";

// 明細1行を自社分・下請け分の2行に分ける画面(第9弾テーマ3)。見積編集・見積ファイル
// 取り込みの両方で使う共通部品。数量・単価・名前だけ受け取り、実際にどう2行に
// 分けて差し替えるか(項目名・keyの作り方など、画面ごとに違う部分)は、
// onConfirm(ownQty, subQty) を呼び出す側に任せる。
export default function SplitLineModal({ name, qty, price, fmt, onClose, onConfirm }) {
  const [mode, setMode] = useState("qty");
  const [value, setValue] = useState("");
  const { subQty, ownQty, valid } = computeSplit({ qty, price, mode, rawValue: value });
  const confirm = () => { if (valid) onConfirm(ownQty, subQty); };

  return (
    <Modal title={`分割: ${name || "(品名未入力)"}`} onClose={onClose} onSave={valid ? confirm : undefined}>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 1.6 }}>
        今の数量 {qty} ・ 単価 {fmt(price)} ・ 金額 {fmt(qty * price)}<br />
        自社分・下請け分の2行に分けます。単価は変えないので、2行の金額の合計は、今の金額とぴったり同じになります。
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="radio" checked={mode === "qty"} onChange={() => setMode("qty")} /> 数量で分ける
        </label>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: price ? "pointer" : "default", opacity: price ? 1 : 0.4 }}>
          <input type="radio" disabled={!price} checked={mode === "amount"} onChange={() => setMode("amount")} /> 金額で分ける{!price && "(単価が0のため使えません)"}
        </label>
      </div>
      <Inp label={`下請け分の${mode === "qty" ? "数量" : "金額(税抜)"}(自社分は、残りから自動で計算します)`} type="number" value={value} onChange={e => setValue(e.target.value)} />
      {value !== "" && !valid && (
        <div style={{ fontSize: 11, color: "#DC2626", marginBottom: 8 }}>0より大きく、今の{mode === "qty" ? "数量" : "金額"}未満の数を入れてください</div>
      )}
      {valid && (
        <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
          自社分: 数量 {ownQty} ・ 金額 {fmt(ownQty * price)}<br />
          下請け分: 数量 {subQty} ・ 金額 {fmt(subQty * price)}(この行だけ「下請け施工」にチェックが付きます)
        </div>
      )}
    </Modal>
  );
}
