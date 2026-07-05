-- finance_folders に年月フォルダ用カラムを追加
ALTER TABLE finance_folders
  ADD COLUMN IF NOT EXISTS folder_type text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS year_num integer,
  ADD COLUMN IF NOT EXISTS month_num integer;

-- 既存フォルダは通常フォルダとして扱う
UPDATE finance_folders SET folder_type = 'normal' WHERE folder_type IS NULL;
