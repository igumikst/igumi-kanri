-- 見積ファイル取り込み: 別名辞書(price_item_aliases)の登録で、同じ別名(alias)が
-- 1回の取り込みの中に複数回出てくると「ON CONFLICT DO UPDATE command cannot affect
-- row a second time」で失敗する不具合の修正。
-- ※ このSQLは、すでにユーザー側でSupabaseのSQL Editorで実行・確認済み。
--    Claude Codeでは実行していません。このmigrationファイルは記録のためのものです。
--
-- 重要(経緯): この関数の本番の定義は、20261003_quote_files.sql の時点から、
-- 記録のないまま(本migrationに対応するファイルがリポジトリに無いまま)、テーマ21の
-- 作業で quotes.construction_type / quotes.crew_id / quotes.profit_confirmed の
-- 読み書きが追加されていた(20261008_project_updated_at.sql の冒頭コメントに、
-- 「テーマ21のSQL(quotesへのconstruction_type/crew_id/profit_confirmed追加・
-- 既存quotesへのバックフィルupdate)」という言及はあるが、そのSQL自体はリポジトリに
-- 無い)。そのため、本番の実際の定義を読み取り専用SQLで確認した上で、今回はそれを
-- ベースに、別名辞書の登録部分だけを直した(他の部分は本番の定義と一字一句そろえてある)。
-- quotes.construction_type / crew_id / profit_confirmed 列そのものの追加SQL
-- (型・デフォルト値・制約など)は、本番で確認できていないため、このファイルには含めない。

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

  insert into quotes (project_id, quote_no, title, price_set_id, status, is_adopted, total_amount, issued_at, memo, construction_type, crew_id, profit_confirmed)
  select v_project_id, v_quote_no::text, coalesce(r.title, ''), r.price_set_id,
         coalesce(nullif(r.status, ''), 'submitted'), false, coalesce(r.total_amount, 0), r.issued_at, r.memo, coalesce(nullif(r.construction_type, ''), '自社のみ'), r.crew_id, coalesce((select c.is_own from crews c where c.id = r.crew_id), false)
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

  -- 別名辞書(price_item_aliases)は「品名(alias)1つにつき1行」の辞書のため、
  -- 1回の取り込みの中で同じaliasが複数回来た場合は、1つにまとめてから登録する。
  -- 同じaliasが複数あるときは、配列の中で最後に出てきたものを採用する
  insert into price_item_aliases (alias, price_item_id)
  select d.alias, d.price_item_id
    from (
      select distinct on (r.alias) r.alias, r.price_item_id
        from jsonb_array_elements(coalesce(p_aliases, '[]'::jsonb)) with ordinality as t(e, o),
             jsonb_populate_record(null::price_item_aliases, t.e) r
       where coalesce(r.alias, '') <> '' and r.price_item_id is not null
       order by r.alias, t.o desc
    ) d
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
-- 別名辞書の重複まとめだけを戻したい場合は、insert into price_item_aliases の部分を
-- 20261003_quote_files.sql にあった形(distinct onでまとめない形)に戻して再実行する。
-- construction_type/crew_id/profit_confirmed の処理ごと戻す場合は、本番の直前の定義を
-- 読み取り専用SQL(select pg_get_functiondef(...))で確認してから戻すこと。
