import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const STATUSES = ["発注待ち","見積中","着工","進行中","完了","中断"];
const COMPANY_TYPES = ["取引先","協力業者","その他"];
const CONTACT_ROLES = ["営業","現場監督","職人","事務","その他"];
const STATUS_STYLE = {
  "発注待ち":{bg:"#FFF3CD",text:"#856404",border:"#FFCA2C"},
  "見積中":{bg:"#E0F0FF",text:"#0B4F8A",border:"#60A5FA"},
  "着工":{bg:"#D1FAE5",text:"#065F46",border:"#34D399"},
  "進行中":{bg:"#D1E7DD",text:"#0A3622",border:"#20C997"},
  "完了":{bg:"#E2E3E5",text:"#41464B",border:"#ADB5BD"},
  "中断":{bg:"#F8D7DA",text:"#58151C",border:"#F1707A"},
};
const DEFAULT_FINANCE_ITEMS = [
  {id:"invoice",label:"請求書PDF",icon:"🧾"},
  {id:"receipt",label:"領収書",icon:"📄"},
  {id:"outsource",label:"外注請求書",icon:"📋"},
  {id:"order",label:"発注書",icon:"📝"},
  {id:"delivery",label:"納品書",icon:"📦"},
  {id:"bankbook",label:"通帳確認",icon:"🏦"},
  {id:"settlement",label:"決算資料",icon:"📊"},
  {id:"insurance",label:"保険関係",icon:"🛡"},
  {id:"tax",label:"税務書類",icon:"📑"},
];
const TEMPLATE_CATS = [
  {id:"notice",label:"居住者へのお知らせ",icon:"📢"},
  {id:"est_base",label:"見積もりベース",icon:"📊"},
  {id:"contract",label:"契約書・書類",icon:"📄"},
  {id:"report",label:"報告書・議事録",icon:"📝"},
  {id:"other",label:"その他",icon:"📁"},
];
const DEFAULT_LINKS = [
  {id:"l1",cat:"ツール・サービス",label:"Dropbox",url:"https://www.dropbox.com",icon:"📦"},
  {id:"l2",cat:"ツール・サービス",label:"サイボウズ",url:"https://garoon.cybozu.co.jp",icon:"🗂"},
  {id:"l3",cat:"ツール・サービス",label:"イシグロ",url:"https://www.ishiguro-group.co.jp",icon:"🏗"},
  {id:"l4",cat:"Google",label:"Google ToDo",url:"https://tasks.google.com",icon:"✅"},
];
const DEFAULT_TILE_CONF = [
  {key:"projects",icon:"📋",label:"案件管理",sub:"件進行中",color:"#1A3A5C",visible:true},
  {key:"companies",icon:"🏢",label:"取引先・協力業者",sub:"社登録",color:"#E07B39",visible:true},
  {key:"tasks",icon:"✅",label:"タスク",sub:"未完了",color:"#059669",visible:true},
  {key:"links",icon:"🔗",label:"リンク集",sub:"外部サービス",color:"#7C3AED",visible:true},
  {key:"finance",icon:"🗃",label:"財務・書類管理",sub:"書類一覧",color:"#0891B2",visible:true},
  {key:"templates",icon:"📂",label:"お知らせ・雛形",sub:"テンプレート",color:"#D97706",visible:true},
  {key:"estimate",icon:"📝",label:"見積書作成",sub:"CSV出力対応",color:"#BE185D",visible:true},
  {key:"analytics",icon:"📊",label:"分析ダッシュボード",sub:"グラフ・集計",color:"#0F766E",visible:true},
  {key:"ai",icon:"🤖",label:"AIアシスタント",sub:"データに質問",color:"#6D28D9",visible:true},
  {key:"chatgpt",icon:"💬",label:"ChatGPT",sub:"外部AIを開く",color:"#10A37F",visible:true},
];
const DEFAULT_CUST = {name:"株式会社IGUMI",sys:"案件管理システム",c1:"#1A3A5C",c2:"#2563EB",acc:"#E07B39",bg:"#F0F4F8",showSidebar:true,showRightPanel:true,showLauncher:true};

const fmt = n => n?"¥"+Number(n).toLocaleString():"—";
const pct = (g,a) => a?((g/a)*100).toFixed(1)+"%":"—";
const PRIO = {high:{l:"高",c:"#EF4444"},mid:{l:"中",c:"#F59E0B"},low:{l:"低",c:"#10B981"}};

const Badge = ({s}) => { const st=STATUS_STYLE[s]||STATUS_STYLE["見積中"]; return <span style={{background:st.bg,color:st.text,border:`1px solid ${st.border}`,borderRadius:6,padding:"2px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{s}</span>; };
const Inp = ({label,...p}) => (<div style={{marginBottom:10}}>{label&&<div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>{label}</div>}<input {...p} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,background:"#FAFAFA",boxSizing:"border-box",outline:"none",color:"#1F2937"}}/></div>);
const Sel = ({label,opts,...p}) => (<div style={{marginBottom:10}}>{label&&<div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>{label}</div>}<select {...p} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,background:"#FAFAFA",boxSizing:"border-box",color:"#1F2937"}}>{opts.map(o=><option key={o}>{o}</option>)}</select></div>);
const Modal = ({title,onClose,onSave,children}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"flex-end"}}>
    <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",width:"100%",maxHeight:"90vh",overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{width:40,height:4,background:"#E5E7EB",borderRadius:2,margin:"0 auto 16px"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontWeight:800,fontSize:16,color:"#1F2937"}}>{title}</div>
        <button onClick={onClose} style={{background:"#F3F4F6",border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",fontSize:15}}>✕</button>
      </div>
      {children}
      {onSave&&<button onClick={onSave} style={{width:"100%",padding:13,background:"#1A3A5C",color:"#fff",border:"none",borderRadius:12,fontWeight:800,fontSize:15,cursor:"pointer",marginTop:6}}>保存する</button>}
    </div>
  </div>
);
const Hdr = ({title,back,right}) => (
  <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
    {back?<button onClick={back} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"4px 10px",fontSize:13,cursor:"pointer",fontWeight:700}}>←</button>
        :<div style={{background:"#E07B39",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:16}}>I</div>}
    <div style={{flex:1}}><div style={{fontWeight:800,fontSize:16}}>{title}</div>{!back&&<div style={{fontSize:10,opacity:0.65}}>株式会社IGUMI</div>}</div>
    {right}
  </div>
);
const Confirm = ({msg,onCancel,onOk}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
    <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:320}}>
      <div style={{fontSize:15,color:"#374151",marginBottom:20,lineHeight:1.6}}>{msg}</div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:12,background:"#F3F4F6",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer"}}>キャンセル</button>
        <button onClick={onOk} style={{flex:1,padding:12,background:"#DC2626",color:"#fff",border:"none",borderRadius:10,fontWeight:800,cursor:"pointer"}}>削除する</button>
      </div>
    </div>
  </div>
);

