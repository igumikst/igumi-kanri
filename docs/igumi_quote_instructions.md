# Claude Code 指示書(第2弾): IGUMI管理アプリ「見積作成」

## 0. 進め方

- 共通のルールは第1弾(`igumi_dashboard_instructions.md`)の「2. 守ってほしいルール」と同じ
  - 作業は別ブランチ / 既存機能を壊さない / **DBの変更は自分で実行せずSQLを出す** / 金額計算はプログラム / 小さく区切って日本語で報告 / 分からない点は聞く
- 私は**Claude Proプラン**で、使用量に上限がある。**作業を3つのステップに分けて、1ステップごとに区切る**
  - 各ステップの終わりで、ブランチにコミットして、報告して止まる(次のステップは私が指示する)
- **最初はコードを書かず**、現在の案件詳細画面の構成の説明と、ステップ1の実装計画だけ出して、私の承認を待つ

## 1. 今回のゴール

案件の中で**見積を作れる**ようにする。見積は単価表から項目を選んで作り、**原価は裏で一緒に保存**する(見積書には出さない)。

- 案件(projects) → 見積(quotes、複数可) → 明細(quote_items)という構造
- 見積の金額・粗利は、プログラムで計算する(AIは使わない)

## 2. 今回やらないこと

- 見積書のExcel/PDF出力(雛形が必要。別の回でやる)
- 元請向けの見積変換(7.5%載せ・乗せ割。別の回でやる)
- AIの機能(現調ノートの読み取り、単価の自動当てはめ)
- 既存の案件テーブル(projects)の列の追加・変更

## 3. データベース(作成済み・Supabase)

列名は**snake_case**(projects だけが camelCase)。

### 単価まわり
- `price_sets`: id, code(`clerk`=🌸事務員さん用 / `construction`=🤖工事見積用), name, icon, sort_order
- `price_groups`: id, price_set_id, category(材料(給水)・施工費・諸経費など), name(親項目名), sort_order
- `price_items`: id, price_set_id, price_group_id, name, spec, note, unit, sale_price, item_type(`fixed` / `labor_manual`), is_active, sort_order, source_no
  - 約550件(🤖498件、🌸54件)
  - `labor_manual` は「新規配管施工費」(人工計算の手入力枠。sale_price は空)
- `price_item_costs`: price_item_id, cost_price, cost_qty, cost_unit, cost_confirmed
  - **原価。見積書には出さない。** `cost_confirmed = false` は「原価が未確認」(0や空のもの)
- `price_item_aliases`: price_item_id, alias(今は空)
- `app_settings`: key, value(`labor_unit_price` = 26000: 1人工あたりの単価)

### 見積まわり(今は空)
- `quotes`: id, project_id, quote_no, title, price_set_id, status(`draft`/`submitted`/`won`/`lost`), is_adopted, source_quote_id, preset_id, applied_rates, total_amount, issued_at, memo, created_by(文字列), created_at, updated_at
  - 採用見積(`is_adopted = true`)は**案件ごとに1つまで**(DBで制限済み)
- `quote_items`: id, quote_id, price_item_id, line_type(`item`/`labor`/`overhead`/`adjust`), group_name, name, spec, unit, qty, sale_price, sort_order
- `quote_item_costs`: quote_item_id, cost_price, cost_qty, cost_confirmed
  - **見積作成時点の原価をコピーして保存する。** 単価表の原価をあとで直しても、過去の見積の粗利は変わらない

### 案件・担当者
- `projects`: id, name, status, "clientId", "salesRep", "salesRepId", "inCharge", amount, "grossProfit" ほか(第1弾の指示書を参照)
- `sales_reps`, `companies`: 第1弾の指示書を参照

## 4. 計算ルール

- **明細の売上金額** = 数量(qty) × 販売単価(sale_price)
- **明細の原価金額** = 予定原価単価(cost_price) × 数量(qty)
  - 数量を変えたら、原価金額も自動で変わる
- **見積合計(total_amount)** = 明細の売上金額の合計(税抜)
- **見積の原価合計** = 明細の原価金額の合計
- **粗利** = 見積合計 − 原価合計。**粗利率** = 粗利 ÷ 見積合計
- **原価が未確認(cost_confirmed = false)または未入力の明細が1つでもある見積は、粗利を「暫定」と表示する**
  - 未確認の明細は、どの行か分かるように印を付ける
