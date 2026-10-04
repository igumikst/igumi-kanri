import { useEffect } from "react";

// ドラッグ中のファイルを、枠の外に落としてもブラウザがそのまま開いてしまわないようにする
// (このページに居る間だけ、window全体のdragover/dropの既定動作を止める)
export function usePreventWindowFileDrop() {
  useEffect(() => {
    const prevent = e => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
}
