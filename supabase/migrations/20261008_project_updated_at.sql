-- 案件の最終更新時刻(第8弾テーマ22)
-- ※ このSQLは、すでにユーザー側でSupabaseのSQL Editorで実行・確認済み。
--    Claude Codeでは実行していません。このmigrationファイルは記録のためのものです。
--
-- 実行順の前提: テーマ21のSQL(quotesへのconstruction_type/crew_id/profit_confirmed追加・
--    既存quotesへのバックフィルupdate)を実行した"あとに"このSQLを実行すること。
--    (quotesの一括updateがこのSQLのトリガーを発火させ、projects.updated_atが
--    実行時刻にそろってしまうため)

alter table public.projects add column if not exists updated_at timestamptz;

-- バックフィル(created_atの型に応じてtimestamptzへ変換)
update public.projects set updated_at = (created_at at time zone 'UTC')
where updated_at is null and pg_typeof(created_at)::text = 'timestamp without time zone';

update public.projects set updated_at = created_at::timestamptz
where updated_at is null and pg_typeof(created_at)::text = 'timestamp with time zone';

alter table public.projects alter column updated_at set default now();
alter table public.projects alter column updated_at set not null;

-- projects自身が更新されたら、必ずupdated_atを今にする
create or replace function public.touch_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- quotes/report_files/quote_filesの変更から、該当project_idのprojects.updated_atを今にする
-- (SECURITY DEFINERは付けない。anonロールが既にprojectsへのupdate権限を持っているため、
--  既定のSECURITY INVOKERでそのまま動作する)
create or replace function public.touch_project_from_quote()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    if old.project_id is not null then
      update public.projects set updated_at = now() where id = old.project_id;
    end if;
    return old;
  else
    if new.project_id is not null then
      update public.projects set updated_at = now() where id = new.project_id;
    end if;
    return new;
  end if;
end;
$$;

create or replace function public.touch_project_from_report_file()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is not null then
    update public.projects set updated_at = now() where id = new.project_id;
  end if;
  return new;
end;
$$;

create or replace function public.touch_project_from_quote_file()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is not null then
    update public.projects set updated_at = now() where id = new.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row
  execute function public.touch_projects_updated_at();

drop trigger if exists trg_quotes_touch_project on public.quotes;
create trigger trg_quotes_touch_project
  after insert or update or delete on public.quotes
  for each row
  execute function public.touch_project_from_quote();

drop trigger if exists trg_report_files_touch_project on public.report_files;
create trigger trg_report_files_touch_project
  after insert on public.report_files
  for each row
  execute function public.touch_project_from_report_file();

drop trigger if exists trg_quote_files_touch_project on public.quote_files;
create trigger trg_quote_files_touch_project
  after insert on public.quote_files
  for each row
  execute function public.touch_project_from_quote_file();
