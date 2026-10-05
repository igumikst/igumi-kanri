-- 見積ごとの完工日・粗利キャッシュ(第8弾 ステップ2)
-- ※ このSQLは、すでにユーザー側で実行・確認済み(completed_on/gross_profitとも9/9件)。
--    Claude Code では実行していません。この migration ファイルは記録のためのものです。

alter table public.quotes add column if not exists completed_on date;
alter table public.quotes add column if not exists gross_profit numeric;

-- バックフィル(既存の完工済み・採用中の見積に、案件のcompletedOn/grossProfitをコピー)
update public.quotes q
set completed_on = p."completedOn",
    gross_profit = p."grossProfit"
from public.projects p
where q.project_id = p.id
  and q.status = 'won'
  and q.is_adopted = true
  and q.completed_on is null
  and p."completedOn" is not null;

-- ※ 以下は未実行(実行をお願いしたい分)。
-- 旧仕様(1案件につき採用中の見積は1件だけ)の制約が残っており、
-- 「他の完工済み見積のis_adopted/statusは変更しない」(決定事項2)を妨げている。
-- 【テスト】データでの検証中に発見(quotes_one_adopted_per_projectのunique constraint違反)。
-- alter table public.quotes drop constraint if exists quotes_one_adopted_per_project;
