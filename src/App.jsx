import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { DEFAULT_LINKS, DEFAULT_TILE_CONF, DEFAULT_CUST } from "./lib/constants";
import { Modal, Inp } from "./components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "./components/Layout";
import Home from "./pages/Home";
import Projects from "./pages/Projects";
import Companies from "./pages/Companies";
import Tasks from "./pages/Tasks";
import Links from "./pages/Links";
import Finance from "./pages/Finance";
import Templates from "./pages/Templates";
import Estimate from "./pages/Estimate";
import Analytics from "./pages/Analytics";
import AI from "./pages/AI";
import Board from "./pages/Board";
import Fishing from "./pages/Fishing";
import AutoEdit from "./pages/AutoEdit";
import CallsPage from "./pages/CallsPage";
import LineSettings from "./pages/LineSettings";
import SystemManual from "./pages/SystemManual";
import UserManual from "./pages/UserManual";
import Schedule from "./pages/Schedule";

export default function App() {
  const [page, setPage] = useState("home");
  const [cos, setCos] = useState([]);
  const [pjs, setPjs] = useState([]);
  const [tks, setTks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState(DEFAULT_LINKS);
  const [finFiles, setFinFiles] = useState([]);
  const [finFolders, setFinFolders] = useState([]);
  const [tmplFiles, setTmplFiles] = useState([]);
  const [boardPosts, setBoardPosts] = useState([]);
  const [boardComments, setBoardComments] = useState([]);
  const [calls, setCalls] = useState([]);
  const [cust, setCust] = useState(DEFAULT_CUST);
  const [ec, setEc] = useState({ ...DEFAULT_CUST });
  const [tileConf, setTileConf] = useState(DEFAULT_TILE_CONF);
  const [tileEdit, setTileEdit] = useState(false);
  const [modal, setModal] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weekWeather, setWeekWeather] = useState(null);
  const [fishWeather, setFishWeather] = useState(null);
  const [fishBoats, setFishBoats] = useState([
    { id: "b1", name: "新勝丸", port: "外房・勝浦川津港", icon: "⚓", chowari: "https://www.chowari.jp/ship/01167/catch/", blog: "https://ameblo.jp/sinsho1963/", color: "#0284C7" },
    { id: "b2", name: "第三新生合同丸", port: "外房・鴨川漁港", icon: "🚢", chowari: "https://www.chowari.jp/ship/01329/catch/", blog: "https://godomaru.com/blog.php", color: "#059669" },
  ]);
  const [aiMsgs, setAiMsgs] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [isPC, setIsPC] = useState(() => window.innerWidth >= 768);
  const [rpOpen, setRpOpen] = useState(true);
  const SB_W = 180, RP_W = 220;

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=35.4437&longitude=139.6380&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo&forecast_days=7")
      .then(r => r.json())
      .then(d => {
        const code = d.current?.weather_code;
        const temp = Math.round(d.current?.temperature_2m);
        const icon = code === 0 ? "☀️" : code <= 2 ? "🌤" : code === 3 ? "☁️" : code <= 48 ? "🌫" : code <= 55 ? "🌦" : code <= 65 ? "🌧" : code <= 75 ? "🌨" : code <= 82 ? "🌦" : code <= 99 ? "⛈" : "🌡";
        const desc = code === 0 ? "快晴" : code <= 2 ? "晴れ" : code === 3 ? "曇り" : code <= 48 ? "霧" : code <= 55 ? "小雨" : code <= 65 ? "雨" : code <= 75 ? "雪" : code <= 82 ? "にわか雨" : code <= 99 ? "雷雨" : "不明";
        setWeather({ icon, temp, desc });
        if (d.daily) {
          const days = d.daily.time.map((t, i) => ({
            date: t,
            weekday: new Date(t).getDay(),
            code: d.daily.weather_code[i],
            max: Math.round(d.daily.temperature_2m_max[i]),
            min: Math.round(d.daily.temperature_2m_min[i]),
            rain: Math.round(d.daily.precipitation_sum[i] || 0),
          }));
          setWeekWeather(days);
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    const h = () => setIsPC(window.innerWidth >= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (page !== "fishing" || fishWeather) return;
    const degToDir = d => { const dirs = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"]; return dirs[Math.round(d / 22.5) % 16]; };
    const wIcon = c => c === 0 ? "☀️" : c <= 2 ? "🌤" : c === 3 ? "☁️" : c <= 48 ? "🌫" : c <= 55 ? "🌦" : c <= 65 ? "🌧" : c <= 75 ? "🌨" : c <= 82 ? "🌦" : c <= 99 ? "⛈" : "🌡";
    const locs = [{ key: "yokosuka", name: "横須賀", lat: 35.28, lon: 139.67 }, { key: "sotobo", name: "外房（勝浦）", lat: 35.15, lon: 140.30 }];
    Promise.all(locs.map(async loc => {
      const [w, m] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&timezone=Asia%2FTokyo`).then(r => r.json()).catch(() => ({})),
        fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${loc.lat}&longitude=${loc.lon}&hourly=wave_height&timezone=Asia%2FTokyo&forecast_days=1`).then(r => r.json()).catch(() => ({})),
      ]);
      const h = new Date().getHours();
      return { ...loc, temp: Math.round(w.current?.temperature_2m ?? '--'), windSpeed: w.current?.wind_speed_10m?.toFixed(1) ?? '--', windDir: degToDir(w.current?.wind_direction_10m ?? 0), icon: wIcon(w.current?.weather_code ?? 0), wave: m.hourly?.wave_height?.[h]?.toFixed(1) ?? '--' };
    })).then(results => { const obj = {}; results.forEach(r => { obj[r.key] = r; }); setFishWeather(obj); });
  }, [page]);

  const loadAll = async () => {
    setLoading(true);
    const [pjRes, coRes, tkRes, ffRes, foldRes, hsRes, linksRes, tmplRes, bpRes, bcRes, callsRes] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("companies").select("*").order("created_at", { ascending: true }),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
     supabase.from("finance_files").select("id,item_id,year,month,name,type,size,url,path,created_at").order("created_at", { ascending: false }),
      supabase.from("finance_folders").select("*").order("sort_order", { ascending: true }),
      supabase.from("home_settings").select("*"),
      supabase.from("links").select("*").order("sort_order", { ascending: true }),
      supabase.from("template_files").select("id,cat_id,name,type,size,url,path,created_at").order("created_at", { ascending: false }),
      supabase.from("board_posts").select("*").order("created_at", { ascending: false }),
      supabase.from("board_comments").select("*").order("created_at", { ascending: true }),
      supabase.from("calls").select("*").order("received_at", { ascending: false }),
    ]);
    if (pjRes.data) setPjs(pjRes.data.map(p => ({ ...p, subIds: p.subcontractorIds || [], gp: p.grossProfit || 0, qDate: p.quoteDate || "" })));
    if (coRes.data) setCos(coRes.data.map(c => ({ ...c, contacts: c.contacts || [] })));
    if (tkRes.data) setTks(tkRes.data.map(t => ({ ...t, prio: t.priority || "mid" })));
    if (ffRes.data) setFinFiles(ffRes.data);
    if (foldRes.data) setFinFolders(foldRes.data);
    if (hsRes.data) {
      const tilesRow = hsRes.data.find(r => r.id === "tiles");
      const custRow = hsRes.data.find(r => r.id === "customize");
      if (tilesRow?.value && Array.isArray(tilesRow.value) && tilesRow.value.length > 0) {
        const saved = tilesRow.value;
        const savedKeys = new Set(saved.map(t => t.key));
        const merged = [...saved, ...DEFAULT_TILE_CONF.filter(t => !savedKeys.has(t.key))];
        setTileConf(merged);
      }
      if (custRow?.value && Object.keys(custRow.value).length > 0) { setCust(custRow.value); setEc(custRow.value); }
      const boatsRow = hsRes.data?.find(r => r.id === "fishing_boats");
      if (boatsRow?.value && Array.isArray(boatsRow.value) && boatsRow.value.length > 0) setFishBoats(boatsRow.value);
    }
    if (linksRes.data && linksRes.data.length > 0) setLinks(linksRes.data);
    if (tmplRes.data) setTmplFiles(tmplRes.data);
    if (bpRes.data) setBoardPosts(bpRes.data);
    if (bcRes.data) setBoardComments(bcRes.data);
    if (callsRes.data) setCalls(callsRes.data);
    setLoading(false);
  };

  const saveHomeSetting = async (id, value) => {
    await supabase.from("home_settings").upsert({ id, value, updated_at: new Date().toISOString() });
  };
  const saveTileConf = async (newConf) => { setTileConf(newConf); await saveHomeSetting("tiles", newConf); };
  const saveCustomize = async (newCust) => { setCust(newCust); await saveHomeSetting("customize", newCust); };
  const saveFishBoats = async (boats) => { setFishBoats(boats); await saveHomeSetting("fishing_boats", boats); };

  const nav = p => { setPage(p); setModal(null); };
  const pp = isPC ? { marginLeft: SB_W, marginRight: rpOpen ? RP_W : 32 } : {};
  const commonProps = { pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, SB_W, RP_W };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div><div style={{ color: "#1A3A5C", fontWeight: 700 }}>読み込み中...</div></div></div>;

  if (modal === "cust") return (
    <Modal title="⚙ カスタマイズ" onClose={() => setModal(null)} onSave={() => { saveCustomize({ ...ec }); setModal(null); }}>
      <Inp label="会社名" value={ec.name} onChange={e => setEc({ ...ec, name: e.target.value })} />
      <Inp label="システム名" value={ec.sys} onChange={e => setEc({ ...ec, sys: e.target.value })} />
    </Modal>
  );

  if (page === "home") return <Home {...commonProps} setPjs={setPjs} setCos={setCos} setTks={setTks} setLinks={setLinks} weather={weather} weekWeather={weekWeather} tileEdit={tileEdit} setTileEdit={setTileEdit} saveTileConf={saveTileConf} saveCustomize={saveCustomize} modal={modal} setModal={setModal} ec={ec} setEc={setEc} boardPosts={boardPosts} calls={calls} />;
  if (page === "projects") return <Projects {...commonProps} setPjs={setPjs} setCos={setCos} />;
  if (page === "companies") return <Companies {...commonProps} setCos={setCos} />;
  if (page === "tasks") return <Tasks {...commonProps} setTks={setTks} />;
  if (page === "links") return <Links {...commonProps} setLinks={setLinks} />;
  if (page === "finance") return <Finance {...commonProps} setFinFiles={setFinFiles} finFolders={finFolders} setFinFolders={setFinFolders} />;
  if (page === "templates") return <Templates {...commonProps} setTmplFiles={setTmplFiles} />;
  if (page === "estimate") return <Estimate {...commonProps} />;
  if (page === "analytics") return <Analytics {...commonProps} />;
  if (page === "ai") return <AI {...commonProps} aiMsgs={aiMsgs} setAiMsgs={setAiMsgs} aiInput={aiInput} setAiInput={setAiInput} />;
  if (page === "board") return <Board {...commonProps} boardPosts={boardPosts} setBoardPosts={setBoardPosts} boardComments={boardComments} setBoardComments={setBoardComments} />;
  if (page === "fishing") return <Fishing {...commonProps} fishBoats={fishBoats} saveFishBoats={saveFishBoats} />;
  if (page === "autoedit") return <AutoEdit {...commonProps} />;
  if (page === "calls") return <CallsPage {...commonProps} calls={calls} setCalls={setCalls} />;
  if (page === "linesettings") return <LineSettings {...commonProps} />;
  if (page === "systemmanual") return <SystemManual {...commonProps} />;
  if (page === "usermanual") return <UserManual {...commonProps} />;
  if (page === "schedule") return <Schedule />;
  return null;
}