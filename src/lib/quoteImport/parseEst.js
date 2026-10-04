// 見積ソフトが出力するESTファイル(バイナリ形式)を読み取る。DBには触らない純粋な処理。
// AIは使わない。サンプル2件(Conclu出力の100%見積書と突き合わせ済み)で確認した構造:
//   - 先頭 "MSF5"
//   - 数値レコード(1行=107バイト固定): qty,qty,単価A,単価B(=A×掛け率/100),0,金額A,金額B,掛け率
//     単価A・金額Aが常に「100%の金額」。ファイル順は、見積書(Excel)の表示順の「逆」
//   - 文字レコード: 長さ(uint16LE)+Shift-JIS文字列を、名称→材質寸法→(空・未使用)→備考→単位→単位(計6項目)の
//     順で、数値レコードと同じ順番に繰り返す。開始位置はファイルごとに変わるため、6項目×レコード数が
//     途切れず読める位置を総当たりで探す
//   - 工事名称は、ファイル末尾付近に単独の文字レコードとして入っている
//   - 見積合計(税抜)は、工事名称の文字レコードの長さ位置を T とすると、T+168バイトに130%合計、
//     T+176バイトに100%合計(税抜)が、8バイトのdoubleで入っている(サンプル2件で確認済み)

const HEADER = "MSF5";
const RECORD_SIZE = 107;
const MARKUP_RATE_FIELD_OFFSET = 56; // レコード先頭からの、掛け率フィールドの位置

const isReasonable = v => Number.isFinite(v) && Math.abs(v) >= 0.5 && Math.abs(v) < 1e8;
const close = (a, b, eps) => Math.abs(a - b) < eps;

function readHeader(buf) {
  return buf.length >= 4 && String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === HEADER;
}

// 数値レコードをファイル全体から総当たりで探す(ファイルによって開始位置が多少ずれる可能性があるため)
function findNumericRecords(dv, len) {
  const hits = [];
  for (let off = 0; off + RECORD_SIZE <= len; off++) {
    const qty1 = dv.getFloat64(off, true);
    const qty2 = dv.getFloat64(off + 8, true);
    if (!(isReasonable(qty1) && qty1 > 0 && qty1 < 10000 && close(qty1, qty2, 1e-6))) continue;
    const priceA = dv.getFloat64(off + 16, true);
    const priceB = dv.getFloat64(off + 24, true);
    if (!(isReasonable(priceA) && priceA > 0)) continue;
    const rate = dv.getFloat64(off + MARKUP_RATE_FIELD_OFFSET, true);
    if (!(Number.isFinite(rate) && rate >= 50 && rate <= 500)) continue;
    if (!close(priceB, priceA * (rate / 100), Math.max(0.5, priceA * 0.0005))) continue;
    const amountA = dv.getFloat64(off + 40, true);
    const amountB = dv.getFloat64(off + 48, true);
    if (!close(amountA, qty1 * priceA, Math.max(0.5, Math.abs(amountA) * 0.0005))) continue;
    if (!close(amountB, qty1 * priceB, Math.max(0.5, Math.abs(amountB) * 0.0005))) continue;
    hits.push({ off, qty: qty1, priceA, priceB, amountA, amountB, rate });
  }
  // 連続する一定間隔(ふつう107バイト)のものだけを、本物のレコード列として採用する。
  // 単発の偶然一致(ノイズ)は、前後と間隔が合わないので除く
  if (hits.length <= 1) return hits;
  const stride = hits[1].off - hits[0].off;
  const kept = hits.filter((h, i) => i === 0 || h.off - hits[i - 1].off === stride);
  return kept.length >= 2 ? kept : hits;
}

// 長さ(uint16LE)+Shift-JIS文字列を1つ読む。壊れていたらnullを返す
function readOneString(buf, off, dec) {
  if (off + 2 > buf.length) return null;
  const strLen = buf[off] | (buf[off + 1] << 8);
  if (strLen > 400) return null;
  const textStart = off + 2;
  if (textStart + strLen > buf.length) return null;
  let text = "";
  if (strLen > 0) {
    const raw = buf.subarray(textStart, textStart + strLen);
    // 制御文字(0x00〜0x1F)を含む場合は、意図した文字列ではない(数値の書式コードなど)とみなす
    for (let j = 0; j < raw.length; j++) { if (raw[j] < 0x20) return null; }
    try { text = dec.decode(raw); } catch { return null; }
  }
  return { text, end: textStart + strLen };
}

