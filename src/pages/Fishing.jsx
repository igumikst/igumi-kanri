import { Hdr, Modal, Inp, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";
import { useState } from "react";

export default function Fishing({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, fishBoats, saveFishBoats, SB_W, RP_W }) {
  const [fishBoatModal, setFishBoatModal] = useState(null);
  const [editBoat, setEditBoat] = useState(null);
  const [conf, setConf] = useState(null);
  const [quickLinks, setQuickLinks] = useState([
    { id: "q1", icon: "🎫", label: "釣割", sub: "予約・釣果サイト", url: "https://www.chowari.jp/", color: "#E07B39" },
    { id: "q2", icon: "📋", label: "乗船名簿クラウド", sub: "デジタル名簿記入", url: "https://meibo.chowari.jp/store/", color: "#1A3A5C" },
    { id: "q3", icon: "🌊", label: "タイドグラフ", sub: "潮位・潮汐情報", url: "https://tide736.net/", color: "#0284C7" },
    { id: "q4", icon: "🌬", label: "Windy", sub: "風・波予報", url: "https://www.windy.com/?35.15,140.30,10", color: "#059669" },
  ]);
  const [qlModal, setQlModal] = useState(null);
  const [editQl, setEditQl] = useState(null);
  const [newQl, setNewQl] = useState({ icon: "🔗", label: "", sub: "", url: "", color: "#0284C7" });
  const [showWeekWeather, setShowWeekWeather] = useState({});
  const [weekWeatherData, setWeekWeatherData] = useState({});

  const blankBoat = { id: "", name: "", port: "", icon: "🚢", chowari: "", blog: "", color: "#0284C7" };
  const [newBoat, setNewBoat] = useState(blankBoat);
  const pending = tks.filter(t => !t.done);

  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const wIcon = c => c === 0 ? "☀️" : c <= 2 ? "🌤" : c === 3 ? "☁️" : c <= 48 ? "🌫" : c <= 55 ? "🌦" : c <= 65 ? "🌧" : c <= 75 ? "🌨" : c <= 82 ? "🌦" : c <= 99 ? "⛈" : "🌡";

  const fetchWeekWeather = async (key, lat, lon) => {
    if (weekWeatherData[key]) { setShowWeekWeather(p => ({ ...p, [key]: !p[key] })); return; }
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo&forecast_days=7`).then(r => r.json());
      if (r.daily) {
        const days = r.daily.time.map((t, i) => ({
          date: t, weekday: new Date(t).getDay(),
          code: r.daily.weather_code[i],
          max: Math.round(r.daily.temperature_2m_max[i]),
          min: Math.round(r.daily.temperature_2m_min[i]),
          rain: Math.round(r.daily.precipitation_sum[i] || 0),
        }));
        setWeekWeatherData(p => ({ ...p, [key]: days }));
        setShowWeekWeather(p => ({ ...p, [key]: true }));
      }
    } catch (e) {}
  };

  const addFishBoat = async () => {
    if (!newBoat.name.trim()) return;
    const boat = { ...newBoat, id: "b" + Date.now() };
    await saveFishBoats([...fishBoats, boat]);
    setNewBoat(blankBoat); setFishBoatModal(null);
  };

  const updateFishBoat = async () => {
    if (!editBoat?.name.trim()) return;
    await saveFishBoats(fishBoats.map(b => b.id === editBoat.id ? editBoat : b));
    setEditBoat(null); setFishBoatModal(null);
  };

  const deleteFishBoat = async (id) => {
    await saveFishBoats(fishBoats.filter(b => b.id !== id));
  };

  const WeatherCard = ({ d, locKey, lat, lon }) => {
    if (!d) return <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 12, padding: "12px", textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>取得中...</div>;
    const weeks = weekWeatherData[locKey];
    return (
      <div style={{ flex: 1, background: "#F0F9FF", borderRadius: 12, padding: "12px", border: "1.5px solid #BAE6FD" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0284C7", marginBottom: 6 }}>{d.name}</div>
        <div style={{ fontSize: 28, marginBottom: 4 }}>{d.icon}</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#1F2937", marginBottom: 6 }}>{d.temp}°C</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#374151" }}>💨 {d.windDir} {d.windSpeed}m/s</div>
          <div style={{ fontSize: 11, color: "#374151" }}>🌊 波高 {d.wave}m</div>
        </div>
        <button onClick={() => fetchWeekWeather(locKey, lat, lon)}
          style={{ width: "100%", background: "#0284C7", color: "#fff", border: "none", borderRadius: 8, padding: "5px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {showWeekWeather[locKey] ? "▲ 週間を閉じる" : "📅 週間天気"}
        </button>
        {showWeekWeather[locKey] && weeks && (
          <div style={{ marginTop: 8, display: "flex", gap: 3, overflowX: "auto" }}>
            {weeks.map((w, i) => (
              <div key={i} style={{ flex: 1, minWidth: 36, textAlign: "center", background: "rgba(255,255,255,0.7)", borderRadius: 6, padding: "4px 2px" }}>
                <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 2 }}>{i === 0 ? "今日" : WD[w.weekday]}</div>
                <div style={{ fontSize: 16 }}>{wIcon(w.code)}</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#EF4444" }}>{w.max}°</div>
                <div style={{ fontSize: 9, color: "#3B82F6" }}>{w.min}°</div>
                {w.rain > 0 && <div style={{ fontSize: 8, color: "#0284C7" }}>{w.rain}mm</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="fishing" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="🎣 釣り情報" back={() => nav("home")} />
      <div style={{ padding: isPC ? "14px 0" : 14 }}>

        {/* 天気・海況 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C", marginBottom: 12 }}>🌤 天気・海況（現在）</div>
          <div style={{ display: "flex", gap: 10 }}>
            <WeatherCard d={fishWeather?.yokosuka} locKey="yokosuka" lat={35.28} lon={139.67} />
            <WeatherCard d={fishWeather?.sotobo} locKey="sotobo" lat={35.15} lon={140.30} />
          </div>
          {!fishWeather && <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 8 }}>データ取得中...</div>}
        </div>

        {/* 釣果情報 */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C" }}>🐟 釣果情報</div>
            <button onClick={() => { setNewBoat(blankBoat); setFishBoatModal("add"); }} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>＋ 追加</button>
          </div>
          {fishBoats.map(b => (
            <div key={b.id} style={{ background: "#F9FAFB", borderRadius: 12, padding: "12px 14px", marginBottom: 10, border: "1.5px solid #E5E7EB" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: b.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{b.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1F2937" }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{b.port}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setEditBoat({ ...b }); setFishBoatModal("edit"); }} style={{ background: "#EFF6FF", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#1A3A5C", cursor: "pointer" }}>✏️</button>
                  <button onClick={() => setConf({ msg: `「${b.name}」を削除しますか？\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { deleteFishBoat(b.id); setConf(null); } })} style={{ background: "#FEF2F2", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#DC2626", cursor: "pointer" }}>🗑</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {b.chowari && <a href={b.chowari} target="_blank" rel="noopener noreferrer" style={{ flex: 1, background: b.color, color: "#fff", borderRadius: 8, padding: "9px 0", textAlign: "center", textDecoration: "none", fontSize: 12, fontWeight: 800, display: "block" }}>📊 釣割で釣果を見る</a>}
                {b.blog && <a href={b.blog} target="_blank" rel="noopener noreferrer" style={{ flex: 1, background: "#F3F4F6", color: "#374151", borderRadius: 8, padding: "9px 0", textAlign: "center", textDecoration: "none", fontSize: 12, fontWeight: 700, display: "block", border: "1.5px solid #E5E7EB" }}>📝 公式ブログ</a>}
              </div>
            </div>
          ))}
          {fishBoats.length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#9CA3AF", fontSize: 13 }}>「＋ 追加」から釣り船を登録してください</div>}
        </div>

        {/* クイックリンク */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1A3A5C" }}>🔗 クイックリンク</div>
            <button onClick={() => { setNewQl({ icon: "🔗", label: "", sub: "", url: "", color: "#0284C7" }); setQlModal("add"); }} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>＋ 追加</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {quickLinks.map(l => (
              <div key={l.id} style={{ position: "relative" }}>
                <a href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{ background: `${l.color}15`, border: `1.5px solid ${l.color}40`, borderRadius: 12, padding: "14px 12px", textDecoration: "none", display: "block" }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{l.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#1F2937", marginBottom: 2 }}>{l.label}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{l.sub}</div>
                </a>
                <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
                  <button onClick={e => { e.preventDefault(); setEditQl({ ...l }); setQlModal("edit"); }} style={{ background: "rgba(255,255,255,0.9)", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 10, cursor: "pointer" }}>✏️</button>
                  <button onClick={e => { e.preventDefault(); setQuickLinks(prev => prev.filter(x => x.id !== l.id)); }} style={{ background: "rgba(255,255,255,0.9)", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 10, cursor: "pointer", color: "#DC2626" }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 釣り船追加モーダル */}
      {fishBoatModal === "add" && <Modal title="🚢 釣り船を追加" onClose={() => setFishBoatModal(null)} onSave={addFishBoat}>
        <Inp label="アイコン" value={newBoat.icon} onChange={e => setNewBoat({ ...newBoat, icon: e.target.value })} />
        <Inp label="船名 *" value={newBoat.name} onChange={e => setNewBoat({ ...newBoat, name: e.target.value })} placeholder="例：新勝丸" />
        <Inp label="港" value={newBoat.port} onChange={e => setNewBoat({ ...newBoat, port: e.target.value })} placeholder="例：外房・勝浦川津港" />
        <Inp label="釣割URL" value={newBoat.chowari} onChange={e => setNewBoat({ ...newBoat, chowari: e.target.value })} placeholder="https://www.chowari.jp/ship/..." />
        <Inp label="公式ブログURL" value={newBoat.blog} onChange={e => setNewBoat({ ...newBoat, blog: e.target.value })} placeholder="https://..." />
        <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>カラー</div><div style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="color" value={newBoat.color} onChange={e => setNewBoat({ ...newBoat, color: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} /><div style={{ flex: 1, height: 36, borderRadius: 8, background: newBoat.color }} /></div></div>
      </Modal>}

      {/* 釣り船編集モーダル */}
      {fishBoatModal === "edit" && editBoat && <Modal title="🚢 釣り船を編集" onClose={() => { setFishBoatModal(null); setEditBoat(null); }} onSave={updateFishBoat}>
        <Inp label="アイコン" value={editBoat.icon} onChange={e => setEditBoat({ ...editBoat, icon: e.target.value })} />
        <Inp label="船名 *" value={editBoat.name} onChange={e => setEditBoat({ ...editBoat, name: e.target.value })} />
        <Inp label="港" value={editBoat.port} onChange={e => setEditBoat({ ...editBoat, port: e.target.value })} />
        <Inp label="釣割URL" value={editBoat.chowari} onChange={e => setEditBoat({ ...editBoat, chowari: e.target.value })} />
        <Inp label="公式ブログURL" value={editBoat.blog} onChange={e => setEditBoat({ ...editBoat, blog: e.target.value })} />
        <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>カラー</div><div style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="color" value={editBoat.color} onChange={e => setEditBoat({ ...editBoat, color: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} /><div style={{ flex: 1, height: 36, borderRadius: 8, background: editBoat.color }} /></div></div>
      </Modal>}

      {/* クイックリンク追加モーダル */}
      {qlModal === "add" && <Modal title="🔗 リンクを追加" onClose={() => setQlModal(null)} onSave={() => { if (!newQl.label || !newQl.url) return; setQuickLinks(prev => [...prev, { ...newQl, id: "q" + Date.now() }]); setQlModal(null); }}>
        <Inp label="アイコン" value={newQl.icon} onChange={e => setNewQl({ ...newQl, icon: e.target.value })} />
        <Inp label="名前 *" value={newQl.label} onChange={e => setNewQl({ ...newQl, label: e.target.value })} placeholder="例：釣割" />
        <Inp label="説明" value={newQl.sub} onChange={e => setNewQl({ ...newQl, sub: e.target.value })} placeholder="例：予約・釣果サイト" />
        <Inp label="URL *" value={newQl.url} onChange={e => setNewQl({ ...newQl, url: e.target.value })} placeholder="https://..." />
        <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>カラー</div><div style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="color" value={newQl.color} onChange={e => setNewQl({ ...newQl, color: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} /><div style={{ flex: 1, height: 36, borderRadius: 8, background: newQl.color }} /></div></div>
      </Modal>}

      {/* クイックリンク編集モーダル */}
      {qlModal === "edit" && editQl && <Modal title="🔗 リンクを編集" onClose={() => { setQlModal(null); setEditQl(null); }} onSave={() => { setQuickLinks(prev => prev.map(x => x.id === editQl.id ? editQl : x)); setQlModal(null); setEditQl(null); }}>
        <Inp label="アイコン" value={editQl.icon} onChange={e => setEditQl({ ...editQl, icon: e.target.value })} />
        <Inp label="名前" value={editQl.label} onChange={e => setEditQl({ ...editQl, label: e.target.value })} />
        <Inp label="説明" value={editQl.sub} onChange={e => setEditQl({ ...editQl, sub: e.target.value })} />
        <Inp label="URL" value={editQl.url} onChange={e => setEditQl({ ...editQl, url: e.target.value })} />
        <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>カラー</div><div style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="color" value={editQl.color} onChange={e => setEditQl({ ...editQl, color: e.target.value })} style={{ width: 48, height: 36, borderRadius: 8, border: "1.5px solid #E5E7EB", cursor: "pointer", padding: 2 }} /><div style={{ flex: 1, height: 36, borderRadius: 8, background: editQl.color }} /></div></div>
      </Modal>}

      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
    </div>
  );
}