- **人工計算(`labor_manual`)の明細**
  - 人工数を入力 → 金額 = 人工数 × `app_settings.labor_unit_price`(26,000円)
  - 保存の形: 数量1、単位「式」、販売単価 = 計算した金額、spec に「◯人工」と残す
  - 見積書上は「一式」で出る(出力は今回やらない)
- 金額は円単位の整数で扱う。3桁区切りで表示する

## 5. ステップ1: 見積の作成・保存

### 画面
- 案件の詳細画面から、その案件の**見積の一覧**を見て、**新規作成**できる
  - 今ある案件詳細の構成を読んで、置き場所を提案してほしい
- 見積の作成画面
  1. 見積のタイトル、使う単価セット(🌸事務員さん用 / 🤖工事見積用)を選ぶ
  2. **単価項目を選んで明細に追加**する
     - 項目は約550件あるので、**検索**(名前・仕様の文字)と、カテゴリ・グループでの絞り込みができる
     - 選んだセットの項目だけが出る
  3. 明細の**数量を編集**できる。行の削除・並べ替えもできる
  4. **手入力の明細**も追加できる(単価表にない項目用)。原価は「未入力」として扱う
  5. 人工計算の項目は、人工数を入れる専用の入力にする
  6. 画面の下に、見積合計・原価合計・粗利・粗利率を表示する
     - 原価と粗利は、**画面の中には出してよい**(社内用)。ただし、後で作る見積書の出力には出さない前提で、見積書用の表示と分けて作る

### 保存
- 明細を追加した時点で、単価表の**売価・原価をコピー**して `quote_items` と `quote_item_costs` に保存する
- 見積の状態(`draft` / `submitted` / `won` / `lost`)を画面で変えられる
- 見積番号は、案件ごとの連番など、シンプルな案を提案してほしい

### やらないこと(ステップ1)
- 案件の `amount` / `grossProfit` への反映(ステップ3でやる)
- 原価の編集画面(ステップ2でやる)

### 確認方法
- [ ] 案件から見積を新規作成して、単価表の項目を検索して追加できる
- [ ] 数量を変えると、金額・原価・粗利が正しく変わる(手計算で確認する)
- [ ] 人工計算の項目が、人工数×26,000円になる
- [ ] 原価が未確認の明細がある見積は、粗利が「暫定」と表示される
- [ ] 保存して画面を開き直しても、見積が残っている
- [ ] 1つの案件に、見積を複数作れる
- [ ] 既存の画面とダッシュボードが今まで通り動く

## 6. ステップ2: 原価の編集画面(ステップ1の後)

- 単価表の項目の一覧で、**原価(cost_price)を直接編集**できる画面
- `cost_confirmed = false` の項目だけを絞り込んで見られる(原価が未確認の項目を、埋めていくため)
- 原価を保存したら、`cost_confirmed` を true にできる(原価0を意図して確認済みにする場合もある)
- 単価表の売価(sale_price)の編集も同じ画面で行えるようにしたい
- 過去の見積の原価は変えない(コピー済みのため)

## 7. ステップ3: 採用見積の案件への反映(ステップ2の後)

- 見積を「採用」にすると、その見積の**合計を案件の `amount`、粗利を `"grossProfit"` に反映**する
  - 案件の既存の値を上書きするので、**確認ダイアログを出す**
  - 原価が未確認の明細がある見積は、「粗利は暫定」と警告する
- 採用の切り替え(別の見積を採用にする)ができる。**採用見積は案件ごとに1つ**
- 受注・失注の状態の付け方も、ここで相談する
  - 案件の状態は今 3 種類(発注待ち・着工・完了)。「失注」を足すかどうかは、私と相談して決める

## 8. 今後の予定(参考。今回は触らない)

- 見積書のExcel/PDF出力(今の見積雛形に合わせる。**原価は絶対に出さない**)
- 元請向け見積変換(ルールは `estimate-conversion-rules.md` を参照)
- 現調ノートのAI読み取り、別名辞書(price_item_aliases)の活用
