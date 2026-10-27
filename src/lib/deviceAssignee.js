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

// 覚えている名前が、今の担当者リスト(assignee_names)に無い場合は「未設定」として扱う
// (担当者の名前変更・削除で、古い名前のままにならないようにするため)。
// assigneeNamesがまだ読み込めていない(空配列)ときは、判定せずそのまま返す
export function getValidDeviceAssigneeName(assigneeNames) {
  const name = getDeviceAssigneeName();
  if (name && Array.isArray(assigneeNames) && assigneeNames.length && !assigneeNames.includes(name)) return "";
  return name;
}

// 担当者の名前変更(リネーム)を行ったとき、この端末が覚えている名前が変更前の名前と
// 同じだったら、新しい名前に揃える
export function renameDeviceAssigneeNameIfMatches(oldName, newName) {
  if (getDeviceAssigneeName() === oldName) setDeviceAssigneeName(newName);
}
