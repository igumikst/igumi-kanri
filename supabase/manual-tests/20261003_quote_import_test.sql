-- import_quote 関数の動作確認(【テスト】の案件だけを使う)
-- Supabase の SQL Editor で、手順ごとに選んで実行する。既存の案件には触らない。
-- 使う名前: 案件「【テスト】見積取り込み(SQL)」「【テスト】ロールバック確認」/ 別名「【テスト】別名|確認用」

-- ===== 手順0: 列の型の確認(quote_no が text か、subcontractorIds の型)=====
select table_name, column_name, data_type, udt_name
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'quotes' and column_name in ('quote_no', 'issued_at', 'total_amount'))
     or (table_name = 'projects' and column_name in ('subcontractorIds', 'quoteDate', 'status'))
     or (table_name = 'quote_items' and column_name in ('qty', 'sale_price', 'note')));

-- ===== 手順1: 新しい案件を作って登録 =====
-- 2行目は line_type・単位・原価などを省略 → 初期値(adjust / 空 / 原価未入力)になることを確認する
-- 見積の status、案件の status・subcontractorIds も省略 → submitted / 発注待ち / 空 になることを確認する
select public.import_quote(
  jsonb_build_object('name', '【テスト】見積取り込み(SQL)', 'inCharge', 'テスト'),
  jsonb_build_object(
    'title', '【テスト】取り込み見積1',
    'price_set_id', (select id from price_sets where code = 'construction'),
    'issued_at', '2026-07-10',
    'total_amount', 13000,
    'memo', 'SQLでの動作確認'),
  jsonb_build_array(
    jsonb_build_object(
      'price_item_id', (select id from price_items where price_set_id = (select id from price_sets where code = 'construction') order by sort_order limit 1),
      'line_type', 'item', 'group_name', 'テスト工事', 'name', 'テスト項目A', 'spec', '単価表あり', 'unit', '式',
      'qty', 1, 'sale_price', 8000, 'cost_price', 5000, 'cost_confirmed', true, 'note', '定価9999円'),
    jsonb_build_object('group_name', 'テスト工事', 'name', 'テスト項目B', 'qty', 1, 'sale_price', 5000)),
  jsonb_build_array(
    jsonb_build_object('alias', '【テスト】別名|確認用',
      'price_item_id', (select id from price_items where price_set_id = (select id from price_sets where code = 'construction') order by sort_order limit 1)))
);
-- → {"project_id": ..., "quote_id": ..., "quote_no": "1"} が返る

-- ===== 手順2: 登録内容の確認 =====
select id, name, status, "subcontractorIds", "inCharge", "quoteDate", amount, "grossProfit"
  from projects where name = '【テスト】見積取り込み(SQL)';
-- → status = 発注待ち、subcontractorIds = 空、amount / grossProfit = 0

select q.quote_no, q.title, q.status, q.total_amount, q.issued_at, q.is_adopted, q.memo
  from quotes q join projects p on p.id = q.project_id
 where p.name = '【テスト】見積取り込み(SQL)'
 order by q.created_at;
-- → quote_no = 1、status = submitted、is_adopted = false

select q.quote_no, i.sort_order, i.name, i.line_type, i.unit, i.qty, i.sale_price, i.note, c.cost_price, c.cost_qty, c.cost_confirmed
  from quote_items i
  join quotes q on q.id = i.quote_id
  join projects p on p.id = q.project_id
  left join quote_item_costs c on c.quote_item_id = i.id
 where p.name = '【テスト】見積取り込み(SQL)'
 order by q.created_at, i.sort_order;
-- → A: item / 原価5000 / 確認済み / 備考あり。B: adjust / 原価 NULL / 未確認

select * from price_item_aliases where alias = '【テスト】別名|確認用';

-- ===== 手順3: 既存の案件(手順1の案件)に、2つ目の見積を追加 =====
select public.import_quote(
  jsonb_build_object('id', (select id from projects where name = '【テスト】見積取り込み(SQL)')),
  jsonb_build_object('title', '【テスト】取り込み見積2', 'price_set_id', (select id from price_sets where code = 'construction'), 'total_amount', 1000),
  jsonb_build_array(jsonb_build_object('name', 'テスト項目C', 'qty', 2, 'sale_price', 500))
);
-- → quote_no = "2"。手順2の2つ目の select をもう一度実行して、見積が2件あることを確認する

-- ===== 手順4: 途中で失敗したら何も残らないことの確認 =====
-- 2行目の数量が数字でないため、エラーになる(エラーが出るのが正しい)
select public.import_quote(
  jsonb_build_object('name', '【テスト】ロールバック確認'),
  jsonb_build_object('title', '【テスト】失敗する見積'),
  jsonb_build_array(
    jsonb_build_object('name', '正しい行', 'qty', 1, 'sale_price', 100),
    jsonb_build_object('name', '数量がおかしい行', 'qty', 'abc', 'sale_price', 100))
);
-- → ERROR: invalid input syntax for type numeric: "abc"
select count(*) as projects_left from projects where name = '【テスト】ロールバック確認';
select count(*) as quotes_left from quotes where title = '【テスト】失敗する見積';
-- → どちらも 0(案件も見積も残っていない)

-- ===== 手順5: テストデータの削除 =====
-- まず、消える対象を確認する(この2件の案件と、その見積・明細・原価、テスト用の別名だけ)
select id, name from projects where name in ('【テスト】見積取り込み(SQL)', '【テスト】ロールバック確認');

begin;
delete from quote_item_costs where quote_item_id in (
  select i.id from quote_items i join quotes q on q.id = i.quote_id join projects p on p.id = q.project_id
   where p.name in ('【テスト】見積取り込み(SQL)', '【テスト】ロールバック確認'));
delete from quote_items where quote_id in (
  select q.id from quotes q join projects p on p.id = q.project_id
   where p.name in ('【テスト】見積取り込み(SQL)', '【テスト】ロールバック確認'));
delete from quotes where project_id in (
  select id from projects where name in ('【テスト】見積取り込み(SQL)', '【テスト】ロールバック確認'));
delete from price_item_aliases where alias = '【テスト】別名|確認用';
delete from projects where name in ('【テスト】見積取り込み(SQL)', '【テスト】ロールバック確認');
commit;

-- 削除の確認(すべて 0)
select
  (select count(*) from projects where name in ('【テスト】見積取り込み(SQL)', '【テスト】ロールバック確認')) as projects,
  (select count(*) from quotes where title like '【テスト】取り込み見積%') as quotes,
  (select count(*) from price_item_aliases where alias = '【テスト】別名|確認用') as aliases;
