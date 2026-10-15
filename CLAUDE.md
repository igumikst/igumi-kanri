# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (frontend)
npm run build     # Production build
npm run lint      # ESLint check
npm run preview   # Preview production build locally
```

There are no tests. The `api/` directory has its own `package.json` (`igumi-api`) — run `npm install` inside it separately if needed for local API work.

## Architecture

This is a **React 19 + Vite SPA** deployed on Vercel, backed by **Supabase** as the primary database/storage. The app is a construction project management system (案件管理) for 株式会社IGUMI.

### Routing

There is **no React Router**. Navigation is a `page` state string in `App.jsx`, toggled via a `nav(pageName)` function passed as a prop to every page component. All page components live in `src/pages/`.

### State management

All global state (projects, companies, tasks, files, settings, etc.) is owned by `App.jsx` and fetched once on mount via `loadAll()`. State and setters are drilled down as props — there is no context, Redux, or Zustand.

### Data layer

Supabase tables used:
- `projects` — construction jobs (案件)
- `companies` — clients and subcontractors
- `tasks` — task checklist items
- `finance_files` / `finance_folders` — document storage
- `home_settings` — key-value store for app config (passwords, LINE settings, AI personas, etc.)
- `links` — launcher bookmarks
- `template_files` — notification/document templates
- `board_posts` / `board_comments` — internal bulletin board
- `calls` — incoming phone call records (created by Twilio webhook)

### Components

- `src/components/UI.jsx` — primitive UI components: `Badge`, `Inp`, `Sel`, `Modal`, `Hdr`, `Confirm`. All inline-styled; no CSS framework.
- `src/components/Layout.jsx` — layout shells: `PCSidebar`, `PCRightPanel`, `FloatLauncher`, `usePCLayout`. PC/mobile detection is `window.innerWidth >= 768`.
- `src/components/AiAssistModal.jsx` — chat modal for AI mentor/review modes (mentor vs. review × report vs. estimate).
- `src/lib/constants.js` — all app-wide constants: statuses, status styles, default configs, tile layout, utility formatters (`fmt`, `pct`).
- `src/lib/supabase.js` — single exported Supabase client.

### API (Vercel Serverless Functions)

`api/` contains Node.js serverless functions in **CommonJS** format (not ESM). These handle:
- `recording.js` / `recording-proxy.js` — Twilio voice call recording
- `transcribe.js` — speech-to-text via OpenAI Whisper
- `analyze.js` — call transcript analysis via **Claude** (Anthropic API), Supabase registration, and LINE push notification
- `chat.js` — proxy to OpenAI Chat Completions (currently unused; AiAssistModal actually calls `ai-assist.js`, which uses the Claude API)
- `voice.js` — Twilio TwiML response
- `pipeline.js` — orchestrates voice → transcribe → analyze flow
- `linegroup.js` — LINE group messaging
- `auto-edit.js` — AI-powered app code modification feature
- `blog-feed.js` — RSS/blog fetch proxy (CORS workaround)

### Environment variables

Frontend (`.env`, prefixed `VITE_`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Backend API (Vercel env vars, no `VITE_` prefix):
- `OPENAI_API_KEY` — Chat and Whisper
- `ANTHROPIC_API_KEY` — Claude API (model: `claude-sonnet-4-6`)
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` — server-side Supabase access
- `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_USER_ID` — LINE push notifications

### Deploy

