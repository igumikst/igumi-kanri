#!/usr/bin/env node
// mainへデプロイする前の自動チェック(第7弾の指示書 6節の条件に対応)。
// リポジトリのルートで `node scripts/predeploy-check.mjs` として実行する。
// 比較対象のブランチは `PREDEPLOY_BASE_REF`(既定: origin/main)。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const BASE_REF = process.env.PREDEPLOY_BASE_REF || "origin/main";
const problems = [];
const fail = msg => problems.push(msg);

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

// (a) npm run build が通る
console.log("[1/4] npm run build を確認中...");
try {
  execFileSync("npm", ["run", "build"], { cwd: repoRoot, encoding: "utf8", shell: true });
  console.log("  ✓ npm run build が通りました");
} catch (e) {
  fail(`npm run build が失敗しました:\n${((e.stdout || "") + (e.stderr || "") + (e.message || "")).trim()}`);
} finally {
  fs.rmSync(path.join(repoRoot, "dist"), { recursive: true, force: true });
}

// (b) eslintの新しいエラーが、mainより増えていない
console.log("[2/4] eslint のエラー数を、mainと比較中...");
const eslintBin = path.join(repoRoot, "node_modules/eslint/bin/eslint.js");
function eslintErrorCount(cwd) {
  try {
    const out = execFileSync("node", [eslintBin, "--format", "json", "."], { cwd, encoding: "utf8" });
    return JSON.parse(out).reduce((s, r) => s + r.errorCount, 0);
  } catch (e) {
    try { return JSON.parse(e.stdout).reduce((s, r) => s + r.errorCount, 0); } catch { return null; }
  }
}
const headErrors = eslintErrorCount(repoRoot);
let mainErrors = null;
const tmpDir = path.join(repoRoot, ".predeploy-tmp-main");
try {
  git(["fetch", "origin", "main"]);
  if (fs.existsSync(tmpDir)) execFileSync("git", ["worktree", "remove", tmpDir, "--force"], { cwd: repoRoot });
  git(["worktree", "add", "--detach", tmpDir, BASE_REF]);
  mainErrors = eslintErrorCount(tmpDir);
} catch (e) {
  fail(`mainのeslint結果を取得できませんでした: ${e.message}`);
} finally {
  try { execFileSync("git", ["worktree", "remove", tmpDir, "--force"], { cwd: repoRoot }); } catch { /* 既に無ければ無視 */ }
}
if (headErrors == null) {
  fail("eslintの結果(現在のブランチ)を正しく取得できませんでした");
} else if (mainErrors != null) {
  if (headErrors > mainErrors) fail(`eslintのエラーが、mainより増えています(main: ${mainErrors}件 → 現在: ${headErrors}件)`);
  else console.log(`  ✓ eslintのエラーは増えていません(main: ${mainErrors}件 / 現在: ${headErrors}件)`);
}

// (c)(d) 差分のファイル名・内容のチェック
console.log("[3/4] 差分のファイル名を確認中...");
let diffNames = [];
try {
  diffNames = git(["diff", `${BASE_REF}...HEAD`, "--name-only"]).split(/\r?\n/).filter(Boolean);
} catch (e) {
  fail(`差分のファイル名を取得できませんでした: ${e.message}`);
}
const beforeNameCheck = problems.length;
for (const name of diffNames) {
  const base = path.basename(name);
  if (/^scratch_/i.test(base)) fail(`"${name}" は scratch_ で始まる一時ファイルです`);
  if (/\.tmp\./i.test(base)) fail(`"${name}" は .tmp. を含む一時ファイルです`);
  if (/\.(xlsx?|est|pdf)$/i.test(name)) fail(`"${name}" は差分に含めてはいけない形式のファイルです(.xls/.xlsx/.est/.pdf)`);
  if (/^\.env$/i.test(base)) fail(`"${name}" は .env ファイルです`);
  if (/^docs\/igumi_.*_instructions\.md$/i.test(name)) fail(`"${name}" は社内向け指示書です(docs/igumi_*_instructions.md)`);
}
if (problems.length === beforeNameCheck) console.log("  ✓ 禁止されたファイルは含まれていません");

console.log("[4/4] 差分の内容(秘密のキー・個人用パス・メールアドレス)を確認中...");
const contentPatterns = [
  { re: /eyJ[A-Za-z0-9_-]{10,}/, label: "秘密のキーらしき文字列(eyJ…)" },
  { re: /sk-[A-Za-z0-9]{10,}/, label: "秘密のキーらしき文字列(sk-…)" },
  { re: /service_role/i, label: "service_role という文字列" },
  { re: /password\s*=/i, label: "password= という文字列" },
  { re: /[A-Za-z]:\\/, label: "パソコンの個人用パス(C:\\ / D:\\ など)" },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, label: "メールアドレス" },
];
try {
  const fullDiff = git(["diff", `${BASE_REF}...HEAD`]);
  let currentFile = "";
  let contentOk = true;
  for (const line of fullDiff.split(/\r?\n/)) {
    const m = line.match(/^diff --git a\/(.+?) b\//);
    if (m) { currentFile = m[1]; continue; }
    // package-lock.jsonの長いハッシュ値、このスクリプト自身が持つ判定パターンの文字列は対象外にする
    if (currentFile === "package-lock.json" || currentFile === "scripts/predeploy-check.mjs") continue;
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const p of contentPatterns) {
      if (p.re.test(line)) { fail(`"${currentFile}" の追加行に、${p.label}が見つかりました`); contentOk = false; }
    }
  }
  if (contentOk) console.log("  ✓ 差分の内容に、禁止されたものは見つかりませんでした");
} catch (e) {
  fail(`差分の内容を取得できませんでした: ${e.message}`);
}

console.log("");
if (problems.length > 0) {
  console.error("✗ predeploy-check 失敗:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("✓ predeploy-check 成功:すべての確認を通過しました");
process.exit(0);
