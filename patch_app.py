# -*- coding: utf-8 -*-
# App.jsx に新機能を自動追加するスクリプト
# 実行方法: python3 patch_app.py
# 実行場所: C:\Users\kst22\Desktop\igumi-kanri\ で実行

import os, sys

APP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "App.jsx")

if not os.path.exists(APP_PATH):
    print(f"エラー: {APP_PATH} が見つかりません")
    print("igumi-kanri フォルダ内で実行してください")
    sys.exit(1)

with open(APP_PATH, "r", encoding="utf-8") as f:
    code = f.read()

print(f"読み込み完了: {len(code.splitlines())} 行")
errors = []

# =========================================
# 変更1: 新定数を追加 (DEFAULT_CUSTの直前)
# =========================================
OLD1 = 'const DEFAULT_CUST ='
NEW1 = '''const DEFAULT_FISH_LOCATIONS = [
  {id:"fl1",name:"横須賀",lat:35.28,lon:139.67},
  {id:"fl2",name:"外房（勝浦）",lat:35.15,lon:140.30},
];
const DEFAULT_FISH_LINKS = [
  {id:"flink1",icon:"🎫",label:"釣割",sub:"予約・釣果サイト",url:"https://www.chowari.jp/",color:"#E07B39"},
  {id:"flink2",icon:"📋",label:"乗船名簿クラウド",sub:"デジタル名簿記入",url:"https://meibo.chowari.jp/store/",color:"#1A3A5C"},
  {id:"flink3",icon:"🌊",label:"タイドグラフ",sub:"潮位・潮汐情報",url:"https://tide736.net/",color:"#0284C7"},
  {id:"flink4",icon:"🌬",label:"Windy",sub:"風・波予報",url:"https://www.windy.com/?35.15,140.30,10",color:"#059669"},
];
const DEFAULT_CUST ='''

if OLD1 in code:
    code = code.replace(OLD1, NEW1, 1)
    print("✅ 変更1: 新定数追加")
else:
    errors.append("❌ 変更1: DEFAULT_CUST が見つかりません")

# =========================================
# 変更2: 新stateを追加
# =========================================
OLD2 = '  const [newBoat,setNewBoat]=useState(blankBoat);'
NEW2 = '''  const [newBoat,setNewBoat]=useState(blankBoat);
  // 🆕 釣り場所・リンク・週間天気
  const [fishLocations,setFishLocations]=useState(DEFAULT_FISH_LOCATIONS);
  const [fishLinks,setFishLinks]=useState(DEFAULT_FISH_LINKS);
  const [fishLocModal,setFishLocModal]=useState(null);
  const [fishLinkModal,setFishLinkModal]=useState(null);
  const [editFishLoc,setEditFishLoc]=useState(null);
  const [editFishLink,setEditFishLink]=useState(null);
  const blankLoc={id:"",name:"",lat:"",lon:""};
  const blankFishLinkItem={id:"",icon:"🔗",label:"",sub:"",url:"",color:"#1A3A5C"};
  const [newFishLoc,setNewFishLoc]=useState(blankLoc);
  const [newFishLinkItem,setNewFishLinkItem]=useState(blankFishLinkItem);
  const [weeklyWeather,setWeeklyWeather]=useState(null);
  const [showWeeklyModal,setShowWeeklyModal]=useState(false);
  const [weeklyTarget,setWeeklyTarget]=useState(null);
  const WEEKDAYS=["日","月","火","水","木","金","土"];
  const wIcon=c=>c===0?"☀️":c<=2?"🌤":c===3?"☁️":c<=48?"🌫":c<=55?"🌦":c<=65?"🌧":c<=75?"🌨":c<=82?"🌦":c<=99?"⛈":"🌡";'''

if OLD2 in code:
    code = code.replace(OLD2, NEW2, 1)
    print("✅ 変更2: 新state追加")
else:
    errors.append("❌ 変更2: blankBoat state が見つかりません")

