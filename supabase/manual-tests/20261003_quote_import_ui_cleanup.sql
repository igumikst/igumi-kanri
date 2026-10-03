-- 画面からの登録テストで作ったデータの削除(【テスト】の案件だけ)
-- ステップ3(元ファイルの保管)のテストが終わってから実行する。
-- 対象: 案件「【テスト】○○マンション305給水管更新工事」と、その見積・明細・原価・元ファイルの記録
--       テストで手で選んだ当てはめの別名「同材料費|13mm架橋ポリ管」(1件)
-- ※ Storage のファイル本体は、このSQLでは消えない(消し方は報告を参照)

-- ===== 1) 消える対象の確認 =====
select p.id as project_id, p.name, q.quote_no, q.title, q.is_adopted,
       (select count(*) from quote_items i where i.quote_id = q.id) as items
  from projects p left join quotes q on q.project_id = p.id
 where p.name = '【テスト】○○マンション305給水管更新工事';

select * from price_item_aliases where alias = '同材料費|13mm架橋ポリ管';

-- 元ファイルの記録(Storage で消すファイル名 = storage_path)。quote_files 作成後のみ
select f.storage_path, f.original_name
  from quote_files f join projects p on p.id = f.project_id
 where p.name = '【テスト】○○マンション305給水管更新工事';

-- ===== 2) 削除 =====
begin;
delete from quote_item_costs where quote_item_id in (
  select i.id from quote_items i join quotes q on q.id = i.quote_id join projects p on p.id = q.project_id
   where p.name = '【テスト】○○マンション305給水管更新工事');
delete from quote_items where quote_id in (
  select q.id from quotes q join projects p on p.id = q.project_id
   where p.name = '【テスト】○○マンション305給水管更新工事');
delete from quote_files where project_id in (
  select id from projects where name = '【テスト】○○マンション305給水管更新工事');
delete from quotes where project_id in (
  select id from projects where name = '【テスト】○○マンション305給水管更新工事');
delete from price_item_aliases where alias = '同材料費|13mm架橋ポリ管';
delete from projects where name = '【テスト】○○マンション305給水管更新工事';
commit;

-- ===== 3) 削除の確認(すべて 0)=====
select
  (select count(*) from projects where name = '【テスト】○○マンション305給水管更新工事') as projects,
  (select count(*) from quotes where title in ('○○マンション305給水管更新工事', '△△ハイツ809・909号室共用排水管一部更新工事')) as quotes,
  (select count(*) from price_item_aliases where alias = '同材料費|13mm架橋ポリ管') as aliases;
