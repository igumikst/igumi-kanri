-- 対応日(時間を外して日付だけにする)・完工日の追加(第7弾)
-- ※ このSQLは Claude Code では実行していません。Supabase の SQL Editor で実行してください。
-- 既存データの移行は行いません(「完了」で完工日が空の案件は、画面側で「—」表示にします)。

-- 1) 対応日時 → 対応日(時間は不要。日本時間の日付に変換してから型を変える)
alter table public.projects
  alter column "respondedAt" type date
  using (("respondedAt" at time zone 'Asia/Tokyo')::date);

-- 2) 完工日(見積を完工済みにする時・案件を完了にする時に入力する)
alter table public.projects add column if not exists "completedOn" date;