const looksNumeric = s => /^[0-9.]*$/.test(s);

// 1行ぶん(6項目: 名称/材質寸法/(常に空)/備考/単位/単位)を読む。
// 「3番目は必ず空」「5番目と6番目(単位)は必ず同じ」「単位が数字だけなのは不自然」
// 「名称・材質寸法のどちらかに、数字だけではない中身があるはず」という分かっている形を厳格にチェックすることで、
// 数値の書式コードなどのノイズを、たまたま文字列として読めてしまっても弾く
function tryReadRow(buf, start, dec) {
  const fields = [];
  let off = start;
  for (let i = 0; i < 6; i++) {
    const res = readOneString(buf, off, dec);
    if (!res) return null;
    fields.push(res.text);
    off = res.end;
  }
  if (fields[2] !== "") return null; // 3番目(名称と材質寸法の間の未使用項目)は必ず空のはず
  if (fields[4] !== fields[5]) return null; // 単位は2回とも同じ値のはず
  if (looksNumeric(fields[4])) return null; // 単位が数字だけ、は単位として不自然
  const hasContent = (fields[0] && !looksNumeric(fields[0])) || (fields[1] && !looksNumeric(fields[1]));
  if (!hasContent) return null; // 名称・材質寸法が両方とも空/数字だけは、実データの行ではない
  return { fields, end: off };
}

// 次の「それらしい行」が出てくるまで、1バイトずつ探す
function findNextRow(buf, from, limit, dec) {
  const end = Math.min(buf.length - 1, limit);
  for (let p = from; p <= end; p++) {
    const row = tryReadRow(buf, p, dec);
    if (row) return { pos: p, row };
  }
  return null;
}

// 行同士は、きっちり連続しているとは限らない(間に他のデータが挟まることがある)ため、
// 1行読めたら、その続きから次の行を探す、という形で recordCount 行ぶん読む。
// 最初の行の候補(1件目に見つかった「それらしい行」)から試し、途中で続きが見つからなければ、
// その次の候補から読み直す
function findStringTable(buf, searchStart, recordCount, dec) {
  const maxGapPerRow = 3000;
  const searchEnd = Math.min(buf.length, searchStart + 8000);
  let startSearchFrom = searchStart;
  while (startSearchFrom < searchEnd) {
    const first = findNextRow(buf, startSearchFrom, searchEnd, dec);
    if (!first) return null;
    const rows = [first.row.fields];
    let pos = first.row.end;
    let ok = true;
    for (let i = 1; i < recordCount; i++) {
      const next = findNextRow(buf, pos, pos + maxGapPerRow, dec);
      if (!next) { ok = false; break; }
      rows.push(next.row.fields);
      pos = next.row.end;
    }
    if (ok) return { start: first.pos, end: pos, fields: rows.flat() };
    startSearchFrom = first.pos + 1;
  }
  return null;
}

// 位置offにある「長さ(uint16LE)+Shift-JIS」の文字列を1つ読む(壊れていれば空文字)。
// 後ろに詰まった0(NUL)は取り除く。文字の幅(1バイト/2バイト)の境目でフィールドの長さが
// 切れている場合、最後の1文字が壊れて読める(U+FFFDの置換文字になる)ので、それも取り除く
function readTitleStringAt(buf, off, dec) {
  if (off < 0 || off + 2 > buf.length) return "";
  const strLen = buf[off] | (buf[off + 1] << 8);
  if (strLen < 1 || strLen > 300 || off + 2 + strLen > buf.length) return "";
  const raw = buf.subarray(off + 2, off + 2 + strLen);
  for (let j = 0; j < raw.length; j++) { if (raw[j] !== 0 && raw[j] < 0x20) return ""; }
  try { return dec.decode(raw).replace(/\0/g, "").replace(/�+$/, "").trim(); } catch { return ""; }
}

const looksJapanese = s => !!s && [...s].some(ch => ch.codePointAt(0) > 0x7f);
// ソフト側が工事名称を入力させていない場合の既定文字列。工事名称として扱わない
const EST_TITLE_PLACEHOLDERS = ["新規見積", "会社情報を設定してください"];
const isRealTitle = s => looksJapanese(s) && !EST_TITLE_PLACEHOLDERS.includes(s);

