// この端末の「担当者」をlocalStorageに覚えておくための、小さな共通ルール。
// 見積の作成者を自動で入れるために使う。使えない環境(プライベートモード等)では、
// try/catchで何もせず、空文字を返す。
const KEY = "igumi_device_assignee_v1";

export function getDeviceAssigneeName() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setDeviceAssigneeName(name) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    // 使えない環境では何もしない
  }
}
