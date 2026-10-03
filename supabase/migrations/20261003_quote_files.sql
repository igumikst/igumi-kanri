-- 見積ファイル取り込み(第5弾 ステップ3): 元ファイルの保管
-- ※ このSQLは Claude Code では実行していません。Supabase の SQL Editor で実行してください。
-- 前提: Storage にバケット「quote-files」(非公開)を作成済みであること(手順は報告を参照)
-- 既存の列・データは変更しません。

-- 1) 元ファイルの記録(Storage の保存名と、元のファイル名)
--    project_id / quote_id の型は、projects.id / quotes.id の型に合わせて作る
do $$
declare
  v_project_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.projects'::regclass and attname = 'id');
  v_quote_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.quotes'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.quote_files (
      id uuid primary key default gen_random_uuid(),
      project_id %s not null references public.projects(id) on delete cascade,
      quote_id %s references public.quotes(id) on delete set null,
      storage_path text not null unique,
      original_name text not null,
      size bigint,
      content_type text,
      created_at timestamptz not null default now()
    )$f$, v_project_id_type, v_quote_id_type);
end;
$$;
create index if not exists quote_files_project_id_idx on public.quote_files (project_id);

-- アプリ(ログインなし = anon)からは、読む・追加するだけ。変更・削除はできない
alter table public.quote_files enable row level security;
drop policy if exists "quote_files_select" on public.quote_files;
create policy "quote_files_select" on public.quote_files for select to anon, authenticated using (true);
drop policy if exists "quote_files_insert" on public.quote_files;
create policy "quote_files_insert" on public.quote_files for insert to anon, authenticated with check (true);

-- 2) Storage「quote-files」バケットの権限: アップロードと、署名付きURLの作成(読み取り)だけ許可する
--    公開URLは作らない(バケットは非公開)。削除・上書きは許可しない
drop policy if exists "quote_files_bucket_insert" on storage.objects;
create policy "quote_files_bucket_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'quote-files');
drop policy if exists "quote_files_bucket_select" on storage.objects;
create policy "quote_files_bucket_select" on storage.objects for select to anon, authenticated
  using (bucket_id = 'quote-files');

-- 3) 登録の関数に、元ファイルの記録を追加する(同じトランザクションで登録)
--    引数が増えるため、古い関数(引数4つ)を消してから作り直す
drop function if exists public.import_quote(jsonb, jsonb, jsonb, jsonb);
create or replace function public.import_quote(p_project jsonb, p_quote jsonb, p_items jsonb, p_aliases jsonb default '[]'::jsonb, p_file jsonb default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_project_id projects.id%type;
  v_quote_id quotes.id%type;
  v_quote_no integer;
  v_item_id quote_items.id%type;
  v_item jsonb;
  v_ord bigint;
begin
  if p_project ? 'id' and nullif(p_project->>'id', '') is not null then
    -- 既存の案件(行をロックして、見積番号の重複を防ぐ)
    select p.id into v_project_id
      from projects p
     where p.id::text = p_project->>'id'
     for update;
    if v_project_id is null then
      raise exception '案件が見つかりません';
    end if;
  else
    if coalesce(trim(p_project->>'name'), '') = '' then
      raise exception '案件名が空です';
    end if;
    -- 既存の新規案件の作成(Projects.jsx)と同じ列を入れる。amount / grossProfit は 0
    -- subcontractorIds の空の値は、列の型(配列 / jsonb)に合わせて作る
    insert into projects ("name", "status", "clientId", "salesRep", "salesRepId", "inCharge", "subcontractorIds", "quoteDate", "amount", "grossProfit")
    select r."name",
           coalesce(nullif(r."status", ''), '発注待ち'),
           r."clientId", coalesce(r."salesRep", ''), r."salesRepId", coalesce(r."inCharge", ''),
           coalesce(r."subcontractorIds", (jsonb_populate_record(null::projects, '{"subcontractorIds": []}'::jsonb))."subcontractorIds"),
           r."quoteDate", 0, 0
      from jsonb_populate_record(null::projects, p_project) r
    returning id into v_project_id;
  end if;

  -- 見積番号(quote_no は text 型): 数字だけを取り出して、最大 + 1
  select coalesce(max(nullif(regexp_replace(quote_no::text, '[^0-9]', '', 'g'), '')::integer), 0) + 1
    into v_quote_no
    from quotes
   where project_id = v_project_id;

  insert into quotes (project_id, quote_no, title, price_set_id, status, is_adopted, total_amount, issued_at, memo)
  select v_project_id, v_quote_no::text, coalesce(r.title, ''), r.price_set_id,
         coalesce(nullif(r.status, ''), 'submitted'), false, coalesce(r.total_amount, 0), r.issued_at, r.memo
    from jsonb_populate_record(null::quotes, p_quote) r
  returning id into v_quote_id;

  for v_item, v_ord in select e, o from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, o) loop
    insert into quote_items (quote_id, price_item_id, line_type, group_name, name, spec, unit, qty, sale_price, sort_order, note)
    select v_quote_id, r.price_item_id, coalesce(nullif(r.line_type, ''), 'adjust'), coalesce(r.group_name, ''),
           coalesce(r.name, ''), coalesce(r.spec, ''), coalesce(r.unit, ''),
           coalesce(r.qty, 0), coalesce(r.sale_price, 0), v_ord - 1, r.note
      from jsonb_populate_record(null::quote_items, v_item) r
    returning id into v_item_id;

    insert into quote_item_costs (quote_item_id, cost_price, cost_qty, cost_confirmed)
    select v_item_id, c.cost_price, coalesce(c.cost_qty, 0), coalesce(c.cost_confirmed, false)
      from jsonb_populate_record(null::quote_item_costs,
             jsonb_build_object('cost_price', v_item->'cost_price', 'cost_qty', v_item->'qty', 'cost_confirmed', v_item->'cost_confirmed')) c;
  end loop;

  insert into price_item_aliases (alias, price_item_id)
  select r.alias, r.price_item_id
    from jsonb_array_elements(coalesce(p_aliases, '[]'::jsonb)) e,
         jsonb_populate_record(null::price_item_aliases, e) r
   where coalesce(r.alias, '') <> '' and r.price_item_id is not null
  on conflict (alias) do update set price_item_id = excluded.price_item_id;

  -- 元ファイルの記録(p_file があるときだけ)
  if p_file is not null and coalesce(p_file->>'storage_path', '') <> '' then
    insert into quote_files (project_id, quote_id, storage_path, original_name, size, content_type)
    select v_project_id, v_quote_id, r.storage_path, coalesce(nullif(r.original_name, ''), r.storage_path), r.size, r.content_type
      from jsonb_populate_record(null::quote_files, p_file) r;
  end if;

  return jsonb_build_object('project_id', v_project_id, 'quote_id', v_quote_id, 'quote_no', v_quote_no::text);
end;
$$;

grant execute on function public.import_quote(jsonb, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

-- ===== 元に戻す場合(参考) =====
-- drop function if exists public.import_quote(jsonb, jsonb, jsonb, jsonb, jsonb);
--   (→ 20261003_quote_import.sql の関数をもう一度実行する)
-- drop policy if exists "quote_files_bucket_insert" on storage.objects;
-- drop policy if exists "quote_files_bucket_select" on storage.objects;
-- drop table if exists public.quote_files;
