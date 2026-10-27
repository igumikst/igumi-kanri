-- 見積の明細に「100%の単価」(base_price)を足す(見積書作成 第1弾: 掛け率の選択)
-- ※ このSQLは Claude Code では実行していません。Supabase の SQL Editor で実行してください。
-- 決まり: 販売の単価(sale_price)= 100%の単価(base_price)× 掛け率。売上・粗利は今までどおり sale_price で計算する。
--        base_price は「東洋向けの書類(雛形①)に載せる単価」と「掛け率を変えたときの計算し直し」に使う。
-- 今ある行は、掛け率1.0として base_price = sale_price で埋める(sale_price は変えないので、売上・粗利の数字は変わらない)。
-- base_price が空(null)の行は、画面・出力では sale_price と同じとして扱う(取り込み・ノート見積作成はこの列を書かない)。

-- 1) 列を足す
alter table public.quote_items add column if not exists base_price numeric;

-- 2) 今ある行を埋める(掛け率1.0扱い)
update public.quote_items set base_price = sale_price where base_price is null;

-- 3) 確認用(実行後に件数を見る。空の行が 0 件なら完了)
select count(*) as total_rows, count(*) filter (where base_price is null) as empty_rows,
       count(*) filter (where base_price is distinct from sale_price) as different_rows
from public.quote_items;
