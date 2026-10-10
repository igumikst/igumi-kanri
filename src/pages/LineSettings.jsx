import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { LineIcon } from "../components/UI";
import { describeApiError } from "../lib/errorMessage";
import {
  getPermissionState,
  getIosHint,
  showTestNotification,
  registerForPush,
  checkOwnStatus,
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
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushTestOk, setPushTestOk] = useState(false);

  const [pushAssignees, setPushAssignees] = useState([]);
  const [pushSelectedName, setPushSelectedName] = useState("");
  const [pushStatus, setPushStatus] = useState(null); // { registered, enabled } | null
  const [pushStatusLoading, setPushStatusLoading] = useState(false);
  const [pushRegBusy, setPushRegBusy] = useState(false);

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState("");
  const [adminPasscodeInput, setAdminPasscodeInput] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminList, setAdminList] = useState([]);
  const [adminBusyIds, setAdminBusyIds] = useState({});
  const [adminRowMsg, setAdminRowMsg] = useState({});

  useEffect(() => { loadData(); }, []);

  const openTab = (name) => {
    setTab(name);
    if (name === "push") {
      setPushPermission(getPermissionState());
      loadPushAssignees();
      refreshPushStatus();
    }
  };

  const callPushAdmin = async (passcode, body) => {
    const res = await fetch("/api/push-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const err = new Error(data.error || "操作に失敗しました");
      err.status = res.status;
      throw err;
    }
    return data;
  };

  const unlockAdmin = async () => {
    if (adminLoading) return;
    setAdminLoading(true);
    setAdminError("");
    try {
      const data = await callPushAdmin(adminPasscodeInput, {});
      setAdminList(data.subscriptions || []);
      setAdminPasscode(adminPasscodeInput);
      setAdminUnlocked(true);
      setAdminPasscodeInput("");
    } catch (e) {
      setAdminError(describeApiError(e, "パスコードの確認"));
    }
    setAdminLoading(false);
  };

  const refreshAdminList = async () => {
    try {
      const data = await callPushAdmin(adminPasscode, {});
      setAdminList(data.subscriptions || []);
    } catch (e) {
      if (e.status === 403) { setAdminUnlocked(false); setAdminPasscode(""); }
      setAdminError(describeApiError(e, "一覧の取得"));
    }
  };

  const setRowBusy = (id, busy) => setAdminBusyIds(prev => ({ ...prev, [id]: busy }));
  const setRowMsg = (id, msg) => setAdminRowMsg(prev => ({ ...prev, [id]: msg }));

  const toggleAdminDevice = async (id, enabled) => {
    if (adminBusyIds[id]) return;
    setRowBusy(id, true);
    setAdminError("");
    setRowMsg(id, "");
    try {
      await callPushAdmin(adminPasscode, { action: "toggle", id, enabled });
      setAdminList(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
      setRowMsg(id, enabled ? "✅ ONにしました" : "OFFにしました");
    } catch (e) {
      if (e.status === 403) { setAdminUnlocked(false); setAdminPasscode(""); }
      setAdminError(describeApiError(e, "切り替え"));
    }
    setRowBusy(id, false);
  };

  const deleteAdminDevice = async (id) => {
    if (adminBusyIds[id]) return;
    if (!window.confirm("この端末をリストから削除しますか?")) return;
    setRowBusy(id, true);
    setAdminError("");
    try {
      await callPushAdmin(adminPasscode, { action: "delete", id });
      setAdminList(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      if (e.status === 403) { setAdminUnlocked(false); setAdminPasscode(""); }
      setAdminError(describeApiError(e, "削除"));
    }
    setRowBusy(id, false);
  };

  const testAdminDevice = async (id) => {
    if (adminBusyIds[id]) return;
    setRowBusy(id, true);
    setAdminError("");
    setRowMsg(id, "");
    try {
      const data = await callPushAdmin(adminPasscode, { action: "test", id });
      const result = (data.results || [])[0];
      if (result?.success) {
        setRowMsg(id, "✅ 送信しました");
      } else if (result?.deactivated) {
        setAdminList(prev => prev.map(r => r.id === id ? { ...r, enabled: false } : r));
        setRowMsg(id, "⚠️ 端末が無効になりました(再登録が必要です)");
      } else {
        setRowMsg(id, "❌ 送信に失敗しました");
      }
    } catch (e) {
      if (e.status === 403) { setAdminUnlocked(false); setAdminPasscode(""); }
      setAdminError(describeApiError(e, "テスト送信"));
    }
    setRowBusy(id, false);
  };

  const PUSH_STATE_LABEL = {
    unsupported: "未対応",
    default: "未許可",
    granted: "許可済み",
    denied: "拒否",
  };

  const loadPushAssignees = async () => {
    if (pushAssignees.length) return;
    const { data } = await supabase.from("home_settings").select("value").eq("id", "assignee_names").single();
    if (data?.value && Array.isArray(data.value) && data.value.length) setPushAssignees(data.value);
    else setPushAssignees(["﨑岡", "後藤", "赤岡", "上村", "綱島", "伊藤"]);
  };

  const refreshPushStatus = async () => {
    setPushStatusLoading(true);
    try {
      const status = await checkOwnStatus();
      setPushStatus(status);
    } catch {
      setPushStatus(null);
    }
    setPushStatusLoading(false);
  };

  const registerPush = async () => {
    if (pushRegBusy) return;
    if (!pushSelectedName) { setPushError("お名前を選んでください"); return; }
    setPushRegBusy(true);
    setPushError("");
    setPushTestOk(false);
    try {
      await registerForPush(pushSelectedName);
      setPushPermission(getPermissionState());
      await refreshPushStatus();
    } catch (e) {
      setPushError(describeApiError(e, "通知の登録"));
    }
    setPushRegBusy(false);
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
          <button style={s.tabBtn(tab === "push")} onClick={() => openTab("push")}>🔔 プッシュ通知</button>
          <button style={s.tabBtn(tab === "push-admin")} onClick={() => openTab("push-admin")}>🔔 プッシュ通知の管理</button>
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

        {/* ── プッシュ通知タブ ── */}
        {tab === "push" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>🔔 この端末の通知状態</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              {pushStatusLoading ? (
                <span style={{ ...s.tag, margin: 0, background: "#F1F5F9", color: "#64748B", fontWeight: 700 }}>確認中...</span>
              ) : pushStatus?.enabled ? (
                <span style={{ ...s.tag, margin: 0, background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>🔔 通知ON</span>
              ) : pushStatus?.registered ? (
                <span style={{ ...s.tag, margin: 0, background: "#FFF7ED", color: "#C2410C", fontWeight: 700 }}>登録済み(承認待ち)</span>
              ) : (
                <span
                  style={{
                    ...s.tag,
                    margin: 0,
                    background: pushPermission === "denied" ? "#FEE2E2" : "#F1F5F9",
                    color: pushPermission === "denied" ? "#B91C1C" : "#64748B",
                    fontWeight: 700,
                  }}
                >
                  {PUSH_STATE_LABEL[pushPermission] || "未対応"}
                </span>
              )}
            </div>

            {pushStatus?.registered && !pushStatus?.enabled && (
              <div style={{ fontSize: 13, color: "#92400E", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                登録しました。管理者が確認してONにするまで、通知は届きません。
              </div>
            )}

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

            {!pushStatus?.registered && pushPermission !== "unsupported" && (
              <>
                <label style={s.label}>お名前</label>
                <select style={{ ...s.select, marginBottom: 14 }} value={pushSelectedName} onChange={e => setPushSelectedName(e.target.value)}>
                  <option value="">選んでください</option>
                  {pushAssignees.map(name => (<option key={name} value={name}>{name}</option>))}
                </select>
              </>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {!pushStatus?.registered && (
                <button
                  style={{ ...s.btn, opacity: pushRegBusy || !pushSelectedName || pushPermission === "unsupported" ? 0.6 : 1 }}
                  onClick={registerPush}
                  disabled={pushRegBusy || !pushSelectedName || pushPermission === "unsupported"}
                >
                  {pushRegBusy ? "登録中..." : "通知を有効にする"}
                </button>
              )}
              <button
                style={{ ...s.btnSm, opacity: pushTestBusy || pushPermission !== "granted" ? 0.6 : 1 }}
                onClick={testPush}
                disabled={pushTestBusy || pushPermission !== "granted"}
              >
                {pushTestBusy ? "表示中..." : "テスト通知を表示する"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
              「テスト通知を表示する」は、この端末だけの表示確認です。サーバーからの通知ではありません。
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
              ℹ️ 登録した端末のON/OFFは、管理者が「🔔 プッシュ通知の管理」タブから行います。
            </div>
          </div>
        </>}

        {/* ── プッシュ通知の管理タブ(管理者専用) ── */}
        {tab === "push-admin" && <>
          {!adminUnlocked ? (
            <div style={s.card}>
              <div style={s.sectionTitle}>🔒 管理者用パスコード</div>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 14 }}>
                財務・書類管理と同じパスコードを入力してください。
              </div>
              <input
                type="password"
                style={{ ...s.input, marginBottom: 14 }}
                value={adminPasscodeInput}
                onChange={e => setAdminPasscodeInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && unlockAdmin()}
                placeholder="パスコード"
              />
              <button style={{ ...s.btn, opacity: adminLoading || !adminPasscodeInput ? 0.6 : 1 }} onClick={unlockAdmin} disabled={adminLoading || !adminPasscodeInput}>
                {adminLoading ? "確認中..." : "開く"}
              </button>
              {adminError && (() => {
                const [summary, detail] = adminError.split("\n\n詳細: ");
                return (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
                    <div style={{ color: "#DC2626", fontSize: 13, whiteSpace: "pre-wrap" }}>{summary}</div>
                    {detail && <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 4 }}>詳細: {detail}</div>}
                  </div>
                );
              })()}
            </div>
          ) : (
            <>
              <div style={{ ...s.card, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <div style={{ fontSize: 13, color: "#1E40AF", lineHeight: 1.7 }}>
                  ℹ️ 登録しただけでは通知は届きません。ここでONにしたスタッフ・端末にだけ、今後の通知が届くようになります。
                </div>
              </div>

              <div style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={s.sectionTitle}>🔔 登録済みの端末</div>
                  <button style={s.btnGray} onClick={refreshAdminList}>更新</button>
                </div>

                {adminList.length === 0 ? (
                  <div style={s.emptyText}>登録された端末はありません</div>
                ) : (
                  Object.entries(
                    adminList.reduce((acc, row) => {
                      (acc[row.staff_name] = acc[row.staff_name] || []).push(row);
                      return acc;
                    }, {})
                  ).map(([name, devices]) => (
                    <div key={name} style={{ marginBottom: 18 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#1A3A5C", marginBottom: 8 }}>👤 {name}</div>
                      {devices.map(d => (
                        <div key={d.id} style={s.ruleCard}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>{d.device_label || "端末"}</span>
                              <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 8 }}>
                                登録日: {d.created_at ? new Date(d.created_at).toLocaleDateString("ja-JP") : "-"}
                              </span>
                            </div>
                            <span style={{ ...s.tag, margin: 0, background: d.enabled ? "#DCFCE7" : "#F1F5F9", color: d.enabled ? "#166534" : "#64748B", fontWeight: 700 }}>
                              {d.enabled ? "ON" : "OFF"}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              style={{ ...s.btnSm, background: d.enabled ? "#F59E0B" : "#059669", opacity: adminBusyIds[d.id] ? 0.6 : 1 }}
                              onClick={() => toggleAdminDevice(d.id, !d.enabled)}
                              disabled={adminBusyIds[d.id]}
                            >
                              {d.enabled ? "OFFにする" : "ONにする"}
                            </button>
                            <button style={{ ...s.btnSm, opacity: adminBusyIds[d.id] ? 0.6 : 1 }} onClick={() => testAdminDevice(d.id)} disabled={adminBusyIds[d.id]}>
                              テスト送信
                            </button>
                            <button style={{ ...s.btnDanger, opacity: adminBusyIds[d.id] ? 0.6 : 1 }} onClick={() => deleteAdminDevice(d.id)} disabled={adminBusyIds[d.id]}>
                              削除
                            </button>
                          </div>
                          {adminRowMsg[d.id] && (
                            <div style={{ fontSize: 12, color: "#374151", marginTop: 8 }}>{adminRowMsg[d.id]}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}

                {adminError && (() => {
                  const [summary, detail] = adminError.split("\n\n詳細: ");
                  return (
                    <div style={{ marginTop: 12, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
                      <div style={{ color: "#DC2626", fontSize: 13, whiteSpace: "pre-wrap" }}>{summary}</div>
                      {detail && <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 4 }}>詳細: {detail}</div>}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </>}
      </div>
    </div>
  );
}