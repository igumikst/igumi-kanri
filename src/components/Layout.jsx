import { useState } from "react";
import { supabase } from "../lib/supabase";
import { PRIO } from "../lib/constants";

const SB_W = 180, RP_W = 220;

export const usePCLayout = () => {
  const [isPC, setIsPC] = useState(() => window.innerWidth >= 768);
  const [rpOpen, setRpOpen] = useState(true);
  return { isPC, setIsPC, rpOpen, setRpOpen, SB_W, RP_W };
};

export const FloatLauncher = ({ links, isPC, nav }) => {
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchCat, setLaunchCat] = useState(null);
  const cats = [...new Set(links.map(l => l.cat))];
  return (
    <>
      {launchOpen && <div onClick={() => setLaunchOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200 }} />}
      {launchOpen && (
        <div style={{ position: "fixed", bottom: isPC ? 24 : 80, right: isPC ? 80 : 16, background: "#fff", borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 201, width: 270, overflow: "hidden" }}>
          <div style={{ background: "#1A3A5C", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>🚀 アプリを開く</div>
            <button onClick={() => setLaunchOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px", borderBottom: "1px solid #F3F4F6" }}>
            <button onClick={() => setLaunchCat(null)} style={{ padding: "4px 10px", borderRadius: 12, border: "none", background: !launchCat ? "#1A3A5C" : "#F3F4F6", color: !launchCat ? "#fff" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>すべて</button>
            {cats.map(cat => (<button key={cat} onClick={() => setLaunchCat(c => c === cat ? null : cat)} style={{ padding: "4px 10px", borderRadius: 12, border: "none", background: launchCat === cat ? "#1A3A5C" : "#F3F4F6", color: launchCat === cat ? "#fff" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{cat}</button>))}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {links.filter(l => !launchCat || l.cat === launchCat).map((l, i, arr) => (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", textDecoration: "none", color: "#1F2937", borderBottom: i < arr.length - 1 ? "1px solid #F9FAFB" : "none", background: "#fff" }}
                onMouseOver={e => e.currentTarget.style.background = "#F9FAFB"}
                onMouseOut={e => e.currentTarget.style.background = "#fff"}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{l.icon}</span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13, color: "#1F2937" }}>{l.label}</div><div style={{ fontSize: 10, color: "#9CA3AF" }}>{l.cat}</div></div>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>↗</span>
              </a>
            ))}
          </div>
          <div style={{ borderTop: "1px solid #F3F4F6", padding: "10px 16px" }}>
            <button onClick={() => { setLaunchOpen(false); nav("links"); }} style={{ width: "100%", padding: "8px 0", background: "#F0F4F8", border: "none", borderRadius: 8, fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>⚙ リンクを管理する</button>
          </div>
        </div>
      )}
      <button onClick={() => setLaunchOpen(p => !p)} style={{ position: "fixed", bottom: 24, right: 16, width: 52, height: 52, borderRadius: "50%", background: launchOpen ? "#E07B39" : "#1A3A5C", color: "#fff", border: "none", fontSize: 22, boxShadow: "0 4px 16px rgba(0,0,0,0.25)", cursor: "pointer", zIndex: 202, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
        {launchOpen ? "✕" : "🚀"}
      </button>
    </>
  );
};

export const PCSidebar = ({ cust, tileConf, pjs, cos, pending, page, nav, setModal, setEc, SB_W }) => {
  const active = pjs.filter(p => p.status !== "完了" && p.status !== "中断");

  // 🔒 財務パスワード関連のstate
  const [pwModal, setPwModal] = useState(null); // "unlock" | "set" | null
  const [akPwModal, setAkPwModal] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [akPwInput, setAkPwInput] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [akPwErr, setAkPwErr] = useState("");
  const [finUnlocked, setFinUnlocked] = useState(false);
  const [savedPw, setSavedPw] = useState(null); // Supabaseから読んだPW
  const [pwLoaded, setPwLoaded] = useState(false);

  // 初回だけSupabaseからPWを取得（設定されてるか確認するため）
  const loadPw = async () => {
    if (pwLoaded) return;
    const { data } = await supabase.from("home_settings").select("value").eq("id", "finance_password").single();
    setSavedPw(data?.value?.password || null);
    setPwLoaded(true);
    return data?.value?.password || null;
  };

  // 財務タイルをタップした時の処理
  const handleFinanceClick = async () => {
    const pw = savedPw ?? await loadPw();
    if (!pw) {
      // PW未設定 → そのまま入る
      nav("finance");
    } else if (finUnlocked) {
      // 解除済み → そのまま入る
      nav("finance");
    } else {
      // PW設定済み・未解除 → PW入力モーダル
      setPwModal("unlock");
      setPwInput("");
      setPwErr("");
    }
  };

  // PW照合
  const handleUnlock = () => {
    if (pwInput === savedPw) {
      setFinUnlocked(true);
      setPwModal(null);
      setPwInput("");
      nav("finance");
    } else {
      setPwErr("パスワードが違います");
    }
  };

  const handleAiKnowledgeClick = async () => {
    const pw = savedPw ?? await loadPw();
    if (!pw) {
      nav("aiknowledge");
    } else if (finUnlocked) {
      nav("aiknowledge");
    } else {
      setAkPwModal(true);
      setAkPwInput("");
      setAkPwErr("");
    }
  };

  const handleAkUnlock = () => {
    if (akPwInput === savedPw) {
      setFinUnlocked(true);
      setAkPwModal(false);
      setAkPwInput("");
      nav("aiknowledge");
    } else {
      setAkPwErr("パスワードが違います");
    }
  };

  // PW設定・変更
  const handleSetPw = async () => {
    if (!pwInput.trim()) { setPwErr("入力してください"); return; }
    await supabase.from("home_settings").upsert({ id: "finance_password", value: { password: pwInput.trim() }, updated_at: new Date().toISOString() });
    setSavedPw(pwInput.trim());
    setFinUnlocked(true);
    setPwModal(null);
    setPwInput("");
    alert("パスワードを設定しました！");
  };

  return (
    <>
      <div style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: SB_W, background: "#1A3A5C", zIndex: 100, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: cust.acc, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#fff" }}>I</div>
            <div><div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>{cust.sys}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{cust.name}</div></div>
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 6 }}>
          {tileConf.filter(t => t.visible).map(t => {
            const isAct = page === t.key;
            const sub = t.key === "projects" ? `${active.length}件進行中` : t.key === "companies" ? `${cos.length}社` : t.key === "tasks" ? `未完了 ${pending.length}件` : t.sub;
            const isFinance = t.key === "finance";
            const hasPw = !!savedPw;
            return (
              <button key={t.key} onClick={() => {
                if (t.key === "chatgpt") { window.location.href = "chatgpt://"; setTimeout(() => { window.open("https://chatgpt.com", "_blank"); }, 1500); }
                else if (t.key === "report") { window.open("/report.html", "_blank"); }
                else if (isFinance) { handleFinanceClick(); }
                else { nav(t.key); }
              }}
                style={{ width: "100%", padding: "9px 16px", background: isAct ? "rgba(255,255,255,0.13)" : "transparent", border: "none", color: "#fff", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderLeft: `3px solid ${isAct ? t.color : "transparent"}` }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{t.icon}</span>
                <div style={{ overflow: "hidden", flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: isAct ? 800 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                    {t.label}
                    {/* 🔒 鍵アイコン表示 */}
                    {isFinance && hasPw && (
                      <span style={{ fontSize: 11 }}>{finUnlocked ? "🔓" : "🔒"}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>{sub}</div>
                </div>
                {/* ⚙ PW設定・変更ボタン */}
                {isFinance && (
                  <span
                    onClick={e => { e.stopPropagation(); loadPw().then(() => { setPwModal("set"); setPwInput(""); setPwErr(""); }); }}
                    style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", cursor: "pointer", flexShrink: 0 }}
                    title="パスワード設定"
                  >⚙</span>
                )}
              </button>
            );
          })}
          <button onClick={handleAiKnowledgeClick}
            style={{ width: "100%", padding: "9px 16px", background: page === "aiknowledge" ? "rgba(255,255,255,0.13)" : "transparent", border: "none", color: "#fff", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderLeft: `3px solid ${page === "aiknowledge" ? "#1a56a0" : "transparent"}` }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🧠</span>
            <div style={{ overflow: "hidden", flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: page === "aiknowledge" ? 800 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                AIナレッジ
                {savedPw && (
                  <span style={{ fontSize: 11 }}>{finUnlocked ? "🔓" : "🔒"}</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>社内限定</div>
            </div>
          </button>
          <button onClick={() => nav("blocked-numbers")}
            style={{ width: "100%", padding: "9px 16px", background: page === "blocked-numbers" ? "rgba(255,255,255,0.13)" : "transparent", border: "none", color: "#fff", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderLeft: `3px solid ${page === "blocked-numbers" ? "#EA580C" : "transparent"}` }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🚫</span>
            <div style={{ overflow: "hidden", flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: page === "blocked-numbers" ? 800 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                迷惑電話リスト
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>登録・編集</div>
            </div>
          </button>
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <button onClick={() => { setEc({ ...cust }); setModal("cust"); }} style={{ width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.1)", border: "none", color: "rgba(255,255,255,0.7)", borderRadius: 8, fontSize: 11, cursor: "pointer", fontWeight: 600, textAlign: "left" }}>⚙ カスタマイズ</button>
        </div>
      </div>

      {/* 🔒 PW入力モーダル（unlock） */}
      {pwModal === "unlock" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: 300, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#1F2937" }}>🔒 財務・書類管理</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>パスワードを入力してください</div>
            <input
              type="password" value={pwInput} autoFocus
              onChange={e => { setPwInput(e.target.value); setPwErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleUnlock()}
              placeholder="パスワード"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: pwErr ? "2px solid #DC2626" : "1.5px solid #E5E7EB", fontSize: 15, boxSizing: "border-box", marginBottom: 4, color: "#1F2937", outline: "none" }}
            />
            {pwErr && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>{pwErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => { setPwModal(null); setPwInput(""); setPwErr(""); }} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={handleUnlock} style={{ flex: 1, padding: 12, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>開く</button>
            </div>
          </div>
        </div>
      )}

      {/* 🔒 AIナレッジ PW入力モーダル */}
      {akPwModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: 300, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#1F2937" }}>🔒 AIナレッジ管理</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>パスワードを入力してください</div>
            <input
              type="password" value={akPwInput} autoFocus
              onChange={e => { setAkPwInput(e.target.value); setAkPwErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleAkUnlock()}
              placeholder="パスワード"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: akPwErr ? "2px solid #DC2626" : "1.5px solid #E5E7EB", fontSize: 15, boxSizing: "border-box", marginBottom: 4, color: "#1F2937", background: "#fff", outline: "none" }}
            />
            {akPwErr && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>{akPwErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => { setAkPwModal(false); setAkPwInput(""); setAkPwErr(""); }} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={handleAkUnlock} style={{ flex: 1, padding: 12, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>開く</button>
            </div>
          </div>
        </div>
      )}

      {/* ⚙ PW設定・変更モーダル */}
      {pwModal === "set" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: 300, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#1F2937" }}>🔐 パスワード{savedPw ? "変更" : "設定"}</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>財務・書類管理に鍵をかけます</div>
            <input
              type="password" value={pwInput} autoFocus
              onChange={e => { setPwInput(e.target.value); setPwErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleSetPw()}
              placeholder="新しいパスワード"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: pwErr ? "2px solid #DC2626" : "1.5px solid #E5E7EB", fontSize: 15, boxSizing: "border-box", marginBottom: 4, color: "#1F2937", outline: "none" }}
            />
            {pwErr && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>{pwErr}</div>}
            {savedPw && (
              <button onClick={async () => {
                await supabase.from("home_settings").upsert({ id: "finance_password", value: { password: null }, updated_at: new Date().toISOString() });
                setSavedPw(null); setFinUnlocked(false); setPwModal(null); setPwInput("");
                alert("パスワードを解除しました");
              }} style={{ width: "100%", padding: "8px 0", background: "none", border: "none", color: "#DC2626", fontSize: 12, cursor: "pointer", marginBottom: 4 }}>🗑 パスワードを削除する</button>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setPwModal(null); setPwInput(""); setPwErr(""); }} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", color: "#374151" }}>キャンセル</button>
              <button onClick={handleSetPw} style={{ flex: 1, padding: 12, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>設定する</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const PCRightPanel = ({ rpOpen, setRpOpen, pjs, tks, finFiles, tmplFiles, fishWeather, nav, setAiInput, RP_W }) => {
  const [qi, setQi] = useState("");
  const [open, setOpen] = useState({ kpi: true, tasks: true, fishing: true, ai: true });
  const tog = k => setOpen(p => ({ ...p, [k]: !p[k] }));
  const pending = tks.filter(t => !t.done);
  const totalAmt = pjs.reduce((s, p) => s + (p.amount || 0), 0);
  const totalGp = pjs.reduce((s, p) => s + (p.gp || 0), 0);
  const active = pjs.filter(p => p.status !== "完了" && p.status !== "中断");
  const SectionHdr = ({ id, label }) => (
    <button onClick={() => tog(id)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: "10px 0 8px" }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: "#1A3A5C" }}>{label}</div>
      <div style={{ fontSize: 11, color: "#9CA3AF", background: "#F3F4F6", borderRadius: 6, padding: "2px 8px", fontWeight: 700, transform: open[id] ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }}>▼</div>
    </button>
  );
  if (!rpOpen) return (
    <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 32, background: "#fff", borderLeft: "1px solid #E5E7EB", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button onClick={() => setRpOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 8, color: "#9CA3AF" }}>
        <span style={{ fontSize: 16 }}>◀</span>
        <span style={{ fontSize: 9, fontWeight: 700, writingMode: "vertical-rl", letterSpacing: 1, color: "#BFBFBF" }}>パネル</span>
      </button>
    </div>
  );
  return (
    <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: RP_W, background: "#fff", borderLeft: "1px solid #E5E7EB", overflowY: "auto", zIndex: 100 }}>
      <div style={{ padding: "12px 16px 16px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button onClick={() => setRpOpen(false)} style={{ background: "#F3F4F6", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#6B7280", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>閉じる ▶</button>
        </div>
        <SectionHdr id="kpi" label="📊 今日の状況" />
        {open.kpi && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {[{ l: "進行中案件", v: `${active.length}件`, c: "#1A3A5C", bg: "#EFF6FF" }, { l: "未完了タスク", v: `${pending.length}件`, c: "#EF4444", bg: "#FEF2F2" }, { l: "受注合計", v: `¥${(totalAmt / 10000).toFixed(0)}万`, c: "#E07B39", bg: "#FFF7ED" }, { l: "粗利率", v: totalAmt ? `${(totalGp / totalAmt * 100).toFixed(1)}%` : "—", c: "#059669", bg: "#F0FDF4" }].map(x => (
            <div key={x.l} style={{ background: x.bg, borderRadius: 10, padding: "10px" }}>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 3 }}>{x.l}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: x.c }}>{x.v}</div>
            </div>
          ))}
        </div>}
        {open.kpi && (() => {
          const finMB = finFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
          const tmplMB = tmplFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024 / 1024;
          const totalMB = finMB + tmplMB;
          const limitMB = 1024;
          const p = Math.min((totalMB / limitMB) * 100, 100);
          const col = p > 80 ? "#EF4444" : p > 50 ? "#F59E0B" : "#059669";
          return (
            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>📦 Storage</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: col }}>{totalMB < 1 ? `${(totalMB * 1024).toFixed(0)}KB` : `${totalMB.toFixed(0)}MB`} / 1GB</div>
              </div>
              <div style={{ background: "#E5E7EB", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${p}%`, height: "100%", background: col, borderRadius: 4, transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, color: "#9CA3AF" }}>
                <span>財務 {finMB < 1 ? `${(finMB * 1024).toFixed(0)}KB` : `${finMB.toFixed(0)}MB`}</span>
                <span>雛形 {tmplMB < 1 ? `${(tmplMB * 1024).toFixed(0)}KB` : `${tmplMB.toFixed(0)}MB`}</span>
              </div>
            </div>
          );
        })()}
        <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />
        <SectionHdr id="tasks" label="⏰ 直近タスク" />
        {open.tasks && <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "4px 0", marginBottom: 14 }}>
          {pending.slice(0, 5).map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: i < Math.min(pending.length, 5) - 1 ? "1px solid #F3F4F6" : "none" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRIO[t.prio]?.c, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
              {t.due && <div style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>{t.due}</div>}
            </div>
          ))}
          {pending.length === 0 && <div style={{ padding: "12px", fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>タスクなし 🎉</div>}
        </div>}
        <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />
        <SectionHdr id="fishing" label="🎣 釣り天気" />
        {open.fishing && <div style={{ marginBottom: 14 }}>
          {fishWeather ? [fishWeather.yokosuka, fishWeather.sotobo].map(d => d && (
            <div key={d.name} style={{ background: "#F0F9FF", borderRadius: 10, padding: "8px 10px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 22 }}>{d.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#0284C7" }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "#374151" }}>💨 {d.windDir} {d.windSpeed}m/s　🌊 {d.wave}m</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#1F2937" }}>{d.temp}°</div>
            </div>
          )) : <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", padding: 8 }}>
            <button onClick={() => nav("fishing")} style={{ background: "#0284C7", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🎣 釣り情報ページを開く</button>
          </div>}
          <button onClick={() => nav("fishing")} style={{ width: "100%", background: "#F0F9FF", border: "1.5px solid #BAE6FD", borderRadius: 8, padding: "6px 0", fontSize: 11, color: "#0284C7", fontWeight: 700, cursor: "pointer", marginTop: 4 }}>詳細を見る →</button>
        </div>}
        <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />
        <SectionHdr id="ai" label="🤖 AIに質問" />
        {open.ai && <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            <input value={qi} onChange={e => setQi(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && qi.trim()) { setAiInput(qi); setQi(""); nav("ai"); } }} placeholder="AIに質問..." style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, outline: "none", color: "#1F2937" }} />
            <button onClick={() => { if (qi.trim()) { setAiInput(qi); setQi(""); nav("ai"); } }} style={{ background: "#6D28D9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>→</button>
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF" }}>Enterキーで送信・AIページへ</div>
        </div>}
      </div>
    </div>
  );
};