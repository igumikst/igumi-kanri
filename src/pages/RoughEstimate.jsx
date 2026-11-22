import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { TAX_RATE_PERCENT, TAX_ROUNDING, roundBy } from "../lib/quoteExport/loadQuoteForExport";

// 概算費用計算(現場用)。
// お客さんや取引先に「今日の調査費用はいくら?」と聞かれたとき、現場の人がスマホで、その場で概算を出す画面。
// 項目と金額は、これまでに作った「調査」の見積(タイトルに「調査」が入っている見積。調査+復旧も含む)の
// 明細から自動で集める。新しい項目表は作らない(DBの変更なし)。
// 金額は、見積に出した金額(IGUMI販売の単価)の、いちばん新しい見積のものを使う。原価は読まない。
// このページは「読むだけ」。

const norm = (s) => (s == null ? "" : String(s)).normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const yen = (n) => "¥" + Math.round(Number(n) || 0).toLocaleString();
const taxOf = (amount) => roundBy(TAX_ROUNDING, (Number(amount) || 0) * TAX_RATE_PERCENT / 100);

const QUOTE_LIMIT = 200; // 新しい調査見積から、これだけ読む
const CHUNK = 20; // 明細は、見積20件ずつ読む(1回で返る行数の上限を超えないように)

