import { useState, useEffect, useRef } from "react";

const MENTOR_COLOR = "#1a56a0";
const REVIEW_COLOR = "#22a06b";
const USER_BUBBLE_COLOR = "#1a56a0";
const MSG_AREA_BG = "#f5f7f9";
const INPUT_STYLE = {
  background: "#fff",
  color: "#1f2937",
  border: "1.5px solid #e5e7eb",
};

const GREETINGS = {
  "mentor:report": "報告書作成のお手伝いをします！今日はどんな現場でしたか？",
  "mentor:estimate": "見積作成のお手伝いをします！どんな工事の見積ですか？",
  "review:report": "チェックしたい文章を貼り付けてください！",
  "review:estimate": "チェックしたい見積の内容を貼り付けてください！",
};

const TITLES = {
  "mentor:report": "🧭 AIメンター（報告書）",
  "mentor:estimate": "🧭 AIメンター（見積）",
  "review:report": "🛡️ AIレビュー（報告書）",
  "review:estimate": "🛡️ AIレビュー（見積）",
};

export default function AiAssistModal({ mode, context, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const key = `${mode}:${context}`;
  const headerColor = mode === "mentor" ? MENTOR_COLOR : REVIEW_COLOR;
  const title = TITLES[key] || "AI補助";

  useEffect(() => {
    const greeting = GREETINGS[key];
    if (greeting) {
      setMessages([{ role: "assistant", content: greeting }]);
    }
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [key]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, context, messages: nextMessages }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "送信に失敗しました");
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
    } catch (_) {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .ai-assist-input {
          background: #fff !important;
          color: #1f2937 !important;
          -webkit-text-fill-color: #1f2937;
          color-scheme: light;
        }
        .ai-assist-input::placeholder {
          color: #9ca3af;
          opacity: 1;
          -webkit-text-fill-color: #9ca3af;
        }
      `}</style>
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 700, display: "flex", alignItems: "flex-end" }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          height: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            background: headerColor,
            color: "#fff",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, width: 32, height: 32, fontSize: 16, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: "auto", padding: "16px", background: MSG_AREA_BG, color: "#1f2937" }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: msg.role === "user" ? USER_BUBBLE_COLOR : "#fff",
                  color: msg.role === "user" ? "#fff" : "#1f2937",
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  boxShadow: msg.role === "assistant" ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "16px 16px 16px 4px",
                  background: "#fff",
                  color: "#6b7280",
                  fontSize: 13,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                考え中...
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: "8px 16px", background: "#fef2f2", color: "#dc2626", fontSize: 12, flexShrink: 0 }}>
            {error}
          </div>
        )}

        <div
          style={{
            padding: "12px 16px",
            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
            borderTop: "1px solid #e5e7eb",
            background: "#fff",
            display: "flex",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <textarea
            className="ai-assist-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={mode === "review" ? "チェックしたい文章を入力..." : "メッセージを入力..."}
            rows={2}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              fontSize: 14,
              resize: "none",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
              colorScheme: "light",
              ...INPUT_STYLE,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              alignSelf: "flex-end",
              padding: "10px 16px",
              background: !input.trim() || loading ? "#d1d5db" : headerColor,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 14,
              cursor: !input.trim() || loading ? "default" : "pointer",
              flexShrink: 0,
            }}
          >
            送信
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
