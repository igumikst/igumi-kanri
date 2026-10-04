-- 第7弾 ステップ3〜5(営業所・対応日時・報告書の案件連携・下請け原価)
-- ※ このSQLは Claude Code では実行していません。Supabase の SQL Editor で実行してください。
-- すべて「追加のみ」。既存の列・既存データは変更しません。再実行しても安全です(if not exists)。

-- ============================================================
-- 1) 営業所(取引先 companies → 営業所 company_branches → 営業担当 sales_reps)
-- ============================================================

-- 1-1) 営業所テーブル
do $$
declare
  v_company_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.company_branches (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies(id) on delete cascade,
      name text not null,
      created_at timestamptz not null default now()
    )$f$, v_company_id_type);
end;
$$;
create index if not exists company_branches_company_id_idx on public.company_branches (company_id);

alter table public.company_branches enable row level security;
drop policy if exists "company_branches_all" on public.company_branches;
create policy "company_branches_all" on public.company_branches for all to anon, authenticated using (true) with check (true);

-- 1-2) 既存データの移行: companies.branch が入っている行は、その内容で営業所を1件作る
--     (companies の行・branch列はそのまま残す。二重に作らないよう、同じ名前の営業所が
--     すでにあればスキップする)
insert into public.company_branches (company_id, name)
select c.id, trim(c.branch)
from public.companies c
where coalesce(trim(c.branch), '') <> ''
  and not exists (
    select 1 from public.company_branches cb where cb.company_id = c.id and cb.name = trim(c.branch)
  );

-- 1-3) 案件・営業担当から、営業所を選べるようにする列
alter table public.projects add column if not exists "branchId" uuid references public.company_branches(id) on delete set null;
alter table public.sales_reps add column if not exists branch_id uuid references public.company_branches(id) on delete set null;

-- ============================================================
-- 2) 対応日時(見積などの対応をした日時)
-- ============================================================
alter table public.projects add column if not exists "respondedAt" timestamptz;

-- ============================================================
-- 3) 報告書(reports)を案件につなげる列
--    既存の150件はそのまま(project_idはNULL)。自動では紐づけない
-- ============================================================
do $$
declare
  v_project_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.projects'::regclass and attname = 'id');
begin
  execute format($f$
    alter table public.reports add column if not exists project_id %s references public.projects(id) on delete set null
  $f$, v_project_id_type);
end;
$$;
create index if not exists reports_project_id_idx on public.reports (project_id);

-- ============================================================
-- 4) 下請け
-- ============================================================

-- 4-a) 案件の施工形態(初期値: 自社のみ)
alter table public.projects add column if not exists "constructionType" text not null default '自社のみ';
-- 想定する値(アプリ側で制御): '自社のみ' / '下請けのみ' / '自社+下請け'

-- 4-b) 見積ごとの下請け原価(1つの見積に複数社を入れられる)
do $$
declare
  v_quote_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.quotes'::regclass and attname = 'id');
  v_company_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.quote_subcontractor_costs (
      id uuid primary key default gen_random_uuid(),
      quote_id %s not null references public.quotes(id) on delete cascade,
      subcontractor_id %s not null references public.companies(id) on delete restrict,
      amount numeric not null default 0,
      note text,
      file_storage_path text,
      file_original_name text,
      created_at timestamptz not null default now()
    )$f$, v_quote_id_type, v_company_id_type);
end;
$$;
create index if not exists quote_subcontractor_costs_quote_id_idx on public.quote_subcontractor_costs (quote_id);

alter table public.quote_subcontractor_costs enable row level security;
drop policy if exists "quote_subcontractor_costs_all" on public.quote_subcontractor_costs;
create policy "quote_subcontractor_costs_all" on public.quote_subcontractor_costs for all to anon, authenticated using (true) with check (true);

-- 4-c) 見積の明細ごとの「下請け施工」チェック(初期値 false)
--     true の行は、単価表の原価を使わず、原価未入力の警告にも数えない(アプリ側の計算で対応)
alter table public.quote_items add column if not exists is_subcontracted boolean not null default false;

-- 下請け見積ファイルの保管先は、既存の非公開Storageバケット「quote-files」を
-- そのまま使う(第5弾と同じ仕組み。バケット・ポリシーの追加は不要)
