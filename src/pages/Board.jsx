import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Sel, Inp, Modal, Hdr, Confirm } from "../components/UI";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

const BOARD_CATS = ["業務連絡", "スケジュール", "緊急連絡", "その他"];
const BOARD_CAT_STYLE = {
  "業務連絡": { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  "スケジュール": { bg: "#F0FDF4", text: "#166534", border: "#BBF7D0" },
  "緊急連絡": { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  "その他": { bg: "#F9FAFB", text: "#374151", border: "#E5E7EB" },
};

export default function Board({ pjs, cos, tks, links, cust, isPC, pp, nav, rpOpen, setRpOpen, finFiles, tmplFiles, fishWeather, tileConf, boardPosts, setBoardPosts, boardComments, setBoardComments, SB_W, RP_W }) {
  const [boardCat, setBoardCat] = useState("すべて");
  const [boardNew, setBoardNew] = useState({ category: "業務連絡", content: "", author: "" });
  const [boardComment, setBoardComment] = useState({ postId: null, content: "", author: "" });
  const [boardOpen, setBoardOpen] = useState(null);
  const [modal, setModal] = useState(null);
  const [conf, setConf] = useState(null);
  const pending = tks.filter(t => !t.done);

  const filtPosts = boardCat === "すべて" ? boardPosts : boardPosts.filter(p => p.category === boardCat);
  const fmtTime = ts => {
    const d = new Date(ts), now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "たった今";
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const addBoardPost = async () => {
    if (!boardNew.content.trim() || !boardNew.author.trim()) return;
    const { data } = await supabase.from("board_posts").insert([{ category: boardNew.category, content: boardNew.content.trim(), author: boardNew.author.trim(), likes: [] }]).select();
    if (data) { setBoardPosts(prev => [data[0], ...prev]); setBoardNew({ category: "業務連絡", content: "", author: "" }); setModal(null); }
  };

  const deleteBoardPost = async (id) => {
    await supabase.from("board_posts").delete().eq("id", id);
    setBoardPosts(prev => prev.filter(p => p.id !== id));
    setBoardComments(prev => prev.filter(c => c.post_id !== id));
    if (boardOpen === id) setBoardOpen(null);
  };

  const toggleLike = async (post) => {
    const name = boardNew.author || "匿名";
    const liked = (post.likes || []).includes(name);
    const newLikes = liked ? post.likes.filter(l => l !== name) : [...(post.likes || []), name];
    await supabase.from("board_posts").update({ likes: newLikes }).eq("id", post.id);
    setBoardPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: newLikes } : p));
  };

  const addBoardComment = async (postId) => {
    if (!boardComment.content.trim() || !boardComment.author.trim()) return;
    const { data } = await supabase.from("board_comments").insert([{ post_id: postId, content: boardComment.content.trim(), author: boardComment.author.trim() }]).select();
    if (data) { setBoardComments(prev => [...prev, data[0]]); setBoardComment({ postId: null, content: "", author: "" }); }
  };

  const deleteBoardComment = async (id) => {
    await supabase.from("board_comments").delete().eq("id", id);
    setBoardComments(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div style={{ fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp }}>
      {isPC && (cust.showSidebar !== false) && <PCSidebar cust={cust} tileConf={tileConf} pjs={pjs} cos={cos} pending={pending} page="board" nav={nav} setModal={() => {}} setEc={() => {}} SB_W={SB_W} />}
      {isPC && (cust.showRightPanel !== false) && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} pjs={pjs} tks={tks} finFiles={finFiles} tmplFiles={tmplFiles} fishWeather={fishWeather} nav={nav} setAiInput={() => {}} RP_W={RP_W} />}
      {(cust.showLauncher !== false) && <FloatLauncher links={links} isPC={isPC} nav={nav} />}
      <Hdr title="📣 社内掲示板" back={() => nav("home")}
        right={<button onClick={() => setModal("addPost")} style={{ background: "#E07B39", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>＋ 投稿</button>} />

      <div style={{ padding: "12px 14px 0", display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
        {["すべて", ...BOARD_CATS].map(c => {
          const st = BOARD_CAT_STYLE[c] || { bg: "#1A3A5C", text: "#fff", border: "#1A3A5C" };
          const isA = boardCat === c;
          return (<button key={c} onClick={() => setBoardCat(c)} style={{ padding: "5px 14px", borderRadius: 16, border: `1.5px solid ${isA ? (c === "すべて" ? "#1A3A5C" : st.border) : st.border}`, whiteSpace: "nowrap", background: isA ? (c === "すべて" ? "#1A3A5C" : st.bg) : "#fff", color: isA ? (c === "すべて" ? "#fff" : st.text) : (c === "すべて" ? "#374151" : st.text), fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{c}</button>);
        })}
      </div>

      <div style={{ padding: "10px 14px 80px" }}>
        {filtPosts.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}><div style={{ fontSize: 40, marginBottom: 12 }}>📭</div><div>まだ投稿がありません</div></div>}
        {filtPosts.map(post => {
          const st = BOARD_CAT_STYLE[post.category] || BOARD_CAT_STYLE["その他"];
          const postComments = boardComments.filter(c => c.post_id === post.id);
          const isOpen = boardOpen === post.id;
          const likeCount = (post.likes || []).length;
          const myName = boardNew.author;
          const liked = myName && (post.likes || []).includes(myName);
          return (
            <div key={post.id} style={{ background: "#fff", borderRadius: 14, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1A3A5C", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{post.author.charAt(0)}</div>
                    <div><div style={{ fontWeight: 700, fontSize: 13, color: "#1F2937" }}>{post.author}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtTime(post.created_at)}</div></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{post.category}</span>
                    <button onClick={() => setConf({ msg: `この投稿を削除しますか？\n\nこの操作は元に戻せません。\n削除しますか？`, onOk: () => { deleteBoardPost(post.id); setConf(null); } })} style={{ background: "none", border: "none", color: "#D1D5DB", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>✕</button>
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "#1F2937", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{post.content}</div>
              </div>
              <div style={{ display: "flex", gap: 0, borderTop: "1px solid #F3F4F6" }}>
                <button onClick={() => toggleLike(post)} style={{ flex: 1, padding: "10px 0", background: "none", border: "none", borderRight: "1px solid #F3F4F6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, color: liked ? "#E07B39" : "#9CA3AF", fontWeight: liked ? 800 : 400 }}>
                  👍 {likeCount > 0 && <span style={{ fontWeight: 800, color: liked ? "#E07B39" : "#6B7280" }}>{likeCount}</span>}{likeCount === 0 && "いいね"}
                </button>
                <button onClick={() => setBoardOpen(isOpen ? null : post.id)} style={{ flex: 1, padding: "10px 0", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, color: "#6B7280" }}>
                  💬 {postComments.length > 0 ? `${postComments.length}件` : "コメント"}
                </button>
              </div>
              {isOpen && <div style={{ borderTop: "1px solid #F3F4F6", background: "#F9FAFB", padding: "12px 14px" }}>
                {postComments.map((c, i) => (
                  <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#E07B39", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{c.author.charAt(0)}</div>
                    <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "8px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>{c.author}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtTime(c.created_at)}</span>
                          <button onClick={() => deleteBoardComment(c.id)} style={{ background: "none", border: "none", color: "#D1D5DB", cursor: "pointer", fontSize: 12 }}>✕</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{c.content}</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <input value={boardComment.author} onChange={e => setBoardComment({ ...boardComment, author: e.target.value, postId: post.id })} placeholder="名前" style={{ width: 72, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937", background: "#fff", flexShrink: 0 }} />
                  <input value={boardComment.postId === post.id ? boardComment.content : ""} onChange={e => setBoardComment({ ...boardComment, content: e.target.value, postId: post.id })} onKeyDown={e => e.key === "Enter" && boardComment.author && addBoardComment(post.id)} placeholder="コメントを入力..." style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#1F2937", background: "#fff" }} />
                  <button onClick={() => addBoardComment(post.id)} style={{ background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>送信</button>
                </div>
              </div>}
            </div>
          );
        })}
      </div>

      {modal === "addPost" && <Modal title="📣 新規投稿" onClose={() => setModal(null)} onSave={addBoardPost}>
        <Sel label="カテゴリ" opts={BOARD_CATS} value={boardNew.category} onChange={e => setBoardNew({ ...boardNew, category: e.target.value })} />
        <Inp label="名前 *" value={boardNew.author} onChange={e => setBoardNew({ ...boardNew, author: e.target.value })} placeholder="例：崎岡" />
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>内容 *</div>
          <textarea value={boardNew.content} onChange={e => setBoardNew({ ...boardNew, content: e.target.value })} placeholder="内容を入力..." rows={5} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, resize: "vertical", boxSizing: "border-box", background: "#FAFAFA", color: "#1F2937", fontFamily: "inherit" }} />
        </div>
      </Modal>}
      {conf && <Confirm msg={conf.msg} onCancel={() => setConf(null)} onOk={conf.onOk} />}
    </div>
  );
}