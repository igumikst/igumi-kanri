-- 見積ファイル取り込み(第5弾 ステップ2)
-- ※ このSQLは Claude Code では実行していません。Supabase の SQL Editor で実行してください。
-- 既存の列・データは変更しません(列の追加・インデックス・関数の追加のみ)。

-- 1) 明細の備考(見積ファイルのJ列「定価29700円」など)
alter table public.quote_items add column if not exists note text;

-- 2) 別名辞書: 同じ別名が二重に登録されないようにする(今は空のテーブル)
create unique index if not exists price_item_aliases_alias_key on public.price_item_aliases (alias);

-- 3) 取り込みの登録を1つのトランザクションで行う関数
--    案件(新規の場合)→ 見積 → 明細 → 原価のコピー → 別名辞書 を一度に登録する。
--    途中でエラーになった場合は、すべて取り消される(中途半端なデータは残らない)。
--    案件の amount / grossProfit は変更しない(反映は「採用にする」で行う)。
--
--    p_project: 既存の案件に追加する場合 {"id": ...}
--               新規の場合 {"name","status","clientId","salesRep","salesRepId","inCharge","subcontractorIds","quoteDate"}
--    p_quote:   {"title","price_set_id","status","total_amount","issued_at","memo"}
--    p_items:   [{"price_item_id","line_type","group_name","name","spec","unit","qty","sale_price","note",
--                 "cost_price","cost_confirmed"}, ...](並び順 = 配列の順)
--    p_aliases: [{"alias","price_item_id"}, ...](人が選んだ当てはめ)
--    JSONにない項目は jsonb_populate_record で NULL になるため、必要な項目は coalesce で初期値を補う。
create or replace function public.import_quote(p_project jsonb, p_quote jsonb, p_items jsonb, p_aliases jsonb default '[]'::jsonb)
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

  return jsonb_build_object('project_id', v_project_id, 'quote_id', v_quote_id, 'quote_no', v_quote_no::text);
end;
$$;


grant execute on function public.import_quote(jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

-- ===== 元に戻す場合(参考。取り込んだデータがない状態で実行) =====
-- drop function if exists public.import_quote(jsonb, jsonb, jsonb, jsonb);
-- drop index if exists public.price_item_aliases_alias_key;
-- alter table public.quote_items drop column if exists note;
