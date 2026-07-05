-- finance_folders に親子階層用の parent_id を追加
ALTER TABLE finance_folders
  ADD COLUMN IF NOT EXISTS parent_id text REFERENCES finance_folders(id) ON DELETE CASCADE;

-- 直下ファイル用：year/month を NULL 許可（既に NULL 可ならスキップ）
ALTER TABLE finance_files
  ALTER COLUMN year DROP NOT NULL,
  ALTER COLUMN month DROP NOT NULL;

-- 既存ルートフォルダの parent_id を明示的に NULL に
UPDATE finance_folders SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM finance_folders);