# =========================================
# 変更3: loadAllにfishLocations/fishLinks読み込みを追加
# =========================================
OLD3 = '    const boatsRow=hsRes.data?.find(r=>r.id==="fishing_boats");\n    if(boatsRow?.value && Array.isArray(boatsRow.value) && boatsRow.value.length>0) setFishBoats(boatsRow.value);'
NEW3 = '''    const boatsRow=hsRes.data?.find(r=>r.id==="fishing_boats");
    if(boatsRow?.value && Array.isArray(boatsRow.value) && boatsRow.value.length>0) setFishBoats(boatsRow.value);
    const fishLocRow=hsRes.data?.find(r=>r.id==="fish_locations");
    if(fishLocRow?.value && Array.isArray(fishLocRow.value) && fishLocRow.value.length>0) setFishLocations(fishLocRow.value);
    const fishLinkRow=hsRes.data?.find(r=>r.id==="fish_links");
    if(fishLinkRow?.value && Array.isArray(fishLinkRow.value) && fishLinkRow.value.length>0) setFishLinks(fishLinkRow.value);'''

if OLD3 in code:
    code = code.replace(OLD3, NEW3, 1)
    print("✅ 変更3: loadAll更新")
else:
    errors.append("❌ 変更3: fishing_boats loadAll が見つかりません")

# =========================================
# 変更4: CRUD関数を追加
# =========================================
OLD4 = '  // ── 釣り船CRUD ──'
NEW4 = '''  // ── 釣り場所・クイックリンクCRUD ──
  const saveFishLocations = async (locs) => { setFishLocations(locs); await saveHomeSetting("fish_locations", locs); };
  const saveFishLinks = async (lnks) => { setFishLinks(lnks); await saveHomeSetting("fish_links", lnks); };
  const addFishLoc = async () => { if(!newFishLoc.name||!newFishLoc.lat||!newFishLoc.lon) return; await saveFishLocations([...fishLocations,{...newFishLoc,id:"fl"+Date.now(),lat:Number(newFishLoc.lat),lon:Number(newFishLoc.lon)}]); setNewFishLoc(blankLoc); setFishLocModal(null); };
  const updateFishLoc = async () => { if(!editFishLoc?.name) return; await saveFishLocations(fishLocations.map(l=>l.id===editFishLoc.id?{...editFishLoc,lat:Number(editFishLoc.lat),lon:Number(editFishLoc.lon)}:l)); setEditFishLoc(null); setFishLocModal(null); };
  const deleteFishLoc = async (id) => { await saveFishLocations(fishLocations.filter(l=>l.id!==id)); };
  const addFishLinkItem = async () => { if(!newFishLinkItem.label||!newFishLinkItem.url) return; await saveFishLinks([...fishLinks,{...newFishLinkItem,id:"flink"+Date.now()}]); setNewFishLinkItem(blankFishLinkItem); setFishLinkModal(null); };
  const updateFishLinkItem = async () => { if(!editFishLink?.label) return; await saveFishLinks(fishLinks.map(l=>l.id===editFishLink.id?editFishLink:l)); setEditFishLink(null); setFishLinkModal(null); };
  const deleteFishLinkItem = async (id) => { await saveFishLinks(fishLinks.filter(l=>l.id!==id)); };
  const fetchWeekly = async (loc) => {
    setWeeklyTarget(loc); setWeeklyWeather(null); setShowWeeklyModal(true);
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=7`);
      const data = await res.json();
      setWeeklyWeather(data.daily);
    } catch(e) {}
  };

  // ── 釣り船CRUD ──'''

if OLD4 in code:
    code = code.replace(OLD4, NEW4, 1)
    print("✅ 変更4: CRUD関数追加")
else:
    errors.append("❌ 変更4: 釣り船CRUD が見つかりません")