// 工事名称・見積合計の位置は、会社情報(住所・電話番号)の文字列や、アップロード時に
// 変わってしまうファイル名に頼らず、金額そのものから探す。
// 「T+168に出力率の合計、T+176に100%合計」という決まった並びを逆に使い、
// 「8バイトの小数が2つ連続して、2つ目(A)が組み立てた明細の100%合計(topSum100)と一致し、
// 1つ目(B)がA×出力率/100と一致する」位置を、ファイル全体から総当たりで探す。
// 複数見つかった場合は、その位置(-168)に工事名称として読める(日本語を含む)文字列があるものを選ぶ
function findTitleAndTotalsByAmount(buf, dv, dec, topSum100, detectedRate) {
  if (topSum100 == null) return null;
  const rate = detectedRate != null ? detectedRate : 100;
  const expectedB = topSum100 * (rate / 100);
  // Aは、あとでtopSum100と突き合わせる検算(1円未満の差で一致とみなす)と同じ基準で探す。
  // Bは表示用の参考値なので、掛け率の丸めを考えて少し緩める
  const epsA = 1;
  const epsB = Math.max(0.5, Math.abs(expectedB) * 0.0005);
  const candidates = [];
  for (let off = 0; off + 16 <= buf.length; off++) {
    const a = dv.getFloat64(off + 8, true);
    if (!isReasonable(a) || !close(a, topSum100, epsA)) continue;
    const b = dv.getFloat64(off, true);
    if (!isReasonable(b) || !close(b, expectedB, epsB)) continue;
    const titleOff = off - 168;
    const title = titleOff >= 0 ? readTitleStringAt(buf, titleOff, dec) : "";
    candidates.push({ totalExTax: a, totalExTax130: b, title });
  }
  if (!candidates.length) return null;
  return candidates.find(c => isRealTitle(c.title)) || candidates[0];
}

// スタック方式で、階層(小計/明細)を組み立てる。
// 各行の l.groupOverride は3つの状態を持つ:
//   undefined(自動) → 直前の未確定(ペンディング)行たちの合計と金額が一致すれば、小計(グループ)にする
//   true(手動で「小計」に切り替え) → 強制的にグループにする(一致する組み合わせが無ければ、
//     その時点のペンディング行を全部子にする=ベストエフォート。その場合は mismatchKeys に入れて警告対象にする)
//   false(手動で「明細」に切り替え) → 金額が一致しても、小計にしない(明細のまま)
export function buildEstTree(lines, amountKey = "amountA") {
  const EPS = 1;
  const pending = [];
  const mismatchKeys = [];
  const resolved = [];
  for (const l of lines) {
    const amt = Number(l[amountKey]) || 0;
    const forceGroup = l.groupOverride === true;
    const forceLeaf = l.groupOverride === false;
    let matched = null;
    if (!forceLeaf) {
      for (let k = 1; k <= pending.length; k++) {
        const slice = pending.slice(pending.length - k);
        const sum = slice.reduce((s, n) => s + (Number(n[amountKey]) || 0), 0);
        if (Math.abs(sum - amt) < EPS) { matched = slice; break; }
      }
    }
    if (matched) {
      pending.splice(pending.length - matched.length, matched.length);
      const node = { ...l, isGroup: true, children: matched };
      pending.push(node);
      resolved.push(node);
    } else if (forceGroup) {
      const children = pending.splice(0, pending.length);
      mismatchKeys.push(l.key);
      const node = { ...l, isGroup: true, children };
      pending.push(node);
      resolved.push(node);
    } else {
      const node = { ...l, isGroup: false, children: [] };
      pending.push(node);
      resolved.push(node);
    }
  }
  return { top: pending, resolved, mismatchKeys };
}

// ESTのファイル内の行順は、見積書(Excel)の表示順の「逆」(ファイル形式そのものの仕様)。
// buildEstTree は「小計行が子の後に来る」前提で組み立てるため、組み立てたあとに
// 各階層の兄弟(同じ親を持つ行どうし)の順番だけを反転し、見積書と同じ表示順に直す
export function reverseSiblingOrder(nodes) {
  return [...nodes].reverse().map(n => (n.children && n.children.length ? { ...n, children: reverseSiblingOrder(n.children) } : n));
}

