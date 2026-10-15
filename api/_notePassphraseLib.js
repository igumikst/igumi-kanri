/* global process, Buffer */
// /api/_notePassphraseLib.js
// 「見積作成パスワード」(ノート見積作成の合言葉)の保存・照合と、マスターキーの照合、回数制限の共通部品。
// ファイル名が _ で始まるので、Vercel の関数(URL)にはならない。api/note-parse.js と api/note-passphrase.js から使う。
//
// - 合言葉は scrypt(ソルト付き・元に戻せない形)のハッシュだけを public.server_secrets に保存する。平文は保存しない。
//   server_secrets は匿名キーから読み書き一切不可(supabase/migrations/20261015_server_secrets.sql)。
//   ここでは SUPABASE_SERVICE_KEY(サーバーの鍵)で読み書きする。
// - マスターキー = 財務ページのパスワード(home_settings の finance_password)。設定・解除専用で、note-parse には使えない。
//   【注意】finance_password は平文のまま、匿名キーで読める・書ける状態(別テーマで直す)。ここではサーバー側で照合するだけ。
import { createClient } from "@supabase/supabase-js";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const NOTE_PASSPHRASE_KEY = "note_passphrase";
export const PASSPHRASE_MIN_LENGTH = 8;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

let _supabase = null;
export function getServiceSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_KEY not set");
  _supabase = createClient(url, key);
  return _supabase;
}

// ---- ハッシュ ----
// 保存の形: scrypt$N$r$p$ソルト(base64)$ハッシュ(base64)。設定を変えても古いハッシュを照合できるよう、値を一緒に持つ
export async function hashPassphrase(plain) {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const dk = await scryptAsync(String(plain), salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyHash(plain, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const dk = await scryptAsync(String(plain), Buffer.from(saltB64, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

// 平文どうしを、長さの違いで手がかりを与えずに比べる(マスターキー用)
const digest = s => createHash("sha256").update(String(s), "utf8").digest();
export const sameText = (a, b) => timingSafeEqual(digest(a), digest(b));

// ---- 見積作成パスワード ----
export async function getNotePassphraseStatus(sb = getServiceSupabase()) {
  const { data, error } = await sb.from("server_secrets").select("updated_at").eq("key", NOTE_PASSPHRASE_KEY).maybeSingle();
  if (error) throw error;
  return { configured: !!data, updated_at: data?.updated_at || null };
}

// 結果: "unset"(未設定)/ "ng"(違う)/ "ok"
export async function verifyNotePassphrase(given, sb = getServiceSupabase()) {
  const { data, error } = await sb.from("server_secrets").select("hash").eq("key", NOTE_PASSPHRASE_KEY).maybeSingle();
  if (error) throw error;
  if (!data?.hash) return "unset";
  return (await verifyHash(given, data.hash)) ? "ok" : "ng";
}

export async function setNotePassphrase(plain, sb = getServiceSupabase()) {
  const hash = await hashPassphrase(plain);
  const { error } = await sb.from("server_secrets").upsert({ key: NOTE_PASSPHRASE_KEY, hash, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function clearNotePassphrase(sb = getServiceSupabase()) {
  const { error } = await sb.from("server_secrets").delete().eq("key", NOTE_PASSPHRASE_KEY);
  if (error) throw error;
}

// ---- マスターキー(財務ページのパスワード) ----
export async function readMasterKey(sb = getServiceSupabase()) {
  const { data, error } = await sb.from("home_settings").select("value").eq("id", "finance_password").maybeSingle();
  if (error) throw error;
  return data?.value?.password || null;
}

export async function verifyMasterKey(given, sb = getServiceSupabase()) {
  const saved = await readMasterKey(sb);
  if (!saved) return false; // 財務パスワードが未設定なら、誰も通さない(安全側)
  return typeof given === "string" && given.length > 0 && sameText(given, saved);
}

// ---- 回数制限・ロック(サーバーのメモリ。インスタンスごとの目安。task-notify.js・push-admin.js と同じ考え方) ----
export function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter({ max = 20, windowMs = 60 * 60 * 1000 } = {}) {
  const map = new Map();
  return ip => {
    const now = Date.now();
    const hits = (map.get(ip) || []).filter(t => now - t < windowMs);
    hits.push(now);
    map.set(ip, hits);
    return hits.length <= max;
  };
}

export function createFailLock({ threshold = 5, lockMs = 10 * 60 * 1000 } = {}) {
  const map = new Map();
  return {
    isLocked: ip => { const e = map.get(ip); return !!(e && e.lockedUntil && Date.now() < e.lockedUntil); },
    fail: ip => {
      const e = map.get(ip) || { count: 0, lockedUntil: 0 };
      e.count += 1;
      if (e.count >= threshold) { e.lockedUntil = Date.now() + lockMs; e.count = 0; }
      map.set(ip, e);
    },
    success: ip => { map.delete(ip); },
  };
}
