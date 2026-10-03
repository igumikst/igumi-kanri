// 見積ファイル取り込みの読み取り結果を確認する(DBには触らない)
// 使い方: node scripts/check-quote-import.mjs <見積ファイル.xls> [...]
// ※ 実際の見積ファイルはリポジトリに入れないこと
import fs from "fs";
import { parseConcluFile } from "../src/lib/quoteImport/parseConclu.js";

const files = process.argv.slice(2);
if (!files.length) { console.error("使い方: node scripts/check-quote-import.mjs <見積ファイル.xls> [...]"); process.exit(1); }

let failed = false;
for (const f of files) {
  console.log(`\n=== ${f}`);
  try {
    const r = parseConcluFile(fs.readFileSync(f));
    console.log("表紙:", r.cover);
    console.log("総括:");
    for (const s of r.summary) console.log(`  ${s.name} ${s.amount} → ${s.groupName ? `内訳「${s.groupName}」` : "総括のみ"}`);
    console.log(`明細 ${r.lines.length}行:`);
    for (const l of r.lines) console.log(`  [${l.groupName}] ${l.name} / ${l.spec} / ${l.qty}${l.unit} × ${l.price} = ${l.amount}${l.note ? ` (${l.note})` : ""}${l.nameFromSpec ? " ※名称←材質寸法" : ""}`);
    console.log("検算:");
    for (const c of r.checks) console.log(`  ${c.ok === null ? "－" : c.ok ? "OK" : "NG"} ${c.label}: ${c.actual} / ${c.expected}`);
    if (r.warnings.length) { console.log("警告:"); for (const w of r.warnings) console.log("  ⚠ " + w); }
    if (r.checks.some(c => c.ok === false)) failed = true;
  } catch (e) {
    console.log("エラー:", e.message);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
