import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { LineIcon } from "../components/UI";
import { describeApiError } from "../lib/errorMessage";
import {
  getPermissionState,
  getIosHint,
  requestPermissionAndRegister,
  showTestNotification,
} from "../lib/push";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function LineSettings({ isPC, pp, nav, rpOpen, setRpOpen, SB_W, RP_W, cust, pjs, submittedQuotes, wonQuotes, cos, tks, finFiles, tmplFiles, tileConf }) {
  const [rules, setRules] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newStaffs, setNewStaffs] = useState([]);
  const [newUrgency, setNewUrgency] = useState("すべて");
  const [newTimeStart, setNewTimeStart] = useState("00:00");
  const [newTimeEnd, setNewTimeEnd] = useState("23:59");
  const [editRuleId, setEditRuleId] = useState(null);
  const [editStaffId, setEditStaffId] = useState(null);
  const [editStaffName, setEditStaffName] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("rules");

  const [pushPermission, setPushPermission] = useState("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushTestOk, setPushTestOk] = useState(false);

  useEffect(() => { loadData(); }, []);

  const openTab = (name) => {
    setTab(name);
    if (name === "push") setPushPermission(getPermissionState());
  };

  const PUSH_STATE_LABEL = {
    unsupported: "未対応",
    default: "未許可",
    granted: "許可済み",
    denied: "拒否",
  };

  const enablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushError("");
    setPushTestOk(false);
    try {
      await requestPermissionAndRegister();
      setPushPermission(getPermissionState());
    } catch (e) {
      setPushError(describeApiError(e, "通知の許可"));
    }
    setPushBusy(false);
  };

  const testPush = async () => {
    if (pushTestBusy) return;
    setPushTestBusy(true);
    setPushError("");
    setPushTestOk(false);
    try {
      await showTestNotification();
      setPushTestOk(true);
    } catch (e) {
      setPushError(describeApiError(e, "テスト通知の表示"));
    }
    setPushTestBusy(false);
  };

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

  const saveStaff = async (newStaff) => {
    setStaffList(newStaff);
    await supabase.from("home_settings").upsert({ id: "line_staff_names", value: newStaff });
  };

  const addRule = async () => {
    if (!newKeyword.trim()) return;
    const newRule = {
      id: Date.now(),
      keyword: newKeyword.trim(),
      staffIds: newStaffs,
      urgency: newUrgency,
      timeStart: newTimeStart,
      timeEnd: newTimeEnd,
    };
    if (editRuleId) {
      await saveRules(rules.map(r => r.id === editRuleId ? { ...newRule, id: editRuleId } : r));
      setEditRuleId(null);
    } else {
      await saveRules([...rules, newRule]);
    }
    setNewKeyword(""); setNewStaffs([]); setNewUrgency("すべて"); setNewTimeStart("00:00"); setNewTimeEnd("23:59");
  };

  const editRule = (rule) => {
    setEditRuleId(rule.id);
    setNewKeyword(rule.keyword);
    setNewStaffs(rule.staffIds || []);
    setNewUrgency(rule.urgency || "すべて");
    setNewTimeStart(rule.timeStart || "00:00");
    setNewTimeEnd(rule.timeEnd || "23:59");
    setTab("rules");
    window.scrollTo(0, 0);
  };

  const deleteRule = async (id) => {
    await saveRules(rules.filter(r => r.id !== id));
  };

  const toggleStaff = (id) => {
    setNewStaffs(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleStaffActive = async (id) => {
    await saveStaff(staffList.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const deleteStaff = async (id) => {
    await saveStaff(staffList.filter(s => s.id !== id));
  };

  const saveStaffName = async () => {
    await saveStaff(staffList.map(s => s.id === editStaffId ? { ...s, name: editStaffName } : s));
    setEditStaffId(null);
    setEditStaffName("");
  };

  const pending = (tks || []).filter(t => !t.done);

  const s = {
    wrap: { fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp },
    inner: { maxWidth: 720, margin: "0 auto", padding: isPC ? "32px 24px" : "16px 12px" },
    title: { fontSize: isPC ? 24 : 20, fontWeight: 800, color: "#1A3A5C", marginBottom: 24 },
    card: { background: "#fff", borderRadius: 14, padding: isPC ? 24 : 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
    label: { fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 6, display: "block" },
    input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 15, boxSizing: "border-box", background: "#F8FAFC", color: "#1F2937" },
    btn: { padding: "10px 20px", borderRadius: 8, border: "none", background: "#1A3A5C", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 },
    btnSm: { padding: "6px 14px", borderRadius: 8, border: "none", background: "#1A3A5C", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 },
    btnDanger: { padding: "6px 14px", borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 },
    btnGray: { padding: "6px 14px", borderRadius: 8, border: "none", background: "#E2E8F0", color: "#475569", fontWeight: 700, cursor: "pointer", fontSize: 13 },
    tag: { display: "inline-block", padding: "4px 10px", borderRadius: 20, background: "#E0F2FE", color: "#0369A1", fontSize: 13, marginRight: 6, marginTop: 4 },
    ruleCard: { background: "#F8FAFC", borderRadius: 10, padding: 16, marginBottom: 12, border: "1px solid #E2E8F0" },
    checkRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" },
    sectionTitle: { fontSize: 16, fontWeight: 700, color: "#1A3A5C", marginBottom: 14 },
    emptyText: { color: "#94A3B8", fontSize: 14, textAlign: "center", padding: "20px 0" },
    tabBtn: (active) => ({ padding: "8px 20px", borderRadius: 8, border: "none", background: active ? "#1A3A5C" : "#E2E8F0", color: active ? "#fff" : "#475569", fontWeight: 700, cursor: "pointer", fontSize: 14 }),
    select: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 15, background: "#F8FAFC", color: "#1F2937" },
    row: { display: "flex", gap: 12, alignItems: "center" },
  };

  return (
    <div style={s.wrap}>
      {isPC && <PCSidebar nav={nav} page="linesettings" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} submittedQuotes={submittedQuotes} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} wonQuotes={wonQuotes || []} submittedQuotes={submittedQuotes} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} />}

      <div style={s.inner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => nav("home")} style={{ background: "#E2E8F0", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, color: "#475569", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>← 戻る</button>
          <div style={{ ...s.title, display: "flex", alignItems: "center", gap: 8 }}><LineIcon size={22} /> LINE通知設定</div>
        </div>

        {/* タブ */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button style={s.tabBtn(tab === "rules")} onClick={() => setTab("rules")}>🔑 キーワード</button>
          <button style={s.tabBtn(tab === "staff")} onClick={() => openTab("staff")}>👤 スタッフ</button>
          <button style={s.tabBtn(tab === "push")} onClick={() => openTab("push")}>🔔 プッシュ(テスト)</button>
        </div>

        {/* ── キーワードタブ ── */}
        {tab === "rules" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>{editRuleId ? "✏️ キーワードを編集" : "＋ キーワードルールを追加"}</div>

            <label style={s.label}>キーワード（例：長谷工、大和ライフ）</label>
            <input style={{ ...s.input, marginBottom: 14 }} value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="キーワードを入力" />

            <label style={s.label}>通知するスタッフ（複数選択可）</label>
            <div style={{ marginBottom: 14 }}>
              {staffList.length === 0 ? (
                <div style={s.emptyText}>先にBotに名前を送ってもらってください</div>
              ) : (
                staffList.filter(s => s.active !== false).map(staff => (
                  <label key={staff.id} style={s.checkRow}>
                    <input type="checkbox" checked={newStaffs.includes(staff.id)} onChange={() => toggleStaff(staff.id)} />
                    <span style={{ fontSize: 15 }}>{staff.name}</span>
                  </label>
                ))
              )}
            </div>

            <label style={s.label}>緊急度フィルター</label>
            <select style={{ ...s.select, marginBottom: 14 }} value={newUrgency} onChange={e => setNewUrgency(e.target.value)}>
              <option value="すべて">すべて</option>
              <option value="緊急">緊急のみ</option>
              <option value="通常">通常のみ</option>
            </select>

            <label style={s.label}>通知時間帯</label>
            <div style={{ ...s.row, marginBottom: 16 }}>
              <input type="time" style={{ ...s.input }} value={newTimeStart} onChange={e => setNewTimeStart(e.target.value)} />
              <span style={{ color: "#64748B", fontWeight: 700 }}>〜</span>
              <input type="time" style={{ ...s.input }} value={newTimeEnd} onChange={e => setNewTimeEnd(e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button style={s.btn} onClick={addRule}>{editRuleId ? "更新する" : "追加する"}</button>
              {editRuleId && <button style={s.btnGray} onClick={() => { setEditRuleId(null); setNewKeyword(""); setNewStaffs([]); setNewUrgency("すべて"); setNewTimeStart("00:00"); setNewTimeEnd("23:59"); }}>キャンセル</button>}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>📋 現在のキーワードルール</div>
            {loading ? <div style={s.emptyText}>読み込み中...</div>
              : rules.length === 0 ? <div style={s.emptyText}>ルールがまだありません</div>
              : rules.map(rule => (
                <div key={rule.id} style={s.ruleCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>🔑 {rule.keyword}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={s.btnSm} onClick={() => editRule(rule)}>編集</button>
                      <button style={s.btnDanger} onClick={() => deleteRule(rule.id)}>削除</button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    {(rule.staffIds || []).length === 0
                      ? <span style={{ ...s.tag, background: "#F1F5F9", color: "#64748B" }}>全員</span>
                      : rule.staffIds.map(id => {
                          const staff = staffList.find(s => s.id === id);
                          return <span key={id} style={s.tag}>{staff?.name || id}</span>;
                        })}
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8", display: "flex", gap: 12 }}>
                    <span>⚡ {rule.urgency || "すべて"}</span>
                    <span>🕐 {rule.timeStart || "00:00"} 〜 {rule.timeEnd || "23:59"}</span>
                  </div>
                </div>
              ))}
          </div>

          <div style={{ ...s.card, background: "#F0FDF4", border: "1px solid #86EFAC" }}>
            <div style={{ fontSize: 14, color: "#166534" }}>✅ キーワードに一致しない案件は<strong>スタッフ全員</strong>に通知されます</div>
          </div>
        </>}

        {/* ── スタッフタブ ── */}
        {tab === "staff" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>👤 スタッフ管理</div>
            {staffList.length === 0 ? (
              <div style={s.emptyText}>スタッフがいません。BotにLINEで名前を送ってもらってください。</div>
            ) : (
              staffList.map(staff => (
                <div key={staff.id} style={{ ...s.ruleCard, display: "flex", alignItems: "center", gap: 12 }}>
                  {editStaffId === staff.id ? (
                    <>
                      <input style={{ ...s.input, flex: 1 }} value={editStaffName} onChange={e => setEditStaffName(e.target.value)} />
                      <button style={s.btnSm} onClick={saveStaffName}>保存</button>
                      <button style={s.btnGray} onClick={() => setEditStaffId(null)}>キャンセル</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: staff.active === false ? "#94A3B8" : "#1F2937" }}>
                          {staff.active === false ? "🔕 " : "🔔 "}{staff.name}
                        </div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>ID: {staff.id.slice(0, 10)}...</div>
                      </div>
                      <button style={s.btnGray} onClick={() => { setEditStaffId(staff.id); setEditStaffName(staff.name); }}>名前変更</button>
                      <button style={{ ...s.btnSm, background: staff.active === false ? "#059669" : "#F59E0B" }} onClick={() => toggleStaffActive(staff.id)}>
                        {staff.active === false ? "ON" : "OFF"}
                      </button>
                      <button style={s.btnDanger} onClick={() => deleteStaff(staff.id)}>削除</button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <div style={{ ...s.card, background: "#FFF7ED", border: "1px solid #FED7AA" }}>
            <div style={{ fontSize: 14, color: "#92400E" }}>💡 新しいスタッフを追加するには、IGUMI管理BotにLINEで名前を送ってもらってください</div>
          </div>
        </>}

        {/* ── プッシュ通知(テスト)タブ ── */}
        {tab === "push" && <>
          <div style={{ ...s.card, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
            <div style={{ fontSize: 13, color: "#1E40AF", lineHeight: 1.7 }}>
              🧪 これはテスト段階の機能です。この端末だけでの表示確認で、他のスタッフやサーバーへは何も送られません。
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>🔔 この端末の通知状態</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span
                style={{
                  ...s.tag,
                  margin: 0,
                  background: pushPermission === "granted" ? "#DCFCE7" : pushPermission === "denied" ? "#FEE2E2" : "#F1F5F9",
                  color: pushPermission === "granted" ? "#166534" : pushPermission === "denied" ? "#B91C1C" : "#64748B",
                  fontWeight: 700,
                }}
              >
                {PUSH_STATE_LABEL[pushPermission] || "未対応"}
              </span>
            </div>

            {pushPermission === "unsupported" && (
              <div style={{ ...s.emptyText, padding: "8px 0" }}>このブラウザ・端末はプッシュ通知に対応していません</div>
            )}

            {getIosHint() && (
              <div style={{ fontSize: 13, color: "#92400E", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                📱 {getIosHint()}
              </div>
            )}

            {pushPermission === "denied" && (
              <div style={{ fontSize: 13, color: "#B91C1C", marginBottom: 14 }}>
                ブラウザの設定で通知が拒否されています。ブラウザ側のサイト設定から許可に変更してください。
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                style={{ ...s.btn, opacity: pushBusy || pushPermission === "granted" || pushPermission === "unsupported" ? 0.6 : 1 }}
                onClick={enablePush}
                disabled={pushBusy || pushPermission === "granted" || pushPermission === "unsupported"}
              >
                {pushBusy ? "確認中..." : pushPermission === "granted" ? "✓ 有効済み" : "通知を有効にする"}
              </button>
              <button
                style={{ ...s.btnSm, opacity: pushTestBusy || pushPermission !== "granted" ? 0.6 : 1 }}
                onClick={testPush}
                disabled={pushTestBusy || pushPermission !== "granted"}
              >
                {pushTestBusy ? "表示中..." : "テスト通知を表示する"}
              </button>
            </div>

            {pushTestOk && (
              <div style={{ fontSize: 13, color: "#166534", marginTop: 12 }}>✅ テスト通知を表示しました(この端末に表示されていれば成功です)</div>
            )}

            {pushError && (() => {
              const [summary, detail] = pushError.split("\n\n詳細: ");
              return (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
                  <div style={{ color: "#DC2626", fontSize: 13, whiteSpace: "pre-wrap" }}>{summary}</div>
                  {detail && <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 4 }}>詳細: {detail}</div>}
                </div>
              );
            })()}
          </div>

          <div style={{ ...s.card, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.7 }}>
              ℹ️ サーバーから各スタッフの端末に通知を送る機能(名前の登録・一覧管理)は、次のステップで追加予定です。
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}