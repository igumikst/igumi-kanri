import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function LineSettings({ isPC, pp, nav, rpOpen, setRpOpen, SB_W, RP_W, cust, pjs, cos, tks, finFiles, tmplFiles, tileConf }) {
  const [rules, setRules] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newStaffs, setNewStaffs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [rulesRes, staffRes] = await Promise.all([
      supabase.from("home_settings").select("value").eq("id", "line_keyword_rules").single(),
      supabase.from("home_settings").select("value").eq("id", "line_staff_names").single(),
    ]);
    if (rulesRes.data?.value) setRules(rulesRes.data.value);
    if (staffRes.data?.value) setStaffList(staffRes.data.value);
    setLoading(false);
  };

  const saveRules = async (newRules) => {
    setRules(newRules);
    await supabase.from("home_settings").upsert({ id: "line_keyword_rules", value: newRules });
  };

  const addRule = async () => {
    if (!newKeyword.trim()) return;
    const newRule = { id: Date.now(), keyword: newKeyword.trim(), staffIds: newStaffs };
    await saveRules([...rules, newRule]);
    setNewKeyword("");
    setNewStaffs([]);
  };

  const deleteRule = async (id) => {
    await saveRules(rules.filter(r => r.id !== id));
  };

  const toggleStaff = (id) => {
    setNewStaffs(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const s = {
    wrap: { fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp },
    inner: { maxWidth: 700, margin: "0 auto", padding: isPC ? "32px 24px" : "16px 12px" },
    title: { fontSize: 22, fontWeight: 700, color: "#1A3A5C", marginBottom: 24 },
    card: { background: "#fff", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
    label: { fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 6 },
    input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 15, boxSizing: "border-box" },
    btn: { padding: "10px 20px", borderRadius: 8, border: "none", background: "#1A3A5C", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 },
    btnDanger: { padding: "6px 14px", borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 },
    tag: { display: "inline-block", padding: "4px 10px", borderRadius: 20, background: "#E0F2FE", color: "#0369A1", fontSize: 13, marginRight: 6, marginTop: 4 },
    ruleCard: { background: "#F8FAFC", borderRadius: 10, padding: 16, marginBottom: 12, border: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
    checkRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" },
    sectionTitle: { fontSize: 16, fontWeight: 700, color: "#1A3A5C", marginBottom: 12 },
    emptyText: { color: "#94A3B8", fontSize: 14, textAlign: "center", padding: "20px 0" },
  };

  const pending = (tks || []).filter(t => !t.done);

  return (
    <div style={s.wrap}>
      {isPC && <PCSidebar nav={nav} page="linesettings" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} />}

      <div style={s.inner}>
        <div style={s.title}>📲 LINE通知設定</div>

        <div style={s.card}>
          <div style={s.sectionTitle}>＋ キーワードルールを追加</div>
          <div style={{ marginBottom: 16 }}>
            <div style={s.label}>キーワード（例：長谷工、大和ライフ）</div>
            <input style={s.input} value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="キーワードを入力" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={s.label}>通知するスタッフ（複数選択可）</div>
            {staffList.length === 0 ? (
              <div style={s.emptyText}>スタッフがいません。先にBotに名前を送ってもらってください。</div>
            ) : (
              staffList.map(staff => (
                <label key={staff.id} style={s.checkRow}>
                  <input type="checkbox" checked={newStaffs.includes(staff.id)} onChange={() => toggleStaff(staff.id)} />
                  <span style={{ fontSize: 15 }}>{staff.name}</span>
                </label>
              ))
            )}
          </div>
          <button style={s.btn} onClick={addRule}>追加する</button>
        </div>

        <div style={s.card}>
          <div style={s.sectionTitle}>📋 現在のキーワードルール</div>
          {loading ? (
            <div style={s.emptyText}>読み込み中...</div>
          ) : rules.length === 0 ? (
            <div style={s.emptyText}>ルールがまだありません</div>
          ) : (
            rules.map(rule => (
              <div key={rule.id} style={s.ruleCard}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>🔑 {rule.keyword}</div>
                  <div>
                    {rule.staffIds.length === 0 ? (
                      <span style={{ ...s.tag, background: "#F1F5F9", color: "#64748B" }}>全員</span>
                    ) : (
                      rule.staffIds.map(id => {
                        const staff = staffList.find(s => s.id === id);
                        return <span key={id} style={s.tag}>{staff?.name || id}</span>;
                      })
                    )}
                  </div>
                </div>
                <button style={s.btnDanger} onClick={() => deleteRule(rule.id)}>削除</button>
              </div>
            ))
          )}
        </div>

        <div style={{ ...s.card, background: "#F0FDF4", border: "1px solid #86EFAC" }}>
          <div style={{ fontSize: 14, color: "#166534" }}>
            ✅ キーワードに一致しない案件は<strong>スタッフ全員</strong>に通知されます
          </div>
        </div>
      </div>
    </div>
  );
}