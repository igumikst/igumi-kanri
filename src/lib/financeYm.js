// 財務・書類管理の「年フォルダ」「月フォルダ」を、自動で作るときの決まり。
// 削除したフォルダが、開くたびに復活しないようにするため、「まだ作っていない新しい分」だけを作る。
//   - すでに1つもない(最初の準備) → 全部作る(年は startYear から今年まで / 月は1月から今月まで)
//   - 1つでもある → いちばん新しいものより後の分だけ作る(途中で消したフォルダは、作り直さない)
// 年・月は数字の配列で受け取り、作る年・月の配列(小さい順)を返す。

const range = (from, to) => {
  const out = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
};

export function yearsToCreate(existingYears, nowYear, startYear = 2022) {
  const years = existingYears.filter(Number.isFinite);
  return range(years.length ? Math.max(...years) + 1 : startYear, nowYear);
}

// year の月フォルダ。過去の年は12月まで、今年は今月まで、未来の年は作らない
export function monthsToCreate(existingMonths, year, now = new Date()) {
  const nowYear = now.getFullYear();
  const last = year < nowYear ? 12 : year === nowYear ? now.getMonth() + 1 : 0;
  const months = existingMonths.filter(Number.isFinite);
  return range(months.length ? Math.max(...months) + 1 : 1, last);
}