# =========================================
# 変更5: 釣り天気useEffectを更新（場所ベースに）
# =========================================
OLD5 = '''  // 釣り天気を取得（釣りページを開いたとき）
  useEffect(()=>{
    if(page!=="fishing"||fishWeather) return;
    const degToDir=d=>{const dirs=["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];return dirs[Math.round(d/22.5)%16];};
    const wIcon=c=>c===0?"☀️":c<=2?"🌤":c===3?"☁️":c<=48?"🌫":c<=55?"🌦":c<=65?"🌧":c<=75?"🌨":c<=82?"🌦":c<=99?"⛈":"🌡";
    const locs=[{key:"yokosuka",name:"横須賀",lat:35.28,lon:139.67},{key:"sotobo",name:"外房（勝浦）",lat:35.15,lon:140.30}];
    Promise.all(locs.map(async loc=>{
      const [w,m]=await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&timezone=Asia%2FTokyo`).then(r=>r.json()).catch(()=>({})),
        fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${loc.lat}&longitude=${loc.lon}&hourly=wave_height&timezone=Asia%2FTokyo&forecast_days=1`).then(r=>r.json()).catch(()=>({})),
      ]);
      const h=new Date().getHours();
      return {...loc,
        temp:Math.round(w.current?.temperature_2m??\'--\'),
        windSpeed:w.current?.wind_speed_10m?.toFixed(1)??\'--\',
        windDir:degToDir(w.current?.wind_direction_10m??0),
        icon:wIcon(w.current?.weather_code??0),
        wave:m.hourly?.wave_height?.[h]?.toFixed(1)??\'--\',
      };
    })).then(results=>{
      const obj={};results.forEach(r=>{obj[r.key]=r;});
      setFishWeather(obj);
    });
  },[page]);'''

NEW5 = '''  // 釣り天気を取得（場所ベース・編集可能）
  useEffect(()=>{
    if(page!=="fishing") return;
    const degToDir=d=>{const dirs=["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];return dirs[Math.round(d/22.5)%16];};
    const fetchFW = async () => {
      const results = await Promise.all(fishLocations.map(async loc=>{
        const [w,m]=await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&timezone=Asia%2FTokyo`).then(r=>r.json()).catch(()=>({})),
          fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${loc.lat}&longitude=${loc.lon}&hourly=wave_height&timezone=Asia%2FTokyo&forecast_days=1`).then(r=>r.json()).catch(()=>({})),
        ]);
        const h=new Date().getHours();
        return {...loc,
          temp:Math.round(w.current?.temperature_2m??\'--\'),
          windSpeed:w.current?.wind_speed_10m?.toFixed(1)??\'--\',
          windDir:degToDir(w.current?.wind_direction_10m??0),
          icon:wIcon(w.current?.weather_code??0),
          wave:m.hourly?.wave_height?.[h]?.toFixed(1)??\'--\',
        };
      }));
      const obj={};results.forEach(r=>{obj[r.id]=r;});
      setFishWeather(obj);
    };
    fetchFW();
  },[page,fishLocations.length]);'''

if OLD5 in code:
    code = code.replace(OLD5, NEW5, 1)
    print("✅ 変更5: 釣り天気useEffect更新")
else:
    errors.append("❌ 変更5: 釣り天気useEffect が見つかりません")

# =========================================
# 変更6: ホームの天気カードをタップ可能に
# =========================================
OLD6 = '''            {weather&&<div style={{textAlign:"right",background:"rgba(255,255,255,0.15)",borderRadius:12,padding:"10px 14px",flexShrink:0}}>
              <div style={{fontSize:28,lineHeight:1}}>{weather.icon}</div>
              <div style={{fontSize:20,fontWeight:900,color:"#fff",marginTop:4}}>{weather.temp}°C</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.8)"}}>{weather.desc}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:2}}>横浜</div>
            </div>}'''

