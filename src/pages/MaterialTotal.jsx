import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";

// 材料の合計額ツール(第9弾・2026-11-19)
// ゆうかちゃんの頭の中にある材料の金額を material_prices テーブルに貯めておき、
// スマホで材料を選んで数量を入れると、合計額がすぐ出る画面。
// このページは「読むだけ」: 材料の登録・修正・削除は、虎生がSupabaseのSQLで行う
// (誰でも触れると、間違った金額が登録されてしまうため)。

// 検索のゆらぎを吸収する: 全角→半角(NFKC)、大文字→小文字、空白を除く
const norm = (s) => (s == null ? "" : String(s)).normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const yen = (n) => "¥" + Math.round(Number(n) || 0).toLocaleString();

// solo: 協力業社用(/?tool=zairyo)。ホームへ戻るボタンや共有ボタンを出さず、この画面だけを使ってもらう
export default function MaterialTotal({ cust, pp, nav, solo }) {
  const [items, setItems] = useState([]); // DBに登録された材料
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]); // 選んだ材料 [{key,name,price,qty,manual}]
  const [manual, setManual] = useState({ name: "", price: "" }); // その場だけの手入力(保存しない)
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("material_prices")
        .select("id,name,price")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) setLoadError(true);
      setItems(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const k = norm(q);
    if (!k) return items;
    return items.filter((it) => norm(it.name).includes(k));
  }, [items, q]);

  const pickedQty = useMemo(() => {
    const m = {};
    for (const p of picked) m[p.key] = p.qty;
    return m;
  }, [picked]);

  // 一覧をタップ: まだ無ければ追加、すでにあれば数量+1
  const addItem = (it) => {
    setPicked((prev) => {
      const key = `db:${it.id}`;
      const i = prev.findIndex((p) => p.key === key);
      if (i >= 0) return prev.map((p, idx) => (idx === i ? { ...p, qty: (Number(p.qty) || 0) + 1 } : p));
      return [...prev, { key, name: it.name, price: it.price, qty: 1, manual: false }];
    });
  };

  const addManual = () => {
    const name = manual.name.trim();
    const price = Math.round(Number(manual.price));
    if (!name) { alert("材料の名前を入れてください"); return; }
    if (manual.price === "" || !Number.isFinite(price) || price < 0) { alert("金額は0以上の数字で入れてください"); return; }
    setPicked((prev) => [...prev, { key: `m:${Date.now()}`, name, price, qty: 1, manual: true }]);
    setManual({ name: "", price: "" });
  };

  // 数量: 入力中は文字のまま持ち、計算のときに数字にする(空欄やスマホの入力途中でも落ちないように)
  const setQty = (key, v) => setPicked((prev) => prev.map((p) => (p.key === key ? { ...p, qty: v } : p)));
  const stepQty = (key, d) =>
    setPicked((prev) => prev.map((p) => (p.key === key ? { ...p, qty: Math.max(1, (Number(p.qty) || 0) + d) } : p)));
  const removeItem = (key) => setPicked((prev) => prev.filter((p) => p.key !== key));

  const lineTotal = (p) => Math.round((Number(p.price) || 0) * (Number(p.qty) || 0));
  const total = picked.reduce((s, p) => s + lineTotal(p), 0);

  // LINEにそのまま貼れる文章にしてコピー
  const copyText = async () => {
    const lines = picked.map((p) => `・${p.name} ${yen(p.price)} ×${Number(p.qty) || 0} = ${yen(lineTotal(p))}`);
    const text = ["【材料の合計】", ...lines, `合計 ${yen(total)}`].join("\n");
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      // クリップボードが使えない環境向けの、昔ながらの方法
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch { alert("コピーできませんでした"); }
      document.body.removeChild(ta);
    }
  };

  const card = { background: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 12 };
  const label = { fontSize: 11, color: "#9CA3AF", fontWeight: 700, marginBottom: 6 };
  const inp = { border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", color: "#1F2937", boxSizing: "border-box", width: "100%" };
  const qtyBtn = { width: 34, height: 34, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F9FAFB", fontSize: 16, fontWeight: 800, color: "#374151", cursor: "pointer", flexShrink: 0 };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      <div style={{ background: `linear-gradient(135deg,${cust.c1},${cust.c2})`, padding: "16px 20px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!solo && <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>←</button>}
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>💴 材料の合計額{solo ? "(株式会社IGUMI)" : ""}</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>材料を選んで数量を入れると、合計が出ます</div>
          </div>
          {!solo && (
            <button
              onClick={async () => {
                const url = `${window.location.origin}/?tool=zairyo`;
                try { await navigator.clipboard.writeText(url); } catch { window.prompt("このURLをコピーしてください", url); }
                setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800);
              }}
              style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
              {linkCopied ? "✅ コピー済" : "🔗 協力業社用URL"}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "16px 16px 40px", maxWidth: 560, margin: "0 auto" }}>
        {/* 選んだ材料と合計 */}
        {picked.length > 0 && (
          <div style={card}>
            <div style={label}>選んだ材料</div>
            {picked.map((p) => (
              <div key={p.key} style={{ borderBottom: "1px solid #F3F4F6", padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", overflowWrap: "anywhere" }}>
                      {p.name}
                      {p.manual && <span style={{ fontSize: 10, color: "#D97706", background: "#FEF3C7", borderRadius: 6, padding: "1px 6px", marginLeft: 6, fontWeight: 700 }}>手入力</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{yen(p.price)} / 単位</div>
                  </div>
                  <button onClick={() => removeItem(p.key)} style={{ border: "none", background: "none", color: "#9CA3AF", fontSize: 16, cursor: "pointer", padding: 4, flexShrink: 0 }}>✕</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <button onClick={() => stepQty(p.key, -1)} style={qtyBtn}>−</button>
                  <input
                    type="number" inputMode="decimal" min="0" step="any" value={p.qty}
                    onChange={(e) => setQty(p.key, e.target.value)}
                    style={{ ...inp, width: 76, textAlign: "center", padding: "8px 6px" }}
                  />
                  <button onClick={() => stepQty(p.key, 1)} style={qtyBtn}>＋</button>
                  <div style={{ flex: 1, textAlign: "right", fontSize: 15, fontWeight: 800, color: "#1A3A5C" }}>{yen(lineTotal(p))}</div>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>合計({picked.length}品)</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#E07B39" }}>{yen(total)}</div>
            </div>
            <button onClick={copyText}
              style={{ width: "100%", marginTop: 10, padding: "12px", borderRadius: 10, border: "none", background: copied ? "#059669" : "#1A3A5C", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              {copied ? "✅ コピーしました" : "📋 文章でコピー(LINEに貼れる形)"}
            </button>
          </div>
        )}

        {/* 材料の検索と一覧 */}
        <div style={card}>
          <div style={label}>材料をさがす(タップで追加。もう一度タップで数量+1)</div>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="例: 銅変換 / VP100 / エルボ"
            style={{ ...inp, marginBottom: 10 }}
          />
          {loading ? (
            <div style={{ textAlign: "center", padding: 24, color: "#9CA3AF", fontSize: 13 }}>読み込み中...</div>
          ) : loadError ? (
            <div style={{ textAlign: "center", padding: 24, color: "#DC2626", fontSize: 13 }}>材料の読み込みに失敗しました。通信を確認して、開き直してください</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 12px", color: "#9CA3AF", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              材料はまだ登録されていません。<br />登録は、虎生がSupabaseから行います
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#9CA3AF", fontSize: 13 }}>
              「{q}」に合う材料が見つかりません。<br />下の「その場だけの手入力」で金額を入れられます
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {filtered.map((it) => (
                <button key={it.id} onClick={() => addItem(it)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: pickedQty[`db:${it.id}`] ? "#EFF6FF" : "#fff", border: "none", borderBottom: "1px solid #F3F4F6", padding: "12px 6px", cursor: "pointer" }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#1F2937", overflowWrap: "anywhere" }}>{it.name}</div>
                  {pickedQty[`db:${it.id}`] && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#2563EB", background: "#DBEAFE", borderRadius: 10, padding: "2px 8px", flexShrink: 0 }}>×{pickedQty[`db:${it.id}`]}</span>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1A3A5C", flexShrink: 0 }}>{yen(it.price)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* その場だけの手入力(保存しない) */}
        <div style={card}>
          <div style={label}>その場だけの手入力(一覧に無い材料。保存はされません)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={manual.name} onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))} placeholder="材料の名前" style={{ ...inp, flex: 1 }} />
            <input value={manual.price} onChange={(e) => setManual((m) => ({ ...m, price: e.target.value }))} placeholder="金額" type="number" inputMode="numeric" min="0" style={{ ...inp, width: 96 }} />
            <button onClick={addManual} style={{ padding: "0 16px", borderRadius: 8, border: "none", background: "#E07B39", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", flexShrink: 0 }}>追加</button>
          </div>
        </div>
      </div>
    </div>
  );
}
