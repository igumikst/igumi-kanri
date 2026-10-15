-- サーバー専用の秘密(ハッシュ)を置くテーブル(ノート見積作成の「見積作成パスワード」)
-- ※ このSQLは Claude Code では実行していません。Supabase の SQL Editor で実行してください。
-- 目的: 合言葉をハッシュ(ソルト付き・元に戻せない形)で保存し、画面(匿名キー)からは一切読めない・書けないようにする。
--      読み書きは api/(SUPABASE_SERVICE_KEY = サーバーの鍵)だけで行う。
-- 既存のテーブル(home_settings の finance_password を含む)は変更しません。

-- 1) テーブル
--    key  : 'note_passphrase'(将来、財務パスワードを移すときは 'finance_master' などを足す想定)
--    hash : 'scrypt$N$r$p$ソルト$ハッシュ' の形(api/ で作る)。平文は入れない
create table if not exists public.server_secrets (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  hash text not null check (hash like 'scrypt$%'),
  updated_at timestamptz not null default now()
);

-- 2) 匿名キー(anon)・ログインユーザー(authenticated)からは、読み書き一切不可にする
--    RLS を有効にして、許可のルール(policy)は1つも作らない。さらにテーブルの権限も外す(二重の守り)
alter table public.server_secrets enable row level security;
revoke all on table public.server_secrets from anon, authenticated;

-- 3) サーバーの鍵(service_role)だけが使える。service_role は RLS を通り抜ける
grant select, insert, update, delete on table public.server_secrets to service_role;

-- 実行後の確認(読むだけ): anon・authenticated に権限が無く、service_role にだけあること
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'server_secrets' order by grantee, privilege_type;
-- select relrowsecurity from pg_class where oid = 'public.server_secrets'::regclass;   -- true になっていること

-- 元に戻すとき(合言葉も消えます。ノート見積作成は使えなくなります)
-- drop table if exists public.server_secrets;