// グループの入れ子を「親 > 子」の文字列にして、明細(葉)だけを平らなリストにする
export function flattenEstTree(top, pathPrefix = []) {
  const out = [];
  for (const node of top) {
    if (node.children && node.children.length) {
      out.push(...flattenEstTree(node.children, [...pathPrefix, node.name || ""]));
    } else {
      out.push({ ...node, groupPath: pathPrefix.join(" > ") });
    }
  }
  return out;
}

// fileName: 元のファイル名(拡張子つき)。工事名称の初期値は画面側がこれから作るが、
// 合計金額の位置Tを探す手がかりにも、同じファイル名の文字を使う
export function parseEstFile(arrayBuffer, fileName = "") {
  const buf = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  const dec = new TextDecoder("shift_jis");
  if (!readHeader(buf)) throw new Error("ESTファイルの形式(先頭がMSF5)ではありません");

  const records = findNumericRecords(dv, buf.length);
  if (records.length === 0) throw new Error("明細の数値レコードが見つかりませんでした");
  const numericEnd = records[records.length - 1].off + RECORD_SIZE;

  const table = findStringTable(buf, numericEnd, records.length, dec);
  if (!table) throw new Error("明細の名称・仕様などの文字レコードが見つかりませんでした");

  const warnings = [];
  const checks = [];

  // 行ごとの掛け率の整合性チェック(単価B÷単価A が、そのレコードの掛け率と合っているか)
  const rateMismatches = records.filter(r => !close(r.priceB / r.priceA, r.rate / 100, 0.002));
  if (rateMismatches.length > 0) warnings.push(`${rateMismatches.length}行で、単価B÷単価Aが掛け率と一致しません(データが壊れている可能性があります)`);
  const rateSet = [...new Set(records.map(r => Math.round(r.rate)))];
  const detectedRate = rateSet.length === 1 ? rateSet[0] : Math.round(records[0].rate);
  if (rateSet.length > 1) warnings.push(`行によって掛け率が異なります(${rateSet.join("% / ")}%)。最初の行の値(${detectedRate}%)を初期値にします`);

  const lines = records.map((r, i) => {
    const f = table.fields.slice(i * 6, i * 6 + 6);
    const [rawName, spec, , note, unit] = f;
    const nameFromSpec = !rawName && !!spec;
    // 名称が空の行(「同接手材」などの続き)は、Conclu取り込みと同じ規約で、材質寸法を名称として使う
    return {
      key: "est" + i,
      name: rawName || spec || "",
      spec: rawName ? spec || "" : "",
      note: note || "",
      unit: unit || "",
      qty: r.qty,
      priceA: r.priceA,
      priceB: r.priceB,
      amountA: r.amountA,
      amountB: r.amountB,
      rate: r.rate,
      nameFromSpec,
    };
  });

  // 自動の階層判定(合計一致によるスタック方式。groupOverride は全行 undefined = 自動判定)
  const { top, resolved, mismatchKeys } = buildEstTree(lines);
  const linesWithAuto = lines.map((l, i) => ({ ...l, isGroup: resolved[i].isGroup, isGroupAuto: resolved[i].isGroup, groupOverride: undefined }));

  if (mismatchKeys.length) warnings.push("階層(小計)の組み立てで、金額が一致しない箇所がありました(明細一覧で確認してください)");

  // 組み立てた明細の合計(100%)を先に出しておき、合計金額の位置探しの検算に使う
  const topSum100 = top.reduce((s, n) => s + (Number(n.amountA) || 0), 0);

  const fileNameNoExt = fileName.replace(/\.[^.]+$/, "");
  const found = findTitleAndTotalsByAmount(buf, dv, dec, topSum100, detectedRate);
  const totalExTax = found ? found.totalExTax : null;
  const totalExTax130 = found ? found.totalExTax130 : null;
  // 工事名称は、ファイル内で見つかった文字列を優先する(会社情報は使わない)。無ければファイル名を使う
  const title = (found && isRealTitle(found.title)) ? found.title : fileNameNoExt;

  if (totalExTax != null) {
    checks.push({ label: "組み立てた明細の合計(100%) = ファイル保存の合計(100%)", actual: topSum100, expected: totalExTax, ok: true });
  } else {
    warnings.push("ファイル内に保存されている合計金額が見つからなかったため、金額の検算ができていません");
  }

  return {
    cover: { title, issuedDate: "", totalExTax, totalExTax130, detectedRate },
    lines: linesWithAuto,
    topSum100,
    checks,
    warnings,
  };
}