`main`へのプッシュで、Vercelが本番(https://igumi-kanri.vercel.app)へ自動デプロイする。
`main`へのプッシュ前には、`node scripts/predeploy-check.mjs`(build/lint/差分の内容チェック)が
git の pre-push フックで自動実行され、失敗するとプッシュが止まる。

pre-push フックの入れ方: 新しいPCでは、最初に `node scripts/install-hooks.mjs` を1回実行する。
フックは .git/hooks に置かれ、Gitの共有に入らないため、PCごとに必要。
(フックの元は scripts/hooks/pre-push)
DBの変更を伴う作業は、SQLを提案して実行者の確認を待ってからデプロイする。
デプロイ後は、https://igumi-kanri.vercel.app で、トップ・案件管理・ダッシュボード・
単価管理・取引先が開くことを確認する。

### 本番データでのテスト禁止

本番のDB(Supabase)に書き込む動作テスト(INSERT/UPDATE/DELETE、画面からの保存・削除を含む)は、
ユーザーの許可なく行わない。通信失敗の再現(`window.fetch` の一時差し替えなど)は、実際には
本番に書き込まない形でのみ行う。本番のデータを消したり変えたりしそうな操作の前には、対象の
名前とIDを先に記録し、報告に残す。どうしても本番での書き込みテストが必要な場合は、先にユーザー
に聞いて、許可をもらってから行う。

### Styling conventions

All styles are **inline JSX style objects** — no Tailwind, no CSS modules, no styled-components. Brand colors come from `DEFAULT_CUST` in constants: navy `#1A3A5C`, accent orange `#E07B39`, link blue `#2563EB`. The font stack is `'Hiragino Sans','Yu Gothic',sans-serif`.

## 報告の書き方(虎生がスマホ・PCのどちらからでも、Claudeのチャットに一括コピーして貼るため)

1. 作業の最後の報告は、必ず「1つのコードブロック」(バッククォート3つで囲む)にまとめる。コードブロックの外には「報告は上のブロックです」程度の1行だけ書く。コピーボタン1回で全部コピーできるようにするため。

2. ブロックの中身は、すべてプレーンテキスト。マークダウンの太字・見出し・表は使わない。

3. ブロックの中の項目は、次の順番にする。
   【報告】テーマ名 / 状態(「完了・本番反映済み」「調査のみ・止まっています」「途中・止まっています」「失敗」のどれか)
   変更内容(3〜8行。「ファイル名: 何をしたか」の形)
   確認結果(1行に1項目。行頭に ✅ / ⚠️ / ❌ を付ける)
   コミットID・本番反映(バンドルのハッシュなど)
   数字の前後(案件数・受注合計・粗利合計など、作業前と後)
   残っているテストデータ(Storageのファイル名と場所、DBのid)。なければ「なし」
   気になる点・要確認。なければ「なし」
   虎生へのお願い(SQLを流す、手で消す、画面で確認する、など)。なければ「なし」
   止まっている理由(止まっている場合だけ)

4. 報告のブロックの中にコードやSQLを書くときは、バッククォートを使わず、行頭を4スペースでインデントする(ブロックが途中で閉じてしまうのを防ぐため)。

5. 例外: 虎生がSupabaseなどにそのままコピーして貼るSQLは、報告のブロックとは別の「SQL専用のコードブロック」で出す。SQLのブロックの中にはSQL以外(説明文など)を入れない。

6. 表は使わない。「ファイル名: 内容」の箇条書きにする。

7. 途中経過の実況(「〜しています」「確認します」など)は、報告のブロックに入れない。ブロックには、結論と結果だけを書く。

8. 長くなる場合(目安は120行)は、大事な項目を先に書き、細かい内容は最後の「詳細」にまとめる。報告を2つに分けない。

9. 調査だけで止まるときも、同じ形式で書く。最後の行は「止まっています。ご確認をお願いします。」にする。

10. 日本語で、やさしい言葉で書く。専門用語は一言で補う。

## ゆうかちゃんのPCで作業するときのルール

このリポジトリは、虎生のPCに加えて、ゆうかちゃんのPCでも作業する。ゆうかちゃんのPCでも、虎生のPCと同じ運用で、条件を満たす限り、mainへのマージ・push・本番デプロイまで進めてよい。mainにpushすると本番に自動反映されるため、次のルールを必ず守ること。

### 進め方
1. 作業の前に、必ず git pull で最新のmainを取り込む。
2. 作業は自分用ブランチ(名前は「yuka/テーマ名」)で行い、ステップごとにコミットする。
3. 条件(下の「デプロイしてよい条件」)をすべて満たしたら、mainにマージして push し、本番に反映する。
4. 反映後は、本番で次の画面が開くことを確認する: トップ・案件管理・ダッシュボード・単価・原価管理・取引先。
5. 本番に問題があれば、すぐに revert(元に戻す)して push し、虎生に報告する。

### デプロイしてよい条件(すべて満たすこと)
- build が通る
- lint で新しいエラーが増えていない
- 自動チェック(scripts/predeploy-check.mjs)が通る
- 見積の取り込み(EST・.xls)に関わる変更をしたときは、サンプルの回帰テストが正解と一致する(サンプルファイルは、リポジトリに入れず、Codeの画面にドラッグして渡してもらう)
- 差分に、禁止ファイル(scratch_・*.tmp.*・.est・.xls・.xlsx・.pdf・.env)、秘密(キー・パスワード)、実名、個人用パスが入っていない
- DBの変更が必要な場合は、虎生がSQLを実行済みである
- 画面の確認は、名前が【テスト】から始まるデータだけで行った

### 止まって虎生に聞くこと
- 売上・粗利・受注率の考え方を変えるとき
- 【テスト】以外のデータを、書き換え・削除するとき
- 想定と違う点が見つかったとき
- 条件のどれかを満たせないとき

### 触らないもの
- api/ の電話関連(voice・recording・transcribe・analyze・chat)
- .env、vercel.json
- DBの変更(SQL)は、Codeが実行しない。必要なときはSQLを書いて、虎生に見せて、「実行した」の返事を待つ
- npm audit fix --force は実行しない(部品のバージョンが一気に変わり、動かなくなるため)

### その他
- このリポジトリは公開なので、パスワード・キー・実名・サンプルファイル・個人用パスをコミットしない。
- テスト用のデータは、名前を【テスト】から始める。【テスト】以外のデータを、勝手に削除しない。
- 作業の最後の報告は、「報告の書き方」に従って、1つのコードブロックにまとめる。