NEW6 = '''            {weather&&<div onClick={()=>fetchWeekly({name:"横浜",id:"home",lat:35.4437,lon:139.6380})} style={{textAlign:"right",background:"rgba(255,255,255,0.15)",borderRadius:12,padding:"10px 14px",flexShrink:0,cursor:"pointer"}}>
              <div style={{fontSize:28,lineHeight:1}}>{weather.icon}</div>
              <div style={{fontSize:20,fontWeight:900,color:"#fff",marginTop:4}}>{weather.temp}°C</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.8)"}}>{weather.desc}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:2}}>横浜 📅週間</div>
            </div>}'''

if OLD6 in code:
    code = code.replace(OLD6, NEW6, 1)
    print("✅ 変更6: ホーム天気タップ対応")
else:
    errors.append("❌ 変更6: ホーム天気カード が見つかりません")

# =========================================
# 変更7: ホームに掲示板最新投稿を追加
# =========================================
OLD7 = '''          <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",marginBottom:10}}>直近のタスク</div>'''

NEW7 = '''          {boardPosts.length>0&&<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF"}}>📌 掲示板の最新投稿</div>
              <button onClick={()=>nav("board")} style={{fontSize:11,color:cust.c1,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>すべて見る →</button>
            </div>
            <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)",marginBottom:16}}>
              {boardPosts.slice(0,3).map((post,i)=>{
                const BCOL={"業務連絡":"#1D4ED8","スケジュール":"#166534","緊急連絡":"#DC2626","その他":"#374151"};
                const col=BCOL[post.category]||"#374151";
                const diff=Math.floor((new Date()-new Date(post.created_at))/60000);
                const time=diff<60?`${diff}分前`:diff<1440?`${Math.floor(diff/60)}時間前`:`${Math.floor(diff/1440)}日前`;
                return(
                  <div key={post.id} onClick={()=>nav("board")} style={{padding:"11px 16px",borderBottom:i<Math.min(boardPosts.length,3)-1?"1px solid #F3F4F6":"none",cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{background:col,color:"#fff",borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:700,flexShrink:0,marginTop:2}}>{post.category}</span>
                    <div style={{flex:1,overflow:"hidden"}}>
                      <div style={{fontSize:13,color:"#1F2937",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{post.content}</div>
                      <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{post.author} · {time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>}
          <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",marginBottom:10}}>直近のタスク</div>'''

if OLD7 in code:
    code = code.replace(OLD7, NEW7, 1)
    print("✅ 変更7: ホームに掲示板追加")
else:
    errors.append("❌ 変更7: 直近のタスク が見つかりません")

# =========================================
# 変更8: 釣りページ天気セクションを更新（場所編集可能＋週間）
# =========================================
OLD8 = '''          {/* 天気・海況 */}
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <div style={{fontWeight:800,fontSize:14,color:"#1A3A5C",marginBottom:12}}>🌤 天気・海況（現在）</div>
            <div style={{display:"flex",gap:10}}>
              <WeatherCard d={fishWeather?.yokosuka}/>
              <WeatherCard d={fishWeather?.sotobo}/>
            </div>
            {!fishWeather&&<div style={{fontSize:11,color:"#9CA3AF",textAlign:"center",marginTop:8}}>データ取得中...</div>}
          </div>'''

