// 下請け見積ファイル(PDF)から、税抜小計・消費税・税込合計を推測する(AIなし・サーバーなし)。
// PDFの文字の並び順は見た目と違うことがあるので、名前(ラベル)の隣の数字は信頼しない。
// 代わりに、拾った金額どうしの関係(小計+消費税=合計、消費税が小計の10%)から絞り込む。
// ここは候補を出すだけ。原価への反映は、画面で人が選んだときだけ行う(呼び出し側の責任)。

const MONEY_RE = /\d{1,3}(?:,\d{3})+/g;

// テキストから、カンマ区切りの金額をすべて拾う(重複除去)
export function extractAmounts(text) {
  const matches = (text.match(MONEY_RE) || []).map(s => Number(s.replace(/,/g, "")));
  return [...new Set(matches)].filter(n => n > 0);
}

// 拾った金額どうしから、a(税抜小計)+b(消費税)=c(税込合計)かつbがaの10%(±1円)になる
// 組み合わせをすべて探す。cが大きい順に返す
export function findTaxTriples(amounts) {
  const set = new Set(amounts);
  const seen = new Set();
  const triples = [];
  for (const a of amounts) {
    for (const c of amounts) {
      if (c <= a) continue;
      const b = c - a;
      if (!set.has(b)) continue;
      if (Math.abs(b - Math.round(a * 0.1)) > 1) continue;
      const key = `${a}-${b}-${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      triples.push({ subtotal: a, tax: b, total: c });
    }
  }
  return triples.sort((x, y) => y.total - x.total);
}

// テキストから、候補を1つにまとめて返す。
// kind: "triple"(小計+消費税=合計が見つかった) / "totalOnly"(税込合計らしい金額だけ) / "none"(何も拾えない)
export function detectSubcontractorAmount(text) {
  const amounts = extractAmounts(text);
  const triples = findTaxTriples(amounts);
  if (triples.length) {
    return { kind: "triple", best: triples[0], multiple: triples.length > 1, candidates: triples };
  }
  if (amounts.length) {
    const total = Math.max(...amounts);
    const subtotal = Math.round(total / 1.1);
    const best = { subtotal, tax: total - subtotal, total };
    return { kind: "totalOnly", best, multiple: false, candidates: [best] };
  }
  return { kind: "none", best: null, multiple: false, candidates: [] };
}

// PDFの発行元の会社名が、協力業者の名前に含まれていれば候補として返す(自動選択はしない)
export function suggestSubcontractorCompany(text, companies) {
  const normalize = s => (s || "").replace(/株式会社|有限会社|\(株\)|（株）|\(有\)|（有）|\s/g, "");
  const normText = normalize(text);
  for (const co of companies || []) {
    const n = normalize(co.name);
    if (n && normText.includes(n)) return co;
  }
  return null;
}

// pdfjs-dist(PDFの文字を読み取るライブラリ)は重いので、実際に読み取るときだけ読み込む
let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}

// PDFファイル(File)から、全ページの文字を抜き出す。ブラウザの中だけで行う(サーバーに送らない)
export async function extractPdfText(file) {
  const pdfjsLib = await getPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n";
  }
  return text;
}
