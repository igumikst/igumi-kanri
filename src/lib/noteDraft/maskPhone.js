// AIに送る前に、電話番号らしい文字を伏せる(調査報告への回答5)。伏せる処理はこの1つの関数だけで行う。
// 対象: 0 で始まり、数字が合計10〜11桁で、区切りがハイフン・空白・括弧だけの並び
//   例: 03-1234-5678 / 090 1234 5678 / 042(718)8848 / 09012345678
// 型番(RSF-542YA、S-3)・寸法(500×700)・時刻(9:00〜17:00)・金額(¥60,450)は伏せない。
// 名前はそのまま送る。

export const PHONE_MASK = "[電話番号]";

const PHONE_RE = /(?<![0-9０-９A-Za-zＡ-Ｚａ-ｚ\-‐－])[0０][0-9０-９]{1,4}(?:[-‐－ー\s]?|[(（])[0-9０-９]{1,4}(?:[-‐－ー\s]?|[)）])[0-9０-９]{3,4}(?![0-9０-９A-Za-zＡ-Ｚａ-ｚ])/g;

export function maskPhoneNumbers(text) {
  let count = 0;
  const masked = String(text ?? "").replace(PHONE_RE, m => {
    const digits = m.normalize("NFKC").replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) return m;
    count++;
    return PHONE_MASK;
  });
  return { text: masked, count };
}