NEW8 = '''          {/* 天気・海況 */}
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:14,color:"#1A3A5C"}}>🌤 天気・海況（タップで週間）</div>
              <button onClick={()=>{setNewFishLoc(blankLoc);setFishLocModal("add");}} style={{background:"#0284C7",border:"none",color:"#fff",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>＋ 場所</button>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {fishLocations.map(loc=>{
                const d=fishWeather?.[loc.id];
                return(
                  <div key={loc.id} style={{flex:"1 1 140px",background:"#F0F9FF",borderRadius:12,padding:"12px",border:"1.5px solid #BAE6FD"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                      <div style={{fontSize:12,fontWeight:800,color:"#0284C7"}}>{loc.name}</div>
                      <div style={{display:"flex",gap:3}}>
                        <button onClick={()=>{setEditFishLoc({...loc});setFishLocModal("edit");}} style={{background:"none",border:"none",fontSize:11,cursor:"pointer",color:"#9CA3AF",padding:0}}>✏️</button>
                        {fishLocations.length>1&&<button onClick={()=>deleteFishLoc(loc.id)} style={{background:"none",border:"none",fontSize:11,cursor:"pointer",color:"#9CA3AF",padding:0}}>✕</button>}
                      </div>
                    </div>
                    {d?(
                      <div onClick={()=>fetchWeekly(loc)} style={{cursor:"pointer"}}>
                        <div style={{fontSize:26,marginBottom:3}}>{d.icon}</div>
                        <div style={{fontSize:16,fontWeight:900,color:"#1F2937",marginBottom:3}}>{d.temp}°C</div>
                        <div style={{fontSize:11,color:"#374151"}}>💨 {d.windDir} {d.windSpeed}m/s</div>
                        <div style={{fontSize:11,color:"#374151"}}>🌊 {d.wave}m</div>
                        <div style={{fontSize:10,color:"#0284C7",marginTop:3,fontWeight:700}}>📅 週間を見る</div>
                      </div>
                    ):<div style={{fontSize:11,color:"#9CA3AF",padding:"8px 0"}}>取得中...</div>}
                  </div>
                );
              })}
            </div>
          </div>'''

if OLD8 in code:
    code = code.replace(OLD8, NEW8, 1)
    print("✅ 変更8: 釣り天気セクション更新")
else:
    errors.append("❌ 変更8: 釣り天気セクション が見つかりません")

# =========================================
# 変更9: 釣りクイックリンクを編集可能に
# =========================================
OLD9 = '''          {/* クイックリンク */}
          <div style={{background:"#fff",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <div style={{fontWeight:800,fontSize:14,color:"#1A3A5C",marginBottom:12}}>🔗 クイックリンク</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {QUICK_LINKS.map(l=>(
                <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{background:`${l.color}15`,border:`1.5px solid ${l.color}40`,borderRadius:12,padding:"14px 12px",textDecoration:"none",display:"block"}}>
                  <div style={{fontSize:24,marginBottom:6}}>{l.icon}</div>
                  <div style={{fontWeight:800,fontSize:13,color:"#1F2937",marginBottom:2}}>{l.label}</div>
                  <div style={{fontSize:11,color:"#6B7280"}}>{l.sub}</div>
                </a>
              ))}
            </div>
          </div>'''

NEW9 = '''          {/* クイックリンク */}
          <div style={{background:"#fff",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:14,color:"#1A3A5C"}}>🔗 クイックリンク</div>
              <button onClick={()=>{setNewFishLinkItem(blankFishLinkItem);setFishLinkModal("add");}} style={{background:"#059669",border:"none",color:"#fff",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>＋ 追加</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {fishLinks.map(l=>(
                <div key={l.id} style={{background:`${l.color}15`,border:`1.5px solid ${l.color}40`,borderRadius:12,padding:"10px 12px",position:"relative"}}>
                  <div style={{display:"flex",justifyContent:"flex-end",gap:3,marginBottom:4}}>
                    <button onClick={()=>{setEditFishLink({...l});setFishLinkModal("edit");}} style={{background:"none",border:"none",fontSize:11,cursor:"pointer",color:"#9CA3AF",padding:0}}>✏️</button>
                    <button onClick={()=>deleteFishLinkItem(l.id)} style={{background:"none",border:"none",fontSize:11,cursor:"pointer",color:"#9CA3AF",padding:0}}>✕</button>
                  </div>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",display:"block"}}>
                    <div style={{fontSize:22,marginBottom:5}}>{l.icon}</div>
                    <div style={{fontWeight:800,fontSize:13,color:"#1F2937",marginBottom:2}}>{l.label}</div>
                    <div style={{fontSize:11,color:"#6B7280"}}>{l.sub}</div>
                  </a>
                </div>
              ))}
            </div>
          </div>'''

if OLD9 in code:
    code = code.replace(OLD9, NEW9, 1)
    print("✅ 変更9: クイックリンク編集可能化")
