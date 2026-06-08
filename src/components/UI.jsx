import { STATUS_STYLE } from "../lib/constants";

export const Badge = ({s}) => { const st=STATUS_STYLE[s]||STATUS_STYLE["見積中"]; return <span style={{background:st.bg,color:st.text,border:`1px solid ${st.border}`,borderRadius:6,padding:"2px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{s}</span>; };

export const Inp = ({label,...p}) => (<div style={{marginBottom:10}}>{label&&<div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>{label}</div>}<input {...p} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,background:"#FAFAFA",boxSizing:"border-box",outline:"none",color:"#1F2937"}}/></div>);

export const Sel = ({label,opts,...p}) => (<div style={{marginBottom:10}}>{label&&<div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>{label}</div>}<select {...p} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,background:"#FAFAFA",boxSizing:"border-box",color:"#1F2937"}}>{opts.map(o=><option key={o}>{o}</option>)}</select></div>);

export const Modal = ({title,onClose,onSave,children}) => (
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

export const Hdr = ({title,back,right}) => (
  <div style={{background:"#1A3A5C",color:"#fff",padding:"14px 18px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
    {back?<button onClick={back} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"4px 10px",fontSize:13,cursor:"pointer",fontWeight:700}}>←</button>
        :<div style={{background:"#E07B39",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:16}}>I</div>}
    <div style={{flex:1}}><div style={{fontWeight:800,fontSize:16}}>{title}</div>{!back&&<div style={{fontSize:10,opacity:0.65}}>株式会社IGUMI</div>}</div>
    {right}
  </div>
);

export const Confirm = ({msg,onCancel,onOk}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
    <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:320}}>
      <div style={{fontSize:24,textAlign:"center",marginBottom:12}}>⚠️</div>
      {msg.split('\n').map((line,i)=>(
        <div key={i} style={{fontSize:line.includes('元に戻せません')?12:14,color:line.includes('元に戻せません')?'#EF4444':'#374151',marginBottom:line.includes('元に戻せません')?16:4,lineHeight:1.6,textAlign:"center",fontWeight:line.includes('元に戻せません')?700:400}}>{line}</div>
      ))}
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:12,background:"#F3F4F6",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer"}}>キャンセル</button>
        <button onClick={onOk} style={{flex:1,padding:12,background:"#DC2626",color:"#fff",border:"none",borderRadius:10,fontWeight:800,cursor:"pointer"}}>削除する</button>
      </div>
    </div>
  </div>
);