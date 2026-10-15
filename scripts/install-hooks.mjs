#!/usr/bin/env node
// scripts/hooks/ にあるGitフック(いまは pre-push だけ)を、このPCの .git/hooks に入れる。
// 新しいPCで、リポジトリのルートから `node scripts/install-hooks.mjs` を1回実行する。
// .git/hooks はGitの共有に入らないため、PCごとに必要。
// すでに違う中身の pre-push があるときは、上書きせずに違いを表示して止まる。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
// git worktree でも、フックは共有の .git/hooks に置く
const commonDir = path.resolve(
  repoRoot,
  execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: repoRoot, encoding: "utf8" }).trim(),
);
const hooksDir = path.join(commonDir, "hooks");
const HOOKS = ["pre-push"];

// Windowsのチェックアウトで改行がCRLFになっていても、shで動くようにLFにそろえる
const toLF = s => s.replace(/\r\n/g, "\n");

let stopped = false;
fs.mkdirSync(hooksDir, { recursive: true });
for (const name of HOOKS) {
  const src = path.join(repoRoot, "scripts", "hooks", name);
  const dest = path.join(hooksDir, name);
  const want = toLF(fs.readFileSync(src, "utf8"));

  if (fs.existsSync(dest)) {
    const have = fs.readFileSync(dest, "utf8");
    if (toLF(have) === want) {
      console.log(`✓ ${name} はすでに入っています(${dest})`);
      continue;
    }
    console.error(`✗ ${dest} に、中身の違う ${name} があります。上書きせずに止めます。`);
    console.error("  違い(- いま入っているもの / + scripts/hooks のもの):");
    const a = toLF(have).split("\n");
    const b = want.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === b[i]) continue;
      if (a[i] !== undefined) console.error(`  ${i + 1}行目 - ${a[i]}`);
      if (b[i] !== undefined) console.error(`  ${i + 1}行目 + ${b[i]}`);
    }
    console.error("  確認のうえで入れ替えるときは、いまのファイルを別名に移してから、もう一度実行してください。");
    stopped = true;
    continue;
  }

  fs.writeFileSync(dest, want);
  // Windowsでは実行の設定に意味がないため、失敗しても無視する
  try { fs.chmodSync(dest, 0o755); } catch { /* 無視 */ }
  console.log(`✓ ${name} を入れました(${dest})`);
}

process.exit(stopped ? 1 : 0);