else:
    errors.append("❌ 変更9: クイックリンクセクション が見つかりません")

# =========================================
# 変更10: 釣りページのモーダルと週間天気モーダルを追加
# =========================================
OLD10 = '''        {conf&&<Confirm msg={conf.msg} onCancel={()=>setConf(null)} onOk={conf.onOk}/>}
      </div>
    );
  }

  // ══ Auto-Edit ══'''

NEW10 = '''        {/* 場所追加・編集モーダル */}
        {fishLocModal==="add"&&<Modal title="📍 場所を追加" onClose={()=>setFishLocModal(null)} onSave={addFishLoc}>
          <Inp label="場所名 *" value={newFishLoc.name} onChange={e=>setNewFishLoc({...newFishLoc,name:e.target.value})} placeholder="例：横須賀"/>
          <Inp label="緯度 *" value={newFishLoc.lat} onChange={e=>setNewFishLoc({...newFishLoc,lat:e.target.value})} placeholder="例：35.28"/>
          <Inp label="経度 *" value={newFishLoc.lon} onChange={e=>setNewFishLoc({...newFishLoc,lon:e.target.value})} placeholder="例：139.67"/>
          <div style={{fontSize:12,color:"#6B7280",marginTop:4}}>緯度経度はGoogleマップで調べてください</div>
        </Modal>}
        {fishLocModal==="edit"&&editFishLoc&&<Modal title="📍 場所を編集" onClose={()=>{setFishLocModal(null);setEditFishLoc(null);}} onSave={updateFishLoc}>
          <Inp label="場所名 *" value={editFishLoc.name} onChange={e=>setEditFishLoc({...editFishLoc,name:e.target.value})}/>
          <Inp label="緯度 *" value={editFishLoc.lat} onChange={e=>setEditFishLoc({...editFishLoc,lat:e.target.value})}/>
          <Inp label="経度 *" value={editFishLoc.lon} onChange={e=>setEditFishLoc({...editFishLoc,lon:e.target.value})}/>
        </Modal>}
        {/* リンク追加・編集モーダル */}
        {fishLinkModal==="add"&&<Modal title="🔗 リンクを追加" onClose={()=>setFishLinkModal(null)} onSave={addFishLinkItem}>
          <Inp label="アイコン" value={newFishLinkItem.icon} onChange={e=>setNewFishLinkItem({...newFishLinkItem,icon:e.target.value})}/>
          <Inp label="ラベル *" value={newFishLinkItem.label} onChange={e=>setNewFishLinkItem({...newFishLinkItem,label:e.target.value})} placeholder="例：釣割"/>
          <Inp label="説明" value={newFishLinkItem.sub} onChange={e=>setNewFishLinkItem({...newFishLinkItem,sub:e.target.value})}/>
          <Inp label="URL *" value={newFishLinkItem.url} onChange={e=>setNewFishLinkItem({...newFishLinkItem,url:e.target.value})} placeholder="https://..."/>
          <div style={{marginBottom:10}}><div style={{fontSize:11,color:"#6B7280",marginBottom:4}}>カラー</div><div style={{display:"flex",gap:10,alignItems:"center"}}><input type="color" value={newFishLinkItem.color} onChange={e=>setNewFishLinkItem({...newFishLinkItem,color:e.target.value})} style={{width:48,height:36,borderRadius:8,border:"1.5px solid #E5E7EB",cursor:"pointer",padding:2}}/><div style={{flex:1,height:36,borderRadius:8,background:newFishLinkItem.color}}/></div></div>
        </Modal>}
        {fishLinkModal==="edit"&&editFishLink&&<Modal title="🔗 リンクを編集" onClose={()=>{setFishLinkModal(null);setEditFishLink(null);}} onSave={updateFishLinkItem}>
          <Inp label="アイコン" value={editFishLink.icon} onChange={e=>setEditFishLink({...editFishLink,icon:e.target.value})}/>
          <Inp label="ラベル *" value={editFishLink.label} onChange={e=>setEditFishLink({...editFishLink,label:e.target.value})}/>
          <Inp label="説明" value={editFishLink.sub} onChange={e=>setEditFishLink({...editFishLink,sub:e.target.value})}/>
          <Inp label="URL *" value={editFishLink.url} onChange={e=>setEditFishLink({...editFishLink,url:e.target.value})}/>
          <div style={{marginBottom:10}}><div style={{fontSize:11,color:"#6B7280",marginBottom:4}}>カラー</div><div style={{display:"flex",gap:10,alignItems:"center"}}><input type="color" value={editFishLink.color} onChange={e=>setEditFishLink({...editFishLink,color:e.target.value})} style={{width:48,height:36,borderRadius:8,border:"1.5px solid #E5E7EB",cursor:"pointer",padding:2}}/><div style={{flex:1,height:36,borderRadius:8,background:editFishLink.color}}/></div></div>
        </Modal>}
        {conf&&<Confirm msg={conf.msg} onCancel={()=>setConf(null)} onOk={conf.onOk}/>}
        {/* 週間天気モーダル */}
        {showWeeklyModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowWeeklyModal(false)}>
          <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:"20px 20px 36px",width:"100%",maxHeight:"80vh",overflowY:"auto",boxSizing:"border-box"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#E5E7EB",borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{fontWeight:800,fontSize:16,color:"#1A3A5C",marginBottom:2}}>📅 週間天気</div>
            <div style={{fontSize:12,color:"#6B7280",marginBottom:16}}>{weeklyTarget?.name}</div>
            {!weeklyWeather&&<div style={{textAlign:"center",padding:20,color:"#9CA3AF"}}>取得中...</div>}
            {weeklyWeather&&<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
              {weeklyWeather.time?.map((date,i)=>{
                const d=new Date(date);
                const code=weeklyWeather.weather_code?.[i]??0;
                const max=Math.round(weeklyWeather.temperature_2m_max?.[i]??0);
                const min=Math.round(weeklyWeather.temperature_2m_min?.[i]??0);
                const rain=weeklyWeather.precipitation_probability_max?.[i]??0;
                return(
                  <div key={date} style={{textAlign:"center",background:"#F0F9FF",borderRadius:10,padding:"8px 2px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:3}}>{WEEKDAYS[d.getDay()]}</div>
                    <div style={{fontSize:20,marginBottom:3}}>{wIcon(code)}</div>
                    <div style={{fontSize:12,fontWeight:800,color:"#EF4444"}}>{max}°</div>
                    <div style={{fontSize:11,color:"#3B82F6"}}>{min}°</div>
                    <div style={{fontSize:10,color:"#6B7280",marginTop:2}}>💧{rain}%</div>
                  </div>
                );
              })}
            </div>}
          </div>
        </div>}
      </div>
    );
  }

  // ══ Auto-Edit ══'''

if OLD10 in code:
    code = code.replace(OLD10, NEW10, 1)
    print("✅ 変更10: モーダル・週間天気追加")
else:
    errors.append("❌ 変更10: 釣りページ末尾 が見つかりません")

# =========================================
# 変更11: 釣りページからQUICK_LINKSとBOATSのhardcode削除
# =========================================
# QUICK_LINKSのhardcodeは既に削除済み（変更9で置き換え）
# BOATSのhardcodeはfishBoatsを使っているので問題なし

# =========================================
# 結果を書き込み
# =========================================
if errors:
    print("\n⚠️ 一部の変更が適用できませんでした:")
    for e in errors:
        print(e)
else:
    print("\n✅ 全変更が適用されました！")

with open(APP_PATH, "w", encoding="utf-8") as f:
    f.write(code)
print(f"保存完了: {len(code.splitlines())} 行")
print("\n次のコマンドを実行してください:")
print("git add .")
print('git commit -m "週間天気・掲示板・釣り編集機能追加"')
print("git push")
