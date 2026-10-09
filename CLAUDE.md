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
