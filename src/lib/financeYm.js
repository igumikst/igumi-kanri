// 財務・書類管理の「年フォルダ」「月フォルダ」を、自動で作るときの決まり。
// 削除したフォルダが、開くたびに復活しないようにするため、「今の年・今の月」と「まだ作っていない新しい分」だけを作る。
//   - すでに1つもない → 今の年(月は今の月)だけ作る。昔の年・月は、全部消しても作り直さない
//   - 1つでもある → いちばん新しいものより後の分だけ作る(途中で消したフォルダは、作り直さない)
// 年・月は数字の配列で受け取り、作る年・月の配列(小さい順)を返す。

const range = (from, to) => {
  const out = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
};

export function yearsToCreate(existingYears, nowYear) {
  const years = existingYears.filter(Number.isFinite);
  return range(years.length ? Math.max(...years) + 1 : nowYear, nowYear);
}

// year の月フォルダ。今年は今月まで。過去の年・未来の年は、新しい月が増えることがないので、
// すでに1つでもあれば、足りない月は作らない(1つも無い年は、何も作らない)
export function monthsToCreate(existingMonths, year, now = new Date()) {
  const nowYear = now.getFullYear();
  if (year !== nowYear) return [];
  const thisMonth = now.getMonth() + 1;
  const months = existingMonths.filter(Number.isFinite);
  return range(months.length ? Math.max(...months) + 1 : thisMonth, thisMonth);
}