export default function RoughEstimate({ cust, pp, nav }) {
  const [items, setItems] = useState([]); // { key, name, unit, price, minPrice, maxPrice, count }
  const [quoteCount, setQuoteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState({}); // { [key]: 数量(入力中は文字のまま) }
  const [manualList, setManualList] = useState([]); // その場だけの手入力 [{key,name,price,qty}]
  const [manual, setManual] = useState({ name: "", price: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: quotes, error } = await supabase
          .from("quotes").select("id,created_at,title")
          .ilike("title", "%調査%")
          .order("created_at", { ascending: false })
          .limit(QUOTE_LIMIT);
        if (error) throw error;
        const rank = {}; // 見積id → 新しい順の番号(0が一番新しい)
        (quotes || []).forEach((x, i) => { rank[x.id] = i; });
        const ids = (quotes || []).map(x => x.id);
        const chunks = [];
        for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(c =>
          supabase.from("quote_items").select("quote_id,name,spec,unit,sale_price").in("quote_id", c)
        ));
        const rows = [];
        for (const r of results) {
          if (r.error) throw r.error;
          rows.push(...(r.data || []));
        }
        // 品名・規格・単位が同じ明細を1つにまとめる。金額は、いちばん新しい見積のもの
        const map = new Map();
        for (const r of rows) {
          const price = Number(r.sale_price);
          const name = String(r.name || "").trim();
          if (!name || !Number.isFinite(price) || price <= 0) continue;
          const key = `${norm(r.name)}|${norm(r.spec)}|${norm(r.unit)}`;
          const rk = rank[r.quote_id] ?? 999999;
          const cur = map.get(key);
          if (!cur) {
            map.set(key, { key, name: r.spec ? `${name} ${String(r.spec).trim()}` : name, unit: r.unit || "", price, newest: rk, minPrice: price, maxPrice: price, quotes: new Set([r.quote_id]) });
          } else {
            cur.quotes.add(r.quote_id);
            cur.minPrice = Math.min(cur.minPrice, price);
            cur.maxPrice = Math.max(cur.maxPrice, price);
            if (rk < cur.newest) { cur.newest = rk; cur.price = price; }
          }
        }
        const list = [...map.values()].map(x => ({ ...x, count: x.quotes.size }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
        if (alive) { setItems(list); setQuoteCount(ids.length); }
      } catch {
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const k = norm(q);
    return k ? items.filter(it => norm(it.name).includes(k)) : items;
  }, [items, q]);

  const toggle = (key) => setPicked(p => { const n = { ...p }; if (key in n) delete n[key]; else n[key] = 1; return n; });
  const setQty = (key, v) => setPicked(p => ({ ...p, [key]: v }));
  const stepQty = (key, d) => setPicked(p => ({ ...p, [key]: Math.max(1, (Number(p[key]) || 0) + d) }));

  const addManual = () => {
    const name = manual.name.trim();
    const price = Math.round(Number(manual.price));
    if (!name) { alert("項目の名前を入れてください"); return; }
    if (manual.price === "" || !Number.isFinite(price) || price < 0) { alert("金額は0以上の数字で入れてください"); return; }
    setManualList(l => [...l, { key: `m:${Date.now()}`, name, price, qty: 1 }]);
    setManual({ name: "", price: "" });
  };
  const setManualQty = (key, v) => setManualList(l => l.map(m => m.key === key ? { ...m, qty: v } : m));
  const removeManual = (key) => setManualList(l => l.filter(m => m.key !== key));

  // 選んだ項目(一覧の順)+手入力の項目
  const lines = [
    ...items.filter(it => it.key in picked).map(it => ({ key: it.key, name: it.name, unit: it.unit, price: it.price, qty: Number(picked[it.key]) || 0 })),
    ...manualList.map(m => ({ key: m.key, name: m.name, unit: "", price: m.price, qty: Number(m.qty) || 0 })),
  ];
  const lineTotal = (l) => Math.round(l.price * l.qty);
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const tax = taxOf(subtotal);

  const copyText = async () => {
    const rows = lines.map(l => `・${l.name} ${yen(l.price)} ×${l.qty} = ${yen(lineTotal(l))}`);
    const text = ["【概算費用】", ...rows, `小計(税抜) ${yen(subtotal)}`, `消費税 ${yen(tax)}`, `合計(税込) ${yen(subtotal + tax)}`, "※概算です。現地の状況で変わることがあります"].join("\n");
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    try { await navigator.clipboard.writeText(text); done(); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
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
          <button onClick={() => nav("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>💰 概算費用計算</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>調査・復旧の項目にチェックを入れると、概算が出ます</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 16px 150px", maxWidth: 560, margin: "0 auto" }}>
        <div style={card}>
          <div style={label}>項目をさがす(チェックを入れると、下の合計に入ります)</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例: 調査 / 点検口 / 復旧 / 出張" style={{ ...inp, marginBottom: 6 }} />
          {!loading && !loadError && items.length > 0 && (
            <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>調査の見積{quoteCount}件の明細から集めています。よく使う順に並んでいます。金額は、いちばん新しい見積のものです</div>
          )}
          {loading ? (
            <div style={{ textAlign: "center", padding: 24, color: "#9CA3AF", fontSize: 13 }}>読み込み中...</div>
          ) : loadError ? (
            <div style={{ textAlign: "center", padding: 24, color: "#DC2626", fontSize: 13 }}>読み込みに失敗しました。通信を確認して、開き直してください</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 12px", color: "#9CA3AF", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              タイトルに「調査」が入った見積が、まだありません
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#9CA3AF", fontSize: 13 }}>「{q}」に合う項目がありません。下の手入力で金額を入れられます</div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {filtered.map((it) => {
                const on = it.key in picked;
                return (
                  <div key={it.key} style={{ borderBottom: "1px solid #F3F4F6", background: on ? "#EFF6FF" : "#fff", padding: "10px 6px" }}>
                    <div onClick={() => toggle(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${on ? "#2563EB" : "#9CA3AF"}`, background: on ? "#2563EB" : "#fff", color: "#fff", fontSize: 16, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on ? "✓" : ""}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", overflowWrap: "anywhere" }}>{it.name}</div>
                        {it.minPrice !== it.maxPrice && <div style={{ fontSize: 10, color: "#D97706", marginTop: 2 }}>見積によって {yen(it.minPrice)}〜{yen(it.maxPrice)}</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1A3A5C" }}>{yen(it.price)}</div>
                        {it.unit && <div style={{ fontSize: 10, color: "#9CA3AF" }}>/ {it.unit}</div>}
                      </div>
                    </div>
                    {on && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingLeft: 34 }}>
                        <button onClick={() => stepQty(it.key, -1)} style={qtyBtn}>−</button>
                        <input type="number" inputMode="decimal" min="0" step="any" value={picked[it.key]} onChange={(e) => setQty(it.key, e.target.value)} style={{ ...inp, width: 76, textAlign: "center", padding: "8px 6px" }} />
                        <button onClick={() => stepQty(it.key, 1)} style={qtyBtn}>＋</button>
                        <div style={{ flex: 1, textAlign: "right", fontSize: 14, fontWeight: 800, color: "#1A3A5C" }}>{yen(it.price * (Number(picked[it.key]) || 0))}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={label}>その場だけの手入力(一覧に無い項目。保存はされません)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={manual.name} onChange={(e) => setManual(m => ({ ...m, name: e.target.value }))} placeholder="項目の名前" style={{ ...inp, flex: 1 }} />
            <input value={manual.price} onChange={(e) => setManual(m => ({ ...m, price: e.target.value }))} placeholder="金額" type="number" inputMode="numeric" min="0" style={{ ...inp, width: 96 }} />
            <button onClick={addManual} style={{ padding: "0 16px", borderRadius: 8, border: "none", background: "#E07B39", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", flexShrink: 0 }}>追加</button>
          </div>
          {manualList.map(m => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1F2937", overflowWrap: "anywhere" }}>{m.name}<span style={{ color: "#9CA3AF", fontWeight: 400 }}> {yen(m.price)}</span></div>
              <input type="number" inputMode="decimal" min="0" step="any" value={m.qty} onChange={(e) => setManualQty(m.key, e.target.value)} style={{ ...inp, width: 64, textAlign: "center", padding: "6px" }} />
              <button onClick={() => removeManual(m.key)} style={{ border: "none", background: "none", color: "#9CA3AF", fontSize: 16, cursor: "pointer", padding: 4 }}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 4 }}>
          <button onClick={() => nav("materialtotal")} style={{ background: "none", border: "none", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>💴 材料の合計額(材料の金額から出す)はこちら</button>
        </div>
      </div>

      {/* 合計(画面の下に固定) */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", boxShadow: "0 -2px 12px rgba(0,0,0,0.12)", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", zIndex: 60 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
              <div>{lines.length}項目 / 税抜 <b style={{ color: "#1F2937" }}>{yen(subtotal)}</b></div>
              <div>消費税 {yen(tax)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>税込の概算</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#E07B39" }}>{yen(subtotal + tax)}</div>
            </div>
          </div>
          <button onClick={copyText} disabled={lines.length === 0}
            style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "none", background: lines.length === 0 ? "#D1D5DB" : copied ? "#059669" : "#1A3A5C", color: "#fff", fontWeight: 800, fontSize: 14, cursor: lines.length === 0 ? "default" : "pointer" }}>
            {copied ? "✅ コピーしました" : "📋 文章でコピー(LINEに貼れる形)"}
          </button>
        </div>
      </div>
    </div>
  );
}
