import { useRef, useState } from "react";

// 子要素(ボタン・入力欄など)に、ドラッグ&ドロップでファイルを渡せるようにする。
// クリックでの選択(input type="file")はそのまま使えるので、スマホでの操作は変わらない。
// 受け付けるかどうかの判定(拡張子・サイズなど)は、呼び出し側のonFilesで行う
export default function FileDropZone({ onFiles, disabled, activeLabel = "ここに落とす", style, children }) {
  const [dragOver, setDragOver] = useState(false);
  const rootRef = useRef(null);

  return (
    <div
      ref={rootRef}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        if (e.dataTransfer.files?.length) {
          // 中にある input type="file" の表示(選んだファイル名)も、ドロップに合わせておく
          const input = rootRef.current?.querySelector('input[type="file"]');
          if (input) { try { input.files = e.dataTransfer.files; } catch { /* 古いブラウザでは無視 */ } }
          onFiles(e.dataTransfer.files);
        }
      }}
      style={{ position: "relative", borderRadius: 10, outline: dragOver ? "2px dashed #E07B39" : "2px dashed transparent", outlineOffset: 2, transition: "outline-color 0.15s", ...style }}
    >
      {children}
      {dragOver && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(224,123,57,0.12)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#9A3412", fontSize: 13, pointerEvents: "none" }}>
          {activeLabel}
        </div>
      )}
    </div>
  );
}
