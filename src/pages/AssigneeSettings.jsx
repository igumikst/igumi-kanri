import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Hdr } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { describeApiError } from "../lib/errorMessage";
import { normalizeAssigneeName, isDuplicateAssigneeName } from "../lib/assignees";
import { getDeviceAssigneeName, setDeviceAssigneeName } from "../lib/deviceAssignee";

export default function AssigneeSettings({ isPC, pp, nav, rpOpen, setRpOpen, SB_W, RP_W, cust, pjs, submittedQuotes, wonQuotes, cos, tks, finFiles, tmplFiles, tileConf }) {
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [deviceName, setDeviceNameState] = useState(() => getDeviceAssigneeName());
  const changeDeviceName = (name) => { setDeviceAssigneeName(name); setDeviceNameState(name); };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("home_settings").select("value").eq("id", "assignee_names").single();
      if (data?.value && Array.isArray(data.value)) setNames(data.value);
      setLoading(false);
    })();
  }, []);

  const save = async (list, successMsg) => {
    setBusy(true);
    setError("");
    setMsg("");
    const { error: err } = await supabase.from("home_settings").upsert({ id: "assignee_names", value: list, updated_at: new Date().toISOString() });
    if (err) {
      setError(describeApiError(err, successMsg === "追加しました" ? "担当者の追加" : "担当者の削除"));
    } else {
      setNames(list);
      setMsg(successMsg);
    }
    setBusy(false);
  };

  const addName = () => {
    if (busy) return;
    const name = normalizeAssigneeName(input);
    if (!name) { setError("名前を入力してください"); return; }
    if (isDuplicateAssigneeName(names, name)) { setError("その名前はすでに追加されています"); return; }
    setInput("");
    save([...names, name], "追加しました");
  };

  const deleteName = (name) => {
    if (busy) return;
    if (!window.confirm(`「${name}」をリストから削除しますか?`)) return;
    save(names.filter(n => n !== name), "削除しました");
  };

  const pending = (tks || []).filter(t => !t.done);

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && <PCSidebar nav={nav} page="assigneesettings" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} submittedQuotes={submittedQuotes} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} wonQuotes={wonQuotes || []} submittedQuotes={submittedQuotes} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} isPC={isPC} />}

      <Hdr title="👤 担当者の管理" back={() => nav("settings")} />

      <div style={{ maxWidth: 560, margin: "0 auto", padding: isPC ? "32px 24px" : "16px 12px" }}>
        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#1E40AF", lineHeight: 1.7 }}>
          ここで追加した名前は、電話受付の担当者選択や、プッシュ通知の登録画面で選べるようになります。
          追加しただけでは通知が届くようになるわけではありません(ONにするのは管理者です)。
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 6 }}>📱 この端末の担当者</div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 1.6 }}>
            ここで選んだ名前が、この端末で見積を作成したときの「作成者」として自動で入ります(見積編集画面でも、保存前に変更できます)。
          </div>
          <select
            value={deviceName}
            onChange={e => changeDeviceName(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, boxSizing: "border-box", background: "#F8FAFC", color: "#1F2937" }}
          >
            <option value="">― 選択してください ―</option>
            {names.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>名前を追加</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addName()}
              placeholder="名前を入力"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, boxSizing: "border-box", background: "#F8FAFC", color: "#1F2937" }}
            />
            <button
              onClick={addName}
              disabled={busy}
              style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: busy ? "#9CA3AF" : "#1A3A5C", color: "#fff", fontWeight: 700, cursor: busy ? "default" : "pointer" }}
            >
              追加
            </button>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>現在のリスト</div>
          {loading ? (
            <div style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", padding: "16px 0" }}>読み込み中...</div>
          ) : names.length === 0 ? (
            <div style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", padding: "16px 0" }}>まだ名前が登録されていません</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {names.map(name => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F3F4F6", borderRadius: 20, padding: "6px 12px" }}>
                  <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{name}</span>
                  <button onClick={() => deleteName(name)} disabled={busy} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: busy ? "default" : "pointer", fontSize: 15, lineHeight: 1 }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 12, lineHeight: 1.7 }}>
          削除すると、このリストから選べなくなるだけです。すでに登録されている端末や、過去の電話案件に記録された担当者名は変わりません。
          名前の変更(リネーム)はできません。別の名前として追加・削除してください。
        </div>

        {msg && <div style={{ marginTop: 12, fontSize: 13, color: "#166534", fontWeight: 700 }}>✅ {msg}</div>}

        {error && (() => {
          if (!error.includes("\n\n詳細: ")) {
            return <div style={{ marginTop: 12, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>⚠️ {error}</div>;
          }
          const [summary, detail] = error.split("\n\n詳細: ");
          return (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
              <div style={{ color: "#DC2626", fontSize: 13, whiteSpace: "pre-wrap" }}>{summary}</div>
              {detail && <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 4 }}>詳細: {detail}</div>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
