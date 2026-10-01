import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "不明なエラー" };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F0F4F8", fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", boxSizing: "border-box" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 360, width: "100%", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1F2937", marginBottom: 8 }}>画面の表示に失敗しました</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, wordBreak: "break-word" }}>{this.state.message}</div>
            <button
              onClick={() => window.location.assign("/")}
              style={{ width: "100%", padding: 12, border: "none", borderRadius: 10, background: "#1A3A5C", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
            >
              ホームに戻る
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
