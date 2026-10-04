-- 案件への報告書ファイルの保存(第7弾)
-- ※ このSQLは Claude Code では実行していません。Supabase の SQL Editor で実行してください。
-- 前提: Storage にバケット「report-files」(非公開)を作成済みであること(手順は報告を参照)
-- 既存の reports テーブル(文字だけの保管箱)・report.html は変更しません。

-- 1) 報告書ファイルの記録(Storage の保存名と、元のファイル名)
--    project_id / quote_id の型は、projects.id / quotes.id の型に合わせて作る(quote_filesと同じ考え方)
do $$
declare
  v_project_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.projects'::regclass and attname = 'id');
  v_quote_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.quotes'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.report_files (
      id uuid primary key default gen_random_uuid(),
      project_id %s not null references public.projects(id) on delete cascade,
      quote_id %s references public.quotes(id) on delete set null,
      storage_path text not null unique,
      original_name text not null,
      size_bytes bigint,
      created_at timestamptz not null default now()
    )$f$, v_project_id_type, v_quote_id_type);
end;
$$;
create index if not exists report_files_project_id_idx on public.report_files (project_id);
create index if not exists report_files_quote_id_idx on public.report_files (quote_id);

-- アプリ(ログインなし = anon)からは、読む・追加するだけ。変更・削除はできない
alter table public.report_files enable row level security;
drop policy if exists "report_files_select" on public.report_files;
create policy "report_files_select" on public.report_files for select to anon, authenticated using (true);
drop policy if exists "report_files_insert" on public.report_files;
create policy "report_files_insert" on public.report_files for insert to anon, authenticated with check (true);

-- 2) Storage「report-files」バケットの権限: アップロードと、署名付きURLの作成(読み取り)だけ許可する
--    公開URLは作らない(バケットは非公開)。削除・上書きは許可しない
drop policy if exists "report_files_bucket_insert" on storage.objects;
create policy "report_files_bucket_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'report-files');
drop policy if exists "report_files_bucket_select" on storage.objects;
create policy "report_files_bucket_select" on storage.objects for select to anon, authenticated
  using (bucket_id = 'report-files');

-- ===== 元に戻す場合(参考) =====
-- drop policy if exists "report_files_bucket_insert" on storage.objects;
-- drop policy if exists "report_files_bucket_select" on storage.objects;
-- drop table if exists public.report_files;
