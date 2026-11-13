// 財務・書類管理の「年フォルダ」「月フォルダ」を、自動で作るときの決まり。
// 削除したフォルダが、開くたびに復活しないようにするため、次のものだけを作る。
//   - まだ一度も準備していない(initialized が false)で、1つも無い → 今の年(月は今の月)だけ作る
//   - 準備済みで、1つも無い(= 全部消した) → 何も作らない
//   - 1つでもある → いちばん新しいものより後の分だけ作る(新しい年・月が来たとき用。途中で消したものは作り直さない)
// 年・月は数字の配列で受け取り、作る年・月の配列(小さい順)を返す。

const range = (from, to) => {
  const out = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
};

export function yearsToCreate(existingYears, nowYear, initialized) {
  const years = existingYears.filter(Number.isFinite);
  if (!years.length) return initialized ? [] : [nowYear];
  return range(Math.max(...years) + 1, nowYear);
}

// year の月フォルダ。今年だけが対象(過去・未来の年は、新しい月が増えることがない)
export function monthsToCreate(existingMonths, year, now, initialized) {
  const nowYear = now.getFullYear();
  if (year !== nowYear) return [];
  const thisMonth = now.getMonth() + 1;
  const months = existingMonths.filter(Number.isFinite);
  if (!months.length) return initialized ? [] : [thisMonth];
  return range(Math.max(...months) + 1, thisMonth);
}
