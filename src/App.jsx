import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const STATUSES = ["発注待ち", "見積中", "着工", "進行中", "完了", "中断"];
const COMPANY_TYPES = ["元請け", "協力業者", "取引先", "その他"];
const CONTACT_ROLES = ["営業", "現場監督", "職人", "事務", "その他"];
const STATUS_STYLE = {
  "発注待ち": { bg: "#FFF3CD", text: "#856404", border: "#FFCA2C" },
  "見積中":   { bg: "#E0F0FF", text: "#0B4F8A", border: "#60A5FA" },
  "着工":     { bg: "#D1FAE5", text: "#065F46", border: "#34D399" },
  "進行中":   { bg: "#D1E7DD", text: "#0A3622", border: "#20C997" },
  "完了":     { bg: "#E2E3E5", text: "#41464B", border: "#ADB5BD" },
  "中断":     { bg: "#F8D7DA", text: "#58151C", border: "#F1707A" },
};

const FINANCE_LINKS = [
  { label: "請求書PDF", icon: "🧾" },
  { label: "領収書",    icon: "📄" },
  { label: "発注書",    icon: "📝" },
  { label: "納品書",    icon: "📦" },
  { label: "通帳確認",  icon: "🏦" },
  { label: "決算資料",  icon: "📊" },
  { label: "保険関係",  icon: "🛡" },
  { label: "税務書類",  icon: "📑" },
];

const LINK_CATEGORIES = [
  {
    category: "ツール・サービス",
    icon: "🔗",
    links: [
      { label: "Dropbox",    url: "https://www.dropbox.com",          icon: "📦" },
      { label: "サイボウズ", url: "https://garoon.cybozu.co.jp",      icon: "🗂" },
      { label: "イシグロ",   url: "https://www.ishiguro-group.co.jp", icon: "🏗" },
    ],
  },
];

const fmt = n => n ? "¥" + Number(n).toLocaleString() : "—";
const pct = (g, a) => a ? ((g / a) * 100).toFixed(1) + "%" : "—";

const generateYearMonths = () => {
  const now = new Date();
  const result = {};
  for (let y = 2024; y <= now.getFullYear(); y++) {
    result[y] = [];
    const maxM = y === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let m = 1; m <= maxM; m++) result[y].push(m);
  }
  return result;
};

// ─── Shared UI ────────────────────────────────────────────────
const Badge = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE["見積中"];
  return <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{status}</span>;
};

const Inp = ({ label, ...p }) => (
  <div style={{ marginBottom: 10 }}>
    {label && <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>{label}</div>}
    <input {...p} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box", outline: "none" }} />
  </div>
);

const Sel = ({ label, options, ...p }) => (
  <div style={{ marginBottom: 10 }}>
    {label && <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>{label}</div>}
    <select {...p} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box" }}>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  </div>
);

const BottomModal = ({ title, onClose, onSave, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
    <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 40px", width: "100%", maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ width: 40, height: 4, background: "#E5E7EB", borderRadius: 2, margin: "0 auto 16px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
        <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 15 }}>✕</button>
      </div>
      {children}
      {onSave && <button onClick={onSave} style={{ width: "100%", padding: 13, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: "pointer", marginTop: 6 }}>保存する</button>}
    </div>
  </div>
);

const Header = ({ title, back, right }) => (
  <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
    {back
      ? <button onClick={back} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>←</button>
      : <div style={{ background: "#E07B39", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16 }}>I</div>
    }
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
      {!back && <div style={{ fontSize: 10, opacity: 0.65 }}>株式会社IGUMI</div>}
    </div>
    {right}
  </div>
);