export default function App() {
  const [page,setPage]=useState("home");
  const [cos,setCos]=useState([]);
  const [pjs,setPjs]=useState([]);
  const [tks,setTks]=useState([]);
  const [loading,setLoading]=useState(true);
  const [links,setLinks]=useState(DEFAULT_LINKS);
  const [selP,setSelP]=useState(null);
  const [selC,setSelC]=useState(null);
  const [selCt,setSelCt]=useState(null);
  const [modal,setModal]=useState(null);
  const [fltS,setFltS]=useState("すべて");
  const [fltT,setFltT]=useState("すべて");
  const [schP,setSchP]=useState("");
  const [schC,setSchC]=useState("");
  const [conf,setConf]=useState(null);
  const [fileDel,setFileDel]=useState(null);
  const [finFiles,setFinFiles]=useState([]);
  const [finFolders,setFinFolders]=useState([]);
  const [finItem,setFinItem]=useState(null);
  const [finY,setFinY]=useState(null);
  const [finM,setFinM]=useState(null);
  const [finPrev,setFinPrev]=useState(null);
  const [finModal,setFinModal]=useState(null);
  const [newFolder,setNewFolder]=useState({label:"",icon:"📁"});
  const [editFolder,setEditFolder]=useState(null);
  const [pws,setPws]=useState({});
  const [unl,setUnl]=useState({});
  const [pwMod,setPwMod]=useState(null);
  const [pwIn,setPwIn]=useState("");
  const [pwErr,setPwErr]=useState("");
  const [tmplCat,setTmplCat]=useState(null);
  const [tmplPrev,setTmplPrev]=useState(null);
  const [tmplFiles,setTmplFiles]=useState([]);
  const [cust,setCust]=useState(DEFAULT_CUST);
  const [ec,setEc]=useState({...DEFAULT_CUST});
  const [editLnk,setEditLnk]=useState(null);
  const [newLnk,setNewLnk]=useState({label:"",url:"",icon:"🔗",cat:"ツール・サービス"});
  const [editCoForm,setEditCoForm]=useState({name:"",branch:"",type:"取引先"});
  const [tileConf,setTileConf]=useState(DEFAULT_TILE_CONF);
  const [tileEdit,setTileEdit]=useState(false);
  const [editTile,setEditTile]=useState(null);
  const [est,setEst]=useState({no:"0001",date:new Date().toISOString().split("T")[0],clientId:"",pjName:"",person:"崎岡",items:[],sub:0,tax:0,total:0});
  const blankP={name:"",status:"発注待ち",clientId:"",salesRep:"",inCharge:"崎岡",subIds:[],amount:"",gp:"",qDate:"",memo:""};
  const [nP,setNP]=useState(blankP);
  const [nCo,setNCo]=useState({name:"",type:"協力業者",branch:""});
  const [nCt,setNCt]=useState({name:"",role:"営業",tel:"",email:"",memo:""});
  const [nTk,setNTk]=useState({title:"",due:"",prio:"mid"});
  const [aiMsgs,setAiMsgs]=useState([]);
  const [aiInput,setAiInput]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  // ✅ PCレイアウト判定
  const [isPC,setIsPC]=useState(()=>window.innerWidth>=768);

  useEffect(()=>{
    const h=()=>setIsPC(window.innerWidth>=768);
    window.addEventListener("resize",h);
    return ()=>window.removeEventListener("resize",h);
  },[]);

  useEffect(()=>{loadAll();},[]);

  const loadAll = async () => {
    setLoading(true);
    const [pjRes,coRes,tkRes,ffRes,foldRes,hsRes,linksRes,tmplRes] = await Promise.all([
      supabase.from("projects").select("*").order("created_at",{ascending:false}),
      supabase.from("companies").select("*").order("created_at",{ascending:true}),
      supabase.from("tasks").select("*").order("created_at",{ascending:false}),
      supabase.from("finance_files").select("id,item_id,year,month,name,type,size,url,path,created_at").order("created_at",{ascending:false}),
      supabase.from("finance_folders").select("*").order("sort_order",{ascending:true}),
      supabase.from("home_settings").select("*"),
      supabase.from("links").select("*").order("sort_order",{ascending:true}),
      supabase.from("template_files").select("id,cat_id,name,type,size,url,path,created_at").order("created_at",{ascending:false}),
    ]);
    if(pjRes.data) setPjs(pjRes.data.map(p=>({...p,subIds:p.subcontractorIds||[],gp:p.grossProfit||0,qDate:p.quoteDate||""})));
    if(coRes.data) setCos(coRes.data.map(c=>({...c,contacts:c.contacts||[]})));
    if(tkRes.data) setTks(tkRes.data.map(t=>({...t,prio:t.priority||"mid"})));
    if(ffRes.data) setFinFiles(ffRes.data);
    if(foldRes.data) setFinFolders(foldRes.data);
    if(hsRes.data){
      const tilesRow=hsRes.data.find(r=>r.id==="tiles");
      const custRow=hsRes.data.find(r=>r.id==="customize");
      if(tilesRow?.value && Array.isArray(tilesRow.value) && tilesRow.value.length>0) setTileConf(tilesRow.value);
      if(custRow?.value && Object.keys(custRow.value).length>0) { setCust(custRow.value); setEc(custRow.value); }
    }
    if(linksRes.data && linksRes.data.length>0) setLinks(linksRes.data);
    if(tmplRes.data) setTmplFiles(tmplRes.data);
    setLoading(false);
  };

  // ── home_settings 保存ヘルパー ──
  const saveHomeSetting = async (id, value) => {
    await supabase.from("home_settings").upsert({id, value, updated_at: new Date().toISOString()});
  };

  // ── タイル設定保存 ──
  const saveTileConf = async (newConf) => {
    setTileConf(newConf);
    await saveHomeSetting("tiles", newConf);
  };

  // ── カスタマイズ保存 ──
  const saveCustomize = async (newCust) => {
    setCust(newCust);
    await saveHomeSetting("customize", newCust);
  };

  // ── リンク操作（Supabase） ──
  const addLink = async (lnk) => {
    const {data} = await supabase.from("links").insert([{cat:lnk.cat,label:lnk.label,url:lnk.url,icon:lnk.icon,sort_order:links.length}]).select();
    if(data) setLinks(prev=>[...prev,data[0]]);
  };
  const updateLink = async (lnk) => {
    await supabase.from("links").update({cat:lnk.cat,label:lnk.label,url:lnk.url,icon:lnk.icon}).eq("id",lnk.id);
    setLinks(prev=>prev.map(l=>l.id===lnk.id?lnk:l));
  };
  const deleteLink = async (id) => {
    await supabase.from("links").delete().eq("id",id);
    setLinks(prev=>prev.filter(l=>l.id!==id));
  };

  // ── テンプレートファイル操作（Supabase Storage） ──
  const uploadTmplFile = async (file, catId) => {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `templates/${catId}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from("files").upload(path, file);
    if(error){
      console.error("Storage upload error:", error);
      alert(`アップロードエラー: ${error.message}`);
      return;
    }
    const { data: urlData } = supabase.storage.from("files").getPublicUrl(path);
    const { data } = await supabase.from("template_files").insert([{
      cat_id:catId, name:file.name, type:file.type, size:file.size, url:urlData.publicUrl, path
    }]).select("id,cat_id,name,type,size,url,path,created_at");
    if(data) setTmplFiles(prev=>[...prev, data[0]]);
  };
  const deleteTmplFile = async (id) => {
    const f = tmplFiles.find(f=>f.id===id);
    if(f?.path){
      try { await supabase.storage.from("files").remove([f.path]); }
      catch(e){ console.warn("Storage削除エラー（無視）:", e); }
    }
    const { error } = await supabase.from("template_files").delete().eq("id",id);
    if(error){ alert(`削除エラー: ${error.message}`); return; }
    setTmplFiles(prev=>prev.filter(f=>f.id!==id));
    setTmplPrev(null);
  };

  // ── 財務ファイル操作（Supabase Storage） ──
  const uploadFinFile = async (file, itemId, year, month) => {
    // ✅ ファイル名を安全な文字列に変換（日本語・スペース対応）
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `finance/${itemId}/${year}/${month}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from("files").upload(path, file);
    if(error){
      console.error("Storage upload error:", error);
      alert(`アップロードエラー: ${error.message}\n\nSupabaseのStorageバケット設定を確認してください。`);
      return;
    }
    const { data: urlData } = supabase.storage.from("files").getPublicUrl(path);
    const { data, error: dbError } = await supabase.from("finance_files").insert([{
      item_id:itemId, year:Number(year), month:Number(month),
      name:file.name, type:file.type, size:file.size, url:urlData.publicUrl, path
    }]).select("id,item_id,year,month,name,type,size,url,path,created_at");
    if(dbError){
      console.error("DB insert error:", dbError);
      alert(`DB保存エラー: ${dbError.message}`);
      return;
    }
    if(data) setFinFiles(prev=>[...prev, data[0]]);
  };
  const deleteFinFile = async (id) => {
    const f = finFiles.find(f=>f.id===id);
    if(f?.path){
      try { await supabase.storage.from("files").remove([f.path]); }
      catch(e){ console.warn("Storage削除エラー（無視）:", e); }
    }
    const { error } = await supabase.from("finance_files").delete().eq("id",id);
    if(error){ alert(`削除エラー: ${error.message}`); return; }
    setFinFiles(prev=>prev.filter(f=>f.id!==id));
    setFinPrev(null);
  };

  // ── 財務フォルダ操作 ──
  const addFinFolder = async () => {
    if(!newFolder.label) return;
    const {data} = await supabase.from("finance_folders").insert([{label:newFolder.label,icon:newFolder.icon,sort_order:finFolders.length}]).select();
    if(data) setFinFolders(prev=>[...prev,data[0]]);
    setNewFolder({label:"",icon:"📁"}); setFinModal(null);
  };
  const updateFinFolder = async () => {
    if(!editFolder) return;
    await supabase.from("finance_folders").update({label:editFolder.label,icon:editFolder.icon}).eq("id",editFolder.id);
    setFinFolders(prev=>prev.map(f=>f.id===editFolder.id?{...f,...editFolder}:f));
    setEditFolder(null); setFinModal(null);
  };
  const deleteFinFolder = async (id) => {
    await supabase.from("finance_folders").delete().eq("id",id);
    setFinFolders(prev=>prev.filter(f=>f.id!==id));
  };


  const nav=p=>{setPage(p);setSchP("");setSchC("");setFltS("すべて");setFltT("すべて");setSelP(null);setSelC(null);setSelCt(null);setFinItem(null);setFinY(null);setFinM(null);setFinPrev(null);setTmplCat(null);setTmplPrev(null);setPwMod(null);setPwIn("");setPwErr("");setModal(null);};
  
  // ── AIチャット ──
  const sendAI = async () => {
    if(!aiInput.trim()||aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput("");
    setAiMsgs(prev=>[...prev,{role:"user",content:userMsg}]);
    setAiLoading(true);
    try {
      const context = `
あなたはIGUMI管理アプリのAIアシスタントです。以下のデータをもとに質問に答えてください。日本語で簡潔に答えてください。

【案件データ】
${pjs.map(p=>`・${p.name}（${p.status}）受注:${p.amount?'¥'+Number(p.amount).toLocaleString():'未設定'} 粗利:${p.gp?'¥'+Number(p.gp).toLocaleString():'未設定'} 担当:${p.inCharge||'未設定'}`).join('\n')}

【取引先データ】
${cos.map(c=>`・${c.name}${c.branch?' '+c.branch:''}（${c.type}）担当者${(c.contacts||[]).length}名`).join('\n')}

【未完了タスク】
${tks.filter(t=>!t.done).map(t=>`・${t.title}（優先度:${t.prio}）${t.due?'期限:'+t.due:''}`).join('\n')||'なし'}
      `;
      const res = await fetch("/api/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"gpt-4o-mini",
          messages:[
            {role:"system",content:context},
            ...aiMsgs.slice(-6),
            {role:"user",content:userMsg}
          ],
          max_tokens:800
        })
      });
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "エラーが発生しました";
      setAiMsgs(prev=>[...prev,{role:"assistant",content:reply}]);
    } catch(e) {
      setAiMsgs(prev=>[...prev,{role:"assistant",content:"エラーが発生しました。APIキーを確認してください。"}]);
    }
    setAiLoading(false);
  };
  const getC=id=>cos.find(c=>c.id===id);
  const getPF=cid=>pjs.filter(p=>p.clientId===cid||(p.subIds||[]).includes(cid));
  const pending=tks.filter(t=>!t.done);

  const [editP,setEditP]=useState(null);

  const savePj=async()=>{
    if(!nP.name)return;
    const {data}=await supabase.from("projects").insert([{name:nP.name,status:nP.status,clientId:nP.clientId,salesRep:nP.salesRep,inCharge:nP.inCharge,subcontractorIds:nP.subIds||[],amount:Number(nP.amount)||0,grossProfit:Number(nP.gp)||0,quoteDate:nP.qDate,memo:nP.memo}]).select();
    if(data) setPjs([{...data[0],subIds:data[0].subcontractorIds||[],gp:data[0].grossProfit||0,qDate:data[0].quoteDate||""},...pjs]);
    setNP(blankP); setModal(null);
  };
  const updatePj=async()=>{
    if(!editP||!editP.name)return;
    await supabase.from("projects").update({name:editP.name,status:editP.status,clientId:editP.clientId,salesRep:editP.salesRep,inCharge:editP.inCharge,subcontractorIds:editP.subIds||[],amount:Number(editP.amount)||0,grossProfit:Number(editP.gp)||0,quoteDate:editP.qDate,memo:editP.memo}).eq("id",editP.id);
    const updated={...editP,gp:Number(editP.gp)||0,amount:Number(editP.amount)||0};
    setPjs(pjs.map(p=>p.id===editP.id?updated:p));
    setSelP(updated); setEditP(null);
  };
  const delPj=async id=>{await supabase.from("projects").delete().eq("id",id);setPjs(pjs.filter(p=>p.id!==id));setSelP(null);};
  const saveCo=async()=>{
    if(!nCo.name)return;
    const {data}=await supabase.from("companies").insert([{name:nCo.name,type:nCo.type,branch:nCo.branch,contacts:[]}]).select();
    if(data) setCos([...cos,{...data[0],contacts:[]}]);
    setNCo({name:"",type:"協力業者",branch:""}); setModal(null);
  };
  const updateCo=async(id,updates)=>{
    await supabase.from("companies").update(updates).eq("id",id);
    const upd=cos.map(c=>c.id===id?{...c,...updates}:c);
    setCos(upd);
    if(selC?.id===id) setSelC({...selC,...updates});
  };
  const delCo=async id=>{await supabase.from("companies").delete().eq("id",id);setCos(cos.filter(c=>c.id!==id));};
  const saveCt=async()=>{
    if(!nCt.name||!selC)return;
    const ct={id:"ct"+Date.now(),...nCt};
    const newContacts=[...(selC.contacts||[]),ct];
    await supabase.from("companies").update({contacts:newContacts}).eq("id",selC.id);
    const upd=cos.map(c=>c.id===selC.id?{...c,contacts:newContacts}:c);
    setCos(upd); setSelC({...selC,contacts:newContacts});
    setNCt({name:"",role:"営業",tel:"",email:"",memo:""}); setModal(null);
  };
  const saveTk=async()=>{
    if(!nTk.title)return;
    const {data}=await supabase.from("tasks").insert([{title:nTk.title,done:false,priority:nTk.prio,due:nTk.due}]).select();
    if(data) setTks([{...data[0],prio:data[0].priority||"mid"},...tks]);
    setNTk({title:"",due:"",prio:"mid"}); setModal(null);
  };
  const delTk=async id=>{await supabase.from("tasks").delete().eq("id",id);setTks(tks.filter(t=>t.id!==id));};
  const togTk=async t=>{await supabase.from("tasks").update({done:!t.done}).eq("id",t.id);setTks(tks.map(x=>x.id===t.id?{...x,done:!x.done}:x));};

  const filtP=pjs.filter(p=>{if(fltS!=="すべて"&&p.status!==fltS)return false;if(schP&&!p.name.includes(schP)&&!(getC(p.clientId)?.name||"").includes(schP))return false;return true;});
  const filtC=cos.filter(c=>{if(fltT!=="すべて"&&c.type!==fltT)return false;if(schC&&!c.name.includes(schC))return false;return true;});

  const genYM=()=>{const now=new Date(),res={};for(let y=2022;y<=now.getFullYear();y++){res[y]=[];const max=y===now.getFullYear()?now.getMonth()+1:12;for(let m=1;m<=max;m++)res[y].push(m);}return res;};
  const ym=genYM();

  // ✅ PCレイアウト定数
  const SB_W=180,RP_W=220;
  const [rpOpen,setRpOpen]=useState(true);
  const pp=isPC?{marginLeft:SB_W,marginRight:rpOpen?RP_W:32}:{};

  // ✅ フローティングランチャー
  const [launchOpen,setLaunchOpen]=useState(false);
  const [launchCat,setLaunchCat]=useState(null);
  const FloatLauncher=()=>{
    const cats=[...new Set(links.map(l=>l.cat))];
    return(
      <>
        {launchOpen&&<div onClick={()=>setLaunchOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:200}}/>}
        {launchOpen&&(
          <div style={{position:"fixed",bottom:isPC?24:80,right:isPC?80:16,background:"#fff",borderRadius:16,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",zIndex:201,width:270,overflow:"hidden"}}>
            <div style={{background:"#1A3A5C",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:"#fff",fontWeight:800,fontSize:14}}>🚀 アプリを開く</div>
              <button onClick={()=>setLaunchOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:18,cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
            <div style={{display:"flex",gap:6,overflowX:"auto",padding:"8px 12px",borderBottom:"1px solid #F3F4F6"}}>
              <button onClick={()=>setLaunchCat(null)} style={{padding:"4px 10px",borderRadius:12,border:"none",background:!launchCat?"#1A3A5C":"#F3F4F6",color:!launchCat?"#fff":"#6B7280",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>すべて</button>
              {cats.map(cat=>(<button key={cat} onClick={()=>setLaunchCat(c=>c===cat?null:cat)} style={{padding:"4px 10px",borderRadius:12,border:"none",background:launchCat===cat?"#1A3A5C":"#F3F4F6",color:launchCat===cat?"#fff":"#6B7280",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{cat}</button>))}
            </div>
            <div style={{maxHeight:320,overflowY:"auto"}}>
              {links.filter(l=>!launchCat||l.cat===launchCat).map((l,i,arr)=>(
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",textDecoration:"none",color:"#1F2937",borderBottom:i<arr.length-1?"1px solid #F9FAFB":"none",background:"#fff"}}
                  onMouseOver={e=>e.currentTarget.style.background="#F9FAFB"}
                  onMouseOut={e=>e.currentTarget.style.background="#fff"}>
                  <span style={{fontSize:22,flexShrink:0}}>{l.icon}</span>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:"#1F2937"}}>{l.label}</div><div style={{fontSize:10,color:"#9CA3AF"}}>{l.cat}</div></div>
                  <span style={{fontSize:12,color:"#9CA3AF"}}>↗</span>
                </a>
              ))}
            </div>
            <div style={{borderTop:"1px solid #F3F4F6",padding:"10px 16px"}}>
              <button onClick={()=>{setLaunchOpen(false);nav("links");}} style={{width:"100%",padding:"8px 0",background:"#F0F4F8",border:"none",borderRadius:8,fontSize:12,color:"#1A3A5C",fontWeight:700,cursor:"pointer"}}>⚙ リンクを管理する</button>
            </div>
          </div>
        )}
        <button onClick={()=>setLaunchOpen(p=>!p)} style={{position:"fixed",bottom:24,right:16,width:52,height:52,borderRadius:"50%",background:launchOpen?"#E07B39":"#1A3A5C",color:"#fff",border:"none",fontSize:22,boxShadow:"0 4px 16px rgba(0,0,0,0.25)",cursor:"pointer",zIndex:202,display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.2s"}}>
          {launchOpen?"✕":"🚀"}
        </button>
      </>
    );
  };

  // ✅ PCサイドバー
  const PCSidebar=()=>{
    const active=pjs.filter(p=>p.status!=="完了"&&p.status!=="中断");
    return(<div style={{position:"fixed",left:0,top:0,bottom:0,width:SB_W,background:"#1A3A5C",zIndex:100,display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div style={{padding:"18px 16px 14px",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{background:cust.acc,borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:16,color:"#fff"}}>I</div>
          <div><div style={{fontWeight:800,fontSize:13,color:"#fff"}}>{cust.sys}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>{cust.name}</div></div>
        </div>
      </div>
      <div style={{flex:1,paddingTop:6}}>
        {tileConf.filter(t=>t.visible).map(t=>{
          const isAct=page===t.key;
          const sub=t.key==="projects"?`${active.length}件進行中`:t.key==="companies"?`${cos.length}社`:t.key==="tasks"?`未完了 ${pending.length}件`:t.sub;
          return(<button key={t.key} onClick={()=>{if(t.key==="chatgpt"){window.open("https://chatgpt.com","_blank");}else nav(t.key);}} style={{width:"100%",padding:"9px 16px",background:isAct?"rgba(255,255,255,0.13)":"transparent",border:"none",color:"#fff",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:10,borderLeft:`3px solid ${isAct?t.color:"transparent"}`}}>
            <span style={{fontSize:18,flexShrink:0}}>{t.icon}</span>
            <div style={{overflow:"hidden"}}>
              <div style={{fontSize:12,fontWeight:isAct?800:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.label}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.45)",whiteSpace:"nowrap"}}>{sub}</div>
            </div>
          </button>);
        })}
      </div>
      <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,0.1)"}}>
        <button onClick={()=>{setEc({...cust});setModal("cust");}} style={{width:"100%",padding:"8px 12px",background:"rgba(255,255,255,0.1)",border:"none",color:"rgba(255,255,255,0.7)",borderRadius:8,fontSize:11,cursor:"pointer",fontWeight:600,textAlign:"left"}}>⚙ カスタマイズ</button>
      </div>
    </div>);
  };

  // ✅ PC右パネル（折りたたみ対応）
  const PCRightPanel=()=>{
    const [qi,setQi]=useState("");
    const [open,setOpen]=useState({kpi:true,tasks:true,ai:true});
    const tog=k=>setOpen(p=>({...p,[k]:!p[k]}));
    const totalAmt=pjs.reduce((s,p)=>s+(p.amount||0),0);
    const totalGp=pjs.reduce((s,p)=>s+(p.gp||0),0);
    const active=pjs.filter(p=>p.status!=="完了"&&p.status!=="中断");
    const SectionHdr=({id,label})=>(
      <button onClick={()=>tog(id)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"none",border:"none",cursor:"pointer",padding:"10px 0 8px"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#1A3A5C"}}>{label}</div>
        <div style={{fontSize:11,color:"#9CA3AF",background:"#F3F4F6",borderRadius:6,padding:"2px 8px",fontWeight:700,transform:open[id]?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.2s"}}>▼</div>
      </button>
    );

    // ── 折りたたみ時：細いタブだけ ──
    if(!rpOpen) return(
      <div style={{position:"fixed",right:0,top:0,bottom:0,width:32,background:"#fff",borderLeft:"1px solid #E5E7EB",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <button onClick={()=>setRpOpen(true)}
          style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:8,color:"#9CA3AF"}}>
          <span style={{fontSize:16}}>◀</span>
          <span style={{fontSize:9,fontWeight:700,writingMode:"vertical-rl",letterSpacing:1,color:"#BFBFBF"}}>パネル</span>
        </button>
      </div>
    );

    // ── 展開時 ──
    return(<div style={{position:"fixed",right:0,top:0,bottom:0,width:RP_W,background:"#fff",borderLeft:"1px solid #E5E7EB",overflowY:"auto",zIndex:100}}>
      <div style={{padding:"12px 16px 16px"}}>

        {/* 閉じるボタン */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
          <button onClick={()=>setRpOpen(false)}
            style={{background:"#F3F4F6",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,color:"#6B7280",cursor:"pointer",fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
            閉じる ▶
          </button>
        </div>

        {/* ── KPI ── */}
        <SectionHdr id="kpi" label="📊 今日の状況"/>
        {open.kpi&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          {[{l:"進行中案件",v:`${active.length}件`,c:"#1A3A5C",bg:"#EFF6FF"},{l:"未完了タスク",v:`${pending.length}件`,c:"#EF4444",bg:"#FEF2F2"},{l:"受注合計",v:`¥${(totalAmt/10000).toFixed(0)}万`,c:"#E07B39",bg:"#FFF7ED"},{l:"粗利率",v:totalAmt?`${(totalGp/totalAmt*100).toFixed(1)}%`:"—",c:"#059669",bg:"#F0FDF4"}].map(x=>(
            <div key={x.l} style={{background:x.bg,borderRadius:10,padding:"10px"}}>
              <div style={{fontSize:10,color:"#9CA3AF",marginBottom:3}}>{x.l}</div>
              <div style={{fontSize:15,fontWeight:900,color:x.c}}>{x.v}</div>
            </div>
          ))}
        </div>}
        <div style={{height:1,background:"#F3F4F6",margin:"4px 0"}}/>

        {/* ── タスク ── */}
        <SectionHdr id="tasks" label="⏰ 直近タスク"/>
        {open.tasks&&<div style={{background:"#F9FAFB",borderRadius:10,padding:"4px 0",marginBottom:14}}>
          {pending.slice(0,5).map((t,i)=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:i<Math.min(pending.length,5)-1?"1px solid #F3F4F6":"none"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:PRIO[t.prio]?.c,flexShrink:0}}/>
              <div style={{flex:1,fontSize:12,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
              {t.due&&<div style={{fontSize:10,color:"#9CA3AF",flexShrink:0}}>{t.due}</div>}
            </div>
          ))}
          {pending.length===0&&<div style={{padding:"12px",fontSize:12,color:"#9CA3AF",textAlign:"center"}}>タスクなし 🎉</div>}
        </div>}
        <div style={{height:1,background:"#F3F4F6",margin:"4px 0"}}/>

        {/* ── AI ── */}
        <SectionHdr id="ai" label="🤖 AIに質問"/>
        {open.ai&&<div>
          <div style={{display:"flex",gap:6,marginBottom:4}}>
            <input value={qi} onChange={e=>setQi(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&qi.trim()){setAiInput(qi);setQi("");nav("ai");}}} placeholder="AIに質問..." style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:12,outline:"none",color:"#1F2937"}}/>
            <button onClick={()=>{if(qi.trim()){setAiInput(qi);setQi("");nav("ai");}}} style={{background:"#6D28D9",color:"#fff",border:"none",borderRadius:8,padding:"8px 10px",fontSize:12,cursor:"pointer",fontWeight:700}}>→</button>
          </div>
          <div style={{fontSize:10,color:"#9CA3AF"}}>Enterキーで送信・AIページへ</div>
        </div>}

      </div>
    </div>);
  };

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'Hiragino Sans',sans-serif",background:"#F0F4F8"}}><div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>⚡</div><div style={{color:"#1A3A5C",fontWeight:700}}>読み込み中...</div></div></div>;

  // ══ ファイル削除確認（グローバル）══
  if(fileDel) return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
      <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:320,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:22,textAlign:"center",marginBottom:12}}>🗑</div>
        <div style={{fontSize:15,color:"#374151",marginBottom:6,fontWeight:700,textAlign:"center"}}>削除しますか？</div>
        <div style={{fontSize:13,color:"#6B7280",marginBottom:20,textAlign:"center",wordBreak:"break-all"}}>「{fileDel.name}」</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setFileDel(null)} style={{flex:1,padding:13,background:"#F3F4F6",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",color:"#374151"}}>キャンセル</button>
          <button onClick={()=>{fileDel.onDelete();setFileDel(null);}} style={{flex:1,padding:13,background:"#DC2626",color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer"}}>削除する</button>
        </div>
      </div>
    </div>
  );

  // ══ グローバルモーダル（どのページからでも使える）══
  if(modal==="cust") return(
    <Modal title="⚙ カスタマイズ" onClose={()=>setModal(null)} onSave={()=>{saveCustomize({...ec});setModal(null);}}>
      <Inp label="会社名" value={ec.name} onChange={e=>setEc({...ec,name:e.target.value})}/>
      <Inp label="システム名" value={ec.sys} onChange={e=>setEc({...ec,sys:e.target.value})}/>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,color:"#6B7280",marginBottom:6}}>バナーカラー</div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <input type="color" value={ec.c1} onChange={e=>setEc({...ec,c1:e.target.value})} style={{width:48,height:36,borderRadius:8,border:"1.5px solid #E5E7EB",cursor:"pointer",padding:2}}/>
          <span style={{color:"#9CA3AF"}}>→</span>
          <input type="color" value={ec.c2} onChange={e=>setEc({...ec,c2:e.target.value})} style={{width:48,height:36,borderRadius:8,border:"1.5px solid #E5E7EB",cursor:"pointer",padding:2}}/>
          <div style={{flex:1,height:36,borderRadius:8,background:`linear-gradient(135deg,${ec.c1},${ec.c2})`}}/>
        </div>
      </div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:11,color:"#6B7280",marginBottom:8}}>パネル表示設定（PC）</div>
        {[
          {key:"showSidebar",label:"左サイドバー",icon:"◀"},
          {key:"showRightPanel",label:"右パネル（KPI・タスク）",icon:"▶"},
          {key:"showLauncher",label:"🚀 ランチャーボタン",icon:"🚀"},
        ].map(item=>{
          const on=ec[item.key]!==false;
          return(
            <div key={item.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:on?"#F0F9FF":"#F9FAFB",borderRadius:10,marginBottom:8,border:`1.5px solid ${on?"#BFDBFE":"#E5E7EB"}`}}>
              <div style={{fontSize:13,fontWeight:600,color:"#1F2937"}}>{item.icon} {item.label}</div>
              <button onClick={()=>setEc({...ec,[item.key]:!on})}
                style={{width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",background:on?"#1A3A5C":"#D1D5DB",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:on?23:3,transition:"left 0.2s"}}/>
              </button>
            </div>
          );
        })}
      </div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:11,color:"#6B7280",marginBottom:8}}>DB一覧の表示・非表示</div>
        {tileConf.map(t=>(
          <div key={t.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",background:t.visible?"#F9FAFB":"#F3F4F6",borderRadius:10,marginBottom:6,border:`1.5px solid ${t.visible?"#E5E7EB":"#D1D5DB"}`,opacity:t.visible?1:0.6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>{t.icon}</span>
              <span style={{fontSize:13,fontWeight:600,color:"#1F2937"}}>{t.label}</span>
            </div>
            <button onClick={()=>saveTileConf(tileConf.map(x=>x.key===t.key?{...x,visible:!x.visible}:x))}
              style={{width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",background:t.visible?"#1A3A5C":"#D1D5DB",position:"relative",transition:"background 0.2s",flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:t.visible?23:3,transition:"left 0.2s"}}/>
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );

  // ══════════════════════════════════════════
  // HOME
  // ══════════════════════════════════════════
  if(page==="home"){
    const active=pjs.filter(p=>p.status!=="完了"&&p.status!=="中断");
    const tiles=tileConf.filter(t=>t.visible||tileEdit).map(t=>({...t,sub:t.key==="projects"?`${active.length}件進行中`:t.key==="companies"?`${cos.length}社登録`:t.key==="tasks"?`未完了 ${pending.length}件`:t.sub}));
    return(
      <div style={{fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",background:cust.bg,minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        {!isPC&&<div style={{background:cust.c1,color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
          <div style={{background:cust.acc,borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:16}}>I</div>
          <div style={{flex:1}}><div style={{fontWeight:800,fontSize:16}}>{cust.sys}</div><div style={{fontSize:10,opacity:0.65}}>{cust.name}</div></div>
          <button onClick={()=>{setEc({...cust});setModal("cust");}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer",fontWeight:700}}>⚙ 編集</button>
        </div>}
        <div style={{background:`linear-gradient(135deg,${cust.c1},${cust.c2})`,padding:"20px 20px 28px",margin:"0 0 -16px"}}>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.85)",marginBottom:4}}>{cust.name}</div>
          <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>{cust.sys}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4}}>案件 {pjs.length}件 ｜ 取引先 {cos.length}社</div>
        </div>
        <div style={{padding:isPC?"12px 0 20px":"28px 14px 30px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF"}}>DB一覧</div>
            <button onClick={()=>{if(tileEdit){saveTileConf(tileConf);}setTileEdit(!tileEdit);}} style={{fontSize:11,fontWeight:700,color:tileEdit?"#E07B39":"#9CA3AF",background:"none",border:"none",cursor:"pointer"}}>
              {tileEdit?"✅ 完了":"✏️ 並び替え・編集"}
            </button>
          </div>

          {/* ── PC：行リスト表示 ── */}
          {isPC&&!tileEdit&&(
            <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)",marginBottom:20}}>
              {tiles.filter(t=>t.visible).map((t,i,arr)=>(
                <button key={t.key} onClick={()=>{if(t.key==="chatgpt"){window.open("https://chatgpt.com","_blank");return;}nav(t.key);}}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:14,padding:"13px 18px",background:"none",border:"none",borderBottom:i<arr.length-1?"1px solid #F3F4F6":"none",cursor:"pointer",textAlign:"left",transition:"background 0.1s"}}
                  onMouseOver={e=>e.currentTarget.style.background="#F9FAFB"}
                  onMouseOut={e=>e.currentTarget.style.background="none"}>
                  <div style={{width:4,height:36,borderRadius:2,background:t.color,flexShrink:0}}/>
                  <span style={{fontSize:22,flexShrink:0}}>{t.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#1F2937"}}>{t.label}</div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:1}}>{t.sub}</div>
                  </div>
                  <div style={{fontSize:14,color:"#D1D5DB"}}>›</div>
                </button>
              ))}
            </div>
          )}

          {/* ── PC：編集モードのリスト ── */}
          {isPC&&tileEdit&&(
            <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)",marginBottom:20}}>
              {tiles.map((t,i)=>(
                <div key={t.key} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderBottom:i<tiles.length-1?"1px solid #F3F4F6":"none",opacity:t.visible?1:0.45}}>
                  <div style={{width:4,height:32,borderRadius:2,background:t.color,flexShrink:0}}/>
                  <span style={{fontSize:20,flexShrink:0}}>{t.icon}</span>
                  <div style={{flex:1,fontWeight:700,fontSize:13,color:"#1F2937"}}>{t.label}</div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{const pi=tileConf.findIndex(x=>x.key===t.key);if(pi>0){const n=[...tileConf];[n[pi],n[pi-1]]=[n[pi-1],n[pi]];saveTileConf(n);}}} style={{background:"#F3F4F6",border:"none",borderRadius:4,padding:"3px 8px",fontSize:12,cursor:"pointer"}}>↑</button>
                    <button onClick={()=>{const pi=tileConf.findIndex(x=>x.key===t.key);if(pi<tileConf.length-1){const n=[...tileConf];[n[pi],n[pi+1]]=[n[pi+1],n[pi]];saveTileConf(n);}}} style={{background:"#F3F4F6",border:"none",borderRadius:4,padding:"3px 8px",fontSize:12,cursor:"pointer"}}>↓</button>
                    <button onClick={()=>setEditTile({...t})} style={{background:"#EFF6FF",border:"none",borderRadius:4,padding:"3px 8px",fontSize:11,color:"#1A3A5C",cursor:"pointer"}}>✏️</button>
                    <button onClick={()=>saveTileConf(tileConf.map(x=>x.key===t.key?{...x,visible:!x.visible}:x))} style={{background:t.visible?"#FEF2F2":"#F0FDF4",border:"none",borderRadius:4,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>{t.visible?"🙈":"👁"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── スマホ：カードグリッド（従来通り）── */}
          {!isPC&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            {tiles.map((t)=>(
              <div key={t.key}>
                {tileEdit?(
                  <div style={{background:"#fff",border:`2px solid ${t.visible?"#E07B39":"#E5E7EB"}`,borderRadius:14,padding:"12px 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.07)",opacity:t.visible?1:0.5}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <span style={{fontSize:22}}>{t.icon}</span>
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>{const pi=tileConf.findIndex(x=>x.key===t.key);if(pi>0){const n=[...tileConf];[n[pi],n[pi-1]]=[n[pi-1],n[pi]];saveTileConf(n);}}} style={{background:"#F3F4F6",border:"none",borderRadius:4,padding:"2px 6px",fontSize:12,cursor:"pointer"}}>↑</button>
                        <button onClick={()=>{const pi=tileConf.findIndex(x=>x.key===t.key);if(pi<tileConf.length-1){const n=[...tileConf];[n[pi],n[pi+1]]=[n[pi+1],n[pi]];saveTileConf(n);}}} style={{background:"#F3F4F6",border:"none",borderRadius:4,padding:"2px 6px",fontSize:12,cursor:"pointer"}}>↓</button>
                        <button onClick={()=>setEditTile({...t})} style={{background:"#EFF6FF",border:"none",borderRadius:4,padding:"2px 6px",fontSize:11,color:"#1A3A5C",cursor:"pointer"}}>✏️</button>
                        <button onClick={()=>saveTileConf(tileConf.map(x=>x.key===t.key?{...x,visible:!x.visible}:x))} style={{background:t.visible?"#FEF2F2":"#F0FDF4",border:"none",borderRadius:4,padding:"2px 6px",fontSize:11,cursor:"pointer"}}>{t.visible?"🙈":"👁"}</button>
                      </div>
                    </div>
                    <div style={{fontWeight:800,fontSize:13,color:"#1F2937"}}>{t.label}</div>
                    <div style={{marginTop:8,height:3,borderRadius:2,background:t.color,width:"40%"}}/>
                  </div>
                ):(
                  <button onClick={()=>{if(t.key==="chatgpt"){window.open("https://chatgpt.com","_blank");return;}nav(t.key);}} style={{width:"100%",background:"#fff",border:"none",borderRadius:14,padding:"16px 14px",textAlign:"left",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
                    <div style={{fontSize:26,marginBottom:8}}>{t.icon}</div>
                    <div style={{fontWeight:800,fontSize:14,color:"#1F2937",marginBottom:2}}>{t.label}</div>
                    <div style={{fontSize:11,color:"#6B7280"}}>{t.sub}</div>
                    <div style={{marginTop:10,height:3,borderRadius:2,background:t.color,width:"40%"}}/>
                  </button>
                )}
              </div>
            ))}
          </div>}
          <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",marginBottom:10}}>直近のタスク</div>
          <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            {pending.slice(0,3).map((t,i)=>(
              <div key={t.id} style={{padding:"12px 16px",borderBottom:i<Math.min(pending.length,3)-1?"1px solid #F3F4F6":"none",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:PRIO[t.prio]?.c||"#9CA3AF",flexShrink:0}}/>
                <div style={{flex:1,fontSize:13,fontWeight:600,color:"#1F2937"}}>{t.title}</div>
                {t.due&&<div style={{fontSize:11,color:"#9CA3AF"}}>{t.due}</div>}
              </div>
            ))}
            {pending.length===0&&<div style={{padding:16,color:"#9CA3AF",fontSize:13,textAlign:"center"}}>タスクはありません</div>}
            <button onClick={()=>nav("tasks")} style={{width:"100%",padding:10,background:"#F9FAFB",border:"none",fontSize:12,color:cust.c1,fontWeight:700,cursor:"pointer",borderTop:"1px solid #F3F4F6"}}>すべて見る →</button>
          </div>
        </div>
        {editTile&&(<Modal title="タイルを編集" onClose={()=>setEditTile(null)} onSave={()=>{saveTileConf(tileConf.map(t=>t.key===editTile.key?editTile:t));setEditTile(null);}}><Inp label="アイコン" value={editTile.icon} onChange={e=>setEditTile({...editTile,icon:e.target.value})}/><Inp label="ラベル名" value={editTile.label} onChange={e=>setEditTile({...editTile,label:e.target.value})}/><div style={{marginBottom:10}}><div style={{fontSize:11,color:"#6B7280",marginBottom:6}}>カラー</div><div style={{display:"flex",gap:10,alignItems:"center"}}><input type="color" value={editTile.color} onChange={e=>setEditTile({...editTile,color:e.target.value})} style={{width:48,height:36,borderRadius:8,border:"1.5px solid #E5E7EB",cursor:"pointer",padding:2}}/><div style={{flex:1,height:36,borderRadius:8,background:editTile.color}}/></div></div></Modal>)}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // PROJECTS
  // ══════════════════════════════════════════
  if(page==="projects"){
    const tA=filtP.reduce((s,p)=>s+(p.amount||0),0);
    const tG=filtP.reduce((s,p)=>s+(p.gp||0),0);
    return(
      <div style={{fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <Hdr title={selP?selP.name:"📋 案件管理"} back={selP?()=>setSelP(null):()=>nav("home")}
          right={<div style={{display:"flex",gap:6}}>{!selP&&<button onClick={()=>setModal("addP")} style={{background:"#E07B39",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:800}}>＋ 新規</button>}</div>}/>
        {selP?(
          <div style={{padding:isPC?"14px 0":14}}>
            {editP?(
              /* ── 編集モード ── */
              <div style={{background:"#fff",borderRadius:14,padding:18,boxShadow:"0 2px 10px rgba(0,0,0,0.08)"}}>
                <div style={{fontWeight:800,fontSize:15,color:"#1A3A5C",marginBottom:14}}>✏️ 案件を編集</div>
                <Inp label="案件名 *" value={editP.name} onChange={e=>setEditP({...editP,name:e.target.value})}/>
                <Sel label="ステータス" opts={STATUSES} value={editP.status} onChange={e=>setEditP({...editP,status:e.target.value})}/>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>取引先</div>
                  <select value={editP.clientId||""} onChange={e=>setEditP({...editP,clientId:e.target.value})} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,background:"#FAFAFA",boxSizing:"border-box",color:"#1F2937"}}>
                    <option value="">未設定</option>
                    {cos.filter(c=>c.type==="取引先").map(c=><option key={c.id} value={c.id}>{c.name}{c.branch?" "+c.branch:""}</option>)}
                  </select>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>協力業者（複数選択可）</div>
                  <div style={{background:"#F9FAFB",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"6px 8px",maxHeight:160,overflowY:"auto"}}>
                    {cos.filter(c=>c.type==="協力業者").map(c=>{
                      const sel=(editP.subIds||[]).includes(c.id);
                      return(<label key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 6px",cursor:"pointer",borderRadius:6,background:sel?"#EFF6FF":"transparent"}}>
                        <input type="checkbox" checked={sel} onChange={()=>setEditP({...editP,subIds:sel?(editP.subIds||[]).filter(id=>id!==c.id):[...(editP.subIds||[]),c.id]})} style={{width:16,height:16,accentColor:"#1A3A5C",cursor:"pointer"}}/>
                        <span style={{fontSize:13,color:"#1F2937",fontWeight:sel?700:400}}>{c.name}{c.branch?" "+c.branch:""}</span>
                      </label>);
                    })}
                    {cos.filter(c=>c.type==="協力業者").length===0&&<div style={{fontSize:12,color:"#9CA3AF",padding:"4px 6px"}}>協力業者が登録されていません</div>}
                  </div>
                </div>
                <Inp label="社内担当" value={editP.inCharge||""} onChange={e=>setEditP({...editP,inCharge:e.target.value})}/>
                <Inp label="営業担当" value={editP.salesRep||""} onChange={e=>setEditP({...editP,salesRep:e.target.value})}/>
                <Inp label="受注金額" type="number" value={editP.amount||""} onChange={e=>setEditP({...editP,amount:e.target.value})}/>
                <Inp label="粗利" type="number" value={editP.gp||""} onChange={e=>setEditP({...editP,gp:e.target.value})}/>
                <Inp label="見積提出日" type="date" value={editP.qDate||""} onChange={e=>setEditP({...editP,qDate:e.target.value})}/>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>備考</div>
                  <textarea value={editP.memo||""} onChange={e=>setEditP({...editP,memo:e.target.value})} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,resize:"vertical",minHeight:60,boxSizing:"border-box",background:"#FAFAFA",color:"#1F2937"}}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEditP(null)} style={{flex:1,padding:"12px 0",background:"#F3F4F6",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",color:"#374151"}}>キャンセル</button>
                  <button onClick={updatePj} style={{flex:2,padding:"12px 0",background:"#1A3A5C",color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer"}}>💾 保存する</button>
                </div>
              </div>
            ):(
              /* ── 閲覧モード ── */
              <div style={{background:"#fff",borderRadius:14,padding:18,boxShadow:"0 2px 10px rgba(0,0,0,0.08)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div style={{fontWeight:800,fontSize:17,flex:1,marginRight:8,color:"#1F2937"}}>{selP.name}</div>
                  <Badge s={selP.status}/>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  <button onClick={()=>setEditP({...selP})} style={{flex:2,padding:"8px 0",background:"#EFF6FF",color:"#1A3A5C",border:"1.5px solid #BFDBFE",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>✏️ 編集</button>
                  <button onClick={()=>setConf({msg:`「${selP.name}」を削除しますか？`,onOk:()=>{delPj(selP.id);setConf(null);}})} style={{flex:1,padding:"8px 0",background:"#FEF2F2",color:"#DC2626",border:"1.5px solid #FECACA",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>🗑 削除</button>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  <div style={{flex:1,background:"#FFF7ED",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:10,color:"#9CA3AF"}}>受注金額</div><div style={{fontSize:16,fontWeight:800,color:"#E07B39"}}>{fmt(selP.amount)}</div></div>
                  <div style={{flex:1,background:"#F0FDF4",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:10,color:"#9CA3AF"}}>粗利 / 粗利率</div><div style={{fontSize:14,fontWeight:800,color:"#059669"}}>{fmt(selP.gp)}</div><div style={{fontSize:11,color:"#059669"}}>{pct(selP.gp,selP.amount)}</div></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:12}}>
                  {[["ステータス",selP.status],["社内担当",selP.inCharge],["営業担当",selP.salesRep],["見積提出日",selP.qDate]].map(([l,v])=>(
                    <div key={l} style={{marginBottom:8}}><div style={{fontSize:10,color:"#9CA3AF",marginBottom:2}}>{l}</div><div style={{fontSize:13,fontWeight:600,color:"#1F2937"}}>{v||"—"}</div></div>
                  ))}
                </div>
                {selP.memo&&<div style={{background:"#F9FAFB",borderRadius:8,padding:"8px 12px",fontSize:13,color:"#374151",marginBottom:12}}>📝 {selP.memo}</div>}
                <div style={{borderTop:"1px solid #F3F4F6",paddingTop:14,marginBottom:12}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#1A3A5C",marginBottom:8}}>🏢 取引先</div>
                  {getC(selP.clientId)?(<div style={{background:"#F0F4F8",borderRadius:10,padding:"10px 12px"}}><div style={{fontWeight:700,color:"#1F2937"}}>{getC(selP.clientId).name}{getC(selP.clientId).branch?` ${getC(selP.clientId).branch}`:""}</div></div>):<div style={{color:"#9CA3AF",fontSize:13}}>未設定</div>}
                </div>
                {(selP.subIds||[]).length>0&&(
                  <div style={{borderTop:"1px solid #F3F4F6",paddingTop:14}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#1A3A5C",marginBottom:8}}>🔧 協力業者</div>
                    {(selP.subIds||[]).map(id=>{const c=getC(id);return c?(<div key={id} style={{background:"#F0F4F8",borderRadius:10,padding:"10px 12px",marginBottom:6}}><div style={{fontWeight:700,fontSize:13,color:"#1F2937"}}>{c.name}{c.branch?` ${c.branch}`:""}</div><div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{c.type}</div></div>):null;})}
                  </div>
                )}
              </div>
            )}
          </div>
        ):(
          <div style={{padding:isPC?"14px 0":14}}>
            <input value={schP} onChange={e=>setSchP(e.target.value)} placeholder="🔍 案件名・取引先で検索" style={{width:"100%",padding:"9px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:13,background:"#fff",boxSizing:"border-box",marginBottom:10,color:"#1F2937"}}/>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,marginBottom:8}}>
              {["すべて",...STATUSES].map(s=>(<button key={s} onClick={()=>setFltS(s)} style={{padding:"4px 12px",borderRadius:16,border:"1.5px solid",whiteSpace:"nowrap",borderColor:fltS===s?"#1A3A5C":"#D1D5DB",background:fltS===s?"#1A3A5C":"#fff",color:fltS===s?"#fff":"#374151",fontSize:11,fontWeight:700,cursor:"pointer"}}>{s}</button>))}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[["件数",`${filtP.length}件`],["受注合計",fmt(tA)],["粗利合計",fmt(tG)]].map(([l,v])=>(<div key={l} style={{flex:1,background:"#fff",borderRadius:10,padding:"8px 10px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}><div style={{fontSize:10,color:"#9CA3AF"}}>{l}</div><div style={{fontSize:12,fontWeight:800,color:"#1A3A5C",marginTop:1}}>{v}</div></div>))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {filtP.map(p=>{const cl=getC(p.clientId);const gp=p.amount?((p.gp/p.amount)*100).toFixed(1):null;return(
                <div key={p.id} style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 6px rgba(0,0,0,0.07)",borderLeft:"4px solid #1A3A5C",overflow:"hidden"}}>
                  <div onClick={()=>setSelP(p)} style={{padding:"13px 14px",cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}><div style={{fontWeight:700,fontSize:14,flex:1,marginRight:8,color:"#1F2937"}}>{p.name}</div><Badge s={p.status}/></div>
                    <div style={{fontSize:12,color:"#6B7280",marginBottom:4}}>{cl?`🏢 ${cl.name}${cl.branch?" "+cl.branch:""}` :"取引先未設定"}</div>
                    <div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontSize:14,fontWeight:800,color:"#E07B39"}}>{fmt(p.amount)}</div>{gp&&<div style={{fontSize:11,color:"#059669",fontWeight:700}}>粗利率 {gp}%</div>}</div>
                  </div>
                  <div style={{display:"flex",borderTop:"1px solid #F3F4F6"}}>
                    <button onClick={()=>setSelP(p)} style={{flex:1,padding:"8px 0",background:"none",border:"none",borderRight:"1px solid #F3F4F6",fontSize:12,color:"#1A3A5C",fontWeight:700,cursor:"pointer"}}>詳細 →</button>
                    <button onClick={()=>setConf({msg:`「${p.name}」を削除しますか？`,onOk:()=>{delPj(p.id);setConf(null);}})} style={{padding:"8px 16px",background:"none",border:"none",fontSize:12,color:"#DC2626",fontWeight:700,cursor:"pointer"}}>🗑</button>
                  </div>
                </div>
              );})}
            </div>
          </div>
        )}
        {modal==="addP"&&(<Modal title="新規案件を追加" onClose={()=>setModal(null)} onSave={savePj}><Inp label="案件名 *" value={nP.name} onChange={e=>setNP({...nP,name:e.target.value})} placeholder="例: ○○マンション改修工事"/><Sel label="ステータス" opts={STATUSES} value={nP.status} onChange={e=>setNP({...nP,status:e.target.value})}/><div style={{marginBottom:10}}><div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>取引先</div><select value={nP.clientId} onChange={e=>setNP({...nP,clientId:e.target.value})} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,background:"#FAFAFA",boxSizing:"border-box",color:"#1F2937"}}><option value="">選択してください</option>{cos.filter(c=>c.type==="取引先").map(c=><option key={c.id} value={c.id}>{c.name}{c.branch?" "+c.branch:""}</option>)}</select></div><div style={{marginBottom:10}}><div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>協力業者（複数選択可）</div><div style={{background:"#F9FAFB",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"6px 8px",maxHeight:140,overflowY:"auto"}}>{cos.filter(c=>c.type==="協力業者").map(c=>{const sel=(nP.subIds||[]).includes(c.id);return(<label key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 6px",cursor:"pointer",borderRadius:6,background:sel?"#EFF6FF":"transparent"}}><input type="checkbox" checked={sel} onChange={()=>setNP({...nP,subIds:sel?(nP.subIds||[]).filter(id=>id!==c.id):[...(nP.subIds||[]),c.id]})} style={{width:16,height:16,accentColor:"#1A3A5C",cursor:"pointer"}}/><span style={{fontSize:13,color:"#1F2937",fontWeight:sel?700:400}}>{c.name}{c.branch?" "+c.branch:""}</span></label>);})} {cos.filter(c=>c.type==="協力業者").length===0&&<div style={{fontSize:12,color:"#9CA3AF",padding:"4px 6px"}}>協力業者が未登録です</div>}</div></div><Inp label="社内担当" value={nP.inCharge} onChange={e=>setNP({...nP,inCharge:e.target.value})}/><Inp label="営業担当" value={nP.salesRep} onChange={e=>setNP({...nP,salesRep:e.target.value})}/><Inp label="受注金額" type="number" value={nP.amount} onChange={e=>setNP({...nP,amount:e.target.value})}/><Inp label="粗利" type="number" value={nP.gp} onChange={e=>setNP({...nP,gp:e.target.value})}/><Inp label="見積提出日" type="date" value={nP.qDate} onChange={e=>setNP({...nP,qDate:e.target.value})}/><div style={{marginBottom:10}}><div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>備考</div><textarea value={nP.memo} onChange={e=>setNP({...nP,memo:e.target.value})} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,resize:"vertical",minHeight:60,boxSizing:"border-box",background:"#FAFAFA",color:"#1F2937"}}/></div></Modal>)}
        {conf&&<Confirm msg={conf.msg} onCancel={()=>setConf(null)} onOk={conf.onOk}/>}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // COMPANIES
  // ══════════════════════════════════════════
  if(page==="companies"){
    return(
      <div style={{fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <Hdr title={selCt?selCt.name:selC?selC.name:"🏢 取引先・協力業者"} back={selCt?()=>setSelCt(null):selC?()=>setSelC(null):()=>nav("home")}
          right={<div style={{display:"flex",gap:6}}>{!selC&&!selCt&&<button onClick={()=>setModal("addCo")} style={{background:"#E07B39",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:800}}>＋ 新規</button>}</div>}/>
        {selCt?(
          <div style={{padding:isPC?"14px 0":14}}>
            <div style={{background:"#fff",borderRadius:14,padding:18,boxShadow:"0 2px 10px rgba(0,0,0,0.08)"}}>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                <div style={{width:52,height:52,borderRadius:"50%",background:"#1A3A5C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#fff",fontWeight:800}}>{selCt.name.charAt(0)}</div>
                <div><div style={{fontWeight:800,fontSize:18,color:"#1F2937"}}>{selCt.name}</div><div style={{fontSize:12,color:"#6B7280"}}>{selC?.name} · {selCt.role}</div></div>
              </div>
              {selCt.tel&&<a href={`tel:${selCt.tel}`} style={{display:"flex",alignItems:"center",gap:12,background:"#F0F4F8",borderRadius:10,padding:"12px 14px",textDecoration:"none",color:"#1F2937",marginBottom:8}}><span style={{fontSize:20}}>📞</span><div style={{flex:1}}><div style={{fontSize:11,color:"#6B7280",marginBottom:2}}>電話番号</div><div style={{fontWeight:700,fontSize:14}}>{selCt.tel}</div></div><span style={{color:"#1A3A5C",fontWeight:700}}>発信</span></a>}
              {selCt.email&&<a href={`mailto:${selCt.email}`} style={{display:"flex",alignItems:"center",gap:12,background:"#F0F4F8",borderRadius:10,padding:"12px 14px",textDecoration:"none",color:"#1F2937",marginBottom:8}}><span style={{fontSize:20}}>✉️</span><div style={{flex:1}}><div style={{fontSize:11,color:"#6B7280",marginBottom:2}}>メール</div><div style={{fontWeight:700,fontSize:14}}>{selCt.email}</div></div><span style={{color:"#1A3A5C",fontWeight:700}}>送信</span></a>}
            </div>
          </div>
        ):selC?(
          <div style={{padding:isPC?"14px 0":14}}>
            <div style={{background:"#fff",borderRadius:14,padding:18,boxShadow:"0 2px 10px rgba(0,0,0,0.08)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                <div style={{fontWeight:800,fontSize:18,color:"#1F2937"}}>{selC.name}{selC.branch?` ${selC.branch}`:""}</div>
                <button onClick={()=>{setEditCoForm({name:selC.name,branch:selC.branch||"",type:selC.type});setModal("editCo");}} style={{background:"#EFF6FF",border:"1.5px solid #BFDBFE",color:"#1A3A5C",borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✏️ 編集</button>
              </div>
              <div style={{fontSize:12,color:"#6B7280",marginBottom:16}}>{selC.type}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:13,color:"#1A3A5C"}}>👤 担当者</div>
                <button onClick={()=>setModal("addCt")} style={{padding:"4px 12px",borderRadius:14,background:"#E07B39",color:"#fff",border:"none",fontWeight:700,fontSize:11,cursor:"pointer"}}>＋ 追加</button>
              </div>
              {(selC.contacts||[]).length===0&&<div style={{color:"#9CA3AF",fontSize:13,marginBottom:14}}>担当者が未登録です</div>}
              {[...new Set((selC.contacts||[]).map(ct=>ct.role))].map(role=>(
                <div key={role} style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6B7280",borderLeft:"3px solid #E07B39",paddingLeft:7,marginBottom:6}}>{role}</div>
                  {(selC.contacts||[]).filter(ct=>ct.role===role).map(ct=>(
                    <div key={ct.id} onClick={()=>setSelCt(ct)} style={{background:"#F9FAFB",borderRadius:8,padding:"10px 12px",marginBottom:5,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:"#1A3A5C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:"#fff",fontWeight:800}}>{ct.name.charAt(0)}</div>
                      <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:"#1F2937"}}>{ct.name}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{[ct.tel,ct.email].filter(Boolean).join(" · ")||"連絡先未登録"}</div></div>
                      <span style={{color:"#9CA3AF",fontSize:14}}>›</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{borderTop:"1px solid #F3F4F6",paddingTop:14}}>
                <div style={{fontWeight:700,fontSize:13,color:"#1A3A5C",marginBottom:8}}>📋 関連案件</div>
                {getPF(selC.id).length===0&&<div style={{color:"#9CA3AF",fontSize:13}}>案件なし</div>}
                {getPF(selC.id).map(p=>(<div key={p.id} style={{background:"#F0F4F8",borderRadius:8,padding:"9px 12px",marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontWeight:600,fontSize:13,color:"#1F2937"}}>{p.name}</div><Badge s={p.status}/></div><div style={{fontSize:12,color:"#E07B39",fontWeight:700,marginTop:2}}>{fmt(p.amount)}</div></div>))}
              </div>
            </div>
          </div>
        ):(
          <div style={{padding:isPC?"14px 0":14}}>
            <input value={schC} onChange={e=>setSchC(e.target.value)} placeholder="🔍 会社名で検索" style={{width:"100%",padding:"9px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:13,background:"#fff",boxSizing:"border-box",marginBottom:10,color:"#1F2937"}}/>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,marginBottom:8}}>
              {["すべて",...COMPANY_TYPES].map(t=>(<button key={t} onClick={()=>setFltT(t)} style={{padding:"4px 12px",borderRadius:16,border:"1.5px solid",whiteSpace:"nowrap",borderColor:fltT===t?"#1A3A5C":"#D1D5DB",background:fltT===t?"#1A3A5C":"#fff",color:fltT===t?"#fff":"#374151",fontSize:11,fontWeight:700,cursor:"pointer"}}>{t}</button>))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {filtC.map(c=>(<div key={c.id} style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 6px rgba(0,0,0,0.07)",borderLeft:"4px solid #E07B39",overflow:"hidden"}}>
                <div onClick={()=>setSelC(c)} style={{padding:"13px 14px",cursor:"pointer"}}>
                  <div style={{fontWeight:700,fontSize:14,color:"#1F2937"}}>{c.name}{c.branch?` ${c.branch}`:""}</div>
                  <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{c.type} ｜ 担当者 {(c.contacts||[]).length}名</div>
                  <div style={{fontSize:11,color:"#1A3A5C",marginTop:3}}>案件 {getPF(c.id).length}件</div>
                </div>
                <div style={{display:"flex",borderTop:"1px solid #F3F4F6"}}>
                  <button onClick={()=>setSelC(c)} style={{flex:1,padding:"8px 0",background:"none",border:"none",borderRight:"1px solid #F3F4F6",fontSize:12,color:"#1A3A5C",fontWeight:700,cursor:"pointer"}}>詳細 →</button>
                  <button onClick={()=>setConf({msg:`「${c.name}」を削除しますか？`,onOk:()=>{delCo(c.id);setConf(null);}})} style={{padding:"8px 16px",background:"none",border:"none",fontSize:12,color:"#DC2626",fontWeight:700,cursor:"pointer"}}>🗑</button>
                </div>
              </div>))}
            </div>
          </div>
        )}
        {modal==="editCo"&&(<Modal title="取引先を編集" onClose={()=>setModal(null)} onSave={()=>{updateCo(selC.id,{name:editCoForm.name,branch:editCoForm.branch,type:editCoForm.type});setModal(null);}}><Inp label="会社名 *" value={editCoForm.name} onChange={e=>setEditCoForm({...editCoForm,name:e.target.value})}/><Inp label="支店" value={editCoForm.branch} onChange={e=>setEditCoForm({...editCoForm,branch:e.target.value})}/><Sel label="種別" opts={COMPANY_TYPES} value={editCoForm.type} onChange={e=>setEditCoForm({...editCoForm,type:e.target.value})}/></Modal>)}
        {modal==="addCo"&&(<Modal title="新規取引先を追加" onClose={()=>setModal(null)} onSave={saveCo}><Inp label="会社名 *" value={nCo.name} onChange={e=>setNCo({...nCo,name:e.target.value})} placeholder="例: 山田工業"/><Inp label="支店" value={nCo.branch} onChange={e=>setNCo({...nCo,branch:e.target.value})}/><Sel label="種別" opts={COMPANY_TYPES} value={nCo.type} onChange={e=>setNCo({...nCo,type:e.target.value})}/></Modal>)}
        {modal==="addCt"&&(<Modal title="担当者を追加" onClose={()=>setModal(null)} onSave={saveCt}><Inp label="担当者名 *" value={nCt.name} onChange={e=>setNCt({...nCt,name:e.target.value})}/><Sel label="役割" opts={CONTACT_ROLES} value={nCt.role} onChange={e=>setNCt({...nCt,role:e.target.value})}/><Inp label="電話番号" value={nCt.tel} onChange={e=>setNCt({...nCt,tel:e.target.value})}/><Inp label="メール" value={nCt.email} onChange={e=>setNCt({...nCt,email:e.target.value})}/></Modal>)}
        {conf&&<Confirm msg={conf.msg} onCancel={()=>setConf(null)} onOk={conf.onOk}/>}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════
  if(page==="tasks"){
    const done=tks.filter(t=>t.done);
    return(
      <div style={{fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <Hdr title="✅ タスク" back={()=>nav("home")} right={<button onClick={()=>setModal("addT")} style={{background:"#E07B39",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:800}}>＋ 新規</button>}/>
        <div style={{padding:isPC?"14px 0":14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",marginBottom:8}}>未完了 ({pending.length})</div>
          {pending.map(t=>(<div key={t.id} style={{background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,0.07)",display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>togTk(t)} style={{width:22,height:22,borderRadius:"50%",border:"2px solid #D1D5DB",background:"#fff",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:"#1F2937"}}>{t.title}</div>{t.due&&<div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>📅 {t.due}</div>}</div>
            <div style={{fontSize:11,fontWeight:700,color:PRIO[t.prio]?.c}}>{PRIO[t.prio]?.l}</div>
            <button onClick={()=>setConf({msg:`「${t.title}」を削除しますか？`,onOk:()=>{delTk(t.id);setConf(null);}})} style={{background:"none",border:"none",color:"#DC2626",fontSize:14,cursor:"pointer"}}>🗑</button>
          </div>))}
          {done.length>0&&<><div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",marginBottom:8,marginTop:16}}>完了済み ({done.length})</div>
          {done.map(t=>(<div key={t.id} style={{background:"#F9FAFB",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12,opacity:0.6}}>
            <button onClick={()=>togTk(t)} style={{width:22,height:22,borderRadius:"50%",border:"none",background:"#10B981",cursor:"pointer",flexShrink:0,color:"#fff",fontSize:13}}>✓</button>
            <div style={{flex:1,textDecoration:"line-through",fontSize:13,color:"#6B7280"}}>{t.title}</div>
            <button onClick={()=>setConf({msg:`「${t.title}」を削除しますか？`,onOk:()=>{delTk(t.id);setConf(null);}})} style={{background:"none",border:"none",color:"#DC2626",fontSize:14,cursor:"pointer"}}>🗑</button>
          </div>))}</>}
        </div>
        {modal==="addT"&&(<Modal title="タスクを追加" onClose={()=>setModal(null)} onSave={saveTk}><Inp label="タスク名 *" value={nTk.title} onChange={e=>setNTk({...nTk,title:e.target.value})} placeholder="例: 東洋住宅へ見積提出"/><Inp label="期限" type="date" value={nTk.due} onChange={e=>setNTk({...nTk,due:e.target.value})}/><Sel label="優先度" opts={["high","mid","low"]} value={nTk.prio} onChange={e=>setNTk({...nTk,prio:e.target.value})}/></Modal>)}
        {conf&&<Confirm msg={conf.msg} onCancel={()=>setConf(null)} onOk={conf.onOk}/>}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // LINKS（Supabase保存版）
  // ══════════════════════════════════════════
  if(page==="links"){
    const cats=[...new Set(links.map(l=>l.cat))];
    return(
      <div style={{fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <Hdr title="🔗 リンク集" back={()=>nav("home")} right={<button onClick={()=>setModal("addL")} style={{background:"#E07B39",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:800}}>＋ 新規</button>}/>
        <div style={{padding:isPC?"14px 0":14}}>
          {cats.map(cat=>{const cl=links.filter(l=>l.cat===cat);return(<div key={cat} style={{marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:800,color:"#6B7280",marginBottom:8}}>🔗 {cat}</div>
            <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
              {cl.map((l,i)=>(<div key={l.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<cl.length-1?"1px solid #F3F4F6":"none"}}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:12,flex:1,textDecoration:"none",color:"#1F2937",minWidth:0}}>
                  <span style={{fontSize:24,flexShrink:0}}>{l.icon}</span>
                  <div style={{minWidth:0,flex:1}}><div style={{fontWeight:700,fontSize:14,color:"#1F2937"}}>{l.label}</div><div style={{fontSize:11,color:"#9CA3AF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.url.replace("https://","").substring(0,28)}</div></div>
                  <span style={{color:"#9CA3AF",flexShrink:0}}>↗</span>
                </a>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>setEditLnk({...l})} style={{background:"#EFF6FF",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,color:"#1A3A5C",fontWeight:700,cursor:"pointer"}}>✏️</button>
                  <button onClick={()=>deleteLink(l.id)} style={{background:"#FEF2F2",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,color:"#DC2626",fontWeight:700,cursor:"pointer"}}>🗑</button>
                </div>
              </div>))}
            </div>
          </div>);})}
        </div>
        {modal==="addL"&&(<Modal title="🔗 リンクを追加" onClose={()=>setModal(null)} onSave={()=>{if(!newLnk.label||!newLnk.url)return;addLink(newLnk);setNewLnk({label:"",url:"",icon:"🔗",cat:"ツール・サービス"});setModal(null);}}><Inp label="アイコン" value={newLnk.icon} onChange={e=>setNewLnk({...newLnk,icon:e.target.value})}/><Inp label="名前 *" value={newLnk.label} onChange={e=>setNewLnk({...newLnk,label:e.target.value})} placeholder="例: Google Drive"/><Inp label="URL *" value={newLnk.url} onChange={e=>setNewLnk({...newLnk,url:e.target.value})} placeholder="https://..."/><Inp label="カテゴリ" value={newLnk.cat} onChange={e=>setNewLnk({...newLnk,cat:e.target.value})}/></Modal>)}
        {editLnk&&(<Modal title="🔗 リンクを編集" onClose={()=>setEditLnk(null)} onSave={()=>{updateLink(editLnk);setEditLnk(null);}}><Inp label="アイコン" value={editLnk.icon} onChange={e=>setEditLnk({...editLnk,icon:e.target.value})}/><Inp label="名前" value={editLnk.label} onChange={e=>setEditLnk({...editLnk,label:e.target.value})}/><Inp label="URL" value={editLnk.url} onChange={e=>setEditLnk({...editLnk,url:e.target.value})}/><Inp label="カテゴリ" value={editLnk.cat} onChange={e=>setEditLnk({...editLnk,cat:e.target.value})}/></Modal>)}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // FINANCE
  // ══════════════════════════════════════════
  if(page==="finance"){
    const now=new Date(),cy=now.getFullYear(),cm=now.getMonth()+1;
    const allItems=[...DEFAULT_FINANCE_ITEMS,...finFolders.map(f=>({id:f.id,label:f.label,icon:f.icon,isCustom:true}))];

    const PwUI=()=>{if(!pwMod)return null;const isSC=pwMod.mode==="set"||pwMod.mode==="change";return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"flex-end"}}><div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:24,width:"100%",boxSizing:"border-box"}}><div style={{fontWeight:800,fontSize:16,marginBottom:6,color:"#1F2937"}}>{isSC?"🔐 設定":"🔒 入力"}</div><input type="password" value={pwIn} onChange={e=>{setPwIn(e.target.value);setPwErr("");}} placeholder="パスワード" style={{width:"100%",padding:"12px 14px",borderRadius:10,border:pwErr?"2px solid #DC2626":"1.5px solid #E5E7EB",fontSize:16,boxSizing:"border-box",marginBottom:4,color:"#1F2937"}}/>{pwErr&&<div style={{color:"#DC2626",fontSize:12,marginBottom:8}}>{pwErr}</div>}<div style={{display:"flex",gap:10,marginTop:12}}><button onClick={()=>{setPwMod(null);setPwIn("");setPwErr("");}} style={{flex:1,padding:12,background:"#F3F4F6",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer"}}>キャンセル</button><button onClick={()=>{if(!pwIn){setPwErr("入力してください");return;}if(isSC){setPws(p=>({...p,[pwMod.id]:pwIn}));setPwMod(null);setPwIn("");setPwErr("");}else{if(pwIn===pws[pwMod.id]){setUnl(p=>({...p,[pwMod.id]:true}));setFinItem(allItems.find(f=>f.id===pwMod.id));setPwMod(null);setPwIn("");setPwErr("");}else setPwErr("パスワードが違います");}}} style={{flex:1,padding:12,background:"#1A3A5C",color:"#fff",border:"none",borderRadius:10,fontWeight:800,cursor:"pointer"}}>{isSC?"設定する":"開く"}</button></div></div></div>);};

    const isPDF=f=>f.type==="application/pdf"||f.name?.toLowerCase().endsWith(".pdf");
    const isImg=f=>f.type?.startsWith("image/");
    const isExcel=f=>f.name?.match(/\.(xlsx|xls)$/i);
    const isWord=f=>f.name?.match(/\.(docx|doc)$/i);
    const fileIcon=f=>isImg(f)?"🖼":isPDF(f)?"📕":isExcel(f)?"📗":isWord(f)?"📘":"📄";

    if(finPrev)return(
      <div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#1A1A2E",minHeight:"100vh",display:"flex",flexDirection:"column",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        {/* ヘッダー */}
        <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <button onClick={()=>setFinPrev(null)} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer"}}>←</button>
          <div style={{flex:1,fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{finPrev.name}</div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {finPrev.url&&<a href={finPrev.url} download={finPrev.name} target="_blank" rel="noopener noreferrer" style={{background:"#E07B39",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>⬇ 保存</a>}
            <button onClick={()=>setFileDel({name:finPrev.name,onDelete:()=>deleteFinFile(finPrev.id)})} style={{background:"rgba(220,38,38,0.8)",color:"#fff",borderRadius:8,padding:"5px 10px",fontSize:12,fontWeight:700,border:"none",cursor:"pointer"}}>🗑 削除</button>
          </div>
        </div>
        {/* プレビュー本体 */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {(finPrev.url||finPrev.data)?(
            isImg(finPrev)
              ?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                <img src={finPrev.url||finPrev.data} style={{maxWidth:"100%",maxHeight:"100%",borderRadius:8,objectFit:"contain"}} alt={finPrev.name}/>
              </div>
            :isPDF(finPrev)
              ?finPrev.url
                ?<iframe src={finPrev.url} style={{flex:1,width:"100%",border:"none",background:"#fff"}} title={finPrev.name}/>
                :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#fff",textAlign:"center",padding:32}}><div style={{fontSize:72,marginBottom:16}}>📕</div><div style={{fontSize:15,fontWeight:700,marginBottom:6}}>{finPrev.name}</div><div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginBottom:24}}>古い形式のPDFです</div><a href={finPrev.data} download={finPrev.name} style={{display:"block",width:"100%",padding:"16px 0",background:"#E07B39",color:"#fff",borderRadius:12,fontWeight:800,fontSize:16,cursor:"pointer",textDecoration:"none",textAlign:"center",boxSizing:"border-box"}}>⬇ PDFをダウンロード</a></div></div>
            :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{color:"#fff",textAlign:"center",padding:32}}>
                <div style={{fontSize:72,marginBottom:16}}>{fileIcon(finPrev)}</div>
                <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>{finPrev.name}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginBottom:24}}>{finPrev.size?`${(finPrev.size/1024).toFixed(0)}KB`:""}</div>
                <a href={finPrev.url} download={finPrev.name} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",background:"#E07B39",color:"#fff",padding:"14px 32px",borderRadius:12,fontWeight:800,fontSize:15,textDecoration:"none",marginBottom:12}}>⬇ ダウンロード</a>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>ブラウザでは直接プレビューできないファイル形式です</div>
              </div>
            </div>
          ):<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>⏳</div><div>読み込み中...</div></div></div>}
        </div>
        {conf&&<Confirm msg={conf.msg} onCancel={()=>setConf(null)} onOk={conf.onOk}/>}
      </div>
    );

    if(finM){
      const monthFiles=finFiles.filter(f=>f.item_id===finItem.id&&Number(f.year)===Number(finY)&&Number(f.month)===Number(finM));
      return(
        <div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
          {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
          <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
            <button onClick={()=>setFinM(null)} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer"}}>←</button>
            <div style={{flex:1}}><div style={{fontWeight:800,fontSize:15}}>{finItem.icon} {finItem.label}</div><div style={{fontSize:11,opacity:0.7}}>{finY}年{finM}月</div></div>
            <label style={{background:"#E07B39",color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              ＋ 追加
              <input type="file" accept="image/*,application/pdf,.xlsx,.docx,.xls,.doc" multiple onChange={async e=>{for(const f of Array.from(e.target.files)){await uploadFinFile(f,finItem.id,finY,finM);}}} style={{display:"none"}}/>
            </label>
          </div>
          <div style={{padding:isPC?"14px 0":14}}>
            {monthFiles.length===0?<div style={{textAlign:"center",padding:40,color:"#9CA3AF"}}><div style={{fontSize:48,marginBottom:12}}>📂</div><div style={{fontSize:14}}>ファイルがありません</div><div style={{fontSize:12,marginTop:4,color:"#9CA3AF"}}>右上の「＋ 追加」からアップロード</div></div>
              :monthFiles.map(f=>(
                <div key={f.id} style={{background:"#fff",borderRadius:12,marginBottom:8,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",cursor:"pointer"}}
                    onClick={async()=>{
                      if(f.url){setFinPrev(f);}
                      else{const {data}=await supabase.from("finance_files").select("*").eq("id",f.id).single();if(data)setFinPrev(data);}
                    }}>
                    <span style={{fontSize:28,flexShrink:0}}>{fileIcon(f)}</span>
                    <div style={{flex:1,overflow:"hidden"}}>
                      <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#1F2937"}}>{f.name}</div>
                      <div style={{fontSize:11,color:"#9CA3AF"}}>{f.size?`${(f.size/1024).toFixed(0)}KB`:""}</div>
                    </div>
                    <span style={{color:"#9CA3AF",fontSize:14,flexShrink:0}}>›</span>
                  </div>
                  <div style={{display:"flex",borderTop:"1px solid #F3F4F6"}}>
                    {f.url&&<a href={f.url} download={f.name} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:"8px 0",display:"flex",alignItems:"center",justifyContent:"center",borderRight:"1px solid #F3F4F6",fontSize:12,color:"#059669",fontWeight:700,textDecoration:"none"}}>⬇ 保存</a>}
                    <button onClick={()=>setFileDel({name:f.name,onDelete:()=>deleteFinFile(f.id)})} style={{flex:1,padding:"8px 0",background:"none",border:"none",fontSize:12,color:"#DC2626",fontWeight:700,cursor:"pointer"}}>🗑 削除</button>
                  </div>
                </div>
              ))}
          </div>
        </div>
        {conf&&<Confirm msg={conf.msg} onCancel={()=>setConf(null)} onOk={conf.onOk}/>}
      );
    }

    if(finY)return(
      <div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
          <button onClick={()=>setFinY(null)} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer"}}>←</button>
          <div style={{flex:1}}><div style={{fontWeight:800,fontSize:15}}>{finItem.icon} {finItem.label}</div><div style={{fontSize:11,opacity:0.7}}>{finY}年</div></div>
        </div>
        <div style={{padding:isPC?"14px 0":14}}>
          {(ym[finY]||[]).slice().reverse().map(m=>{
            const cnt=finFiles.filter(f=>f.item_id===finItem.id&&Number(f.year)===Number(finY)&&Number(f.month)===m).length;
            const isN=Number(finY)===cy&&m===cm;
            return(<div key={m} onClick={()=>setFinM(m)} style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",cursor:"pointer",borderLeft:isN?"4px solid #E07B39":"4px solid transparent"}}>
              <span style={{fontSize:24}}>📅</span>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:6,color:"#1F2937"}}>{m}月{isN&&<span style={{fontSize:10,background:"#E07B39",color:"#fff",borderRadius:4,padding:"1px 6px",fontWeight:700}}>今月</span>}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{cnt}件</div></div>
              <span style={{color:"#9CA3AF"}}>›</span>
            </div>);
          })}
        </div>
      </div>
    );

    if(finItem)return(
      <div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
          <button onClick={()=>setFinItem(null)} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer"}}>←</button>
          <div style={{flex:1,fontWeight:800,fontSize:15}}>{finItem.icon} {finItem.label}</div>
        </div>
        <div style={{padding:isPC?"14px 0":14}}>
          {Object.keys(ym).sort((a,b)=>b-a).map(y=>{
            const tot=Object.values(ym[y]||[]).reduce((s,m)=>s+finFiles.filter(f=>f.item_id===finItem.id&&Number(f.year)===Number(y)&&Number(f.month)===m).length,0);
            const isN=Number(y)===cy;
            return(<div key={y} onClick={()=>setFinY(y)} style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",cursor:"pointer",borderLeft:isN?"4px solid #1A3A5C":"4px solid transparent"}}>
              <span style={{fontSize:26}}>📁</span>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15,display:"flex",alignItems:"center",gap:6,color:"#1F2937"}}>{y}年{isN&&<span style={{fontSize:10,background:"#1A3A5C",color:"#fff",borderRadius:4,padding:"1px 6px",fontWeight:700}}>今年</span>}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{tot}件</div></div>
              <span style={{color:"#9CA3AF"}}>›</span>
            </div>);
          })}
        </div>
        <PwUI/>
      </div>
    );

    return(
      <div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
          <button onClick={()=>nav("home")} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"4px 10px",fontSize:13,cursor:"pointer",fontWeight:700}}>←</button>
          <div style={{flex:1,fontWeight:800,fontSize:16}}>🗃 財務・書類管理</div>
          <button onClick={()=>setFinModal("addFolder")} style={{background:"#E07B39",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:800}}>＋ フォルダ</button>
        </div>
        <div style={{padding:isPC?"14px 0":14}}>
          <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            {allItems.map((item,i)=>{
              const hp=!!pws[item.id],iu=unl[item.id];
              const totalFiles=finFiles.filter(f=>f.item_id===item.id).length;
              return(
                <div key={item.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderBottom:i<allItems.length-1?"1px solid #F3F4F6":"none"}}>
                  <span style={{fontSize:26}}>{item.icon}</span>
                  <div style={{flex:1,cursor:"pointer"}} onClick={()=>{if(hp&&!iu){setPwMod({mode:"unlock",id:item.id,label:item.label});setPwIn("");setPwErr("");}else setFinItem(item);}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#1F2937"}}>{item.label}</div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{totalFiles>0?`${totalFiles}件のファイル`:"タップして管理"}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {totalFiles>0&&<span style={{background:"#E07B39",color:"#fff",borderRadius:10,padding:"2px 8px",fontSize:11,fontWeight:700}}>{totalFiles}</span>}
                    {hp&&<span style={{fontSize:14}}>{iu?"🔓":"🔒"}</span>}
                    {item.isCustom&&<button onClick={()=>{setEditFolder({...item});setFinModal("editFolder");}} style={{background:"#EFF6FF",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,color:"#1A3A5C",cursor:"pointer"}}>✏️</button>}
                    {item.isCustom&&<button onClick={()=>deleteFinFolder(item.id)} style={{background:"#FEF2F2",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,color:"#DC2626",cursor:"pointer"}}>🗑</button>}
                    {!item.isCustom&&<button onClick={()=>{setPwMod({mode:hp?"change":"set",id:item.id,label:item.label});setPwIn("");setPwErr("");}} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#374151"}}>{hp?"変更":"設定"}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {finModal==="addFolder"&&(<Modal title="📁 フォルダを追加" onClose={()=>setFinModal(null)} onSave={addFinFolder}><Inp label="アイコン（絵文字）" value={newFolder.icon} onChange={e=>setNewFolder({...newFolder,icon:e.target.value})}/><Inp label="フォルダ名 *" value={newFolder.label} onChange={e=>setNewFolder({...newFolder,label:e.target.value})} placeholder="例: 保険証書"/></Modal>)}
        {finModal==="editFolder"&&editFolder&&(<Modal title="📁 フォルダを編集" onClose={()=>{setFinModal(null);setEditFolder(null);}} onSave={updateFinFolder}><Inp label="アイコン（絵文字）" value={editFolder.icon} onChange={e=>setEditFolder({...editFolder,icon:e.target.value})}/><Inp label="フォルダ名 *" value={editFolder.label} onChange={e=>setEditFolder({...editFolder,label:e.target.value})}/></Modal>)}
        <PwUI/>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // TEMPLATES（Supabase保存版）
  // ══════════════════════════════════════════
  if(page==="templates"){
    const fi=f=>f.type?.startsWith("image/")?"🖼":f.name?.endsWith(".pdf")?"📕":f.name?.endsWith(".xlsx")||f.name?.endsWith(".xls")?"📗":f.name?.endsWith(".docx")||f.name?.endsWith(".doc")?"📘":"📄";

    if(tmplPrev)return(
      <div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#1A1A2E",minHeight:"100vh",display:"flex",flexDirection:"column",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <button onClick={()=>setTmplPrev(null)} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer"}}>←</button>
          <div style={{flex:1,fontWeight:700,fontSize:14}}>{tmplPrev.name}</div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {tmplPrev.url&&<a href={tmplPrev.url} download={tmplPrev.name} target="_blank" rel="noopener noreferrer" style={{background:"#E07B39",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>⬇ 保存</a>}
            <button onClick={()=>setFileDel({name:tmplPrev.name,onDelete:()=>deleteTmplFile(tmplPrev.id)})} style={{background:"rgba(220,38,38,0.8)",color:"#fff",borderRadius:8,padding:"5px 10px",fontSize:12,fontWeight:700,border:"none",cursor:"pointer"}}>🗑 削除</button>
          </div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {tmplPrev.url?(
            isImg(tmplPrev)
              ?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                <img src={tmplPrev.url} style={{maxWidth:"100%",maxHeight:"100%",borderRadius:8,objectFit:"contain"}} alt={tmplPrev.name}/>
              </div>
            :isPDF(tmplPrev)
              ?<iframe src={tmplPrev.url} style={{flex:1,width:"100%",border:"none",background:"#fff"}} title={tmplPrev.name}/>
            :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{color:"#fff",textAlign:"center",padding:32}}>
                <div style={{fontSize:72,marginBottom:16}}>{fi(tmplPrev)}</div>
                <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>{tmplPrev.name}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginBottom:24}}>{tmplPrev.size?`${(tmplPrev.size/1024).toFixed(0)}KB`:""}</div>
                <a href={tmplPrev.url} download={tmplPrev.name} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",background:"#E07B39",color:"#fff",padding:"14px 32px",borderRadius:12,fontWeight:800,fontSize:15,textDecoration:"none"}}>⬇ ダウンロード</a>
              </div>
            </div>
          ):<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>⏳</div><div>読み込み中...</div></div></div>}
        </div>
      </div>
    );

    if(tmplCat){
      const files=tmplFiles.filter(f=>f.cat_id===tmplCat.id);
      return(
        <div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
          {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
          <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
            <button onClick={()=>setTmplCat(null)} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer"}}>←</button>
            <div style={{flex:1}}><div style={{fontWeight:800,fontSize:15}}>{tmplCat.icon} {tmplCat.label}</div><div style={{fontSize:11,opacity:0.7}}>{files.length}件</div></div>
            <label style={{background:"#E07B39",color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              ＋ 追加
              <input type="file" accept="image/*,application/pdf,.xlsx,.docx,.xls,.doc" multiple onChange={async e=>{for(const f of Array.from(e.target.files)){await uploadTmplFile(f,tmplCat.id);}}} style={{display:"none"}}/>
            </label>
          </div>
          <div style={{padding:isPC?"14px 0":14}}>
            {files.length===0?<div style={{textAlign:"center",padding:40,color:"#9CA3AF"}}><div style={{fontSize:48,marginBottom:12}}>📂</div><div style={{fontSize:14}}>ファイルがありません</div></div>
              :files.map(f=>(
                <div key={f.id} style={{background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                  <span style={{fontSize:28,flexShrink:0}}>{fi(f)}</span>
                  <div style={{flex:1,overflow:"hidden",cursor:"pointer"}} onClick={()=>setTmplPrev(f)}>
                    <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#1F2937"}}>{f.name}</div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{f.size?`${(f.size/1024).toFixed(0)}KB`:""}</div>
                  </div>
                  <button onClick={()=>setFileDel({name:f.name,onDelete:()=>deleteTmplFile(f.id)})} style={{background:"#FEF2F2",border:"none",borderRadius:6,padding:"5px 8px",fontSize:11,color:"#DC2626",fontWeight:700,cursor:"pointer"}}>🗑</button>
                </div>
              ))}
          </div>
        </div>
      );
    }

    return(
      <div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <Hdr title="📂 お知らせ・雛形" back={()=>nav("home")}/>
        <div style={{padding:isPC?"14px 0":14}}>
          <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)",marginBottom:16}}>
            {TEMPLATE_CATS.map((cat,i)=>{
              const cnt=tmplFiles.filter(f=>f.cat_id===cat.id).length;
              return(
                <div key={cat.id} onClick={()=>setTmplCat(cat)} style={{display:"flex",alignItems:"center",gap:14,padding:"16px 18px",borderBottom:i<TEMPLATE_CATS.length-1?"1px solid #F3F4F6":"none",cursor:"pointer"}}>
                  <span style={{fontSize:28}}>{cat.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#1F2937"}}>{cat.label}</div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{cnt>0?`${cnt}件のファイル`:"タップして管理"}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {cnt>0&&<span style={{background:"#E07B39",color:"#fff",borderRadius:10,padding:"2px 8px",fontSize:11,fontWeight:700}}>{cnt}</span>}
                    <span style={{color:"#9CA3AF",fontSize:18}}>›</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // ESTIMATE
  // ══════════════════════════════════════════
  if(page==="estimate"){
    const clCos=cos.filter(c=>c.type==="取引先");
    const selCo=cos.find(c=>c.id===est.clientId);
    const addIt=()=>setEst(p=>({...p,items:[...p.items,{name:"",spec:"",qty:1,unit:"式",price:0,amount:0}]}));
    const updIt=(i,f,v)=>setEst(p=>{const its=[...p.items];its[i]={...its[i],[f]:v};if(f==="qty"||f==="price")its[i].amount=Number(its[i].qty||0)*Number(its[i].price||0);const sub=its.reduce((s,it)=>s+(it.amount||0),0);const tax=Math.floor(sub*0.1);return{...p,items:its,sub,tax,total:sub+tax};});
    const remIt=i=>setEst(p=>{const its=p.items.filter((_,idx)=>idx!==i);const sub=its.reduce((s,it)=>s+(it.amount||0),0);const tax=Math.floor(sub*0.1);return{...p,items:its,sub,tax,total:sub+tax};});
    const dlCSV=()=>{const cn=selCo?selCo.name+(selCo.branch?" "+selCo.branch:""):"";let csv="\uFEFF見積書\nNo.,"+est.no+"\n日付,"+est.date+"\n宛先,"+cn+"\n工事名,"+est.pjName+"\n\n品名,数量,単位,単価,金額\n";est.items.forEach(it=>{csv+=`${it.name},${it.qty},${it.unit},${it.price},${it.amount}\n`;});csv+=`\n小計,,,, ${est.sub}\n消費税,,,, ${est.tax}\n合計,,,, ${est.total}\n`;const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`見積書_${cn}.csv`;a.click();URL.revokeObjectURL(url);};
    return(<div style={{fontFamily:"'Hiragino Sans',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>{isPC&&<PCSidebar/>}{isPC&&<PCRightPanel/>}<Hdr title="📝 見積書作成" back={()=>nav("home")} right={<button onClick={dlCSV} style={{background:"#059669",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:800}}>⬇ CSV</button>}/><div style={{padding:isPC?"14px 0":14}}><div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:12,boxShadow:"0 1px 6px rgba(0,0,0,0.07)"}}><div style={{fontWeight:800,fontSize:14,color:"#1A3A5C",marginBottom:12}}>📋 基本情報</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}><Inp label="見積No." value={est.no} onChange={e=>setEst(p=>({...p,no:e.target.value}))} placeholder="0001"/><Inp label="日付" type="date" value={est.date} onChange={e=>setEst(p=>({...p,date:e.target.value}))}/></div><div style={{marginBottom:10}}><div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>取引先</div><select value={est.clientId} onChange={e=>setEst(p=>({...p,clientId:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,background:"#FAFAFA",boxSizing:"border-box",color:"#1F2937"}}><option value="">選択してください</option>{clCos.map(c=><option key={c.id} value={c.id}>{c.name}{c.branch?" "+c.branch:""}</option>)}</select></div>{selCo&&(<div style={{background:"#EFF6FF",borderRadius:10,padding:"10px 14px",marginBottom:10,borderLeft:"3px solid #1A3A5C"}}><div style={{fontSize:11,color:"#1A3A5C",fontWeight:700,marginBottom:4}}>✅ 自動入力</div><div style={{fontSize:12,color:"#374151"}}>宛先: {selCo.name}{selCo.branch?" "+selCo.branch:""}</div></div>)}<Inp label="工事名" value={est.pjName} onChange={e=>setEst(p=>({...p,pjName:e.target.value}))} placeholder="例: ○○マンション排水管更新工事"/><Inp label="担当者" value={est.person} onChange={e=>setEst(p=>({...p,person:e.target.value}))}/></div><div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:12,boxShadow:"0 1px 6px rgba(0,0,0,0.07)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontWeight:800,fontSize:14,color:"#1A3A5C"}}>🔧 工事項目</div><button onClick={addIt} style={{background:"#E07B39",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:700}}>＋ 追加</button></div>{est.items.map((item,i)=>(<div key={i} style={{background:"#F9FAFB",borderRadius:10,padding:12,marginBottom:8,border:"1px solid #E5E7EB"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div style={{fontSize:12,fontWeight:700,color:"#6B7280"}}>項目 {i+1}</div><button onClick={()=>remIt(i)} style={{background:"none",border:"none",color:"#DC2626",fontSize:16,cursor:"pointer"}}>🗑</button></div><Inp label="品名 *" value={item.name} onChange={e=>updIt(i,"name",e.target.value)}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}><Inp label="数量" type="number" value={item.qty} onChange={e=>updIt(i,"qty",Number(e.target.value))}/><div style={{marginBottom:10}}><div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>単位</div><select value={item.unit} onChange={e=>updIt(i,"unit",e.target.value)} style={{width:"100%",padding:"8px 6px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:12,background:"#FAFAFA",color:"#1F2937"}}>{["式","個","本","m","㎡","日","台"].map(u=><option key={u}>{u}</option>)}</select></div><Inp label="単価" type="number" value={item.price} onChange={e=>updIt(i,"price",Number(e.target.value))}/><div style={{marginBottom:10}}><div style={{fontSize:11,color:"#9CA3AF",marginBottom:3}}>金額（自動）</div><div style={{padding:"8px 10px",background:"#F0F4F8",borderRadius:8,fontSize:12,fontWeight:700,color:"#1A3A5C"}}>¥{(item.amount||0).toLocaleString()}</div></div></div></div>))}{est.items.length===0&&<div style={{textAlign:"center",color:"#9CA3AF",fontSize:13,padding:20}}>「＋ 追加」から工事項目を入力</div>}</div><div style={{background:"#fff",borderRadius:14,padding:16,boxShadow:"0 1px 6px rgba(0,0,0,0.07)"}}><div style={{fontWeight:800,fontSize:14,color:"#1A3A5C",marginBottom:12}}>💰 金額</div>{[["小計",est.sub],["消費税（10%）",est.tax]].map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F3F4F6"}}><div style={{fontSize:13,color:"#6B7280"}}>{l}</div><div style={{fontSize:13,fontWeight:600}}>¥{(v||0).toLocaleString()}</div></div>))}<div style={{display:"flex",justifyContent:"space-between",padding:"12px 0"}}><div style={{fontSize:16,fontWeight:800,color:"#1A3A5C"}}>合計（税込）</div><div style={{fontSize:20,fontWeight:900,color:"#E07B39"}}>¥{(est.total||0).toLocaleString()}</div></div><button onClick={dlCSV} style={{width:"100%",padding:13,background:"#059669",color:"#fff",border:"none",borderRadius:12,fontWeight:800,fontSize:15,cursor:"pointer",marginTop:8}}>⬇ CSVダウンロード</button></div></div></div>);
  }

  // ══════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════
  if(page==="analytics"){
    const active=pjs.filter(p=>p.status!=="完了"&&p.status!=="中断");
    const done=pjs.filter(p=>p.status==="完了");
    const totalAmt=pjs.reduce((s,p)=>s+(p.amount||0),0);
    const totalGp=pjs.reduce((s,p)=>s+(p.gp||0),0);
    const avgGpRate=totalAmt?(totalGp/totalAmt*100).toFixed(1):0;
    const statusCount=STATUSES.map(s=>({s,n:pjs.filter(p=>p.status===s).length}));
    const maxSC=Math.max(...statusCount.map(x=>x.n),1);
    // 粗利率TOP5
    const top5=pjs.filter(p=>p.amount>0).sort((a,b)=>(b.gp/b.amount)-(a.gp/a.amount)).slice(0,5);
    // 担当者別受注
    const byCharge={};
    pjs.forEach(p=>{const k=p.inCharge||"未設定";byCharge[k]=(byCharge[k]||0)+(p.amount||0);});
    const chargeList=Object.entries(byCharge).sort((a,b)=>b[1]-a[1]);
    const maxCharge=Math.max(...chargeList.map(x=>x[1]),1);

    return(
      <div style={{fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",background:"#F0F4F8",minHeight:"100vh",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <Hdr title="📊 分析ダッシュボード" back={()=>nav("home")}/>
        <div style={{padding:isPC?"14px 0":14}}>

          {/* KPIカード */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {[
              {label:"総案件数",value:`${pjs.length}件`,sub:`進行中 ${active.length}件`,color:"#1A3A5C",icon:"📋"},
              {label:"完了案件",value:`${done.length}件`,sub:`完了率 ${pjs.length?(done.length/pjs.length*100).toFixed(0):0}%`,color:"#059669",icon:"✅"},
              {label:"受注合計",value:`¥${(totalAmt/10000).toFixed(0)}万`,sub:pjs.length?`平均 ¥${(totalAmt/pjs.length/10000).toFixed(0)}万`:"",color:"#E07B39",icon:"💰"},
              {label:"平均粗利率",value:`${avgGpRate}%`,sub:`粗利計 ¥${(totalGp/10000).toFixed(0)}万`,color:"#7C3AED",icon:"📈"},
            ].map(k=>(
              <div key={k.label} style={{background:"#fff",borderRadius:14,padding:"14px 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
                <div style={{fontSize:22,marginBottom:6}}>{k.icon}</div>
                <div style={{fontSize:11,color:"#9CA3AF",marginBottom:2}}>{k.label}</div>
                <div style={{fontSize:18,fontWeight:900,color:k.color}}>{k.value}</div>
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ステータス別件数 */}
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <div style={{fontWeight:800,fontSize:14,color:"#1A3A5C",marginBottom:14}}>📋 ステータス別件数</div>
            {statusCount.map(({s,n})=>{
              const st=STATUS_STYLE[s];
              return(
                <div key={s} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:st.text}}>{s}</span>
                    <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>{n}件</span>
                  </div>
                  <div style={{background:"#F3F4F6",borderRadius:4,height:8,overflow:"hidden"}}>
                    <div style={{width:`${(n/maxSC)*100}%`,height:"100%",background:st.border,borderRadius:4,transition:"width 0.5s"}}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 粗利率TOP5 */}
          {top5.length>0&&(
            <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
              <div style={{fontWeight:800,fontSize:14,color:"#1A3A5C",marginBottom:14}}>🏆 粗利率TOP5</div>
              {top5.map((p,i)=>{
                const rate=(p.gp/p.amount*100).toFixed(1);
                return(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<top5.length-1?"1px solid #F3F4F6":"none"}}>
                    <div style={{width:24,height:24,borderRadius:"50%",background:i===0?"#F59E0B":i===1?"#9CA3AF":i===2?"#B45309":"#E5E7EB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:i<3?"#fff":"#6B7280",flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,overflow:"hidden"}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#1F2937",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                      <div style={{fontSize:11,color:"#9CA3AF"}}>{fmt(p.amount)}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:900,color:"#059669"}}>{rate}%</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 担当者別受注 */}
          {chargeList.length>0&&(
            <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
              <div style={{fontWeight:800,fontSize:14,color:"#1A3A5C",marginBottom:14}}>👤 担当者別受注金額</div>
              {chargeList.map(([name,amt])=>(
                <div key={name} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>{name}</span>
                    <span style={{fontSize:12,fontWeight:700,color:"#E07B39"}}>{fmt(amt)}</span>
                  </div>
                  <div style={{background:"#F3F4F6",borderRadius:4,height:8,overflow:"hidden"}}>
                    <div style={{width:`${(amt/maxCharge)*100}%`,height:"100%",background:"#E07B39",borderRadius:4}}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 未完了タスク集計 */}
          <div style={{background:"#fff",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <div style={{fontWeight:800,fontSize:14,color:"#1A3A5C",marginBottom:14}}>✅ タスク状況</div>
            <div style={{display:"flex",gap:10}}>
              {[
                {label:"未完了",value:tks.filter(t=>!t.done).length,color:"#EF4444"},
                {label:"完了済み",value:tks.filter(t=>t.done).length,color:"#10B981"},
                {label:"高優先度",value:tks.filter(t=>!t.done&&t.prio==="high").length,color:"#F59E0B"},
              ].map(x=>(
                <div key={x.label} style={{flex:1,background:"#F9FAFB",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:900,color:x.color}}>{x.value}</div>
                  <div style={{fontSize:10,color:"#9CA3AF",marginTop:2}}>{x.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // AI ASSISTANT
  // ══════════════════════════════════════════
  if(page==="ai"){
    const suggestions=["今月完了した案件は？","粗利率が一番高い案件は？","未完了タスクを優先度順に教えて","受注金額の合計を教えて","進行中の案件一覧を教えて"];
    return(
      <div style={{fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",background:"#F0F4F8",minHeight:"100vh",display:"flex",flexDirection:"column",...pp}}>
        {isPC&&(cust.showSidebar!==false)&&<PCSidebar/>}{isPC&&(cust.showRightPanel!==false)&&<PCRightPanel/>}
        {(cust.showLauncher!==false)&&<FloatLauncher/> }
        <Hdr title="🤖 AIアシスタント" back={()=>nav("home")}/>
        <div style={{flex:1,overflowY:"auto",padding:"14px 14px 0"}}>
          {aiMsgs.length===0&&(
            <div>
              <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,0.07)",textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:8}}>🤖</div>
                <div style={{fontWeight:800,fontSize:15,color:"#1F2937",marginBottom:4}}>AIアシスタント</div>
                <div style={{fontSize:12,color:"#6B7280",lineHeight:1.6}}>IGUMIのデータについて何でも聞いてください。案件・取引先・タスクの情報をもとに回答します。</div>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",marginBottom:8}}>💡 質問例</div>
              {suggestions.map(s=>(
                <button key={s} onClick={()=>{setAiInput(s);}} style={{width:"100%",background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:10,padding:"10px 14px",textAlign:"left",fontSize:13,color:"#374151",marginBottom:6,cursor:"pointer",fontWeight:500}}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {aiMsgs.map((m,i)=>(
            <div key={i} style={{marginBottom:12,display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
              {m.role==="assistant"&&<div style={{width:28,height:28,borderRadius:"50%",background:"#6D28D9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,marginRight:8,flexShrink:0,marginTop:2}}>🤖</div>}
              <div style={{
                maxWidth:"80%",padding:"10px 14px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",
                background:m.role==="user"?"#1A3A5C":"#fff",
                color:m.role==="user"?"#fff":"#1F2937",
                fontSize:13,lineHeight:1.7,
                boxShadow:m.role==="assistant"?"0 1px 4px rgba(0,0,0,0.08)":"none",
                whiteSpace:"pre-wrap"
              }}>{m.content}</div>
            </div>
          ))}
          {aiLoading&&(
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"#6D28D9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🤖</div>
              <div style={{background:"#fff",borderRadius:"16px 16px 16px 4px",padding:"10px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                <div style={{display:"flex",gap:4}}>
                  {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#9CA3AF",animation:`bounce 1s infinite ${i*0.2}s`}}/>)}
                </div>
              </div>
            </div>
          )}
          <div style={{height:14}}/>
        </div>
        <div style={{padding:"12px 14px 24px",background:"#fff",borderTop:"1px solid #F3F4F6"}}>
          {aiMsgs.length>0&&<button onClick={()=>setAiMsgs([])} style={{fontSize:11,color:"#9CA3AF",background:"none",border:"none",cursor:"pointer",marginBottom:8}}>🗑 会話をリセット</button>}
          <div style={{display:"flex",gap:8}}>
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendAI()} placeholder="質問を入力..." style={{flex:1,padding:"10px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:13,outline:"none",color:"#1F2937",background:"#ffffff",WebkitTextFillColor:"#1F2937"}}/>
            <button onClick={sendAI} disabled={!aiInput.trim()||aiLoading} style={{background:aiInput.trim()&&!aiLoading?"#6D28D9":"#E5E7EB",color:aiInput.trim()&&!aiLoading?"#fff":"#9CA3AF",border:"none",borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:aiInput.trim()&&!aiLoading?"pointer":"default"}}>送信</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