const Loading = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
    <div style={{ width: 40, height: 40, border: "4px solid #E5E7EB", borderTop: "4px solid #1A3A5C", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
    <div style={{ color: "#6B7280", fontSize: 13 }}>読み込み中...</div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const ConfirmDialog = ({ message, onCancel, onConfirm }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
    <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 320 }}>
      <div style={{ fontSize: 15, color: "#374151", marginBottom: 20, lineHeight: 1.6 }}>{message}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>キャンセル</button>
        <button onClick={onConfirm} style={{ flex: 1, padding: 12, background: "#DC2626", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>削除する</button>
      </div>
    </div>
  </div>
);

// ─── ContactDetail ─────────────────────────────────────────────
function ContactDetail({ contact, companyName }) {
  const ct = contact;
  return (
    <div style={{ padding: 14 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#1A3A5C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", fontWeight: 800, flexShrink: 0 }}>
            {ct.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{ct.name}</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>{companyName} · {ct.role}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ct.tel && (
            <a href={`tel:${ct.tel}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "#F0F4F8", borderRadius: 10, padding: "12px 14px", textDecoration: "none", color: "#1F2937" }}>
              <span style={{ fontSize: 20 }}>📞</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>電話番号</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{ct.tel}</div>
              </div>
              <span style={{ color: "#1A3A5C", fontSize: 13, fontWeight: 700 }}>発信</span>
            </a>
          )}
          {ct.email && (
            <a href={`mailto:${ct.email}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "#F0F4F8", borderRadius: 10, padding: "12px 14px", textDecoration: "none", color: "#1F2937" }}>
              <span style={{ fontSize: 20 }}>✉️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>メールアドレス</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{ct.email}</div>
              </div>
              <span style={{ color: "#1A3A5C", fontSize: 13, fontWeight: 700 }}>送信</span>
            </a>
          )}
          {!ct.tel && !ct.email && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: 8 }}>連絡先未登録</div>}
          {ct.memo && (
            <div style={{ background: "#FFFBEB", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #F59E0B" }}>
              <div style={{ fontSize: 11, color: "#92400E", fontWeight: 700, marginBottom: 4 }}>📝 備考</div>
              <div style={{ fontSize: 13, color: "#1F2937", whiteSpace: "pre-wrap" }}>{ct.memo}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ProjectDetail ─────────────────────────────────────────────
function ProjectDetail({ project, companies, onDelete, onSave }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({ ...project, amount: project.amount || "", grossProfit: project.grossProfit || "" });
  const getCompany = id => companies.find(c => c.id === id);
  const p = project;
  const client = getCompany(p.clientId);
  const subs = (p.subcontractorIds || []).map(id => getCompany(id)).filter(Boolean);

  if (editing) {
    return (
      <div style={{ padding: 14 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, color: "#1A3A5C" }}>✏️ 案件を編集</div>
          <Inp label="案件名 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>ステータス</div>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box" }}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>取引先</div>
            <select value={form.clientId || ""} onChange={e => setForm({ ...form, clientId: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box" }}>
              <option value="">選択してください</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.branch ? " " + c.branch : ""}</option>)}
            </select>
          </div>
          <Inp label="社内担当" value={form.inCharge || ""} onChange={e => setForm({ ...form, inCharge: e.target.value })} />
          <Inp label="営業担当" value={form.salesRep || ""} onChange={e => setForm({ ...form, salesRep: e.target.value })} />
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>協力業者</div>
            <div style={{ background: "#FAFAFA", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", maxHeight: 100, overflowY: "auto" }}>
              {companies.filter(c => c.type === "協力業者" || c.name === "自社").map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={(form.subcontractorIds || []).includes(c.id)} onChange={e => setForm({ ...form, subcontractorIds: e.target.checked ? [...(form.subcontractorIds || []), c.id] : (form.subcontractorIds || []).filter(id => id !== c.id) })} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <Inp label="受注金額（税抜）" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <Inp label="粗利" type="number" value={form.grossProfit} onChange={e => setForm({ ...form, grossProfit: e.target.value })} />
          <Inp label="見積提出日" type="date" value={form.quoteDate || ""} onChange={e => setForm({ ...form, quoteDate: e.target.value })} />
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>備考</div>
            <textarea value={form.memo || ""} onChange={e => setForm({ ...form, memo: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, resize: "vertical", minHeight: 60, boxSizing: "border-box", background: "#FAFAFA" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>キャンセル</button>
            <button onClick={() => { onSave({ ...form, amount: Number(form.amount) || 0, grossProfit: Number(form.grossProfit) || 0, clientId: form.clientId || null }); setEditing(false); }} style={{ flex: 2, padding: 12, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>保存する</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, flex: 1, marginRight: 8 }}>{p.name}</div>
          <Badge status={p.status} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => { setForm({ ...project, amount: project.amount || "", grossProfit: project.grossProfit || "" }); setEditing(true); }} style={{ flex: 1, padding: "8px 0", background: "#EFF6FF", color: "#1A3A5C", border: "1.5px solid #BFDBFE", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✏️ 編集</button>
          <button onClick={() => setConfirmDelete(true)} style={{ flex: 1, padding: "8px 0", background: "#FEF2F2", color: "#DC2626", border: "1.5px solid #FECACA", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🗑 削除</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, background: "#FFF7ED", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF" }}>受注金額（税抜）</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#E07B39" }}>{fmt(p.amount)}</div>
          </div>
          <div style={{ flex: 1, background: "#F0FDF4", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF" }}>粗利 / 粗利率</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>{fmt(p.grossProfit)}</div>
            <div style={{ fontSize: 11, color: "#059669" }}>{pct(p.grossProfit, p.amount)}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
          {[["社内担当", p.inCharge], ["営業担当", p.salesRep], ["見積提出日", p.quoteDate]].map(([l, v]) => (
            <div key={l} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{v || "—"}</div>
            </div>
          ))}
        </div>
        {p.memo && <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#374151", marginBottom: 12 }}>📝 {p.memo}</div>}
        <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C", marginBottom: 8 }}>🏢 取引先</div>
          {client ? (
            <div style={{ background: "#F0F4F8", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>{client.name}{client.branch ? ` ${client.branch}` : ""}</div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>{client.type}</div>
              {(client.contacts || []).map(ct => (
                <div key={ct.id} style={{ marginTop: 6, background: "#fff", borderRadius: 7, padding: "6px 10px", fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>{ct.name}</span>
                  <span style={{ marginLeft: 6, background: "#E0EAF5", color: "#1A3A5C", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>{ct.role}</span>
                  {ct.tel && <div style={{ color: "#6B7280", marginTop: 2 }}>📞 {ct.tel}</div>}
                </div>
              ))}
            </div>
          ) : <div style={{ color: "#9CA3AF", fontSize: 13 }}>未設定</div>}
        </div>
        {subs.length > 0 && (
          <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C", marginBottom: 8 }}>🔧 協力業者</div>
            {subs.map(c => (
              <div key={c.id} style={{ background: "#FFF7ED", borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {confirmDelete && <ConfirmDialog message={`「${p.name}」を削除しますか？この操作は元に戻せません。`} onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); onDelete(p.id); }} />}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [companies, setCompanies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selProject, setSelProject] = useState(null);
  const [selCompany, setSelCompany] = useState(null);
  const [selContact, setSelContact] = useState(null);
  const [modal, setModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState("すべて");
  const [filterType, setFilterType] = useState("すべて");
  const [searchP, setSearchP] = useState("");
  const [searchC, setSearchC] = useState("");
  const [confirmInfo, setConfirmInfo] = useState(null);

  // Undo
  const [history, setHistory] = useState([]);
  const pushHistory = (snap) => setHistory(h => [...h.slice(-4), snap]);
  const undo = () => {
    if (!history.length) return;
    const snap = history[history.length - 1];
    setProjects(snap.projects); setCompanies(snap.companies); setTasks(snap.tasks);
    setHistory(h => h.slice(0, -1));
    setSelProject(null); setSelCompany(null); setModal(null);
  };

  // 財務・書類
  const [dbSelCategory, setDbSelCategory] = useState(null);
  const [dbSelYear, setDbSelYear] = useState(null);
  const [dbSelYearMonth, setDbSelYearMonth] = useState(null);
  const [financeData, setFinanceData] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [passwords, setPasswords] = useState({});
  const [unlockedCats, setUnlockedCats] = useState({});
  const [pwModal, setPwModal] = useState(null);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  // カスタマイズ
  const [customize, setCustomize] = useState({ companyName: "株式会社IGUMI", systemName: "案件管理システム", headerColor1: "#1A3A5C", headerColor2: "#2563EB", accentColor: "#E07B39", heroBgImage: null, heroBgMode: "gradient", pageBackground: "#F0F4F8", pageBgImage: null, pageBgMode: "color" });
  const [editCustom, setEditCustom] = useState({ ...customize });

  // フォーム
  const blankP = { name: "", status: "発注待ち", clientId: "", salesRep: "", inCharge: "崎岡", subcontractorIds: [], amount: "", grossProfit: "", quoteDate: "", memo: "" };
  const [newProj, setNewProj] = useState(blankP);
  const [newCo, setNewCo] = useState({ name: "", type: "協力業者", branch: "" });
  const [newCt, setNewCt] = useState({ name: "", role: "営業", tel: "", email: "", memo: "" });
  const [newTask, setNewTask] = useState({ title: "", due: "", priority: "mid" });

  useEffect(() => { loadAll(); }, []);
  const loadAll = async () => {
    setLoading(true);
    const [{ data: c }, { data: p }, { data: t }] = await Promise.all([
      supabase.from("companies").select("*").order("created_at"),
      supabase.from("projects").select("*").order("created_at"),
      supabase.from("tasks").select("*").order("created_at"),
    ]);
    setCompanies(c || []); setProjects(p || []); setTasks(t || []);
    setLoading(false);
  };

  const navigate = (p) => {
    setPage(p); setSearchP(""); setSearchC(""); setFilterStatus("すべて"); setFilterType("すべて");
    setSelProject(null); setSelCompany(null); setSelContact(null);
    setDbSelCategory(null); setDbSelYear(null); setDbSelYearMonth(null);
    setPreviewFile(null); setPwModal(null); setPwInput(""); setPwError(""); setModal(null);
  };

  const getCompany = id => companies.find(c => c.id === id);
  const getProjectsFor = cid => projects.filter(p => p.clientId === cid || (p.subcontractorIds || []).includes(cid));
  const pendingTasks = tasks.filter(t => !t.done);
  const PRIORITY = { high: { label: "高", color: "#EF4444" }, mid: { label: "中", color: "#F59E0B" }, low: { label: "低", color: "#10B981" } };

  // ── CRUD ──────────────────────────────────────────────────
  const saveProject = async () => {
    if (!newProj.name) return;
    pushHistory({ projects, companies, tasks });
    const { data } = await supabase.from("projects").insert([{
      name: newProj.name, status: newProj.status,
      clientId: newProj.clientId || null,
      salesRep: newProj.salesRep, inCharge: newProj.inCharge,
      subcontractorIds: newProj.subcontractorIds,
      amount: Number(newProj.amount) || 0,
      grossProfit: Number(newProj.grossProfit) || 0,
      quoteDate: newProj.quoteDate || null, memo: newProj.memo,
    }]).select();
    if (data) setProjects([...projects, data[0]]);
    setNewProj(blankP); setModal(null);
  };

  const updateProject = async (updated) => {
    pushHistory({ projects, companies, tasks });
    const { data } = await supabase.from("projects").update({
      name: updated.name, status: updated.status,
      clientId: updated.clientId || null,
      salesRep: updated.salesRep, inCharge: updated.inCharge,
      subcontractorIds: updated.subcontractorIds || [],
      amount: Number(updated.amount) || 0,
      grossProfit: Number(updated.grossProfit) || 0,
      quoteDate: updated.quoteDate || null, memo: updated.memo,
    }).eq("id", updated.id).select();
    if (data) { setProjects(projects.map(p => p.id === updated.id ? data[0] : p)); setSelProject(data[0]); }
  };

  const deleteProject = async (id) => {
    pushHistory({ projects, companies, tasks });
    await supabase.from("projects").delete().eq("id", id);
    setProjects(projects.filter(p => p.id !== id)); setSelProject(null);
  };

  const saveCompany = async () => {
    if (!newCo.name) return;
    pushHistory({ projects, companies, tasks });
    const { data } = await supabase.from("companies").insert([{ name: newCo.name, type: newCo.type, branch: newCo.branch, contacts: [] }]).select();
    if (data) setCompanies([...companies, data[0]]);
    setNewCo({ name: "", type: "協力業者", branch: "" }); setModal(null);
  };

  const saveContact = async () => {
    if (!newCt.name || !selCompany) return;
    pushHistory({ projects, companies, tasks });
    const ct = { id: Date.now(), ...newCt };
    const newContacts = [...(selCompany.contacts || []), ct];
    const { data } = await supabase.from("companies").update({ contacts: newContacts }).eq("id", selCompany.id).select();
    if (data) { setCompanies(companies.map(c => c.id === selCompany.id ? data[0] : c)); setSelCompany(data[0]); }
    setNewCt({ name: "", role: "営業", tel: "", email: "", memo: "" }); setModal(null);
  };

  const deleteCompany = async (id) => {
    pushHistory({ projects, companies, tasks });
    await supabase.from("companies").delete().eq("id", id);
    setCompanies(companies.filter(c => c.id !== id));
  };

  const toggleTask = async (task) => {
    pushHistory({ projects, companies, tasks });
    const { data } = await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id).select();
    if (data) setTasks(tasks.map(t => t.id === task.id ? data[0] : t));
  };

  const saveTask = async () => {
    if (!newTask.title) return;
    pushHistory({ projects, companies, tasks });
    const { data } = await supabase.from("tasks").insert([{ title: newTask.title, due: newTask.due || null, priority: newTask.priority, done: false }]).select();
    if (data) setTasks([...tasks, data[0]]);
    setNewTask({ title: "", due: "", priority: "mid" }); setModal(null);
  };

  const deleteTask = async (id) => {
    pushHistory({ projects, companies, tasks });
    await supabase.from("tasks").delete().eq("id", id);
    setTasks(tasks.filter(t => t.id !== id));
  };

  const handleImageUpload = (e, key) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setEditCustom(prev => ({ ...prev, [key]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const filteredProjects = projects.filter(p => {
    if (filterStatus !== "すべて" && p.status !== filterStatus) return false;
    if (searchP && !p.name.includes(searchP) && !(getCompany(p.clientId)?.name || "").includes(searchP)) return false;
    return true;
  });
  const filteredCompanies = companies.filter(c => {
    if (filterType !== "すべて" && c.type !== filterType) return false;
    if (searchC && !c.name.includes(searchC)) return false;
    return true;
  });

  const undoBtn = history.length > 0 ? (
    <button onClick={undo} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>↩ {history.length}</button>
  ) : null;

  // ── HOME ──────────────────────────────────────────────────
  if (page === "home") {
    const activeProjects = projects.filter(p => p.status !== "完了" && p.status !== "中断");
    const tiles = [
      { key: "projects",  icon: "📋", label: "案件管理",      sub: `${activeProjects.length}件進行中`, color: customize.headerColor1 },
      { key: "companies", icon: "🏢", label: "取引先・協力業者", sub: `${companies.length}社登録`,    color: customize.accentColor },
      { key: "tasks",     icon: "✅", label: "タスク",        sub: `未完了 ${pendingTasks.length}件`, color: "#059669" },
      { key: "links",     icon: "🔗", label: "リンク集",      sub: "外部サービス",                   color: "#7C3AED" },
      { key: "db",        icon: "🗃", label: "財務・書類管理", sub: "書類一覧",                       color: "#0891B2" },
    ];
    return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: customize.pageBgMode === "image" && customize.pageBgImage ? `url(${customize.pageBgImage}) center/cover fixed` : customize.pageBackground, minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ background: customize.headerColor1, color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ background: customize.accentColor, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16 }}>I</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{customize.systemName}</div>
            <div style={{ fontSize: 10, opacity: 0.65 }}>{customize.companyName}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {undoBtn}
            <button onClick={() => { setEditCustom({ ...customize }); setModal("customize"); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>⚙ 編集</button>
          </div>
        </div>
        <div style={{ background: customize.heroBgMode === "image" && customize.heroBgImage ? `url(${customize.heroBgImage}) center/cover no-repeat` : `linear-gradient(135deg,${customize.headerColor1},${customize.headerColor2})`, padding: "20px 20px 28px", margin: "0 0 -16px", position: "relative" }}>
          {customize.heroBgMode === "image" && customize.heroBgImage && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>{customize.companyName}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>{customize.systemName}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>案件 {projects.length}件 ｜ 取引先 {companies.length}社</div>
          </div>
        </div>
        <div style={{ padding: "28px 14px 8px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 10 }}>DB一覧</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            {tiles.map(t => (
              <button key={t.key} onClick={() => navigate(t.key)} style={{ background: "#fff", border: "none", borderRadius: 14, padding: "16px 14px", textAlign: "left", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#1F2937", marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{t.sub}</div>
                <div style={{ marginTop: 10, height: 3, borderRadius: 2, background: t.color, width: "40%" }} />
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 10 }}>直近のタスク</div>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 20 }}>
            {loading ? <div style={{ padding: 16, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>読み込み中...</div> :
              pendingTasks.slice(0, 3).map((t, i) => (
                <div key={t.id} style={{ padding: "12px 16px", borderBottom: i < Math.min(pendingTasks.length, 3) - 1 ? "1px solid #F3F4F6" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY[t.priority]?.color || "#9CA3AF", flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                  {t.due && <div style={{ fontSize: 11, color: "#9CA3AF" }}>{t.due}</div>}
                </div>
              ))
            }
            {!loading && pendingTasks.length === 0 && <div style={{ padding: 16, color: "#9CA3AF", fontSize: 13, textAlign: "center" }}>タスクはありません</div>}
            <button onClick={() => navigate("tasks")} style={{ width: "100%", padding: 10, background: "#F9FAFB", border: "none", fontSize: 12, color: customize.headerColor1, fontWeight: 700, cursor: "pointer", borderTop: "1px solid #F3F4F6" }}>すべて見る →</button>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 10 }}>🔗 リンク集</div>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 30 }}>
            {LINK_CATEGORIES.flatMap(cat => cat.links).map((l, i, arr) => (
              <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none", textDecoration: "none", color: "#1F2937" }}>
                <span style={{ fontSize: 20 }}>{l.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{l.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 14, color: "#9CA3AF" }}>↗</span>
              </a>
            ))}
          </div>
        </div>
        {modal === "customize" && (
          <BottomModal title="⚙ カスタマイズ" onClose={() => setModal(null)} onSave={() => { setCustomize({ ...editCustom }); setModal(null); }}>
            <Inp label="会社名" value={editCustom.companyName} onChange={e => setEditCustom({ ...editCustom, companyName: e.target.value })} />
            <Inp label="システム名" value={editCustom.systemName} onChange={e => setEditCustom({ ...editCustom, systemName: e.target.value })} />
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>🖼 バナー背景</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {["gradient","image"].map(m => (
                  <button key={m} onClick={() => setEditCustom(p => ({ ...p, heroBgMode: m }))} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1.5px solid", borderColor: editCustom.heroBgMode === m ? "#1A3A5C" : "#E5E7EB", background: editCustom.heroBgMode === m ? "#1A3A5C" : "#fff", color: editCustom.heroBgMode === m ? "#fff" : "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    {m === "gradient" ? "🎨 カラー" : "🖼 画像"}
                  </button>
                ))}
              </div>
              {editCustom.heroBgMode === "gradient" ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 3 }}>開始</div><input type="color" value={editCustom.headerColor1} onChange={e => setEditCustom({ ...editCustom, headerColor1: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} /></div>
                  <span style={{ color: "#9CA3AF", marginTop: 16 }}>→</span>
                  <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 3 }}>終了</div><input type="color" value={editCustom.headerColor2} onChange={e => setEditCustom({ ...editCustom, headerColor2: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} /></div>
                  <div style={{ flex: 1, height: 36, borderRadius: 8, background: `linear-gradient(135deg,${editCustom.headerColor1},${editCustom.headerColor2})`, marginTop: 16 }} />
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F9FAFB", borderRadius: 10, border: "1.5px dashed #D1D5DB", cursor: "pointer" }}>
                  <span style={{ fontSize: 22 }}>📁</span>
                  <div><div style={{ fontWeight: 700, fontSize: 13 }}>画像を選択</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>JPG・PNG</div></div>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImageUpload(e, "heroBgImage")} />
                </label>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>📄 ページ背景</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {["color","image"].map(m => (
                  <button key={m} onClick={() => setEditCustom(p => ({ ...p, pageBgMode: m }))} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1.5px solid", borderColor: editCustom.pageBgMode === m ? "#1A3A5C" : "#E5E7EB", background: editCustom.pageBgMode === m ? "#1A3A5C" : "#fff", color: editCustom.pageBgMode === m ? "#fff" : "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    {m === "color" ? "🎨 カラー" : "🖼 画像"}
                  </button>
                ))}
              </div>
              {editCustom.pageBgMode === "color" ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="color" value={editCustom.pageBackground} onChange={e => setEditCustom({ ...editCustom, pageBackground: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} />
                  <div style={{ flex: 1, height: 36, borderRadius: 8, background: editCustom.pageBackground, border: "1px solid #E5E7EB" }} />
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F9FAFB", borderRadius: 10, border: "1.5px dashed #D1D5DB", cursor: "pointer" }}>
                  <span style={{ fontSize: 22 }}>📁</span>
                  <div><div style={{ fontWeight: 700, fontSize: 13 }}>画像を選択</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>JPG・PNG</div></div>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImageUpload(e, "pageBgImage")} />
                </label>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>🎨 アクセントカラー</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="color" value={editCustom.accentColor} onChange={e => setEditCustom({ ...editCustom, accentColor: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} />
                <div style={{ flex: 1, height: 36, borderRadius: 8, background: editCustom.accentColor }} />
              </div>
            </div>
          </BottomModal>
        )}
      </div>
    );
  }

  // ── PROJECTS ──────────────────────────────────────────────
  if (page === "projects") {
    const totalAmount = filteredProjects.reduce((s, p) => s + (p.amount || 0), 0);
    const totalProfit = filteredProjects.reduce((s, p) => s + (p.grossProfit || 0), 0);
    return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <Header title={selProject ? selProject.name : "📋 案件管理"} back={selProject ? () => setSelProject(null) : () => navigate("home")} right={undoBtn} />
        {loading ? <Loading /> : selProject ? (
          <ProjectDetail project={selProject} companies={companies} onDelete={deleteProject} onSave={updateProject} />
        ) : (
          <div style={{ padding: 14 }}>
            <input value={searchP} onChange={e => setSearchP(e.target.value)} placeholder="🔍 案件名・取引先で検索" style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#fff", boxSizing: "border-box", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
              {["すべて", ...STATUSES].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "4px 12px", borderRadius: 16, border: "1.5px solid", whiteSpace: "nowrap", borderColor: filterStatus === s ? "#1A3A5C" : "#D1D5DB", background: filterStatus === s ? "#1A3A5C" : "#fff", color: filterStatus === s ? "#fff" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{s}</button>
              ))}
              <button onClick={() => setModal("addProject")} style={{ padding: "4px 14px", borderRadius: 16, background: "#E07B39", color: "#fff", border: "none", fontWeight: 800, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>＋ 新規</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[["件数", `${filteredProjects.length}件`], ["受注合計", fmt(totalAmount)], ["粗利合計", fmt(totalProfit)]].map(([l, v]) => (
                <div key={l} style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "8px 10px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>{l}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#1A3A5C", marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {filteredProjects.map(p => {
                const client = getCompany(p.clientId);
                const gPct = p.amount ? ((p.grossProfit / p.amount) * 100).toFixed(1) : null;
                return (
                  <div key={p.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: "4px solid #1A3A5C", overflow: "hidden" }}>
                    <div onClick={() => setSelProject(p)} style={{ padding: "13px 14px", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8 }}>{p.name}</div>
                        <Badge status={p.status} />
                      </div>
                      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{client ? `🏢 ${client.name}${client.branch ? " " + client.branch : ""}` : "取引先未設定"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#E07B39" }}>{fmt(p.amount)}</div>
                        {gPct && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>粗利率 {gPct}%</div>}
                      </div>
                      {p.memo ? <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>📝 {p.memo}</div> : null}
                    </div>
                    <div style={{ display: "flex", borderTop: "1px solid #F3F4F6" }}>
                      <button onClick={() => setSelProject(p)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>詳細 →</button>
                      <button onClick={() => setConfirmInfo({ message: `「${p.name}」を削除しますか？`, onConfirm: () => { deleteProject(p.id); setConfirmInfo(null); } })} style={{ padding: "8px 16px", background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {modal === "addProject" && (
          <BottomModal title="新規案件を追加" onClose={() => setModal(null)} onSave={saveProject}>
            <Inp label="案件名 *" value={newProj.name} onChange={e => setNewProj({ ...newProj, name: e.target.value })} placeholder="例: 渋谷ビル改修工事" />
            <Sel label="ステータス" options={STATUSES} value={newProj.status} onChange={e => setNewProj({ ...newProj, status: e.target.value })} />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>取引先</div>
              <select value={newProj.clientId} onChange={e => setNewProj({ ...newProj, clientId: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FAFAFA", boxSizing: "border-box" }}>
                <option value="">選択してください</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.branch ? " " + c.branch : ""}</option>)}
              </select>
            </div>
            <Inp label="社内担当" value={newProj.inCharge} onChange={e => setNewProj({ ...newProj, inCharge: e.target.value })} placeholder="例: 崎岡" />
            <Inp label="営業担当" value={newProj.salesRep} onChange={e => setNewProj({ ...newProj, salesRep: e.target.value })} placeholder="例: 加藤" />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>協力業者（複数可）</div>
              <div style={{ background: "#FAFAFA", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", maxHeight: 100, overflowY: "auto" }}>
                {companies.filter(c => c.type === "協力業者" || c.name === "自社").map(c => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={newProj.subcontractorIds.includes(c.id)} onChange={e => setNewProj({ ...newProj, subcontractorIds: e.target.checked ? [...newProj.subcontractorIds, c.id] : newProj.subcontractorIds.filter(id => id !== c.id) })} />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <Inp label="受注金額（税抜）" type="number" value={newProj.amount} onChange={e => setNewProj({ ...newProj, amount: e.target.value })} placeholder="例: 500000" />
            <Inp label="粗利" type="number" value={newProj.grossProfit} onChange={e => setNewProj({ ...newProj, grossProfit: e.target.value })} placeholder="例: 200000" />
            <Inp label="見積提出日" type="date" value={newProj.quoteDate} onChange={e => setNewProj({ ...newProj, quoteDate: e.target.value })} />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>備考</div>
              <textarea value={newProj.memo} onChange={e => setNewProj({ ...newProj, memo: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, resize: "vertical", minHeight: 60, boxSizing: "border-box", background: "#FAFAFA" }} />
            </div>
          </BottomModal>
        )}
        {confirmInfo && <ConfirmDialog message={confirmInfo.message} onCancel={() => setConfirmInfo(null)} onConfirm={confirmInfo.onConfirm} />}
      </div>
    );
  }

  // ── COMPANIES ─────────────────────────────────────────────
  if (page === "companies") {
    return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <Header
          title={selContact ? selContact.name : selCompany ? selCompany.name : "🏢 取引先・協力業者"}
          back={selContact ? () => setSelContact(null) : selCompany ? () => setSelCompany(null) : () => navigate("home")}
          right={undoBtn}
        />
        {loading ? <Loading /> : selContact ? (
          <ContactDetail contact={selContact} companyName={selCompany?.name + (selCompany?.branch ? ` ${selCompany.branch}` : "") || ""} />
        ) : selCompany ? (
          <div style={{ padding: 14 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{selCompany.name}{selCompany.branch ? ` ${selCompany.branch}` : ""}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{selCompany.type}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C" }}>👤 担当者</div>
                <button onClick={() => setModal("addContact")} style={{ padding: "4px 12px", borderRadius: 14, background: "#E07B39", color: "#fff", border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>＋ 追加</button>
              </div>
              {(selCompany.contacts || []).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 14 }}>担当者が未登録です</div>}
              {[...new Set((selCompany.contacts || []).map(ct => ct.role))].map(role => (
                <div key={role} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", borderLeft: "3px solid #E07B39", paddingLeft: 7, marginBottom: 6 }}>{role}</div>
                  {(selCompany.contacts || []).filter(ct => ct.role === role).map(ct => (
                    <div key={ct.id} onClick={() => setSelContact(ct)} style={{ background: "#F9FAFB", borderRadius: 8, padding: "10px 12px", marginBottom: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1A3A5C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#fff", fontWeight: 800, flexShrink: 0 }}>{ct.name.charAt(0)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{ct.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{[ct.tel, ct.email].filter(Boolean).join(" · ") || "連絡先未登録"}</div>
                      </div>
                      <span style={{ color: "#9CA3AF", fontSize: 14 }}>›</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1A3A5C", marginBottom: 8 }}>📋 関連案件</div>
                {getProjectsFor(selCompany.id).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>案件なし</div>}
                {getProjectsFor(selCompany.id).map(p => (
                  <div key={p.id} style={{ background: "#F0F4F8", borderRadius: 8, padding: "9px 12px", marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <Badge status={p.status} />
                    </div>
                    <div style={{ fontSize: 12, color: "#E07B39", fontWeight: 700, marginTop: 2 }}>{fmt(p.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 14 }}>
            <input value={searchC} onChange={e => setSearchC(e.target.value)} placeholder="🔍 会社名で検索" style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#fff", boxSizing: "border-box", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
              {["すべて", ...COMPANY_TYPES].map(t => (
                <button key={t} onClick={() => setFilterType(t)} style={{ padding: "4px 12px", borderRadius: 16, border: "1.5px solid", whiteSpace: "nowrap", borderColor: filterType === t ? "#1A3A5C" : "#D1D5DB", background: filterType === t ? "#1A3A5C" : "#fff", color: filterType === t ? "#fff" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{t}</button>
              ))}
              <button onClick={() => setModal("addCompany")} style={{ padding: "4px 14px", borderRadius: 16, background: "#E07B39", color: "#fff", border: "none", fontWeight: 800, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>＋ 新規</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {filteredCompanies.map(c => (
                <div key={c.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: "4px solid #E07B39", overflow: "hidden" }}>
                  <div onClick={() => setSelCompany(c)} style={{ padding: "13px 14px", cursor: "pointer" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}{c.branch ? ` ${c.branch}` : ""}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{c.type} ｜ 担当者 {(c.contacts || []).length}名</div>
                    <div style={{ fontSize: 11, color: "#1A3A5C", marginTop: 3 }}>案件 {getProjectsFor(c.id).length}件</div>
                  </div>
                  <div style={{ display: "flex", borderTop: "1px solid #F3F4F6" }}>
                    <button onClick={() => setSelCompany(c)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", fontSize: 12, color: "#1A3A5C", fontWeight: 700, cursor: "pointer" }}>詳細 →</button>
                    <button onClick={() => setConfirmInfo({ message: `「${c.name}」を削除しますか？`, onConfirm: () => { deleteCompany(c.id); setConfirmInfo(null); } })} style={{ padding: "8px 16px", background: "none", border: "none", fontSize: 12, color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {modal === "addCompany" && (
          <BottomModal title="新規取引先を追加" onClose={() => setModal(null)} onSave={saveCompany}>
            <Inp label="会社名 *" value={newCo.name} onChange={e => setNewCo({ ...newCo, name: e.target.value })} placeholder="例: 山田工業株式会社" />
            <Inp label="支店・営業所" value={newCo.branch} onChange={e => setNewCo({ ...newCo, branch: e.target.value })} placeholder="例: 世田谷" />
            <Sel label="種別" options={COMPANY_TYPES} value={newCo.type} onChange={e => setNewCo({ ...newCo, type: e.target.value })} />
          </BottomModal>
        )}
        {modal === "addContact" && (
          <BottomModal title="担当者を追加" onClose={() => setModal(null)} onSave={saveContact}>
            <Inp label="担当者名 *" value={newCt.name} onChange={e => setNewCt({ ...newCt, name: e.target.value })} placeholder="例: 加藤 超" />
            <Sel label="役割" options={CONTACT_ROLES} value={newCt.role} onChange={e => setNewCt({ ...newCt, role: e.target.value })} />
            <Inp label="電話番号" value={newCt.tel} onChange={e => setNewCt({ ...newCt, tel: e.target.value })} placeholder="090-0000-0000" />
            <Inp label="メールアドレス" value={newCt.email} onChange={e => setNewCt({ ...newCt, email: e.target.value })} placeholder="example@mail.com" />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>備考</div>
              <textarea value={newCt.memo} onChange={e => setNewCt({ ...newCt, memo: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, resize: "vertical", minHeight: 60, boxSizing: "border-box", background: "#FAFAFA" }} />
            </div>
          </BottomModal>
        )}
        {confirmInfo && <ConfirmDialog message={confirmInfo.message} onCancel={() => setConfirmInfo(null)} onConfirm={confirmInfo.onConfirm} />}
      </div>
    );
  }

  // ── TASKS ─────────────────────────────────────────────────
  if (page === "tasks") {
    const completed = tasks.filter(t => t.done);
    return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <Header title="✅ タスク" back={() => navigate("home")} right={undoBtn} />
        {loading ? <Loading /> : (
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button onClick={() => setModal("addTask")} style={{ padding: "6px 16px", borderRadius: 16, background: "#E07B39", color: "#fff", border: "none", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>＋ 新規タスク</button>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8 }}>未完了 ({pendingTasks.length})</div>
            {pendingTasks.map(t => (
              <div key={t.id} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => toggleTask(t)} style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #D1D5DB", background: "#fff", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
                  {t.due && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>📅 {t.due}</div>}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: PRIORITY[t.priority]?.color }}>{PRIORITY[t.priority]?.label}</div>
                <button onClick={() => setConfirmInfo({ message: `「${t.title}」を削除しますか？`, onConfirm: () => { deleteTask(t.id); setConfirmInfo(null); } })} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 14, cursor: "pointer" }}>🗑</button>
              </div>
            ))}
            {completed.length > 0 && <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8, marginTop: 16 }}>完了済み ({completed.length})</div>
              {completed.map(t => (
                <div key={t.id} style={{ background: "#F9FAFB", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, opacity: 0.6 }}>
                  <button onClick={() => toggleTask(t)} style={{ width: 22, height: 22, borderRadius: "50%", border: "none", background: "#10B981", cursor: "pointer", flexShrink: 0, color: "#fff", fontSize: 13 }}>✓</button>
                  <div style={{ flex: 1, textDecoration: "line-through", fontSize: 13, color: "#6B7280" }}>{t.title}</div>
                  <button onClick={() => setConfirmInfo({ message: `「${t.title}」を削除しますか？`, onConfirm: () => { deleteTask(t.id); setConfirmInfo(null); } })} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 14, cursor: "pointer" }}>🗑</button>
                </div>
              ))}
            </>}
          </div>
        )}
        {modal === "addTask" && (
          <BottomModal title="タスクを追加" onClose={() => setModal(null)} onSave={saveTask}>
            <Inp label="タスク名 *" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="例: 東洋住宅へ見積提出" />
            <Inp label="期限" type="date" value={newTask.due} onChange={e => setNewTask({ ...newTask, due: e.target.value })} />
            <Sel label="優先度" options={["high", "mid", "low"]} value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })} />
          </BottomModal>
        )}
        {confirmInfo && <ConfirmDialog message={confirmInfo.message} onCancel={() => setConfirmInfo(null)} onConfirm={confirmInfo.onConfirm} />}
      </div>
    );
  }

  // ── LINKS ─────────────────────────────────────────────────
  if (page === "links") {
    return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <Header title="🔗 リンク集" back={() => navigate("home")} />
        <div style={{ padding: 14 }}>
          {LINK_CATEGORIES.map(cat => (
            <div key={cat.category} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", marginBottom: 8 }}>{cat.icon} {cat.category}</div>
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                {cat.links.map((l, i) => (
                  <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < cat.links.length - 1 ? "1px solid #F3F4F6" : "none", textDecoration: "none", color: "#1F2937" }}>
                    <span style={{ fontSize: 24 }}>{l.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{l.label}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{l.url}</div>
                    </div>
                    <span style={{ color: "#9CA3AF" }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── 財務・書類管理 ─────────────────────────────────────────
  if (page === "db") {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const yearMonths = generateYearMonths();
    const categoryKey = dbSelCategory?.label || "";

    const handleFileUpload = (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          setFinanceData(prev => {
            const prevCat = prev[categoryKey] || {};
            return { ...prev, [categoryKey]: { ...prevCat, [dbSelYearMonth]: [...(prevCat[dbSelYearMonth] || []), { name: file.name, type: file.type, data: ev.target.result, size: file.size }] } };
          });
        };
        reader.readAsDataURL(file);
      });
    };

    const deleteFile = (idx) => {
      setFinanceData(prev => {
        const prevCat = prev[categoryKey] || {};
        return { ...prev, [categoryKey]: { ...prevCat, [dbSelYearMonth]: (prevCat[dbSelYearMonth] || []).filter((_, i) => i !== idx) } };
      });
    };

    const fileCount = (label) => {
      const data = financeData[label] || {};
      return Object.values(data).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
    };

    // パスワードモーダル
    const PwModalUI = () => {
      if (!pwModal) return null;
      const isSet = pwModal.mode === "set";
      const isChange = pwModal.mode === "change";
      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
              {isSet ? "🔐 パスワード設定" : isChange ? "🔑 パスワード変更" : "🔒 パスワード入力"}
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>「{pwModal.label}」{isSet ? "にパスワードを設定します" : isChange ? "のパスワードを変更します" : "のパスワードを入力してください"}</div>
            <input type="password" value={pwInput} onChange={e => { setPwInput(e.target.value); setPwError(""); }} placeholder="パスワードを入力" autoFocus style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: pwError ? "2px solid #DC2626" : "1.5px solid #E5E7EB", fontSize: 16, boxSizing: "border-box", marginBottom: 4 }} />
            {pwError && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>{pwError}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => { setPwModal(null); setPwInput(""); setPwError(""); }} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>キャンセル</button>
              <button onClick={() => {
                if (!pwInput) { setPwError("パスワードを入力してください"); return; }
                if (isSet || isChange) {
                  setPasswords(prev => ({ ...prev, [pwModal.label]: pwInput }));
                  if (isChange) setUnlockedCats(prev => ({ ...prev, [pwModal.label]: true }));
                  setPwModal(null); setPwInput(""); setPwError("");
                } else {
                  if (pwInput === passwords[pwModal.label]) {
                    setUnlockedCats(prev => ({ ...prev, [pwModal.label]: true }));
                    setDbSelCategory(FINANCE_LINKS.find(l => l.label === pwModal.label));
                    setPwModal(null); setPwInput(""); setPwError("");
                  } else { setPwError("パスワードが違います"); }
                }
              }} style={{ flex: 1, padding: 12, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                {isSet || isChange ? "設定する" : "開く"}
              </button>
            </div>
            {isChange && <div style={{ marginTop: 10, textAlign: "center" }}>
              <button onClick={() => { setPasswords(prev => { const n = { ...prev }; delete n[pwModal.label]; return n; }); setUnlockedCats(prev => ({ ...prev, [pwModal.label]: true })); setPwModal(null); setPwInput(""); setPwError(""); }} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 13, cursor: "pointer" }}>パスワードを削除する</button>
            </div>}
          </div>
        </div>
      );
    };

    // プレビュー
    if (previewFile) return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#000", minHeight: "100vh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setPreviewFile(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{previewFile.name}</div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {previewFile.type.startsWith("image/")
            ? <img src={previewFile.data} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }} alt={previewFile.name} />
            : <div style={{ color: "#fff", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
                <div style={{ fontSize: 14, marginBottom: 20 }}>{previewFile.name}</div>
                <a href={previewFile.data} download={previewFile.name} style={{ background: "#E07B39", color: "#fff", padding: "12px 24px", borderRadius: 10, textDecoration: "none", fontWeight: 700 }}>ダウンロード</a>
              </div>
          }
        </div>
      </div>
    );

    // ファイル一覧（月）
    if (dbSelYearMonth) return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setDbSelYearMonth(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{dbSelCategory.icon} {dbSelCategory.label}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{dbSelYear}年{parseInt(dbSelYearMonth.split("-")[1])}月</div>
          </div>
          <label style={{ background: "#E07B39", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ＋ 追加
            <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileUpload} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ padding: 14 }}>
          {(financeData[categoryKey]?.[dbSelYearMonth] || []).length === 0
            ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 14 }}>ファイルがありません<br /><span style={{ fontSize: 12 }}>右上の「＋ 追加」からアップロード</span></div>
            : (financeData[categoryKey]?.[dbSelYearMonth] || []).map((f, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <span style={{ fontSize: 28 }}>{f.type.startsWith("image/") ? "🖼" : "📄"}</span>
                  <div style={{ flex: 1, overflow: "hidden" }} onClick={() => setPreviewFile(f)}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{(f.size / 1024).toFixed(0)}KB</div>
                  </div>
                  <button onClick={() => deleteFile(i)} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 18, cursor: "pointer" }}>🗑</button>
                </div>
              ))
          }
        </div>
      </div>
    );

    // 月一覧
    if (dbSelYear) return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setDbSelYear(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{dbSelCategory.icon} {dbSelCategory.label}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{dbSelYear}年</div>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          {(yearMonths[dbSelYear] || []).slice().reverse().map(m => {
            const ym = `${dbSelYear}-${String(m).padStart(2, "0")}`;
            const files = financeData[categoryKey]?.[ym] || [];
            const isCurrentMonth = Number(dbSelYear) === currentYear && m === currentMonth;
            return (
              <div key={ym} onClick={() => setDbSelYearMonth(ym)} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", borderLeft: isCurrentMonth ? "4px solid #E07B39" : "4px solid transparent" }}>
                <span style={{ fontSize: 24 }}>📅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    {m}月
                    {isCurrentMonth && <span style={{ fontSize: 10, background: "#E07B39", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>今月</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{files.length}件のファイル</div>
                </div>
                <span style={{ color: "#9CA3AF" }}>›</span>
              </div>
            );
          })}
        </div>
      </div>
    );

    // 年一覧
    if (dbSelCategory) return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ background: "#1A3A5C", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setDbSelCategory(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{dbSelCategory.icon} {dbSelCategory.label}</div>
        </div>
        <div style={{ padding: 14 }}>
          {Object.keys(yearMonths).sort((a, b) => b - a).map(y => {
            const totalFiles = (yearMonths[y] || []).reduce((s, m) => s + (financeData[categoryKey]?.[`${y}-${String(m).padStart(2, "0")}`] || []).length, 0);
            const isCurrentYear = Number(y) === currentYear;
            return (
              <div key={y} onClick={() => setDbSelYear(y)} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", borderLeft: isCurrentYear ? "4px solid #1A3A5C" : "4px solid transparent" }}>
                <span style={{ fontSize: 26 }}>📁</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                    {y}年
                    {isCurrentYear && <span style={{ fontSize: 10, background: "#1A3A5C", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>今年</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{(yearMonths[y] || []).length}ヶ月 · {totalFiles}件のファイル</div>
                </div>
                <span style={{ color: "#9CA3AF" }}>›</span>
              </div>
            );
          })}
        </div>
        <PwModalUI />
      </div>
    );

    // カテゴリ一覧
    return (
      <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
        <Header title="🗃 財務・書類管理" back={() => navigate("home")} />
        <div style={{ padding: 14 }}>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            {FINANCE_LINKS.map((l, i) => {
              const hasPassword = !!passwords[l.label];
              const isUnlocked = unlockedCats[l.label];
              return (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < FINANCE_LINKS.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <span style={{ fontSize: 26 }}>{l.icon}</span>
                  <div style={{ flex: 1 }} onClick={() => {
                    if (hasPassword && !isUnlocked) { setPwModal({ mode: "unlock", label: l.label }); setPwInput(""); setPwError(""); }
                    else setDbSelCategory(l);
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{l.label}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{fileCount(l.label) > 0 ? `${fileCount(l.label)}件のファイル` : "タップして管理"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {hasPassword && <span style={{ fontSize: 14 }}>{isUnlocked ? "🔓" : "🔒"}</span>}
                    <button onClick={() => { setPwModal({ mode: hasPassword ? "change" : "set", label: l.label }); setPwInput(""); setPwError(""); }} style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#374151" }}>
                      {hasPassword ? "変更" : "設定"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 10, paddingLeft: 4 }}>🔐 各項目の右の「設定」からパスワードをかけられます</div>
        </div>
        <PwModalUI />
      </div>
    );
  }

  return null;
}
